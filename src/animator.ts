import { LogoEngine, prepareLogo, type LogoImage } from "./core/logo-engine.js";
import { canvasPng, exportAnimation, type ExportOptions } from "./core/export-animation.js";
import { duration, phaseAt, type Settings } from "./core/animation.js";
import { MODEL_SETTINGS, resolutionSize, resolveSettings, type Resolution } from "./settings.js";
import { loadSource, type LoadedSource, type LogoSource } from "./source.js";

export type AnimatorOptions = {
  settings?: Partial<Settings>;
  width?: number;
  height?: number;
  pixelRatio?: number;
  loop?: boolean;
};
export type AnimatorState = Readonly<{
  time: number;
  duration: number;
  phase: "Fly in" | "Hold" | "Fly out";
  playing: boolean;
  loaded: boolean;
  loading: boolean;
  exporting: boolean;
  inspecting: boolean;
  disposed: boolean;
  softwareRenderer: boolean;
}>;
export type PlayOptions = { loop?: boolean; from?: number };
export type RenderOptions = {
  resolution?: Resolution;
  fps?: 30 | 60;
  format?: ExportOptions["format"];
  scope?: ExportOptions["scope"];
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};
export type FrameOptions = { resolution?: Resolution; time?: number; signal?: AbortSignal };
type Events = { change: AnimatorState; loaded: { name: string; width: number; height: number }; ended: AnimatorState; error: Error };
type Listener<K extends keyof Events> = (event: Events[K]) => void;

function positive(value: number, label: string, max = 16384) {
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new RangeError(`${label} must be greater than zero and at most ${max}.`);
  return value;
}

/** Browser-only controller. Importing the package is safe during server rendering. */
export class LogoAnimator {
  private engine: LogoEngine;
  private config: Settings;
  private source?: LoadedSource;
  private logo?: LogoImage;
  private loading = false;
  private playing = false;
  private disposed = false;
  private exporting = false;
  private loop: boolean;
  private mode: "full" | "entry" | "exit" = "full";
  private raf = 0;
  private lastTick = 0;
  private loadController?: AbortController;
  private exportController?: AbortController;
  private pendingSize?: [number, number];
  private listeners = new Map<keyof Events, Set<(event: never) => void>>();
  private observers = new Set<ResizeObserver>();

  constructor(readonly canvas: HTMLCanvasElement, options: AnimatorOptions = {}) {
    if (typeof window === "undefined" || typeof document === "undefined") throw new Error("Create LogoAnimator in a browser, after the canvas mounts.");
    this.config = resolveSettings(options.settings);
    const width = positive(options.width ?? 960, "width"), height = positive(options.height ?? 540, "height");
    const ratio = positive(options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2), "pixelRatio", 4);
    this.loop = options.loop ?? false;
    this.engine = new LogoEngine(canvas);
    this.engine.renderer.setPixelRatio(ratio);
    this.engine.resize(width, height);
    this.engine.render(0, this.config);
    canvas.addEventListener("webglcontextlost", this.contextLost);
  }

  get settings(): Readonly<Settings> { return Object.freeze({ ...this.config }); }
  get state(): AnimatorState {
    return Object.freeze({
      time: this.engine.time, duration: duration(this.config), phase: phaseAt(this.engine.time, this.config),
      playing: this.playing, loaded: !!this.logo, loading: this.loading, exporting: this.exporting,
      inspecting: this.engine.inspect, disposed: this.disposed,
      softwareRenderer: "isSoftware" in this.engine.renderer
    });
  }

  /** Returns an unsubscribe function. Listener failures do not interrupt rendering or cleanup. */
  on<K extends keyof Events>(event: K, listener: Listener<K>): () => void {
    this.assertAlive();
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    const callback = listener as (event: never) => void;
    set.add(callback);
    return () => { set.delete(callback); };
  }
  private emit<K extends keyof Events>(event: K, data: Events[K]) {
    for (const callback of this.listeners.get(event) ?? []) {
      try { callback(data as never); }
      catch (error) { queueMicrotask(() => { throw error; }); }
    }
  }
  private changed() { if (!this.disposed) this.emit("change", this.state); }
  private assertAlive() { if (this.disposed) throw new Error("This LogoAnimator has been disposed."); }
  private assertMutable() {
    this.assertAlive();
    if (this.exporting) throw new Error("Wait for the export to finish or cancel it before changing the animation.");
  }
  private assertReady() {
    this.assertMutable();
    if (!this.logo || this.loading) throw new Error("Await setLogo() before playing or exporting.");
  }
  private stopClock() { cancelAnimationFrame(this.raf); this.raf = 0; this.playing = false; }
  private contextLost = (event: Event) => {
    event.preventDefault(); this.stopClock(); this.exportController?.abort();
    this.emit("error", new Error("The graphics context was lost. Dispose this animator and mount a new canvas."));
    this.changed();
  };

  /** Latest load wins. A superseded load rejects with AbortError without replacing the current logo. */
  async setLogo(input: LogoSource): Promise<void> {
    this.assertMutable(); this.stopClock(); this.loadController?.abort();
    const controller = new AbortController(); this.loadController = controller;
    this.loading = true; this.changed();
    try {
      const source = await loadSource(input, controller.signal);
      controller.signal.throwIfAborted(); this.assertAlive();
      const logo = prepareLogo(source.canvas, this.config, source.name);
      this.engine.rebuild(logo, this.config);
      this.source = source; this.logo = logo;
      this.engine.render(this.config.entry, this.config, false);
      this.loading = false;
      this.emit("loaded", { name: logo.name, width: logo.width, height: logo.height });
    } finally {
      if (this.loadController === controller) { this.loadController = undefined; this.loading = false; this.changed(); }
    }
  }

  updateSettings(patch: Partial<Settings>): void {
    this.assertMutable();
    const next = resolveSettings(patch, this.config);
    if (this.source && MODEL_SETTINGS.some(key => this.config[key] !== next[key])) {
      const logo = prepareLogo(this.source.canvas, next, this.source.name);
      this.engine.rebuild(logo, next); this.logo = logo;
    }
    this.config = next;
    this.engine.render(Math.min(this.engine.time, duration(next)), next, this.engine.inspect);
    this.changed();
  }

  play(options: PlayOptions = {}): void {
    this.assertReady();
    if (options.from !== undefined) this.seek(options.from);
    if (this.engine.time >= duration(this.config)) this.engine.render(0, this.config, false);
    this.mode = "full"; this.loop = options.loop ?? this.loop; this.startClock();
  }
  /** Fly in and remain front-facing until exit() is called, regardless of the configured hold duration. */
  enter(): void { this.assertReady(); this.mode = "entry"; this.engine.render(0, this.config, false); this.startClock(); }
  /** Fly out from the centered pose. Call after enter() ends for a continuous live sequence. */
  exit(): void {
    this.assertReady(); this.mode = "exit";
    this.engine.render(this.config.entry + this.config.hold, this.config, false); this.startClock();
  }
  pause(): void { this.assertAlive(); this.stopClock(); this.changed(); }
  stop(): void { this.seek(0); }
  seek(seconds: number): void {
    this.assertMutable();
    if (!Number.isFinite(seconds)) throw new RangeError("Seek time must be finite.");
    this.stopClock(); this.engine.render(Math.min(duration(this.config), Math.max(0, seconds)), this.config, false); this.changed();
  }
  inspect(yaw = -0.42, pitch = 0.12): void {
    this.assertReady();
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new RangeError("Inspection angles must be finite radians.");
    this.stopClock(); this.engine.yaw = yaw; this.engine.pitch = pitch;
    this.engine.render(this.engine.time, this.config, true); this.changed();
  }
  private startClock() {
    this.stopClock(); this.playing = true; this.lastTick = performance.now();
    this.engine.render(this.engine.time, this.config, false);
    this.raf = requestAnimationFrame(this.tick); this.changed();
  }
  private tick = (now: number) => {
    if (!this.playing || this.disposed) return;
    const end = this.mode === "entry" ? this.config.entry : duration(this.config);
    const next = this.engine.time + Math.max(0, (now - this.lastTick) / 1000); this.lastTick = now;
    const repeats = this.mode === "full" && this.loop;
    this.engine.render(next >= end && repeats ? next % end : Math.min(next, end), this.config, false);
    if (next >= end && !repeats) {
      this.stopClock(); this.changed(); this.emit("ended", this.state); return;
    }
    this.raf = requestAnimationFrame(this.tick); this.changed();
  };

  /** Resize is safe during export: the latest size is applied after capture restores the preview. */
  resize(width: number, height = width * 9 / 16): void {
    this.assertAlive(); positive(width, "width"); positive(height, "height");
    if (this.exporting) { this.pendingSize = [width, height]; return; }
    this.engine.resize(width, height); this.engine.render(this.engine.time, this.config, this.engine.inspect);
  }
  observeResize(container: Element, aspectRatio = 16 / 9): () => void {
    this.assertAlive(); positive(aspectRatio, "aspectRatio", 100);
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width && !this.disposed) this.resize(width, width / aspectRatio);
    });
    observer.observe(container); this.observers.add(observer);
    return () => { observer.disconnect(); this.observers.delete(observer); };
  }

  private async capture<T>(signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertReady(); signal?.throwIfAborted(); this.stopClock();
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    this.exportController = controller; this.exporting = true; this.changed();
    try { controller.signal.throwIfAborted(); return await operation(controller.signal); }
    finally {
      signal?.removeEventListener("abort", abort); this.exportController = undefined; this.exporting = false;
      if (this.disposed) this.engine.dispose();
      else { if (this.pendingSize) { this.resize(...this.pendingSize); this.pendingSize = undefined; } this.changed(); }
    }
  }

  /** Returns a transparent MOV or PNG-sequence ZIP. This never initiates a download. */
  export(options: RenderOptions = {}): Promise<Blob> {
    const { width } = resolutionSize(options.resolution);
    const settings = { ...this.config };
    return this.capture(options.signal, signal => exportAnimation(this.engine, settings, {
      width, fps: options.fps ?? 30, format: options.format ?? "mov", scope: options.scope ?? "full"
    }, options.onProgress ?? (() => {}), () => signal.aborted));
  }
  /** Capture current pose, or a specified animation time, as an RGBA PNG. */
  captureFrame(options: FrameOptions = {}): Promise<Blob> {
    const { width, height } = resolutionSize(options.resolution);
    if (options.time !== undefined && !Number.isFinite(options.time)) return Promise.reject(new RangeError("Frame time must be finite."));
    return this.capture(options.signal, async signal => {
      const engine = this.engine;
      const old = { width: engine.width, height: engine.height, ratio: engine.renderer.getPixelRatio(), time: engine.time, inspect: engine.inspect };
      try {
        engine.renderer.setPixelRatio(1); engine.resize(width, height);
        engine.render(options.time === undefined ? old.time : Math.max(0, Math.min(duration(this.config), options.time)), this.config, options.time === undefined && old.inspect);
        const blob = await canvasPng(this.canvas); signal.throwIfAborted(); return blob;
      } finally {
        engine.renderer.setPixelRatio(old.ratio); engine.resize(old.width, old.height); engine.render(old.time, this.config, old.inspect);
      }
    });
  }
  cancelExport(): void { this.exportController?.abort(); }

  /** Idempotent. Cancels loading/playback/export and releases listeners, observers, textures, and geometry. */
  dispose(): void {
    if (this.disposed) return;
    this.stopClock(); this.disposed = true; this.loadController?.abort(); this.exportController?.abort();
    this.observers.forEach(observer => observer.disconnect()); this.observers.clear();
    this.canvas.removeEventListener("webglcontextlost", this.contextLost); this.listeners.clear();
    this.source = undefined; this.logo = undefined;
    if (!this.exporting) this.engine.dispose();
  }
}

export function createLogoAnimator(canvas: HTMLCanvasElement, options?: AnimatorOptions): LogoAnimator {
  return new LogoAnimator(canvas, options);
}

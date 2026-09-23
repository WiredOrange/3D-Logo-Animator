import { zip, strToU8 } from "fflate";
import type { LogoEngine } from "./logo-engine.js";
import { duration, type Settings } from "./animation.js";
import { createMov } from "./mov.js";

export type ExportOptions = { width: number; fps: number; format: "mov" | "png"; scope: "full" | "entry" | "exit" };
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("The frame could not be captured.")), "image/png"));
}
export async function exportAnimation(engine: LogoEngine, s: Settings, options: ExportOptions, onProgress: (n: number) => void, cancelled: () => boolean): Promise<Blob> {
  const { width, fps, format, scope } = options; const height = width * 9 / 16;
  if (![1280, 1920, 2560, 3840].includes(width)) throw new RangeError("Choose 720p, 1080p, 2K, or 4K.");
  if (![30, 60].includes(fps)) throw new RangeError("Frame rate must be 30 or 60 fps.");
  if (!["mov", "png"].includes(format) || !["full", "entry", "exit"].includes(scope)) throw new TypeError("Invalid export format or scope.");
  const start = scope === "exit" ? s.entry + s.hold : 0;
  const seconds = scope === "full" ? duration(s) : scope === "entry" ? s.entry : s.exit;
  const count = Math.max(2, Math.round(seconds * fps));
  const old = { width: engine.width, height: engine.height, ratio: engine.renderer.getPixelRatio(), t: engine.time, inspect: engine.inspect };
  const frames: Uint8Array[] = []; let bytes = 0; let heldFrame: Uint8Array | undefined;
  try {
    engine.renderer.setPixelRatio(1); engine.resize(width, height);
    for (let i = 0; i < count; i++) {
      if (cancelled()) throw new DOMException("Export cancelled.", "AbortError");
      let t = start + i / fps;
      // Include a stable last frame for entry clips and a clear last frame for exits.
      if (i === count - 1) t = start + seconds;
      const held = t >= s.entry && t <= s.entry + s.hold;
      let frame = held ? heldFrame : undefined;
      if (!frame) {
        engine.render(t, s, false);
        const png = await canvasPng(engine.renderer.domElement);
        frame = new Uint8Array(await png.arrayBuffer());
        if (held) heldFrame = frame;
      }
      frames.push(frame); bytes += frame.length;
      if (bytes > 450 * 1024 * 1024) throw new Error("This export is over 450 MB. Try a lower resolution, 30 fps, or a shorter hold.");
      onProgress((i + 1) / count * .94);
      if (i % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (cancelled()) throw new DOMException("Export cancelled.", "AbortError");
    if (format === "mov") { const blob = createMov(frames, width, height, fps); onProgress(1); return blob; }
    const files: Record<string, Uint8Array> = {};
    frames.forEach((frame, i) => { files[`frames/logo_${String(i).padStart(5, "0")}.png`] = frame; });
    files["README.txt"] = strToU8(`Logo Flight\n${width} x ${height}\n${fps} fps\n${count} frames\nDuration: ${(count / fps).toFixed(3)} seconds\nRGBA PNG sequence with transparency.\nImport the numbered images as an image sequence at ${fps} fps.\n`);
    files["animation.json"] = strToU8(JSON.stringify({ settings: s, export: options, frames: count }, null, 2));
    return await new Promise((resolve, reject) => zip(files, { level: 0 }, (error, result) => {
      if (error) reject(error); else if (cancelled()) reject(new DOMException("Export cancelled.", "AbortError"));
      else { onProgress(1); resolve(new Blob([result as BlobPart], { type: "application/zip" })); }
    }));
  } finally {
    engine.renderer.setPixelRatio(old.ratio); engine.resize(old.width, old.height); engine.render(old.t, s, old.inspect);
  }
}

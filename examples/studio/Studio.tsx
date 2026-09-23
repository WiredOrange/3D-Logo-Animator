"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Box, Camera, Check, ChevronRight, CircleHelp, Clapperboard, Download, Expand, Film, ImagePlus, Layers3, LoaderCircle, Move3D, Pause, Play, Repeat2, RotateCcw, Scan, Settings2, SlidersHorizontal, Sparkles, Upload, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { DEFAULTS, PRESETS, duration, phaseAt, type Settings } from "@wiredorange/3d-logo-animator";
import { decodeLogo, LogoEngine, makeDemo, prepareLogo, type LogoImage } from "@wiredorange/3d-logo-animator/engine";
import { canvasPng, exportAnimation, type ExportOptions } from "@wiredorange/3d-logo-animator/engine";

function Range({ label, value, min, max, step = 1, unit = "", digits = 0, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; digits?: number; onChange: (n: number) => void }) {
  return <div className="range-field"><div className="field-label"><label>{label}</label><span className="number-field"><input aria-label={label} type="number" min={min} max={max} step={step} value={Number(value.toFixed(digits))} onChange={e => { if (e.target.value !== "") onChange(Math.max(min, Math.min(max, Number(e.target.value)))); }} /><span>{unit}</span></span></div><Slider aria-label={`${label} slider`} value={[value]} min={min} max={max} step={step} onValueChange={v => onChange(v[0])} /></div>;
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <div className="select-field"><label>{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>;
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) { return <section className="control-section"><h3>{icon}{title}</h3>{children}</section>; }

export default function Studio() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS });
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [logo, setLogo] = useState<LogoImage | null>(null);
  const [name, setName] = useState("APEX · demo logo");
  const [thumbnail, setThumbnail] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState("shape");
  const [time, setTime] = useState(DEFAULTS.entry + .3);
  const timeRef = useRef(time); timeRef.current = time;
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [inspect, setInspect] = useState(false);
  const [background, setBackground] = useState<"studio" | "checker" | "light">("studio");
  const [guides, setGuides] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({ width: 1920, fps: 60, format: "mov", scope: "full" });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [download, setDownload] = useState<{ url: string; name: string; size: number } | null>(null);
  const exportCancelled = useRef(false);
  const engineRef = useRef<LogoEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const total = duration(settings);
  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => setSettings(s => ({ ...s, [key]: value })), []);

  useEffect(() => {
    if (!canvasRef.current || !stageRef.current) return;
    let engine: LogoEngine;
    try { engine = new LogoEngine(canvasRef.current); engineRef.current = engine; setReady(true); setSource(makeDemo()); }
    catch { setError("3D preview needs WebGL. Enable hardware acceleration in your browser, then reload this page."); return; }
    const resize = new ResizeObserver(entries => {
      if (exportCancelled.current === false && engineRef.current && !stageRef.current?.dataset.exporting) {
        const width = entries[0].contentRect.width; engine.resize(Math.max(2, width), Math.max(2, width * 9 / 16));
        engine.render(timeRef.current, settingsRef.current, engine.inspect);
      }
    });
    resize.observe(stageRef.current);
    const lost = (event: Event) => { event.preventDefault(); setError("The 3D preview was interrupted. Reload this page to restore it."); setReady(false); setPlaying(false); exportCancelled.current = true; };
    canvasRef.current.addEventListener("webglcontextlost", lost);
    return () => { resize.disconnect(); engine.renderer.domElement.removeEventListener("webglcontextlost", lost); engine.dispose(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    if (!source || !engineRef.current || exporting) return;
    setBuilding(true);
    const timer = setTimeout(() => {
      try {
        const prepared = prepareLogo(source, settingsRef.current, name);
        engineRef.current?.rebuild(prepared, settingsRef.current); setLogo(prepared); setThumbnail(prepared.canvas.toDataURL("image/png")); setError("");
      } catch (e) { setError(e instanceof Error ? e.message : "This logo could not be processed."); }
      setBuilding(false);
    }, 140);
    return () => clearTimeout(timer);
    // Only geometric or image-processing changes need a retrace.
  }, [source, name, settings.depth, settings.bevel, settings.relief, settings.threshold, settings.edgeColor, settings.finish, settings.removeBackground, settings.tolerance, settings.backgroundColor]);

  useEffect(() => { if (!exporting) engineRef.current?.render(Math.min(time, total), settings, inspect); }, [time, settings, inspect, ready, total, exporting]);
  useEffect(() => { if (timeRef.current > total) setTime(total); }, [total]);
  useEffect(() => {
    if (!playing || exporting) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + Math.min((now - last) / 1000, .1); last = now;
      if (next >= duration(settingsRef.current)) {
        if (loop) { timeRef.current = 0; setTime(0); } else { setTime(duration(settingsRef.current)); setPlaying(false); return; }
      } else { timeRef.current = next; setTime(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, loop, exporting]);

  const play = useCallback(() => { if (!ready || exporting || building || error) return; setInspect(false); if (timeRef.current >= duration(settingsRef.current) - .02) setTime(0); setPlaying(p => !p); }, [ready, exporting, building, error]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code === "Space" && !showExport && !showHelp && !["INPUT", "BUTTON", "TEXTAREA"].includes(el.tagName) && el.getAttribute("role") !== "slider" && !el.isContentEditable) { e.preventDefault(); play(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [play, showExport, showHelp]);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);

  async function upload(file?: File) {
    if (!file || exporting) return;
    setPlaying(false); setBuilding(true);
    try {
      const c = await decodeLogo(file);
      const corner = c.getContext("2d")!.getImageData(0, 0, 1, 1).data;
      const color = "#" + [corner[0], corner[1], corner[2]].map(v => v.toString(16).padStart(2, "0")).join("");
      setSettings(s => ({ ...s, removeBackground: false, backgroundColor: color }));
      setSource(c); setName(file.name); setTime(settingsRef.current.entry + .2); setInspect(false); setError("");
      toast.success("Logo loaded. Adjust its depth and motion.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to open the logo."); setBuilding(false); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }
  function setPreset(id: Settings["preset"]) { setSettings(s => ({ ...s, ...PRESETS[id] })); setInspect(false); setTime(0); setPlaying(true); }
  function seek(t: number) { setPlaying(false); setInspect(false); setTime(t); }
  async function snapshot() {
    if (!engineRef.current || exporting) return;
    const engine = engineRef.current;
    const previous = { width: engine.width, height: engine.height, ratio: engine.renderer.getPixelRatio() };
    try {
      engine.renderer.setPixelRatio(1); engine.resize(options.width, options.width * 9 / 16); engine.render(time, settings, inspect);
      const blob = await canvasPng(engine.renderer.domElement); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "logo-flight-frame.png"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); toast.success("Transparent frame saved.");
    }
    catch { toast.error("This frame could not be saved."); }
    finally { engine.renderer.setPixelRatio(previous.ratio); engine.resize(previous.width, previous.height); engine.render(time, settings, inspect); }
  }
  async function doExport() {
    if (!engineRef.current || !logo || building || error) return;
    setPlaying(false); setInspect(false); setExporting(true); setProgress(0); setDownload(null); exportCancelled.current = false;
    if (stageRef.current) stageRef.current.dataset.exporting = "true";
    try {
      const blob = await exportAnimation(engineRef.current, settingsRef.current, options, setProgress, () => exportCancelled.current);
      const base = name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "logo";
      const fileName = `${base}-${options.scope}-${options.width * 9 / 16}p-${options.fps}fps.${options.format === "mov" ? "mov" : "zip"}`;
      const url = URL.createObjectURL(blob); setDownload({ url, name: fileName, size: blob.size });
      const a = document.createElement("a"); a.href = url; a.download = fileName; a.click(); toast.success("Your animation is ready.");
    } catch (e) { const message = e instanceof Error ? e.message : "Export failed. Try a smaller resolution."; if (message !== "Export cancelled.") toast.error(message); }
    finally { setExporting(false); exportCancelled.current = false; if (stageRef.current) delete stageRef.current.dataset.exporting; }
  }

  return <div className="studio-shell">
    <Toaster theme="dark" position="bottom-right" richColors />
    <header className="topbar">
      <a className="brand" href="/" aria-label="Logo Flight home"><span className="brand-mark"><Layers3 size={23} strokeWidth={2.2} /></span><span>Logo Flight<span className="brand-divider" /><small>MOTION STUDIO</small></span></a>
      <div className="header-actions"><button className="quiet-button help-button" onClick={() => setShowHelp(true)}><CircleHelp size={17} /><span>Quick guide</span></button><button className="quiet-button" disabled={exporting} onClick={() => { setSettings({ ...DEFAULTS }); setTime(DEFAULTS.entry + .3); setPlaying(false); setInspect(false); toast.success("Animation settings reset."); }}><RotateCcw size={16} /><span>Reset</span></button><button className="primary-button" disabled={!ready || building || !!error} onClick={() => { setShowExport(true); setPlaying(false); }}><Download size={16} />Export animation</button></div>
    </header>

    <div className="workspace">
      <aside className="controls" aria-label="Logo and animation controls">
        <fieldset disabled={exporting} className="controls-fieldset">
          <div className="asset-section"><div className="panel-eyebrow"><span>YOUR LOGO</span><span className="step-number">01</span></div>
            <input type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Upload logo file" onChange={e => upload(e.target.files?.[0])} />
            <button className={`upload-zone ${dragging ? "drag-active" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files?.[0]); }}>
              <span className="upload-icon"><Upload size={20} /></span><strong>Drop a logo here</strong><span>or click to browse</span><small>PNG, SVG, JPG, WebP · up to 20 MB</small>
            </button>
            {thumbnail && <div className="asset-info"><div className="asset-thumb"><img src={thumbnail} alt="Current logo" /></div><div><strong title={name}>{name}</strong><span>{logo?.width} × {logo?.height}<span className="inline-dot">·</span>{name.includes("demo logo") ? "Try your own" : logo?.hasAlpha ? "Transparent" : "Solid background"}</span></div><button className="icon-button" aria-label="Replace logo" onClick={() => fileRef.current?.click()}><ImagePlus size={17} /></button></div>}
          </div>
          <Tabs value={tab} onValueChange={setTab} className="settings-tabs"><TabsList><TabsTrigger value="shape"><Box size={15} />3D style</TabsTrigger><TabsTrigger value="motion"><Move3D size={15} />Motion</TabsTrigger></TabsList>
            <TabsContent value="shape">
              <Section title="Dimension" icon={<Layers3 size={16} />}>
                <Range label="Extrusion" value={settings.depth} min={.02} max={.7} step={.01} digits={2} onChange={n => update("depth", n)} />
                <Range label="Beveled edges" value={settings.bevel} min={0} max={.045} step={.001} digits={3} onChange={n => update("bevel", n)} />
                <Range label="Raised details" value={settings.relief} min={0} max={.35} step={.01} digits={2} onChange={n => update("relief", n)} />
                <p className="control-note">Lighter details rise above the logo’s base.</p>
                {settings.relief > 0 && <Range label="Detail threshold" value={settings.threshold} min={.1} max={.95} step={.01} digits={2} onChange={n => update("threshold", n)} />}
              </Section>
              <Section title="Surface" icon={<Sparkles size={16} />}>
                <Choice label="Edge finish" value={settings.finish} onChange={v => update("finish", v as Settings["finish"])} options={[{ value: "satin", label: "Satin metal" }, { value: "gloss", label: "Gloss" }, { value: "matte", label: "Matte" }]} />
                <div className="field-label color-field"><label htmlFor="edge-color">Edge color</label><div><span>{settings.edgeColor.toUpperCase()}</span><input id="edge-color" type="color" value={settings.edgeColor} onChange={e => update("edgeColor", e.target.value)} /></div></div>
              </Section>
              <Section title="Background cleanup" icon={<Scan size={16} />}>
                <div className="toggle-field"><label htmlFor="remove-bg">Remove solid background</label><Switch id="remove-bg" checked={settings.removeBackground} onCheckedChange={v => update("removeBackground", v)} /></div>
                {settings.removeBackground ? <><div className="field-label color-field"><label htmlFor="key-color">Background color</label><input id="key-color" type="color" value={settings.backgroundColor} onChange={e => update("backgroundColor", e.target.value)} /></div><Range label="Tolerance" value={settings.tolerance} min={1} max={100} onChange={n => update("tolerance", n)} /><p className="control-note">Removes matching areas connected to the image edges.</p></> : <p className="control-note">A transparent PNG gives the cleanest outline.</p>}
              </Section>
            </TabsContent>
            <TabsContent value="motion">
              <Section title="Timing" icon={<Film size={16} />}>
                <Range label="Fly in" value={settings.entry} min={.4} max={3} step={.1} unit="s" digits={1} onChange={n => update("entry", n)} />
                <Range label="Hold" value={settings.hold} min={0} max={10} step={.1} unit="s" digits={1} onChange={n => update("hold", n)} />
                <Range label="Fly out" value={settings.exit} min={.4} max={3} step={.1} unit="s" digits={1} onChange={n => update("exit", n)} />
              </Section>
              <Section title="Flight path" icon={<Move3D size={16} />}>
                <Choice label="Enter from" value={settings.direction} onChange={v => update("direction", v as Settings["direction"])} options={[{ value: "left", label: "Left of viewer" }, { value: "right", label: "Right of viewer" }]} />
                <Range label="Turn" value={settings.turn} min={0} max={360} unit="°" onChange={n => update("turn", n)} />
                <Range label="Tilt" value={settings.tilt} min={0} max={55} unit="°" onChange={n => update("tilt", n)} />
                <p className="control-note">Flies away from the viewer on entry, then turns and flies toward the viewer on exit.</p>
              </Section>
              <Section title="Composition" icon={<Expand size={16} />}><Range label="Logo scale" value={settings.size} min={30} max={140} unit="%" onChange={n => update("size", n)} /></Section>
            </TabsContent>
          </Tabs>
        </fieldset>
        <div className="local-note"><span className="tiny-lock">◈</span> Your logo stays in your browser.</div>
      </aside>

      <main className="main-workspace">
        <div className="workspace-heading"><div><div className="panel-eyebrow">ANIMATION WORKSPACE</div><h1>Give your logo an entrance.</h1></div><span className="project-badge"><span />{exporting ? "Rendering" : building ? "Building model" : "Untitled animation"}</span></div>
        <section className="preview-panel" aria-label="Animation preview">
          <div className="preview-toolbar"><div className="preview-mode"><button className={!inspect ? "active" : ""} disabled={exporting} onClick={() => { setInspect(false); }}><Clapperboard size={15} />Animation</button><button className={inspect ? "active" : ""} disabled={exporting} onClick={() => { setPlaying(false); setInspect(true); }}><Box size={15} />Inspect 3D</button></div><div className="preview-tools"><div className="background-options" aria-label="Preview background">{(["studio", "light", "checker"] as const).map(bg => <button key={bg} aria-label={`${bg} preview background`} aria-pressed={background === bg} title={`${bg[0].toUpperCase() + bg.slice(1)} background`} className={`bg-swatch ${bg} ${background === bg ? "selected" : ""}`} onClick={() => setBackground(bg)} />)}</div><span className="tool-divider" /><button className={`icon-button ${guides ? "selected" : ""}`} onClick={() => setGuides(v => !v)} aria-label="Toggle safe-area guides" aria-pressed={guides} title="Safe-area guides"><Scan size={17} /></button><button className="icon-button" onClick={snapshot} disabled={!ready || exporting || building || !!error} aria-label="Save transparent PNG frame" title="Save transparent PNG frame"><Camera size={17} /></button></div></div>
          <div ref={stageRef} className={`stage ${background} ${inspect ? "is-inspecting" : ""}`}>
            <canvas ref={canvasRef} aria-label="3D logo animation canvas" onPointerDown={e => { if (!inspect || exporting) return; pointer.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!pointer.current || !engineRef.current || !inspect || exporting) return; const engine = engineRef.current; engine.yaw += (e.clientX - pointer.current.x) * .007; engine.pitch = Math.max(-1.25, Math.min(1.25, engine.pitch + (e.clientY - pointer.current.y) * .007)); pointer.current = { x: e.clientX, y: e.clientY }; engine.render(time, settings, true); }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} />
            {guides && <div className="safe-guides" aria-hidden="true"><span /><span /></div>}
            <span className="stage-label">{inspect ? "3D INSPECTION" : "CAMERA 01"}</span><span className="stage-format">16:9</span>
            <div className="stage-caption">{inspect ? <><Move3D size={14} /> Drag to rotate your logo</> : <><span className="phase-indicator" />{phaseAt(time, settings)}<span className="stage-caption-divider" />{name.includes("demo logo") ? "Demo logo · replace with yours" : name}</>}</div>
            {(building || !ready) && !error && <div className="stage-loading"><LoaderCircle className="animate-spin" size={22} />{building ? "Creating your 3D logo…" : "Starting the 3D preview…"}</div>}
            {error && <div className="stage-error" role="alert"><CircleHelp size={24} /><strong>Let’s adjust that</strong><p>{error}</p>{ready && <button className="secondary-button" onClick={() => update("removeBackground", false)}>Turn off background removal</button>}</div>}
            {exporting && <div className="stage-loading export-overlay"><LoaderCircle className="animate-spin" size={24} /><span>Rendering animation · {Math.round(progress * 100)}%</span></div>}
          </div>
          <div className="playback-bar"><div className="playback-actions"><button className="icon-button" onClick={() => seek(0)} disabled={exporting} aria-label="Return to beginning" title="Return to beginning"><RotateCcw size={17} /></button><button className="play-button" onClick={play} disabled={!ready || exporting || building || !!error} aria-label={playing ? "Pause animation" : "Play animation"}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className={`icon-button ${loop ? "selected" : ""}`} onClick={() => setLoop(v => !v)} aria-label="Loop animation" aria-pressed={loop} title="Loop"><Repeat2 size={18} /></button><span className="timecode">{time.toFixed(2)} <span>/ {total.toFixed(2)} s</span></span></div><span className="playback-hint"><kbd>SPACE</kbd> to play / pause</span><span className="resolution-label">{options.width} × {options.width * 9 / 16}<span> {options.fps} FPS</span></span></div>
        </section>

        <section className="timeline-panel" aria-label="Animation timeline"><div className="timeline-heading"><h2><Film size={16} />Timeline</h2><span>{total.toFixed(1)} seconds<span className="inline-dot">·</span>3 phases</span></div><div className="timeline-ruler">{Array.from({ length: 7 }, (_, i) => <span key={i}>{(total / 6 * i).toFixed(1)}s</span>)}</div><div className="timeline-track"><div className="phase-blocks"><button className="phase-block phase-in" style={{ flex: settings.entry }} onClick={() => seek(settings.entry * .44)} disabled={exporting}><ArrowDownToLine size={15} /><strong>Fly in</strong><span>{settings.entry.toFixed(1)}s</span></button><button className="phase-block phase-hold" style={{ flex: Math.max(settings.hold, .08) }} onClick={() => seek(settings.entry + settings.hold / 2)} disabled={exporting}><span className="hold-square" /><strong>{settings.hold > .45 ? "Hold" : ""}</strong><span>{settings.hold > .45 ? `${settings.hold.toFixed(1)}s` : ""}</span></button><button className="phase-block phase-out" style={{ flex: settings.exit }} onClick={() => seek(settings.entry + settings.hold + settings.exit * .55)} disabled={exporting}><ArrowDownToLine className="rotate-180" size={15} /><strong>Fly out</strong><span>{settings.exit.toFixed(1)}s</span></button></div><div className="playhead" style={{ left: `${Math.min(time / total, 1) * 100}%` }} aria-hidden="true"><span /></div></div><Slider className="timeline-scrubber" aria-label="Animation playhead" value={[time]} min={0} max={total} step={.01} disabled={exporting} onValueChange={v => seek(v[0])} /><div className="timeline-footer"><span>Near viewer <ArrowRight size={12} /> centered hold <ArrowRight size={12} /> toward viewer</span><button onClick={() => setTab("motion")}><SlidersHorizontal size={13} />Edit timing</button></div></section>

        <section className="presets-section" aria-label="Motion presets"><div className="presets-title"><h2>Start with a motion</h2><span>Fine-tune it to make it yours.</span></div><div className="preset-grid">{([{ id: "broadcast", title: "Broadcast swoop", text: "A bold entrance. A confident exit.", icon: <Move3D /> }, { id: "clean", title: "Clean turn", text: "A smooth turn with a lighter touch.", icon: <RotateCcw /> }, { id: "spin", title: "Full spin", text: "More rotation. More energy.", icon: <Repeat2 /> }] as const).map(p => <button key={p.id} className={`preset-card ${settings.preset === p.id ? "selected" : ""}`} disabled={exporting || !ready || building || !!error} onClick={() => setPreset(p.id)}><span className={`preset-icon preset-${p.id}`}>{p.icon}</span><span><strong>{p.title}</strong><small>{p.text}</small></span>{settings.preset === p.id ? <Check size={16} /> : <ChevronRight size={16} />}</button>)}</div></section>
        <footer className="workspace-footer"><span><Box size={13} />Real 3D depth. Original logo colors.</span><span>Transparent exports <span className="inline-dot">·</span> No watermark</span></footer>
      </main>
    </div>

    <Dialog open={showExport} onOpenChange={open => { if (!exporting) setShowExport(open); }}><DialogContent className="export-dialog" showCloseButton={!exporting}><DialogHeader><span className="dialog-icon"><Download size={23} /></span><DialogTitle>Ready for the big screen.</DialogTitle><DialogDescription>Export your animation with a transparent background.</DialogDescription></DialogHeader><fieldset disabled={exporting} className="export-fields"><Choice label="Format" value={options.format} onChange={v => { setOptions(o => ({ ...o, format: v as ExportOptions["format"] })); setDownload(null); }} options={[{ value: "mov", label: "Transparent MOV · lossless PNG" }, { value: "png", label: "PNG sequence · ZIP" }]} /><Choice label="Animation" value={options.scope} onChange={v => { setOptions(o => ({ ...o, scope: v as ExportOptions["scope"] })); setDownload(null); }} options={[{ value: "full", label: "Full animation · entry, hold, exit" }, { value: "entry", label: "Entry only · ends on the logo" }, { value: "exit", label: "Exit only · starts on the logo" }]} /><div className="export-row"><Choice label="Resolution" value={String(options.width)} onChange={v => { setOptions(o => ({ ...o, width: Number(v) })); setDownload(null); }} options={[{ value: "1280", label: "1280 × 720" }, { value: "1920", label: "1920 × 1080" }, { value: "2560", label: "2K · 2560 × 1440" }, { value: "3840", label: "4K · 3840 × 2160" }]} /><Choice label="Frame rate" value={String(options.fps)} onChange={v => { setOptions(o => ({ ...o, fps: Number(v) })); setDownload(null); }} options={[{ value: "60", label: "60 fps" }, { value: "30", label: "30 fps" }]} /></div></fieldset><div className="export-note"><Layers3 size={17} /><p>{options.format === "mov" ? "Lossless MOV preserves alpha. Files can be large; use the PNG sequence if your player doesn’t support the PNG video codec." : "Numbered RGBA PNG frames. Import as an image sequence at your chosen frame rate."}<span>The preview background and guides are never included.</span></p></div>{exporting ? <div className="export-progress"><div><strong>Rendering frames</strong><span>{Math.round(progress * 100)}%</span></div><Progress value={progress * 100} /><p>Keep this tab open while your animation renders.</p><button className="quiet-button" onClick={() => { exportCancelled.current = true; }}>Cancel export</button></div> : download ? <div className="download-ready"><span><Check size={17} />Export ready · {(download.size / 1024 / 1024).toFixed(1)} MB</span><a className="primary-button" href={download.url} download={download.name}><Download size={16} />Download again</a><button className="quiet-button" onClick={doExport}>Render again</button></div> : <button className="primary-button export-submit" onClick={doExport} disabled={!ready || building || !!error}><Film size={17} />Render & download<span>{(options.scope === "full" ? total : options.scope === "entry" ? settings.entry : settings.exit).toFixed(1)}s</span></button>}</DialogContent></Dialog>
    <Dialog open={showHelp} onOpenChange={setShowHelp}><DialogContent className="help-dialog"><DialogHeader><DialogTitle>Your logo. In motion.</DialogTitle><DialogDescription>A quick guide to Logo Flight.</DialogDescription></DialogHeader><ol className="guide-list"><li><span>01</span><div><strong>Start with a clean logo</strong><p>Upload a transparent PNG or SVG. JPG and WebP also work; remove a solid background in 3D style if needed.</p></div></li><li><span>02</span><div><strong>Give it dimension</strong><p>Extrusion builds the outline’s thickness. Raised details lift lighter parts of the artwork. Inspect 3D lets you drag to see the edges. Complex gradients become a textured surface, not separate sculpted parts.</p></div></li><li><span>03</span><div><strong>Direct the motion</strong><p>Choose a preset, then adjust the turn, tilt, and timing. The entry moves away from the viewer; the exit comes back toward the viewer.</p></div></li><li><span>04</span><div><strong>Take it into your production</strong><p>Export a transparent MOV or PNG sequence. For an adjustable live hold, export entry and exit separately and save a centered PNG frame between them.</p></div></li></ol><p className="help-footnote">Logo files and settings are kept in this tab only. Download your result before closing it.</p></DialogContent></Dialog>
  </div>;
}

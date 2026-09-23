import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LogoAnimatorCanvas } from "@wiredorange/3d-logo-animator/react";
import type { AnimatorState, LogoAnimator, LogoSource } from "@wiredorange/3d-logo-animator";
import { makeDemo } from "@wiredorange/3d-logo-animator/engine";
import "../shared.css";

function App() {
  const [source, setSource] = useState<LogoSource>(() => makeDemo());
  const [state, setState] = useState<AnimatorState>();
  const [error, setError] = useState("");
  const controller = useRef<LogoAnimator | null>(null);
  const ready = state?.loaded && !state.loading;
  return <main><a href="/">← Full editor</a><h1>A canvas that fits your React app.</h1><p>The component owns setup, resizing, and cleanup. Your application controls the animation.</p>
    <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" aria-label="Choose logo" onChange={event => { if (event.target.files?.[0]) { setSource(event.target.files[0]); setError(""); } }} />
    <div className="stage"><LogoAnimatorCanvas source={source} settings={{ preset: "broadcast" }} onReady={animator => { controller.current = animator; }} onStateChange={setState} onError={error => setError(error.message)} /></div>
    <div className="controls"><button disabled={!ready} onClick={() => controller.current?.enter()}>Fly in & hold</button><button disabled={!ready} onClick={() => controller.current?.exit()}>Fly out</button><button disabled={!ready} onClick={() => controller.current?.play({ from: 0 })}>Play full clip</button></div>
    <p className="status" role="status">{error || (state ? `${state.phase} · ${state.time.toFixed(2)}s` : "Loading…")}</p><p><a href="/examples/vanilla/">Vanilla JavaScript example →</a></p>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

import { createLogoAnimator, type Resolution } from "@wiredorange/3d-logo-animator";
import { makeDemo } from "@wiredorange/3d-logo-animator/engine";
import "../shared.css";

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const animator = createLogoAnimator(get<HTMLCanvasElement>("preview"));
animator.observeResize(get("stage"));
const status = get("status"), progress = get<HTMLProgressElement>("progress"), cancel = get<HTMLButtonElement>("cancel");
const report = (error: unknown) => { status.textContent = error instanceof Error ? error.message : String(error); };
animator.on("change", state => {
  document.querySelectorAll<HTMLButtonElement>("button[data-action], #export").forEach(button => { button.disabled = !state.loaded || state.loading || state.exporting; });
  get<HTMLInputElement>("file").disabled = state.exporting;
  if (!state.exporting) status.textContent = `${state.phase} · ${state.time.toFixed(2)}s${state.softwareRenderer ? " · Software renderer" : ""}`;
});
animator.on("error", report);
document.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(button => button.addEventListener("click", () => {
  try {
    switch (button.dataset.action) {
      case "enter": animator.enter(); break; case "exit": animator.exit(); break;
      case "play": animator.play({ from: 0 }); break; case "pause": animator.pause(); break; case "inspect": animator.inspect(); break;
    }
  } catch (error) { report(error); }
}));
get<HTMLInputElement>("file").addEventListener("change", async event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
  try { await animator.setLogo(file); animator.enter(); } catch (error) { report(error); } finally { input.value = ""; }
});
get("export").addEventListener("click", async () => {
  progress.hidden = false; cancel.hidden = false; progress.value = 0;
  try {
    const blob = await animator.export({ resolution: get<HTMLSelectElement>("resolution").value as Resolution, fps: 30,
      onProgress: n => { progress.value = n; status.textContent = `Rendering ${Math.round(n * 100)}%`; } });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "logo-animation.mov"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = "Transparent animation exported.";
  } catch (error) { report(error); } finally { progress.hidden = true; cancel.hidden = true; }
});
cancel.addEventListener("click", () => animator.cancelExport());
window.addEventListener("pagehide", event => { if (!event.persisted) animator.dispose(); });
animator.setLogo(makeDemo()).catch(report);

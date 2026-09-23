import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";

let clock = 0, nextId = 0;
const frames = new Map(), engines = [];
globalThis.window = { devicePixelRatio: 1 };
globalThis.document = {};
Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => clock } });
globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function advance(seconds) { clock += seconds * 1000; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(clock)); }
class Canvas extends EventTarget {
  toBlob(callback) { callback(new Blob(["png"], { type: "image/png" })); }
}
class Engine {
  constructor(canvas) {
    this.width = 960; this.height = 540; this.time = 0; this.inspect = false; this.disposed = 0; this.rebuilds = 0;
    this.renderer = { domElement: canvas, ratio: 1, setPixelRatio(n) { this.ratio = n; }, getPixelRatio() { return this.ratio; } };
    engines.push(this);
  }
  resize(width, height) { this.width = width; this.height = height; }
  render(time, settings, inspect = false) { assert.equal(this.disposed, 0); this.time = time; this.inspect = inspect; }
  rebuild() { this.rebuilds++; }
  dispose() { this.disposed++; }
}
await mock.module("../dist/core/logo-engine.js", { namedExports: {
  LogoEngine: Engine, prepareLogo: (canvas, settings, name) => ({ canvas, name, width: 400, height: 200, hasAlpha: true })
} });
await mock.module("../dist/source.js", { namedExports: {
  loadSource: async source => source?.promise ? source.promise : { canvas: {}, name: "test-logo" }
} });
const { LogoAnimator } = await import("../dist/index.js");
let current;
async function setup() { current = new LogoAnimator(new Canvas()); await current.setLogo("logo.png"); return current; }
afterEach(() => { current?.dispose(); frames.clear(); });

test("live entry stays centered until explicit exit; disposal stops the animation clock", async () => {
  const animator = await setup(); let ended = 0; animator.on("ended", () => ended++);
  animator.enter(); advance(animator.settings.entry);
  assert.equal(animator.state.time, animator.settings.entry); assert.equal(animator.state.playing, false);
  advance(100); assert.equal(animator.state.time, animator.settings.entry);
  animator.exit(); advance(animator.settings.exit);
  assert.equal(animator.state.time, animator.state.duration); assert.equal(ended, 2);
  animator.play(); assert.equal(frames.size, 1);
  animator.dispose(); animator.dispose(); assert.equal(frames.size, 0); assert.equal(engines.at(-1).disposed, 1);
  assert.throws(() => animator.play(), /disposed/);
});

test("full playback loops; pause and seek stop scheduled frames", async () => {
  const animator = await setup(); animator.play({ from: 0, loop: true }); advance(animator.state.duration + 0.5);
  assert.ok(Math.abs(animator.state.time - 0.5) < 0.001); assert.equal(animator.state.playing, true);
  animator.pause(); assert.equal(frames.size, 0);
  animator.seek(-3); assert.equal(animator.state.time, 0);
  animator.seek(100); assert.equal(animator.state.time, animator.state.duration);
  assert.throws(() => animator.seek(NaN), /finite/);
});

test("newest asynchronous logo load wins and superseded loads reject with AbortError", async () => {
  const animator = await setup(); let resolve;
  const old = animator.setLogo({ promise: new Promise(done => { resolve = done; }) });
  const rejection = assert.rejects(old, { name: "AbortError" });
  await animator.setLogo("new-logo.png");
  resolve({ canvas: {}, name: "old-logo" }); await rejection;
  assert.equal(engines.at(-1).rebuilds, 2); assert.equal(animator.state.loading, false);
});

test("public settings are validated, copied, and only geometry changes rebuild the mesh", async () => {
  const animator = await setup(), engine = engines.at(-1);
  animator.updateSettings({ hold: 10 }); assert.equal(engine.rebuilds, 1);
  animator.updateSettings({ depth: 0.4 }); assert.equal(engine.rebuilds, 2);
  assert.throws(() => animator.updateSettings({ depth: NaN })); assert.equal(animator.settings.depth, 0.4);
  assert.throws(() => { animator.settings.depth = 0.8; });
});

test("export locks mutations, queues resizing, and unlocks after cancellation", async () => {
  const animator = await setup(); const engine = engines.at(-1);
  const result = animator.export({ resolution: "4k", scope: "entry", onProgress: () => {
    assert.throws(() => animator.updateSettings({ hold: 2 }), /export/);
    assert.throws(() => animator.enter(), /export/);
    animator.resize(800, 450); animator.cancelExport();
  } });
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(engine.width, 800); assert.equal(engine.height, 450); assert.equal(animator.state.exporting, false);
  animator.enter(); assert.equal(animator.state.playing, true);
});

test("unmount during capture cancels and disposes only after the preview is restored", async () => {
  const animator = await setup(); const engine = engines.at(-1);
  const result = animator.export({ scope: "entry", onProgress: () => animator.dispose() });
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(engine.disposed, 1); assert.equal(animator.state.disposed, true);
});

test("captureFrame honors 2K and returns to the inspected preview", async () => {
  const animator = await setup(); animator.inspect(0.3, 0.1); const engine = engines.at(-1);
  animator.canvas.toBlob = callback => {
    assert.equal(engine.width, 2560); assert.equal(engine.height, 1440);
    callback(new Blob(["frame"], { type: "image/png" }));
  };
  const blob = await animator.captureFrame({ resolution: "2k" });
  assert.equal(blob.type, "image/png"); assert.equal(engine.width, 960); assert.equal(engine.inspect, true);
});

test("pre-aborted export does not lock the animator", async () => {
  const animator = await setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(animator.export({ signal: controller.signal }), { name: "AbortError" });
  assert.equal(animator.state.exporting, false); animator.enter();
});

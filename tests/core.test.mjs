import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DEFAULTS, PRESETS, RESOLUTIONS, resolveSettings, poseAt, duration, LogoAnimator } from "../dist/index.js";
import { LogoAnimatorCanvas } from "../dist/react/index.js";
import { exportAnimation, makeShapes, createMov } from "../dist/engine.js";

const pixel = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64"));
function fakeEngine() {
  return {
    width: 640, height: 360, time: 1.5, inspect: true, sizes: [],
    renderer: { ratio: 2, setPixelRatio(n) { this.ratio = n; }, getPixelRatio() { return this.ratio; }, domElement: { toBlob(callback) { callback(new Blob([pixel], { type: "image/png" })); } } },
    resize(w, h) { this.width = w; this.height = h; this.sizes.push([w, h]); },
    render(time, settings, inspect) { this.time = time; this.inspect = inspect; }
  };
}

test("main and React entrypoints import and server-render without browser globals", () => {
  assert.equal(typeof window, "undefined");
  assert.match(renderToString(createElement(LogoAnimatorCanvas, { source: "/logo.png" })), /<canvas/);
  assert.throws(() => new LogoAnimator({}), /browser/);
});

test("settings apply presets, preserve explicit overrides, and reject invalid public inputs", () => {
  const next = resolveSettings({ preset: "spin", entry: 2 });
  assert.equal(next.turn, PRESETS.spin.turn); assert.equal(next.entry, 2);
  for (const patch of [{ entry: 0 }, { hold: -1 }, { depth: NaN }, { turn: Infinity }, { extra: true }, { finish: "plastic" }, { direction: undefined }, { edgeColor: "red" }]) {
    assert.throws(() => resolveSettings(patch));
  }
  assert.equal(DEFAULTS.entry, 1.2);
  assert.deepEqual(RESOLUTIONS["2k"], { width: 2560, height: 1440 });
  assert.deepEqual(RESOLUTIONS["4k"], { width: 3840, height: 2160 });
});

test("motion starts and ends clear, holds front-facing, and mirrors its direction", () => {
  assert.equal(poseAt(0, DEFAULTS).visible, false);
  assert.equal(poseAt(duration(DEFAULTS), DEFAULTS).visible, false);
  const hold = poseAt(DEFAULTS.entry + 0.2, DEFAULTS);
  for (const key of ["x", "y", "z", "rx", "ry", "rz"]) assert.equal(Math.abs(hold[key]), 0);
  assert.equal(hold.visible, true);
  const left = poseAt(0.3, DEFAULTS), right = poseAt(0.3, { ...DEFAULTS, direction: "right" });
  assert.equal(left.x, -right.x); assert.equal(left.ry, -right.ry); assert.equal(left.z, right.z);
});

test("alpha tracing preserves an interior hole in a logo", () => {
  const w = 12, h = 12;
  const mask = Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w);
    return x > 0 && x < 11 && y > 0 && y < 11 && !(x >= 4 && x <= 7 && y >= 4 && y <= 7) ? 1 : 0;
  });
  const shapes = makeShapes(mask, w, h, 0.5, 1);
  assert.equal(shapes.length, 1); assert.equal(shapes[0].holes.length, 1);
});

for (const width of [2560, 3840]) test(`export requests exact ${width} × ${width * 9 / 16} dimensions and restores preview`, async () => {
  const engine = fakeEngine(); let progress = 0;
  const settings = { ...DEFAULTS, entry: 0.1, hold: 0, exit: 0.1 };
  const blob = await exportAnimation(engine, settings, { width, fps: 30, format: "png", scope: "entry" }, n => { progress = n; }, () => false);
  assert.deepEqual(engine.sizes, [[width, width * 9 / 16], [640, 360]]);
  assert.equal(engine.renderer.ratio, 2); assert.equal(engine.time, 1.5); assert.equal(engine.inspect, true); assert.equal(progress, 1);
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const metadata = JSON.parse(strFromU8(files["animation.json"]));
  assert.equal(metadata.frames, 3); assert.equal(metadata.export.width, width);
  assert.equal(Object.keys(files).filter(name => name.endsWith(".png")).length, 3);
});

test("export restores render state after cancellation, encoder failure, or callback error", async () => {
  for (const reason of ["cancel", "encoder", "callback"]) {
    const engine = fakeEngine();
    if (reason === "encoder") engine.renderer.domElement.toBlob = callback => callback(null);
    await assert.rejects(exportAnimation(engine, DEFAULTS, { width: 1920, fps: 30, format: "mov", scope: "entry" }, () => {
      if (reason === "callback") throw new Error("Progress callback failed");
    }, () => reason === "cancel"));
    assert.equal(engine.width, 640); assert.equal(engine.height, 360); assert.equal(engine.renderer.ratio, 2); assert.equal(engine.time, 1.5);
  }
});

test("invalid export options are rejected before resizing the preview", async () => {
  for (const patch of [{ width: 1000 }, { fps: 24 }, { format: "mp4" }, { scope: "unknown" }]) {
    const engine = fakeEngine();
    await assert.rejects(exportAnimation(engine, DEFAULTS, { width: 1920, fps: 30, format: "mov", scope: "full", ...patch }, () => {}, () => false));
    assert.deepEqual(engine.sizes, []);
  }
});

test("QuickTime samples retain PNG bytes and declare 32-bit color depth", async () => {
  const blob = createMov([pixel, pixel], 1, 1, 30);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(blob.type, "video/quicktime");
  const mdat = bytes.indexOf("mdat"), sample = bytes.indexOf("png ");
  assert.deepEqual(bytes.subarray(mdat + 4, mdat + 4 + pixel.length), Buffer.from(pixel));
  assert.equal(bytes.readUInt16BE(sample + 78), 32);
  const stco = bytes.indexOf("stco");
  assert.equal(bytes.readUInt32BE(stco + 8), 2);
  assert.equal(bytes.readUInt32BE(stco + 12), mdat + 4);
});

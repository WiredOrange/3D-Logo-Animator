import { DEFAULTS, PRESETS, type Settings } from "./core/animation.js";

const ranges = {
  depth: [0.01, 1], bevel: [0, 0.08], relief: [0, 0.5], threshold: [0.01, 1],
  size: [10, 200], entry: [0.1, 30], hold: [0, 120], exit: [0.1, 30],
  turn: [0, 1080], tilt: [-180, 180], tolerance: [0, 100]
} as const;
const choices = {
  finish: ["satin", "gloss", "matte"], direction: ["left", "right"],
  preset: ["broadcast", "clean", "spin"]
} as const;

/** Merge and validate settings. Selecting a preset applies its timing and turn defaults first. */
export function resolveSettings(patch: Partial<Settings> = {}, base: Readonly<Settings> = DEFAULTS): Settings {
  for (const key of Object.keys(patch)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new TypeError(`Unknown animation setting: ${key}.`);
  }
  for (const [key, allowed] of Object.entries(choices)) {
    const value = patch[key as keyof Settings];
    if (value !== undefined && !(allowed as readonly unknown[]).includes(value)) throw new TypeError(`Invalid ${key}.`);
  }
  const next = { ...base, ...(patch.preset ? PRESETS[patch.preset] : {}), ...patch };
  for (const [key, allowed] of Object.entries(choices)) {
    if (!(allowed as readonly unknown[]).includes(next[key as keyof Settings])) throw new TypeError(`Invalid ${key}.`);
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = next[key as keyof Settings];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`${key} must be between ${min} and ${max}.`);
    }
  }
  for (const key of ["edgeColor", "backgroundColor"] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(next[key])) throw new TypeError(`${key} must be a six-digit hex color.`);
  }
  if (typeof next.removeBackground !== "boolean") throw new TypeError("removeBackground must be a boolean.");
  return next;
}

export const MODEL_SETTINGS = ["depth", "bevel", "relief", "threshold", "edgeColor", "finish", "removeBackground", "tolerance", "backgroundColor"] as const;

/** 2K retains the editor's QHD convention; this is not DCI 2048 × 1080. */
export const RESOLUTIONS = Object.freeze({
  "720p": Object.freeze({ width: 1280, height: 720 }),
  "1080p": Object.freeze({ width: 1920, height: 1080 }),
  "2k": Object.freeze({ width: 2560, height: 1440 }),
  "4k": Object.freeze({ width: 3840, height: 2160 })
});
export type Resolution = keyof typeof RESOLUTIONS;

export function resolutionSize(resolution: Resolution = "1080p") {
  if (!Object.hasOwn(RESOLUTIONS, resolution)) throw new TypeError(`Unknown resolution: ${resolution}.`);
  return RESOLUTIONS[resolution];
}

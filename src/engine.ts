/** Advanced API: the caller owns rendering, validation, animation, and disposal. */
export { LogoEngine, decodeLogo, prepareLogo, makeDemo, makeShapes } from "./core/logo-engine.js";
export type { LogoImage } from "./core/logo-engine.js";
export { exportAnimation, canvasPng } from "./core/export-animation.js";
export type { ExportOptions } from "./core/export-animation.js";
export { createMov } from "./core/mov.js";

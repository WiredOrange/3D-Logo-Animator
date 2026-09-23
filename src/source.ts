import { decodeLogo } from "./core/logo-engine.js";

export type LogoSource = File | Blob | HTMLCanvasElement | string | URL;
export type LoadedSource = { canvas: HTMLCanvasElement; name: string };

/** Fetch only explicitly supplied URLs; cross-origin servers must permit CORS. */
export async function loadSource(source: LogoSource, signal: AbortSignal): Promise<LoadedSource> {
  signal.throwIfAborted();
  if (source instanceof HTMLCanvasElement) {
    if (!source.width || !source.height || source.width * source.height > 64_000_000) throw new RangeError("Use a non-empty logo under 64 megapixels.");
    const factor = Math.min(1, 1800 / Math.max(source.width, source.height));
    const copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(source.width * factor)); copy.height = Math.max(1, Math.round(source.height * factor));
    copy.getContext("2d")!.drawImage(source, 0, 0, copy.width, copy.height);
    copy.getContext("2d")!.getImageData(0, 0, 1, 1);
    return { canvas: copy, name: "canvas-logo" };
  }
  let blob: Blob;
  let name = source instanceof File ? source.name : "logo";
  if (typeof source === "string" || source instanceof URL) {
    const url = new URL(String(source), document.baseURI);
    if (!["http:", "https:", "blob:", "data:"].includes(url.protocol)) throw new TypeError("Unsupported logo URL protocol.");
    const response = await fetch(url, { signal, credentials: "same-origin" });
    if (!response.ok) throw new Error(`Unable to load logo (HTTP ${response.status}).`);
    if (Number(response.headers.get("content-length")) > 20 * 1024 * 1024) throw new RangeError("Choose a logo smaller than 20 MB.");
    blob = await response.blob();
    name = url.pathname.split("/").pop() || "logo";
  } else if (source instanceof Blob) blob = source;
  else throw new TypeError("Supply a File, Blob, canvas, or image URL.");
  signal.throwIfAborted();
  const extension: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
  if (!/\.(png|jpe?g|webp|svg)$/i.test(name) && extension[blob.type]) name += `.${extension[blob.type]}`;
  const canvas = await decodeLogo(new File([blob], name, { type: blob.type }));
  signal.throwIfAborted();
  return { canvas, name };
}

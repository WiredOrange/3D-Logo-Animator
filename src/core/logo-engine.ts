import * as THREE from "three";
import { contours } from "d3-contour";
import { DEFAULTS, poseAt, type Settings } from "./animation.js";
import { CanvasRenderer } from "./canvas-renderer.js";

export type LogoImage = { canvas: HTMLCanvasElement; name: string; width: number; height: number; hasAlpha: boolean };

export function makeDemo(): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = 1100; c.height = 610;
  const g = c.getContext("2d")!;
  g.fillStyle = "#101216"; g.beginPath(); g.roundRect(34, 32, 1032, 546, 54); g.fill();
  g.strokeStyle = "#ff713f"; g.lineWidth = 12; g.beginPath(); g.roundRect(53, 51, 994, 508, 40); g.stroke();
  g.fillStyle = "#ff713f"; g.fillRect(96, 423, 908, 4);
  g.save(); g.translate(533, 326); g.transform(1, 0, -.16, 1, 0, 0);
  g.fillStyle = "#f6f6f7"; g.font = "900 241px Arial, sans-serif"; g.textAlign = "center"; g.fillText("APEX", 0, 0); g.restore();
  g.fillStyle = "#ff713f"; g.font = "bold 47px Arial, sans-serif"; g.textAlign = "center";
  g.letterSpacing = "14px"; g.fillText("MOTORSPORT", 554, 506);
  return c;
}

export async function decodeLogo(file: File): Promise<HTMLCanvasElement> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a logo smaller than 20 MB.");
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) throw new Error("Choose a PNG, SVG, JPG, or WebP logo.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!img.width || !img.height || img.width * img.height > 64_000_000) throw new Error("Use a logo under 64 megapixels.");
    const factor = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * factor)); c.height = Math.max(1, Math.round(img.height * factor));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    c.getContext("2d")!.getImageData(0, 0, 1, 1);
    return c;
  } catch (e) { throw new Error(e instanceof Error && e.message.includes("megapixels") ? e.message : "This image couldn’t be read. Try exporting it as a PNG."); }
  finally { URL.revokeObjectURL(url); }
}

export function prepareLogo(source: HTMLCanvasElement, s: Settings, name: string): LogoImage {
  const g = source.getContext("2d")!;
  const image = g.getImageData(0, 0, source.width, source.height);
  const d = image.data; const w = source.width, h = source.height;
  if (s.removeBackground) {
    const color = new THREE.Color(s.backgroundColor); color.convertLinearToSRGB();
    const key = [color.r * 255, color.g * 255, color.b * 255];
    const seen = new Uint8Array(w * h); const queue = new Int32Array(w * h); let head = 0, tail = 0;
    const enqueue = (p: number) => {
      if (seen[p]) return; seen[p] = 1;
      const i = p * 4;
      const distance = Math.sqrt((d[i] - key[0]) ** 2 + (d[i + 1] - key[1]) ** 2 + (d[i + 2] - key[2]) ** 2);
      if (d[i + 3] < 16 || distance <= s.tolerance * 2.55) { queue[tail++] = p; d[i + 3] = 0; }
    };
    for (let x = 0; x < w; x++) { enqueue(x); enqueue((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { enqueue(y * w); enqueue(y * w + w - 1); }
    while (head < tail) { const p = queue[head++], x = p % w, y = Math.floor(p / w); if (x) enqueue(p - 1); if (x < w - 1) enqueue(p + 1); if (y) enqueue(p - w); if (y < h - 1) enqueue(p + w); }
  }
  let x0 = w, y0 = h, x1 = 0, y1 = 0, hasAlpha = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = d[(y * w + x) * 4 + 3]; if (a < 250) hasAlpha = true;
    if (a > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x0 > x1 || y0 > y1) throw new Error("No logo remains. Reduce the background tolerance or turn removal off.");
  const temp = document.createElement("canvas"); temp.width = w; temp.height = h; temp.getContext("2d")!.putImageData(image, 0, 0);
  const c = document.createElement("canvas"); c.width = x1 - x0 + 9; c.height = y1 - y0 + 9;
  c.getContext("2d")!.drawImage(temp, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 4, 4, x1 - x0 + 1, y1 - y0 + 1);
  return { canvas: c, name, width: source.width, height: source.height, hasAlpha };
}

function simplify(points: number[][], tolerance = .42): number[][] {
  if (points.length < 5) return points;
  const distance = (p: number[], a: number[], b: number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
  };
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; let far = tolerance ** 2, index = -1;
    for (let i = a + 1; i < b; i++) { const d = distance(points[i], points[a], points[b]); if (d > far) { far = d; index = i; } }
    if (index > 0) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function makeShapes(values: number[], w: number, h: number, cutoff: number, unit: number): THREE.Shape[] {
  const polys = contours().size([w, h]).thresholds([cutoff])(values)[0].coordinates;
  const path = (ring: number[][]) => simplify(ring).map(p => new THREE.Vector2((p[0] - w / 2) * unit, (h / 2 - p[1]) * unit));
  return polys.filter(poly => {
    const r = poly[0]; let a = 0; for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1];
    return Math.abs(a) > 3;
  }).slice(0, 1800).map(poly => {
    const shape = new THREE.Shape(path(poly[0]));
    for (const hole of poly.slice(1)) if (hole.length > 3) shape.holes.push(new THREE.Path(path(hole)));
    return shape;
  });
}

export class LogoEngine {
  renderer: THREE.WebGLRenderer | CanvasRenderer; scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 16 / 9, .05, 100);
  group = new THREE.Group(); settings: Settings = DEFAULTS;
  width = 960; height = 540; time = 0; inspect = false;
  yaw = -.42; pitch = .12; texture?: THREE.CanvasTexture;

  constructor(canvas: HTMLCanvasElement) {
    // Test on a separate canvas so a failed GL context cannot lock the fallback
    // display canvas into the wrong context type.
    const probe = document.createElement("canvas");
    let hasGL = false;
    try { const gl = probe.getContext("webgl2"); if (gl) { hasGL = true; gl.getExtension("WEBGL_lose_context")?.loseContext(); } } catch {}
    this.renderer = hasGL
      ? new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" })
      : new CanvasRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.NoToneMapping;
    if (this.renderer instanceof THREE.WebGLRenderer) this.renderer.setClearColor(0x000000, 0);
    this.camera.position.z = 9; this.scene.add(this.group);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x353946, 2.25));
    const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-4, 6, 8); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc5d6ff, 1.9); fill.position.set(5, 1, 3); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 2.4); rim.position.set(-3, -3, -4); this.scene.add(rim);
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height;
    if (this.renderer instanceof THREE.WebGLRenderer) this.renderer.setSize(width, height, false);
    else this.renderer.setSize(width, height);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  clearModel() {
    for (const child of [...this.group.children]) {
      const mesh = child as THREE.Mesh; mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach(m => m?.dispose());
      this.group.remove(child);
    }
    this.texture?.dispose();
  }

  rebuild(logo: LogoImage, s: Settings) {
    this.clearModel(); this.settings = s;
    const trace = document.createElement("canvas"); const factor = Math.min(1, 600 / Math.max(logo.canvas.width, logo.canvas.height));
    trace.width = Math.max(3, Math.round(logo.canvas.width * factor)); trace.height = Math.max(3, Math.round(logo.canvas.height * factor));
    const g = trace.getContext("2d")!; g.drawImage(logo.canvas, 0, 0, trace.width, trace.height);
    const pixels = g.getImageData(0, 0, trace.width, trace.height).data; const mask: number[] = [], bright: number[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255; mask.push(alpha);
      bright.push(alpha > .5 ? (.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]) / 255 : 0);
    }
    const unit = Math.min(6.6 / trace.width, 3.8 / trace.height);
    const modelWidth = trace.width * unit, modelHeight = trace.height * unit;
    this.texture = new THREE.CanvasTexture(logo.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const finish = s.finish === "gloss" ? .24 : s.finish === "matte" ? .95 : .5;
    const build = (shapes: THREE.Shape[], depth: number, z: number, bevel: number) => {
      if (!shapes.length) return;
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth, steps: 1, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 3 });
      const position = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
      for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / modelWidth + .5, position.getY(i) / modelHeight + .5);
      uv.needsUpdate = true;
      const face = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide });
      const edge = new THREE.MeshStandardMaterial({ color: s.edgeColor, roughness: finish, metalness: s.finish === "matte" ? .05 : .4 });
      const mesh = new THREE.Mesh(geometry, [face, edge]); mesh.position.z = z; this.group.add(mesh);
    };
    build(makeShapes(mask, trace.width, trace.height, .5, unit), s.depth, -s.depth / 2, s.bevel);
    if (s.relief > .002) build(makeShapes(bright, trace.width, trace.height, s.threshold, unit), s.relief, s.depth / 2 + .002, Math.min(s.bevel * .5, .009));
    this.render(this.time, s, this.inspect);
  }

  render(t: number, s = this.settings, inspect = false) {
    this.time = t; this.settings = s; this.inspect = inspect; this.group.scale.setScalar(s.size / 100);
    if (inspect) { this.group.position.set(0, 0, 0); this.group.rotation.set(this.pitch, this.yaw, 0); this.group.visible = true; }
    else { const pose = poseAt(t, s); this.group.position.set(pose.x, pose.y, pose.z); this.group.rotation.set(pose.rx, pose.ry, pose.rz); this.group.visible = pose.visible; }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.clearModel(); this.renderer.dispose(); }
}

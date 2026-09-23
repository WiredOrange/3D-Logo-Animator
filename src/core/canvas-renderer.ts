import * as THREE from "three";

type Triangle = { points: number[][]; depth: number; uv?: number[][]; image?: CanvasImageSource; color: string };

// A CPU fallback for browsers without a WebGL context. It projects the same
// extruded mesh, orders its triangles by depth, and maps the original artwork.
export class CanvasRenderer {
  domElement: HTMLCanvasElement;
  capabilities = { getMaxAnisotropy: () => 1 };
  outputColorSpace = THREE.SRGBColorSpace;
  toneMapping = THREE.NoToneMapping;
  isSoftware = true;
  private ctx: CanvasRenderingContext2D;
  private ratio = 1;
  private w = 960;
  private h = 540;
  constructor(canvas: HTMLCanvasElement) {
    this.domElement = canvas;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas rendering unavailable.");
    this.ctx = context;
  }
  setPixelRatio(ratio: number) { this.ratio = Math.min(ratio, 1); }
  getPixelRatio() { return this.ratio; }
  setSize(w: number, h: number) { this.w = w; this.h = h; this.domElement.width = Math.round(w * this.ratio); this.domElement.height = Math.round(h * this.ratio); }
  setClearColor() {}
  dispose() {}

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const ctx = this.ctx, w = this.domElement.width, h = this.domElement.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const triangles: Triangle[] = [];
    const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normal = new THREE.Vector3(), view = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    const key = new THREE.Vector3(-.4, .65, .8).normalize();
    const fill = new THREE.Vector3(.7, -.2, .5).normalize();
    scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      const pos = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
      if (!pos) return;
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
      for (const group of groups) {
        const material = (Array.isArray(object.material) ? object.material[group.materialIndex || 0] : object.material) as THREE.MeshStandardMaterial;
        for (let i = group.start; i < group.start + group.count; i += 3) {
          a.fromBufferAttribute(pos, i).applyMatrix4(object.matrixWorld);
          b.fromBufferAttribute(pos, i + 1).applyMatrix4(object.matrixWorld);
          c.fromBufferAttribute(pos, i + 2).applyMatrix4(object.matrixWorld);
          normal.crossVectors(v1.subVectors(b, a), v2.subVectors(c, a)).normalize();
          view.subVectors(camera.position, a);
          if (normal.dot(view) <= 0) continue;
          if (Math.max(a.z, b.z, c.z) > camera.position.z - .05) continue;
          const points = [a, b, c].map(vertex => { p.copy(vertex).applyMatrix4(projection); return [(p.x + 1) * w / 2, (1 - p.y) * h / 2]; });
          if (points.every(v => v[0] < 0) || points.every(v => v[0] > w) || points.every(v => v[1] < 0) || points.every(v => v[1] > h)) continue;
          const shade = .43 + Math.max(0, normal.dot(key)) * .67 + Math.max(0, normal.dot(fill)) * .31;
          const color = material.color.clone().multiplyScalar(shade).getStyle();
          const t: Triangle = { points, depth: (a.z + b.z + c.z) / 3, color };
          if (material.map?.image && uv) {
            const img = material.map.image as HTMLCanvasElement;
            const coordinates = [i, i + 1, i + 2].map(j => [uv.getX(j) * img.width, (1 - uv.getY(j)) * img.height]);
            const emit = (vertices: THREE.Vector3[], coords: number[][], level: number) => {
              const projected = vertices.map(vertex => { p.copy(vertex).applyMatrix4(projection); return [(p.x + 1) * w / 2, (1 - p.y) * h / 2]; });
              const lengths = projected.map((q, j) => (q[0] - projected[(j + 1) % 3][0]) ** 2 + (q[1] - projected[(j + 1) % 3][1]) ** 2);
              const longest = Math.max(...lengths), e0 = lengths.indexOf(longest), e1 = (e0 + 1) % 3, e2 = (e0 + 2) % 3;
              // Canvas image transforms are affine; subdivision keeps large cap
              // triangles accurate under perspective (especially rectangular logos).
              const varies = Math.max(...vertices.map(v => v.z)) - Math.min(...vertices.map(v => v.z));
              if (longest > 64 ** 2 && level < 10 && varies > .00001) {
                const mid = vertices[e0].clone().add(vertices[e1]).multiplyScalar(.5);
                const midUV = [(coords[e0][0] + coords[e1][0]) / 2, (coords[e0][1] + coords[e1][1]) / 2];
                emit([vertices[e0], mid, vertices[e2]], [coords[e0], midUV, coords[e2]], level + 1);
                emit([mid, vertices[e1], vertices[e2]], [midUV, coords[e1], coords[e2]], level + 1);
              } else triangles.push({ points: projected, depth: (vertices[0].z + vertices[1].z + vertices[2].z) / 3, color, image: img, uv: coords });
            };
            emit([a.clone(), b.clone(), c.clone()], coordinates, 0);
            continue;
          }
          triangles.push(t);
        }
      }
    });
    triangles.sort((a, b) => a.depth - b.depth);
    for (const t of triangles) {
      const [p0, p1, p2] = t.points;
      if (!t.image || !t.uv) {
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
        ctx.fillStyle = t.color; ctx.strokeStyle = t.color; ctx.lineWidth = .65; ctx.fill(); ctx.stroke();
        continue;
      }
      const [[u0, v0], [u1, v1], [u2, v2]] = t.uv;
      const den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
      if (Math.abs(den) < .00001) continue;
      const affine = (axis: number) => [
        (p0[axis] * (v1 - v2) + p1[axis] * (v2 - v0) + p2[axis] * (v0 - v1)) / den,
        (p0[axis] * (u2 - u1) + p1[axis] * (u0 - u2) + p2[axis] * (u1 - u0)) / den,
        (p0[axis] * (u1 * v2 - u2 * v1) + p1[axis] * (u2 * v0 - u0 * v2) + p2[axis] * (u0 * v1 - u1 * v0)) / den,
      ];
      const [ax, cx, ex] = affine(0), [by, dy, fy] = affine(1);
      // A tiny triangle expansion closes antialias seams at internal cap edges.
      const centerX = (p0[0] + p1[0] + p2[0]) / 3, centerY = (p0[1] + p1[1] + p2[1]) / 3;
      const expanded = t.points.map(q => { const dx = q[0] - centerX, dy = q[1] - centerY, len = Math.hypot(dx, dy) || 1; return [q[0] + dx / len * .3, q[1] + dy / len * .3]; });
      ctx.save(); ctx.beginPath(); ctx.moveTo(expanded[0][0], expanded[0][1]); ctx.lineTo(expanded[1][0], expanded[1][1]); ctx.lineTo(expanded[2][0], expanded[2][1]); ctx.closePath(); ctx.clip();
      ctx.setTransform(ax, by, cx, dy, ex, fy); ctx.drawImage(t.image, 0, 0); ctx.restore();
    }
  }
}

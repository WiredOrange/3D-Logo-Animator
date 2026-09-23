// Minimal QuickTime writer. Each sample is a lossless RGBA PNG, so alpha survives
// without relying on a browser video encoder that may discard transparency.
const text = (s: string) => new TextEncoder().encode(s);
const zeros = (n: number) => new Uint8Array(n);
const u32 = (n: number) => { const b = zeros(4); new DataView(b.buffer).setUint32(0, n); return b; };
const u16 = (n: number) => { const b = zeros(2); new DataView(b.buffer).setUint16(0, n); return b; };
const join = (...parts: Uint8Array[]) => {
  const result = zeros(parts.reduce((sum, p) => sum + p.length, 0)); let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.length; } return result;
};
const atom = (name: string, ...parts: Uint8Array[]) => {
  const body = join(...parts); return join(u32(body.length + 8), text(name), body);
};
const matrix = () => join(u32(65536), u32(0), u32(0), u32(0), u32(65536), u32(0), u32(0), u32(0), u32(1073741824));

export function createMov(frames: Uint8Array[], width: number, height: number, fps: number): Blob {
  if (!frames.length || ![30, 60].includes(fps)) throw new Error("No frames to export or invalid frame rate.");
  const count = frames.length;
  const ftyp = atom("ftyp", text("qt  "), u32(0), text("qt  "));
  let offset = ftyp.length + 8; const offsets: Uint8Array[] = [];
  for (const f of frames) { offsets.push(u32(offset)); offset += f.length; }
  if (offset > 0xffffffff) throw new Error("This animation is too large. Reduce its length or resolution.");
  const name = zeros(32); const label = text("PNG with Alpha"); name[0] = label.length; name.set(label, 1);
  const sample = atom("png ", zeros(6), u16(1), u16(0), u16(0), text("appl"), u32(0), u32(512),
    u16(width), u16(height), u32(72 << 16), u32(72 << 16), u32(0), u16(1), name, u16(32), u16(65535));
  const stbl = atom("stbl",
    atom("stsd", u32(0), u32(1), sample),
    atom("stts", u32(0), u32(1), u32(count), u32(1)),
    atom("stsc", u32(0), u32(1), u32(1), u32(1), u32(1)),
    atom("stsz", u32(0), u32(0), u32(count), ...frames.map(f => u32(f.length))),
    atom("stco", u32(0), u32(count), ...offsets));
  const minf = atom("minf", atom("vmhd", u32(1), u16(0), zeros(6)),
    atom("dinf", atom("dref", u32(0), u32(1), atom("url ", u32(1)))), stbl);
  const mdia = atom("mdia",
    atom("mdhd", u32(0), u32(0), u32(0), u32(fps), u32(count), u16(0), u16(0)),
    atom("hdlr", u32(0), text("mhlr"), text("vide"), zeros(12), text("Logo Flight\0")), minf);
  const trak = atom("trak", atom("tkhd", u32(7), u32(0), u32(0), u32(1), u32(0), u32(count), zeros(8),
    u16(0), u16(0), u16(0), u16(0), matrix(), u32(width * 65536), u32(height * 65536)), mdia);
  const moov = atom("moov", atom("mvhd", u32(0), u32(0), u32(0), u32(fps), u32(count), u32(65536), u16(256), zeros(10), matrix(), zeros(24), u32(2)), trak);
  const mdatHeader = join(u32(offset - ftyp.length), text("mdat"));
  return new Blob([ftyp, mdatHeader, ...frames, moov] as BlobPart[], { type: "video/quicktime" });
}

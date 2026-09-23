export type Settings = {
  depth: number; bevel: number; relief: number; threshold: number; edgeColor: string;
  finish: "satin" | "gloss" | "matte"; size: number;
  entry: number; hold: number; exit: number; turn: number; tilt: number;
  direction: "left" | "right"; preset: "broadcast" | "clean" | "spin";
  removeBackground: boolean; tolerance: number; backgroundColor: string;
};

export const DEFAULTS: Settings = {
  depth: 0.22, bevel: 0.015, relief: 0.10, threshold: 0.65,
  edgeColor: "#80848c", finish: "satin", size: 88,
  entry: 1.2, hold: 2.6, exit: 1.0, turn: 62, tilt: 18,
  direction: "left", preset: "broadcast", removeBackground: false, tolerance: 38,
  backgroundColor: "#ffffff",
};

export const PRESETS: Record<Settings["preset"], Partial<Settings>> = {
  broadcast: { preset: "broadcast", entry: 1.2, hold: 2.6, exit: 1, turn: 62, tilt: 18 },
  clean: { preset: "clean", entry: 1.1, hold: 2.6, exit: 0.9, turn: 38, tilt: 0 },
  spin: { preset: "spin", entry: 1.6, hold: 2.6, exit: 1.4, turn: 300, tilt: 12 },
};

export function duration(s: Settings) { return s.entry + s.hold + s.exit; }
export function phaseAt(t: number, s: Settings) { return t < s.entry ? "Fly in" : t <= s.entry + s.hold ? "Hold" : "Fly out"; }
export function poseAt(t: number, s: Settings) {
  const total = duration(s);
  const entry = t < s.entry;
  const holding = t >= s.entry && t <= s.entry + s.hold;
  const p = entry ? Math.max(0, t / s.entry) : Math.min(1, Math.max(0, (t - s.entry - s.hold) / s.exit));
  const movement = holding ? 0 : entry ? Math.pow(1 - p, 3) : Math.pow(p, 3);
  const direction = s.direction === "left" ? -1 : 1;
  const side = entry ? direction : -direction;
  const radians = Math.PI / 180;
  return {
    x: side * 12 * movement ** 3, y: (entry ? -1 : 1) * 2 * movement ** 2, z: 7.3 * movement,
    rx: (entry ? 1 : -1) * 10 * radians * movement,
    ry: side * s.turn * radians * movement, rz: side * s.tilt * radians * movement,
    visible: t > 0 && t < total,
  };
}

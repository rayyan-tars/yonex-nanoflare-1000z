/**
 * Vehicles and people. Cars are drawn for each of the four directions they
 * can drive (front or back facing the viewer), with windows, wheels and
 * lights. People have two walking frames so their legs move.
 */
import { EDGE, P, hex, poly, shade, type Art, type Box, type Ctx } from "./art";

export type Dir = "xp" | "xn" | "yp" | "yn";
export const DIRS: readonly Dir[] = ["xp", "xn", "yp", "yn"];

export const CAR_TYPES = ["sedan-red", "sedan-blue", "sedan-white", "sedan-black", "hatch-silver", "hatch-green", "taxi", "van"] as const;
export type CarType = (typeof CAR_TYPES)[number] | "bus";

interface CarSpec {
  body: number;
  /** Half-length along the road, half-width, in tiles. */
  len: number;
  wid: number;
  /** Body and roof heights (px). */
  bodyZ: number;
  roofZ: number;
  /** Cabin start/end along the car (0 = back, 1 = front). */
  cabin: [number, number];
  taxi?: boolean;
  van?: boolean;
  bus?: boolean;
}

const SPECS: Record<CarType, CarSpec> = {
  "sedan-red": { body: 0xd2433a, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  "sedan-blue": { body: 0x3566a8, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  "sedan-white": { body: 0xeceeef, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  "sedan-black": { body: 0x2c3036, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  "hatch-silver": { body: 0xaab2b8, len: 0.17, wid: 0.1, bodyZ: 5, roofZ: 9.5, cabin: [0.12, 0.66] },
  "hatch-green": { body: 0x4f9a5a, len: 0.17, wid: 0.1, bodyZ: 5, roofZ: 9.5, cabin: [0.12, 0.66] },
  taxi: { body: 0xf2c230, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72], taxi: true },
  van: { body: 0xf4f4f2, len: 0.22, wid: 0.11, bodyZ: 6, roofZ: 12, cabin: [0.02, 0.8], van: true },
  bus: { body: 0x2f9e5a, len: 0.38, wid: 0.12, bodyZ: 6, roofZ: 14, cabin: [0.02, 0.98], bus: true },
};

/** A point on the car: `t` along it (0 back .. 1 front), `s` across (-1..1), at height z. */
function carPoint(spec: CarSpec, dir: Dir, t: number, s: number, z: number) {
  const along = (t * 2 - 1) * spec.len * (dir.endsWith("p") ? 1 : -1);
  const across = s * spec.wid;
  return dir.startsWith("x") ? P(along, across, z) : P(across, along, z);
}

function carBox(spec: CarSpec, dir: Dir, t0: number, t1: number, s: number, z0: number, z1: number): Box {
  const a = (t0 * 2 - 1) * spec.len * (dir.endsWith("p") ? 1 : -1);
  const b = (t1 * 2 - 1) * spec.len * (dir.endsWith("p") ? 1 : -1);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const w = s * spec.wid;
  return dir.startsWith("x") ? { x0: lo, x1: hi, y0: -w, y1: w, z0, z1 } : { x0: -w, x1: w, y0: lo, y1: hi, z0, z1 };
}

function drawCar(ctx: Ctx, type: CarType, dir: Dir) {
  const spec = SPECS[type];
  const fwd = dir.endsWith("p");
  // Shadow.
  ctx.beginPath();
  ctx.ellipse(0, 1.5, spec.len * 46, spec.len * 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();
  // Lower body.
  const body = carBox(spec, dir, 0, 1, 1, 1.6, spec.bodyZ);
  prismFaces(ctx, body, spec.body);
  // Wheels on the visible side.
  // The +y side (cars along x) or +x side (cars along y) faces the viewer.
  const side = 1;
  for (const t of spec.bus ? [0.15, 0.85] : [0.2, 0.8]) {
    const c = carPoint(spec, dir, t, side, 1.6);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 2.2, 1.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1e21";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 0.9, 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#9aa0a6";
    ctx.fill();
  }
  // Cabin.
  const [c0, c1] = spec.cabin;
  const cabin = carBox(spec, dir, c0, c1, spec.bus || spec.van ? 1 : 0.86, spec.bodyZ, spec.roofZ);
  prismFaces(ctx, cabin, spec.bus || spec.van ? spec.body : shade(spec.body, 1.02));
  // Windows: side strip, plus windscreen or rear window on the end face.
  const glass = "rgba(40,60,80,0.85)";
  const shine = "rgba(190,225,245,0.55)";
  const zg0 = spec.bodyZ + 0.8;
  const zg1 = spec.roofZ - (spec.bus ? 1.6 : 1);
  if (spec.bus) {
    for (let k = 0; k < 6; k++) sidePane(ctx, spec, dir, 0.08 + k * 0.145, 0.2 + k * 0.145, zg0, zg1, glass);
    // Stripe and destination sign.
    sidePane(ctx, spec, dir, 0.02, 0.98, spec.bodyZ - 1.4, spec.bodyZ - 0.6, "rgba(255,255,255,0.75)");
  } else if (spec.van) {
    sidePane(ctx, spec, dir, 0.62, 0.78, zg0, zg1, glass);
    sidePane(ctx, spec, dir, 0.05, 0.6, spec.bodyZ + 1.2, spec.bodyZ + 3.2, hex(0x2f9e5a, 0.9));
  } else {
    sidePane(ctx, spec, dir, c0 + 0.04, (c0 + c1) / 2 - 0.01, zg0, zg1, glass);
    sidePane(ctx, spec, dir, (c0 + c1) / 2 + 0.01, c1 - 0.04, zg0, zg1, glass);
    sidePane(ctx, spec, dir, c0 + 0.06, c0 + 0.12, zg0 + 0.4, zg1 - 0.4, shine);
  }
  // The visible end is the +x (or +y) end; it is the car's front when driving that way.
  const visEnd = (s0: number, s1: number, z0: number, z1: number, fill: string, cabinEnd = false) => {
    const t = fwd ? (cabinEnd ? c1 : 1) : cabinEnd ? c0 : 0;
    poly(ctx, [carPoint(spec, dir, t, s0, z1), carPoint(spec, dir, t, s1, z1), carPoint(spec, dir, t, s1, z0), carPoint(spec, dir, t, s0, z0)], fill);
  };
  if (fwd) {
    visEnd(-0.8, -0.35, 2.8, 4.2, "#fff6c8");
    visEnd(0.35, 0.8, 2.8, 4.2, "#fff6c8");
    visEnd(-0.25, 0.25, 2.4, 3.8, "rgba(30,30,30,0.55)");
    if (!spec.bus) visEnd(-0.75, 0.75, zg0, zg1, glass, true);
  } else {
    visEnd(-0.85, -0.45, 3, 4.2, "#d2302a");
    visEnd(0.45, 0.85, 3, 4.2, "#d2302a");
    if (!spec.van && !spec.bus) visEnd(-0.7, 0.7, zg0, zg1 - 0.5, glass, true);
  }
  // Roof details.
  if (spec.taxi) {
    const r = carBox(spec, dir, 0.42, 0.58, 0.35, spec.roofZ, spec.roofZ + 2.2);
    prismFaces(ctx, r, 0x222222);
  }
  if (spec.bus) {
    const sign = carPoint(spec, dir, fwd ? 0.98 : 0.02, 0, spec.roofZ - 1);
    ctx.fillStyle = "#ffb000";
    ctx.fillRect(sign.x - 2.5, sign.y - 1, 5, 1.6);
  }
}

/** A box with its top and the two faces toward the viewer. */
function prismFaces(ctx: Ctx, b: Box, color: number) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  poly(ctx, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], hex(shade(color, 0.88)), EDGE, 0.5);
  poly(ctx, [P(x1, y1, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0)], hex(shade(color, 0.72)), EDGE, 0.5);
  poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], hex(shade(color, 1.12)), EDGE, 0.5);
}

/** A pane on the side of the car that faces the viewer, between `t0..t1` along it. */
function sidePane(ctx: Ctx, spec: CarSpec, dir: Dir, t0: number, t1: number, z0: number, z1: number, fill: string) {
  const a0 = carPoint(spec, dir, t0, 1, z1);
  const a1 = carPoint(spec, dir, t1, 1, z1);
  const b1 = carPoint(spec, dir, t1, 1, z0);
  const b0 = carPoint(spec, dir, t0, 1, z0);
  poly(ctx, [a0, a1, b1, b0], fill);
}

interface Look {
  skin: string;
  hair: string;
  top: string;
  legs: string;
  kid?: boolean;
  bag?: string;
}

export const LOOKS: readonly Look[] = [
  { skin: "#f2c9a0", hair: "#5a3a22", top: "#e05a47", legs: "#2f4a6b" },
  { skin: "#c68b5e", hair: "#1e1a18", top: "#3f7fd6", legs: "#3a3a3a" },
  { skin: "#8d5a3b", hair: "#141210", top: "#f2c230", legs: "#2f4a6b" },
  { skin: "#f6d4b4", hair: "#d8b25a", top: "#4cae4c", legs: "#5a4a3a" },
  { skin: "#e3b08a", hair: "#7a4a2a", top: "#8e6fd8", legs: "#2c2c34" },
  { skin: "#a8714d", hair: "#2a2522", top: "#ffffff", legs: "#4a6a8a" },
  { skin: "#f2c9a0", hair: "#b0b0b0", top: "#6f8a7c", legs: "#3a3a3a" },
  { skin: "#c68b5e", hair: "#1e1a18", top: "#f08a3c", legs: "#2f4a6b" },
  { skin: "#f6d4b4", hair: "#a0522d", top: "#f28fb0", legs: "#3a4a6a", kid: true, bag: "#3f7fd6" },
  { skin: "#8d5a3b", hair: "#141210", top: "#5fcfe0", legs: "#2f4a6b", kid: true, bag: "#e05a47" },
  { skin: "#e3b08a", hair: "#5a3a22", top: "#ffd24a", legs: "#3a3a3a", kid: true, bag: "#4cae4c" },
];

function drawPerson(ctx: Ctx, look: Look, frame: 0 | 1) {
  const k = look.kid ? 0.72 : 1;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 3.6, 1.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();
  // Legs (apart on frame 0, together on frame 1).
  ctx.strokeStyle = look.legs;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6;
  const spread = frame === 0 ? 1.4 : 0.3;
  ctx.beginPath();
  ctx.moveTo(-0.6, -6);
  ctx.lineTo(-0.6 - spread, 0);
  ctx.moveTo(0.6, -6);
  ctx.lineTo(0.6 + spread * 0.6, 0);
  ctx.stroke();
  // Body and arms.
  ctx.fillStyle = look.top;
  ctx.beginPath();
  ctx.moveTo(-2, -11);
  ctx.quadraticCurveTo(0, -12.2, 2, -11);
  ctx.lineTo(1.9, -5.6);
  ctx.lineTo(-1.9, -5.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = look.top;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-1.8, -10.5);
  ctx.lineTo(-2.4 - (frame === 0 ? 0.8 : 0), -6.5);
  ctx.moveTo(1.8, -10.5);
  ctx.lineTo(2.4 + (frame === 0 ? 0 : 0.8), -6.5);
  ctx.stroke();
  if (look.bag) {
    ctx.fillStyle = look.bag;
    ctx.fillRect(-3.2, -10.6, 1.6, 3.6);
  }
  // Head and hair.
  ctx.beginPath();
  ctx.arc(0, -13.6, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -14.2, 2.4, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineTo(2.3, -13.4);
  ctx.fillStyle = look.hair;
  ctx.fill();
  ctx.restore();
}

function drawCyclist(ctx: Ctx, look: Look, frame: 0 | 1) {
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 5, 1.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fill();
  ctx.strokeStyle = "#2b2f36";
  ctx.lineWidth = 0.8;
  for (const x of [-3.6, 3.6]) {
    ctx.beginPath();
    ctx.ellipse(x, -2.2, 2.2, 2.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2f9e5a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3.6, -2.2);
  ctx.lineTo(-0.8, -5.6);
  ctx.lineTo(2.6, -5.6);
  ctx.lineTo(3.6, -2.2);
  ctx.moveTo(-0.8, -5.6);
  ctx.lineTo(0, -2.2);
  ctx.lineTo(2.6, -5.6);
  ctx.stroke();
  // Rider.
  ctx.strokeStyle = look.legs;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-0.6, -7.6);
  ctx.lineTo(frame ? 0.8 : -0.4, -3.6);
  ctx.stroke();
  ctx.fillStyle = look.top;
  ctx.beginPath();
  ctx.moveTo(-1.6, -7.4);
  ctx.lineTo(0.8, -12);
  ctx.lineTo(2.6, -11.2);
  ctx.lineTo(0.8, -7.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = look.top;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(1.8, -11);
  ctx.lineTo(3, -7.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2.2, -13.8, 2.1, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(2.2, -14.4, 2.3, Math.PI, Math.PI * 2);
  ctx.fillStyle = "#3f7fd6";
  ctx.fill();
}

export function drawAgents(art: Art) {
  for (const type of [...CAR_TYPES, "bus"] as CarType[])
    for (const dir of DIRS) art.obj(`v-${type}-${dir}`, 26, (ctx) => drawCar(ctx, type, dir), type === "bus" ? 1.3 : 1);
  LOOKS.forEach((look, i) => {
    for (const f of [0, 1] as const) {
      art.bake(`p-${i}-${f}`, 14, 20, 7, 17, (ctx) => drawPerson(ctx, look, f));
      if (!look.kid) art.bake(`c-${i}-${f}`, 16, 20, 8, 17, (ctx) => drawCyclist(ctx, look, f));
    }
  });
  // Car headlights at night.
  art.bake("fx-beam", 30, 16, 15, 8, (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
    g.addColorStop(0, "rgba(255,240,190,0.9)");
    g.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

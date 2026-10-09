// Sprite baking and static campus art. People, cars, cyclists, trees and the
// face-shading style are ported from Greenhold so the two builds share a look.

import {
  type Ctx,
  EDGE,
  blob,
  box,
  faceX,
  faceY,
  flat,
  iso,
  poly,
  rgba,
  rng,
  shade,
  type Pt,
} from "./iso";
import {
  ACADEMIC,
  APRON,
  BAYS,
  BIKE_LANE,
  CAFETERIA,
  CANOPY,
  CARPARK,
  COURT,
  COURTYARD,
  FOOTPATH,
  GATE_PATH,
  GX,
  GY,
  PLANTER,
  RACKS,
  ROAD,
  SLAB_DEPTH,
  TERRACE,
  BENCHES,
  type Rect,
} from "./campus";
import { has, hasId, type Placement } from "./model";

export type Era = "today" | "future";

export type Sprite = { c: HTMLCanvasElement; ox: number; oy: number; w: number; h: number };

const SPR = 3;

export function bake(w: number, h: number, ox: number, oy: number, fn: (c: Ctx) => void): Sprite {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * SPR);
  c.height = Math.ceil(h * SPR);
  const g = c.getContext("2d")!;
  g.scale(SPR, SPR);
  g.translate(ox, oy);
  g.lineJoin = "round";
  fn(g);
  return { c, ox, oy, w, h };
}

export function drawSprite(c: Ctx, s: Sprite, x: number, y: number, flip = false, alpha = 1) {
  if (alpha <= 0) return;
  const prev = c.globalAlpha;
  if (alpha < 1) c.globalAlpha = prev * alpha;
  if (flip) {
    c.save();
    c.translate(x, y);
    c.scale(-1, 1);
    c.drawImage(s.c, -s.ox, -s.oy, s.w, s.h);
    c.restore();
  } else c.drawImage(s.c, x - s.ox, y - s.oy, s.w, s.h);
  if (alpha < 1) c.globalAlpha = prev;
}

// ------------------------------------------------------------------ people (Greenhold zw / Hw)

export type Look = { skin: string; hair: string; top: string; legs: string; bag?: string; adult?: boolean };

export const LOOKS: Look[] = [
  { skin: "#f2c9a0", hair: "#5a3a22", top: "#e05a47", legs: "#2f4a6b", bag: "#3f7fd6" },
  { skin: "#c68b5e", hair: "#1e1a18", top: "#3f7fd6", legs: "#3a3a3a", bag: "#f2c230" },
  { skin: "#8d5a3b", hair: "#141210", top: "#f2c230", legs: "#2f4a6b", bag: "#2f8f86" },
  { skin: "#f6d4b4", hair: "#d8b25a", top: "#4cae4c", legs: "#5a4a3a", bag: "#e05a47" },
  { skin: "#e3b08a", hair: "#7a4a2a", top: "#8e6fd8", legs: "#2c2c34", bag: "#ffd24a" },
  { skin: "#a8714d", hair: "#2a2522", top: "#ffffff", legs: "#4a6a8a", bag: "#e05a47" },
  { skin: "#c68b5e", hair: "#1e1a18", top: "#f08a3c", legs: "#2f4a6b", bag: "#3f7fd6" },
  { skin: "#f6d4b4", hair: "#a0522d", top: "#f28fb0", legs: "#3a4a6a", bag: "#4cae4c" },
  { skin: "#8d5a3b", hair: "#141210", top: "#5fcfe0", legs: "#2f4a6b", bag: "#e05a47" },
  { skin: "#e3b08a", hair: "#5a3a22", top: "#2f8f86", legs: "#3a3a3a", bag: "#f2c230" },
  { skin: "#f2c9a0", hair: "#b0b0b0", top: "#6f8a7c", legs: "#3a3a3a", adult: true },
];

function drawPerson(e: Ctx, s: Look, frame: number, sit = false) {
  const k = s.adult ? 1 : 0.88;
  e.save();
  e.scale(k, k);
  e.beginPath();
  e.ellipse(0, 0.6, 3.6, 1.4, 0, 0, Math.PI * 2);
  e.fillStyle = "rgba(0,0,0,0.22)";
  e.fill();
  if (sit) e.translate(0, 3);
  e.strokeStyle = s.legs;
  e.lineCap = "round";
  e.lineWidth = 1.6;
  e.beginPath();
  if (sit) {
    e.moveTo(-0.6, -6);
    e.lineTo(1.8, -4.4);
    e.lineTo(2.0, -1.6);
    e.moveTo(0.6, -6);
    e.lineTo(2.8, -4.6);
    e.lineTo(3.0, -1.8);
  } else {
    const u = frame === 0 ? 1.4 : 0.3;
    e.moveTo(-0.6, -6);
    e.lineTo(-0.6 - u, 0);
    e.moveTo(0.6, -6);
    e.lineTo(0.6 + u * 0.6, 0);
  }
  e.stroke();
  e.fillStyle = s.top;
  e.beginPath();
  e.moveTo(-2, -11);
  e.quadraticCurveTo(0, -12.2, 2, -11);
  e.lineTo(1.9, -5.6);
  e.lineTo(-1.9, -5.6);
  e.closePath();
  e.fill();
  e.strokeStyle = s.top;
  e.lineWidth = 1.2;
  e.beginPath();
  e.moveTo(-1.8, -10.5);
  e.lineTo(-2.4 - (frame === 0 && !sit ? 0.8 : 0), -6.5);
  e.moveTo(1.8, -10.5);
  e.lineTo(2.4 + (frame === 0 || sit ? 0 : 0.8), -6.5);
  e.stroke();
  if (s.bag) {
    e.fillStyle = s.bag;
    e.fillRect(-3.4, -10.8, 1.8, 4);
  }
  e.beginPath();
  e.arc(0, -13.6, 2.3, 0, Math.PI * 2);
  e.fillStyle = s.skin;
  e.fill();
  e.beginPath();
  e.arc(0, -14.2, 2.4, Math.PI * 1.05, Math.PI * 1.95);
  e.lineTo(2.3, -13.4);
  e.fillStyle = s.hair;
  e.fill();
  e.restore();
}

function drawCyclist(e: Ctx, s: Look, frame: number) {
  e.beginPath();
  e.ellipse(0, 0.6, 5, 1.6, 0, 0, Math.PI * 2);
  e.fillStyle = "rgba(0,0,0,0.2)";
  e.fill();
  e.strokeStyle = "#2b2f36";
  e.lineWidth = 0.8;
  for (const i of [-3.6, 3.6]) {
    e.beginPath();
    e.ellipse(i, -2.2, 2.2, 2.2, 0, 0, Math.PI * 2);
    e.stroke();
  }
  e.strokeStyle = "#2f9e5a";
  e.lineWidth = 1;
  e.beginPath();
  e.moveTo(-3.6, -2.2);
  e.lineTo(-0.8, -5.6);
  e.lineTo(2.6, -5.6);
  e.lineTo(3.6, -2.2);
  e.moveTo(-0.8, -5.6);
  e.lineTo(0, -2.2);
  e.lineTo(2.6, -5.6);
  e.stroke();
  e.strokeStyle = s.legs;
  e.lineWidth = 1.4;
  e.lineCap = "round";
  e.beginPath();
  e.moveTo(-0.6, -7.6);
  e.lineTo(frame ? 0.8 : -0.4, -3.6);
  e.stroke();
  e.fillStyle = s.top;
  e.beginPath();
  e.moveTo(-1.6, -7.4);
  e.lineTo(0.8, -12);
  e.lineTo(2.6, -11.2);
  e.lineTo(0.8, -7.2);
  e.closePath();
  e.fill();
  e.strokeStyle = s.top;
  e.lineWidth = 1.1;
  e.beginPath();
  e.moveTo(1.8, -11);
  e.lineTo(3, -7.4);
  e.stroke();
  if (s.bag) {
    e.fillStyle = s.bag;
    e.fillRect(-1.6, -12, 1.8, 3.6);
  }
  e.beginPath();
  e.arc(2.2, -13.8, 2.1, 0, Math.PI * 2);
  e.fillStyle = s.skin;
  e.fill();
  e.beginPath();
  e.arc(2.2, -14.4, 2.3, Math.PI, Math.PI * 2);
  e.fillStyle = "#3f7fd6";
  e.fill();
}

// ------------------------------------------------------------------ cars (Greenhold Uw)

type CarSpec = { body: number; len: number; wid: number; bodyZ: number; roofZ: number; cabin: [number, number]; van?: boolean };

export const CARS: CarSpec[] = [
  { body: 0xd2433a, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  { body: 0x3566a8, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  { body: 0xeceeef, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  { body: 0x2c3036, len: 0.2, wid: 0.1, bodyZ: 5, roofZ: 9, cabin: [0.28, 0.72] },
  { body: 0xaab2b8, len: 0.17, wid: 0.1, bodyZ: 5, roofZ: 9.5, cabin: [0.12, 0.66] },
  { body: 0xf4f2ea, len: 0.22, wid: 0.11, bodyZ: 6, roofZ: 12, cabin: [0.02, 0.8], van: true },
];

type Dir = "xp" | "xn";

function hn(e: CarSpec, s: Dir, t: number, i: number, u: number) {
  const n = (t * 2 - 1) * e.len * (s === "xp" ? 1 : -1);
  return iso(n, i * e.wid, u);
}
function carBox(e: CarSpec, s: Dir, t: number, i: number, u: number, n: number, r: number) {
  const o = (t * 2 - 1) * e.len * (s === "xp" ? 1 : -1);
  const a = (i * 2 - 1) * e.len * (s === "xp" ? 1 : -1);
  const f = u * e.wid;
  return { x0: Math.min(o, a), x1: Math.max(o, a), y0: -f, y1: f, z0: n, z1: r };
}
function carFaces(c: Ctx, b: ReturnType<typeof carBox>, col: number) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  poly(c, [iso(x0, y1, z1), iso(x1, y1, z1), iso(x1, y1, z0), iso(x0, y1, z0)], rgba(shade(col, 0.88)), EDGE, 0.5);
  poly(c, [iso(x1, y1, z1), iso(x1, y0, z1), iso(x1, y0, z0), iso(x1, y1, z0)], rgba(shade(col, 0.72)), EDGE, 0.5);
  poly(c, [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], rgba(shade(col, 1.12)), EDGE, 0.5);
}

function drawCar(c: Ctx, spec: CarSpec, dir: Dir) {
  const fwd = dir === "xp";
  c.beginPath();
  c.ellipse(0, 1.5, spec.len * 46, spec.len * 20, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.fill();
  carFaces(c, carBox(spec, dir, 0, 1, 1, 1.6, spec.bodyZ), spec.body);
  for (const t of [0.2, 0.8]) {
    const v = hn(spec, dir, t, 1, 1.6);
    c.beginPath();
    c.ellipse(v.x, v.y, 2.2, 1.9, 0, 0, Math.PI * 2);
    c.fillStyle = "#1c1e21";
    c.fill();
    c.beginPath();
    c.ellipse(v.x, v.y, 0.9, 0.8, 0, 0, Math.PI * 2);
    c.fillStyle = "#9aa0a6";
    c.fill();
  }
  const [o, a] = spec.cabin;
  carFaces(c, carBox(spec, dir, o, a, spec.van ? 1 : 0.86, spec.bodyZ, spec.roofZ), spec.van ? spec.body : shade(spec.body, 1.02));
  const glass = "rgba(40,60,80,0.85)";
  const d = spec.bodyZ + 0.8;
  const m = spec.roofZ - 1;
  const win = (t0: number, t1: number, z0: number, z1: number, fill: string) =>
    poly(c, [hn(spec, dir, t0, 1, z1), hn(spec, dir, t1, 1, z1), hn(spec, dir, t1, 1, z0), hn(spec, dir, t0, 1, z0)], fill);
  if (spec.van) {
    win(0.62, 0.78, d, m, glass);
  } else {
    win(o + 0.04, (o + a) / 2 - 0.01, d, m, glass);
    win((o + a) / 2 + 0.01, a - 0.04, d, m, glass);
  }
  const end = (i0: number, i1: number, z0: number, z1: number, fill: string, cab = false) => {
    const T = fwd ? (cab ? a : 1) : cab ? o : 0;
    poly(c, [hn(spec, dir, T, i0, z1), hn(spec, dir, T, i1, z1), hn(spec, dir, T, i1, z0), hn(spec, dir, T, i0, z0)], fill);
  };
  if (fwd) {
    end(-0.8, -0.35, 2.8, 4.2, "#fff6c8");
    end(0.35, 0.8, 2.8, 4.2, "#fff6c8");
    end(-0.75, 0.75, d, m, glass, true);
  } else {
    end(-0.85, -0.45, 3, 4.2, "#d2302a");
    end(0.45, 0.85, 3, 4.2, "#d2302a");
    if (!spec.van) end(-0.7, 0.7, d, m - 0.5, glass, true);
  }
}

// ------------------------------------------------------------------ trees

export type TreeKind = "sapling" | "young" | "medium" | "mature" | "grand";

const TREE_SIZE: Record<TreeKind, { trunk: number; tw: number; r: number; spread: number; lift: number }> = {
  sapling: { trunk: 8, tw: 1.2, r: 3.4, spread: 2.4, lift: 0 },
  young: { trunk: 10, tw: 1.6, r: 4.6, spread: 3.6, lift: 2 },
  medium: { trunk: 13, tw: 2.4, r: 8, spread: 7, lift: 4 },
  mature: { trunk: 18, tw: 3.2, r: 14, spread: 14, lift: 7 },
  grand: { trunk: 20, tw: 3.6, r: 16, spread: 17, lift: 8 },
};

export const TREE_SHADOW: Record<TreeKind, [number, number]> = {
  sapling: [4, 2],
  young: [6, 3],
  medium: [16, 8],
  mature: [36, 18],
  grand: [42, 21],
};

function drawTree(c: Ctx, kind: TreeKind, color: number, seed: number) {
  const s = TREE_SIZE[kind];
  const R = rng(seed);
  c.fillStyle = "#7a5232";
  c.fillRect(-s.tw / 2, -s.trunk, s.tw, s.trunk + 0.5);
  c.fillStyle = "rgba(0,0,0,0.18)";
  c.fillRect(s.tw * 0.1, -s.trunk, s.tw * 0.4, s.trunk);
  if (kind === "sapling" || kind === "young") {
    // timber stake + tie, as for newly planted trees
    c.fillStyle = "#c9a26a";
    c.fillRect(s.tw / 2 + 1, -s.trunk - 1, 0.9, s.trunk + 1);
    c.fillStyle = "#4b6a3a";
    c.fillRect(-s.tw / 2, -s.trunk * 0.6, s.tw + 2, 0.8);
  }
  const top = -s.trunk - s.r * 0.6 - s.lift;
  const puffs: [number, number, number][] = [
    [-s.spread * 0.7, top + s.r * 0.35, s.r * 0.8],
    [s.spread * 0.7, top + s.r * 0.3, s.r * 0.82],
    [0, top - s.r * 0.35, s.r * 0.95],
    [0, top + s.r * 0.25, s.r * 0.9],
  ];
  if (kind === "mature" || kind === "grand") {
    puffs.push([-s.spread, top + s.r * 0.6, s.r * 0.6], [s.spread * 1.02, top + s.r * 0.55, s.r * 0.62]);
  }
  for (const [x, y, r] of puffs) blob(c, x + (R() - 0.5) * 1.5, y, r, color);
  blob(c, -s.r * 0.35, top - s.r * 0.5, s.r * 0.35, shade(color, 1.18), 1.15);
}

// ------------------------------------------------------------------ small props

function drawBench(c: Ctx) {
  box(c, { x0: -0.2, x1: 0.2, y0: -0.04, y1: 0.04, z0: 3, z1: 4.2 }, 0x9a6b3f);
  box(c, { x0: -0.2, x1: 0.2, y0: -0.07, y1: -0.04, z0: 4.2, z1: 8 }, 0x8a5e33);
  for (const i of [-0.16, 0.16]) box(c, { x0: i - 0.012, x1: i + 0.012, y0: -0.03, y1: 0.03, z0: 0, z1: 3 }, 0x3a4048);
}

function drawFence(c: Ctx, len: number) {
  box(c, { x0: 0, x1: len, y0: -0.035, y1: 0.035, z0: 0, z1: 2.4 }, 0xbdb6a8, { edge: "rgba(40,30,25,0.25)" });
  c.strokeStyle = "#2f4f45";
  c.lineWidth = 0.7;
  for (let x = 0.05; x <= len; x += 0.125) {
    const a = iso(x, 0, 2.4);
    const b = iso(x, 0, 9);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.lineWidth = 1.1;
  for (const z of [4, 9]) {
    const a = iso(0, 0, z);
    const b = iso(len, 0, z);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
}

function drawParkedBike(c: Ctx, p: Pt, frame: number) {
  c.strokeStyle = "#2b2f36";
  c.lineWidth = 0.7;
  c.beginPath();
  c.ellipse(p.x - 2.5, p.y - 2, 2, 2, 0, 0, Math.PI * 2);
  c.ellipse(p.x + 2.5, p.y - 2, 2, 2, 0, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = ["#2f9e5a", "#3f7fd6", "#e05a47", "#f2b630"][frame % 4];
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(p.x - 2.5, p.y - 2);
  c.lineTo(p.x - 0.5, p.y - 5);
  c.lineTo(p.x + 2, p.y - 5);
  c.lineTo(p.x + 2.5, p.y - 2);
  c.stroke();
}

// ------------------------------------------------------------------ sprite registry

export type Sprites = {
  walk: Sprite[][]; // [look][frame]
  sit: Sprite[];
  cyclist: Sprite[][];
  car: Record<Dir, Sprite[]>;
  tree: (kind: TreeKind, variant: number) => Sprite;
  bench: Sprite;
  fence: Sprite;
  puff: Sprite;
  shimmer: Sprite;
};

const TREE_COLORS = [0x5c9e45, 0x4f9a4a, 0x67a64a];

export function makeSprites(): Sprites {
  const walk = LOOKS.map((l) => [0, 1].map((f) => bake(16, 22, 8, 18, (g) => drawPerson(g, l, f))));
  const sit = LOOKS.map((l) => bake(16, 22, 8, 18, (g) => drawPerson(g, l, 1, true)));
  const cyclist = LOOKS.map((l) => [0, 1].map((f) => bake(16, 22, 8, 18, (g) => drawCyclist(g, l, f))));
  const car = {
    xp: CARS.map((s) => bake(34, 26, 17, 16, (g) => drawCar(g, s, "xp"))),
    xn: CARS.map((s) => bake(34, 26, 17, 16, (g) => drawCar(g, s, "xn"))),
  };
  const treeCache = new Map<string, Sprite>();
  const tree = (kind: TreeKind, variant: number) => {
    const key = `${kind}-${variant % 3}`;
    let s = treeCache.get(key);
    if (!s) {
      const sz = TREE_SIZE[kind];
      const w = sz.spread * 2 + sz.r * 2 + 6;
      const h = sz.trunk + sz.r * 2.4 + sz.lift + 6;
      s = bake(w, h, w / 2, h - 2, (g) => drawTree(g, kind, TREE_COLORS[variant % 3], 7 + variant * 13));
      treeCache.set(key, s);
    }
    return s;
  };
  const bench = bake(30, 20, 15, 13, drawBench);
  const fence = bake(72, 48, 6, 40, (g) => drawFence(g, 1));
  const puff = bake(24, 24, 12, 12, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 11);
    gr.addColorStop(0, "rgba(120,120,125,0.55)");
    gr.addColorStop(1, "rgba(120,120,125,0)");
    g.fillStyle = gr;
    g.fillRect(-12, -12, 24, 24);
  });
  // Greenhold's heat shimmer sprite
  const shimmer = bake(44, 18, 22, 14, (g) => {
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.1;
    for (let u = 0; u < 3; u++) {
      g.beginPath();
      for (let n = -18; n <= 18; n += 2) {
        const r = -3 - u * 4 + Math.sin(n / 3 + u * 1.7) * 1.2;
        if (n === -18) g.moveTo(n, r);
        else g.lineTo(n, r);
      }
      g.globalAlpha = 0.9 - u * 0.25;
      g.stroke();
    }
    g.globalAlpha = 1;
  });
  return { walk, sit, cyclist, car, tree, bench, fence, puff, shimmer };
}

// ------------------------------------------------------------------ ground

const GRASS = 0x8dc85b;

function rectPoly(r: Rect, z = 0) {
  return [iso(r.x0, r.y0, z), iso(r.x1, r.y0, z), iso(r.x1, r.y1, z), iso(r.x0, r.y1, z)];
}

function line(c: Ctx, a: Pt, b: Pt, color: string, w: number) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
}

function isoEllipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, z = 0) {
  c.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const p = iso(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z);
    if (i) c.lineTo(p.x, p.y);
    else c.moveTo(p.x, p.y);
  }
  c.closePath();
}

function drawSlab(c: Ctx) {
  // Greenhold diorama edges: soil strata below the ground plane.
  poly(c, [iso(0, GY), iso(GX, GY), iso(GX, GY, -SLAB_DEPTH), iso(0, GY, -SLAB_DEPTH)], rgba(0x8f6740));
  poly(c, [iso(GX, 0), iso(GX, GY), iso(GX, GY, -SLAB_DEPTH), iso(GX, 0, -SLAB_DEPTH)], rgba(0x7a5634));
  for (let i = 1; i < 3; i++) {
    const z = -i * 11;
    poly(c, [iso(0, GY, z), iso(GX, GY, z), iso(GX, GY, z - 2), iso(0, GY, z - 2)], "rgba(60,35,20,0.22)");
    poly(c, [iso(GX, 0, z), iso(GX, GY, z), iso(GX, GY, z - 2), iso(GX, 0, z - 2)], "rgba(50,30,15,0.22)");
  }
  poly(c, [iso(0, GY), iso(GX, GY), iso(GX, GY, -4), iso(0, GY, -4)], rgba(0x464b50));
  poly(c, [iso(GX, 0), iso(GX, ROAD.y0), iso(GX, ROAD.y0, -4), iso(GX, 0, -4)], rgba(0x5f8f3e));
  poly(c, [iso(GX, ROAD.y0), iso(GX, GY), iso(GX, GY, -4), iso(GX, ROAD.y0, -4)], rgba(0x3e4246));
}

function drawGrass(c: Ctx) {
  flat(c, 0, 0, GX, GY, rgba(GRASS));
  const R = rng(11);
  for (let i = 0; i < 900; i++) {
    const p = iso(R() * GX, R() * 12);
    c.fillStyle = rgba(shade(GRASS, R() < 0.5 ? 0.88 : 1.1), 0.9);
    c.fillRect(p.x, p.y, 1.6, 1.2);
  }
}

function paving(c: Ctx, r: Rect, color: number, step = 0.5, lineCol = "rgba(140,125,100,0.28)") {
  poly(c, rectPoly(r), rgba(color));
  c.lineWidth = 0.6;
  c.strokeStyle = lineCol;
  c.beginPath();
  for (let x = Math.ceil(r.x0 / step) * step; x < r.x1; x += step) {
    const a = iso(x, r.y0);
    const b = iso(x, r.y1);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  for (let y = Math.ceil(r.y0 / step) * step; y < r.y1; y += step) {
    const a = iso(r.x0, y);
    const b = iso(r.x1, y);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  c.stroke();
}

function drawCourt(c: Ctx) {
  poly(c, rectPoly(COURT), rgba(0x6aa486));
  const inner: Rect = { x0: COURT.x0 + 0.35, x1: COURT.x1 - 0.35, y0: COURT.y0 + 0.35, y1: COURT.y1 - 0.35 };
  poly(c, rectPoly(inner), rgba(0x4b84b0));
  const w = "rgba(255,255,255,0.85)";
  c.lineWidth = 0.9;
  c.strokeStyle = w;
  const p = rectPoly(inner);
  c.beginPath();
  p.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
  c.closePath();
  c.stroke();
  const my = (inner.y0 + inner.y1) / 2;
  line(c, iso(inner.x0, my), iso(inner.x1, my), w, 0.9);
  const mx = (inner.x0 + inner.x1) / 2;
  isoEllipse(c, mx, my, 0.55, 0.55);
  c.stroke();
  for (const y of [inner.y0, inner.y1]) {
    const dy = y === inner.y0 ? 1 : -1;
    const a = iso(mx - 0.6, y);
    const b = iso(mx - 0.6, y + dy * 1.0);
    const d = iso(mx + 0.6, y + dy * 1.0);
    const e = iso(mx + 0.6, y);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.lineTo(d.x, d.y);
    c.lineTo(e.x, e.y);
    c.stroke();
  }
}

function drawCourtFurniture(c: Ctx) {
  // back fences (mesh) and two hoops
  const fz = 22;
  c.strokeStyle = "rgba(60,75,80,0.55)";
  c.lineWidth = 0.5;
  for (let x = COURT.x0; x <= COURT.x1 + 0.01; x += 0.2) {
    const a = iso(x, COURT.y0, 0);
    const b = iso(x, COURT.y0, fz);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  for (let y = COURT.y0; y <= COURT.y1 + 0.01; y += 0.2) {
    const a = iso(COURT.x1, y, 0);
    const b = iso(COURT.x1, y, fz);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.lineWidth = 1.2;
  c.strokeStyle = "#45555c";
  for (const z of [0.5, fz]) {
    const a = iso(COURT.x0, COURT.y0, z);
    const b = iso(COURT.x1, COURT.y0, z);
    const d = iso(COURT.x1, COURT.y1, z);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.lineTo(d.x, d.y);
    c.stroke();
  }
  const mx = (COURT.x0 + COURT.x1) / 2;
  for (const y of [COURT.y0 + 0.45, COURT.y1 - 0.45]) {
    const base = iso(mx, y);
    c.fillStyle = "#3a4048";
    c.fillRect(base.x - 0.7, base.y - 26, 1.4, 26);
    box(c, { x0: mx - 0.22, x1: mx + 0.22, y0: y - 0.02, y1: y + 0.02, z0: 22, z1: 31 }, 0xf4f4f2);
    const rim = iso(mx, y + (y < 3 ? 0.12 : -0.12), 24);
    c.strokeStyle = "#e0703a";
    c.lineWidth = 0.9;
    c.beginPath();
    c.ellipse(rim.x, rim.y, 2.6, 1.3, 0, 0, Math.PI * 2);
    c.stroke();
  }
}

function drawRoad(c: Ctx, era: Era, bike: boolean) {
  poly(c, rectPoly(ROAD), rgba(0x5f656b));
  const R = rng(5);
  for (let i = 0; i < 260; i++) {
    const p = iso(R() * GX, ROAD.y0 + R() * (GY - ROAD.y0));
    c.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    c.fillRect(p.x, p.y, 1.4, 1);
  }
  // kerb
  poly(c, rectPoly({ x0: 0, x1: GX, y0: ROAD.y0, y1: ROAD.y0 + 0.05 }), rgba(0xb9b4aa));
  // centre line
  c.setLineDash([7, 6]);
  line(c, iso(0, 13.38), iso(GX, 13.38), "rgba(255,236,170,0.85)", 1);
  c.setLineDash([]);
  // zebra crossing at the gate
  for (let i = 0; i < 6; i++) {
    const x = 6.75 + i * 0.2;
    poly(c, rectPoly({ x0: x, x1: x + 0.11, y0: ROAD.y0 + 0.1, y1: GY - 0.08 }), "rgba(255,255,255,0.78)");
  }
  if (bike) {
    poly(c, rectPoly(BIKE_LANE), rgba(era === "future" ? 0x3f9d66 : 0x46a86e));
    for (let x = 0.3; x < GX; x += 0.55) {
      if (x > 6.6 && x < 8.0) continue;
      box(c, { x0: x, x1: x + 0.22, y0: BIKE_LANE.y1, y1: BIKE_LANE.y1 + 0.06, z0: 0, z1: 1.8 }, 0xf2f2ee, { edge: null });
    }
    for (const x of [2.2, 5.0, 10.0, 13.4]) bikeGlyph(c, iso(x, (BIKE_LANE.y0 + BIKE_LANE.y1) / 2));
  }
}

function bikeGlyph(c: Ctx, p: Pt) {
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 0.9;
  c.beginPath();
  c.ellipse(p.x - 4, p.y + 0.5, 2.6, 1.4, 0, 0, Math.PI * 2);
  c.moveTo(p.x + 6.6, p.y + 0.5);
  c.ellipse(p.x + 4, p.y + 0.5, 2.6, 1.4, 0, 0, Math.PI * 2);
  c.moveTo(p.x - 4, p.y + 0.5);
  c.lineTo(p.x - 1, p.y - 1.6);
  c.lineTo(p.x + 3, p.y - 1.6);
  c.lineTo(p.x + 4, p.y + 0.5);
  c.stroke();
}

function drawCarpark(c: Ctx) {
  poly(c, rectPoly(CARPARK), rgba(0x6b7177));
  poly(c, rectPoly({ x0: CARPARK.x0, x1: CARPARK.x1, y0: CARPARK.y0, y1: CARPARK.y0 + 0.06 }), rgba(0xb9b4aa));
  const w = "rgba(255,255,255,0.7)";
  for (const row of [
    { x0: 11.7, x1: 12.8 },
    { x0: 14.55, x1: 15.65 },
  ]) {
    for (let i = 0; i <= 5; i++) {
      const y = 6.3 + i * 0.9;
      line(c, iso(row.x0, y), iso(row.x1, y), w, 0.8);
    }
  }
  // entrance from the road
  poly(c, rectPoly({ x0: 12.2, x1: 13.5, y0: 11.7, y1: 12.3 }), rgba(0x6b7177));
}

function drawApron(c: Ctx, era: Era, rain: boolean) {
  if (!rain) {
    paving(c, APRON, 0xc7c0b2, 0.5, "rgba(120,110,95,0.25)");
    // runoff staining that flows toward the low corner drain
    const stain = (x: number, y: number, rx: number, ry: number, a: number) => {
      const p = iso(x, y);
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx);
      g.addColorStop(0, `rgba(92,84,70,${a})`);
      g.addColorStop(1, "rgba(92,84,70,0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
    };
    const big = era === "future";
    stain(2.6, 11.0, big ? 58 : 40, big ? 24 : 16, big ? 0.38 : 0.28);
    stain(4.2, 10.6, big ? 34 : 22, big ? 12 : 8, 0.2);
    stain(4.8, 10.25, 20, 7, 0.16);
    // puddle (Greenhold fx-puddle style)
    const p = iso(2.75, 11.05);
    const s = big ? 1.75 : 1.15;
    c.fillStyle = "rgba(100,138,168,0.8)";
    c.beginPath();
    c.ellipse(p.x - 3 * s, p.y, 11 * s, 4.6 * s, 0.1, 0, Math.PI * 2);
    c.ellipse(p.x + 6 * s, p.y + 1, 7 * s, 3.2 * s, -0.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(230,242,248,0.6)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(p.x - 9 * s, p.y - 1);
    c.lineTo(p.x - 2 * s, p.y - 2.4 * s);
    c.stroke();
    // drain grate
    poly(c, rectPoly({ x0: 2.05, x1: 2.35, y0: 11.2, y1: 11.4 }), rgba(0x3a3f44));
    c.strokeStyle = "rgba(180,180,180,0.6)";
    c.lineWidth = 0.4;
    for (let i = 1; i < 4; i++) line(c, iso(2.05 + i * 0.075, 11.2), iso(2.05 + i * 0.075, 11.4), "rgba(170,170,170,0.6)", 0.4);
    if (big) {
      // cracked, patched concrete where water keeps pooling
      c.strokeStyle = "rgba(70,62,52,0.5)";
      c.lineWidth = 0.7;
      const a = iso(3.8, 10.5);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(a.x - 8, a.y + 4);
      c.lineTo(a.x - 12, a.y + 3);
      c.lineTo(a.x - 20, a.y + 8);
      c.stroke();
    }
    return;
  }
  drawRainGarden(c, era, 1);
}

/** Planted swale. p (0..1) animates the dig and planting. */
export function drawRainGarden(c: Ctx, era: Era, p: number) {
  const r = APRON;
  paving(c, r, 0xc7c0b2, 0.5, "rgba(120,110,95,0.25)");
  const inset: Rect = { x0: r.x0 + 0.15, x1: r.x1 - 0.15, y0: r.y0 + 0.12, y1: r.y1 - 0.12 };
  const dig = Math.min(1, p / 0.35);
  // stone edge and sunken soil bed
  poly(c, rectPoly(inset), rgba(0x9b958a));
  const sunk: Rect = { x0: inset.x0 + 0.08, x1: inset.x1 - 0.08, y0: inset.y0 + 0.08, y1: inset.y1 - 0.08 };
  poly(c, rectPoly(sunk, -2 * dig), rgba(era === "future" ? 0x5e4a33 : 0x6b4f35));
  if (dig > 0.6) {
    // river-stone inlet channel from the courtyard runoff
    const R = rng(3);
    for (let i = 0; i < 14; i++) {
      const q = iso(4.6 + R() * 0.6, sunk.y0 + R() * 0.35, -1);
      c.beginPath();
      c.ellipse(q.x, q.y, 1.6, 0.9, 0, 0, Math.PI * 2);
      c.fillStyle = rgba(R() < 0.5 ? 0xcfc9bd : 0xa8a196);
      c.fill();
    }
  }
  const plant = Math.max(0, (p - 0.35) / 0.65);
  if (plant <= 0) return;
  const R = rng(era === "future" ? 21 : 17);
  const n = era === "future" ? 70 : 26;
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, plant * 1.6 - (i / n) * 0.6));
    if (t <= 0) continue;
    const x = sunk.x0 + 0.1 + R() * (sunk.x1 - sunk.x0 - 0.7);
    const y = sunk.y0 + 0.05 + R() * (sunk.y1 - sunk.y0 - 0.1);
    const q = iso(x, y, -2);
    if (era === "future") {
      const h = (6 + R() * 7) * t;
      c.strokeStyle = rgba(R() < 0.5 ? 0x5a9a3c : 0x7aae4a);
      c.lineWidth = 0.8;
      c.beginPath();
      for (const dx of [-1.6, 0, 1.6]) {
        c.moveTo(q.x, q.y);
        c.quadraticCurveTo(q.x + dx, q.y - h * 0.6, q.x + dx * 1.6, q.y - h);
      }
      c.stroke();
      if (R() < 0.45) blob(c, q.x + (R() - 0.5) * 3, q.y - h, 1.5 * t, [0xf2c94a, 0xb98ad8, 0xffffff, 0xe8749a][i % 4], 1.05);
      else blob(c, q.x, q.y - h * 0.5, 2.6 * t, R() < 0.5 ? 0x5c9e45 : 0x6faf4f);
    } else {
      blob(c, q.x, q.y - 1.6 * t, 1.8 * t, R() < 0.5 ? 0x6faf4f : 0x86bf5a);
    }
  }
}

// ------------------------------------------------------------------ buildings

function windowRow(c: Ctx, face: "y" | "x", at: number, from: number, to: number, z0: number, z1: number, step: number, w: number, skip?: (m: number) => boolean) {
  for (let m = from; m + w <= to + 0.001; m += step) {
    if (skip?.(m)) continue;
    const frame = rgba(0xf7f3ea);
    const glass = rgba(0x5f87a6);
    const hi = "rgba(255,255,255,0.32)";
    if (face === "y") {
      faceY(c, at, m - 0.03, m + w + 0.03, z0 - 1, z1 + 1, frame);
      faceY(c, at, m, m + w, z0, z1, glass);
      poly(c, [iso(m, at, z1), iso(m + w * 0.35, at, z1), iso(m + w * 0.12, at, z0), iso(m, at, z0)], hi);
    } else {
      faceX(c, at, m - 0.03, m + w + 0.03, z0 - 1, z1 + 1, rgba(0xe6e0d4));
      faceX(c, at, m, m + w, z0, z1, rgba(shade(0x5f87a6, 0.85)));
    }
  }
}

function hvac(c: Ctx, x: number, y: number, z: number) {
  box(c, { x0: x, x1: x + 0.42, y0: y, y1: y + 0.32, z0: z, z1: z + 6 }, 0xc9ccd0);
  const p = iso(x + 0.21, y + 0.16, z + 6);
  c.beginPath();
  c.ellipse(p.x, p.y, 4.2, 2.1, 0, 0, Math.PI * 2);
  c.fillStyle = "#6f767d";
  c.fill();
}

/** Roof treatment for a building top. p animates the reveal sweep (0..1). */
export function drawGreenRoof(c: Ctx, r: Rect, z: number, era: Era, p = 1) {
  const inset: Rect = { x0: r.x0 + 0.14, x1: r.x1 - 0.14, y0: r.y0 + 0.14, y1: r.y1 - 0.14 };
  const sweepX = inset.x0 + (inset.x1 - inset.x0) * p;
  c.save();
  if (p < 1) {
    c.beginPath();
    const q = [iso(inset.x0, inset.y0 - 1, z), iso(sweepX, inset.y0 - 1, z), iso(sweepX, inset.y1 + 1, z), iso(inset.x0, inset.y1 + 1, z)];
    q.forEach((a, i) => (i ? c.lineTo(a.x, a.y - 30) : c.moveTo(a.x, a.y - 30)));
    c.lineTo(q[3].x, q[3].y + 10);
    c.lineTo(q[0].x, q[0].y + 10);
    c.closePath();
    c.clip();
  }
  // reflective white membrane border
  poly(c, rectPoly(inset, z), rgba(0xeef1ee));
  const bed: Rect = { x0: inset.x0 + 0.12, x1: inset.x1 - 0.12, y0: inset.y0 + 0.12, y1: inset.y1 - 0.12 };
  const lush = era === "future";
  poly(c, rectPoly(bed, z + 1), rgba(lush ? 0x6fae4c : 0x9fcd72));
  const R = rng(lush ? 41 : 29);
  if (lush) {
    const area = (bed.x1 - bed.x0) * (bed.y1 - bed.y0);
    const n = Math.round(area * 9);
    for (let i = 0; i < n; i++) {
      const q = iso(bed.x0 + R() * (bed.x1 - bed.x0), bed.y0 + R() * (bed.y1 - bed.y0), z + 2);
      blob(c, q.x, q.y, 2 + R() * 2.6, R() < 0.5 ? 0x5c9e45 : 0x78b552);
    }
    for (let i = 0; i < n / 3; i++) {
      const q = iso(bed.x0 + R() * (bed.x1 - bed.x0), bed.y0 + R() * (bed.y1 - bed.y0), z + 4);
      blob(c, q.x, q.y, 1, [0xf2c94a, 0xffffff, 0xe8749a, 0xb98ad8][i % 4], 1.05);
    }
  } else {
    // freshly laid sedum mats: a tidy checker of young planting
    const step = 0.5;
    for (let x = bed.x0; x < bed.x1 - 0.01; x += step) {
      for (let y = bed.y0; y < bed.y1 - 0.01; y += step) {
        const x1 = Math.min(bed.x1, x + step);
        const y1 = Math.min(bed.y1, y + step);
        const k = (Math.round(x / step) + Math.round(y / step)) % 2;
        poly(c, rectPoly({ x0: x + 0.03, x1: x1 - 0.03, y0: y + 0.03, y1: y1 - 0.03 }, z + 1), rgba(k ? 0x9fcd72 : 0x8fc466));
      }
    }
    for (let i = 0; i < 60; i++) {
      const q = iso(bed.x0 + R() * (bed.x1 - bed.x0), bed.y0 + R() * (bed.y1 - bed.y0), z + 1);
      c.fillStyle = rgba(R() < 0.5 ? 0x6faf4f : 0xc2df98);
      c.fillRect(q.x, q.y, 1.4, 1);
    }
  }
  c.restore();
}

/** Tilted PV rows on the classroom roof. p animates frames then panels. */
export function drawRoofSolar(c: Ctx, p = 1) {
  const z = ACADEMIC.h;
  const rows = [1.05, 1.75, 2.45];
  rows.forEach((y, ri) => {
    for (let k = 0; k < 4; k++) {
      const x0 = 3.3 + k * 1.8;
      const x1 = x0 + 1.55;
      const local = Math.min(1, Math.max(0, p * 2.2 - (ri * 4 + k) * 0.08));
      if (local <= 0) continue;
      const frameT = Math.min(1, local / 0.4);
      // support frame
      c.strokeStyle = "#7d858c";
      c.lineWidth = 0.8;
      for (const x of [x0 + 0.1, x1 - 0.1]) {
        const a = iso(x, y + 0.5, z);
        const b = iso(x, y + 0.5, z + 3 * frameT);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
      const panelT = Math.max(0, (local - 0.4) / 0.6);
      if (panelT <= 0) continue;
      const drop = (1 - panelT) * 10;
      const q = [iso(x0, y, z + 9 + drop), iso(x1, y, z + 9 + drop), iso(x1, y + 0.55, z + 3 + drop), iso(x0, y + 0.55, z + 3 + drop)];
      c.globalAlpha = Math.min(1, panelT * 1.5);
      poly(c, q.map((a) => ({ x: a.x, y: a.y + 1.4 })), rgba(0xbac2c6), EDGE);
      poly(c, q, rgba(0x27406b), EDGE);
      c.strokeStyle = "rgba(170,200,240,0.55)";
      c.lineWidth = 0.5;
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const a = { x: q[0].x + (q[1].x - q[0].x) * t, y: q[0].y + (q[1].y - q[0].y) * t };
        const b = { x: q[3].x + (q[2].x - q[3].x) * t, y: q[3].y + (q[2].y - q[3].y) * t };
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
      c.globalAlpha = 0.22 * Math.min(1, panelT * 1.5);
      poly(c, [q[0], { x: q[0].x + (q[1].x - q[0].x) * 0.25, y: q[0].y + (q[1].y - q[0].y) * 0.25 }, { x: q[3].x + (q[2].x - q[3].x) * 0.1, y: q[3].y + (q[2].y - q[3].y) * 0.1 }, q[3]], "#fff");
      c.globalAlpha = 1;
    }
  });
}

/** Solar canopy over the car park bays. */
export function drawCanopy(c: Ctx, p = 1) {
  const r = CANOPY;
  const zTop = 30;
  const posts = [6.6, 8.85, 11.05];
  const frameT = Math.min(1, p / 0.4);
  const post = (x: number, y: number) => {
    const a = iso(x, y);
    c.fillStyle = "#5d666d";
    c.fillRect(a.x - 1, a.y - zTop * frameT, 2, zTop * frameT);
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(a.x - 1, a.y - zTop * frameT, 0.7, zTop * frameT);
  };
  for (const y of posts) post(r.x0 + 0.25, y);
  const panelT = Math.max(0, (p - 0.4) / 0.6);
  if (panelT > 0) {
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const t = Math.min(1, Math.max(0, panelT * 1.6 - i * 0.1));
      if (t <= 0) continue;
      const y0 = r.y0 + ((r.y1 - r.y0) * i) / segs;
      const y1 = r.y0 + ((r.y1 - r.y0) * (i + 1)) / segs;
      const drop = (1 - t) * 10;
      const hi = zTop + 7 + drop;
      const lo = zTop + drop;
      const q = [iso(r.x0, y0, hi), iso(r.x1, y0, lo), iso(r.x1, y1, lo), iso(r.x0, y1, hi)];
      c.globalAlpha = Math.min(1, t * 1.5);
      // steel edge so the canopy reads as a raised roof, not a ground array
      poly(c, [iso(r.x1, y0, lo), iso(r.x1, y1, lo), iso(r.x1, y1, lo - 3), iso(r.x1, y0, lo - 3)], rgba(0xb7bfc4), EDGE);
      if (i === segs - 1) poly(c, [iso(r.x0, y1, hi), iso(r.x1, y1, lo), iso(r.x1, y1, lo - 3), iso(r.x0, y1, hi - 3)], rgba(0xd2d8db), EDGE);
      poly(c, q, rgba(0x2a446f), EDGE);
      c.strokeStyle = "rgba(170,200,240,0.5)";
      c.lineWidth = 0.5;
      c.beginPath();
      for (let k = 1; k < 3; k++) {
        const a = { x: q[0].x + (q[1].x - q[0].x) * (k / 3), y: q[0].y + (q[1].y - q[0].y) * (k / 3) };
        const b = { x: q[3].x + (q[2].x - q[3].x) * (k / 3), y: q[3].y + (q[2].y - q[3].y) * (k / 3) };
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      }
      c.stroke();
      c.globalAlpha = 0.18 * Math.min(1, t * 1.5);
      poly(c, [q[0], { x: q[0].x + (q[1].x - q[0].x) * 0.3, y: q[0].y + (q[1].y - q[0].y) * 0.3 }, { x: q[3].x + (q[2].x - q[3].x) * 0.12, y: q[3].y + (q[2].y - q[3].y) * 0.12 }, q[3]], "#fff");
      c.globalAlpha = 1;
    }
  }
  // front posts stand in front of the panel edge
  for (const y of posts) post(r.x1 - 0.2, y);
}

function drawAcademic(c: Ctx, era: Era, pl: Placement[], all: Placement[], liveRoof: boolean) {
  const A = ACADEMIC;
  box(c, { x0: A.x0 - 0.06, x1: A.x1 + 0.06, y0: A.y0 - 0.06, y1: A.y1 + 0.06, z0: 0, z1: 3 }, 0xa9a39a);
  const green = has(pl, "roof-academic") && !liveRoof;
  const roofBusy = has(all, "roof-academic") || has(all, "solar-roof");
  box(c, { x0: A.x0, x1: A.x1, y0: A.y0, y1: A.y1, z0: 0, z1: A.h }, 0xefe6d2, { top: 0x8e9096 });
  // floor band + brick plinth
  faceY(c, A.y1, A.x0, A.x1, 0, 3.5, rgba(0xb5654a));
  faceX(c, A.x1, A.y0, A.y1, 0, 3.5, rgba(shade(0xb5654a, 0.8)));
  faceY(c, A.y1, A.x0, A.x1, 22.5, 24, rgba(0xd6c9ae));
  faceX(c, A.x1, A.y0, A.y1, 22.5, 24, rgba(0xc4b89e));
  const entrance = (m: number) => m > 5.7 && m < 7.3;
  windowRow(c, "y", A.y1, A.x0 + 0.3, A.x1 - 0.2, 7, 18, 0.72, 0.48, entrance);
  windowRow(c, "y", A.y1, A.x0 + 0.3, A.x1 - 0.2, 29, 40, 0.72, 0.48, entrance);
  windowRow(c, "x", A.x1, A.y0 + 0.35, A.y1 - 0.3, 7, 18, 0.9, 0.55);
  windowRow(c, "x", A.x1, A.y0 + 0.35, A.y1 - 0.3, 29, 40, 0.9, 0.55);
  // entrance core in school teal
  box(c, { x0: 5.85, x1: 7.2, y0: A.y1 - 0.05, y1: A.y1 + 0.14, z0: 0, z1: A.h + 4 }, 0x2f8f86, { top: 0x37a096 });
  faceY(c, A.y1 + 0.14, 6.2, 6.85, 0, 13, rgba(0x9cc3d6));
  faceY(c, A.y1 + 0.14, 6.51, 6.54, 0, 13, rgba(0xf4f4f0));
  box(c, { x0: 5.7, x1: 7.35, y0: A.y1 + 0.14, y1: A.y1 + 0.62, z0: 14, z1: 16 }, 0xf2f0ea);
  for (const x of [6.25, 6.45, 6.65]) {
    const z0 = 24;
    faceY(c, A.y1 + 0.14, x, x + 0.12, z0 + 2, z0 + 16, rgba(0x9cc3d6));
  }
  // roof: parapet edge + plant + stair tower
  const top: Rect = { x0: A.x0, x1: A.x1, y0: A.y0, y1: A.y1 };
  poly(c, rectPoly({ x0: top.x0 + 0.1, x1: top.x1 - 0.1, y0: top.y0 + 0.1, y1: top.y1 - 0.1 }, A.h), rgba(0x7d8086));
  if (green) drawGreenRoof(c, { x0: top.x0 + 2.3, x1: top.x1, y0: top.y0, y1: top.y1 }, A.h, era);
  box(c, { x0: 1.35, x1: 2.45, y0: 0.95, y1: 2.05, z0: A.h, z1: A.h + 9 }, 0xe2d8c3, { top: 0x9a9da2 });
  hvac(c, 1.45, 2.45, A.h);
  hvac(c, 2.0, 2.45, A.h);
  if (!roofBusy) {
    hvac(c, 5.0, 1.4, A.h);
    hvac(c, 8.2, 2.1, A.h);
  }
}

function drawCafeteria(c: Ctx, era: Era, pl: Placement[], all: Placement[], liveRoof: boolean) {
  const C = CAFETERIA;
  box(c, { x0: C.x0 - 0.06, x1: C.x1 + 0.06, y0: C.y0 - 0.06, y1: C.y1 + 0.06, z0: 0, z1: 2.5 }, 0xa9a39a);
  box(c, { x0: C.x0, x1: C.x1, y0: C.y0, y1: C.y1, z0: 0, z1: C.h }, 0xe0a27a, { top: 0x8e9096 });
  // tall glazing toward the courtyard
  faceX(c, C.x1, C.y0 + 0.35, C.y1 - 0.35, 3, 19, rgba(0xf3eee4));
  faceX(c, C.x1, C.y0 + 0.42, C.y1 - 0.42, 4, 18, rgba(0x6d93ad));
  for (let y = C.y0 + 0.42; y < C.y1 - 0.4; y += 0.55) faceX(c, C.x1, y, y + 0.04, 4, 18, rgba(0xe9e3d6));
  faceX(c, C.x1, 6.8, 7.4, 3, 13, rgba(0x9cc3d6));
  // fascia + sign
  faceX(c, C.x1, C.y0, C.y1, 21, 25.5, rgba(shade(0x2f8f86, 0.8)));
  faceY(c, C.y1, C.x0, C.x1, 21, 25.5, rgba(0x2f8f86));
  windowRow(c, "y", C.y1, C.x0 + 0.3, C.x1 - 0.2, 6, 16, 0.75, 0.5);
  poly(c, rectPoly({ x0: C.x0 + 0.1, x1: C.x1 - 0.1, y0: C.y0 + 0.1, y1: C.y1 - 0.1 }, C.h), rgba(0x7d8086));
  const green = has(pl, "roof-cafeteria") && !liveRoof;
  if (green) drawGreenRoof(c, { x0: C.x0, x1: C.x1, y0: C.y0, y1: C.y1 }, C.h, era);
  else if (!has(all, "roof-cafeteria")) {
    hvac(c, 1.2, 5.2, C.h);
    hvac(c, 1.6, 8.1, C.h);
  }
  // awning over the shaded terrace edge
  const ay0 = 4.5;
  const ay1 = 6.6;
  poly(
    c,
    [iso(C.x1, ay0, 15), iso(C.x1 + 0.55, ay0, 12), iso(C.x1 + 0.55, ay1, 12), iso(C.x1, ay1, 15)],
    rgba(0xf2efe6),
    EDGE,
  );
  for (let i = 0; i < 6; i++) {
    const y = ay0 + ((ay1 - ay0) * i) / 6;
    const y2 = ay0 + ((ay1 - ay0) * (i + 1)) / 6;
    if (i % 2) poly(c, [iso(C.x1, y, 15), iso(C.x1 + 0.55, y, 12), iso(C.x1 + 0.55, y2, 12), iso(C.x1, y2, 15)], rgba(0x2f8f86, 0.85));
  }
}

function signText(c: Ctx, p: Pt, text: string, bg: string, size = 4.6) {
  c.font = `800 ${size}px Sora, Nunito, "Segoe UI", sans-serif`;
  const w = c.measureText(text).width + 5;
  c.fillStyle = bg;
  c.beginPath();
  c.roundRect(p.x - w / 2, p.y - size - 1.2, w, size + 3, 1.6);
  c.fill();
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.fillText(text, p.x, p.y);
}

function drawShrubs(c: Ctx) {
  const R = rng(9);
  for (const [x, y] of [
    [1.6, 3.62],
    [2.4, 3.62],
    [3.2, 3.62],
    [9.5, 3.62],
    [10.3, 3.62],
    [10.95, 2.0],
  ]) {
    const p = iso(x, y);
    blob(c, p.x, p.y - 3, 4 + R() * 1.2, 0x5c9e45);
  }
}

function drawPlanter(c: Ctx) {
  const { x, y, r } = PLANTER;
  // raised round planter seat
  isoEllipse(c, x, y, r, r, 0);
  c.fillStyle = rgba(0xb8b0a2);
  c.fill();
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r];
    const p1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r];
    const facing = Math.cos((a0 + a1) / 2) + Math.sin((a0 + a1) / 2);
    if (facing < -0.2) continue;
    poly(c, [iso(p0[0], p0[1], 5), iso(p1[0], p1[1], 5), iso(p1[0], p1[1], 0), iso(p0[0], p0[1], 0)], rgba(shade(0xd2c9b8, 0.75 + facing * 0.12)));
  }
  isoEllipse(c, x, y, r, r, 5);
  c.fillStyle = rgba(0xe2dacb);
  c.fill();
  isoEllipse(c, x, y, r - 0.12, r - 0.12, 5);
  c.fillStyle = rgba(0x7a5a3a);
  c.fill();
  const R = rng(4);
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const d = R() * (r - 0.25);
    const q = iso(x + Math.cos(a) * d, y + Math.sin(a) * d, 6);
    blob(c, q.x, q.y, 2.4, i % 3 ? 0x6faf4f : 0x8cc25e);
  }
}

function drawRacks(c: Ctx, era: Era) {
  poly(c, rectPoly(RACKS), rgba(0xd8d2c4));
  const bikes = era === "future" ? 8 : 2;
  for (let i = 0; i < 8; i++) {
    const x = RACKS.x0 + 0.15 + i * 0.18;
    const base = iso(x, RACKS.y1 - 0.25);
    c.strokeStyle = "#8d969c";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(base.x - 1.6, base.y);
    c.quadraticCurveTo(base.x - 1.6, base.y - 6, base.x, base.y - 6);
    c.quadraticCurveTo(base.x + 1.6, base.y - 6, base.x + 1.6, base.y);
    c.stroke();
    if (i < bikes) drawParkedBike(c, iso(x, RACKS.y1 - 0.12), i);
  }
  if (era === "future") {
    // simple shelter roof over the racks
    const z = 17;
    poly(c, [iso(RACKS.x0, RACKS.y0 + 0.1, z + 3), iso(RACKS.x1, RACKS.y0 + 0.1, z + 3), iso(RACKS.x1, RACKS.y1, z), iso(RACKS.x0, RACKS.y1, z)], "rgba(150,200,190,0.55)", EDGE);
    c.fillStyle = "#5d666d";
    for (const x of [RACKS.x0 + 0.05, RACKS.x1 - 0.05]) {
      const a = iso(x, RACKS.y1);
      c.fillRect(a.x - 0.6, a.y - z, 1.2, z);
    }
  }
}

function drawBattery(c: Ctx) {
  box(c, { x0: 11.0, x1: 11.45, y0: 2.3, y1: 3.2, z0: 0, z1: 11 }, 0xf1f2ef, { top: 0xd9dcd8 });
  faceX(c, 11.45, 2.45, 3.05, 3, 9, rgba(0xdfe3df));
  const p = iso(11.45, 2.75, 8);
  c.beginPath();
  c.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
  c.fillStyle = "#3fbf7a";
  c.fill();
  const q = iso(11.45, 2.75, 5);
  c.fillStyle = "#2f8f86";
  c.beginPath();
  c.moveTo(q.x + 0.5, q.y - 2.4);
  c.lineTo(q.x - 1.2, q.y + 0.3);
  c.lineTo(q.x + 0.1, q.y + 0.3);
  c.lineTo(q.x - 0.5, q.y + 2.4);
  c.lineTo(q.x + 1.4, q.y - 0.5);
  c.lineTo(q.x + 0.1, q.y - 0.5);
  c.closePath();
  c.fill();
}

/** Which bays have a parked car in each era. */
export function parkedBays(era: Era, pl: Placement[]) {
  const bike = hasId(pl, "bike");
  const n = era === "today" ? 7 : bike ? 3 : 10;
  const order = [0, 5, 2, 7, 1, 9, 3, 6, 8, 4];
  return order.slice(0, n);
}

export type StaticOpts = { era: Era; placements: Placement[]; live: Set<string> };

/**
 * Everything that never moves for a given era: ground, buildings, roof
 * treatments, parked cars. Baked once per change into an offscreen layer.
 */
export function drawStatic(c: Ctx, sprites: Sprites, o: StaticOpts) {
  const { era, placements: pl, live } = o;
  const settled = pl.filter((p) => !live.has(p.spot));
  drawSlab(c);
  drawGrass(c);
  drawCourt(c);
  paving(c, COURTYARD, 0xdcd3c1);
  paving(c, GATE_PATH, 0xdcd3c1);
  // timber deck on the shaded terrace
  poly(c, rectPoly(TERRACE), rgba(0xc79f74));
  c.strokeStyle = "rgba(110,80,50,0.3)";
  c.lineWidth = 0.6;
  c.beginPath();
  for (let y = TERRACE.y0 + 0.15; y < TERRACE.y1; y += 0.15) {
    const a = iso(TERRACE.x0, y);
    const b = iso(TERRACE.x1, y);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  c.stroke();
  paving(c, FOOTPATH, 0xd9d3c6, 0.5, "rgba(120,110,95,0.25)");
  drawApron(c, era, has(settled, "rain-lowpoint"));
  drawCarpark(c);
  drawRoad(c, era, has(settled, "bike-gate"));
  drawCourtFurniture(c);
  drawAcademic(c, era, settled, pl, live.has("roof-academic"));
  if (has(settled, "solar-roof")) drawRoofSolar(c);
  if (era === "future" && hasId(settled, "solar")) drawBattery(c);
  drawCafeteria(c, era, settled, pl, live.has("roof-cafeteria"));
  signText(c, iso(7.6, ACADEMIC.y1 + 0.14, 27), "WESTBROOK SCHOOL", "#1f4f5a", 4.4);
  signText(c, iso(CAFETERIA.x1, 8.6, 22.6), "CAFETERIA", "rgba(0,0,0,0)", 3.6);
  drawShrubs(c);
  drawPlanter(c);
  for (const b of BENCHES) drawSprite(c, sprites.bench, iso(b.x, b.y).x, iso(b.x, b.y).y);
  if (has(settled, "bike-gate")) drawRacks(c, era);
  const bays = parkedBays(era, pl);
  for (const i of [...bays].sort((a, b) => BAYS[a].x + BAYS[a].y - (BAYS[b].x + BAYS[b].y))) {
    const b = BAYS[i];
    const p = iso(b.x, b.y);
    drawSprite(c, sprites.car[b.dir][(i * 3) % CARS.length], p.x, p.y);
  }
  if (has(settled, "solar-canopy")) drawCanopy(c);
}

// ------------------------------------------------------------------ card thumbnails

export function cardThumb(id: string, sprites: Sprites): string {
  const W = 132;
  const H = 84;
  const cv = document.createElement("canvas");
  cv.width = W * 2;
  cv.height = H * 2;
  const c = cv.getContext("2d")!;
  c.scale(2, 2);
  c.translate(W / 2, H / 2 + 6);
  c.lineJoin = "round";
  const tile = (color: number) => {
    poly(c, [iso(-0.9, -0.9), iso(0.9, -0.9), iso(0.9, 0.9), iso(-0.9, 0.9)], rgba(color));
    poly(c, [iso(-0.9, 0.9), iso(0.9, 0.9), iso(0.9, 0.9, -6), iso(-0.9, 0.9, -6)], rgba(0x8f6740));
    poly(c, [iso(0.9, -0.9), iso(0.9, 0.9), iso(0.9, 0.9, -6), iso(0.9, -0.9, -6)], rgba(0x7a5634));
  };
  if (id === "trees") {
    tile(GRASS);
    const p = iso(0.1, 0.1);
    c.fillStyle = "rgba(30,60,20,0.22)";
    c.beginPath();
    c.ellipse(p.x + 4, p.y + 2, 26, 12, 0, 0, Math.PI * 2);
    c.fill();
    drawSprite(c, sprites.tree("mature", 0), p.x, p.y);
    drawSprite(c, sprites.walk[2][1], p.x + 14, p.y + 6);
  } else if (id === "solar") {
    c.translate(-4, 22);
    box(c, { x0: -0.8, x1: 0.8, y0: -0.7, y1: 0.7, z0: 0, z1: 14 }, 0xefe6d2, { top: 0x8e9096 });
    for (const y of [-0.55, 0.05]) {
      const q = [iso(-0.65, y, 22), iso(0.65, y, 22), iso(0.65, y + 0.5, 16), iso(-0.65, y + 0.5, 16)];
      poly(c, q, rgba(0x27406b), EDGE);
      c.strokeStyle = "rgba(170,200,240,0.6)";
      c.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        c.beginPath();
        c.moveTo(q[0].x + (q[1].x - q[0].x) * t, q[0].y + (q[1].y - q[0].y) * t);
        c.lineTo(q[3].x + (q[2].x - q[3].x) * t, q[3].y + (q[2].y - q[3].y) * t);
        c.stroke();
      }
    }
  } else if (id === "bike") {
    tile(0x5f656b);
    poly(c, [iso(-0.9, -0.3), iso(0.9, -0.3), iso(0.9, 0.3), iso(-0.9, 0.3)], rgba(0x46a86e));
    bikeGlyph(c, iso(-0.4, 0));
    const p = iso(0.35, 0);
    drawSprite(c, sprites.cyclist[0][0], p.x, p.y);
  } else if (id === "rain") {
    c.translate(0, 4);
    tile(GRASS);
    const r: Rect = { x0: -0.7, x1: 0.7, y0: -0.7, y1: 0.7 };
    poly(c, rectPoly(r), rgba(0x9b958a));
    poly(c, rectPoly({ x0: -0.6, x1: 0.6, y0: -0.6, y1: 0.6 }, -2), rgba(0x5e4a33));
    const R = rng(8);
    for (let i = 0; i < 26; i++) {
      const q = iso(-0.5 + R() * 1.0, -0.5 + R() * 1.0, -2);
      const h = 5 + R() * 6;
      c.strokeStyle = rgba(R() < 0.5 ? 0x5a9a3c : 0x7aae4a);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(q.x, q.y);
      c.quadraticCurveTo(q.x - 1, q.y - h * 0.6, q.x - 2, q.y - h);
      c.moveTo(q.x, q.y);
      c.quadraticCurveTo(q.x + 1, q.y - h * 0.6, q.x + 2, q.y - h);
      c.stroke();
      if (i % 3 === 0) blob(c, q.x, q.y - h, 1.4, [0xf2c94a, 0xb98ad8, 0xffffff][i % 3], 1.05);
    }
    const d = iso(-0.2, -0.95, 22);
    c.strokeStyle = "rgba(90,140,200,0.7)";
    c.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(d.x - 20 + i * 8, d.y - 6 + (i % 2) * 4);
      c.lineTo(d.x - 22 + i * 8, d.y + 0 + (i % 2) * 4);
      c.stroke();
    }
  } else if (id === "roof") {
    c.translate(-4, 20);
    box(c, { x0: -0.8, x1: 0.8, y0: -0.7, y1: 0.7, z0: 0, z1: 14 }, 0xe0a27a, { top: 0x8e9096 });
    drawGreenRoof(c, { x0: -0.8, x1: 0.8, y0: -0.7, y1: 0.7 }, 14, "future");
  }
  return cv.toDataURL("image/png");
}

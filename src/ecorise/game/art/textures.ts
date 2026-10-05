import type Phaser from "phaser";
import { createRng } from "../../model/rng";
import {
  BIN,
  FLOWERBEDS,
  GRID,
  HOMES,
  KITCHEN,
  MEADOW,
  TREES,
  tileAt,
  type HomeSpec,
} from "../layout";
import { OUTLINE, Sketch, bake, iso, mix, shade, type BakedTexture, type V2 } from "./iso";

/**
 * Procedural art. Every texture is drawn once at boot from simple vector
 * shapes so the whole city shares one light direction (top-left), one
 * outline colour and one palette.
 */
export const PAL = {
  grassA: 0x9ccf73,
  grassB: 0x94c96c,
  tuft: 0x6fa951,
  path: 0xf3e4c4,
  pathEdge: 0xd2b98a,
  plaza: 0xeee2d0,
  plazaLine: 0xd5c3a8,
  terrace: 0xf2cfa4,
  terraceLine: 0xdcae80,
  meadowA: 0xd3e79a,
  meadowB: 0xcbe291,
  cliffL: 0xc08a5f,
  cliffR: 0x996744,
  cliffBand: 0x7a4f33,
  foam: 0xeefbf7,
  cream: 0xfff3dc,
  terracotta: 0xe0673f,
  teal: 0x2a9a8d,
  tealDark: 0x1f6f66,
  gold: 0xf5bf42,
  glow: 0xffd98a,
  frame: 0x6b4a3a,
  glass: 0xb5dcea,
  wood: 0xb07a4f,
  woodDark: 0x7f5437,
  stone: 0xd9cbb5,
  leaf: 0x62a84f,
  leafLight: 0x86c565,
  leafDark: 0x4b8b41,
  pine: 0x3f8452,
  pineLight: 0x5aa169,
  trunk: 0x8a5a3b,
  shadow: 0x24402a,
} as const;

export const GROUND_DEPTH = 26;

const wallShades = (c: number) => ({ top: shade(c, 1.04), left: c, right: shade(c, 0.82) });
const edge = (alpha = 0.45, width = 1) => ({ stroke: OUTLINE, strokeAlpha: alpha, width });

/** Gable roof over a w × d footprint whose walls end at height h. */
function gableRoof(s: Sketch, w: number, d: number, h: number, rh: number, o: number, ridge: "x" | "y", roof: number, wall: number) {
  const front = roof;
  const side = shade(roof, 0.76);
  if (ridge === "x") {
    const ym = d / 2;
    s.face([[-o, -o, h], [w + o, -o, h], [w + o, ym, h + rh], [-o, ym, h + rh]], shade(roof, 0.7));
    s.face([[w, 0, h], [w, d, h], [w, ym, h + rh]], shade(wall, 0.82));
    s.face([[-o, ym, h + rh], [w + o, ym, h + rh], [w + o, d + o, h], [-o, d + o, h]], front);
    // Courses on the visible slope, running parallel to the ridge.
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const y = ym + (d + o - ym) * t;
      const z = h + rh - rh * t;
      s.line([iso(-o + 0.02, y, z), iso(w + o - 0.02, y, z)], shade(front, 0.82), 0.7, 0.6);
    }
    s.line([iso(-o, d + o, h), iso(w + o, d + o, h)], shade(front, 0.55), 1.4, 0.9);
    s.line([iso(w + o, ym, h + rh), iso(w + o, d + o, h)], shade(front, 0.55), 1, 0.8);
  } else {
    const xm = w / 2;
    s.face([[-o, -o, h], [xm, -o, h + rh], [xm, d + o, h + rh], [-o, d + o, h]], shade(roof, 0.7));
    s.face([[0, d, h], [w, d, h], [xm, d, h + rh]], wall);
    s.face([[xm, -o, h + rh], [w + o, -o, h], [w + o, d + o, h], [xm, d + o, h + rh]], side);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const x = xm + (w + o - xm) * t;
      const z = h + rh - rh * t;
      s.line([iso(x, -o + 0.02, z), iso(x, d + o - 0.02, z)], shade(side, 0.82), 0.7, 0.6);
    }
    s.line([iso(w + o, -o, h), iso(w + o, d + o, h)], shade(side, 0.55), 1.4, 0.9);
    s.line([iso(xm, d + o, h + rh), iso(w + o, d + o, h)], shade(side, 0.55), 1, 0.8);
  }
}

function leftWindow(s: Sketch, y: number, xa: number, xb: number, za: number, zb: number, glass: number = PAL.glass) {
  s.leftRect(y, xa - 0.03, xb + 0.03, za - 2, zb + 2, 0xfdf7ec, edge(0.55));
  s.leftRect(y, xa, xb, za, zb, glass, null);
  const xm = (xa + xb) / 2;
  s.line([iso(xm, y, za), iso(xm, y, zb)], 0xfdf7ec, 1, 0.9);
  s.line([iso(xa + 0.04, y, zb - 2), iso(xa + 0.12, y, za + 3)], 0xffffff, 0.8, 0.5);
}

function rightWindow(s: Sketch, x: number, ya: number, yb: number, za: number, zb: number, glass: number = PAL.glass) {
  s.rightRect(x, ya - 0.03, yb + 0.03, za - 2, zb + 2, 0xf2e9d8, edge(0.55));
  s.rightRect(x, ya, yb, za, zb, shade(glass, 0.86), null);
  const ym = (ya + yb) / 2;
  s.line([iso(x, ym, za), iso(x, ym, zb)], 0xf2e9d8, 1, 0.9);
}

function chimney(s: Sketch, x: number, y: number, base: number, height: number, color = 0xb5523a) {
  s.box(x, y, base, 0.22, 0.22, height, { top: shade(color, 1.1), left: color, right: shade(color, 0.78) });
  s.box(x - 0.03, y - 0.03, base + height, 0.28, 0.28, 3, {
    top: 0x4a3328,
    left: shade(color, 0.9),
    right: shade(color, 0.7),
  });
}

export function kitchenSketch(): Sketch {
  const s = new Sketch();
  const w = KITCHEN.w;
  const d = KITCHEN.d;
  const H = 46;
  const wall = PAL.cream;
  s.box(-0.05, -0.05, 0, w + 0.1, d + 0.1, 4, wallShades(PAL.stone));
  s.box(0, 0, 4, w, d, H - 4, wallShades(wall));
  // A contrasting base course along the front.
  s.leftRect(d, 0, w, 4, 9, shade(PAL.terracotta, 0.95), edge(0.3));
  s.rightRect(w, 0, d, 4, 9, shade(PAL.terracotta, 0.78), edge(0.3));

  // Serving hatch with a warm interior and a counter.
  s.leftRect(d, 0.3, 1.8, 15, 37, PAL.frame, edge(0.6));
  s.leftRect(d, 0.36, 1.74, 18, 34, PAL.glow, null);
  s.leftRect(d, 0.36, 1.74, 29, 34, shade(PAL.glow, 1.08), null);
  // Pots on a back shelf.
  for (const x of [0.55, 0.95, 1.4]) {
    const p = iso(x, d, 27);
    s.ellipse(p.x, p.y, 3.2, 1.6, { fill: 0x8f6a52, alpha: 0.9 });
  }
  s.box(0.28, d, 15, 1.54, 0.2, 3, wallShades(PAL.wood));

  // Striped awning over the hatch.
  const stripes = 8;
  const ax0 = 0.22;
  const ax1 = 1.88;
  for (let i = 0; i < stripes; i++) {
    const xa = ax0 + ((ax1 - ax0) * i) / stripes;
    const xb = ax0 + ((ax1 - ax0) * (i + 1)) / stripes;
    s.face([[xa, d, 42], [xb, d, 42], [xb, d + 0.42, 34], [xa, d + 0.42, 34]], i % 2 ? PAL.cream : PAL.teal, edge(0.25));
  }
  s.face([[ax0, d + 0.42, 34], [ax1, d + 0.42, 34], [ax1, d + 0.42, 31], [ax0, d + 0.42, 31]], PAL.tealDark, edge(0.4));
  s.face([[ax1, d, 42], [ax1, d + 0.42, 34], [ax1, d + 0.42, 31], [ax1, d, 40]], shade(PAL.teal, 0.7), edge(0.4));

  // Door with a step and a small window.
  s.box(2.1, d, 0, 0.6, 0.18, 4, wallShades(PAL.stone));
  s.leftRect(d, 2.15, 2.65, 4, 31, PAL.frame, edge(0.6));
  s.leftRect(d, 2.19, 2.61, 5, 29, PAL.tealDark, null);
  s.leftRect(d, 2.27, 2.53, 19, 26, PAL.glow, null);
  const knob = iso(2.56, d, 15);
  s.circle(knob.x, knob.y, 0.9, { fill: PAL.gold });

  // Side windows on the right face.
  rightWindow(s, w, 0.3, 0.85, 18, 34, PAL.glow);
  rightWindow(s, w, 1.15, 1.7, 18, 34, PAL.glow);

  gableRoof(s, w, d, H, 24, 0.14, "x", PAL.terracotta, wall);
  chimney(s, 2.25, 0.42, H, 34);

  // Round sign on the gable end: a plate with fork and knife.
  const c = iso(w, d / 2, H + 9);
  s.ellipse(c.x, c.y, 6.2, 7, { fill: PAL.cream, stroke: OUTLINE, strokeAlpha: 0.6, width: 1 });
  s.ellipse(c.x, c.y, 3.4, 3.9, { stroke: PAL.teal, strokeAlpha: 1, width: 1.1 });
  s.line([{ x: c.x - 4.8, y: c.y - 3.2 }, { x: c.x - 4.8, y: c.y + 3.6 }], PAL.teal, 0.9);
  s.line([{ x: c.x + 4.8, y: c.y - 3.2 }, { x: c.x + 4.8, y: c.y + 3.6 }], PAL.teal, 0.9);

  // Herb planter by the door.
  s.box(2.75, d, 0, 0.22, 0.14, 7, wallShades(PAL.wood));
  for (const [dx, dz] of [[2.8, 10], [2.88, 12], [2.95, 9.5]] as const) {
    const p = iso(dx, d + 0.07, dz);
    s.circle(p.x, p.y, 2.4, { fill: PAL.leafLight, stroke: OUTLINE, strokeAlpha: 0.3, width: 0.6 });
  }
  return s;
}

/** Cook seen through the hatch (head and shoulders). Local origin = kitchen origin. */
export function cookSketch(): Sketch {
  const s = new Sketch();
  const p = iso(0, KITCHEN.d, 18);
  s.ellipse(p.x, p.y - 4, 4.4, 4, { fill: 0xffffff, stroke: OUTLINE, strokeAlpha: 0.4, width: 0.7 });
  s.circle(p.x, p.y - 10.5, 3.2, { fill: 0xe9b98e, stroke: OUTLINE, strokeAlpha: 0.4, width: 0.7 });
  s.ellipse(p.x, p.y - 14.6, 3.6, 2, { fill: 0xffffff, stroke: OUTLINE, strokeAlpha: 0.4, width: 0.7 });
  s.circle(p.x, p.y - 16, 2.6, { fill: 0xffffff, stroke: OUTLINE, strokeAlpha: 0.4, width: 0.7 });
  return s;
}

/** Sign hung under the awning when the kitchen offers small servings. */
export function sizesSignSketch(): Sketch {
  const s = new Sketch();
  const d = KITCHEN.d;
  s.line([iso(0.62, d + 0.36, 31), iso(0.62, d + 0.36, 26)], PAL.woodDark, 0.8);
  s.line([iso(1.48, d + 0.36, 31), iso(1.48, d + 0.36, 26)], PAL.woodDark, 0.8);
  s.face([[0.5, d + 0.36, 27], [1.6, d + 0.36, 27], [1.6, d + 0.36, 18], [0.5, d + 0.36, 18]], PAL.cream, edge(0.7, 1));
  const a = iso(0.78, d + 0.36, 22.5);
  const b = iso(1.28, d + 0.36, 22.5);
  s.ellipse(a.x, a.y, 3, 1.6, { fill: 0xffffff, stroke: PAL.teal, strokeAlpha: 1, width: 1 });
  s.ellipse(b.x, b.y, 4.6, 2.3, { fill: 0xffffff, stroke: PAL.teal, strokeAlpha: 1, width: 1 });
  return s;
}

export function homeSketch(h: HomeSpec): Sketch {
  const s = new Sketch();
  const height = h.style === "townhouse" ? 46 : h.style === "bungalow" ? 25 : 31;
  s.box(-0.04, -0.04, 0, 1.08, 1.08, 3, wallShades(PAL.stone));
  s.box(0, 0, 3, 1, 1, height - 3, wallShades(h.wall));

  const rows = h.style === "townhouse" ? [12, 30] : [11];
  const door = h.door;
  for (const z of rows) {
    const isGround = z === rows[0];
    if (door === "left") {
      if (isGround) {
        s.leftRect(1, 0.56, 0.84, 3, 22, PAL.frame, edge(0.6));
        s.leftRect(1, 0.59, 0.81, 4, 20, shade(h.roof, 0.85), null);
        const k = iso(0.78, 1, 11);
        s.circle(k.x, k.y, 0.7, { fill: PAL.gold });
        leftWindow(s, 1, 0.14, 0.42, z, z + 11);
      } else {
        leftWindow(s, 1, 0.14, 0.42, z, z + 10);
        leftWindow(s, 1, 0.56, 0.84, z, z + 10);
      }
      rightWindow(s, 1, 0.3, 0.7, z, z + (isGround ? 11 : 10));
    } else {
      if (isGround) {
        s.rightRect(1, 0.18, 0.44, 3, 22, PAL.frame, edge(0.6));
        s.rightRect(1, 0.21, 0.41, 4, 20, shade(h.roof, 0.7), null);
        rightWindow(s, 1, 0.58, 0.84, z, z + 11);
      } else {
        rightWindow(s, 1, 0.16, 0.44, z, z + 10);
        rightWindow(s, 1, 0.58, 0.84, z, z + 10);
      }
      leftWindow(s, 1, 0.3, 0.7, z, z + (isGround ? 11 : 10));
    }
  }

  // Window box with flowers under a ground-floor window.
  if (h.style !== "townhouse") {
    if (door === "left") {
      s.box(0.12, 1, 8, 0.32, 0.08, 3, wallShades(PAL.wood));
      for (const x of [0.17, 0.28, 0.39]) {
        const p = iso(x, 1.04, 12);
        s.circle(p.x, p.y, 1.4, { fill: x === 0.28 ? 0xf5bf42 : 0xe85a6a });
      }
    } else {
      s.box(1, 0.56, 8, 0.08, 0.3, 3, wallShades(PAL.wood));
      for (const y of [0.6, 0.71, 0.82]) {
        const p = iso(1.04, y, 12);
        s.circle(p.x, p.y, 1.4, { fill: y === 0.71 ? 0xf5bf42 : 0xe85a6a });
      }
    }
  }

  // Small porch canopy over the door on bungalows.
  if (h.style === "bungalow") {
    if (door === "left") {
      s.face([[0.5, 1, 25], [0.9, 1, 25], [0.9, 1.22, 21], [0.5, 1.22, 21]], h.roof, edge(0.5));
    } else {
      s.face([[1, 0.12, 25], [1, 0.5, 25], [1.22, 0.5, 21], [1.22, 0.12, 21]], shade(h.roof, 0.8), edge(0.5));
    }
  }

  const ridge = h.style === "townhouse" ? "y" : "x";
  const rh = h.style === "bungalow" ? 22 : h.style === "townhouse" ? 15 : 18;
  if (h.style === "cottage") {
    // Chimney sits behind the ridge so the front slope overlaps its base.
    s.box(0.62, 0.18, height, 0.18, 0.18, rh + 6, wallShades(0xb5523a));
  }
  gableRoof(s, 1, 1, height, rh, 0.1, ridge, h.roof, h.wall);
  return s;
}

export function treeSketch(kind: "round" | "pine" | "bush", variant: number): Sketch {
  const s = new Sketch();
  const base = iso(0.5, 0.5);
  if (kind === "bush") {
    const tint = variant % 2 ? PAL.leaf : mix(PAL.leaf, PAL.leafLight, 0.3);
    for (const [dx, dy, r] of [[-5, -4, 5], [4, -4, 5.5], [0, -7, 6]] as const) {
      s.circle(base.x + dx, base.y + dy, r, { fill: shade(tint, 0.9), stroke: OUTLINE, strokeAlpha: 0.35, width: 0.8 });
    }
    s.circle(base.x - 1.5, base.y - 9, 2.5, { fill: PAL.leafLight, alpha: 0.9 });
    return s;
  }
  s.poly(
    [
      { x: base.x - 1.6, y: base.y },
      { x: base.x + 1.6, y: base.y },
      { x: base.x + 1.3, y: base.y - 14 },
      { x: base.x - 1.3, y: base.y - 14 },
    ],
    { fill: PAL.trunk, ...edge(0.5, 0.8) },
  );
  if (kind === "pine") {
    const layers = [
      { y: -12, w: 12, h: 14 },
      { y: -21, w: 10, h: 13 },
      { y: -29, w: 7.5, h: 12 },
    ];
    for (const L of layers) {
      const top: V2 = { x: base.x, y: base.y + L.y - L.h };
      const left: V2 = { x: base.x - L.w, y: base.y + L.y };
      const right: V2 = { x: base.x + L.w, y: base.y + L.y };
      const mid: V2 = { x: base.x, y: base.y + L.y + 1.5 };
      s.poly([top, left, mid], { fill: PAL.pineLight });
      s.poly([top, mid, right], { fill: PAL.pine });
      s.poly([top, left, mid, right], { ...edge(0.45, 0.9) });
    }
    return s;
  }
  const cy = base.y - 22;
  const tone = variant % 2 ? 0 : 0.25;
  s.circle(base.x + 2.5, cy + 2.5, 12.5, { fill: PAL.leafDark });
  s.circle(base.x, cy, 12, { fill: mix(PAL.leaf, PAL.leafLight, tone), stroke: OUTLINE, strokeAlpha: 0.45, width: 1 });
  s.circle(base.x - 5, cy + 4, 6.5, { fill: mix(PAL.leaf, PAL.leafLight, tone + 0.1) });
  s.circle(base.x - 3.5, cy - 4.5, 5, { fill: PAL.leafLight, alpha: 0.95 });
  s.circle(base.x + 5, cy + 5.5, 4, { fill: PAL.leafDark, alpha: 0.6 });
  return s;
}

export function noticeboardSketch(): Sketch {
  const s = new Sketch();
  const y = 0.62;
  for (const x of [0.2, 0.8]) s.box(x - 0.04, y - 0.04, 0, 0.08, 0.08, 30, wallShades(PAL.woodDark));
  s.face([[0.14, y, 10], [0.86, y, 10], [0.86, y, 29], [0.14, y, 29]], PAL.wood, edge(0.6));
  s.face([[0.18, y + 0.001, 12], [0.82, y + 0.001, 12], [0.82, y + 0.001, 27], [0.18, y + 0.001, 27]], 0xdca46c, null);
  s.face([[0.08, y - 0.12, 30], [0.92, y - 0.12, 30], [0.92, y + 0.12, 33], [0.08, y + 0.12, 33]], PAL.terracotta, edge(0.5));
  // A couple of general notices that are always there.
  s.face([[0.6, y + 0.002, 15], [0.76, y + 0.002, 15], [0.76, y + 0.002, 24], [0.6, y + 0.002, 24]], 0xfaf3e3, edge(0.3, 0.6));
  s.face([[0.5, y + 0.002, 22], [0.6, y + 0.002, 22], [0.6, y + 0.002, 26], [0.5, y + 0.002, 26]], 0xf5bf42, edge(0.3, 0.6));
  return s;
}

/** RSVP sign-up sheet pinned on the noticeboard (same local frame). */
export function rsvpSheetSketch(): Sketch {
  const s = new Sketch();
  const y = 0.625;
  s.face([[0.22, y, 13], [0.46, y, 13], [0.46, y, 27], [0.22, y, 27]], 0xffffff, edge(0.5, 0.7));
  for (let i = 0; i < 4; i++) {
    const z = 24 - i * 3;
    s.line([iso(0.25, y, z), iso(0.29, y, z - 1)], PAL.teal, 0.9);
    s.line([iso(0.32, y, z), iso(0.43, y, z)], 0x9a8b7a, 0.7, 0.8);
  }
  const pin = iso(0.34, y, 27);
  s.circle(pin.x, pin.y, 1.3, { fill: 0xe0673f });
  return s;
}

export function feedbackBoxSketch(): Sketch {
  const s = new Sketch();
  s.box(0.46, 0.46, 0, 0.08, 0.08, 14, wallShades(PAL.woodDark));
  s.box(0.3, 0.32, 14, 0.4, 0.36, 12, wallShades(PAL.teal));
  s.face([[0.38, 0.68, 22], [0.62, 0.68, 22], [0.62, 0.68, 23.5], [0.38, 0.68, 23.5]], 0x1b3b37, null);
  // Speech bubble icon on the side.
  const c = iso(0.7, 0.5, 20);
  s.ellipse(c.x, c.y, 3, 2.4, { fill: 0xffffff });
  s.poly([{ x: c.x - 1, y: c.y + 1.5 }, { x: c.x - 2.6, y: c.y + 3.6 }, { x: c.x + 0.6, y: c.y + 2 }], { fill: 0xffffff });
  return s;
}

/** Chalkboard A-frame: "Small, please" reminder for students. */
export function smallPleaseSignSketch(): Sketch {
  const s = new Sketch();
  s.face([[0.3, 0.5, 0], [0.7, 0.5, 0], [0.66, 0.42, 18], [0.34, 0.42, 18]], PAL.woodDark, edge(0.6));
  s.face([[0.33, 0.5, 2], [0.67, 0.5, 2], [0.64, 0.43, 16.5], [0.36, 0.43, 16.5]], 0x2f4a3f, null);
  const a = iso(0.43, 0.47, 9);
  const b = iso(0.58, 0.47, 9);
  s.ellipse(a.x, a.y, 2.2, 1.1, { stroke: 0xffffff, strokeAlpha: 0.95, width: 0.9 });
  s.ellipse(b.x, b.y, 3.4, 1.6, { stroke: 0xffffff, strokeAlpha: 0.95, width: 0.9 });
  s.line([iso(0.4, 0.46, 13.5), iso(0.6, 0.45, 13.5)], 0xf5bf42, 0.9);
  return s;
}

export function benchSketch(): Sketch {
  const s = new Sketch();
  s.box(0.2, 0.42, 0, 0.06, 0.16, 6, wallShades(PAL.woodDark));
  s.box(0.74, 0.42, 0, 0.06, 0.16, 6, wallShades(PAL.woodDark));
  s.box(0.16, 0.38, 6, 0.68, 0.24, 2, wallShades(PAL.wood));
  s.box(0.16, 0.36, 8, 0.68, 0.04, 7, wallShades(PAL.wood));
  return s;
}

export function lampSketch(): Sketch {
  const s = new Sketch();
  s.box(0.46, 0.46, 0, 0.08, 0.08, 30, wallShades(0x4a5560));
  const c = iso(0.5, 0.5, 33);
  s.circle(c.x, c.y, 3.6, { fill: 0xfff1b8, stroke: OUTLINE, strokeAlpha: 0.5, width: 0.8 });
  s.poly([{ x: c.x - 4, y: c.y - 3 }, { x: c.x + 4, y: c.y - 3 }, { x: c.x, y: c.y - 7 }], { fill: 0x4a5560 });
  return s;
}

export function flagpoleSketch(): Sketch {
  const s = new Sketch();
  s.box(0.47, 0.47, 0, 0.06, 0.06, 44, wallShades(0xe8e2d6));
  const top = iso(0.5, 0.5, 44);
  s.circle(top.x, top.y - 1, 1.6, { fill: PAL.gold });
  return s;
}

/** Flag cloth drawn with its left edge at the origin so it can flutter by scaling. */
export function flagClothSketch(): Sketch {
  const s = new Sketch();
  s.poly([{ x: 0, y: 0 }, { x: 18, y: 2 }, { x: 18, y: 13 }, { x: 0, y: 11 }], { fill: PAL.teal, ...edge(0.5, 0.8) });
  // Leaf emblem.
  s.ellipse(9, 6.8, 4, 2.4, { fill: 0xfff3dc });
  s.line([{ x: 6, y: 8.6 }, { x: 12, y: 5 }], PAL.teal, 0.8);
  return s;
}

export function tableSketch(): Sketch {
  const s = new Sketch();
  s.box(0.47, 0.47, 0, 0.06, 0.06, 26, wallShades(0xe8e2d6));
  const top = iso(0.5, 0.5, 10);
  s.ellipse(top.x, top.y, 13, 6.5, { fill: PAL.wood, stroke: OUTLINE, strokeAlpha: 0.45, width: 0.9 });
  s.ellipse(top.x, top.y - 1.4, 13, 6.5, { fill: shade(PAL.wood, 1.15), stroke: OUTLINE, strokeAlpha: 0.45, width: 0.9 });
  const u = iso(0.5, 0.5, 30);
  // Striped parasol.
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const a0 = (Math.PI * 2 * i) / segs;
    const a1 = (Math.PI * 2 * (i + 1)) / segs;
    s.poly(
      [
        { x: u.x, y: u.y - 7 },
        { x: u.x + Math.cos(a0) * 19, y: u.y + Math.sin(a0) * 9.5 },
        { x: u.x + Math.cos(a1) * 19, y: u.y + Math.sin(a1) * 9.5 },
      ],
      { fill: i % 2 ? PAL.cream : PAL.terracotta },
    );
  }
  s.ellipse(u.x, u.y, 19, 9.5, { stroke: OUTLINE, strokeAlpha: 0.45, width: 0.9 });
  s.circle(u.x, u.y - 7, 1.4, { fill: PAL.gold });
  return s;
}

export function binSketch(): Sketch {
  const s = new Sketch();
  s.box(0.32, 0.32, 0, 0.36, 0.36, 14, wallShades(0x5f8f6a));
  s.box(0.29, 0.29, 14, 0.42, 0.42, 3, wallShades(0x4b7556));
  const c = iso(0.5, 0.68, 7);
  s.ellipse(c.x, c.y, 3, 2.2, { stroke: 0xffffff, strokeAlpha: 0.9, width: 0.9 });
  return s;
}

export function cratesSketch(): Sketch {
  const s = new Sketch();
  s.box(0.15, 0.3, 0, 0.36, 0.36, 10, wallShades(PAL.wood));
  s.box(0.56, 0.4, 0, 0.3, 0.3, 8, wallShades(shade(PAL.wood, 1.1)));
  s.box(0.22, 0.36, 10, 0.26, 0.26, 8, wallShades(shade(PAL.wood, 0.92)));
  const c = iso(0.7, 0.55, 9);
  s.circle(c.x - 1.5, c.y, 1.8, { fill: 0xe85a3a });
  s.circle(c.x + 1.8, c.y + 0.4, 1.8, { fill: 0xf5bf42 });
  s.circle(c.x + 0.2, c.y - 1.4, 1.8, { fill: 0x7cc35a });
  return s;
}

export function flowerbedSketch(variant: number): Sketch {
  const s = new Sketch();
  s.box(0.18, 0.18, 0, 0.64, 0.64, 3, wallShades(0x8c6447));
  const rng = createRng(77 + variant);
  const colors = [0xf5bf42, 0xe85a6a, 0xffffff, 0xb07ad8];
  for (let i = 0; i < 9; i++) {
    const p = iso(0.26 + rng() * 0.48, 0.26 + rng() * 0.48, 4 + rng() * 2);
    s.circle(p.x, p.y - 1, 1.3, { fill: PAL.leaf });
    s.circle(p.x, p.y - 2.2, 1.2, { fill: colors[i % colors.length] });
  }
  return s;
}

/** Fence, stakes and a sign around the expansion meadow. Origin = meadow back corner. */
export function meadowSketch(): Sketch {
  const s = new Sketch();
  const { w, d } = MEADOW;
  // Dotted survey outline on the ground.
  const ring: [number, number][] = [
    [0.15, 0.15],
    [w - 0.15, 0.15],
    [w - 0.15, d - 0.15],
    [0.15, d - 0.15],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % 4];
    const steps = 14;
    for (let j = 0; j < steps; j += 2) {
      const t0 = j / steps;
      const t1 = (j + 1) / steps;
      s.line([iso(ax + (bx - ax) * t0, ay + (by - ay) * t0), iso(ax + (bx - ax) * t1, ay + (by - ay) * t1)], 0xf0a92b, 1.6, 0.95);
    }
  }
  // Fence along the back edges.
  const post = (x: number, y: number) => s.box(x - 0.03, y - 0.03, 0, 0.06, 0.06, 9, wallShades(0xf3e9d6), edge(0.4, 0.7));
  for (let i = 0; i <= w * 2; i++) post((i / 2), 0);
  for (let i = 1; i <= d * 2; i++) post(0, i / 2);
  s.line([iso(0, 0, 7), iso(w, 0, 7)], 0xe6d9c0, 1.2);
  s.line([iso(0, 0, 4), iso(w, 0, 4)], 0xe6d9c0, 1.2);
  s.line([iso(0, 0, 7), iso(0, d, 7)], 0xf3e9d6, 1.2);
  s.line([iso(0, 0, 4), iso(0, d, 4)], 0xf3e9d6, 1.2);
  // Survey stakes with flags at the inner corners.
  for (const [x, y] of [[0.5, 0.5], [w - 0.5, 0.5], [w - 0.5, d - 0.5], [0.5, d - 0.5]] as const) {
    s.box(x - 0.02, y - 0.02, 0, 0.04, 0.04, 14, wallShades(PAL.wood), edge(0.4, 0.6));
    const t = iso(x, y, 14);
    s.poly([t, { x: t.x + 6, y: t.y + 2 }, { x: t.x, y: t.y + 4 }], { fill: 0xf0a92b, ...edge(0.4, 0.6) });
  }
  // Wildflowers.
  const rng = createRng(4242);
  for (let i = 0; i < 26; i++) {
    const p = iso(0.4 + rng() * (w - 0.8), 0.4 + rng() * (d - 0.8));
    s.circle(p.x, p.y - 1, 1.1, { fill: rng() < 0.5 ? 0xffffff : 0xf5bf42 });
  }
  // Wooden sign near the gate.
  s.box(1.42, d - 0.3, 0, 0.05, 0.05, 15, wallShades(PAL.woodDark));
  s.face([[1.1, d - 0.25, 12], [1.85, d - 0.25, 12], [1.85, d - 0.25, 21], [1.1, d - 0.25, 21]], PAL.wood, edge(0.6));
  const c = iso(1.48, d - 0.25, 16.5);
  s.circle(c.x, c.y, 3.2, { fill: PAL.cream });
  s.line([{ x: c.x - 1.8, y: c.y }, { x: c.x + 1.8, y: c.y }], PAL.leafDark, 1.1);
  s.line([{ x: c.x, y: c.y - 1.8 }, { x: c.x, y: c.y + 1.8 }], PAL.leafDark, 1.1);
  return s;
}

/** Glowing footprint outline for hover/selection. */
export function selectionSketch(w: number, d: number): Sketch {
  const s = new Sketch();
  const m = 0.12;
  const pts = [iso(-m, -m), iso(w + m, -m), iso(w + m, d + m), iso(-m, d + m)];
  s.poly(pts, { fill: 0xffe08a, alpha: 0.28 });
  s.poly(pts, { stroke: 0xffcf4d, strokeAlpha: 1, width: 2.4 });
  const inner = [iso(0.05, 0.05), iso(w - 0.05, 0.05), iso(w - 0.05, d - 0.05), iso(0.05, d - 0.05)];
  s.poly(inner, { stroke: 0xffffff, strokeAlpha: 0.75, width: 1 });
  return s;
}

export function markerSketch(): Sketch {
  const s = new Sketch();
  s.poly([{ x: -5, y: -12 }, { x: 5, y: -12 }, { x: 0, y: 0 }], { fill: PAL.gold, ...edge(0.7, 1.1) });
  s.circle(0, -15, 8, { fill: PAL.gold, ...edge(0.7, 1.1) });
  s.circle(0, -15, 3.6, { fill: 0xffffff });
  return s;
}

export function plusBadgeSketch(): Sketch {
  const s = new Sketch();
  s.circle(0, 0, 9, { fill: 0xffffff, ...edge(0.6, 1.1) });
  s.line([{ x: -4.5, y: 0 }, { x: 4.5, y: 0 }], PAL.leafDark, 2.4);
  s.line([{ x: 0, y: -4.5 }, { x: 0, y: 4.5 }], PAL.leafDark, 2.4);
  return s;
}

export function puffSketch(): Sketch {
  const s = new Sketch();
  s.circle(0, 0, 7, { fill: 0xffffff, alpha: 0.22 });
  s.circle(0, 0, 5, { fill: 0xffffff, alpha: 0.32 });
  s.circle(-1, -1, 3, { fill: 0xffffff, alpha: 0.5 });
  return s;
}

export function cloudSketch(variant: number): Sketch {
  const s = new Sketch();
  const blobs =
    variant === 0
      ? [[0, 0, 16], [18, -6, 20], [38, 0, 15], [24, 6, 14], [8, 6, 12]]
      : [[0, 0, 13], [15, -5, 16], [30, 0, 12], [18, 5, 11]];
  for (const [x, y, r] of blobs) s.circle(x, y + 3, r, { fill: 0xd7ecf2, alpha: 0.9 });
  for (const [x, y, r] of blobs) s.circle(x, y, r, { fill: 0xffffff, alpha: 0.95 });
  return s;
}

export function shimmerSketch(): Sketch {
  const s = new Sketch();
  s.line([{ x: -6, y: 0 }, { x: 6, y: -3 }], 0xffffff, 1.4, 0.85);
  return s;
}

export function sparkleSketch(): Sketch {
  const s = new Sketch();
  s.poly(
    [
      { x: 0, y: -6 },
      { x: 1.4, y: -1.4 },
      { x: 6, y: 0 },
      { x: 1.4, y: 1.4 },
      { x: 0, y: 6 },
      { x: -1.4, y: 1.4 },
      { x: -6, y: 0 },
      { x: -1.4, y: -1.4 },
    ],
    { fill: 0xfff1a8, stroke: 0xf0a92b, strokeAlpha: 0.8, width: 0.7 },
  );
  return s;
}

export const CITIZEN_LOOKS = [
  { shirt: 0xe0673f, skin: 0xf1c9a5, hair: 0x3b2a20, bag: 0x2a9a8d },
  { shirt: 0x2a9a8d, skin: 0xc68a5c, hair: 0x1f1714, bag: 0xf5bf42 },
  { shirt: 0xf5bf42, skin: 0x8e5a36, hair: 0x1f1714, bag: 0x4d7fa3 },
  { shirt: 0x4d7fa3, skin: 0xe9b98e, hair: 0x9a5a2c, bag: 0xe0673f },
  { shirt: 0x8a5a9e, skin: 0xf1c9a5, hair: 0x5b3a26, bag: 0x7cc35a },
  { shirt: 0x5fa04e, skin: 0xa86b43, hair: 0x1f1714, bag: 0xfff3dc },
] as const;

/** A small student figure. Origin at the feet. `frame` alternates the stride. */
export function citizenSketch(look: (typeof CITIZEN_LOOKS)[number], frame: 0 | 1): Sketch {
  const s = new Sketch();
  s.ellipse(0, 0, 4.2, 1.9, { fill: PAL.shadow, alpha: 0.25 });
  const legs = frame === 0 ? [[-2, 0], [0.6, 0]] : [[-1.2, -0.8], [0, 0.4]];
  for (const [x, dy] of legs) {
    s.poly(
      [
        { x, y: -6 },
        { x: x + 1.6, y: -6 },
        { x: x + 1.6, y: dy },
        { x, y: dy },
      ],
      { fill: 0x3c4a5c },
    );
  }
  s.poly(
    [
      { x: -3.4, y: -12.5 },
      { x: 3.4, y: -12.5 },
      { x: 3.6, y: -5.2 },
      { x: -3.6, y: -5.2 },
    ],
    { fill: look.shirt, stroke: OUTLINE, strokeAlpha: 0.5, width: 0.7 },
  );
  // Backpack peeking out on one side.
  s.poly(
    [
      { x: 2.6, y: -12 },
      { x: 4.6, y: -11.4 },
      { x: 4.6, y: -6.6 },
      { x: 2.6, y: -6.4 },
    ],
    { fill: look.bag, stroke: OUTLINE, strokeAlpha: 0.4, width: 0.6 },
  );
  s.circle(0, -16.6, 3.6, { fill: look.hair });
  s.circle(0, -15.6, 3.2, { fill: look.skin, stroke: OUTLINE, strokeAlpha: 0.5, width: 0.7 });
  s.circle(0, -17.4, 3, { fill: look.hair });
  return s;
}

function groundSketch(): Sketch {
  const s = new Sketch();
  const D = GROUND_DEPTH;
  const rng = createRng(1357);
  const land = (x: number, y: number) => tileAt(x, y) !== "water";

  // Foam ring and soft shadow in the water around the island.
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!land(x, y)) continue;
      const nearWater = !land(x + 1, y) || !land(x, y + 1) || !land(x - 1, y) || !land(x, y - 1);
      if (!nearWater) continue;
      const g = 0.32;
      s.poly([iso(x - g, y - g, -D - 3), iso(x + 1 + g, y - g, -D - 3), iso(x + 1 + g, y + 1 + g, -D - 3), iso(x - g, y + 1 + g, -D - 3)], {
        fill: 0x3f8fa6,
        alpha: 0.1,
      });
    }
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!land(x, y)) continue;
      if (!land(x + 1, y) || !land(x, y + 1)) {
        const g = 0.14;
        s.poly([iso(x - g, y - g, -D), iso(x + 1 + g, y - g, -D), iso(x + 1 + g, y + 1 + g, -D), iso(x - g, y + 1 + g, -D)], {
          fill: PAL.foam,
          alpha: 0.55,
        });
      }
    }
  }

  const order: [number, number][] = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (land(x, y)) order.push([x, y]);
  order.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

  const walkLike = (x: number, y: number) => {
    const k = tileAt(x, y);
    return k === "path" || k === "plaza" || k === "terrace";
  };

  for (const [x, y] of order) {
    const k = tileAt(x, y);
    const N = iso(x, y);
    const E = iso(x + 1, y);
    const S = iso(x + 1, y + 1);
    const W = iso(x, y + 1);
    const down = (p: V2, dz: number) => ({ x: p.x, y: p.y + dz });

    // Cliff faces on the island's front edges.
    if (!land(x + 1, y)) {
      s.poly([E, S, down(S, D), down(E, D)], { fill: PAL.cliffR });
      s.poly([down(E, D - 7), down(S, D - 7), down(S, D), down(E, D)], { fill: PAL.cliffBand });
      s.line([E, S], shade(PAL.grassA, 0.75), 2);
    }
    if (!land(x, y + 1)) {
      s.poly([W, S, down(S, D), down(W, D)], { fill: PAL.cliffL });
      s.poly([down(W, D - 7), down(S, D - 7), down(S, D), down(W, D)], { fill: shade(PAL.cliffBand, 1.1) });
      s.line([W, S], shade(PAL.grassA, 0.8), 2);
    }

    let fill: number;
    switch (k) {
      case "path":
        fill = rng() < 0.5 ? PAL.path : shade(PAL.path, 0.985);
        break;
      case "plaza":
        fill = (x + y) % 2 ? PAL.plaza : shade(PAL.plaza, 0.97);
        break;
      case "terrace":
        fill = (x + y) % 2 ? PAL.terrace : shade(PAL.terrace, 0.96);
        break;
      case "meadow":
        fill = (x + y) % 2 ? PAL.meadowA : PAL.meadowB;
        break;
      default:
        fill = (x + y) % 2 ? PAL.grassA : PAL.grassB;
        if (rng() < 0.25) fill = shade(fill, 0.97);
    }
    s.poly([N, E, S, W], { fill });

    if (k === "plaza" || k === "terrace") {
      const line = k === "plaza" ? PAL.plazaLine : PAL.terraceLine;
      s.line([iso(x + 0.5, y), iso(x + 0.5, y + 1)], line, 0.8, 0.8);
      s.line([iso(x, y + 0.5), iso(x + 1, y + 0.5)], line, 0.8, 0.8);
    }
    if (walkLike(x, y)) {
      const edges: [boolean, V2, V2][] = [
        [!walkLike(x, y - 1), N, E],
        [!walkLike(x + 1, y), E, S],
        [!walkLike(x, y + 1), S, W],
        [!walkLike(x - 1, y), W, N],
      ];
      for (const [show, a, b] of edges) if (show) s.line([a, b], PAL.pathEdge, 1.6, 0.9);
    } else if (k === "grass" && rng() < 0.45) {
      const p = iso(x + 0.2 + rng() * 0.6, y + 0.2 + rng() * 0.6);
      s.line([{ x: p.x - 2, y: p.y }, { x: p.x - 1, y: p.y - 3 }], PAL.tuft, 1, 0.8);
      s.line([{ x: p.x + 1, y: p.y }, { x: p.x + 2, y: p.y - 3.2 }], PAL.tuft, 1, 0.8);
    }
  }

  // Soft cast shadows (light from the upper left falls toward +x).
  const shadow = (x: number, y: number, w: number, d: number, len: number, alpha = 0.18) =>
    s.poly([iso(x, y), iso(x + w + len, y), iso(x + w + len, y + d), iso(x, y + d)], { fill: PAL.shadow, alpha });
  shadow(KITCHEN.x, KITCHEN.y, KITCHEN.w, KITCHEN.d, 0.9);
  for (const h of HOMES) shadow(h.x, h.y, 1, 1, h.style === "townhouse" ? 0.8 : 0.55);
  for (const t of TREES) {
    const p = iso(t.x + 0.62, t.y + 0.55);
    if (t.kind === "bush") s.ellipse(p.x, p.y, 8, 4, { fill: PAL.shadow, alpha: 0.16 });
    else s.ellipse(p.x + 4, p.y, 13, 6, { fill: PAL.shadow, alpha: 0.16 });
  }
  for (const f of FLOWERBEDS) shadow(f.x + 0.18, f.y + 0.18, 0.64, 0.64, 0.15, 0.12);
  shadow(BIN.x + 0.32, BIN.y + 0.32, 0.36, 0.36, 0.3, 0.14);
  return s;
}

export interface ArtCatalog {
  ground: BakedTexture;
  kitchen: BakedTexture;
  cook: BakedTexture;
  sizesSign: BakedTexture;
  homes: Record<string, BakedTexture>;
  trees: Record<string, BakedTexture>;
  noticeboard: BakedTexture;
  rsvpSheet: BakedTexture;
  feedbackBox: BakedTexture;
  smallPleaseSign: BakedTexture;
  bench: BakedTexture;
  lamp: BakedTexture;
  flagpole: BakedTexture;
  flagCloth: BakedTexture;
  table: BakedTexture;
  bin: BakedTexture;
  crates: BakedTexture;
  flowerbeds: BakedTexture[];
  meadow: BakedTexture;
  selKitchen: BakedTexture;
  selMeadow: BakedTexture;
  selTile: BakedTexture;
  marker: BakedTexture;
  plusBadge: BakedTexture;
  puff: BakedTexture;
  clouds: BakedTexture[];
  shimmer: BakedTexture;
  sparkle: BakedTexture;
  citizens: [BakedTexture, BakedTexture][];
}

/** Bakes every texture once. Safe to call again: existing keys are replaced. */
export function bakeArt(scene: Phaser.Scene): ArtCatalog {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const remove = (key: string) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  };
  const b = (key: string, sk: Sketch) => {
    remove(key);
    return bake(g, key, sk);
  };
  const homes: Record<string, BakedTexture> = {};
  for (const h of HOMES) homes[h.id] = b(`home-${h.id}`, homeSketch(h));
  const trees: Record<string, BakedTexture> = {};
  for (const kind of ["round", "pine", "bush"] as const) {
    for (const v of [0, 1]) trees[`${kind}-${v}`] = b(`tree-${kind}-${v}`, treeSketch(kind, v));
  }
  const catalog: ArtCatalog = {
    ground: b("ground", groundSketch()),
    kitchen: b("kitchen", kitchenSketch()),
    cook: b("cook", cookSketch()),
    sizesSign: b("sizes-sign", sizesSignSketch()),
    homes,
    trees,
    noticeboard: b("noticeboard", noticeboardSketch()),
    rsvpSheet: b("rsvp-sheet", rsvpSheetSketch()),
    feedbackBox: b("feedback-box", feedbackBoxSketch()),
    smallPleaseSign: b("small-please-sign", smallPleaseSignSketch()),
    bench: b("bench", benchSketch()),
    lamp: b("lamp", lampSketch()),
    flagpole: b("flagpole", flagpoleSketch()),
    flagCloth: b("flag-cloth", flagClothSketch()),
    table: b("table", tableSketch()),
    bin: b("bin", binSketch()),
    crates: b("crates", cratesSketch()),
    flowerbeds: [0, 1, 2].map((v) => b(`flowerbed-${v}`, flowerbedSketch(v))),
    meadow: b("meadow", meadowSketch()),
    selKitchen: b("sel-kitchen", selectionSketch(KITCHEN.w, KITCHEN.d)),
    selMeadow: b("sel-meadow", selectionSketch(MEADOW.w, MEADOW.d)),
    selTile: b("sel-tile", selectionSketch(1, 1)),
    marker: b("marker", markerSketch()),
    plusBadge: b("plus-badge", plusBadgeSketch()),
    puff: b("puff", puffSketch()),
    clouds: [0, 1].map((v) => b(`cloud-${v}`, cloudSketch(v))),
    shimmer: b("shimmer", shimmerSketch()),
    sparkle: b("sparkle", sparkleSketch()),
    citizens: CITIZEN_LOOKS.map((look, i) => [
      b(`citizen-${i}-0`, citizenSketch(look, 0)),
      b(`citizen-${i}-1`, citizenSketch(look, 1)),
    ]),
  };
  g.destroy();
  return catalog;
}

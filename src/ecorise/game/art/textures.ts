import type Phaser from "phaser";
import { createRng } from "../../model/rng";
import {
  BARRIER_POSTS,
  FLOWERBEDS,
  GRID,
  HOMES,
  KITCHEN,
  YARD,
  MEADOW,
  TABLES,
  TRAY_RETURN,
  TREES,
  tileAt,
  type HomeSpec,
} from "../layout";
import {
  AtlasBuilder,
  OUTLINE,
  Sketch,
  bake,
  css,
  iso,
  mix,
  shade,
  softShadow,
  wallText,
  type BakedTexture,
  type P3,
  type V2,
} from "./iso";

/**
 * Procedural art, baked once at boot. One light (warm sun from the upper
 * left, cool shade on the right), one outline colour and one palette keep
 * the whole town coherent.
 */
export const PAL = {
  grass: 0x7fa04a,
  grassLight: 0x9db85c,
  grassDark: 0x5d7f35,
  tuft: 0x4f6e2c,
  paver: 0xd8c39a,
  paverDark: 0xb9a175,
  kerb: 0x8c7653,
  deck: 0xb58858,
  deckLine: 0x8e6740,
  yard: 0xc5bdae,
  meadow: 0xa9bd63,
  cliffTop: 0x9b7552,
  cliffBottom: 0x5b4330,
  moss: 0x6f8f3a,
  foam: 0xf3ecdd,
  ivory: 0xf3ecdd,
  stone: 0xd2c6b0,
  render: 0xeee4d0,
  forest: 0x1f3a2a,
  forestMid: 0x2f5a3c,
  gold: 0xc9a24b,
  terracotta: 0xb4573a,
  bronze: 0x4a3a2c,
  glow: 0xffcf86,
  glowDeep: 0xe89a4c,
  glass: 0x9fb9bf,
  steel: 0xc9cfd2,
  wood: 0x9c7048,
  woodDark: 0x6b4a2f,
  leaf: 0x5f8a36,
  leafLight: 0x9fc05e,
  leafDark: 0x3e6127,
  pine: 0x355e36,
  pineLight: 0x5d8c48,
  trunk: 0x6e4a30,
  shadow: 0x1d2a22,
  stew: 0xc0682e,
  greens: 0x6f9a3a,
  rice: 0xf1e6c8,
} as const;

export const GROUND_DEPTH = 26;
const CAF_WALL = 60;

const wallShades = (c: number) => ({ top: shade(c, 1.05), left: c, right: mix(shade(c, 0.8), 0x5b6b80, 0.12) });
const edge = (alpha = 0.32, width = 0.8) => ({ stroke: OUTLINE, strokeAlpha: alpha, width });

export interface ArtFonts {
  body: string;
  display: string;
}

// ------------------------------------------------------------- helpers

function polyPath(ctx: CanvasRenderingContext2D, pts: V2[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

const P = (pts: readonly P3[]) => pts.map(([x, y, z]) => iso(x, y, z));

function linear(ctx: CanvasRenderingContext2D, a: V2, b: V2, stops: [number, string][]) {
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

/** Gable roof over a w × d footprint whose walls end at height h. */
function gableRoof(s: Sketch, w: number, d: number, h: number, rh: number, o: number, ridge: "x" | "y", roof: number, wall: number) {
  const side = mix(shade(roof, 0.74), 0x4d5d70, 0.12);
  if (ridge === "x") {
    const ym = d / 2;
    s.face([[-o, -o, h], [w + o, -o, h], [w + o, ym, h + rh], [-o, ym, h + rh]], shade(roof, 0.7));
    s.face([[w, 0, h], [w, d, h], [w, ym, h + rh]], wallShades(wall).right);
    s.face([[-o, ym, h + rh], [w + o, ym, h + rh], [w + o, d + o, h], [-o, d + o, h]], roof);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const y = ym + (d + o - ym) * t;
      const z = h + rh - rh * t;
      s.line([iso(-o + 0.02, y, z), iso(w + o - 0.02, y, z)], shade(roof, 0.8), 0.6, 0.55);
    }
    s.line([iso(-o, d + o, h), iso(w + o, d + o, h)], shade(roof, 0.5), 1.3, 0.85);
  } else {
    const xm = w / 2;
    s.face([[-o, -o, h], [xm, -o, h + rh], [xm, d + o, h + rh], [-o, d + o, h]], shade(roof, 0.7));
    s.face([[0, d, h], [w, d, h], [xm, d, h + rh]], wall);
    s.face([[xm, -o, h + rh], [w + o, -o, h], [w + o, d + o, h], [xm, d + o, h + rh]], side);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const x = xm + (w + o - xm) * t;
      const z = h + rh - rh * t;
      s.line([iso(x, -o + 0.02, z), iso(x, d + o - 0.02, z)], shade(side, 0.8), 0.6, 0.55);
    }
    s.line([iso(w + o, -o, h), iso(w + o, d + o, h)], shade(side, 0.5), 1.3, 0.85);
  }
}

function leftWindow(s: Sketch, y: number, xa: number, xb: number, za: number, zb: number, lit = false) {
  s.leftRect(y, xa - 0.03, xb + 0.03, za - 2, zb + 2, 0xf6efe0, edge(0.4));
  s.custom([iso(xa, y).x - 2, iso(xa, y, zb).y - 4, iso(xb, y).x + 2, iso(xb, y, za).y + 4], (ctx) => {
    const pts = P([[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]]);
    polyPath(ctx, pts);
    ctx.fillStyle = lit
      ? linear(ctx, pts[3], pts[0], [[0, css(PAL.glow)], [1, css(PAL.glowDeep)]])
      : linear(ctx, pts[3], pts[0], [[0, "#c9dde0"], [1, "#6f8790"]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 0.6;
    const a = iso(xa + (xb - xa) * 0.2, y, zb - 1);
    const b = iso(xa + (xb - xa) * 0.05, y, za + (zb - za) * 0.4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  const xm = (xa + xb) / 2;
  s.line([iso(xm, y, za), iso(xm, y, zb)], 0xf6efe0, 0.9, 0.9);
}

function rightWindow(s: Sketch, x: number, ya: number, yb: number, za: number, zb: number, lit = false) {
  s.rightRect(x, ya - 0.03, yb + 0.03, za - 2, zb + 2, 0xd9d0bf, edge(0.4));
  s.custom([iso(x, yb).x - 2, iso(x, ya, zb).y - 4, iso(x, ya).x + 2, iso(x, yb, za).y + 4], (ctx) => {
    const pts = P([[x, ya, za], [x, yb, za], [x, yb, zb], [x, ya, zb]]);
    polyPath(ctx, pts);
    ctx.fillStyle = lit
      ? linear(ctx, pts[3], pts[0], [[0, css(shade(PAL.glow, 0.95))], [1, css(shade(PAL.glowDeep, 0.85))]])
      : linear(ctx, pts[3], pts[0], [[0, "#a9bfc4"], [1, "#56707a"]]);
    ctx.fill();
  });
  const ym = (ya + yb) / 2;
  s.line([iso(x, ym, za), iso(x, ym, zb)], 0xd9d0bf, 0.9, 0.9);
}

// ----------------------------------------------------------- cafeteria

/** The school cafeteria: the hero building. Local origin = footprint back corner. */
export function cafeteriaSketch(fonts: ArtFonts): Sketch {
  const s = new Sketch();
  const w = KITCHEN.w;
  const d = KITCHEN.d;
  const H = CAF_WALL;
  const G = 34; // ground floor height incl. sign band

  // Plinth and walls.
  s.box(-0.06, -0.06, 0, w + 0.12, d + 0.12, 5, wallShades(PAL.stone));
  s.box(0, 0, 5, w, d, G - 5, wallShades(PAL.render));
  s.box(0, 0, G, w, d, H - G, wallShades(0xa47a52));

  // Timber cladding on the kitchen side (upper floor).
  for (let i = 1; i < 14; i++) {
    const y = (d * i) / 14;
    s.line([iso(w, y, G + 1), iso(w, y, H - 1)], shade(0xa47a52, 0.72), 0.6, 0.7);
  }

  // --- front, ground floor: serving hatch ---------------------------------
  const hx0 = 0.28;
  const hx1 = 1.9;
  s.leftRect(d, hx0 - 0.05, hx1 + 0.05, 10, 31, PAL.bronze, edge(0.5));
  s.custom([iso(hx0, d).x - 4, iso(hx0, d, 31).y - 10, iso(hx1, d).x + 4, iso(hx1, d, 10).y + 4], (ctx) => {
    const pts = P([[hx0, d, 12], [hx1, d, 12], [hx1, d, 29], [hx0, d, 29]]);
    polyPath(ctx, pts);
    ctx.fillStyle = linear(ctx, pts[3], pts[0], [[0, "#ffe2a8"], [0.55, css(PAL.glow)], [1, css(PAL.glowDeep)]]);
    ctx.fill();
    // Tiled back wall.
    ctx.save();
    polyPath(ctx, pts);
    ctx.clip();
    ctx.strokeStyle = "rgba(160,95,40,0.22)";
    ctx.lineWidth = 0.5;
    for (let z = 15; z < 29; z += 3) {
      const a = iso(hx0, d, z);
      const b = iso(hx1, d, z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Heat lamps.
    for (let i = 0; i < 4; i++) {
      const p = iso(hx0 + 0.25 + i * 0.38, d, 26.5);
      ctx.fillStyle = "rgba(255,190,90,0.9)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,170,60,0.25)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  // Stainless counter.
  s.box(hx0 - 0.02, d, 10, hx1 - hx0 + 0.04, 0.24, 3, {
    top: 0xe3e7e8,
    left: 0xb7bec2,
    right: 0x8e979c,
  });
  s.box(hx0 - 0.02, d, 4.5, hx1 - hx0 + 0.04, 0.2, 5.5, wallShades(0x8c959a));

  // Canopy over the queue.
  s.box(0.12, d, 31, 2.0, 0.34, 2.4, { top: 0xd8c3a0, left: 0x7a5636, right: 0x5f4129 });
  for (let i = 0; i < 4; i++) {
    const p = iso(0.4 + i * 0.48, d + 0.3, 31);
    s.circle(p.x, p.y, 0.9, { fill: 0xfff0c8 });
  }

  // Entrance doors.
  s.box(2.15, d, 0, 0.92, 0.22, 5, wallShades(PAL.stone));
  s.leftRect(d, 2.2, 3.02, 5, 28, PAL.bronze, edge(0.5));
  s.custom([iso(2.2, d).x - 2, iso(2.2, d, 28).y - 2, iso(3.02, d).x + 2, iso(3.02, d, 5).y + 2], (ctx) => {
    for (const [a, b] of [
      [2.25, 2.58],
      [2.64, 2.97],
    ]) {
      const pts = P([[a, d, 6], [b, d, 6], [b, d, 26], [a, d, 26]]);
      polyPath(ctx, pts);
      ctx.fillStyle = linear(ctx, pts[3], pts[0], [[0, "#ffe6b4"], [1, "#d98c45"]]);
      ctx.fill();
      const h = iso((a + b) / 2 + (a < 2.6 ? 0.1 : -0.1), d, 15);
      ctx.fillStyle = "#e6e9ea";
      ctx.fillRect(h.x - 0.4, h.y - 3, 0.8, 6);
    }
  });
  s.leftRect(d, 2.24, 2.98, 28.5, 31, PAL.forest, null);

  // Window with herbs.
  leftWindow(s, d, 3.22, 3.84, 12, 27, true);
  s.box(3.12, d, 0, 0.8, 0.2, 7, wallShades(PAL.woodDark));
  const herbs = createRng(901);
  for (let i = 0; i < 7; i++) {
    const p = iso(3.18 + i * 0.1, d + 0.1, 8 + herbs() * 3);
    s.circle(p.x, p.y, 2.2 + herbs(), { fill: i % 2 ? PAL.leafLight : PAL.leaf, stroke: OUTLINE, strokeAlpha: 0.2, width: 0.4 });
  }

  // --- sign band between floors ------------------------------------------
  s.leftRect(d, 0.0, w, G - 1, G + 7, PAL.forest, edge(0.5));
  s.custom([iso(0, d).x - 2, iso(0, d, G + 8).y - 6, iso(w, d).x + 2, iso(w, d, G - 2).y + 2], (ctx) => {
    const start = iso(0.32, d, G + 1.4);
    wallText(ctx, "SCHOOL CAFETERIA", start, {
      size: 5.6,
      color: css(0xe9c979),
      font: fonts.display,
      weight: 600,
      tracking: 1.15,
    });
  });
  s.rightRect(w, 0, d, G - 1, G + 7, shade(PAL.forest, 0.8), edge(0.5));

  // --- upper floor: glass dining hall ---------------------------------------
  const gz0 = G + 8;
  const gz1 = H - 2;
  s.custom([iso(0, d).x - 4, iso(0, d, gz1).y - 8, iso(w, d).x + 4, iso(w, d, gz0).y + 4], (ctx) => {
    const pts = P([[0.06, d, gz0], [w - 0.06, d, gz0], [w - 0.06, d, gz1], [0.06, d, gz1]]);
    polyPath(ctx, pts);
    ctx.fillStyle = linear(ctx, pts[3], pts[0], [[0, "#ffe7b9"], [0.6, "#f4b56a"], [1, "#c97a3c"]]);
    ctx.fill();
    ctx.save();
    polyPath(ctx, pts);
    ctx.clip();
    // Pendant lights.
    for (let i = 0; i < 8; i++) {
      const p = iso(0.3 + i * 0.48, d - 0.6, gz1 - 3);
      ctx.fillStyle = "rgba(255,244,214,0.95)";
      ctx.beginPath();
      ctx.arc(p.x, p.y + 4, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,226,160,0.35)";
      ctx.beginPath();
      ctx.arc(p.x, p.y + 5, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Diners and tables in silhouette.
    const rng = createRng(77);
    for (let i = 0; i < 11; i++) {
      const x = 0.25 + i * 0.34 + rng() * 0.08;
      const p = iso(x, d, gz0 + 1);
      ctx.fillStyle = "rgba(96,52,24,0.55)";
      if (i % 3 === 1) {
        ctx.fillRect(p.x - 4, p.y - 3, 9, 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y - 9, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(p.x - 2.2, p.y - 7, 4.4, 6);
      }
    }
    // Reflection sweep.
    const r0 = iso(0.6, d, gz1);
    const r1 = iso(1.6, d, gz0);
    const g = ctx.createLinearGradient(r0.x, r0.y, r1.x, r1.y);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(r0.x - 40, r0.y - 40, 120, 120);
    ctx.restore();
    // Mullions and transom.
    ctx.strokeStyle = css(PAL.bronze, 0.95);
    ctx.lineWidth = 0.9;
    for (let i = 0; i <= 12; i++) {
      const x = 0.06 + ((w - 0.12) * i) / 12;
      const a = iso(x, d, gz0);
      const b = iso(x, d, gz1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const t0 = iso(0.06, d, gz0 + 10);
    const t1 = iso(w - 0.06, d, gz0 + 10);
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.stroke();
  });

  // --- kitchen side (right face) --------------------------------------------
  rightWindow(s, w, 0.25, 0.85, 17, 27, true);
  rightWindow(s, w, 1.0, 1.6, 17, 27, true);
  // Extraction louvres.
  s.rightRect(w, 0.3, 0.9, G + 14, G + 22, 0x6f7477, edge(0.4));
  for (let i = 1; i < 5; i++) s.line([iso(w, 0.3, G + 14 + i * 1.6), iso(w, 0.9, G + 14 + i * 1.6)], 0x4a4f52, 0.6);
  rightWindow(s, w, 1.3, 2.3, G + 12, G + 22, true);
  // Service door to the yard.
  s.rightRect(w, 1.95, 2.55, 5, 26, PAL.bronze, edge(0.5));
  s.rightRect(w, 2.0, 2.5, 6, 25, 0x5c6a64, null);
  s.box(w, 1.9, 0, 0.18, 0.7, 4, wallShades(PAL.stone));

  // --- roof ---------------------------------------------------------------
  // Parapet.
  s.box(-0.02, -0.02, H, w + 0.04, 0.1, 3, wallShades(0xe6dccb));
  s.box(-0.02, -0.02, H, 0.1, d + 0.04, 3, wallShades(0xe6dccb));
  // Green roof (left half).
  s.custom([iso(0, d).x - 2, iso(0, 0, H).y - 2, iso(2, 0).x + 2, iso(2, d, H).y + 2], (ctx) => {
    const pts = P([[0.1, 0.1, H], [2, 0.1, H], [2, d - 0.1, H], [0.1, d - 0.1, H]]);
    polyPath(ctx, pts);
    ctx.fillStyle = linear(ctx, pts[0], pts[2], [[0, "#8fae4f"], [1, "#5f7f35"]]);
    ctx.fill();
    const rng = createRng(31);
    for (let i = 0; i < 70; i++) {
      const p = iso(0.2 + rng() * 1.7, 0.2 + rng() * (d - 0.4), H);
      ctx.fillStyle = rng() < 0.15 ? "rgba(236,214,120,0.9)" : rng() < 0.5 ? "rgba(160,190,90,0.8)" : "rgba(70,105,45,0.6)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.6 + rng() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // Solar array (right half): tilted rows facing the sun.
  for (let r = 0; r < 4; r++) {
    const y0 = 0.25 + r * 0.68;
    s.custom([iso(2, y0 + 0.6).x - 2, iso(2, y0, H + 10).y - 4, iso(w, y0).x + 2, iso(w - 0.1, y0 + 0.6, H).y + 4], (ctx) => {
      const pts = P([[2.1, y0, H + 7], [w - 0.12, y0, H + 7], [w - 0.12, y0 + 0.5, H + 1], [2.1, y0 + 0.5, H + 1]]);
      polyPath(ctx, pts);
      ctx.fillStyle = linear(ctx, pts[0], pts[2], [[0, "#3d5a78"], [1, "#1f3048"]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(190,215,235,0.45)";
      ctx.lineWidth = 0.4;
      for (let i = 1; i < 6; i++) {
        const x = 2.1 + ((w - 2.22) * i) / 6;
        const a = iso(x, y0, H + 7);
        const b = iso(x, y0 + 0.5, H + 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const m0 = iso(2.1, y0 + 0.25, H + 4);
      const m1 = iso(w - 0.12, y0 + 0.25, H + 4);
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(20,25,30,0.5)";
      ctx.lineWidth = 0.6;
      polyPath(ctx, pts);
      ctx.stroke();
    });
  }
  // Kitchen flue (steam rises from here).
  s.box(3.55, 0.25, H, 0.2, 0.2, 18, { top: 0x5b6266, left: 0xd5dadc, right: 0x9aa2a6 });
  s.box(3.5, 0.2, H + 18, 0.3, 0.3, 2, { top: 0x3e4447, left: 0xb9c0c3, right: 0x7f878b });

  // Climbing plants on the front corner.
  const vines = createRng(12);
  for (let i = 0; i < 18; i++) {
    const z = 6 + vines() * 50;
    const p = iso(0.02 + vines() * 0.12, d, z);
    s.circle(p.x, p.y, 1.6 + vines() * 1.8, {
      fill: vines() < 0.5 ? PAL.leaf : PAL.leafLight,
      stroke: OUTLINE,
      strokeAlpha: 0.15,
      width: 0.4,
    });
  }
  for (let i = 0; i < 12; i++) {
    const z = 4 + vines() * 30;
    const p = iso(w, d - 0.05 - vines() * 0.25, z);
    s.circle(p.x, p.y, 1.5 + vines() * 1.6, { fill: shade(PAL.leaf, 0.8) });
  }
  return s;
}

/** The world point steam leaves from, in cafeteria-local grid units. */
export const FLUE_TOP: P3 = [3.65, 0.35, CAF_WALL + 21];

/** Food pans on the counter: full, half or empty. Same local frame as the cafeteria. */
export function pansSketch(level: "full" | "half" | "empty"): Sketch {
  const s = new Sketch();
  const d = KITCHEN.d;
  const foods = [PAL.stew, PAL.greens, PAL.rice, PAL.stew];
  foods.forEach((food, i) => {
    const x = 0.42 + i * 0.36;
    s.face([[x, d + 0.03, 13], [x + 0.3, d + 0.03, 13], [x + 0.3, d + 0.2, 13], [x, d + 0.2, 13]], 0x9ea6aa, edge(0.4, 0.5));
    if (level !== "empty") {
      const inset = level === "full" ? 0.03 : 0.08;
      s.face(
        [
          [x + inset, d + 0.05, 13.4],
          [x + 0.3 - inset, d + 0.05, 13.4],
          [x + 0.3 - inset, d + 0.18, 13.4],
          [x + inset, d + 0.18, 13.4],
        ],
        level === "full" ? food : shade(food, 0.75),
        null,
      );
    }
  });
  return s;
}

/** Roller shutter closing the hatch at the end of service. */
export function shutterSketch(): Sketch {
  const s = new Sketch();
  const d = KITCHEN.d;
  s.leftRect(d + 0.01, 0.28, 1.9, 10, 30, 0xa9b0b3, edge(0.5));
  for (let z = 12; z < 30; z += 2) s.line([iso(0.28, d + 0.01, z), iso(1.9, d + 0.01, z)], 0x7d8487, 0.6, 0.8);
  return s;
}

/** Cook behind the counter (head and shoulders). Local origin = cafeteria origin. */
export function cookSketch(): Sketch {
  const s = new Sketch();
  const p = iso(0, KITCHEN.d - 0.15, 17);
  s.ellipse(p.x, p.y - 4, 4.4, 4, { fill: 0xffffff, stroke: OUTLINE, strokeAlpha: 0.3, width: 0.6 });
  s.circle(p.x, p.y - 10.5, 3.2, { fill: 0xd9a77c, stroke: OUTLINE, strokeAlpha: 0.3, width: 0.6 });
  s.ellipse(p.x, p.y - 14.6, 3.6, 2, { fill: 0xffffff, stroke: OUTLINE, strokeAlpha: 0.3, width: 0.6 });
  s.circle(p.x, p.y - 16, 2.6, { fill: 0xffffff, stroke: OUTLINE, strokeAlpha: 0.3, width: 0.6 });
  return s;
}

/** Sign hung at the hatch when the kitchen offers small servings. */
export function sizesSignSketch(): Sketch {
  const s = new Sketch();
  const d = KITCHEN.d + 0.3;
  s.line([iso(2.0, d, 31), iso(2.0, d, 27)], PAL.woodDark, 0.7);
  s.face([[1.7, d, 27], [2.15, d, 27], [2.15, d, 19], [1.7, d, 19]], PAL.ivory, edge(0.6, 0.8));
  const a = iso(1.8, d, 23);
  const b = iso(2.03, d, 23);
  s.ellipse(a.x, a.y, 2.2, 1.1, { fill: 0xffffff, stroke: PAL.forest, strokeAlpha: 1, width: 0.8 });
  s.ellipse(b.x, b.y, 3.3, 1.6, { fill: 0xffffff, stroke: PAL.forest, strokeAlpha: 1, width: 0.8 });
  return s;
}

// --------------------------------------------------------------- homes

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
        s.leftRect(1, 0.56, 0.84, 3, 22, PAL.bronze, edge(0.5));
        s.leftRect(1, 0.59, 0.81, 4, 20, shade(h.roof, 0.85), null);
        const k = iso(0.78, 1, 11);
        s.circle(k.x, k.y, 0.7, { fill: PAL.gold });
        leftWindow(s, 1, 0.14, 0.42, z, z + 11, true);
      } else {
        leftWindow(s, 1, 0.14, 0.42, z, z + 10);
        leftWindow(s, 1, 0.56, 0.84, z, z + 10, true);
      }
      rightWindow(s, 1, 0.3, 0.7, z, z + (isGround ? 11 : 10));
    } else {
      if (isGround) {
        s.rightRect(1, 0.18, 0.44, 3, 22, PAL.bronze, edge(0.5));
        s.rightRect(1, 0.21, 0.41, 4, 20, shade(h.roof, 0.7), null);
        rightWindow(s, 1, 0.58, 0.84, z, z + 11, true);
      } else {
        rightWindow(s, 1, 0.16, 0.44, z, z + 10);
        rightWindow(s, 1, 0.58, 0.84, z, z + 10);
      }
      leftWindow(s, 1, 0.3, 0.7, z, z + (isGround ? 11 : 10), true);
    }
  }
  if (h.style !== "townhouse") {
    if (door === "left") {
      s.box(0.12, 1, 8, 0.32, 0.08, 3, wallShades(PAL.wood));
      for (const x of [0.17, 0.28, 0.39]) {
        const p = iso(x, 1.04, 12);
        s.circle(p.x, p.y, 1.3, { fill: x === 0.28 ? 0xe2b24a : 0xc4553e });
      }
    } else {
      s.box(1, 0.56, 8, 0.08, 0.3, 3, wallShades(PAL.wood));
      for (const y of [0.6, 0.71, 0.82]) {
        const p = iso(1.04, y, 12);
        s.circle(p.x, p.y, 1.3, { fill: y === 0.71 ? 0xe2b24a : 0xc4553e });
      }
    }
  }
  if (h.style === "bungalow") {
    if (door === "left") s.face([[0.5, 1, 25], [0.9, 1, 25], [0.9, 1.22, 21], [0.5, 1.22, 21]], h.roof, edge(0.4));
    else s.face([[1, 0.12, 25], [1, 0.5, 25], [1.22, 0.5, 21], [1.22, 0.12, 21]], shade(h.roof, 0.8), edge(0.4));
  }
  const ridge = h.style === "townhouse" ? "y" : "x";
  const rh = h.style === "bungalow" ? 22 : h.style === "townhouse" ? 15 : 18;
  if (h.style === "cottage") s.box(0.62, 0.18, height, 0.18, 0.18, rh + 6, wallShades(0x9a4a35));
  gableRoof(s, 1, 1, height, rh, 0.1, ridge, h.roof, h.wall);
  return s;
}

// --------------------------------------------------------------- nature

export function treeSketch(kind: "round" | "pine" | "bush", variant: number): Sketch {
  const s = new Sketch();
  const base = iso(0.5, 0.5);
  const rng = createRng(500 + variant * 17 + (kind === "pine" ? 3 : kind === "bush" ? 7 : 0));
  if (kind === "bush") {
    s.custom([base.x - 12, base.y - 18, base.x + 12, base.y + 3], (ctx) => {
      for (const [dx, dy, r] of [[-5, -4, 5.5], [4.5, -4, 6], [0, -8, 6.5], [-1, -2, 5]] as const) {
        const g = ctx.createRadialGradient(base.x + dx - 2, base.y + dy - 3, 1, base.x + dx, base.y + dy, r + 1);
        g.addColorStop(0, css(PAL.leafLight));
        g.addColorStop(1, css(PAL.leafDark));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(base.x + dx, base.y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = rng() < 0.5 ? "rgba(240,236,214,0.9)" : "rgba(214,120,90,0.85)";
        ctx.beginPath();
        ctx.arc(base.x - 6 + rng() * 12, base.y - 11 + rng() * 8, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    return s;
  }
  // Trunk.
  s.custom([base.x - 4, base.y - 20, base.x + 4, base.y + 1], (ctx) => {
    ctx.fillStyle = linear(ctx, { x: base.x - 2, y: 0 }, { x: base.x + 2, y: 0 }, [[0, css(shade(PAL.trunk, 1.2))], [1, css(shade(PAL.trunk, 0.7))]]);
    ctx.beginPath();
    ctx.moveTo(base.x - 1.8, base.y);
    ctx.lineTo(base.x + 1.8, base.y);
    ctx.lineTo(base.x + 1.1, base.y - 18);
    ctx.lineTo(base.x - 1.1, base.y - 18);
    ctx.closePath();
    ctx.fill();
  });
  if (kind === "pine") {
    s.custom([base.x - 16, base.y - 50, base.x + 16, base.y - 6], (ctx) => {
      const tiers = [
        { y: -10, w: 13, h: 17 },
        { y: -19, w: 11, h: 16 },
        { y: -28, w: 8.5, h: 15 },
        { y: -36, w: 5.5, h: 12 },
      ];
      for (const t of tiers) {
        const top = { x: base.x, y: base.y + t.y - t.h };
        const g = ctx.createLinearGradient(base.x - t.w, 0, base.x + t.w, 0);
        g.addColorStop(0, css(PAL.pineLight));
        g.addColorStop(0.55, css(PAL.pine));
        g.addColorStop(1, css(shade(PAL.pine, 0.7)));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.quadraticCurveTo(base.x - t.w * 0.45, base.y + t.y - t.h * 0.35, base.x - t.w, base.y + t.y);
        ctx.quadraticCurveTo(base.x, base.y + t.y + 3, base.x + t.w, base.y + t.y);
        ctx.quadraticCurveTo(base.x + t.w * 0.45, base.y + t.y - t.h * 0.35, top.x, top.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(30,40,25,0.25)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    });
    return s;
  }
  const cy = base.y - 24;
  s.custom([base.x - 18, cy - 18, base.x + 18, cy + 16], (ctx) => {
    const blobs: [number, number, number][] = [
      [3, 5, 11],
      [-6, 3, 9],
      [6, -3, 9.5],
      [-3, -6, 10],
      [1, 0, 11],
    ];
    for (const [dx, dy, r] of blobs) {
      const x = base.x + dx + (rng() - 0.5) * 1.5;
      const y = cy + dy;
      const g = ctx.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.15, x, y, r * 1.05);
      g.addColorStop(0, css(variant % 2 ? PAL.leafLight : mix(PAL.leafLight, 0xc9c26a, 0.25)));
      g.addColorStop(0.6, css(PAL.leaf));
      g.addColorStop(1, css(PAL.leafDark));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,240,190,0.22)";
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc(base.x - 8 + rng() * 9, cy - 9 + rng() * 9, 0.9 + rng(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return s;
}

// ---------------------------------------------------------------- props

export function noticeboardSketch(): Sketch {
  const s = new Sketch();
  const y = 0.62;
  for (const x of [0.2, 0.8]) s.box(x - 0.04, y - 0.04, 0, 0.08, 0.08, 30, wallShades(PAL.woodDark));
  s.face([[0.14, y, 10], [0.86, y, 10], [0.86, y, 29], [0.14, y, 29]], PAL.wood, edge(0.5));
  s.face([[0.18, y + 0.001, 12], [0.82, y + 0.001, 12], [0.82, y + 0.001, 27], [0.18, y + 0.001, 27]], 0xc99a62, null);
  s.face([[0.08, y - 0.12, 30], [0.92, y - 0.12, 30], [0.92, y + 0.12, 33], [0.08, y + 0.12, 33]], PAL.forest, edge(0.4));
  s.face([[0.6, y + 0.002, 15], [0.76, y + 0.002, 15], [0.76, y + 0.002, 24], [0.6, y + 0.002, 24]], 0xf6efe0, edge(0.25, 0.5));
  s.face([[0.5, y + 0.002, 22], [0.6, y + 0.002, 22], [0.6, y + 0.002, 26], [0.5, y + 0.002, 26]], PAL.gold, edge(0.25, 0.5));
  return s;
}

export function rsvpSheetSketch(): Sketch {
  const s = new Sketch();
  const y = 0.625;
  s.face([[0.22, y, 13], [0.46, y, 13], [0.46, y, 27], [0.22, y, 27]], 0xffffff, edge(0.45, 0.6));
  for (let i = 0; i < 4; i++) {
    const z = 24 - i * 3;
    s.line([iso(0.25, y, z), iso(0.29, y, z - 1)], PAL.forestMid, 0.8);
    s.line([iso(0.32, y, z), iso(0.43, y, z)], 0x9a8b7a, 0.6, 0.8);
  }
  const pin = iso(0.34, y, 27);
  s.circle(pin.x, pin.y, 1.2, { fill: PAL.terracotta });
  return s;
}

export function feedbackBoxSketch(): Sketch {
  const s = new Sketch();
  s.box(0.46, 0.46, 0, 0.08, 0.08, 14, wallShades(PAL.woodDark));
  s.box(0.3, 0.32, 14, 0.4, 0.36, 12, wallShades(PAL.forestMid));
  s.face([[0.38, 0.68, 22], [0.62, 0.68, 22], [0.62, 0.68, 23.5], [0.38, 0.68, 23.5]], 0x112018, null);
  const c = iso(0.7, 0.5, 20);
  s.ellipse(c.x, c.y, 3, 2.4, { fill: PAL.ivory });
  s.poly([{ x: c.x - 1, y: c.y + 1.5 }, { x: c.x - 2.6, y: c.y + 3.6 }, { x: c.x + 0.6, y: c.y + 2 }], { fill: PAL.ivory });
  return s;
}

export function smallPleaseSignSketch(): Sketch {
  const s = new Sketch();
  s.face([[0.3, 0.5, 0], [0.7, 0.5, 0], [0.66, 0.42, 18], [0.34, 0.42, 18]], PAL.woodDark, edge(0.5));
  s.face([[0.33, 0.5, 2], [0.67, 0.5, 2], [0.64, 0.43, 16.5], [0.36, 0.43, 16.5]], 0x2a3b33, null);
  const a = iso(0.43, 0.47, 9);
  const b = iso(0.58, 0.47, 9);
  s.ellipse(a.x, a.y, 2.2, 1.1, { stroke: 0xffffff, strokeAlpha: 0.95, width: 0.8 });
  s.ellipse(b.x, b.y, 3.4, 1.6, { stroke: 0xffffff, strokeAlpha: 0.95, width: 0.8 });
  s.line([iso(0.4, 0.46, 13.5), iso(0.6, 0.45, 13.5)], PAL.gold, 0.9);
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
  s.box(0.46, 0.46, 0, 0.08, 0.08, 30, wallShades(0x3c4349));
  const c = iso(0.5, 0.5, 33);
  s.custom([c.x - 10, c.y - 10, c.x + 10, c.y + 10], (ctx) => {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 9);
    g.addColorStop(0, "rgba(255,226,150,0.55)");
    g.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = g;
    ctx.fillRect(c.x - 10, c.y - 10, 20, 20);
  });
  s.circle(c.x, c.y, 3.2, { fill: 0xfff0c2, stroke: OUTLINE, strokeAlpha: 0.4, width: 0.7 });
  s.poly([{ x: c.x - 4, y: c.y - 3 }, { x: c.x + 4, y: c.y - 3 }, { x: c.x, y: c.y - 7 }], { fill: 0x3c4349 });
  return s;
}

export function flagpoleSketch(): Sketch {
  const s = new Sketch();
  s.box(0.47, 0.47, 0, 0.06, 0.06, 44, wallShades(0xe2dccf));
  const top = iso(0.5, 0.5, 44);
  s.circle(top.x, top.y - 1, 1.5, { fill: PAL.gold });
  return s;
}

export function flagClothSketch(): Sketch {
  const s = new Sketch();
  s.poly([{ x: 0, y: 0 }, { x: 18, y: 2 }, { x: 18, y: 13 }, { x: 0, y: 11 }], { fill: PAL.forest, ...edge(0.4, 0.7) });
  s.ellipse(9, 6.8, 4, 2.4, { fill: PAL.gold });
  return s;
}

/** Sustainability (mission) board: where the real-world audit lives. */
export function missionBoardSketch(fonts: ArtFonts): Sketch {
  const s = new Sketch();
  const y = 0.58;
  for (const x of [0.1, 0.9]) s.box(x - 0.045, y - 0.045, 0, 0.09, 0.09, 40, wallShades(PAL.woodDark));
  // Panel and inset cork.
  s.face([[0.06, y, 12], [0.94, y, 12], [0.94, y, 38], [0.06, y, 38]], PAL.forestMid, edge(0.55));
  s.face([[0.1, y + 0.001, 14], [0.9, y + 0.001, 14], [0.9, y + 0.001, 31], [0.1, y + 0.001, 31]], 0xd6b98a, null);
  // Roof cap.
  s.face([[0.0, y - 0.14, 40], [1.0, y - 0.14, 40], [1.0, y + 0.14, 37], [0.0, y + 0.14, 37]], PAL.forest, edge(0.45));
  s.face([[0.0, y + 0.14, 37], [1.0, y + 0.14, 37], [1.0, y + 0.14, 35.6], [0.0, y + 0.14, 35.6]], PAL.gold, null);
  // Title strip.
  s.custom([-40, -60, 40, 0], (ctx) => {
    const at = iso(0.5, y + 0.002, 32.4);
    wallText(ctx, "WASTE AUDIT", at, { size: 3.6, color: "#f3ecdd", font: fonts.body, weight: 700, tracking: 0.5, align: "center" });
  });
  // A small kitchen scale on the ground: measuring comes first.
  s.box(0.62, 0.74, 0, 0.26, 0.2, 4, wallShades(PAL.steel));
  s.box(0.6, 0.72, 4, 0.3, 0.24, 1, wallShades(0xe6e1d6));
  return s;
}

/** Where each step's pinned note sits on the board face (x range, z range). */
const BOARD_NOTES: { x: [number, number]; z: [number, number]; fill: number }[] = [
  { x: [0.13, 0.35], z: [23.5, 30], fill: 0xfbf6ea },
  { x: [0.39, 0.61], z: [23, 29.5], fill: 0xf3e2b4 },
  { x: [0.65, 0.87], z: [23.5, 30], fill: 0xdfe8d2 },
  { x: [0.2, 0.44], z: [15, 21.5], fill: 0xffffff },
  { x: [0.54, 0.8], z: [15, 21.5], fill: 0xfbf6ea },
];

/** One pinned note for a completed mission step (0–4). Placed at the board's tile. */
export function boardNoteSketch(i: number): Sketch {
  const s = new Sketch();
  const y = 0.584;
  const n = BOARD_NOTES[i];
  const [x0, x1] = n.x;
  const [z0, z1] = n.z;
  s.face([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], n.fill, edge(0.35, 0.5));
  if (i === 4) {
    // Measure again: before and after bars.
    s.face([[x0 + 0.04, y, z0 + 1], [x0 + 0.1, y, z0 + 1], [x0 + 0.1, y, z1 - 1.5], [x0 + 0.04, y, z1 - 1.5]], 0xc28a4c, null);
    s.face([[x0 + 0.14, y, z0 + 1], [x0 + 0.2, y, z0 + 1], [x0 + 0.2, y, z0 + 3.6], [x0 + 0.14, y, z0 + 3.6]], PAL.forestMid, null);
  } else {
    // A tick and two written lines.
    const zt = z1 - 2.2;
    s.line([iso(x0 + 0.03, y, zt), iso(x0 + 0.05, y, zt - 1.1), iso(x0 + 0.09, y, zt + 0.6)], PAL.forestMid, 0.8);
    s.line([iso(x0 + 0.04, y, z0 + 3.4), iso(x1 - 0.04, y, z0 + 3.4)], 0x9a8b7a, 0.6, 0.8);
    s.line([iso(x0 + 0.04, y, z0 + 1.6), iso(x1 - 0.08, y, z0 + 1.6)], 0x9a8b7a, 0.6, 0.8);
  }
  const pin = iso((x0 + x1) / 2, y, z1);
  s.circle(pin.x, pin.y, 1.1, { fill: i % 2 ? PAL.gold : PAL.terracotta });
  return s;
}

/** Soft warm light, drawn additively (hatch lamps, hub windows, selection glow). */
export function glowSketch(): Sketch {
  const s = new Sketch();
  s.custom([-30, -16, 30, 16], (ctx) => {
    ctx.save();
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, "rgba(255,214,140,0.85)");
    g.addColorStop(0.45, "rgba(255,190,100,0.35)");
    g.addColorStop(1, "rgba(255,170,80,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  return s;
}

/** A small bird seen from below, wings up. */
export function birdSketch(): Sketch {
  const s = new Sketch();
  s.custom([-6, -3, 6, 2], (ctx) => {
    ctx.strokeStyle = "rgba(38,44,40,0.85)";
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.quadraticCurveTo(-2.4, -2.6, 0, 0.6);
    ctx.quadraticCurveTo(2.4, -2.6, 5, -2);
    ctx.stroke();
  });
  return s;
}

/** Speech bubble with three dots: students chatting. Origin at the tail. */
export function chatSketch(): Sketch {
  const s = new Sketch();
  s.custom([-6, -9, 6, 1], (ctx) => {
    ctx.fillStyle = "rgba(251,246,234,0.96)";
    ctx.strokeStyle = "rgba(42,33,25,0.35)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(-5.5, -8.5, 11, 6.4, 3);
    ctx.moveTo(-1.2, -2.2);
    ctx.lineTo(0, 0.4);
    ctx.lineTo(1.4, -2.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3f6b3a";
    for (const x of [-2.6, 0, 2.6]) {
      ctx.beginPath();
      ctx.arc(x, -5.3, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return s;
}

/** A school backpack left on the ground. Centred on local (0, 0). */
export function backpackSketch(color: number): Sketch {
  const s = new Sketch();
  s.ellipse(0, 1.2, 4.4, 1.8, { fill: PAL.shadow, alpha: 0.25 });
  s.box(-0.09, -0.06, 0, 0.18, 0.13, 6.5, wallShades(color), edge(0.4, 0.5));
  s.box(-0.07, 0.07, 1.2, 0.14, 0.04, 3.2, wallShades(shade(color, 0.85)), edge(0.3, 0.4));
  s.face([[-0.09, -0.06, 6.5], [0.09, -0.06, 6.5], [0.09, 0.07, 6.5], [-0.09, 0.07, 6.5]], shade(color, 1.12), edge(0.3, 0.4));
  return s;
}

/** Chalk menu board (A-frame) outside the cafeteria, with the tray-and-leaf mark. */
export function menuBoardSketch(fonts: ArtFonts): Sketch {
  const s = new Sketch();
  s.ellipse(0, 1.5, 9, 3, { fill: PAL.shadow, alpha: 0.22 });
  s.face([[-0.2, 0.06, 0], [0.2, 0.06, 0], [0.18, -0.02, 22], [-0.18, -0.02, 22]], PAL.woodDark, edge(0.5));
  s.face([[-0.17, 0.07, 3], [0.17, 0.07, 3], [0.155, 0.0, 20], [-0.155, 0.0, 20]], 0x24302b, null);
  s.custom([-12, -30, 12, 0], (ctx) => {
    wallText(ctx, "TODAY", iso(-0.12, 0.06, 16.4), { size: 2.6, color: "#e9c979", font: fonts.body, weight: 800, tracking: 0.3 });
    ctx.strokeStyle = "rgba(243,236,221,0.75)";
    ctx.lineWidth = 0.5;
    for (const z of [13.2, 11, 8.8]) {
      const a = iso(-0.12, 0.05, z);
      const b = iso(0.1, 0.05, z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Tray-and-leaf mark.
    const m = iso(0.02, 0.04, 5.6);
    ctx.strokeStyle = "#f3ecdd";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 2.6, 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#9fc05e";
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - 0.4);
    ctx.quadraticCurveTo(m.x + 0.4, m.y - 3.4, m.x + 2.6, m.y - 3.2);
    ctx.quadraticCurveTo(m.x + 2, m.y - 0.8, m.x, m.y - 0.4);
    ctx.fill();
  });
  return s;
}

/** Sorting bins and a bottle refill tap. Centred on local (0, 0). */
export function ecoStationSketch(): Sketch {
  const s = new Sketch();
  s.ellipse(0, 2, 16, 5, { fill: PAL.shadow, alpha: 0.22 });
  const bins: [number, number][] = [
    [-0.36, 0x3f6b3a],
    [-0.12, 0x3e6b7a],
    [0.12, PAL.terracotta],
  ];
  for (const [x, lid] of bins) {
    s.box(x, -0.1, 0, 0.2, 0.2, 9, wallShades(0xd7d2c6), edge(0.4, 0.5));
    s.box(x - 0.01, -0.11, 9, 0.22, 0.22, 1.3, wallShades(lid), edge(0.4, 0.5));
    s.face([[x + 0.04, 0.101, 4.5], [x + 0.16, 0.101, 4.5], [x + 0.16, 0.101, 6.8], [x + 0.04, 0.101, 6.8]], lid, null);
  }
  // Bottle refill column.
  s.box(0.38, -0.08, 0, 0.16, 0.16, 15, wallShades(PAL.forestMid), edge(0.4, 0.5));
  s.face([[0.41, 0.081, 6], [0.51, 0.081, 6], [0.51, 0.081, 11], [0.41, 0.081, 11]], 0x9fb9bf, edge(0.3, 0.4));
  const drop = iso(0.46, 0.09, 13);
  s.circle(drop.x, drop.y, 0.9, { fill: 0xe2c27a });
  return s;
}

/** Mop bucket by the tray return. Centred on local (0, 0). */
export function mopBucketSketch(): Sketch {
  const s = new Sketch();
  s.ellipse(0, 1, 5, 2, { fill: PAL.shadow, alpha: 0.22 });
  s.box(-0.1, -0.08, 0, 0.2, 0.16, 5, wallShades(0xc9a24b), edge(0.4, 0.5));
  s.line([iso(0, 0, 4), iso(0.08, -0.06, 22)], PAL.woodDark, 0.9);
  s.ellipse(iso(0, 0, 4).x, iso(0, 0, 4).y, 2.4, 1, { fill: 0xd9d2c2 });
  return s;
}

/** Small timber planter with greenery. Centred on local (0, 0). */
export function planterSketch(variant: number): Sketch {
  const s = new Sketch();
  s.ellipse(0, 1.2, 9, 3, { fill: PAL.shadow, alpha: 0.2 });
  s.box(-0.22, -0.12, 0, 0.44, 0.24, 4, wallShades(PAL.wood), edge(0.4, 0.5));
  const rng = createRng(70 + variant);
  for (let i = 0; i < 8; i++) {
    const p = iso(-0.18 + rng() * 0.36, -0.08 + rng() * 0.16, 4 + rng() * 3);
    s.circle(p.x, p.y, 1.5 + rng() * 1.4, { fill: rng() < 0.4 ? PAL.leafLight : PAL.leaf, stroke: OUTLINE, strokeAlpha: 0.15, width: 0.4 });
  }
  if (variant % 2) {
    const f = iso(0.05, 0, 7.5);
    s.circle(f.x, f.y, 1, { fill: 0xe8b04a });
  }
  return s;
}

/** Tray left on a table top. Centred on local (0, 0). */
export function tableTraySketch(full: boolean): Sketch {
  const s = new Sketch();
  s.face([[-0.1, -0.07, 10.4], [0.1, -0.07, 10.4], [0.1, 0.07, 10.4], [-0.1, 0.07, 10.4]], 0x6f8b7a, edge(0.4, 0.5));
  const p = iso(0, 0, 10.6);
  s.ellipse(p.x, p.y, 2.4, 1.1, { fill: 0xfbf6ea });
  if (full) s.ellipse(p.x, p.y - 0.2, 1.4, 0.6, { fill: PAL.stew });
  return s;
}

/** Campus Sustainability Flag cloth: a leaf on forest green. */
export function sustainFlagSketch(): Sketch {
  const s = new Sketch();
  s.poly([{ x: 0, y: 0 }, { x: 20, y: 2 }, { x: 20, y: 14 }, { x: 0, y: 12 }], { fill: 0x3f7a45, ...edge(0.4, 0.7) });
  s.poly([{ x: 0, y: 9.5 }, { x: 20, y: 11.5 }, { x: 20, y: 14 }, { x: 0, y: 12 }], { fill: PAL.gold });
  s.custom([2, 0, 18, 12], (ctx) => {
    ctx.fillStyle = "#f3ecdd";
    ctx.beginPath();
    ctx.moveTo(6.5, 8.5);
    ctx.bezierCurveTo(6.5, 3.5, 11, 2.2, 14.5, 2.6);
    ctx.bezierCurveTo(14.8, 6.4, 12, 9.2, 6.5, 8.5);
    ctx.fill();
    ctx.strokeStyle = "#3f7a45";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(7.2, 8);
    ctx.lineTo(13, 3.6);
    ctx.stroke();
  });
  return s;
}

export function tableSketch(): Sketch {
  const s = new Sketch();
  // Benches either side of the table.
  s.box(0.2, 0.18, 0, 0.6, 0.12, 5, wallShades(PAL.wood));
  s.box(0.2, 0.7, 0, 0.6, 0.12, 5, wallShades(PAL.wood));
  s.box(0.47, 0.47, 0, 0.06, 0.06, 28, wallShades(0xe2dccf));
  s.box(0.22, 0.32, 8, 0.56, 0.36, 2, wallShades(shade(PAL.wood, 1.12)));
  const u = iso(0.5, 0.5, 31);
  s.custom([u.x - 22, u.y - 10, u.x + 22, u.y + 12], (ctx) => {
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const a0 = (Math.PI * 2 * i) / segs;
      const a1 = (Math.PI * 2 * (i + 1)) / segs;
      ctx.beginPath();
      ctx.moveTo(u.x, u.y - 7);
      ctx.lineTo(u.x + Math.cos(a0) * 20, u.y + Math.sin(a0) * 10);
      ctx.lineTo(u.x + Math.cos(a1) * 20, u.y + Math.sin(a1) * 10);
      ctx.closePath();
      const lit = Math.cos((a0 + a1) / 2 + 0.6) * -0.5 + 0.5;
      ctx.fillStyle = css(shade(i % 2 ? PAL.ivory : PAL.terracotta, 0.82 + lit * 0.22));
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(42,33,25,0.35)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(u.x, u.y, 20, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  return s;
}

export function cratesSketch(): Sketch {
  const s = new Sketch();
  s.box(0.15, 0.3, 0, 0.36, 0.36, 10, wallShades(PAL.wood));
  s.box(0.56, 0.4, 0, 0.3, 0.3, 8, wallShades(shade(PAL.wood, 1.1)));
  s.box(0.22, 0.36, 10, 0.26, 0.26, 8, wallShades(shade(PAL.wood, 0.92)));
  const c = iso(0.7, 0.55, 9);
  s.circle(c.x - 1.5, c.y, 1.7, { fill: 0xc4553e });
  s.circle(c.x + 1.8, c.y + 0.4, 1.7, { fill: 0xe2b24a });
  s.circle(c.x + 0.2, c.y - 1.4, 1.7, { fill: 0x7aa54a });
  return s;
}

export function flowerbedSketch(variant: number): Sketch {
  const s = new Sketch();
  s.box(0.18, 0.18, 0, 0.64, 0.64, 3, wallShades(0x7a5a40));
  const rng = createRng(77 + variant);
  const colors = [0xe2b24a, 0xc4553e, 0xf3ecdd, 0x9b6fb0];
  for (let i = 0; i < 10; i++) {
    const p = iso(0.26 + rng() * 0.48, 0.26 + rng() * 0.48, 4 + rng() * 2);
    s.circle(p.x, p.y - 1, 1.4, { fill: PAL.leaf });
    s.circle(p.x, p.y - 2.3, 1.1, { fill: colors[i % colors.length] });
  }
  return s;
}

/** Tray return trolley with a food-scraps caddy. */
export function trayReturnSketch(fonts: ArtFonts): Sketch {
  const s = new Sketch();
  // Trolley frame with stacked trays.
  s.box(0.12, 0.2, 0, 0.5, 0.42, 2, wallShades(0x8e979c));
  for (const [x, y] of [[0.14, 0.22], [0.58, 0.22], [0.14, 0.58], [0.58, 0.58]] as const) {
    s.box(x, y, 2, 0.03, 0.03, 22, wallShades(0xc9cfd2), null);
  }
  for (let i = 0; i < 6; i++) {
    s.box(0.14, 0.22, 4 + i * 3.2, 0.47, 0.39, 0.8, { top: 0xd9cdb5, left: 0x9b8a6c, right: 0x7f6f55 }, edge(0.2, 0.4));
  }
  s.box(0.1, 0.18, 24, 0.55, 0.46, 1.2, wallShades(0xc9cfd2));
  // Scraps caddy (food waste).
  s.box(0.66, 0.3, 0, 0.3, 0.3, 11, wallShades(0x4e7a3c));
  s.box(0.64, 0.28, 11, 0.34, 0.34, 1, wallShades(0x3f6431));
  s.custom([iso(0.66, 0.6).x - 2, iso(0.96, 0.6, 11).y - 6, iso(0.96, 0.6).x + 2, iso(0.96, 0.6, 0).y + 2], (ctx) => {
    const c = iso(0.81, 0.6, 6);
    ctx.strokeStyle = "rgba(243,236,221,0.9)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(c.x - 0.5, c.y, 2.2, 1.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  // Small sign.
  s.box(0.38, 0.62, 0, 0.03, 0.03, 30, wallShades(PAL.woodDark), null);
  s.face([[0.2, 0.66, 30], [0.62, 0.66, 30], [0.62, 0.66, 36], [0.2, 0.66, 36]], PAL.forest, edge(0.5, 0.6));
  s.custom([iso(0.2, 0.66).x - 2, iso(0.2, 0.66, 37).y - 4, iso(0.62, 0.66).x + 2, iso(0.62, 0.66, 29).y + 2], (ctx) => {
    wallText(ctx, "TRAYS", iso(0.27, 0.665, 31.2), { size: 3.4, color: css(0xe9c979), font: fonts.body, weight: 800, tracking: 0.5 });
  });
  return s;
}

/** Food scraps heaped above the caddy rim; scaled by plate waste. Origin at the caddy top centre. */
export function scrapsSketch(): Sketch {
  const s = new Sketch();
  const rng = createRng(66);
  s.ellipse(0, 0, 8, 4, { fill: 0x4a321c });
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 6.5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.5 - rng() * (7 - r * 0.8);
    s.circle(x, y, 1.2 + rng() * 1.5, {
      fill: [PAL.stew, PAL.greens, PAL.rice, 0x8a5a32][i % 4],
      stroke: OUTLINE,
      strokeAlpha: 0.25,
      width: 0.4,
    });
  }
  return s;
}

/** A covered steel container of leftover food. Origin = its ground centre. */
export function leftoverPotSketch(): Sketch {
  const s = new Sketch();
  s.custom([-8, -16, 8, 3], (ctx) => {
    ctx.fillStyle = "rgba(29,42,34,0.3)";
    ctx.beginPath();
    ctx.ellipse(1.5, 0.5, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createLinearGradient(-6, 0, 6, 0);
    body.addColorStop(0, "#eef1f2");
    body.addColorStop(0.45, "#b9c1c5");
    body.addColorStop(1, "#7c868b");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.lineTo(-6, -1);
    ctx.ellipse(0, -1, 6, 2.8, 0, Math.PI, 0, true);
    ctx.lineTo(6, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(PAL.stew);
    ctx.beginPath();
    ctx.ellipse(0, -11, 6, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4dadc";
    ctx.beginPath();
    ctx.ellipse(-1.2, -11.8, 5.4, 2.4, -0.25, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.strokeStyle = "rgba(42,33,25,0.45)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, -11, 6, 2.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#59646a";
    ctx.fillRect(-7.2, -9.5, 1.4, 1.2);
    ctx.fillRect(5.8, -9.5, 1.4, 1.2);
  });
  return s;
}

/** One rope-barrier post with rope running to the next post (+1 tile in x). */
export function barrierSketch(withRope: boolean): Sketch {
  const s = new Sketch();
  const base = iso(0, 0);
  s.ellipse(base.x, base.y, 2.4, 1.2, { fill: 0x6b7276 });
  s.box(-0.02, -0.02, 0, 0.04, 0.04, 12, { top: 0xe9eef0, left: 0xc3cacd, right: 0x8b9397 }, null);
  const top = iso(0, 0, 12);
  s.circle(top.x, top.y, 1.1, { fill: PAL.gold });
  if (withRope) {
    const end = iso(1, 0, 11);
    s.custom([top.x - 1, top.y - 2, end.x + 1, end.y + 6], (ctx) => {
      ctx.strokeStyle = css(PAL.forestMid);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y + 1);
      ctx.quadraticCurveTo((top.x + end.x) / 2, (top.y + end.y) / 2 + 5, end.x, end.y);
      ctx.stroke();
    });
  }
  return s;
}

/** Fence, stakes and a sign around the expansion plot. Origin = plot back corner. */
export function meadowSketch(): Sketch {
  const s = new Sketch();
  const { w, d } = MEADOW;
  const ring: [number, number][] = [
    [0.15, 0.15],
    [w - 0.15, 0.15],
    [w - 0.15, d - 0.15],
    [0.15, d - 0.15],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % 4];
    const steps = 12;
    for (let j = 0; j < steps; j += 2) {
      const t0 = j / steps;
      const t1 = (j + 1) / steps;
      s.line([iso(ax + (bx - ax) * t0, ay + (by - ay) * t0), iso(ax + (bx - ax) * t1, ay + (by - ay) * t1)], 0xe8d9a8, 1.5, 0.95);
    }
  }
  const post = (x: number, y: number) => s.box(x - 0.03, y - 0.03, 0, 0.06, 0.06, 9, wallShades(0xe6dccb), edge(0.3, 0.6));
  for (let i = 0; i <= w * 2; i++) post(i / 2, 0);
  for (let i = 1; i <= d * 2; i++) post(0, i / 2);
  s.line([iso(0, 0, 7), iso(w, 0, 7)], 0xd9cdb5, 1.1);
  s.line([iso(0, 0, 4), iso(w, 0, 4)], 0xd9cdb5, 1.1);
  s.line([iso(0, 0, 7), iso(0, d, 7)], 0xe6dccb, 1.1);
  s.line([iso(0, 0, 4), iso(0, d, 4)], 0xe6dccb, 1.1);
  for (const [x, y] of [[0.5, 0.5], [w - 0.5, 0.5], [w - 0.5, d - 0.5], [0.5, d - 0.5]] as const) {
    s.box(x - 0.02, y - 0.02, 0, 0.04, 0.04, 14, wallShades(PAL.wood), edge(0.3, 0.5));
    const t = iso(x, y, 14);
    s.poly([t, { x: t.x + 6, y: t.y + 2 }, { x: t.x, y: t.y + 4 }], { fill: PAL.terracotta, ...edge(0.3, 0.5) });
  }
  const rng = createRng(4242);
  for (let i = 0; i < 20; i++) {
    const p = iso(0.4 + rng() * (w - 0.8), 0.4 + rng() * (d - 0.8));
    s.circle(p.x, p.y - 1, 1, { fill: rng() < 0.5 ? 0xf3ecdd : 0xe2b24a });
  }
  return s;
}

export function selectionSketch(w: number, d: number): Sketch {
  const s = new Sketch();
  const m = 0.12;
  const pts = [iso(-m, -m), iso(w + m, -m), iso(w + m, d + m), iso(-m, d + m)];
  s.poly(pts, { fill: 0xf0d58a, alpha: 0.22, shading: false });
  s.poly(pts, { stroke: 0xe9c979, strokeAlpha: 1, width: 2.2 });
  const inner = [iso(0.05, 0.05), iso(w - 0.05, 0.05), iso(w - 0.05, d - 0.05), iso(0.05, d - 0.05)];
  s.poly(inner, { stroke: 0xfff6dc, strokeAlpha: 0.7, width: 0.9 });
  return s;
}

export function markerSketch(): Sketch {
  const s = new Sketch();
  s.poly([{ x: -5, y: -12 }, { x: 5, y: -12 }, { x: 0, y: 0 }], { fill: PAL.gold, ...edge(0.6, 1) });
  s.circle(0, -15, 8, { fill: PAL.gold, ...edge(0.6, 1) });
  s.circle(0, -15, 3.4, { fill: PAL.forest });
  return s;
}

/** Floating name plaque with a small icon. Origin at the pointer tip. */
export function plaqueSketch(text: string, icon: "cafeteria" | "lock" | "plus" | "hub" | "audit", fonts: ArtFonts, gold = false): Sketch {
  const s = new Sketch();
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `600 8px ${fonts.body}`;
  const tw = probe.measureText(text).width;
  const w = tw + 26;
  const h = 15;
  s.custom([-w / 2 - 1, -h - 6, w / 2 + 1, 1], (ctx) => {
    const x0 = -w / 2;
    const y0 = -h - 5;
    ctx.fillStyle = gold ? "rgba(122,88,22,0.95)" : "rgba(20,36,27,0.9)";
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(201,162,75,0.7)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = "rgba(20,36,27,0.9)";
    ctx.beginPath();
    ctx.moveTo(-3.5, y0 + h);
    ctx.lineTo(3.5, y0 + h);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f3ecdd";
    ctx.fillStyle = "#f3ecdd";
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    const ix = x0 + 9;
    const iy = y0 + h / 2;
    if (icon === "cafeteria") {
      ctx.beginPath();
      ctx.moveTo(ix - 2.2, iy - 3.5);
      ctx.lineTo(ix - 2.2, iy + 3.5);
      ctx.moveTo(ix - 3.4, iy - 3.5);
      ctx.lineTo(ix - 3.4, iy - 1);
      ctx.moveTo(ix - 1, iy - 3.5);
      ctx.lineTo(ix - 1, iy - 1);
      ctx.moveTo(ix + 2.2, iy - 3.5);
      ctx.quadraticCurveTo(ix + 3.8, iy - 1, ix + 2.2, iy);
      ctx.lineTo(ix + 2.2, iy + 3.5);
      ctx.stroke();
    } else if (icon === "lock") {
      ctx.strokeRect(ix - 2.6, iy - 0.6, 5.2, 4);
      ctx.beginPath();
      ctx.arc(ix, iy - 0.8, 1.8, Math.PI, 0);
      ctx.stroke();
    } else if (icon === "plus") {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ix - 3, iy);
      ctx.lineTo(ix + 3, iy);
      ctx.moveTo(ix, iy - 3);
      ctx.lineTo(ix, iy + 3);
      ctx.stroke();
    } else if (icon === "audit") {
      // Clipboard with a tick.
      ctx.strokeRect(ix - 2.8, iy - 3.2, 5.6, 7);
      ctx.fillRect(ix - 1.4, iy - 4.2, 2.8, 1.6);
      ctx.beginPath();
      ctx.moveTo(ix - 1.5, iy + 0.6);
      ctx.lineTo(ix - 0.3, iy + 1.8);
      ctx.lineTo(ix + 1.7, iy - 0.8);
      ctx.stroke();
    } else {
      // Bar chart: planning data.
      ctx.fillRect(ix - 3.4, iy + 0.5, 1.6, 3);
      ctx.fillRect(ix - 0.8, iy - 1.5, 1.6, 5);
      ctx.fillRect(ix + 1.8, iy - 3.5, 1.6, 7);
    }
    ctx.font = `600 8px ${fonts.body}`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x0 + 17, iy + 0.5);
  });
  return s;
}

export function puffSketch(): Sketch {
  const s = new Sketch();
  s.circle(0, 0, 7, { fill: 0xffffff, alpha: 0.2 });
  s.circle(0, 0, 5, { fill: 0xffffff, alpha: 0.3 });
  s.circle(-1, -1, 3, { fill: 0xffffff, alpha: 0.45 });
  return s;
}

export function shimmerSketch(): Sketch {
  const s = new Sketch();
  s.line([{ x: -6, y: 0 }, { x: 6, y: -3 }], 0xffffff, 1.2, 0.8);
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
    { fill: 0xfff1b8, stroke: PAL.gold, strokeAlpha: 0.8, width: 0.6, shading: false },
  );
  return s;
}

/** Tray carried by a student. Origin at the tray centre. */
export function traySketch(size: "regular" | "small"): Sketch {
  const s = new Sketch();
  s.custom([-8, -7, 8, 4], (ctx) => {
    ctx.fillStyle = "#a07a50";
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(0, -3.5);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(60,40,20,0.5)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    const r = size === "regular" ? 3.6 : 2.3;
    ctx.fillStyle = "#f6f1e6";
    ctx.beginPath();
    ctx.ellipse(-0.5, -0.6, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(PAL.stew);
    ctx.beginPath();
    ctx.ellipse(-0.5, -0.9, r * 0.7, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    if (size === "regular") {
      ctx.fillStyle = css(PAL.greens);
      ctx.beginPath();
      ctx.arc(-1.3, -1.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return s;
}

/** Thought bubble above a student: an empty plate, or a clock when lunch ended. */
export function bubbleSketch(kind: "empty" | "time"): Sketch {
  const s = new Sketch();
  s.custom([-9, -19, 9, 1], (ctx) => {
    ctx.fillStyle = "rgba(243,236,221,0.97)";
    ctx.strokeStyle = "rgba(42,33,25,0.5)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(-8, -18, 16, 13, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -5.2);
    ctx.lineTo(0, -1);
    ctx.lineTo(2, -5.2);
    ctx.fill();
    if (kind === "empty") {
      ctx.strokeStyle = "#8a7d6c";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, -11.5, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -11.5, 2.6, 1.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = css(PAL.terracotta);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(3, -16);
      ctx.lineTo(6, -13.5);
      ctx.moveTo(6, -16);
      ctx.lineTo(3, -13.5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#6b5d50";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, -11.5, 4.2, 0, Math.PI * 2);
      ctx.moveTo(0, -11.5);
      ctx.lineTo(0, -14.5);
      ctx.moveTo(0, -11.5);
      ctx.lineTo(2.2, -10.5);
      ctx.stroke();
    }
  });
  return s;
}

// ------------------------------------------------------------- people

export interface PersonLook {
  skin: string;
  hair: string;
  style: "short" | "bob" | "ponytail" | "bun" | "curly" | "scarf" | "long" | "buzz";
  glasses?: boolean;
  jumper: string;
  bottom: string;
  skirt: boolean;
  bag: string;
}

const SKINS = ["#f0c9a4", "#d9a77c", "#b97f55", "#8c5a38", "#6a4128"];
const HAIRS = ["#2a1d16", "#4a3022", "#7a4a2a", "#1c1714", "#a8743e"];
const JUMPERS = ["#2f5a3c", "#273a5c", "#6b2f35", "#2f5a3c", "#3d4a52"];
const BAGS = ["#b4573a", "#c9a24b", "#3e6b7a", "#6e5466", "#5f7f35"];
const STYLES: PersonLook["style"][] = [
  "short", "bob", "ponytail", "curly", "bun", "buzz", "scarf", "long",
  "short", "curly", "long", "buzz", "ponytail", "bob",
];

/** Fourteen students: hair, skin, uniform and bag vary independently so nobody looks cloned. */
export const PERSON_LOOKS: PersonLook[] = STYLES.map((style, i) => ({
  style,
  skin: SKINS[(i * 3 + (i >> 3)) % SKINS.length],
  hair: style === "buzz" && i % 2 ? "#1c1714" : HAIRS[(i * 2 + (i >> 2)) % HAIRS.length],
  glasses: i % 5 === 2 || i === 9,
  jumper: JUMPERS[(i + (i >> 3)) % JUMPERS.length],
  bottom: i % 3 === 1 ? "#3a3f48" : "#4a4f58",
  skirt: style === "bob" || style === "bun" || style === "long" ? i % 2 === 1 || style === "bun" : style === "ponytail" && i % 2 === 0,
  bag: BAGS[(i * 2 + 1 + (i >> 3)) % BAGS.length],
}));

/**
 * A student in school uniform, ~30 world px tall. Origin at the feet.
 * `facing` is toward the viewer ("front") or away ("back").
 */
export function personSketch(look: PersonLook, facing: "front" | "back", frame: 0 | 1): Sketch {
  const s = new Sketch();
  s.custom([-8, -36, 8, 3], (ctx) => {
    const line = "rgba(30,24,18,0.55)";
    ctx.lineJoin = "round";
    // Shadow.
    ctx.fillStyle = "rgba(29,42,34,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.4, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs.
    const stride = frame === 0 ? [0.8, -0.6] : [-0.6, 0.8];
    const legTop = look.skirt ? -9 : -12;
    [-1.7, 1.7].forEach((lx, i) => {
      ctx.fillStyle = look.skirt ? "#2a2724" : look.bottom;
      ctx.fillRect(lx - 1.1, legTop, 2.2, -legTop + stride[i] - 0.6);
      ctx.fillStyle = "#1d1916";
      ctx.beginPath();
      ctx.ellipse(lx, stride[i] - 0.2, 1.6, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    if (look.skirt) {
      ctx.fillStyle = look.bottom;
      ctx.beginPath();
      ctx.moveTo(-3.6, -13);
      ctx.lineTo(3.6, -13);
      ctx.lineTo(4.4, -8.5);
      ctx.lineTo(-4.4, -8.5);
      ctx.closePath();
      ctx.fill();
    }
    // Backpack seen from behind.
    if (facing === "back") {
      ctx.fillStyle = look.bag;
      ctx.beginPath();
      ctx.roundRect(-3.8, -22, 7.6, 9.5, 2);
      ctx.fill();
    }
    // Torso (jumper).
    const torso = ctx.createLinearGradient(-4, 0, 4, 0);
    torso.addColorStop(0, look.jumper);
    torso.addColorStop(1, css(shade(parseInt(look.jumper.slice(1), 16), 0.7)));
    ctx.fillStyle = torso;
    ctx.beginPath();
    ctx.roundRect(-4.2, -23, 8.4, 11, 2.6);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    if (facing === "back") {
      ctx.fillStyle = look.bag;
      ctx.beginPath();
      ctx.roundRect(-3.4, -21.5, 6.8, 8.5, 1.8);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(-3.4, -18.5, 6.8, 1);
    } else {
      // Collar and straps.
      ctx.fillStyle = "#f6f1e6";
      ctx.beginPath();
      ctx.moveTo(-1.8, -23);
      ctx.lineTo(0, -20.4);
      ctx.lineTo(1.8, -23);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = look.bag;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-2.8, -22.6);
      ctx.lineTo(-2.4, -15);
      ctx.moveTo(2.8, -22.6);
      ctx.lineTo(2.4, -15);
      ctx.stroke();
    }
    // Arms.
    ctx.fillStyle = css(shade(parseInt(look.jumper.slice(1), 16), 0.85));
    ctx.fillRect(-5.4, -22, 1.6, 8);
    ctx.fillRect(3.8, -22, 1.6, 8);
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(-4.6, -13.6, 1, 0, Math.PI * 2);
    ctx.arc(4.6, -13.6, 1, 0, Math.PI * 2);
    ctx.fill();
    // Neck and head.
    ctx.fillStyle = look.skin;
    ctx.fillRect(-1, -25, 2, 2.4);
    const hy = -28.4;
    if (look.style === "scarf") {
      ctx.fillStyle = look.bag;
      ctx.beginPath();
      ctx.ellipse(0, hy + 0.6, 5.2, 5.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4.4, hy + 2);
      ctx.lineTo(4.4, hy + 2);
      ctx.lineTo(3.6, hy + 6.5);
      ctx.lineTo(-3.6, hy + 6.5);
      ctx.fill();
      if (facing === "front") {
        ctx.fillStyle = look.skin;
        ctx.beginPath();
        ctx.ellipse(0, hy + 0.8, 3.1, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Hair behind the head.
      ctx.fillStyle = look.hair;
      if (look.style === "bob") {
        ctx.beginPath();
        ctx.roundRect(-5, hy - 4.6, 10, 9, 4);
        ctx.fill();
      }
      if (look.style === "ponytail") {
        ctx.beginPath();
        ctx.ellipse(facing === "back" ? 0 : 4.6, hy + 2.5, 1.8, 3.6, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (look.style === "long") {
        ctx.beginPath();
        ctx.roundRect(-4.9, hy - 4.4, 9.8, 11.6, 3.6);
        ctx.fill();
      }
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.arc(0, hy, 4.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = look.hair;
      if (facing === "back") {
        ctx.beginPath();
        ctx.arc(0, hy - 0.2, 4.5, Math.PI * 0.95, Math.PI * 2.05);
        ctx.lineTo(4.4, hy + 2.6);
        ctx.lineTo(-4.4, hy + 2.6);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, hy - 0.4, 4.5, Math.PI * 1.02, Math.PI * 1.98);
        ctx.quadraticCurveTo(2, hy - 2.4, -4.4, hy - 0.6);
        ctx.closePath();
        ctx.fill();
      }
      if (look.style === "curly") {
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (1.05 + i * 0.15);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 4.2, hy + Math.sin(a) * 4.2, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (look.style === "bun") {
        ctx.beginPath();
        ctx.arc(0, hy - 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (facing === "front") {
      ctx.fillStyle = "#2a201a";
      ctx.beginPath();
      ctx.arc(-1.5, hy + 0.9, 0.48, 0, Math.PI * 2);
      ctx.arc(1.5, hy + 0.9, 0.48, 0, Math.PI * 2);
      ctx.fill();
      if (look.glasses) {
        ctx.strokeStyle = "rgba(40,32,26,0.85)";
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.arc(-1.5, hy + 0.9, 1.15, 0, Math.PI * 2);
        ctx.moveTo(2.65, hy + 0.9);
        ctx.arc(1.5, hy + 0.9, 1.15, 0, Math.PI * 2);
        ctx.moveTo(-0.35, hy + 0.8);
        ctx.lineTo(0.35, hy + 0.8);
        ctx.stroke();
      }
    }
  });
  return s;
}


// ------------------------------------------------------- planning hub

/** Hub footprint inside the plot (plot-local grid units). */
export const HUB = { x: 0.55, y: 0.5, w: 1.9, d: 1.55, h: 34 } as const;

/** The Planning Hub: a small timber-and-glass coordination building. Origin = plot back corner. */
export function planningHubSketch(fonts: ArtFonts): Sketch {
  const s = new Sketch();
  const { x, y, w, d, h } = HUB;
  const x1 = x + w;
  const y1 = y + d;
  const timber = 0xa47a52;
  s.box(x - 0.05, y - 0.05, 0, w + 0.1, d + 0.1, 4, wallShades(PAL.stone));
  s.box(x, y, 4, w, d, h - 4, wallShades(timber));
  for (let i = 1; i < 10; i++) {
    const yy = y + (d * i) / 10;
    s.line([iso(x1, yy, 5), iso(x1, yy, h - 1)], shade(timber, 0.7), 0.5, 0.7);
  }
  // Glass front with a warm interior and a data screen.
  s.custom([iso(x, y1).x - 3, iso(x, y1, h).y - 4, iso(x1, y1).x + 3, iso(x1, y1, 4).y + 3], (ctx) => {
    const pts = P([[x + 0.08, y1, 6], [x1 - 0.5, y1, 6], [x1 - 0.5, y1, h - 7], [x + 0.08, y1, h - 7]]);
    polyPath(ctx, pts);
    ctx.fillStyle = linear(ctx, pts[3], pts[0], [[0, "#ffe7b9"], [1, "#d9894a"]]);
    ctx.fill();
    ctx.strokeStyle = css(PAL.bronze);
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= 4; i++) {
      const xx = x + 0.08 + ((x1 - 0.58 - x) * i) / 4;
      const a = iso(xx, y1, 6);
      const b = iso(xx, y1, h - 7);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Student information screen beside the door.
    const sc = P([[x1 - 0.42, y1 + 0.005, 11], [x1 - 0.08, y1 + 0.005, 11], [x1 - 0.08, y1 + 0.005, 25], [x1 - 0.42, y1 + 0.005, 25]]);
    polyPath(ctx, sc);
    ctx.fillStyle = "#1c2b33";
    ctx.fill();
    ctx.fillStyle = "#e2c27a";
    for (let i = 0; i < 3; i++) {
      const b0 = iso(x1 - 0.36 + i * 0.1, y1 + 0.006, 13);
      const hgt = [4, 7, 10][i];
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y);
      ctx.lineTo(b0.x + 2.2, b0.y + 1.1);
      ctx.lineTo(b0.x + 2.2, b0.y + 1.1 - hgt);
      ctx.lineTo(b0.x, b0.y - hgt);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#7fc3a6";
    const t = iso(x1 - 0.38, y1 + 0.006, 23.5);
    ctx.fillRect(t.x, t.y, 6, 0.9);
  });
  // Sign band.
  s.leftRect(y1, x, x1, h - 6, h, PAL.forest, edge(0.45));
  s.custom([iso(x, y1).x - 2, iso(x, y1, h + 2).y - 6, iso(x1, y1).x + 2, iso(x1, y1, h - 7).y + 2], (ctx) => {
    wallText(ctx, "PLANNING HUB", iso(x + 0.18, y1, h - 4.6), { size: 4.2, color: css(0xe9c979), font: fonts.display, weight: 600, tracking: 0.9 });
  });
  // Side window.
  rightWindow(s, x1, y + 0.35, y + 1.0, 12, 24, true);
  // Flat roof, parapet and a small solar canopy.
  s.box(x - 0.04, y - 0.04, h, w + 0.08, d + 0.08, 2.5, wallShades(0xe6dccb));
  s.custom([iso(x + 0.3, y + 0.25).x - 6, iso(x + 0.3, y + 0.25, h + 14).y - 6, iso(x1, y).x + 6, iso(x1 - 0.2, y1 - 0.2, h).y + 6], (ctx) => {
    const pts = P([[x + 0.35, y + 0.25, h + 10], [x1 - 0.2, y + 0.25, h + 10], [x1 - 0.2, y + 0.95, h + 5], [x + 0.35, y + 0.95, h + 5]]);
    polyPath(ctx, pts);
    ctx.fillStyle = linear(ctx, pts[0], pts[2], [[0, "#3d5a78"], [1, "#1f3048"]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(190,215,235,0.5)";
    ctx.lineWidth = 0.4;
    for (let i = 1; i < 4; i++) {
      const xx = x + 0.35 + ((x1 - 0.55 - x) * i) / 4;
      const a = iso(xx, y + 0.25, h + 10);
      const b = iso(xx, y + 0.95, h + 5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  });
  for (const [px, py] of [[x + 0.4, y + 0.95], [x1 - 0.25, y + 0.95]] as const) s.box(px, py, h, 0.04, 0.04, 5, wallShades(0x8b9397), null);
  // Shaded veranda with benches.
  s.box(x - 0.05, y1, h - 7, w + 0.1, 0.45, 1.8, { top: 0xd8c3a0, left: 0x7a5636, right: 0x5f4129 });
  for (const px of [x + 0.02, x1 - 0.06]) s.box(px, y1 + 0.38, 0, 0.04, 0.04, h - 7, wallShades(PAL.woodDark), null);
  s.box(x + 0.15, y1 + 0.12, 0, 0.7, 0.16, 5, wallShades(PAL.wood));
  // Planters with greenery.
  const rng = createRng(808);
  for (const [px, py] of [[x - 0.25, y1 + 0.1], [x1 + 0.05, y1 - 0.2]] as const) {
    s.box(px, py, 0, 0.22, 0.22, 6, wallShades(PAL.woodDark));
    for (let i = 0; i < 4; i++) {
      const c = iso(px + 0.05 + rng() * 0.12, py + 0.05 + rng() * 0.12, 8 + rng() * 3);
      s.circle(c.x, c.y, 2.4, { fill: i % 2 ? PAL.leaf : PAL.leafLight });
    }
  }
  return s;
}

/** Paved grounds that replace the empty plot once the hub is built. */
export function hubGroundsSketch(): Sketch {
  const s = new Sketch();
  const { w, d } = MEADOW;
  s.custom([iso(0, d).x - 2, iso(0, 0).y - 2, iso(w, 0).x + 2, iso(w, d).y + 2], (ctx) => {
    const pts = [iso(0.1, 0.1), iso(w - 0.1, 0.1), iso(w - 0.1, d - 0.1), iso(0.1, d - 0.1)];
    polyPath(ctx, pts);
    ctx.fillStyle = css(shade(PAL.paver, 1.04));
    ctx.fill();
    ctx.strokeStyle = css(PAL.paverDark, 0.5);
    ctx.lineWidth = 0.45;
    for (let i = 1; i < w * 2; i++) {
      const a = iso(i / 2, 0.1);
      const b = iso(i / 2, d - 0.1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let i = 1; i < d * 2; i++) {
      const a = iso(0.1, i / 2);
      const b = iso(w - 0.1, i / 2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.strokeStyle = css(PAL.kerb, 0.85);
    ctx.lineWidth = 1.2;
    polyPath(ctx, pts);
    ctx.stroke();
    softShadow(ctx, [iso(HUB.x, HUB.y), iso(HUB.x + HUB.w + 1, HUB.y), iso(HUB.x + HUB.w + 1, HUB.y + HUB.d), iso(HUB.x, HUB.y + HUB.d)], 8, 0.32);
  });
  // A low hedge along the back edges.
  const rng = createRng(919);
  for (let i = 0; i < 10; i++) {
    const p = iso(0.15 + (i / 9) * (w - 0.3), 0.18);
    s.circle(p.x, p.y - 3, 3 + rng(), { fill: i % 2 ? PAL.leaf : PAL.leafDark });
  }
  return s;
}

/** Timber-and-steel scaffolding around the hub footprint. */
export function scaffoldSketch(): Sketch {
  const s = new Sketch();
  const { x, y, w, d, h } = HUB;
  const pole = { top: 0xd9dee0, left: 0xb3babd, right: 0x868e92 };
  const posts: [number, number][] = [
    [x - 0.1, y - 0.1],
    [x + w + 0.06, y - 0.1],
    [x + w + 0.06, y + d + 0.06],
    [x - 0.1, y + d + 0.06],
    [x + w / 2, y + d + 0.06],
    [x + w + 0.06, y + d / 2],
  ];
  for (const [px, py] of posts) s.box(px, py, 0, 0.04, 0.04, h + 6, pole, null);
  for (const z of [12, 24, h + 4]) {
    s.box(x - 0.1, y + d + 0.06, z, w + 0.2, 0.18, 1.2, { top: 0xc79a62, left: 0x9c7048, right: 0x7a5636 }, edge(0.3, 0.5));
    s.box(x + w + 0.06, y - 0.1, z, 0.18, d + 0.2, 1.2, { top: 0xc79a62, left: 0x9c7048, right: 0x7a5636 }, edge(0.3, 0.5));
  }
  s.line([iso(x - 0.1, y + d + 0.08, 2), iso(x + w / 2, y + d + 0.08, 24)], 0x868e92, 0.6);
  s.line([iso(x + w + 0.08, y - 0.1, 2), iso(x + w + 0.08, y + d / 2, 24)], 0x868e92, 0.6);
  return s;
}

// ---------------------------------------------------------------- ground

function groundSketch(): Sketch {
  const s = new Sketch();
  const D = GROUND_DEPTH;
  const land = (x: number, y: number) => tileAt(x, y) !== "water";
  const b = { minX: iso(0, GRID).x - 30, minY: -30, maxX: iso(GRID, 0).x + 30, maxY: iso(GRID, GRID).y + D + 30 };
  s.custom([b.minX, b.minY, b.maxX, b.maxY], (ctx) => {
    const rng = createRng(1357);
    const tile = (x: number, y: number, z = 0) => [iso(x, y, z), iso(x + 1, y, z), iso(x + 1, y + 1, z), iso(x, y + 1, z)];

    // Deep-water shadow and foam around the island.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!land(x, y)) continue;
        if (land(x + 1, y) && land(x, y + 1) && land(x - 1, y) && land(x, y - 1)) continue;
        const g = 0.45;
        softShadow(ctx, [iso(x - g, y - g, -D - 4), iso(x + 1 + g, y - g, -D - 4), iso(x + 1 + g, y + 1 + g, -D - 4), iso(x - g, y + 1 + g, -D - 4)], 10, 0.22, 0x163a40);
      }
    }
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!land(x, y) || (land(x + 1, y) && land(x, y + 1))) continue;
        const g = 0.12;
        polyPath(ctx, [iso(x - g, y - g, -D), iso(x + 1 + g, y - g, -D), iso(x + 1 + g, y + 1 + g, -D), iso(x - g, y + 1 + g, -D)]);
        ctx.fillStyle = css(PAL.foam, 0.45);
        ctx.fill();
      }
    }

    const order: [number, number][] = [];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (land(x, y)) order.push([x, y]);
    order.sort((a, c) => a[0] + a[1] - (c[0] + c[1]));

    // Cliff faces with strata and a mossy lip.
    for (const [x, y] of order) {
      const faces: [V2, V2, boolean][] = [];
      if (!land(x + 1, y)) faces.push([iso(x + 1, y), iso(x + 1, y + 1), true]);
      if (!land(x, y + 1)) faces.push([iso(x, y + 1), iso(x + 1, y + 1), false]);
      for (const [a, c, right] of faces) {
        const pts = [a, c, { x: c.x, y: c.y + D }, { x: a.x, y: a.y + D }];
        polyPath(ctx, pts);
        const top = right ? shade(PAL.cliffTop, 0.82) : PAL.cliffTop;
        ctx.fillStyle = linear(ctx, { x: 0, y: Math.min(a.y, c.y) }, { x: 0, y: Math.max(a.y, c.y) + D }, [
          [0, css(top)],
          [1, css(right ? shade(PAL.cliffBottom, 0.85) : PAL.cliffBottom)],
        ]);
        ctx.fill();
        ctx.strokeStyle = "rgba(40,28,18,0.25)";
        ctx.lineWidth = 0.6;
        for (const f of [0.38, 0.62, 0.82]) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y + D * f + (rng() - 0.5) * 2);
          ctx.lineTo(c.x, c.y + D * f + (rng() - 0.5) * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = css(PAL.moss, 0.95);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y + 1);
        ctx.lineTo(c.x, c.y + 1);
        ctx.stroke();
      }
    }

    // Grass and meadow tops.
    for (const [x, y] of order) {
      const k = tileAt(x, y);
      if (k !== "grass" && k !== "meadow") continue;
      polyPath(ctx, tile(x, y));
      const base = k === "meadow" ? PAL.meadow : PAL.grass;
      ctx.fillStyle = css(shade(base, 0.97 + rng() * 0.06));
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    // Organic colour variation instead of a checkerboard.
    for (let i = 0; i < 900; i++) {
      const [x, y] = order[Math.floor(rng() * order.length)];
      const k = tileAt(x, y);
      if (k !== "grass" && k !== "meadow") continue;
      const p = iso(x + rng(), y + rng());
      const r = 5 + rng() * 14;
      const light = rng() < 0.5;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, css(light ? PAL.grassLight : PAL.grassDark, 0.22));
      g.addColorStop(1, css(light ? PAL.grassLight : PAL.grassDark, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Paving, decking and the service yard.
    const paved = (x: number, y: number) => {
      const k = tileAt(x, y);
      return k === "path" || k === "plaza" || k === "terrace" || k === "yard";
    };
    for (const [x, y] of order) {
      const k = tileAt(x, y);
      if (!paved(x, y)) continue;
      const pts = tile(x, y);
      polyPath(ctx, pts);
      if (k === "terrace") {
        ctx.fillStyle = css(shade(PAL.deck, 0.96 + rng() * 0.06));
        ctx.fill();
        ctx.strokeStyle = css(PAL.deckLine, 0.55);
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 6; i++) {
          const a = iso(x, y + i / 6);
          const c = iso(x + 1, y + i / 6);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
      } else if (k === "yard") {
        ctx.fillStyle = css(shade(PAL.yard, 0.96 + rng() * 0.05));
        ctx.fill();
        ctx.strokeStyle = "rgba(90,80,65,0.25)";
        ctx.lineWidth = 0.5;
        const a = iso(x, y + 0.5);
        const c = iso(x + 1, y + 0.5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      } else {
        const base = k === "plaza" ? shade(PAL.paver, 1.06) : PAL.paver;
        ctx.fillStyle = css(shade(base, 0.96 + rng() * 0.06));
        ctx.fill();
        // Individual pavers on a half-tile grid.
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            if (rng() < 0.35) {
              polyPath(ctx, [iso(x + i / 2, y + j / 2), iso(x + (i + 1) / 2, y + j / 2), iso(x + (i + 1) / 2, y + (j + 1) / 2), iso(x + i / 2, y + (j + 1) / 2)]);
              ctx.fillStyle = css(rng() < 0.5 ? 0xffffff : 0x6b5a3e, 0.06);
              ctx.fill();
            }
          }
        }
        ctx.strokeStyle = css(PAL.paverDark, 0.55);
        ctx.lineWidth = 0.45;
        for (const t of [0.5]) {
          const a = iso(x + t, y);
          const c = iso(x + t, y + 1);
          const e = iso(x, y + t);
          const f = iso(x + 1, y + t);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(f.x, f.y);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = css(PAL.paverDark, 0.35);
      ctx.lineWidth = 0.5;
      polyPath(ctx, pts);
      ctx.stroke();
    }
    // Kerbs where paving meets grass.
    for (const [x, y] of order) {
      if (!paved(x, y)) continue;
      const [N, E, S, W] = tile(x, y);
      const edges: [boolean, V2, V2][] = [
        [!paved(x, y - 1), N, E],
        [!paved(x + 1, y), E, S],
        [!paved(x, y + 1), S, W],
        [!paved(x - 1, y), W, N],
      ];
      for (const [show, a, c] of edges) {
        if (!show) continue;
        ctx.strokeStyle = css(PAL.kerb, 0.85);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
    }

    // Tufts and small flowers on grass.
    for (const [x, y] of order) {
      const k = tileAt(x, y);
      if (k !== "grass" && k !== "meadow") continue;
      const n = k === "meadow" ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const p = iso(x + 0.1 + rng() * 0.8, y + 0.1 + rng() * 0.8);
        if (rng() < 0.65) {
          ctx.strokeStyle = css(PAL.tuft, 0.7);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x - 1.5, p.y);
          ctx.lineTo(p.x - 0.8, p.y - 2.6);
          ctx.moveTo(p.x + 0.6, p.y);
          ctx.lineTo(p.x + 1.4, p.y - 2.8);
          ctx.stroke();
        } else {
          ctx.fillStyle = rng() < 0.5 ? "rgba(243,236,221,0.9)" : "rgba(226,178,74,0.9)";
          ctx.beginPath();
          ctx.arc(p.x, p.y - 0.5, 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Soft cast shadows (sun from the upper left, falling toward +x) and contact shadows.
    const footprint = (x: number, y: number, w: number, d: number, len: number) => [
      iso(x, y),
      iso(x + w + len, y),
      iso(x + w + len, y + d),
      iso(x, y + d),
    ];
    softShadow(ctx, footprint(KITCHEN.x, KITCHEN.y, KITCHEN.w, KITCHEN.d, 1.7), 9, 0.34);
    softShadow(ctx, footprint(KITCHEN.x - 0.06, KITCHEN.y - 0.06, KITCHEN.w + 0.12, KITCHEN.d + 0.12, 0), 3, 0.5);
    for (const h of HOMES) {
      softShadow(ctx, footprint(h.x, h.y, 1, 1, h.style === "townhouse" ? 1.1 : 0.75), 6, 0.3);
      softShadow(ctx, footprint(h.x - 0.05, h.y - 0.05, 1.1, 1.1, 0), 2.5, 0.45);
    }
    for (const t of TREES) {
      const p = iso(t.x + 0.65, t.y + 0.55);
      const r = t.kind === "bush" ? 7 : 12;
      softShadow(ctx, Array.from({ length: 12 }, (_, i) => ({ x: p.x + 5 + Math.cos((i / 12) * Math.PI * 2) * r, y: p.y + Math.sin((i / 12) * Math.PI * 2) * r * 0.5 })), 5, 0.26);
    }
    for (const t of TABLES) softShadow(ctx, footprint(t.x + 0.1, t.y + 0.1, 0.8, 0.8, 0.5), 5, 0.22);
    softShadow(ctx, footprint(TRAY_RETURN.x + 0.1, TRAY_RETURN.y + 0.2, 0.85, 0.45, 0.4), 3, 0.3);
    for (const f of FLOWERBEDS) softShadow(ctx, footprint(f.x + 0.18, f.y + 0.18, 0.64, 0.64, 0.12), 2, 0.3);
    for (const bp of BARRIER_POSTS) {
      const p = iso(bp.x, bp.y);
      softShadow(ctx, [{ x: p.x - 1, y: p.y }, { x: p.x + 9, y: p.y + 2 }, { x: p.x + 9, y: p.y + 3 }, { x: p.x, y: p.y + 1.5 }], 1.5, 0.25);
    }
  });
  return s;
}

// ---------------------------------------------------------------- catalog

export interface PersonFrames {
  /** Atlas frames: [stride 0, stride 1] for each facing. */
  front: [BakedTexture, BakedTexture];
  back: [BakedTexture, BakedTexture];
}

export interface ArtCatalog {
  ground: BakedTexture;
  kitchen: BakedTexture;
  cook: BakedTexture;
  sizesSign: BakedTexture;
  pans: Record<"full" | "half" | "empty", BakedTexture>;
  shutter: BakedTexture;
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
  missionBoard: BakedTexture;
  sustainFlag: BakedTexture;
  plaqueMission: BakedTexture;
  boardNotes: BakedTexture[];
  glow: BakedTexture;
  bird: BakedTexture;
  chat: BakedTexture;
  backpacks: BakedTexture[];
  menuBoard: BakedTexture;
  ecoStation: BakedTexture;
  mopBucket: BakedTexture;
  planters: BakedTexture[];
  tableTrays: Record<"full" | "empty", BakedTexture>;
  selYard: BakedTexture;
  table: BakedTexture;
  crates: BakedTexture;
  flowerbeds: BakedTexture[];
  meadow: BakedTexture;
  trayReturn: BakedTexture;
  scraps: BakedTexture;
  leftoverPot: BakedTexture;
  barrier: BakedTexture;
  barrierEnd: BakedTexture;
  selKitchen: BakedTexture;
  selMeadow: BakedTexture;
  selTile: BakedTexture;
  marker: BakedTexture;
  plaqueCafeteria: BakedTexture;
  plaquePlot: BakedTexture;
  plaqueBuild: BakedTexture;
  plaqueHub: BakedTexture;
  hub: BakedTexture;
  hubGrounds: BakedTexture;
  scaffold: BakedTexture;
  puff: BakedTexture;
  shimmer: BakedTexture;
  sparkle: BakedTexture;
  trays: Record<"regular" | "small", BakedTexture>;
  bubbles: Record<"empty" | "time", BakedTexture>;
  people: PersonFrames[];
}

/** Bakes every texture once. Safe to call again: existing keys are replaced. */
export function bakeArt(scene: Phaser.Scene, fonts: ArtFonts): ArtCatalog {
  const atlas = new AtlasBuilder(scene, "eco-atlas");
  const b = (key: string, sk: Sketch, scale?: number) => bake(atlas, key, sk, scale);
  const homes: Record<string, BakedTexture> = {};
  for (const h of HOMES) homes[h.id] = b(`home-${h.id}`, homeSketch(h));
  const trees: Record<string, BakedTexture> = {};
  for (const kind of ["round", "pine", "bush"] as const) {
    for (const v of [0, 1]) trees[`${kind}-${v}`] = b(`tree-${kind}-${v}`, treeSketch(kind, v));
  }
  const people: PersonFrames[] = PERSON_LOOKS.map((look, i) => {
    const f0 = b(`person-${i}-f0`, personSketch(look, "front", 0), 3);
    const f1 = b(`person-${i}-f1`, personSketch(look, "front", 1), 3);
    const k0 = b(`person-${i}-b0`, personSketch(look, "back", 0), 3);
    const k1 = b(`person-${i}-b1`, personSketch(look, "back", 1), 3);
    return { front: [f0, f1], back: [k0, k1] };
  });
  const catalog: ArtCatalog = {
    ground: b("ground", groundSketch()),
    kitchen: b("kitchen", cafeteriaSketch(fonts), 2.5),
    cook: b("cook", cookSketch()),
    sizesSign: b("sizes-sign", sizesSignSketch()),
    pans: {
      full: b("pans-full", pansSketch("full"), 2.5),
      half: b("pans-half", pansSketch("half"), 2.5),
      empty: b("pans-empty", pansSketch("empty"), 2.5),
    },
    shutter: b("shutter", shutterSketch(), 2.5),
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
    missionBoard: b("mission-board", missionBoardSketch(fonts), 3),
    sustainFlag: b("sustain-flag", sustainFlagSketch(), 3),
    plaqueMission: b("plaque-mission", plaqueSketch("Waste Audit", "audit", fonts), 3),
    boardNotes: [0, 1, 2, 3, 4].map((i) => b(`board-note-${i}`, boardNoteSketch(i), 3)),
    glow: b("glow", glowSketch()),
    bird: b("bird", birdSketch(), 3),
    chat: b("chat", chatSketch(), 3),
    backpacks: [PAL.terracotta, 0x3e6b7a, PAL.gold].map((c, i) => b(`backpack-${i}`, backpackSketch(c), 3)),
    menuBoard: b("menu-board", menuBoardSketch(fonts), 3),
    ecoStation: b("eco-station", ecoStationSketch(), 3),
    mopBucket: b("mop-bucket", mopBucketSketch(), 3),
    planters: [0, 1].map((v) => b(`planter-${v}`, planterSketch(v), 3)),
    tableTrays: { full: b("table-tray-full", tableTraySketch(true), 3), empty: b("table-tray-empty", tableTraySketch(false), 3) },
    selYard: b("sel-yard", selectionSketch(YARD.w, YARD.d)),
    table: b("table", tableSketch()),
    crates: b("crates", cratesSketch()),
    flowerbeds: [0, 1, 2].map((v) => b(`flowerbed-${v}`, flowerbedSketch(v))),
    meadow: b("meadow", meadowSketch()),
    trayReturn: b("tray-return", trayReturnSketch(fonts), 3),
    scraps: b("scraps", scrapsSketch(), 3),
    leftoverPot: b("leftover-pot", leftoverPotSketch(), 3),
    barrier: b("barrier", barrierSketch(true)),
    barrierEnd: b("barrier-end", barrierSketch(false)),
    selKitchen: b("sel-kitchen", selectionSketch(KITCHEN.w, KITCHEN.d)),
    selMeadow: b("sel-meadow", selectionSketch(MEADOW.w, MEADOW.d)),
    selTile: b("sel-tile", selectionSketch(1, 1)),
    marker: b("marker", markerSketch()),
    plaqueCafeteria: b("plaque-cafeteria", plaqueSketch("School Cafeteria", "cafeteria", fonts), 3),
    plaquePlot: b("plaque-plot", plaqueSketch("Future building", "lock", fonts), 3),
    plaqueBuild: b("plaque-build", plaqueSketch("Build here", "plus", fonts, true), 3),
    plaqueHub: b("plaque-hub", plaqueSketch("Planning Hub", "hub", fonts), 3),
    hub: b("planning-hub", planningHubSketch(fonts), 2.5),
    hubGrounds: b("hub-grounds", hubGroundsSketch()),
    scaffold: b("scaffold", scaffoldSketch(), 2.5),
    puff: b("puff", puffSketch()),
    shimmer: b("shimmer", shimmerSketch()),
    sparkle: b("sparkle", sparkleSketch()),
    trays: { regular: b("tray-regular", traySketch("regular"), 3), small: b("tray-small", traySketch("small"), 3) },
    bubbles: { empty: b("bubble-empty", bubbleSketch("empty"), 3), time: b("bubble-time", bubbleSketch("time"), 3) },
    people,
  };
  atlas.finish();
  return catalog;
}

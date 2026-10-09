// Isometric drawing primitives, ported from Greenhold's art baker so FutureShift
// shares the same projection, face shading and outline treatment.

export const TILE_W = 64;
export const TILE_H = 32;

export type Pt = { x: number; y: number };
export type Ctx = CanvasRenderingContext2D;

/** World tile coords (x, y, height z in px) to world pixels. */
export const iso = (x: number, y: number, z = 0): Pt => ({
  x: (x - y) * (TILE_W / 2),
  y: (x + y) * (TILE_H / 2) - z,
});

/** Inverse of iso() at z = 0. */
export const unIso = (px: number, py: number): Pt => {
  const a = px / (TILE_W / 2);
  const b = py / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
};

export const rgba = (c: number, a = 1) =>
  `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

export const shade = (c: number, k: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};

export const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) =>
    Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export const EDGE = "rgba(40,30,25,0.35)";

export function poly(c: Ctx, pts: Pt[], fill: string, stroke?: string | null, lw = 0.7) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

export type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/** Shaded iso box: +y face, +x face and top, like Greenhold's buildings. */
export function box(
  c: Ctx,
  b: Box,
  color: number,
  o: { top?: number; edge?: string | null; flatTop?: boolean } = {},
) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  const edge = o.edge === undefined ? EDGE : o.edge;
  poly(c, [iso(x0, y1, z1), iso(x1, y1, z1), iso(x1, y1, z0), iso(x0, y1, z0)], rgba(shade(color, 0.9)), edge);
  poly(c, [iso(x1, y1, z1), iso(x1, y0, z1), iso(x1, y0, z0), iso(x1, y1, z0)], rgba(shade(color, 0.72)), edge);
  if (o.flatTop !== false)
    poly(c, [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], rgba(o.top ?? shade(color, 1.1)), edge);
}

/** Rectangle painted on a +y facing wall (at y), spanning x0..x1 and z0..z1. */
export function faceY(c: Ctx, y: number, x0: number, x1: number, z0: number, z1: number, fill: string) {
  poly(c, [iso(x0, y, z1), iso(x1, y, z1), iso(x1, y, z0), iso(x0, y, z0)], fill);
}

/** Rectangle painted on a +x facing wall (at x), spanning y0..y1 and z0..z1. */
export function faceX(c: Ctx, x: number, y0: number, y1: number, z0: number, z1: number, fill: string) {
  poly(c, [iso(x, y0, z1), iso(x, y1, z1), iso(x, y1, z0), iso(x, y0, z0)], fill);
}

/** Flat quad on the ground (or at height z). */
export function flat(c: Ctx, x0: number, y0: number, x1: number, y1: number, fill: string, z = 0, stroke?: string) {
  poly(c, [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], fill, stroke);
}

/** Soft shaded sphere used for foliage, as in Greenhold. */
export function blob(c: Ctx, x: number, y: number, r: number, color: number, hi = 1.25) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(shade(color, hi)));
  g.addColorStop(1, rgba(shade(color, 0.78)));
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();
}

export function glow(c: Ctx, x: number, y: number, r: number, color: number, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Vertical cylinder (tank, trunk, chimney). */
export function cylinder(c: Ctx, x: number, y: number, r: number, z0: number, z1: number, color: number) {
  const rr = r / 2;
  const g = c.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, rgba(shade(color, 1.05)));
  g.addColorStop(0.55, rgba(shade(color, 0.85)));
  g.addColorStop(1, rgba(shade(color, 0.62)));
  c.beginPath();
  c.ellipse(x, y - z0, r, rr, 0, 0, Math.PI);
  c.lineTo(x - r, y - z1);
  c.ellipse(x, y - z1, r, rr, 0, Math.PI, 0, true);
  c.closePath();
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = EDGE;
  c.lineWidth = 0.6;
  c.stroke();
  c.beginPath();
  c.ellipse(x, y - z1, r, rr, 0, 0, Math.PI * 2);
  c.fillStyle = rgba(shade(color, 1.15));
  c.fill();
  c.stroke();
}

/** Seeded PRNG (Park-Miller), same as Greenhold's. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t: number) => {
  const k = clamp(t, 0, 1);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
/** Overshoot settle used for "lands and settles" placement motion. */
export const easeBack = (t: number) => {
  const k = clamp(t, 0, 1);
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

export function pointInPoly(p: Pt, pts: Pt[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

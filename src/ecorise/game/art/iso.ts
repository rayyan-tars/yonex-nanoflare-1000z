import type Phaser from "phaser";

/** World pixels for one isometric tile (2:1 diamond). */
export const TILE_W = 64;
export const TILE_H = 32;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Textures are baked at this multiple of world size so they stay crisp when zoomed. */
export const TEX_SCALE = 2;

export interface V2 {
  x: number;
  y: number;
}
export type P3 = readonly [number, number, number];

/** Projects grid coordinates (tiles) and height (world px) to world pixels. */
export function iso(x: number, y: number, z = 0): V2 {
  return { x: (x - y) * HW, y: (x + y) * HH - z };
}

export const OUTLINE = 0x3b2a20;

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const ca = (a >> s) & 255;
    const cb = (b >> s) & 255;
    return Math.round(ca + (cb - ca) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

interface Stroke {
  stroke?: number;
  strokeAlpha?: number;
  width?: number;
}
interface Fill extends Stroke {
  fill?: number;
  alpha?: number;
}

type Shape =
  | ({ k: "poly"; pts: V2[] } & Fill)
  | ({ k: "circle"; x: number; y: number; r: number } & Fill)
  | ({ k: "ellipse"; x: number; y: number; rx: number; ry: number } & Fill)
  | { k: "line"; pts: V2[]; color: number; alpha: number; width: number };

const DEFAULT_EDGE: Stroke = { stroke: OUTLINE, strokeAlpha: 0.45, width: 1 };

/**
 * Records vector shapes in world-pixel space relative to a local origin,
 * then bakes them once into a static texture.
 */
export class Sketch {
  readonly shapes: Shape[] = [];

  poly(pts: V2[], style: Fill = {}) {
    this.shapes.push({ k: "poly", pts, ...style });
    return this;
  }

  /** Polygon from grid-space points (x, y in tiles; z in world px). */
  face(pts: readonly P3[], fill: number, edge: Stroke | null = DEFAULT_EDGE, alpha = 1) {
    return this.poly(
      pts.map(([x, y, z]) => iso(x, y, z)),
      { fill, alpha, ...(edge ?? {}) },
    );
  }

  circle(x: number, y: number, r: number, style: Fill) {
    this.shapes.push({ k: "circle", x, y, r, ...style });
    return this;
  }

  ellipse(x: number, y: number, rx: number, ry: number, style: Fill) {
    this.shapes.push({ k: "ellipse", x, y, rx, ry, ...style });
    return this;
  }

  line(pts: V2[], color: number, width = 1, alpha = 1) {
    this.shapes.push({ k: "line", pts, color, width, alpha });
    return this;
  }

  /** Axis-aligned box with the three visible faces shaded for top-left light. */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: { top: number; left: number; right: number },
    edge: Stroke | null = DEFAULT_EDGE,
  ) {
    const x1 = x + w;
    const y1 = y + d;
    const z1 = z + h;
    this.face([[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], color.left, edge);
    this.face([[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]], color.right, edge);
    this.face([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], color.top, edge);
    return this;
  }

  /** Rectangle on the left-facing wall plane (y = const). */
  leftRect(y: number, xa: number, xb: number, za: number, zb: number, fill: number, edge: Stroke | null = DEFAULT_EDGE) {
    return this.face([[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]], fill, edge);
  }

  /** Rectangle on the right-facing wall plane (x = const). */
  rightRect(x: number, ya: number, yb: number, za: number, zb: number, fill: number, edge: Stroke | null = DEFAULT_EDGE) {
    return this.face([[x, ya, za], [x, yb, za], [x, yb, zb], [x, ya, zb]], fill, edge);
  }
}

export interface BakedTexture {
  key: string;
  /** Origin (0–1) that places local (0, 0) on the object's position. */
  originX: number;
  originY: number;
}

function shapeBounds(s: Shape, b: { minX: number; minY: number; maxX: number; maxY: number }) {
  const grow = (x: number, y: number, pad: number) => {
    b.minX = Math.min(b.minX, x - pad);
    b.minY = Math.min(b.minY, y - pad);
    b.maxX = Math.max(b.maxX, x + pad);
    b.maxY = Math.max(b.maxY, y + pad);
  };
  if (s.k === "poly" || s.k === "line") {
    const pad = (s.k === "line" ? s.width : (s.width ?? 0)) / 2 + 0.5;
    s.pts.forEach((p) => grow(p.x, p.y, pad));
  } else if (s.k === "circle") {
    grow(s.x, s.y, s.r + (s.width ?? 0) / 2 + 0.5);
  } else {
    grow(s.x - s.rx, s.y, (s.width ?? 0) / 2 + 0.5);
    grow(s.x + s.rx, s.y, (s.width ?? 0) / 2 + 0.5);
    grow(s.x, s.y - s.ry, (s.width ?? 0) / 2 + 0.5);
    grow(s.x, s.y + s.ry, (s.width ?? 0) / 2 + 0.5);
  }
}

/** Draws a sketch into a texture once. The Graphics object is reused between bakes. */
export function bake(g: Phaser.GameObjects.Graphics, key: string, sketch: Sketch, pad = 2): BakedTexture {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  sketch.shapes.forEach((s) => shapeBounds(s, b));
  if (!Number.isFinite(b.minX)) {
    b.minX = b.minY = 0;
    b.maxX = b.maxY = 1;
  }
  const S = TEX_SCALE;
  const ox = -b.minX + pad;
  const oy = -b.minY + pad;
  const w = Math.ceil((b.maxX - b.minX + pad * 2) * S);
  const h = Math.ceil((b.maxY - b.minY + pad * 2) * S);
  const tx = (x: number) => (x + ox) * S;
  const ty = (y: number) => (y + oy) * S;

  g.clear();
  for (const s of sketch.shapes) {
    if (s.k === "line") {
      g.lineStyle(s.width * S, s.color, s.alpha);
      g.beginPath();
      g.moveTo(tx(s.pts[0].x), ty(s.pts[0].y));
      for (let i = 1; i < s.pts.length; i++) g.lineTo(tx(s.pts[i].x), ty(s.pts[i].y));
      g.strokePath();
      continue;
    }
    const hasFill = s.fill !== undefined;
    const hasStroke = s.stroke !== undefined && (s.width ?? 1) > 0;
    if (hasFill) g.fillStyle(s.fill!, s.alpha ?? 1);
    if (hasStroke) g.lineStyle((s.width ?? 1) * S, s.stroke!, s.strokeAlpha ?? 1);
    if (s.k === "poly") {
      // Graphics only reads x/y, so plain points are fine at runtime.
      const pts = s.pts.map((p) => ({ x: tx(p.x), y: ty(p.y) })) as unknown as Phaser.Math.Vector2[];
      if (hasFill) g.fillPoints(pts, true, true);
      if (hasStroke) g.strokePoints(pts, true, true);
    } else if (s.k === "circle") {
      if (hasFill) g.fillCircle(tx(s.x), ty(s.y), s.r * S);
      if (hasStroke) g.strokeCircle(tx(s.x), ty(s.y), s.r * S);
    } else {
      if (hasFill) g.fillEllipse(tx(s.x), ty(s.y), s.rx * 2 * S, s.ry * 2 * S);
      if (hasStroke) g.strokeEllipse(tx(s.x), ty(s.y), s.rx * 2 * S, s.ry * 2 * S);
    }
  }
  g.generateTexture(key, w, h);
  return { key, originX: (ox * S) / w, originY: (oy * S) / h };
}

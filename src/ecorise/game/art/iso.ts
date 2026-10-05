import type Phaser from "phaser";

/** World pixels for one isometric tile (2:1 diamond). */
export const TILE_W = 64;
export const TILE_H = 32;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Default bake resolution: textures are drawn at this multiple of world size. */
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

export const OUTLINE = 0x2a2119;

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

export function css(color: number, alpha = 1): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

interface Stroke {
  stroke?: number;
  strokeAlpha?: number;
  width?: number;
}
interface Fill extends Stroke {
  fill?: number;
  alpha?: number;
  /** Vertical light falloff across the shape (default on for polygons). */
  shading?: boolean;
}

/** Custom canvas drawing in world-local pixels. */
export type CustomDraw = (ctx: CanvasRenderingContext2D) => void;

type Shape =
  | ({ k: "poly"; pts: V2[] } & Fill)
  | ({ k: "circle"; x: number; y: number; r: number } & Fill)
  | ({ k: "ellipse"; x: number; y: number; rx: number; ry: number } & Fill)
  | { k: "line"; pts: V2[]; color: number; alpha: number; width: number }
  | { k: "custom"; bounds: [number, number, number, number]; draw: CustomDraw };

const DEFAULT_EDGE: Stroke = { stroke: OUTLINE, strokeAlpha: 0.32, width: 0.8 };

/**
 * Records shapes in world-pixel space relative to a local origin, then bakes
 * them once into a static texture with a 2D canvas (gradients, soft
 * shadows and text are available through `custom`).
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

  /** Free-form canvas drawing inside the given world-local bounds [minX, minY, maxX, maxY]. */
  custom(bounds: [number, number, number, number], draw: CustomDraw) {
    this.shapes.push({ k: "custom", bounds, draw });
    return this;
  }

  /** Axis-aligned box with the three visible faces lit from the upper left. */
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
  /** Texture key (an atlas for small art). */
  key: string;
  /** Frame inside the atlas, if any. */
  frame?: string;
  /** Origin (0–1) that places local (0, 0) on the object's position. */
  originX: number;
  originY: number;
  /** Texture pixels per world pixel; display the image at 1 / scale. */
  scale: number;
}

/**
 * Collects baked canvases and packs the small ones into one atlas so the
 * renderer binds a handful of textures instead of dozens.
 */
export class AtlasBuilder {
  private items: { name: string; canvas: HTMLCanvasElement; tex: BakedTexture }[] = [];

  constructor(
    private scene: Phaser.Scene,
    private atlasKey: string,
    private maxSide = 512,
  ) {}

  add(name: string, canvas: HTMLCanvasElement, tex: BakedTexture): BakedTexture {
    if (canvas.width > this.maxSide || canvas.height > this.maxSide) {
      if (this.scene.textures.exists(name)) this.scene.textures.remove(name);
      this.scene.textures.addCanvas(name, canvas);
      return { ...tex, key: name };
    }
    this.items.push({ name, canvas, tex });
    return tex;
  }

  /** Packs collected canvases (shelf packing) and fixes up their texture references. */
  finish(): void {
    const pad = 2;
    const width = 2048;
    const sorted = [...this.items].sort((a, b) => b.canvas.height - a.canvas.height);
    let x = pad;
    let y = pad;
    let shelf = 0;
    const placed: { item: (typeof sorted)[number]; x: number; y: number }[] = [];
    for (const item of sorted) {
      const w = item.canvas.width;
      const h = item.canvas.height;
      if (x + w + pad > width) {
        x = pad;
        y += shelf + pad;
        shelf = 0;
      }
      placed.push({ item, x, y });
      x += w + pad;
      shelf = Math.max(shelf, h);
    }
    const height = Math.max(4, y + shelf + pad);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is unavailable");
    for (const p of placed) ctx.drawImage(p.item.canvas, p.x, p.y);
    if (this.scene.textures.exists(this.atlasKey)) this.scene.textures.remove(this.atlasKey);
    const texture = this.scene.textures.addCanvas(this.atlasKey, canvas);
    if (!texture) throw new Error("Could not create the art atlas");
    for (const p of placed) {
      texture.add(p.item.name, 0, p.x, p.y, p.item.canvas.width, p.item.canvas.height);
      p.item.tex.key = this.atlasKey;
      p.item.tex.frame = p.item.name;
    }
    this.items = [];
  }
}

function shapeBounds(s: Shape, b: { minX: number; minY: number; maxX: number; maxY: number }) {
  const grow = (x: number, y: number, pad: number) => {
    b.minX = Math.min(b.minX, x - pad);
    b.minY = Math.min(b.minY, y - pad);
    b.maxX = Math.max(b.maxX, x + pad);
    b.maxY = Math.max(b.maxY, y + pad);
  };
  if (s.k === "custom") {
    grow(s.bounds[0], s.bounds[1], 0);
    grow(s.bounds[2], s.bounds[3], 0);
  } else if (s.k === "poly" || s.k === "line") {
    const pad = (s.k === "line" ? s.width : (s.width ?? 0)) / 2 + 0.5;
    s.pts.forEach((p) => grow(p.x, p.y, pad));
  } else if (s.k === "circle") {
    grow(s.x, s.y, s.r + (s.width ?? 0) / 2 + 0.5);
  } else {
    grow(s.x - s.rx, s.y - s.ry, (s.width ?? 0) / 2 + 0.5);
    grow(s.x + s.rx, s.y + s.ry, (s.width ?? 0) / 2 + 0.5);
  }
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: V2[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** Light falloff: slightly brighter at the top of a surface, deeper at its base. */
function shadedFill(ctx: CanvasRenderingContext2D, color: number, alpha: number, top: number, bottom: number) {
  if (bottom - top < 2) return css(color, alpha);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, css(shade(color, 1.07), alpha));
  g.addColorStop(1, css(shade(color, 0.86), alpha));
  return g;
}

/** Draws every shape of a sketch onto a canvas context in world-local pixels. */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  for (const s of shapes) {
    ctx.save();
    if (s.k === "custom") {
      s.draw(ctx);
      ctx.restore();
      continue;
    }
    if (s.k === "line") {
      ctx.strokeStyle = css(s.color, s.alpha);
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const alpha = s.alpha ?? 1;
    if (s.k === "poly") {
      tracePoly(ctx, s.pts);
      if (s.fill !== undefined) {
        const ys = s.pts.map((p) => p.y);
        ctx.fillStyle = s.shading === false ? css(s.fill, alpha) : shadedFill(ctx, s.fill, alpha, Math.min(...ys), Math.max(...ys));
        ctx.fill();
      }
    } else if (s.k === "circle") {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      if (s.fill !== undefined) {
        ctx.fillStyle = css(s.fill, alpha);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      if (s.fill !== undefined) {
        ctx.fillStyle = css(s.fill, alpha);
        ctx.fill();
      }
    }
    if (s.stroke !== undefined && (s.width ?? 1) > 0) {
      ctx.strokeStyle = css(s.stroke, s.strokeAlpha ?? 1);
      ctx.lineWidth = s.width ?? 1;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Bakes a sketch into a canvas once and hands it to the atlas builder. */
export function bake(atlas: AtlasBuilder, key: string, sketch: Sketch, scale = TEX_SCALE, pad = 2): BakedTexture {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  sketch.shapes.forEach((s) => shapeBounds(s, b));
  if (!Number.isFinite(b.minX)) {
    b.minX = b.minY = 0;
    b.maxX = b.maxY = 1;
  }
  const ox = -b.minX + pad;
  const oy = -b.minY + pad;
  const w = Math.max(1, Math.ceil((b.maxX - b.minX + pad * 2) * scale));
  const h = Math.max(1, Math.ceil((b.maxY - b.minY + pad * 2) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");
  ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
  drawShapes(ctx, sketch.shapes);
  return atlas.add(key, canvas, { key, originX: (ox * scale) / w, originY: (oy * scale) / h, scale });
}

/** Fills a polygon as a soft, blurred shadow (works in every browser). */
export function softShadow(ctx: CanvasRenderingContext2D, pts: V2[], blur: number, alpha: number, color = 0x1d2a22) {
  const far = 4000;
  ctx.save();
  ctx.shadowColor = css(color, alpha);
  // shadowBlur is in device pixels; scale it by the current transform.
  const t = ctx.getTransform();
  ctx.shadowBlur = blur * t.a;
  ctx.shadowOffsetX = far * t.a;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#000";
  tracePoly(
    ctx,
    pts.map((p) => ({ x: p.x - far, y: p.y })),
  );
  ctx.fill();
  ctx.restore();
}

/** Text laid flat on a left-facing wall (plane y = const), running along +x. */
export function wallText(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: V2,
  opts: { size: number; color: string; font: string; weight?: number; tracking?: number; align?: "left" | "center" },
) {
  ctx.save();
  // Along +x the wall rises 0.5 px per px, so shear y by x.
  ctx.transform(1, 0.5, 0, 1, at.x, at.y);
  ctx.font = `${opts.weight ?? 700} ${opts.size}px ${opts.font}`;
  ctx.fillStyle = opts.color;
  ctx.textBaseline = "alphabetic";
  const tracking = opts.tracking ?? 0;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0) - tracking;
  let x = opts.align === "center" ? -total / 2 : 0;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, 0);
    x += widths[i];
  });
  ctx.restore();
}

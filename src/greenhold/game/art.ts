/**
 * Procedural art: every texture is drawn once on a canvas at start-up (no
 * image files). Drawing happens in "tile space": a tile is the unit square
 * centred on (0, 0) and z is height in pixels, projected isometrically.
 */
import type Phaser from "phaser";

export const TW = 64;
export const TH = 32;
/** Height of one building block in world pixels. */
export const BH = 30;
/** Textures are drawn at this multiple for crisp zoomed-in art. */
export const RES = 2;

export interface TexInfo {
  key: string;
  /** Origin (0..1) that puts the tile's ground centre at the sprite position. */
  ox: number;
  oy: number;
}

type Ctx = CanvasRenderingContext2D;
export const P = (gx: number, gy: number, z = 0) => ({ x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) - z });

export function shade(c: number, f: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}
export const hex = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function poly(ctx: Ctx, pts: { x: number; y: number }[], fill: string, stroke?: string, lw = 0.7) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

const EDGE = "rgba(40,30,25,0.35)";

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** An isometric box: top, front-left (+y) and front-right (+x) faces. */
function prism(ctx: Ctx, b: Box, color: number, opt: { top?: number; edge?: string; flatTop?: boolean } = {}) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  // Front-left face (y = y1)
  poly(ctx, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], hex(shade(color, 0.9)), opt.edge ?? EDGE);
  // Front-right face (x = x1)
  poly(ctx, [P(x1, y1, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0)], hex(shade(color, 0.72)), opt.edge ?? EDGE);
  if (opt.flatTop !== false) poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], hex(opt.top ?? shade(color, 1.1)), opt.edge ?? EDGE);
}

/** A rectangle on the front-left face (y = y), between gx a..b and heights za..zb. */
function onFaceY(ctx: Ctx, y: number, a: number, b: number, za: number, zb: number, fill: string) {
  poly(ctx, [P(a, y, zb), P(b, y, zb), P(b, y, za), P(a, y, za)], fill);
}
/** A rectangle on the front-right face (x = x). */
function onFaceX(ctx: Ctx, x: number, a: number, b: number, za: number, zb: number, fill: string) {
  poly(ctx, [P(x, a, zb), P(x, b, zb), P(x, b, za), P(x, a, za)], fill);
}

function cylinder(ctx: Ctx, cx: number, cy: number, r: number, z0: number, z1: number, color: number, top?: number) {
  const ry = r / 2;
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, hex(shade(color, 1.05)));
  g.addColorStop(0.55, hex(shade(color, 0.85)));
  g.addColorStop(1, hex(shade(color, 0.62)));
  ctx.beginPath();
  ctx.ellipse(cx, cy - z0, r, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - r, cy - z1);
  ctx.ellipse(cx, cy - z1, r, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy - z1, r, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = hex(top ?? shade(color, 1.15));
  ctx.fill();
  ctx.stroke();
}

function blob(ctx: Ctx, x: number, y: number, r: number, color: number, light = 1.25) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, hex(shade(color, light)));
  g.addColorStop(1, hex(shade(color, 0.78)));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
}

function soft(ctx: Ctx, x: number, y: number, r: number, color: number, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hex(color, alpha));
  g.addColorStop(1, hex(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Seeded per-texture random, so the art is the same every time. */
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class Art {
  readonly info = new Map<string, TexInfo>();
  /** Where smoke comes out, in sprite-local world px (relative to the ground centre). */
  readonly smoke = new Map<string, { x: number; y: number }[]>();
  /** Visual height (in blocks) of each piece, for picking and icons. */
  readonly vh = new Map<string, number>();

  constructor(private scene: Phaser.Scene) {}

  /** Draws a texture whose ground centre sits `up` px below the top and `left` px from the left. */
  private bake(key: string, w: number, h: number, left: number, up: number, draw: (ctx: Ctx) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * RES);
    canvas.height = Math.ceil(h * RES);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(RES, RES);
    ctx.translate(left, up);
    ctx.lineJoin = "round";
    draw(ctx);
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, canvas);
    this.info.set(key, { key, ox: left / w, oy: up / h });
  }

  get(key: string) {
    return this.info.get(key)!;
  }

  /** A standard texture frame for a tile-sized object up to `tall` px high. */
  private obj(key: string, tall: number, draw: (ctx: Ctx) => void, wide = 1) {
    const w = TW * wide + 12;
    this.bake(key, w, tall + TH / 2 + 10, w / 2, tall + 4, draw);
  }

  build() {
    this.ground();
    this.blocks();
    this.roofs();
    this.machines();
    this.nature();
    this.fx();
  }

  // ---------------------------------------------------------------- ground
  private groundTile(key: string, draw: (ctx: Ctx) => void, base?: number) {
    this.bake(key, TW + 2, TH + 2, TW / 2 + 1, TH / 2 + 1, (ctx) => {
      const d = [P(-0.505, -0.505), P(0.505, -0.505), P(0.505, 0.505), P(-0.505, 0.505)];
      if (base !== undefined) poly(ctx, d, hex(base));
      ctx.save();
      ctx.beginPath();
      d.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip();
      draw(ctx);
      ctx.restore();
    });
  }

  private ground() {
    const grass = [0x8dc85b, 0x88c257, 0x93cc62];
    grass.forEach((c, k) =>
      this.groundTile(
        `g-grass-${k}`,
        (ctx) => {
          const r = rand(17 + k * 31);
          for (let i = 0; i < 14; i++) {
            const p = P(r() - 0.5, r() - 0.5);
            ctx.fillStyle = hex(shade(c, r() < 0.5 ? 0.88 : 1.1), 0.9);
            ctx.fillRect(p.x, p.y, 1.6, 1.2);
          }
        },
        c,
      ),
    );
    this.groundTile(
      "g-sand",
      (ctx) => {
        const r = rand(5);
        for (let i = 0; i < 12; i++) {
          const p = P(r() - 0.5, r() - 0.5);
          ctx.fillStyle = hex(0xcdb57a, 0.7);
          ctx.fillRect(p.x, p.y, 1.2, 1);
        }
      },
      0xead69c,
    );
    for (let f = 0; f < 3; f++)
      this.groundTile(
        `g-water-${f}`,
        (ctx) => {
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            const a = P(-0.35 + k * 0.28 + f * 0.06, -0.2 + ((k * 0.37 + f * 0.11) % 0.5));
            ctx.beginPath();
            ctx.moveTo(a.x - 5, a.y);
            ctx.quadraticCurveTo(a.x, a.y - 2, a.x + 5, a.y);
            ctx.stroke();
          }
        },
        0x4ea8d9,
      );
    this.groundTile(
      "g-path",
      (ctx) => {
        const r = rand(9);
        for (let i = 0; i < 9; i++) {
          const p = P(r() - 0.5, r() - 0.5);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 5, 2.6, 0, 0, Math.PI * 2);
          ctx.fillStyle = hex(shade(0xe2d2ad, 0.9 + r() * 0.15));
          ctx.fill();
          ctx.strokeStyle = "rgba(120,100,70,0.35)";
          ctx.stroke();
        }
      },
      0xcdb98f,
    );
    this.groundTile(
      "g-bike",
      (ctx) => {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1;
        for (const s of [-0.42, 0.42]) {
          ctx.beginPath();
          const a = P(-0.5, s);
          const b = P(0.5, s);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          const c = P(s, -0.5);
          const d = P(s, 0.5);
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
        // A small bike symbol.
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(-4, 1, 2.8, 1.5, 0, 0, Math.PI * 2);
        ctx.ellipse(4, 1, 2.8, 1.5, 0, 0, Math.PI * 2);
        ctx.moveTo(-4, 1);
        ctx.lineTo(-1, -2);
        ctx.lineTo(3, -2);
        ctx.lineTo(4, 1);
        ctx.stroke();
      },
      0x5aa36a,
    );
    this.groundTile(
      "g-garden",
      (ctx) => {
        for (let k = -2; k <= 2; k++) {
          const a = P(-0.42, k * 0.18);
          const b = P(0.42, k * 0.18);
          ctx.strokeStyle = hex(0x5e3e22);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          for (let j = 0; j < 5; j++) {
            const p = P(-0.36 + j * 0.18, k * 0.18);
            blob(ctx, p.x, p.y - 2, 2.2, j % 2 ? 0x5fae3e : 0x79c04b);
            if ((j + k) % 3 === 0) blob(ctx, p.x + 1, p.y - 2, 0.9, 0xe0583c, 1.1);
          }
        }
      },
      0x86603c,
    );
    this.groundTile(
      "g-pond",
      (ctx) => {
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 11, 0, 0, Math.PI * 2);
        ctx.fillStyle = hex(0x9a8f7d);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0.5, 21, 9.5, 0, 0, Math.PI * 2);
        const g = ctx.createLinearGradient(0, -9, 0, 10);
        g.addColorStop(0, hex(0x3d9bd0));
        g.addColorStop(1, hex(0x2c78b0));
        ctx.fillStyle = g;
        ctx.fill();
        blob(ctx, -7, 1, 3, 0x5aa846);
        blob(ctx, 6, -2, 2.4, 0x5aa846);
        blob(ctx, 6.5, -2.5, 0.9, 0xf4a6c0, 1.05);
      },
      0x8dc85b,
    );
    // Roads: lane markings follow the connected directions (bit 1 = +x, 2 = −x, 4 = +y, 8 = −y).
    for (let m = 0; m < 16; m++)
      this.groundTile(
        `g-road-${m}`,
        (ctx) => {
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          ctx.lineWidth = 3;
          const d = [P(-0.5, -0.5), P(0.5, -0.5), P(0.5, 0.5), P(-0.5, 0.5)];
          // Kerbs on the unconnected sides.
          const sides: [number, { x: number; y: number }, { x: number; y: number }][] = [
            [1, d[1], d[2]],
            [2, d[3], d[0]],
            [4, d[2], d[3]],
            [8, d[0], d[1]],
          ];
          ctx.strokeStyle = hex(0xb9b2a3);
          ctx.lineWidth = 2.4;
          for (const [bit, a, b] of sides) {
            if (m & bit) continue;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.strokeStyle = "rgba(255,236,170,0.9)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          const ends: [number, { x: number; y: number }][] = [
            [1, P(0.5, 0)],
            [2, P(-0.5, 0)],
            [4, P(0, 0.5)],
            [8, P(0, -0.5)],
          ];
          const conn = ends.filter(([bit]) => m & bit);
          for (const [, e] of conn.length ? conn : []) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        },
        0x5f646b,
      );
    // The island's earth edge.
    this.bake("edge-left", TW / 2 + 2, TH / 2 + 46, TW / 2 + 1, 1, (ctx) => {
      poly(ctx, [P(-0.5, 0.5), P(0.5, 0.5), P(0.5, 0.5, -44), P(-0.5, 0.5, -44)], hex(0x8f6640));
      ctx.fillStyle = "rgba(60,35,20,0.25)";
      for (let k = 1; k < 4; k++) poly(ctx, [P(-0.5, 0.5, -k * 11), P(0.5, 0.5, -k * 11), P(0.5, 0.5, -k * 11 - 2), P(-0.5, 0.5, -k * 11 - 2)], "rgba(60,35,20,0.25)");
      poly(ctx, [P(-0.5, 0.5), P(0.5, 0.5), P(0.5, 0.5, -4), P(-0.5, 0.5, -4)], hex(0x6e9e43));
    });
    this.bake("edge-right", TW / 2 + 2, TH / 2 + 46, 1, 1, (ctx) => {
      poly(ctx, [P(0.5, -0.5), P(0.5, 0.5), P(0.5, 0.5, -44), P(0.5, -0.5, -44)], hex(0x7a5534));
      for (let k = 1; k < 4; k++) poly(ctx, [P(0.5, -0.5, -k * 11), P(0.5, 0.5, -k * 11), P(0.5, 0.5, -k * 11 - 2), P(0.5, -0.5, -k * 11 - 2)], "rgba(50,30,15,0.25)");
      poly(ctx, [P(0.5, -0.5), P(0.5, 0.5), P(0.5, 0.5, -4), P(0.5, -0.5, -4)], hex(0x5f8b38));
    });
  }

  // ---------------------------------------------------------------- blocks
  private blocks() {
    const full: Box = { x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5, z0: 0, z1: BH };
    const windows = (ctx: Ctx, fill: string) => {
      for (const [a, b] of [
        [-0.32, -0.08],
        [0.08, 0.32],
      ]) {
        onFaceY(ctx, 0.5, a, b, 9, 22, fill);
        onFaceX(ctx, 0.5, a, b, 9, 22, fill);
      }
    };
    const frame = (ctx: Ctx) => {
      for (const [a, b] of [
        [-0.34, -0.06],
        [0.06, 0.34],
      ]) {
        onFaceY(ctx, 0.5, a, b, 8, 23, "rgba(250,245,235,0.95)");
        onFaceX(ctx, 0.5, a, b, 8, 23, "rgba(225,220,210,0.95)");
      }
      windows(ctx, hex(0x8cc4dc));
      // A little sky reflection.
      for (const [a] of [[-0.3], [0.1]]) onFaceY(ctx, 0.5, a, a + 0.06, 15, 21, "rgba(255,255,255,0.55)");
    };
    const mats: { id: string; color: number; top: number; detail: (ctx: Ctx) => void; win?: boolean }[] = [
      {
        id: "timber",
        color: 0xc98d52,
        top: 0xd9a46c,
        detail: (ctx) => {
          ctx.globalAlpha = 0.35;
          for (let z = 4; z < BH; z += 5) {
            onFaceY(ctx, 0.5, -0.5, 0.5, z, z + 0.7, hex(0x7a4a22));
            onFaceX(ctx, 0.5, -0.5, 0.5, z, z + 0.7, hex(0x5a3416));
          }
          ctx.globalAlpha = 1;
          onFaceY(ctx, 0.5, -0.5, -0.45, 0, BH, hex(0x8a5a2e));
          onFaceX(ctx, 0.5, 0.45, 0.5, 0, BH, hex(0x6a4320));
        },
      },
      {
        id: "concrete",
        color: 0xbfc2c4,
        top: 0xd2d4d4,
        detail: (ctx) => {
          ctx.globalAlpha = 0.25;
          onFaceY(ctx, 0.5, -0.5, 0.5, 15, 15.6, hex(0x555a5e));
          onFaceX(ctx, 0.5, -0.5, 0.5, 15, 15.6, hex(0x444a4e));
          onFaceY(ctx, 0.5, -0.02, 0.02, 0, BH, hex(0x555a5e));
          ctx.globalAlpha = 1;
        },
      },
      {
        id: "brick",
        color: 0xb35a40,
        top: 0xc58a6a,
        detail: (ctx) => {
          ctx.globalAlpha = 0.35;
          for (let z = 3, row = 0; z < BH; z += 3.4, row++) {
            onFaceY(ctx, 0.5, -0.5, 0.5, z, z + 0.5, hex(0xeadccc));
            onFaceX(ctx, 0.5, -0.5, 0.5, z, z + 0.5, hex(0xd8c8b8));
            for (let u = -0.5 + (row % 2) * 0.08; u < 0.5; u += 0.16) {
              onFaceY(ctx, 0.5, u, u + 0.012, z - 3, z, hex(0xeadccc));
              onFaceX(ctx, 0.5, u, u + 0.012, z - 3, z, hex(0xd8c8b8));
            }
          }
          ctx.globalAlpha = 1;
        },
      },
      {
        id: "glass",
        color: 0x86c3dc,
        top: 0xb9dbe6,
        win: false,
        detail: (ctx) => {
          for (const u of [-0.25, 0, 0.25]) {
            onFaceY(ctx, 0.5, u - 0.015, u + 0.015, 0, BH, "rgba(235,245,250,0.9)");
            onFaceX(ctx, 0.5, u - 0.015, u + 0.015, 0, BH, "rgba(210,225,232,0.9)");
          }
          onFaceY(ctx, 0.5, -0.5, 0.5, 14.6, 15.4, "rgba(235,245,250,0.9)");
          onFaceX(ctx, 0.5, -0.5, 0.5, 14.6, 15.4, "rgba(210,225,232,0.9)");
          ctx.globalAlpha = 0.35;
          poly(ctx, [P(-0.4, 0.5, 26), P(-0.2, 0.5, 26), P(0.1, 0.5, 4), P(-0.1, 0.5, 4)], "#fff");
          ctx.globalAlpha = 1;
        },
      },
      {
        id: "farmblock",
        color: 0xa9d8bf,
        top: 0xc9e8d6,
        win: false,
        detail: (ctx) => {
          for (const z of [6, 18]) {
            onFaceY(ctx, 0.5, -0.46, 0.46, z - 1, z, hex(0x8a8f92));
            onFaceX(ctx, 0.5, -0.46, 0.46, z - 1, z, hex(0x6f7477));
            for (let u = -0.4; u < 0.42; u += 0.12) {
              const a = P(u, 0.5, z + 2.5);
              blob(ctx, a.x, a.y, 2.3, 0x4fa14a);
              const b = P(0.5, u, z + 2.5);
              blob(ctx, b.x, b.y, 2.3, 0x3f8a3c);
            }
          }
          ctx.globalAlpha = 0.25;
          onFaceY(ctx, 0.5, -0.5, 0.5, 0, BH, "#e9fff2");
          ctx.globalAlpha = 1;
        },
      },
    ];
    for (const m of mats) {
      this.obj(`b-${m.id}`, BH + TH / 2, (ctx) => {
        prism(ctx, full, m.color, { top: m.top });
        m.detail(ctx);
        if (m.win !== false) frame(ctx);
      });
      // Night: lit windows (drawn additively over the block).
      this.obj(`b-${m.id}-glow`, BH + TH / 2, (ctx) => {
        ctx.shadowColor = "rgba(255,200,110,0.9)";
        ctx.shadowBlur = 6;
        if (m.win !== false) windows(ctx, hex(0xffd27a));
        else {
          ctx.globalAlpha = 0.55;
          onFaceY(ctx, 0.5, -0.46, 0.46, 2, BH - 2, hex(m.id === "farmblock" ? 0xd9a0ff : 0xffd27a));
          onFaceX(ctx, 0.5, -0.46, 0.46, 2, BH - 2, hex(m.id === "farmblock" ? 0xc080f0 : 0xf0c060));
        }
      });
      this.vh.set(m.id, 1);
    }
  }

  // ---------------------------------------------------------------- roofs
  private roofs() {
    this.obj("r-roof", 26 + TH / 2, (ctx) => {
      const o = 0.56;
      const apex = P(0, 0, 22);
      const c = [P(-o, -o, 0), P(o, -o, 0), P(o, o, 0), P(-o, o, 0)];
      poly(ctx, [c[0], c[1], apex], hex(shade(0xc4593b, 1.15)), EDGE);
      poly(ctx, [c[3], c[0], apex], hex(shade(0xc4593b, 1.0)), EDGE);
      poly(ctx, [c[3], c[2], apex], hex(shade(0xc4593b, 0.92)), EDGE);
      poly(ctx, [c[2], c[1], apex], hex(shade(0xc4593b, 0.74)), EDGE);
      ctx.strokeStyle = "rgba(90,30,15,0.25)";
      ctx.lineWidth = 0.7;
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const a = lerp(c[3], apex);
        const b = lerp(c[2], apex);
        const d = lerp(c[1], apex);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
    });
    this.vh.set("roof", 0.7);
    this.obj("r-greenroof", 18 + TH / 2, (ctx) => {
      prism(ctx, { x0: -0.52, x1: 0.52, y0: -0.52, y1: 0.52, z0: 0, z1: 4 }, 0x8c7a62, { top: 0x7cbf54 });
      const r = rand(3);
      for (let i = 0; i < 9; i++) {
        const p = P(r() * 0.8 - 0.4, r() * 0.8 - 0.4, 5);
        blob(ctx, p.x, p.y, 2.6 + r() * 2, r() < 0.5 ? 0x5fa845 : 0x4e9a3e);
      }
      for (let i = 0; i < 6; i++) {
        const p = P(r() * 0.8 - 0.4, r() * 0.8 - 0.4, 7);
        blob(ctx, p.x, p.y, 1, [0xf2d04a, 0xf28fb0, 0xffffff][i % 3], 1.05);
      }
    });
    this.vh.set("greenroof", 0.4);
    this.obj("r-solarroof", 18 + TH / 2, (ctx) => {
      prism(ctx, { x0: -0.52, x1: 0.52, y0: -0.52, y1: 0.52, z0: 0, z1: 3 }, 0x9aa0a6);
      // Panels tilted toward the viewer.
      const panel = [P(-0.45, -0.45, 12), P(0.45, -0.45, 12), P(0.45, 0.45, 4), P(-0.45, 0.45, 4)];
      poly(ctx, panel, hex(0x27467e), EDGE);
      ctx.strokeStyle = "rgba(170,200,240,0.6)";
      ctx.lineWidth = 0.6;
      for (let k = 1; k < 4; k++) {
        const t = -0.45 + k * 0.225;
        const a = P(t, -0.45, 12);
        const b = P(t, 0.45, 4);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const c = P(-0.45, t, 12 - (t + 0.45) * (8 / 0.9));
        const d = P(0.45, t, 12 - (t + 0.45) * (8 / 0.9));
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.3;
      poly(ctx, [P(-0.35, -0.45, 12), P(-0.15, -0.45, 12), P(-0.35, 0.45, 4), P(-0.5, 0.3, 5)], "#fff");
      ctx.globalAlpha = 1;
    });
    this.vh.set("solarroof", 0.4);
  }

  // ---------------------------------------------------------------- machines
  private machines() {
    this.obj("m-coal", 92, (ctx) => {
      prism(ctx, { x0: -0.42, x1: 0.42, y0: -0.3, y1: 0.42, z0: 0, z1: 26 }, 0x7d5d4e, { top: 0x6a5048 });
      for (const u of [-0.25, 0.05, 0.3]) onFaceY(ctx, 0.42, u - 0.06, u + 0.06, 8, 18, hex(0x3b2c26));
      onFaceX(ctx, 0.42, -0.2, 0.2, 0, 14, hex(0x2c201b));
      for (const [gx, gy] of [
        [-0.22, -0.22],
        [0.12, -0.32],
      ]) {
        const p = P(gx, gy, 26);
        cylinder(ctx, p.x, p.y + 26, 6, 26, 84, 0xb8b0a8, 0x333);
        for (const z of [66, 76]) {
          ctx.fillStyle = hex(0xc0392b);
          ctx.fillRect(p.x - 6, p.y + 26 - z - 3, 12, 4);
        }
      }
      // Coal heap.
      const h = P(-0.3, 0.42, 0);
      ctx.beginPath();
      ctx.ellipse(h.x - 6, h.y + 2, 12, 5, 0, Math.PI, 0);
      ctx.fillStyle = hex(0x2a2a2e);
      ctx.fill();
    });
    this.smoke.set("coal", [P(-0.22, -0.22, 86), P(0.12, -0.32, 86)]);
    this.vh.set("coal", 2.6);

    const panels = (ctx: Ctx, z: number) => {
      for (const gy of [-0.24, 0.18]) {
        const leg = (gx: number) => {
          const a = P(gx, gy + 0.16, z);
          ctx.fillStyle = hex(0x6f757c);
          ctx.fillRect(a.x - 0.8, a.y - 13, 1.6, 13);
        };
        leg(-0.4);
        leg(0.4);
        const quad = [P(-0.46, gy - 0.18, z + 7), P(0.46, gy - 0.18, z + 7), P(0.46, gy + 0.16, z + 19), P(-0.46, gy + 0.16, z + 19)];
        poly(ctx, quad.map((q) => ({ x: q.x, y: q.y + 1.5 })), hex(0xb9c0c6), EDGE);
        poly(ctx, quad, hex(0x274a86), EDGE);
        ctx.strokeStyle = "rgba(170,205,245,0.6)";
        ctx.lineWidth = 0.6;
        for (let k = 1; k < 6; k++) {
          const gx = -0.46 + k * 0.153;
          const a = P(gx, gy - 0.18, z + 7);
          const b = P(gx, gy + 0.16, z + 19);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        const m1 = P(-0.46, gy - 0.01, z + 13);
        const m2 = P(0.46, gy - 0.01, z + 13);
        ctx.beginPath();
        ctx.moveTo(m1.x, m1.y);
        ctx.lineTo(m2.x, m2.y);
        ctx.stroke();
        ctx.globalAlpha = 0.25;
        poly(ctx, [P(-0.3, gy - 0.18, z + 7), P(-0.15, gy - 0.18, z + 7), P(-0.3, gy + 0.16, z + 19), P(-0.45, gy + 0.16, z + 19)], "#fff");
        ctx.globalAlpha = 1;
      }
    };
    this.obj("m-solar", 34, (ctx) => panels(ctx, 0));
    this.vh.set("solar", 0.5);

    this.obj("m-wind", 124, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = hex(0xa9a59c);
      ctx.fill();
      const g = ctx.createLinearGradient(-3, 0, 3, 0);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#c9cfd4");
      ctx.beginPath();
      ctx.moveTo(-3.5, 0);
      ctx.lineTo(-1.6, -112);
      ctx.lineTo(1.6, -112);
      ctx.lineTo(3.5, 0);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(1, -114, 6, 3.4, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#eef1f3";
      ctx.fill();
      ctx.stroke();
    });
    this.bake("m-wind-rotor", 90, 90, 45, 45, (ctx) => {
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.quadraticCurveTo(-3.5, -20, -0.6, -42);
        ctx.lineTo(1.2, -42);
        ctx.quadraticCurveTo(2.5, -18, 2, 0);
        ctx.closePath();
        ctx.fillStyle = "#f7f9fa";
        ctx.fill();
        ctx.strokeStyle = "rgba(60,70,80,0.35)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.restore();
      }
      blob(ctx, 0, 0, 3.4, 0xdfe4e8);
    });
    this.vh.set("wind", 4);

    this.obj("m-battery", 34, (ctx) => {
      prism(ctx, { x0: -0.36, x1: 0.36, y0: -0.26, y1: 0.3, z0: 0, z1: 22 }, 0xe8ecee);
      onFaceY(ctx, 0.3, -0.36, 0.36, 3, 6, hex(0x3fae6a));
      onFaceX(ctx, 0.36, -0.26, 0.3, 3, 6, hex(0x2f8a52));
      const c = P(0.36, 0.02, 14);
      ctx.beginPath();
      ctx.moveTo(c.x + 1, c.y - 7);
      ctx.lineTo(c.x - 2, c.y + 1);
      ctx.lineTo(c.x + 1, c.y + 1);
      ctx.lineTo(c.x - 1, c.y + 7);
      ctx.lineTo(c.x + 3, c.y - 1);
      ctx.lineTo(c.x, c.y - 1);
      ctx.closePath();
      ctx.fillStyle = hex(0xf2c230);
      ctx.fill();
    });
    this.vh.set("battery", 0.8);

    this.obj("m-well", 60, (ctx) => {
      prism(ctx, { x0: -0.35, x1: 0.1, y0: 0, y1: 0.4, z0: 0, z1: 14 }, 0xd8cdb5, { top: 0x8a6f52 });
      const t = P(0.22, -0.2, 0);
      for (const dx of [-7, 7]) {
        ctx.strokeStyle = hex(0x6b6f73);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(t.x + dx, t.y);
        ctx.lineTo(t.x + dx * 0.6, t.y - 34);
        ctx.stroke();
      }
      cylinder(ctx, t.x, t.y, 10, 34, 50, 0x4b97c9, 0x6fb3dd);
      ctx.beginPath();
      ctx.moveTo(t.x - 10, t.y - 50 - 0.5);
      ctx.lineTo(t.x, t.y - 58);
      ctx.lineTo(t.x + 10, t.y - 50 - 0.5);
      ctx.fillStyle = hex(0x3a76a0);
      ctx.fill();
    });
    this.vh.set("well", 2);

    this.obj("m-raintank", 40, (ctx) => {
      cylinder(ctx, 2, 2, 12, 0, 26, 0x5f9ea0, 0x4d8a8c);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 0.8;
      for (const z of [8, 16]) {
        ctx.beginPath();
        ctx.ellipse(2, 2 - z, 12, 6, 0, 0, Math.PI);
        ctx.stroke();
      }
      ctx.fillStyle = hex(0x9fd3e6);
      ctx.fillRect(-1, -24.5, 6, 1.5);
    });
    this.vh.set("raintank", 0.9);

    this.obj("m-landfill", 26, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 3, 28, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(60,45,25,0.25)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-27, 2);
      ctx.quadraticCurveTo(-22, -17, 0, -19);
      ctx.quadraticCurveTo(22, -17, 27, 2);
      ctx.ellipse(0, 2, 27, 10, 0, 0, Math.PI);
      ctx.closePath();
      const lg = ctx.createLinearGradient(-20, -18, 20, 6);
      lg.addColorStop(0, hex(0xa48c66));
      lg.addColorStop(1, hex(0x6f5c40));
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      const r = rand(11);
      const cols = [0xd94f3d, 0x3f7fd6, 0xf2c230, 0xffffff, 0x4cae4c, 0x7d6e8e];
      for (let i = 0; i < 26; i++) {
        const x = (r() - 0.5) * 42;
        const y = -r() * 14 + 1;
        if (Math.abs(x) > 24 - Math.abs(y)) continue;
        ctx.fillStyle = hex(cols[i % cols.length]);
        ctx.fillRect(x, y, 2 + r() * 2.5, 1.4 + r() * 1.5);
      }
      ctx.strokeStyle = "rgba(120,110,90,0.8)";
      ctx.lineWidth = 0.6;
      for (let k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(k * 30, 2);
        ctx.lineTo(k * 30, -4);
        ctx.stroke();
      }
    });
    this.smoke.set("landfill", [P(0, 0, 18)]);
    this.vh.set("landfill", 0.6);

    this.obj("m-compost", 24, (ctx) => {
      for (const [gx, gy] of [
        [-0.22, 0.05],
        [0.08, 0.2],
        [0.12, -0.18],
      ]) {
        const b: Box = { x0: gx - 0.14, x1: gx + 0.14, y0: gy - 0.14, y1: gy + 0.14, z0: 0, z1: 11 };
        prism(ctx, b, 0x9a6b3f, { top: 0x4e3523 });
        const p = P(gx, gy, 12);
        blob(ctx, p.x - 2, p.y, 2, 0x6fb04a);
        blob(ctx, p.x + 2, p.y + 1, 1.6, 0x8fc25a);
      }
    });
    this.vh.set("compost", 0.5);

    this.obj("m-recycling", 46, (ctx) => {
      prism(ctx, { x0: -0.45, x1: 0.42, y0: -0.4, y1: 0.3, z0: 0, z1: 24 }, 0x3f9c8f, { top: 0x2e7a70 });
      // Saw-tooth roof.
      for (const gx of [-0.3, 0, 0.3]) poly(ctx, [P(gx - 0.14, -0.4, 24), P(gx + 0.14, -0.4, 24), P(gx + 0.14, 0.3, 24), P(gx - 0.14, 0.3, 32)], hex(0xd8dedf), EDGE);
      onFaceX(ctx, 0.42, -0.25, 0.15, 0, 15, hex(0x2a5a55));
      // Recycling arrows.
      const c = P(-0.05, 0.3, 13);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4.5, 0.3, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x + 4, c.y - 3.5);
      ctx.lineTo(c.x + 5.8, c.y - 1);
      ctx.lineTo(c.x + 2.8, c.y - 0.6);
      ctx.fillStyle = "#fff";
      ctx.fill();
      [0x3f7fd6, 0xf2c230, 0x4cae4c].forEach((col, k) => {
        const b = -0.42 + k * 0.17;
        prism(ctx, { x0: b, x1: b + 0.13, y0: 0.34, y1: 0.47, z0: 0, z1: 8 }, col);
      });
    });
    this.vh.set("recycling", 1.1);

    this.obj("m-bus", 40, (ctx) => {
      prism(ctx, { x0: -0.3, x1: 0.3, y0: -0.12, y1: -0.08, z0: 0, z1: 20 }, 0xa9cfe0);
      for (const gx of [-0.3, 0.28]) prism(ctx, { x0: gx, x1: gx + 0.02, y0: -0.12, y1: 0.12, z0: 0, z1: 20 }, 0x666);
      prism(ctx, { x0: -0.34, x1: 0.34, y0: -0.16, y1: 0.16, z0: 20, z1: 22 }, 0xe0a33a);
      const s = P(0.38, 0.28, 0);
      ctx.fillStyle = "#555";
      ctx.fillRect(s.x - 0.6, s.y - 26, 1.2, 26);
      ctx.beginPath();
      ctx.arc(s.x, s.y - 29, 5, 0, Math.PI * 2);
      ctx.fillStyle = hex(0x2f7fbf);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 6px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("B", s.x, s.y - 27);
    });
    this.vh.set("bus", 0.9);

    this.obj("m-tram", 40, (ctx) => {
      prism(ctx, { x0: -0.5, x1: 0.5, y0: -0.3, y1: 0.05, z0: 0, z1: 4 }, 0xc7c2b6);
      for (const gy of [0.18, 0.36]) {
        ctx.strokeStyle = hex(0x77736b);
        ctx.lineWidth = 1.2;
        const a = P(-0.5, gy);
        const b = P(0.5, gy);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const gx of [-0.35, 0.35]) prism(ctx, { x0: gx, x1: gx + 0.03, y0: -0.2, y1: -0.17, z0: 4, z1: 24 }, 0x555);
      prism(ctx, { x0: -0.45, x1: 0.45, y0: -0.3, y1: 0.02, z0: 24, z1: 26 }, 0x3fae6a);
      // The overhead wire.
      ctx.strokeStyle = "rgba(40,40,40,0.6)";
      ctx.lineWidth = 0.5;
      const w1 = P(-0.5, 0.27, 30);
      const w2 = P(0.5, 0.27, 30);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.stroke();
    });
    this.vh.set("tram", 0.9);

    this.obj("m-townhall", 96, (ctx) => {
      prism(ctx, { x0: -0.48, x1: 0.48, y0: -0.48, y1: 0.48, z0: 0, z1: 6 }, 0xcfc6b2);
      prism(ctx, { x0: -0.42, x1: 0.42, y0: -0.42, y1: 0.42, z0: 6, z1: 40 }, 0xf1e6cf, { top: 0xe0d4ba });
      for (const u of [-0.32, -0.16, 0, 0.16, 0.32]) {
        onFaceY(ctx, 0.42, u - 0.025, u + 0.025, 6, 36, hex(0xffffff, 0.9));
        onFaceX(ctx, 0.42, u - 0.025, u + 0.025, 6, 36, hex(0xe8e0d0, 0.9));
      }
      for (const u of [-0.24, -0.08, 0.08, 0.24]) {
        onFaceY(ctx, 0.42, u - 0.04, u + 0.04, 14, 30, hex(0x6f8fa8));
        onFaceX(ctx, 0.42, u - 0.04, u + 0.04, 14, 30, hex(0x5a7a92));
      }
      onFaceY(ctx, 0.42, -0.08, 0.08, 6, 20, hex(0x6a4a2e));
      const o = 0.48;
      const apex = P(0, 0, 58);
      const c = [P(-o, -o, 40), P(o, -o, 40), P(o, o, 40), P(-o, o, 40)];
      poly(ctx, [c[3], c[0], apex], hex(0x5d7c96), EDGE);
      poly(ctx, [c[3], c[2], apex], hex(0x50708a), EDGE);
      poly(ctx, [c[2], c[1], apex], hex(0x41607a), EDGE);
      const d = P(0, 0, 58);
      cylinder(ctx, d.x, d.y + 58, 7, 54, 66, 0xf1e6cf);
      ctx.beginPath();
      ctx.arc(d.x, d.y - 8, 7, Math.PI, 0);
      ctx.fillStyle = hex(0x3fae6a);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(d.x + 1, d.y - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.fillRect(d.x - 0.4, d.y - 32, 0.8, 18);
    });
    this.bake("m-flag", 18, 12, 0, 1, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(8, 2, 15, 0);
      ctx.lineTo(15, 8);
      ctx.quadraticCurveTo(8, 10, 0, 8);
      ctx.closePath();
      ctx.fillStyle = hex(0x3fae6a);
      ctx.fill();
      blob(ctx, 7, 4, 2, 0xf7f3e0, 1);
    });
    this.vh.set("townhall", 2.6);

    this.obj("m-hut", 40, (ctx) => {
      prism(ctx, { x0: -0.3, x1: 0.3, y0: -0.3, y1: 0.3, z0: 0, z1: 16 }, 0xb98450);
      onFaceY(ctx, 0.3, -0.08, 0.08, 0, 11, hex(0x5a3a1e));
      const apex = P(0, 0, 30);
      const c = [P(-0.36, -0.36, 16), P(0.36, -0.36, 16), P(0.36, 0.36, 16), P(-0.36, 0.36, 16)];
      poly(ctx, [c[3], c[0], apex], hex(0xd99a3a), EDGE);
      poly(ctx, [c[3], c[2], apex], hex(0xc98a2a), EDGE);
      poly(ctx, [c[2], c[1], apex], hex(0xa8701c), EDGE);
      const h = P(0.42, 0.42, 0);
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(h.x - 0.6, h.y - 16, 1.2, 16);
      ctx.fillStyle = "#9aa3ab";
      ctx.fillRect(h.x - 4, h.y - 19, 8, 3.5);
    });
    this.vh.set("hut", 1);

    this.obj("scaffold", 46, (ctx) => {
      ctx.strokeStyle = hex(0xa7773e);
      ctx.lineWidth = 1.5;
      const corners = [P(-0.48, 0.48), P(0.48, 0.48), P(0.48, -0.48), P(-0.48, -0.48)];
      for (const c of corners) {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x, c.y - 40);
        ctx.stroke();
      }
      for (const z of [12, 26, 40]) {
        ctx.beginPath();
        corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y - z) : ctx.moveTo(c.x, c.y - z)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y - 26);
      ctx.moveTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y - 26);
      ctx.stroke();
      // Safety netting.
      ctx.globalAlpha = 0.25;
      poly(ctx, [P(-0.48, 0.48, 40), P(0.48, 0.48, 40), P(0.48, 0.48, 0), P(-0.48, 0.48, 0)], hex(0x3fae6a));
      ctx.globalAlpha = 1;
    });
  }

  // ---------------------------------------------------------------- nature
  private nature() {
    this.obj("n-oak", 56, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(30,60,20,0.25)";
      ctx.fill();
      ctx.fillStyle = hex(0x7a5232);
      ctx.fillRect(-2, -18, 4, 19);
      for (const [x, y, r] of [
        [-8, -26, 10],
        [8, -27, 10],
        [0, -36, 12],
        [0, -24, 11],
      ])
        blob(ctx, x, y, r, 0x5c9e45);
      blob(ctx, -4, -38, 4, 0x8cc95e, 1.15);
    });
    this.vh.set("oak", 1.6);
    this.obj("n-pine", 62, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 1, 11, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(30,60,20,0.25)";
      ctx.fill();
      ctx.fillStyle = hex(0x6a4428);
      ctx.fillRect(-1.6, -10, 3.2, 11);
      for (const [y, w] of [
        [-8, 13],
        [-22, 11],
        [-35, 8],
      ]) {
        ctx.beginPath();
        ctx.moveTo(-w, y);
        ctx.lineTo(0, y - 22);
        ctx.lineTo(w, y);
        ctx.closePath();
        const g = ctx.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, hex(0x3f9a5f));
        g.addColorStop(1, hex(0x23663c));
        ctx.fillStyle = g;
        ctx.fill();
      }
    });
    this.vh.set("pine", 1.8);
    this.obj("n-flowers", 14, (ctx) => {
      const r = rand(21);
      for (let i = 0; i < 16; i++) {
        const p = P(r() * 0.8 - 0.4, r() * 0.8 - 0.4);
        ctx.strokeStyle = hex(0x4f8f3a);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - 5);
        ctx.stroke();
        blob(ctx, p.x, p.y - 6, 1.6, [0xf2d04a, 0xf28fb0, 0xffffff, 0xb08ff2, 0xff7a5a][i % 5], 1.05);
      }
    });
    this.vh.set("flowers", 0.3);
    this.obj("n-rock", 22, (ctx) => {
      poly(ctx, [{ x: -16, y: 2 }, { x: -12, y: -10 }, { x: -2, y: -16 }, { x: 10, y: -12 }, { x: 16, y: 0 }, { x: 4, y: 6 }], hex(0x9ea3a6), EDGE);
      poly(ctx, [{ x: -2, y: -16 }, { x: 10, y: -12 }, { x: 16, y: 0 }, { x: 4, y: -4 }], hex(0x7f8487));
      poly(ctx, [{ x: -12, y: -10 }, { x: -2, y: -16 }, { x: 4, y: -4 }, { x: -6, y: -2 }], hex(0xb9bec1));
    });
    this.vh.set("rock", 0.6);
  }

  // ---------------------------------------------------------------- effects
  private fx() {
    this.bake("fx-puff", 32, 32, 16, 16, (ctx) => soft(ctx, 0, 0, 16, 0xffffff, 0.9));
    this.bake("fx-smog", 128, 128, 64, 64, (ctx) => soft(ctx, 0, 0, 64, 0xffffff, 0.7));
    this.bake("fx-glow", 64, 64, 32, 32, (ctx) => soft(ctx, 0, 0, 32, 0xffffff, 1));
    this.bake("fx-spark", 16, 16, 8, 8, (ctx) => {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const r = k % 2 ? 2.2 : 7.5;
        const a = (k * Math.PI) / 4;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    });
    this.bake("fx-ring", TW + 8, TH + 8, TW / 2 + 4, TH / 2 + 4, (ctx) => {
      const d = [P(-0.5, -0.5), P(0.5, -0.5), P(0.5, 0.5), P(-0.5, 0.5)];
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      d.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();
    });
    // Vehicles: one for each direction of travel (along grid x, along grid y).
    const car = (along: "x" | "y", body: number, key: string, long = 0.22, tall = 7) => {
      this.obj(key, 18, (ctx) => {
        const lx = along === "x" ? long : 0.11;
        const ly = along === "x" ? 0.11 : long;
        ctx.beginPath();
        ctx.ellipse(0, 1, 10, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fill();
        prism(ctx, { x0: -lx, x1: lx, y0: -ly, y1: ly, z0: 1.5, z1: tall - 2.5 }, body);
        const cx = along === "x" ? lx * 0.6 : 0.09;
        const cy = along === "x" ? 0.09 : ly * 0.6;
        prism(ctx, { x0: -cx, x1: cx, y0: -cy, y1: cy, z0: tall - 2.5, z1: tall + 1.5 }, 0xcfe6f0, { top: shade(body, 1.1) });
      });
    };
    car("x", 0xffffff, "v-car-x");
    car("y", 0xffffff, "v-car-y");
    car("x", 0x3a8fd0, "v-bus-x", 0.36, 10);
    car("y", 0x3a8fd0, "v-bus-y", 0.36, 10);
    this.obj("v-person", 14, (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-1.3, -7, 2.6, 6);
      ctx.beginPath();
      ctx.arc(0, -9, 1.9, 0, Math.PI * 2);
      ctx.fillStyle = "#f2c9a0";
      ctx.fill();
    });
    this.obj("v-bike", 14, (ctx) => {
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(-3, -1.5, 1.6, 0, Math.PI * 2);
      ctx.arc(3, -1.5, 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-1, -9, 2.4, 5);
      ctx.beginPath();
      ctx.arc(0.2, -10.5, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = "#f2c9a0";
      ctx.fill();
    });
    this.bake("fx-butterfly", 10, 8, 5, 4, (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-2.2, 0, 2.2, 3, -0.4, 0, Math.PI * 2);
      ctx.ellipse(2.2, 0, 2.2, 3, 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    this.bake("fx-bird", 14, 6, 7, 3, (ctx) => {
      ctx.strokeStyle = "#2f3a40";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.quadraticCurveTo(-3, -3, 0, 1);
      ctx.quadraticCurveTo(3, -3, 6, -1);
      ctx.stroke();
    });
    this.bake("fx-rain", 2, 14, 1, 0, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 14);
      g.addColorStop(0, "rgba(220,235,255,0)");
      g.addColorStop(1, "rgba(220,235,255,0.8)");
      ctx.fillStyle = g;
      ctx.fillRect(-0.5, 0, 1, 14);
    });
    // Collection bubbles and problem badges.
    const bubble = (key: string, ring: number, icon: (ctx: Ctx) => void) =>
      this.bake(key, 34, 40, 17, 38, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(-5, -10);
        ctx.lineTo(0, -2);
        ctx.lineTo(5, -10);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -22, 14, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = hex(ring);
        ctx.stroke();
        ctx.save();
        ctx.translate(0, -22);
        icon(ctx);
        ctx.restore();
      });
    const coin = (ctx: Ctx, x = 0, y = 0, r = 8) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r);
      g.addColorStop(0, "#fff3b0");
      g.addColorStop(1, "#e0a020");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "#a86f10";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#a86f10";
      ctx.font = `bold ${r * 1.1}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("¢", x, y + 0.5);
    };
    const crate = (ctx: Ctx) => {
      ctx.fillStyle = "#2fb3a3";
      ctx.fillRect(-7, -6, 14, 12);
      ctx.strokeStyle = "#1a7a6e";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-7, -6, 14, 12);
      ctx.beginPath();
      ctx.moveTo(-7, -6);
      ctx.lineTo(7, 6);
      ctx.moveTo(7, -6);
      ctx.lineTo(-7, 6);
      ctx.stroke();
    };
    bubble("ui-coins", 0xe0a020, (ctx) => coin(ctx));
    bubble("ui-mats", 0x2fb3a3, crate);
    bubble("ui-noroof", 0xe0533a, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-8, 1);
      ctx.lineTo(0, -7);
      ctx.lineTo(8, 1);
      ctx.strokeStyle = "#e0533a";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = "#e0533a";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("?", 0, 8);
    });
    bubble("ui-noroad", 0xe0533a, (ctx) => {
      ctx.fillStyle = "#5f646b";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#e0533a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(8, 8);
      ctx.stroke();
    });
    this.bake("ui-coin", 20, 20, 10, 10, (ctx) => coin(ctx, 0, 0, 9));
  }
}

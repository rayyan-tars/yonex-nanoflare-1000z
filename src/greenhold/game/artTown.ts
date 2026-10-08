/**
 * Town art: painted and shop-front blocks, extra roofs, town buildings
 * (café, shop, school, market, clinic, library), parks and street props.
 * Pieces with lit windows also get a "-glow" texture for the night.
 */
import { BH, EDGE, P, TH, blob, cylinder, hex, onFaceX, onFaceY, poly, prism, rand, shade, soft, type Art, type Ctx } from "./art";

type Pt = { x: number; y: number };

/** Windows on both visible faces of a box (x1 / y1 faces), in rows. */
function windowRows(ctx: Ctx, x1: number, y1: number, spanX: [number, number], spanY: [number, number], rows: [number, number][], cols: number, fill: string, frame?: string) {
  for (const [z0, z1] of rows)
    for (let k = 0; k < cols; k++) {
      const w = 0.6 / cols;
      const ay = spanY[0] + ((spanY[1] - spanY[0]) * (k + 0.5)) / cols;
      const ax = spanX[0] + ((spanX[1] - spanX[0]) * (k + 0.5)) / cols;
      if (frame) {
        onFaceY(ctx, y1, ay - w / 2 - 0.02, ay + w / 2 + 0.02, z0 - 1, z1 + 1, frame);
        onFaceX(ctx, x1, ax - w / 2 - 0.02, ax + w / 2 + 0.02, z0 - 1, z1 + 1, frame);
      }
      onFaceY(ctx, y1, ay - w / 2, ay + w / 2, z0, z1, fill);
      onFaceX(ctx, x1, ax - w / 2, ax + w / 2, z0, z1, fill);
    }
}

/** A striped awning sticking out of the front-left face (y = y1) between gx a..b. */
function awningY(ctx: Ctx, y1: number, a: number, b: number, z: number, out: number, colors: [number, number], stripes = 6) {
  for (let k = 0; k < stripes; k++) {
    const u0 = a + ((b - a) * k) / stripes;
    const u1 = a + ((b - a) * (k + 1)) / stripes;
    poly(ctx, [P(u0, y1, z), P(u1, y1, z), P(u1, y1 + out, z - 5), P(u0, y1 + out, z - 5)], hex(colors[k % 2]), EDGE, 0.4);
  }
}
/** The same on the front-right face (x = x1). */
function awningX(ctx: Ctx, x1: number, a: number, b: number, z: number, out: number, colors: [number, number], stripes = 6) {
  for (let k = 0; k < stripes; k++) {
    const u0 = a + ((b - a) * k) / stripes;
    const u1 = a + ((b - a) * (k + 1)) / stripes;
    poly(ctx, [P(x1, u0, z), P(x1, u1, z), P(x1 + out, u1, z - 5), P(x1 + out, u0, z - 5)], hex(shade(colors[k % 2], 0.85)), EDGE, 0.4);
  }
}

/** A hip roof over a footprint, from height z, rising h. */
function hipRoof(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, z: number, h: number, color: number) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const ridge = Math.abs(x1 - x0) > Math.abs(y1 - y0) ? [P(x0 + (y1 - y0) / 2, cy, z + h), P(x1 - (y1 - y0) / 2, cy, z + h)] : [P(cx, y0 + (x1 - x0) / 2, z + h), P(cx, y1 - (x1 - x0) / 2, z + h)];
  const c = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
  const [r0, r1] = ridge;
  const alongX = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  if (alongX) {
    poly(ctx, [c[0], c[1], r1, r0], hex(shade(color, 1.12)), EDGE);
    poly(ctx, [c[3], c[0], r0], hex(color), EDGE);
    poly(ctx, [c[3], c[2], r1, r0], hex(shade(color, 0.9)), EDGE);
    poly(ctx, [c[2], c[1], r1], hex(shade(color, 0.74)), EDGE);
  } else {
    poly(ctx, [c[0], c[1], r0], hex(shade(color, 1.12)), EDGE);
    poly(ctx, [c[3], c[0], r0, r1], hex(color), EDGE);
    poly(ctx, [c[3], c[2], r1], hex(shade(color, 0.9)), EDGE);
    poly(ctx, [c[2], c[1], r0, r1], hex(shade(color, 0.74)), EDGE);
  }
}

function umbrella(ctx: Ctx, at: Pt, color: number, h = 14) {
  ctx.strokeStyle = "#6b6b6b";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x, at.y - h);
  ctx.stroke();
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    ctx.moveTo(at.x, at.y - h - 2);
    ctx.ellipse(at.x, at.y - h, 7, 3.2, 0, (k * Math.PI) / 3, ((k + 1) * Math.PI) / 3);
    ctx.closePath();
    ctx.fillStyle = hex(k % 2 ? color : 0xffffff);
    ctx.fill();
  }
}

function table(ctx: Ctx, at: Pt) {
  ctx.fillStyle = "#6b5a4a";
  ctx.fillRect(at.x - 0.4, at.y - 4, 0.8, 4);
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - 4.2, 3.2, 1.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f4efe6";
  ctx.fill();
}

/** A tiny seated person (body and head). */
function sitter(ctx: Ctx, at: Pt, top: string, skin = "#f2c9a0") {
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - 3.5, 1.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(at.x, at.y - 6.7, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();
}

/** A screen-aligned sign board with text. */
function sign(ctx: Ctx, at: Pt, text: string, bg: string, fg = "#fff", size = 5) {
  ctx.font = `800 ${size}px Nunito, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width + 4;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(at.x - w / 2, at.y - size - 1, w, size + 3, 1.6);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, at.x, at.y);
}

function crate(ctx: Ctx, gx: number, gy: number, fruit: number) {
  prism(ctx, { x0: gx - 0.06, x1: gx + 0.06, y0: gy - 0.06, y1: gy + 0.06, z0: 0, z1: 3.5 }, 0xb8864e);
  const c = P(gx, gy, 4.2);
  for (const [dx, dy] of [
    [-1.4, 0],
    [1.4, 0],
    [0, -0.6],
    [0, 0.8],
  ])
    blob(ctx, c.x + dx, c.y + dy, 1.2, fruit, 1.2);
}

const WARM = "#ffd27a";

export function drawTown(art: Art) {
  const glowOf = (key: string, tall: number, draw: (ctx: Ctx) => void) =>
    art.obj(`${key}-glow`, tall, (ctx) => {
      ctx.shadowColor = "rgba(255,200,110,0.9)";
      ctx.shadowBlur = 6;
      draw(ctx);
    });

  // ------------------------------------------------------------------ painted blocks
  const plaster: [string, number, number][] = [
    ["sunny", 0xf2d27a, 0x3f8a5a],
    ["rose", 0xefb3a6, 0x3f6f9a],
    ["sky", 0xa9cbe6, 0xb2563f],
  ];
  const win = (ctx: Ctx, fill: string) => {
    for (const [a, b] of [
      [-0.32, -0.1],
      [0.1, 0.32],
    ]) {
      onFaceY(ctx, 0.5, a, b, 10, 22, fill);
      onFaceX(ctx, 0.5, a, b, 10, 22, fill);
    }
  };
  for (const [id, color, shutter] of plaster) {
    art.obj(`b-${id}`, BH + TH / 2, (ctx) => {
      prism(ctx, { x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5, z0: 0, z1: BH }, color, { top: shade(color, 1.08) });
      onFaceY(ctx, 0.5, -0.5, 0.5, BH - 2.5, BH, "rgba(255,255,255,0.8)");
      onFaceX(ctx, 0.5, -0.5, 0.5, BH - 2.5, BH, "rgba(240,240,240,0.8)");
      for (const [a, b] of [
        [-0.32, -0.1],
        [0.1, 0.32],
      ]) {
        onFaceY(ctx, 0.5, a - 0.07, a - 0.01, 10, 22, hex(shutter));
        onFaceY(ctx, 0.5, b + 0.01, b + 0.07, 10, 22, hex(shutter));
        onFaceX(ctx, 0.5, a - 0.07, a - 0.01, 10, 22, hex(shade(shutter, 0.8)));
        onFaceX(ctx, 0.5, b + 0.01, b + 0.07, 10, 22, hex(shade(shutter, 0.8)));
        // Window boxes with flowers.
        onFaceY(ctx, 0.5, a, b, 7.5, 9.5, hex(0x7a5232));
        const f = P((a + b) / 2, 0.5, 10.5);
        blob(ctx, f.x - 2, f.y, 1.2, 0xe0533a, 1.1);
        blob(ctx, f.x + 1, f.y, 1.2, 0xffffff, 1);
        blob(ctx, f.x + 3, f.y + 0.6, 1, 0x5fae3e, 1.1);
      }
      win(ctx, hex(0x8cc4dc));
    });
    glowOf(`b-${id}`, BH + TH / 2, (ctx) => win(ctx, WARM));
    art.vh.set(id, 1);
  }

  // A shop on the ground floor: display windows and an awning.
  art.obj("b-shopfront", BH + TH / 2 + 4, (ctx) => {
    prism(ctx, { x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5, z0: 0, z1: BH }, 0xe9e2d2, { top: 0xd8d0be });
    onFaceY(ctx, 0.5, -0.46, 0.2, 3, 19, hex(0x7fb6cf));
    onFaceY(ctx, 0.5, 0.26, 0.42, 0, 18, hex(0x5a4030));
    onFaceX(ctx, 0.5, -0.42, 0.42, 3, 19, hex(0x6fa3bb));
    // Goods on display.
    const r = rand(4);
    for (let k = 0; k < 7; k++) {
      const p = P(-0.4 + k * 0.085, 0.5, 6 + (k % 2) * 3);
      blob(ctx, p.x, p.y, 1.4, [0xe0533a, 0xf2c230, 0x4cae4c, 0xffffff][Math.floor(r() * 4)], 1.1);
    }
    onFaceY(ctx, 0.5, -0.5, 0.5, 23, 28, hex(0x2c4a3a));
    onFaceX(ctx, 0.5, -0.5, 0.5, 23, 28, hex(0x223a2e));
    awningY(ctx, 0.5, -0.5, 0.5, 22, 0.14, [0x2f9e5a, 0xffffff]);
    awningX(ctx, 0.5, -0.5, 0.5, 22, 0.14, [0x2f9e5a, 0xffffff]);
  });
  glowOf("b-shopfront", BH + TH / 2 + 4, (ctx) => {
    ctx.globalAlpha = 0.75;
    onFaceY(ctx, 0.5, -0.46, 0.2, 3, 19, WARM);
    onFaceX(ctx, 0.5, -0.42, 0.42, 3, 19, WARM);
  });
  art.vh.set("shopfront", 1);

  // ------------------------------------------------------------------ roofs
  art.obj("r-slate", 26 + TH / 2, (ctx) => hipRoof(ctx, -0.56, 0.56, -0.56, 0.56, 0, 22, 0x5f7284));
  art.vh.set("slate", 0.7);
  art.obj("r-terrace", 30 + TH / 2, (ctx) => {
    prism(ctx, { x0: -0.52, x1: 0.52, y0: -0.52, y1: 0.52, z0: 0, z1: 3 }, 0xb9a88f, { top: 0xd9c9ad });
    // Decking boards.
    ctx.strokeStyle = "rgba(120,90,60,0.25)";
    ctx.lineWidth = 0.6;
    for (let k = -4; k <= 4; k++) {
      const a = P(k * 0.11, -0.5, 3);
      const b = P(k * 0.11, 0.5, 3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    umbrella(ctx, P(-0.1, -0.1, 3), 0xe0533a, 13);
    table(ctx, P(-0.1, -0.1, 3));
    sitter(ctx, P(0.12, -0.12, 3), "#3f7fd6");
    blob(ctx, P(0.35, -0.35, 6).x, P(0.35, -0.35, 6).y, 4, 0x5fa845);
    blob(ctx, P(-0.35, 0.35, 6).x, P(-0.35, 0.35, 6).y, 3.5, 0x4e9a3e);
    // Railings on the two front edges.
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 0.8;
    const rail = (pts: Pt[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    };
    rail([P(-0.5, 0.5, 9), P(0.5, 0.5, 9), P(0.5, -0.5, 9)]);
    for (let k = 0; k <= 6; k++) {
      rail([P(-0.5 + k / 6, 0.5, 3), P(-0.5 + k / 6, 0.5, 9)]);
      rail([P(0.5, 0.5 - k / 6, 3), P(0.5, 0.5 - k / 6, 9)]);
    }
  });
  art.vh.set("terrace", 0.6);

  // ------------------------------------------------------------------ town buildings
  art.obj("m-cafe", 50, (ctx) => {
    prism(ctx, { x0: -0.46, x1: 0.2, y0: -0.46, y1: 0.08, z0: 0, z1: 22 }, 0xf1dfbf, { top: 0x8a6a52 });
    onFaceY(ctx, 0.08, -0.4, 0.05, 4, 15, hex(0x8cc4dc));
    onFaceY(ctx, 0.08, 0.08, 0.17, 0, 14, hex(0x6b4a2e));
    onFaceX(ctx, 0.2, -0.4, 0.0, 5, 15, hex(0x7cb2c8));
    awningY(ctx, 0.08, -0.46, 0.2, 18, 0.12, [0xb2563f, 0xf4ede0], 7);
    awningX(ctx, 0.2, -0.46, 0.08, 18, 0.12, [0xb2563f, 0xf4ede0], 5);
    sign(ctx, P(-0.13, -0.19, 30), "CAFÉ", "#5a3a22");
    // Terrace tables with umbrellas and customers.
    for (const [gx, gy, c, top] of [
      [-0.22, 0.3, 0x2f9e5a, "#e05a47"],
      [0.32, -0.12, 0xf2b630, "#3f7fd6"],
    ] as [number, number, number, string][]) {
      const at = P(gx, gy);
      sitter(ctx, { x: at.x - 4, y: at.y + 1 }, top);
      table(ctx, at);
      sitter(ctx, { x: at.x + 4, y: at.y + 2 }, "#f2c230", "#c68b5e");
      umbrella(ctx, at, c);
    }
  });
  glowOf("m-cafe", 50, (ctx) => {
    onFaceY(ctx, 0.08, -0.4, 0.05, 4, 15, WARM);
    onFaceX(ctx, 0.2, -0.4, 0.0, 5, 15, WARM);
    // String lights.
    ctx.fillStyle = "#fff2b0";
    for (let k = 0; k < 9; k++) {
      const p = P(-0.46 + k * 0.08, 0.2, 13 + Math.sin(k) * 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  art.vh.set("cafe", 1);

  art.obj("m-shop", 46, (ctx) => {
    prism(ctx, { x0: -0.42, x1: 0.42, y0: -0.42, y1: 0.3, z0: 0, z1: 24 }, 0xdfe9df, { top: 0x9aa59a });
    onFaceY(ctx, 0.3, -0.38, 0.12, 3, 16, hex(0x7fb6cf));
    onFaceY(ctx, 0.3, 0.18, 0.36, 0, 15, hex(0x3e6e52));
    onFaceX(ctx, 0.42, -0.36, 0.24, 3, 16, hex(0x6fa3bb));
    awningY(ctx, 0.3, -0.42, 0.42, 19, 0.12, [0x2f9e5a, 0xffffff], 8);
    awningX(ctx, 0.42, -0.42, 0.3, 19, 0.12, [0x2f9e5a, 0xffffff], 7);
    sign(ctx, P(0, -0.06, 30), "SHOP", "#2f7a4f");
    crate(ctx, -0.3, 0.42, 0xe0533a);
    crate(ctx, -0.15, 0.42, 0xf2a530);
    crate(ctx, 0.0, 0.42, 0x6fb04a);
  });
  glowOf("m-shop", 46, (ctx) => {
    onFaceY(ctx, 0.3, -0.38, 0.12, 3, 16, WARM);
    onFaceX(ctx, 0.42, -0.36, 0.24, 3, 16, WARM);
  });
  art.vh.set("shop", 1);

  art.obj("m-school", 76, (ctx) => {
    // Playground markings in the front yard.
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 4; k++) {
      const a = P(-0.3 + k * 0.1, 0.32);
      ctx.strokeRect(a.x - 2, a.y - 1, 4, 2);
    }
    prism(ctx, { x0: -0.48, x1: 0.48, y0: -0.48, y1: 0.16, z0: 0, z1: 40 }, 0xc0644a, { top: 0x9a4a36 });
    onFaceY(ctx, 0.16, -0.48, 0.48, 19, 21, "rgba(255,240,225,0.8)");
    onFaceX(ctx, 0.48, -0.48, 0.16, 19, 21, "rgba(240,220,205,0.8)");
    windowRows(ctx, 0.48, 0.16, [-0.44, 0.12], [-0.44, 0.44], [
      [5, 15],
      [25, 35],
    ], 4, hex(0x9cd0e6), "rgba(255,255,255,0.9)");
    // Entrance.
    onFaceY(ctx, 0.16, -0.08, 0.08, 0, 13, hex(0x4a3020));
    prism(ctx, { x0: -0.12, x1: 0.12, y0: 0.16, y1: 0.26, z0: 13, z1: 15 }, 0xf1e6cf);
    // Clock gable.
    const g = [P(-0.12, 0.16, 40), P(0.12, 0.16, 40), P(0, 0.16, 50)];
    poly(ctx, g, hex(0xf1e6cf), EDGE);
    const c = P(0, 0.16, 43.5);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x, c.y - 1.8);
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + 1.3, c.y);
    ctx.stroke();
    sign(ctx, P(0, 0.16, 26), "SCHOOL", "#2c4a7a", "#fff", 4.6);
    // Flag pole.
    const f = P(0.42, 0.4);
    ctx.fillStyle = "#777";
    ctx.fillRect(f.x - 0.4, f.y - 34, 0.8, 34);
    ctx.fillStyle = hex(0x3fae6a);
    ctx.fillRect(f.x + 0.4, f.y - 34, 7, 4.5);
  });
  glowOf("m-school", 76, (ctx) => {
    ctx.globalAlpha = 0.6;
    windowRows(ctx, 0.48, 0.16, [-0.44, 0.12], [-0.44, 0.44], [
      [5, 15],
      [25, 35],
    ], 4, WARM);
  });
  art.vh.set("school", 1.6);

  art.obj("m-market", 34, (ctx) => {
    const stalls: [number, number, number, number][] = [
      [-0.26, -0.24, 0xe0533a, 0xe0533a],
      [0.2, -0.26, 0x3f7fd6, 0xf2a530],
      [-0.06, 0.24, 0x2f9e5a, 0x6fb04a],
    ];
    for (const [gx, gy, canopy, fruit] of stalls) {
      prism(ctx, { x0: gx - 0.17, x1: gx + 0.17, y0: gy - 0.1, y1: gy + 0.1, z0: 0, z1: 7 }, 0xb8864e, { top: 0x9a6b3f });
      const c = P(gx, gy, 7.5);
      for (let k = -3; k <= 3; k++) blob(ctx, c.x + k * 2.2, c.y + (k % 2), 1.3, fruit, 1.2);
      for (const sx of [-0.15, 0.15]) {
        const p = P(gx + sx, gy + 0.08);
        ctx.fillStyle = "#6b5a4a";
        ctx.fillRect(p.x - 0.4, p.y - 18, 0.8, 18);
      }
      const z = 18;
      for (let k = 0; k < 6; k++) {
        const u0 = gx - 0.2 + (k * 0.4) / 6;
        const u1 = gx - 0.2 + ((k + 1) * 0.4) / 6;
        poly(ctx, [P(u0, gy - 0.14, z + 3), P(u1, gy - 0.14, z + 3), P(u1, gy + 0.16, z - 1), P(u0, gy + 0.16, z - 1)], hex(k % 2 ? canopy : 0xffffff), EDGE, 0.4);
      }
    }
    sitter(ctx, P(0.3, 0.2), "#8e6fd8");
    sitter(ctx, P(0.38, 0.28), "#4cae4c", "#8d5a3b");
  });
  art.vh.set("market", 0.8);

  art.obj("m-clinic", 72, (ctx) => {
    prism(ctx, { x0: -0.44, x1: 0.44, y0: -0.44, y1: 0.24, z0: 0, z1: 40 }, 0xf4f6f6, { top: 0xd9dee0 });
    onFaceY(ctx, 0.24, -0.44, 0.44, 17, 20, hex(0x2fb3a3));
    onFaceX(ctx, 0.44, -0.44, 0.24, 17, 20, hex(0x239486));
    windowRows(ctx, 0.44, 0.24, [-0.4, 0.2], [-0.4, 0.4], [
      [5, 13],
      [24, 34],
    ], 3, hex(0x9cd0e6));
    onFaceY(ctx, 0.24, -0.1, 0.1, 0, 12, hex(0x7fb6cf));
    prism(ctx, { x0: -0.16, x1: 0.16, y0: 0.24, y1: 0.36, z0: 12, z1: 14 }, 0x2fb3a3);
    // Green cross sign.
    const c = P(0.1, 0.24, 46);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(c.x - 5, c.y - 5, 10, 10, 2);
    ctx.fill();
    ctx.fillStyle = hex(0x2f9e5a);
    ctx.fillRect(c.x - 1.3, c.y - 3.6, 2.6, 7.2);
    ctx.fillRect(c.x - 3.6, c.y - 1.3, 7.2, 2.6);
  });
  glowOf("m-clinic", 72, (ctx) => {
    ctx.globalAlpha = 0.6;
    windowRows(ctx, 0.44, 0.24, [-0.4, 0.2], [-0.4, 0.4], [
      [5, 13],
      [24, 34],
    ], 3, WARM);
  });
  art.vh.set("clinic", 1.4);

  art.obj("m-library", 64, (ctx) => {
    prism(ctx, { x0: -0.46, x1: 0.46, y0: -0.46, y1: 0.36, z0: 0, z1: 3 }, 0xbdb3a2);
    prism(ctx, { x0: -0.42, x1: 0.42, y0: -0.42, y1: 0.2, z0: 3, z1: 30 }, 0xe2d8c4, { top: 0xcfc4ae });
    windowRows(ctx, 0.42, 0.2, [-0.38, 0.16], [-0.38, 0.38], [[8, 24]], 3, hex(0x7a9fb5));
    // Portico with columns and a pediment.
    for (let k = 0; k < 4; k++) {
      const gx = -0.24 + k * 0.16;
      prism(ctx, { x0: gx - 0.025, x1: gx + 0.025, y0: 0.27, y1: 0.32, z0: 3, z1: 27 }, 0xf6f0e4);
    }
    prism(ctx, { x0: -0.3, x1: 0.3, y0: 0.2, y1: 0.34, z0: 27, z1: 30 }, 0xf1e9da);
    poly(ctx, [P(-0.3, 0.34, 30), P(0.3, 0.34, 30), P(0, 0.34, 38)], hex(0xf6f0e4), EDGE);
    sign(ctx, P(0, 0.34, 18), "LIBRARY", "#5a4030", "#fff", 4.2);
  });
  glowOf("m-library", 64, (ctx) => {
    ctx.globalAlpha = 0.6;
    windowRows(ctx, 0.42, 0.2, [-0.38, 0.16], [-0.38, 0.38], [[8, 24]], 3, WARM);
  });
  art.vh.set("library", 1.2);

  // ------------------------------------------------------------------ parks and props
  art.obj("m-park", 40, (ctx) => {
    poly(ctx, [P(-0.48, -0.48), P(0.48, -0.48), P(0.48, 0.48), P(-0.48, 0.48)], hex(0x7fc456));
    ctx.strokeStyle = hex(0xe2d2ad);
    ctx.lineWidth = 3;
    ctx.beginPath();
    const a = P(-0.5, 0.1);
    const b = P(0.1, 0);
    const c2 = P(0.2, 0.5);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(b.x, b.y, c2.x, c2.y);
    ctx.stroke();
    for (const [gx, gy, r] of [
      [-0.25, -0.25, 7],
      [0.28, -0.12, 6],
    ]) {
      const t = P(gx, gy);
      ctx.fillStyle = "#7a5232";
      ctx.fillRect(t.x - 1, t.y - 9, 2, 9);
      blob(ctx, t.x, t.y - 13, r, 0x5c9e45);
    }
    const r = rand(8);
    for (let k = 0; k < 10; k++) {
      const p = P(r() * 0.8 - 0.4, r() * 0.8 - 0.4);
      blob(ctx, p.x, p.y - 1, 1, [0xf2d04a, 0xf28fb0, 0xffffff][k % 3], 1.05);
    }
    benchAt(ctx, 0.25, 0.25);
  });
  art.vh.set("park", 0.8);

  art.obj("m-playground", 40, (ctx) => {
    poly(ctx, [P(-0.46, -0.46), P(0.46, -0.46), P(0.46, 0.46), P(-0.46, 0.46)], hex(0xd8735a));
    // Sandpit.
    poly(ctx, [P(0.08, 0.1), P(0.42, 0.1), P(0.42, 0.42), P(0.08, 0.42)], hex(0xead69c), EDGE);
    // Slide: ladder up, slope down.
    const top = P(-0.3, -0.2, 18);
    ctx.strokeStyle = "#5a6a7a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const l0 = P(-0.38, -0.28);
    const l1 = P(-0.3, -0.36);
    ctx.moveTo(l0.x, l0.y);
    ctx.lineTo(top.x - 2, top.y);
    ctx.moveTo(l1.x, l1.y);
    ctx.lineTo(top.x + 2, top.y);
    ctx.stroke();
    poly(ctx, [P(-0.3, -0.24, 18), P(-0.22, -0.24, 18), P(-0.1, 0.2, 1), P(-0.18, 0.2, 1)], hex(0xf2c230), EDGE);
    // Swings.
    ctx.strokeStyle = "#3a5a7a";
    ctx.lineWidth = 1.3;
    const s0 = P(0.15, -0.38);
    const s1 = P(0.42, -0.1);
    ctx.beginPath();
    ctx.moveTo(s0.x - 3, s0.y);
    ctx.lineTo(s0.x, s0.y - 20);
    ctx.lineTo(s0.x + 3, s0.y);
    ctx.moveTo(s1.x - 3, s1.y);
    ctx.lineTo(s1.x, s1.y - 20);
    ctx.lineTo(s1.x + 3, s1.y);
    ctx.moveTo(s0.x, s0.y - 20);
    ctx.lineTo(s1.x, s1.y - 20);
    ctx.stroke();
    ctx.lineWidth = 0.5;
    for (const t of [0.35, 0.7]) {
      const x = s0.x + (s1.x - s0.x) * t;
      const y = s0.y - 20 + (s1.y - s0.y) * t;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
      ctx.fillStyle = "#e0533a";
      ctx.fillRect(x - 1.5, y + 13, 3, 1.2);
    }
  });
  art.vh.set("playground", 0.8);

  art.obj("m-fountain", 34, (ctx) => {
    poly(ctx, [P(-0.48, -0.48), P(0.48, -0.48), P(0.48, 0.48), P(-0.48, 0.48)], hex(0xd8d0c0));
    ctx.strokeStyle = "rgba(150,140,120,0.35)";
    ctx.lineWidth = 0.5;
    for (let k = -4; k <= 4; k++) {
      const a = P(k * 0.11, -0.48);
      const b = P(k * 0.11, 0.48);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    cylinder(ctx, 0, 0, 20, 0, 5, 0xbfb5a2, 0x5fb0de);
    cylinder(ctx, 0, 0, 4, 5, 16, 0xcfc6b4, 0xcfc6b4);
    ctx.strokeStyle = "rgba(220,240,255,0.9)";
    ctx.lineWidth = 1;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.quadraticCurveTo(d * 7, -24, d * 11, -6);
      ctx.stroke();
    }
    blob(ctx, 0, -18, 2, 0xcfe8f5, 1.1);
  });
  art.vh.set("fountain", 0.7);

  art.obj("m-bikedock", 24, (ctx) => {
    prism(ctx, { x0: -0.4, x1: 0.4, y0: 0.05, y1: 0.12, z0: 0, z1: 6 }, 0x5a6a7a);
    for (let k = 0; k < 4; k++) {
      const p = P(-0.3 + k * 0.2, 0.18);
      ctx.strokeStyle = "#2b2f36";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(p.x - 2.5, p.y - 2, 2, 2, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + 2.5, p.y - 2, 2, 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hex(0x2f9e5a);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - 2.5, p.y - 2);
      ctx.lineTo(p.x - 0.5, p.y - 5);
      ctx.lineTo(p.x + 2, p.y - 5);
      ctx.lineTo(p.x + 2.5, p.y - 2);
      ctx.stroke();
    }
    const k = P(0.42, -0.3);
    prism(ctx, { x0: 0.34, x1: 0.46, y0: -0.36, y1: -0.24, z0: 0, z1: 14 }, 0x2f9e5a);
    ctx.fillStyle = "#cfe8f5";
    ctx.fillRect(k.x - 1, k.y - 12, 3, 4);
  });
  art.vh.set("bikedock", 0.5);

  const lampHead = P(0.3, 0.3, 30);
  art.obj("m-lamp", 40, (ctx) => {
    const b = P(0.3, 0.3);
    ctx.fillStyle = "#3a4048";
    ctx.fillRect(b.x - 0.7, b.y - 30, 1.4, 30);
    ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 1.5);
    ctx.beginPath();
    ctx.moveTo(lampHead.x - 3, lampHead.y);
    ctx.lineTo(lampHead.x + 3, lampHead.y);
    ctx.lineTo(lampHead.x + 2, lampHead.y - 4);
    ctx.lineTo(lampHead.x - 2, lampHead.y - 4);
    ctx.closePath();
    ctx.fillStyle = "#3a4048";
    ctx.fill();
    ctx.fillStyle = "#fff1c0";
    ctx.fillRect(lampHead.x - 1.8, lampHead.y - 0.2, 3.6, 1.6);
  });
  art.obj("m-lamp-glow", 40, (ctx) => {
    soft(ctx, lampHead.x, lampHead.y + 1, 10, 0xffe2a0, 0.9);
    const g = P(0.3, 0.3);
    ctx.save();
    ctx.scale(1, 0.5);
    soft(ctx, g.x, g.y * 2, 16, 0xffd890, 0.45);
    ctx.restore();
  });
  art.vh.set("lamp", 0.9);

  art.obj("m-bench", 18, (ctx) => {
    benchAt(ctx, 0, 0);
    blob(ctx, P(-0.3, -0.25).x, P(-0.3, -0.25).y - 3, 4, 0x5fa845);
  });
  art.vh.set("bench", 0.3);

  // Paved plaza.
  art.groundTile(
    "g-plaza",
    (ctx) => {
      ctx.strokeStyle = "rgba(140,125,100,0.35)";
      ctx.lineWidth = 0.6;
      for (let k = -4; k <= 4; k++) {
        const a = P(k * 0.125, -0.5);
        const b = P(k * 0.125, 0.5);
        const c = P(-0.5, k * 0.125);
        const d = P(0.5, k * 0.125);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
    },
    0xe4dccb,
  );
}

/** Farms, railways and stations. */
export function drawFarmsAndRail(art: Art) {
  // Railway: ballast with sleepers and rails along each connected direction (bit 1 = +x, 2 = −x, 4 = +y, 8 = −y).
  for (let m = 0; m < 16; m++)
    art.groundTile(
      `g-rail-${m}`,
      (ctx) => {
        const r = rand(13);
        for (let k = 0; k < 30; k++) {
          const p = P(r() - 0.5, r() - 0.5);
          ctx.fillStyle = hex(r() < 0.5 ? 0x8a8070 : 0xb0a594, 0.8);
          ctx.fillRect(p.x, p.y, 1.2, 0.9);
        }
        const dirs: [number, number, number][] = [
          [1, 1, 0],
          [2, -1, 0],
          [4, 0, 1],
          [8, 0, -1],
        ];
        let conn = dirs.filter(([bit]) => m & bit);
        if (!conn.length) conn = [dirs[0], dirs[1]];
        for (const [, dx, dy] of conn) {
          // Sleepers.
          for (let k = 0; k <= 4; k++) {
            const t = k * 0.12;
            const cx = dx * t;
            const cy = dy * t;
            const a = P(cx - dy * 0.2, cy + dx * 0.2);
            const b = P(cx + dy * 0.2, cy - dx * 0.2);
            ctx.strokeStyle = hex(0x6b4a2e);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          // Rails.
          ctx.strokeStyle = hex(0x9aa3ab);
          ctx.lineWidth = 1;
          for (const side of [-0.12, 0.12]) {
            const a = P(-dy * side, dx * side);
            const b = P(dx * 0.5 - dy * side, dy * 0.5 + dx * side);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      },
      0xa39885,
    );

  // Crop fields in three stages: sprouting, growing, ripe.
  const crops = [
    { soil: 0x8a6242, plant: 0x7fc456, h: 1.2 },
    { soil: 0x86603f, plant: 0x5fae3e, h: 3 },
    { soil: 0x8a6a40, plant: 0xe2b84a, h: 4.5 },
  ];
  crops.forEach((c, stage) =>
    art.groundTile(
      `g-field-${stage}`,
      (ctx) => {
        for (let k = -4; k <= 4; k++) {
          const a = P(-0.5, k * 0.11);
          const b = P(0.5, k * 0.11);
          ctx.strokeStyle = hex(shade(c.soil, 0.75));
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          for (let j = 0; j < 9; j++) {
            const p = P(-0.45 + j * 0.11, k * 0.11 - 0.03);
            ctx.strokeStyle = hex(c.plant);
            ctx.lineWidth = stage === 2 ? 1.1 : 0.9;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 0.4, p.y - c.h);
            ctx.stroke();
            if (stage === 2) blob(ctx, p.x + 0.4, p.y - c.h, 0.7, 0xf2d070, 1.1);
          }
        }
      },
      c.soil,
    ),
  );

  art.obj("n-orchard", 40, (ctx) => {
    for (const [gx, gy] of [
      [-0.25, -0.2],
      [0.2, -0.25],
      [-0.2, 0.22],
      [0.22, 0.2],
    ]) {
      const p = P(gx, gy);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(30,60,20,0.2)";
      ctx.fill();
      ctx.fillStyle = "#7a5232";
      ctx.fillRect(p.x - 1, p.y - 9, 2, 9);
      blob(ctx, p.x, p.y - 13, 6.5, 0x6aae4c);
      const r = rand(Math.round((gx + 1) * 10 + (gy + 1) * 3));
      for (let k = 0; k < 5; k++) blob(ctx, p.x + (r() - 0.5) * 9, p.y - 13 + (r() - 0.5) * 8, 1.1, k % 2 ? 0xe0533a : 0xf2a530, 1.1);
    }
  });
  art.vh.set("orchard", 0.9);

  art.obj("m-beehives", 22, (ctx) => {
    for (const [gx, gy, col] of [
      [-0.2, -0.1, 0xf2d27a],
      [0.05, 0.1, 0xefe6d0],
      [0.28, -0.12, 0xa9cbe6],
    ] as [number, number, number][]) {
      prism(ctx, { x0: gx - 0.08, x1: gx + 0.08, y0: gy - 0.08, y1: gy + 0.08, z0: 1, z1: 7 }, col);
      prism(ctx, { x0: gx - 0.09, x1: gx + 0.09, y0: gy - 0.09, y1: gy + 0.09, z0: 7, z1: 8.5 }, 0x8a6a52);
    }
    const r = rand(5);
    for (let k = 0; k < 8; k++) {
      const p = P(r() * 0.8 - 0.4, r() * 0.8 - 0.4, 10 + r() * 6);
      ctx.fillStyle = "#f2b630";
      ctx.fillRect(p.x, p.y, 1.2, 0.9);
    }
    const r2 = rand(9);
    for (let k = 0; k < 10; k++) {
      const p = P(r2() * 0.9 - 0.45, r2() * 0.9 - 0.45);
      blob(ctx, p.x, p.y - 2, 1, [0xb08ff2, 0xf2d04a, 0xffffff][k % 3], 1.05);
    }
  });
  art.vh.set("beehives", 0.4);

  art.obj("m-greenhouse", 40, (ctx) => {
    const b = { x0: -0.44, x1: 0.44, y0: -0.36, y1: 0.36, z0: 0, z1: 14 };
    prism(ctx, { ...b, z1: 2 }, 0xd8d0c0);
    // Glass walls with plants inside.
    for (let k = 0; k < 6; k++) {
      const p = P(-0.38 + k * 0.15, 0.2, 2);
      blob(ctx, p.x, p.y - 3, 2.6, k % 2 ? 0x5fae3e : 0x7fc456);
      blob(ctx, p.x + 1, p.y - 4, 0.9, 0xe0533a, 1.1);
    }
    ctx.globalAlpha = 0.45;
    prism(ctx, { ...b, z0: 2 }, 0xcfeaf3, { flatTop: false });
    ctx.globalAlpha = 1;
    // Pitched glass roof.
    const ridge = [P(-0.44, 0, 22), P(0.44, 0, 22)];
    poly(ctx, [P(-0.44, 0.36, 14), P(0.44, 0.36, 14), ridge[1], ridge[0]], "rgba(200,232,242,0.7)", EDGE);
    poly(ctx, [P(0.44, 0.36, 14), P(0.44, -0.36, 14), ridge[1]], "rgba(170,210,225,0.7)", EDGE);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 0.6;
    for (let k = 0; k <= 6; k++) {
      const a = P(-0.44 + k * 0.147, 0.36, 14);
      const c = P(-0.44 + k * 0.147, 0, 22);
      const d = P(-0.44 + k * 0.147, 0.36, 2);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
  });
  art.obj("m-greenhouse-glow", 40, (ctx) => {
    ctx.globalAlpha = 0.5;
    poly(ctx, [P(-0.44, 0.36, 2), P(0.44, 0.36, 2), P(0.44, 0.36, 14), P(-0.44, 0.36, 14)], "#ff9ad8");
    poly(ctx, [P(0.44, 0.36, 2), P(0.44, -0.36, 2), P(0.44, -0.36, 14), P(0.44, 0.36, 14)], "#e080c8");
  });
  art.vh.set("greenhouse", 0.8);

  art.obj("m-station", 44, (ctx) => {
    prism(ctx, { x0: -0.48, x1: 0.48, y0: -0.48, y1: 0.0, z0: 0, z1: 4 }, 0xc9c1b2, { top: 0xd8d0c0 });
    prism(ctx, { x0: -0.4, x1: 0.1, y0: -0.46, y1: -0.16, z0: 4, z1: 20 }, 0xb35a40, { top: 0x8a4a36 });
    onFaceY(ctx, -0.16, -0.36, -0.04, 8, 16, hex(0x9cd0e6));
    onFaceX(ctx, 0.1, -0.42, -0.2, 8, 16, hex(0x8cc0d6));
    // Platform canopy on posts.
    for (const gx of [-0.3, 0.05, 0.4]) prism(ctx, { x0: gx - 0.02, x1: gx + 0.02, y0: -0.06, y1: -0.02, z0: 4, z1: 20 }, 0x3a4048);
    prism(ctx, { x0: -0.48, x1: 0.48, y0: -0.14, y1: 0.06, z0: 20, z1: 22 }, 0x2f9e5a);
    // Clock and sign.
    const c = P(0.3, -0.04, 17);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    sign(ctx, P(-0.15, -0.31, 28), "STATION", "#2c4a7a", "#fff", 4.2);
    sitter(ctx, P(-0.1, -0.02, 4), "#e05a47");
    sitter(ctx, P(0.2, -0.04, 4), "#3f7fd6", "#8d5a3b");
  });
  art.obj("m-station-glow", 44, (ctx) => {
    onFaceY(ctx, -0.16, -0.36, -0.04, 8, 16, WARM);
    onFaceX(ctx, 0.1, -0.42, -0.2, 8, 16, WARM);
  });
  art.vh.set("station", 0.9);
}

function benchAt(ctx: Ctx, gx: number, gy: number) {
  prism(ctx, { x0: gx - 0.16, x1: gx + 0.16, y0: gy - 0.04, y1: gy + 0.04, z0: 3, z1: 4.2 }, 0x9a6b3f);
  prism(ctx, { x0: gx - 0.16, x1: gx + 0.16, y0: gy - 0.06, y1: gy - 0.04, z0: 4.2, z1: 8 }, 0x8a5b33);
  for (const dx of [-0.13, 0.13]) prism(ctx, { x0: gx + dx - 0.01, x1: gx + dx + 0.01, y0: gy - 0.03, y1: gy + 0.03, z0: 0, z1: 3 }, 0x3a4048);
}

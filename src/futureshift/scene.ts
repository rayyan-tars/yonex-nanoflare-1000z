// Canvas renderer. Today and 2050 are drawn by the same code with the same
// camera matrix; the Future Lens only changes each era's clip region, so the
// two worlds can never drift out of alignment.

import {
  type Era,
  type Sprites,
  type TreeKind,
  TREE_SHADOW,
  drawCanopy,
  drawGreenRoof,
  drawRainGarden,
  drawRoofSolar,
  drawSprite,
  drawStatic,
  makeSprites,
} from "./art";
import {
  ACADEMIC,
  BIKE_LANE,
  CAFETERIA,
  COURT,
  COURT_TREES,
  EXISTING_TREE,
  FENCE_RUNS,
  FENCE_Y,
  GATE_PATH,
  GX,
  GY,
  HOTSPOTS,
  SLAB_DEPTH,
  STREET_TREES,
  type Rect,
} from "./campus";
import { clamp, easeBack, easeInOut, easeOut, iso, poly, pointInPoly, rgba, type Ctx, type Pt } from "./iso";
import { has, hasId, validSpots, type HotspotId, type Placement } from "./model";
import { World, planFor } from "./sim";
import { sfx } from "./sound";
import type { Store } from "./store";

export const ANIM_MS: Record<string, number> = {
  "trees-courtyard": 900,
  "trees-street": 900,
  "solar-roof": 900,
  "solar-canopy": 850,
  "bike-gate": 900,
  "rain-lowpoint": 850,
  "roof-academic": 800,
  "roof-cafeteria": 700,
};

const PEEK_OPEN = 450;
const PEEK_HOLD = 2600;
const PEEK_CLOSE = 380;

/** World bounds in world px (for camera fit). */
const BOUNDS = (() => {
  const minX = iso(0, GY).x;
  const maxX = iso(GX, 0).x;
  const minY = iso(1, 0.6, ACADEMIC.h + 12).y;
  const maxY = iso(GX, GY, -SLAB_DEPTH).y;
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
})();

export const LAYOUT = { top: 64, bottom: 124, side: 16 };

type Anim = { t0: number; dur: number };
type LensAnim = { keys: [number, number][]; t0: number; ease: (t: number) => number };

export type OverlayRefs = {
  handle: HTMLElement | null;
  peek: HTMLElement | null;
  heat: HTMLElement | null;
};

let spriteCache: Sprites | null = null;

/** Traffic fades in and out at the slab edges instead of floating off the diorama. */
const edgeFade = (x: number) => clamp(Math.min(x - 0.1, GX - 0.1 - x) / 0.5, 0, 1);

export class Scene {
  readonly ctx: Ctx;
  sprites: Sprites;
  W = 0;
  H = 0;
  dpr = 1;
  cam = { s: 1, ox: 0, oy: 0 };
  private layers: Record<Era, HTMLCanvasElement>;
  private dirty = true;
  worlds: Record<Era, World>;
  private anims = new Map<HotspotId, Anim>();
  private rustle = new Map<HotspotId, number>();
  private known: Placement[] = [];
  lens = 0;
  private lensAnim: LensAnim | null = null;
  peek: { spot: HotspotId; t0: number } | null = null;
  heat: { t0: number } | null = null;
  heatLevel = 0;
  private heatPlanned = false;
  private introT0 = 0;
  private last = 0;
  private raf = 0;
  private now = 0;
  overlay: OverlayRefs = { handle: null, peek: null, heat: null };
  hover: HotspotId | null = null;
  transforms: Partial<Record<Era, DOMMatrix>> = {};
  frameTimes: number[] = [];
  private lastLensSound = 0;
  private unsub: () => void;
  private shimmerSeed = 0;
  private gen = 0;
  /** Heatwave length; tests shorten it. */
  heatMs = 20000;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly store: Store,
  ) {
    this.ctx = canvas.getContext("2d")!;
    spriteCache ??= makeSprites();
    this.sprites = spriteCache;
    this.layers = { today: document.createElement("canvas"), future: document.createElement("canvas") };
    const pl = store.state.game.placements;
    this.worlds = { today: new World("today", 7, pl), future: new World("future", 19, pl) };
    this.known = [...pl];
    this.unsub = store.subscribe(() => this.sync());
    this.resize();
    this.introT0 = performance.now();
    this.last = this.introT0;
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unsub();
  }

  get reduced() {
    return this.store.state.reduced;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const narrow = this.W < 640;
    const top = narrow ? 92 : LAYOUT.top;
    const bottom = narrow ? 150 : LAYOUT.bottom;
    const availW = this.W - LAYOUT.side * 2;
    const availH = this.H - top - bottom;
    const s = Math.max(0.2, Math.min(availW / BOUNDS.w, availH / BOUNDS.h));
    this.cam = {
      s,
      ox: this.W / 2 - (BOUNDS.minX + BOUNDS.w / 2) * s,
      oy: top + availH / 2 - (BOUNDS.minY + BOUNDS.h / 2) * s,
    };
    for (const l of Object.values(this.layers)) {
      l.width = this.canvas.width;
      l.height = this.canvas.height;
    }
    this.dirty = true;
  }

  /** World (tile) coords to CSS pixels. */
  project(x: number, y: number, z = 0): Pt {
    const p = iso(x, y, z);
    return { x: this.cam.ox + p.x * this.cam.s, y: this.cam.oy + p.y * this.cam.s };
  }

  get divider() {
    return this.W * (1 - this.lens);
  }

  // ------------------------------------------------------------ store sync

  private sync() {
    const st = this.store.state;
    const pl = st.game.placements;
    const now = performance.now();
    const added = pl.filter((p) => !this.known.includes(p));
    const removed = this.known.filter((p) => !pl.includes(p));
    for (const p of added) {
      const dur = this.reduced ? 160 : ANIM_MS[p.spot];
      this.anims.set(p.spot, { t0: now, dur });
      this.dirty = true;
      sfx.place();
      if (p.id === "trees") sfx.leaves();
      if (p.id === "solar") sfx.solar();
      if (p.id === "rain") sfx.water();
    }
    for (const p of removed) {
      this.anims.delete(p.spot);
      this.rustle.delete(p.spot);
      if (this.peek?.spot === p.spot) this.peek = null;
      this.dirty = true;
    }
    if (st.gen !== this.gen) {
      // replay: fresh populations and no leftover animations
      this.gen = st.gen;
      this.anims.clear();
      this.rustle.clear();
      this.worlds = { today: new World("today", 7, pl), future: new World("future", 19, pl) };
      this.known = [...pl];
      this.dirty = true;
      return;
    }
    if (added.length || removed.length) {
      this.known = [...pl];
      this.replan();
    }
  }

  replan() {
    const pl = this.store.state.game.placements;
    this.worlds.today.setPlan(planFor("today", pl, 0));
    this.worlds.future.setPlan(planFor("future", pl, this.heatPlanned ? 1 : 0));
  }

  // ------------------------------------------------------------ lens control

  setLens(f: number, user = false) {
    const v = clamp(f, 0, 1);
    if (user) {
      this.lensAnim = null;
      if (Math.abs(v - this.lens) > 0.01 && this.now - this.lastLensSound > 70) {
        sfx.lens();
        this.lastLensSound = this.now;
      }
    }
    this.lens = v;
  }

  animateLens(keys: number[], durMs: number, ease = easeInOut) {
    if (this.reduced) {
      this.lens = keys[keys.length - 1];
      this.lensAnim = null;
      return;
    }
    const pts: [number, number][] = [[0, this.lens]];
    keys.forEach((k, i) => pts.push([(durMs * (i + 1)) / keys.length, k]));
    this.lensAnim = { keys: pts, t0: performance.now(), ease };
  }

  startHeat() {
    this.heat = { t0: performance.now() };
    this.heatLevel = 0;
    this.animateLens([1], 900);
    sfx.heat();
  }

  stopHeat() {
    this.heat = null;
    this.heatLevel = 0;
    if (this.heatPlanned) {
      this.heatPlanned = false;
      this.replan();
    }
  }

  // ------------------------------------------------------------ input

  hitTest(cssX: number, cssY: number): HotspotId | null {
    const st = this.store.state;
    if (!st.selected || st.game.phase !== "choose") return null;
    const spots = validSpots(st.game.placements, st.game.phase, st.selected);
    const p = { x: cssX, y: cssY };
    for (const id of spots) if (pointInPoly(p, this.spotPoly(id))) return id;
    return null;
  }

  spotPoly(id: HotspotId): Pt[] {
    const h = HOTSPOTS[id];
    const r = h.area;
    return [this.project(r.x0, r.y0, h.z), this.project(r.x1, r.y0, h.z), this.project(r.x1, r.y1, h.z), this.project(r.x0, r.y1, h.z)];
  }

  spotBox(id: HotspotId) {
    const pts = this.spotPoly(id);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  // ------------------------------------------------------------ frame

  private tick = (t: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.now = t;
    const f0 = performance.now();
    try {
      this.step(t, dt);
      this.draw(t);
    } catch (e) {
      console.error(e);
    }
    const ft = performance.now() - f0;
    this.frameTimes.push(ft);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
  };

  private step(t: number, dt: number) {
    const st = this.store.state;
    // finished placement animations get baked into the static layers
    for (const [spot, a] of this.anims) {
      if (t - a.t0 >= a.dur) {
        this.anims.delete(spot);
        this.rustle.set(spot, t);
        this.dirty = true;
        this.onSettled(spot, t);
      }
    }
    // lens keyframes
    if (this.lensAnim) {
      const a = this.lensAnim;
      const e = t - a.t0;
      const keys = a.keys;
      const end = keys[keys.length - 1][0];
      if (e >= end) {
        this.lens = keys[keys.length - 1][1];
        this.lensAnim = null;
      } else {
        let i = 1;
        while (i < keys.length - 1 && keys[i][0] < e) i++;
        const [ta, va] = keys[i - 1];
        const [tb, vb] = keys[i];
        this.lens = va + (vb - va) * a.ease((e - ta) / Math.max(1, tb - ta));
      }
    }
    // peek window lifecycle
    if (this.peek && t - this.peek.t0 > PEEK_OPEN + PEEK_HOLD + PEEK_CLOSE) {
      this.peek = null;
      this.store.lensIntroduced();
      if (!this.reduced && this.lens < 0.02 && st.game.phase === "choose") this.animateLens([0.14, 0], 1300, easeInOut);
    }
    // heatwave timeline
    if (this.heat) {
      const e = t - this.heat.t0;
      const up = this.reduced ? 1 : clamp(e / Math.min(5000, this.heatMs / 4), 0, 1);
      const down = clamp((this.heatMs - e) / Math.min(2500, this.heatMs / 4), 0, 1);
      this.heatLevel = Math.min(up, down);
      const want = this.heatLevel >= 0.35;
      if (want !== this.heatPlanned) {
        this.heatPlanned = want;
        this.replan();
      }
      this.store.heatTick(clamp(e / this.heatMs, 0, 1));
      if (e >= this.heatMs) {
        this.stopHeat();
        this.store.heatDone();
      }
    }
    this.worlds.today.update(dt);
    this.worlds.future.update(dt);
    if (this.worlds.today.cyclistStarted === 1 && this.bellArmed) {
      this.bellArmed = false;
      sfx.bell();
    }
  }

  private bellArmed = false;

  private onSettled(spot: HotspotId, t: number) {
    const st = this.store.state;
    if (spot === "bike-gate") {
      this.bellArmed = this.worlds.today.cyclistStarted === 0;
      this.worlds.today.kickCyclist();
      this.worlds.future.kickCyclist();
    }
    // the first change opens a small Future Lens over the spot
    if (!st.lensReady && st.game.placements.length >= 1) this.peek = { spot, t0: t };
  }

  // ------------------------------------------------------------ drawing

  private bake() {
    const st = this.store.state;
    const live = new Set<string>(this.anims.keys());
    for (const era of ["today", "future"] as Era[]) {
      const l = this.layers[era];
      const c = l.getContext("2d")!;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, l.width, l.height);
      c.setTransform(this.cam.s * this.dpr, 0, 0, this.cam.s * this.dpr, this.cam.ox * this.dpr, this.cam.oy * this.dpr);
      c.lineJoin = "round";
      drawStatic(c, this.sprites, { era, placements: st.game.placements, live });
    }
    this.dirty = false;
  }

  /** Screen-space intro ease (applied on top of the camera, identical for both eras). */
  private introMatrix(t: number) {
    if (this.reduced) return new DOMMatrix();
    const k = easeOut((t - this.introT0) / 1400);
    if (k >= 1) return new DOMMatrix();
    const sc = 1 + (1 - k) * 0.06;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return new DOMMatrix().translate(cx, cy + (1 - k) * 18 * this.dpr).scale(sc).translate(-cx, -cy);
  }

  peekRect(t: number) {
    if (!this.peek) return null;
    const b = this.spotBox(this.peek.spot);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2 - 18 * this.cam.s;
    const w = clamp(b.x1 - b.x0 + 40, 170, 300) * Math.max(0.8, Math.min(1.3, this.cam.s));
    const h = clamp(b.y1 - b.y0 + 120 * this.cam.s, 150, 240);
    const e = t - this.peek.t0;
    let k = 1;
    if (!this.reduced) {
      if (e < PEEK_OPEN) k = easeOut(e / PEEK_OPEN);
      else if (e > PEEK_OPEN + PEEK_HOLD) k = 1 - easeInOut((e - PEEK_OPEN - PEEK_HOLD) / PEEK_CLOSE);
    } else if (e > PEEK_OPEN + PEEK_HOLD) k = 0;
    const ww = w * k;
    return { x: cx - ww / 2, y: cy - h / 2, w: ww, h, k };
  }

  private draw(t: number) {
    if (this.dirty) this.bake();
    const c = this.ctx;
    const d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const I = this.introMatrix(t);
    const div = this.divider * d;
    const peek = this.peekRect(t);
    const W = this.canvas.width;
    const H = this.canvas.height;
    const showToday = div > 0.5;
    const showFuture = div < W - 0.5 || (peek && peek.w > 1);
    if (showToday) {
      c.save();
      c.beginPath();
      c.rect(0, 0, div, H);
      if (peek && peek.w > 1) c.rect(peek.x * d, peek.y * d, peek.w * d, peek.h * d);
      c.clip("evenodd");
      this.drawEra("today", I, t);
      c.restore();
    }
    if (showFuture) {
      c.save();
      c.beginPath();
      if (div < W - 0.5) c.rect(div, 0, W - div, H);
      if (peek && peek.w > 1) c.rect(peek.x * d, peek.y * d, peek.w * d, peek.h * d);
      c.clip("nonzero");
      this.drawEra("future", I, t);
      c.restore();
    }
    this.updateOverlay(peek);
  }

  private drawEra(era: Era, I: DOMMatrix, t: number) {
    const c = this.ctx;
    c.setTransform(I);
    c.drawImage(this.layers[era], 0, 0);
    const M = I.multiply(new DOMMatrix([this.cam.s * this.dpr, 0, 0, this.cam.s * this.dpr, this.cam.ox * this.dpr, this.cam.oy * this.dpr]));
    c.setTransform(M);
    this.transforms[era] = c.getTransform();
    c.lineJoin = "round";
    this.drawHotspots(c, t);
    this.drawLiveUnder(c, era, t);
    this.drawDynamic(c, era, t);
    this.drawFx(c, era, t);
  }

  private animP(spot: HotspotId, t: number) {
    const a = this.anims.get(spot);
    return a ? clamp((t - a.t0) / a.dur, 0, 1) : 1;
  }

  private drawLiveUnder(c: Ctx, era: Era, t: number) {
    for (const [spot] of this.anims) {
      const p = this.animP(spot, t);
      if (spot === "rain-lowpoint") drawRainGarden(c, era, p);
      else if (spot === "solar-roof") drawRoofSolar(c, p);
      else if (spot === "solar-canopy") drawCanopy(c, p);
      else if (spot === "roof-academic") drawGreenRoof(c, { x0: ACADEMIC.x0 + 2.3, x1: ACADEMIC.x1, y0: ACADEMIC.y0, y1: ACADEMIC.y1 }, ACADEMIC.h, era, easeInOut(p));
      else if (spot === "roof-cafeteria") drawGreenRoof(c, { x0: CAFETERIA.x0, x1: CAFETERIA.x1, y0: CAFETERIA.y0, y1: CAFETERIA.y1 }, CAFETERIA.h, era, easeInOut(p));
      else if (spot === "bike-gate") this.drawLanePaint(c, era, p);
    }
  }

  private drawLanePaint(c: Ctx, era: Era, p: number) {
    const x1 = BIKE_LANE.x0 + (BIKE_LANE.x1 - BIKE_LANE.x0) * easeInOut(p);
    poly(c, [iso(0, BIKE_LANE.y0), iso(x1, BIKE_LANE.y0), iso(x1, BIKE_LANE.y1), iso(0, BIKE_LANE.y1)], rgba(era === "future" ? 0x3f9d66 : 0x46a86e));
    const head = iso(x1, (BIKE_LANE.y0 + BIKE_LANE.y1) / 2);
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.ellipse(head.x, head.y, 3, 1.5, 0, 0, Math.PI * 2);
    c.fill();
  }

  private drawHotspots(c: Ctx, t: number) {
    const st = this.store.state;
    if (!st.selected || st.game.phase !== "choose") return;
    const spots = validSpots(st.game.placements, st.game.phase, st.selected);
    const breath = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 520);
    for (const id of spots) {
      const h = HOTSPOTS[id];
      const r = h.area;
      const hov = this.hover === id;
      const pts = [iso(r.x0, r.y0, h.z), iso(r.x1, r.y0, h.z), iso(r.x1, r.y1, h.z), iso(r.x0, r.y1, h.z)];
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.fillStyle = `rgba(255,255,255,${hov ? 0.34 : 0.12 + 0.1 * breath})`;
      c.fill();
      c.setLineDash(hov ? [] : [5, 4]);
      c.strokeStyle = `rgba(255,255,255,${hov ? 1 : 0.75 + 0.25 * breath})`;
      c.lineWidth = hov ? 2 : 1.5;
      c.stroke();
      c.setLineDash([]);
      for (const ring of h.rings ?? []) {
        c.beginPath();
        const q = iso(ring.x, ring.y);
        c.ellipse(q.x, q.y, 9, 4.5, 0, 0, Math.PI * 2);
        c.strokeStyle = "rgba(255,255,255,0.9)";
        c.lineWidth = 1.2;
        c.stroke();
      }
    }
  }

  private trees(era: Era) {
    const pl = this.store.state.game.placements;
    const list: { x: number; y: number; kind: TreeKind; v: number; spot?: HotspotId }[] = [];
    list.push({ ...EXISTING_TREE, kind: era === "today" ? "medium" : "grand", v: 0 });
    list.push({ x: 11.2, y: 4.7, kind: era === "today" ? "young" : "medium", v: 2 });
    list.push({ x: 0.45, y: 10.75, kind: era === "today" ? "medium" : "mature", v: 1 });
    if (has(pl, "trees-courtyard"))
      COURT_TREES.forEach((p, i) => list.push({ ...p, kind: era === "today" ? "young" : "mature", v: i, spot: "trees-courtyard" }));
    if (has(pl, "trees-street"))
      STREET_TREES.forEach((p, i) => list.push({ ...p, kind: era === "today" ? "young" : "mature", v: i + 1, spot: "trees-street" }));
    return list;
  }

  private drawDynamic(c: Ctx, era: Era, t: number) {
    const sp = this.sprites;
    const w = this.worlds[era];
    const items: { d: number; f: () => void }[] = [];
    const trees = this.trees(era);
    const reduced = this.reduced;
    // tree shadows first so people stand in them
    for (const tr of trees) {
      const g = tr.spot ? this.growth(tr.spot, t) : 1;
      if (g <= 0) continue;
      const [rx, ry] = TREE_SHADOW[tr.kind];
      const p = iso(tr.x, tr.y);
      c.beginPath();
      c.ellipse(p.x + rx * 0.18, p.y + ry * 0.25, rx * g, ry * g, 0, 0, Math.PI * 2);
      c.fillStyle = "rgba(30,55,25,0.24)";
      c.fill();
    }
    trees.forEach((tr, i) => {
      items.push({
        d: tr.x + tr.y,
        f: () => {
          const p = iso(tr.x, tr.y);
          const g = tr.spot ? this.growth(tr.spot, t) : 1;
          if (tr.spot && this.anims.has(tr.spot)) {
            const a = this.animP(tr.spot, t);
            // soil mound turned over before the tree settles in
            const soil = clamp(a / 0.3, 0, 1);
            c.beginPath();
            c.ellipse(p.x, p.y, 7 * soil, 3.4 * soil, 0, 0, Math.PI * 2);
            c.fillStyle = "#6b4a2e";
            c.fill();
          } else if (tr.spot && era === "today") {
            c.beginPath();
            c.ellipse(p.x, p.y, 6, 2.9, 0, 0, Math.PI * 2);
            c.fillStyle = "rgba(107,74,46,0.75)";
            c.fill();
          }
          if (g <= 0) return;
          const small = tr.kind === "young" || tr.kind === "sapling";
          let sway = reduced ? 0 : Math.sin(t / 900 + i * 1.7) * (small ? 0.03 : 0.012);
          const r0 = tr.spot ? this.rustle.get(tr.spot) : undefined;
          if (!reduced && r0 !== undefined && t - r0 < 1400) sway += Math.sin((t - r0) / 70) * 0.05 * (1 - (t - r0) / 1400);
          const s = sp.tree(tr.kind, tr.v);
          c.save();
          c.translate(p.x, p.y);
          c.transform(g, 0, sway * g, g, 0, 0);
          c.drawImage(s.c, -s.ox, -s.oy, s.w, s.h);
          c.restore();
        },
      });
    });
    // front boundary railings, one tile per segment for depth sorting
    for (const [a, b] of FENCE_RUNS) {
      for (let x = a; x < b - 0.01; x += 1) {
        const len = Math.min(1, b - x);
        items.push({
          d: x + len / 2 + FENCE_Y,
          f: () => {
            const p = iso(x, FENCE_Y);
            if (len >= 0.999) drawSprite(c, sp.fence, p.x, p.y);
            else {
              c.save();
              c.beginPath();
              const q = [iso(x, FENCE_Y - 1), iso(x + len, FENCE_Y - 1), iso(x + len, FENCE_Y + 1), iso(x, FENCE_Y + 1)];
              c.moveTo(q[0].x, q[0].y - 40);
              c.lineTo(q[1].x, q[1].y - 40);
              c.lineTo(q[2].x, q[2].y + 10);
              c.lineTo(q[3].x, q[3].y + 10);
              c.closePath();
              c.clip();
              drawSprite(c, sp.fence, p.x, p.y);
              c.restore();
            }
          },
        });
      }
    }
    // gate posts
    for (const gx of [GATE_PATH.x0, GATE_PATH.x1]) {
      items.push({
        d: gx + FENCE_Y + 0.02,
        f: () => {
          const p = iso(gx, FENCE_Y);
          c.fillStyle = "#2f4f45";
          c.fillRect(p.x - 1.4, p.y - 16, 2.8, 16);
          c.fillStyle = "#e9e4d8";
          c.fillRect(p.x - 1.8, p.y - 17.5, 3.6, 1.6);
        },
      });
    }
    for (const s of w.students) {
      if (s.state === "gone" || s.alpha <= 0.02) continue;
      items.push({
        d: s.x + s.y,
        f: () => {
          const p = iso(s.x, s.y);
          const moving = s.state === "walk";
          const fr = moving ? Math.floor(s.phase * 6) % 2 : 1;
          const spr = s.sit ? sp.sit[s.look] : sp.walk[s.look][fr];
          drawSprite(c, spr, p.x, p.y + (s.sit ? -1 : 0), s.flip, s.alpha);
        },
      });
    }
    for (const k of w.walkers) {
      if (!k.active) continue;
      items.push({
        d: k.x + k.y,
        f: () => {
          const p = iso(k.x, k.y);
          drawSprite(c, sp.walk[k.look][Math.floor(k.phase * 6) % 2], p.x, p.y, k.dir < 0, edgeFade(k.x));
        },
      });
    }
    for (const car of w.cars) {
      if (!car.active) continue;
      items.push({
        d: car.x + car.y,
        f: () => {
          const p = iso(car.x, car.y);
          drawSprite(c, sp.car[car.lane === "east" ? "xp" : "xn"][car.spec], p.x, p.y, false, edgeFade(car.x));
        },
      });
    }
    for (const cy of w.cyclists) {
      if (!cy.active) continue;
      items.push({
        d: cy.x + cy.y,
        f: () => {
          const p = iso(cy.x, cy.y);
          drawSprite(c, sp.cyclist[cy.look][Math.floor(cy.phase * 5) % 2], p.x, p.y, cy.flip, cy.alpha * edgeFade(cy.x));
        },
      });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.f();
  }

  /** Placement growth for tree spots: 0 → 1 with a settle. */
  private growth(spot: HotspotId, t: number) {
    if (!this.anims.has(spot)) return 1;
    const a = this.animP(spot, t);
    return clamp(easeBack((a - 0.22) / 0.78), 0, 1.2);
  }

  private drawFx(c: Ctx, era: Era, t: number) {
    const w = this.worlds[era];
    const sp = this.sprites;
    for (const f of w.puffs) {
      if (!f.active) continue;
      const k = f.age / f.life;
      const p = iso(f.x, f.y, 3 + k * 14);
      const s = 0.35 + k * 0.9;
      c.globalAlpha = 0.5 * (1 - k);
      c.drawImage(sp.puff.c, p.x - 12 * s, p.y - 12 * s, 24 * s, 24 * s);
    }
    c.globalAlpha = 1;
    if (era !== "future" || this.reduced) return;
    const pl = this.store.state.game.placements;
    // exposed paving shimmers in a hot 2050; Greenhold's heat shimmer technique
    const base = has(pl, "trees-courtyard") ? 0 : 0.35;
    const level = Math.max(this.heatLevel, base * (this.heat ? 0 : 1));
    if (level <= 0.02) return;
    const rects: Rect[] = [];
    if (!has(pl, "trees-courtyard")) rects.push({ x0: 5.4, x1: 10.4, y0: 4.8, y1: 9.8 });
    if (this.heat) {
      if (!has(pl, "trees-street")) rects.push({ x0: 6.3, x1: 8.4, y0: 10.4, y1: 11.4 }, { x0: 0.5, x1: 15, y0: 11.8, y1: 12.2 });
      rects.push({ x0: COURT.x0 + 0.4, x1: COURT.x1 - 0.4, y0: COURT.y0 + 0.4, y1: COURT.y1 - 0.4 });
      if (!hasId(pl, "rain")) rects.push({ x0: 1.4, x1: 5.2, y0: 10.5, y1: 11.4 });
    }
    if (!rects.length) return;
    const n = this.heat ? 16 : 6;
    const slot = Math.floor(t / 3000);
    if (slot !== this.shimmerSeed) this.shimmerSeed = slot;
    for (let i = 0; i < n; i++) {
      const r = rects[i % rects.length];
      const h1 = Math.abs(Math.sin((i + 1) * 12.9898 + slot * 78.233)) % 1;
      const h2 = Math.abs(Math.sin((i + 1) * 39.3468 + slot * 11.135)) % 1;
      const x = r.x0 + h1 * (r.x1 - r.x0);
      const y = r.y0 + h2 * (r.y1 - r.y0);
      const p = iso(x, y);
      const ph = i * 1.37;
      const a = 0.18 * level * (0.55 + 0.45 * Math.sin(t / 900 + ph));
      c.globalAlpha = a;
      const sx = 1;
      const sy = 0.8 + 0.2 * Math.sin(t / 300 + ph);
      const s = sp.shimmer;
      c.drawImage(s.c, p.x + Math.sin(t / 420 + ph) * 1.5 - s.ox * sx, p.y - 4 - s.oy * sy, s.w * sx, s.h * sy);
    }
    c.globalAlpha = 1;
  }

  private overlayState = { div: -1, peek: "", heat: -1 };

  private updateOverlay(peek: { x: number; y: number; w: number; h: number; k: number } | null) {
    const o = this.overlay;
    const div = this.divider;
    if (o.handle && Math.abs(div - this.overlayState.div) > 0.1) {
      this.overlayState.div = div;
      o.handle.style.transform = `translate3d(${div.toFixed(1)}px,0,0)`;
      const pct = Math.round(this.lens * 100);
      o.handle.dataset.edge = this.lens < 0.03 ? "today" : this.lens > 0.97 ? "future" : "mid";
      const knob = o.handle.querySelector<HTMLElement>("[role=slider]");
      if (knob) {
        knob.setAttribute("aria-valuenow", String(pct));
        knob.setAttribute("aria-valuetext", pct === 0 ? "Today" : pct === 100 ? "2050" : `${pct}% 2050`);
      }
    }
    if (o.peek) {
      const key = peek && peek.w > 1 ? `${peek.x.toFixed(0)},${peek.y.toFixed(0)},${peek.w.toFixed(0)},${peek.h.toFixed(0)}` : "";
      if (key !== this.overlayState.peek) {
        this.overlayState.peek = key;
        if (!key || !peek) o.peek.style.opacity = "0";
        else {
          o.peek.style.opacity = String(Math.min(1, peek.k * 1.4));
          o.peek.style.transform = `translate3d(${peek.x}px,${peek.y}px,0)`;
          o.peek.style.width = `${peek.w}px`;
          o.peek.style.height = `${peek.h}px`;
        }
      }
    }
    if (o.heat && Math.abs(this.heatLevel - this.overlayState.heat) > 0.005) {
      this.overlayState.heat = this.heatLevel;
      o.heat.style.opacity = String(this.heatLevel);
    }
  }

  setOverlay(o: OverlayRefs) {
    this.overlay = o;
    this.overlayState = { div: -1, peek: "", heat: -1 };
  }

  setHover(id: HotspotId | null) {
    this.hover = id;
  }

  resetForReplay() {
    this.stopHeat();
    this.peek = null;
    this.animateLens([0], 500);
  }

  /** Debug/test summary of the scene. */
  debug() {
    const ft = [...this.frameTimes].sort((a, b) => a - b);
    return {
      lens: this.lens,
      divider: this.divider,
      cam: { ...this.cam },
      transforms: {
        today: this.transforms.today ? Array.from(this.transforms.today.toFloat64Array()) : null,
        future: this.transforms.future ? Array.from(this.transforms.future.toFloat64Array()) : null,
      },
      frameMs: { p50: ft[Math.floor(ft.length * 0.5)] ?? 0, p95: ft[Math.floor(ft.length * 0.95)] ?? 0, n: ft.length },
      heatLevel: this.heatLevel,
      peek: !!this.peek,
      anims: this.anims.size,
      future: {
        outdoor: this.worlds.future.outdoorCount(),
        cars: this.worlds.future.plan.carsEast + this.worlds.future.plan.carsWest,
        cyclists: this.worlds.future.plan.cyclists,
        courtShade: this.worlds.future.countIn("court-shade"),
        terrace: this.worlds.future.countIn("terrace"),
      },
      today: {
        outdoor: this.worlds.today.outdoorCount(),
        cars: this.worlds.today.plan.carsEast + this.worlds.today.plan.carsWest,
      },
    };
  }
}

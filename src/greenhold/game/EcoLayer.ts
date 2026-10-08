/**
 * Eco Vision: an environmental X-ray of the town, drawn from the simulation.
 *
 * - The ground heat-map is the air-pollution grid itself (brown = dirty air),
 *   with plants' clean-up shown in green.
 * - Plumes start at chimneys and busy roads, drift with the simulated wind at
 *   the speed the air grid moves, thin out as the grid's pollution does, and
 *   are cleaned by plants they pass over at the rate the simulation uses.
 * - Power lines show a simple dispatch of the town's power (see model/eco).
 * - Each home shows where its power comes from, and a brown cuff of smog when
 *   the air there is above the "OK" line.
 */
import Phaser from "phaser";
import { piece } from "../model/pieces";
import { AIR_OK, AIR_TIME, airInputs, windVector, type Env } from "../model/sim";
import { powerNetwork, type PowerKind, type PowerLink, type PowerSource } from "../model/eco";
import { N, PAVED, idx, inside, top, xy } from "../model/world";
import type { GameStore } from "../state/store";
import { BH, P, RES, type Art } from "./art";

const HEAT_DEPTH = -60000;
const LINE_DEPTH = -59000;
const PLUME_DEPTH = 900000 - 5;
const MARK_DEPTH = 900000 + 2;
export const ECO_COLORS = { clean: 0x7ff5d0, coal: 0xf0a060, none: 0xa0a4a8, smog: 0x5a4434, plant: 0x7fdc98 };
/** Heat layer: exposed (warm) and shaded (cool) homes. */
const HEAT_COLORS = { exposed: 0xef7a4a, partly: 0xf2b25a, shaded: 0x6cd6c8 };
/** How fast power pulses travel along the lines, in tiles per second. */
const PULSE_SPEED = 2.6;
const MAX_PLUMES = 320;
const MAX_MOTES = 60;
/** How fast the Eco Pulse's clearing spreads out from the closed plant (seconds per tile), and how long each tile takes. */
const FRONT_DELAY = 0.06;
const FRONT_EASE = 0.9;

interface Plume {
  img: Phaser.GameObjects.Image;
  gx: number;
  gy: number;
  z: number;
  age: number;
  life: number;
  kind: "coal" | "road";
  seed: number;
  /** How much of it is left after plants have cleaned it (1 = all). */
  left: number;
  /** Seconds since its chimney closed (0 = still open): it hurries off downwind and fades. */
  flush: number;
  /** When its chimney closed (performance.now), so it clears on time even on slow devices. */
  flushAt?: number;
}

interface Mote {
  img: Phaser.GameObjects.Image;
  gx: number;
  gy: number;
  z: number;
  age: number;
  life: number;
  tint: number;
}

export interface EcoHost {
  scene: Phaser.Scene;
  store: GameStore;
  art: Art;
  reduced: boolean;
  /** Ground-centre position of the top of a column, in world px. */
  roofOf: (i: number) => { x: number; y: number };
}

function polyline(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[], close: boolean) {
  g.beginPath();
  pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  if (close) g.closePath();
}

const lerpColor = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t)) << s;
  return ch(16) | ch(8) | ch(0);
};

export class EcoLayer {
  /** 0 = off, 1 = fully on (fades between). */
  vis = 0;
  /**
   * The air as drawn: the simulation's air, except during an Eco Pulse, when
   * the clearing spreads outward from the closed plant.
   */
  readonly airShown = new Float32Array(N * N);
  private heatTex!: Phaser.Textures.CanvasTexture;
  private heat!: Phaser.GameObjects.Container;
  private roadsG!: Phaser.GameObjects.Graphics;
  private linesG!: Phaser.GameObjects.Graphics;
  private links: PowerLink[] = [];
  private sources: PowerSource[] = [];
  private fading: { links: PowerLink[]; a: number } | null = null;
  private maxDepth = 1;
  private grow = 1;
  private drawnGrow = -1;
  private pulses: Phaser.GameObjects.Image[] = [];
  private sourceGlow: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private plantGlow = new Map<number, Phaser.GameObjects.Image>();
  private bolts = new Map<number, Phaser.GameObjects.Image>();
  private cuffs = new Map<number, Phaser.GameObjects.Image>();
  private plumes: Plume[] = [];
  private motes: Mote[] = [];
  private plants: number[] = [];
  private clean = new Float32Array(N * N);
  private roadPick: { i: number; w: number }[] = [];
  private roadTotal = 0;
  private spawnCoal = 0;
  private spawnRoad = 0;
  private spawnMote = 0;
  private lastNet = 0;
  private netDirty = true;
  private fedMap = new Map<number, PowerKind | "none">();
  private pulse: { at: { x: number; y: number }; before: Float32Array; t: number } | null = null;
  /** 0..1: how far the ground map has switched to the heat layer (during a heatwave). */
  heatMix = 0;
  private lastCool: Float32Array | null = null;
  /** Tiles in or next to the built-up town (where heat builds up). */
  readonly urban = new Uint8Array(N * N);

  constructor(private h: EcoHost) {
    const { scene } = h;
    if (scene.textures.exists("eco-heat")) scene.textures.remove("eco-heat");
    const tex = scene.textures.createCanvas("eco-heat", N, N);
    if (!tex) throw new Error("Eco Vision: no canvas texture");
    this.heatTex = tex;
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    // One texture pixel per tile, laid onto the diamond map: rotate 45°, then squash vertically.
    const s = 32 * Math.SQRT2;
    const img = scene.add.image(0, 0, "eco-heat").setOrigin(0, 0).setScale(s).setRotation(Math.PI / 4);
    const o = P(-0.5, -0.5);
    this.heat = scene.add.container(o.x, o.y, [img]).setScale(1, 0.5).setDepth(HEAT_DEPTH).setAlpha(0).setVisible(false);
    this.roadsG = scene.add.graphics().setDepth(HEAT_DEPTH + 1).setAlpha(0).setVisible(false);
    this.linesG = scene.add.graphics().setDepth(LINE_DEPTH).setAlpha(0).setVisible(false);
    this.airShown.set(h.store.sim.air);
    this.findUrban();
  }

  get on() {
    return this.h.store.ecoVision;
  }

  /** The town changed: re-route power, re-find roads and plants. */
  townChanged() {
    this.netDirty = true;
    this.findUrban();
  }

  /** True while the ground map is fading between the air and heat layers. */
  get changing() {
    return this.heatMix > 0.001 && this.heatMix < 0.999;
  }

  /** The built-up town and 2 tiles around it: where roads and roofs soak up the sun. */
  findUrban() {
    const t = this.h.store.town;
    this.urban.fill(0);
    t.cols.forEach((c, i) => {
      const built = PAVED.includes(c.g) || c.g === "rail" || c.s.some((id) => piece(id).kind !== "nature" && !piece(id).fixed);
      if (!built) return;
      const { x, y } = xy(i);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inside(x + dx, y + dy)) this.urban[idx(x + dx, y + dy)] = 1;
    });
  }

  /** Eco Pulse: a polluting chimney at `i` closed. Its smoke hurries off and the air clears outward from it. */
  chimneyClosed(i: number) {
    const now = performance.now();
    for (const p of this.plumes)
      if (p.kind === "coal" && !p.flushAt) {
        p.flushAt = now;
        p.flush = 0.001;
      }
    this.pulse = { at: xy(i), before: new Float32Array(this.airShown), t: 0 };
  }

  pulseEnded() {
    this.pulse = null;
    this.airShown.set(this.h.store.sim.air);
  }

  /** Follows the simulation's air (with the Eco Pulse's spreading front while one runs). */
  private followAir() {
    const air = this.h.store.sim.air;
    const pl = this.pulse;
    if (!pl) {
      this.airShown.set(air);
      return;
    }
    for (let i = 0; i < N * N; i++) {
      const x = i % N;
      const y = (i - x) / N;
      const k = Phaser.Math.Clamp((pl.t - Math.hypot(x - pl.at.x, y - pl.at.y) * FRONT_DELAY) / FRONT_EASE, 0, 1);
      const e = k * k * (3 - 2 * k);
      // Between the air before the pulse and the air now, never outside them.
      const v = pl.before[i] + (air[i] - pl.before[i]) * e;
      this.airShown[i] = Math.min(Math.max(air[i], pl.before[i]), Math.max(Math.min(air[i], pl.before[i]), v));
    }
  }

  // ------------------------------------------------------------------ slow refresh
  /** Recomputes the heat-map, roads and markers (twice a second, ten times a second during a pulse). */
  refresh() {
    this.followAir();
    if (this.vis <= 0) return;
    const t = this.h.store.town;
    const s = this.h.store.sim.stats;
    const air = this.airShown;
    this.clean = airInputs(t, s).clean;
    // Plants clean the air passing over them; show it a tile around each one.
    const green = new Float32Array(N * N);
    const plants: number[] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const c = this.clean[idx(x, y)];
        if (!c) continue;
        plants.push(idx(x, y));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) green[idx(x + dx, y + dy)] += c * (dx || dy ? 0.5 : 1);
      }
    this.plants = plants;
    if (s.heat.cool) this.lastCool = s.heat.cool;
    const cool = this.heatMix > 0 ? this.lastCool : null;
    const hm = this.heatMix;
    const ctx = this.heatTex.getContext();
    const data = ctx.getImageData(0, 0, N, N);
    const px = data.data;
    for (let i = 0; i < N * N; i++) {
      const pol = Phaser.Math.Clamp((air[i] - 1.5) / 28, 0, 1);
      const g = Phaser.Math.Clamp(green[i] / 0.5, 0, 1) * (1 - 0.6 * pol);
      // Pollution: sand-amber when light, deep brown when thick.
      const pa = 0.72 * Math.pow(pol, 0.65);
      const pr = 222 - 96 * pol;
      const pg = 166 - 110 * pol;
      const pb = 90 - 56 * pol;
      const ga = 0.5 * g;
      // Green under, pollution over.
      const a = pa + ga * (1 - pa);
      const mixc = (cp: number, cg: number) => (a > 0 ? (cp * pa + cg * ga * (1 - pa)) / a : 0);
      px[i * 4] = mixc(pr, 104);
      px[i * 4 + 1] = mixc(pg, 226);
      px[i * 4 + 2] = mixc(pb, 140);
      px[i * 4 + 3] = a * 255;
      if (cool) {
        // Heat layer: warm where the town has no shade, blue-green where trees, parks and water cool it.
        const wet = t.cols[i].g === "water" || t.cols[i].g === "reservoir";
        const shade = Math.min(1, cool[i]);
        const paved = PAVED.includes(t.cols[i].g) || t.cols[i].s.length > 0;
        const hot = wet ? 0 : this.urban[i] * (1 - shade) * (paved ? 1 : 0.8);
        const ha = 0.5 * hot;
        const ca = 0.42 * Math.max(shade, wet ? 0.6 : 0) * (1 - hot);
        const ah = ha + ca * (1 - ha);
        const mixh = (ch: number, cc: number) => (ah > 0 ? (ch * ha + cc * ca * (1 - ha)) / ah : 0);
        const hr = mixh(244 - 18 * hot, 108);
        const hg = mixh(182 - 86 * hot, 206);
        const hb = mixh(98 - 34 * hot, 204);
        px[i * 4] += (hr - px[i * 4]) * hm;
        px[i * 4 + 1] += (hg - px[i * 4 + 1]) * hm;
        px[i * 4 + 2] += (hb - px[i * 4 + 2]) * hm;
        px[i * 4 + 3] += (ah * 255 - px[i * 4 + 3]) * hm;
      }
    }
    ctx.putImageData(data, 0, 0);
    this.heatTex.refresh();

    // Plants: a soft green glow under each, as strong as it cleans.
    const keep = new Set(plants);
    for (const [k, img] of this.plantGlow)
      if (!keep.has(k)) {
        img.destroy();
        this.plantGlow.delete(k);
      }
    for (const i of plants) {
      if (this.plantGlow.has(i) || this.plantGlow.size > 500) continue;
      const { x, y } = xy(i);
      const p = P(x, y);
      const r = 0.7 + Math.min(1, this.clean[i] / 0.6) * 0.6;
      this.plantGlow.set(i, this.h.scene.add.image(p.x, p.y, "fx-glow").setScale((r * 1.6) / RES, (r * 0.8) / RES).setTint(ECO_COLORS.plant).setBlendMode(Phaser.BlendModes.ADD).setDepth(HEAT_DEPTH + 2).setAlpha(0));
    }

    // Roads, shaded by how much exhaust they carry.
    this.roadsG.clear();
    this.roadPick = [];
    this.roadTotal = 0;
    t.cols.forEach((c, i) => {
      if (c.g !== "road") return;
      const v = s.traffic[i];
      if (v <= 0.02) return;
      this.roadPick.push({ i, w: v });
      this.roadTotal += v;
    });
    for (const r of this.roadPick) {
      const { x, y } = xy(r.i);
      const k = Phaser.Math.Clamp(r.w / 2, 0, 1);
      this.roadsG.fillStyle(0x8a4a22, 0.16 + 0.5 * k);
      polyline(this.roadsG, [P(x - 0.4, y - 0.4), P(x + 0.4, y - 0.4), P(x + 0.4, y + 0.4), P(x - 0.4, y + 0.4)], true);
      this.roadsG.fillPath();
    }

    // Homes: where the power comes from, and smog where the air is bad.
    const net = this.net();
    const seen = new Set<number>();
    for (const hIdx of s.homes) {
      seen.add(hIdx);
      const roof = this.h.roofOf(hIdx);
      const fed = net.get(hIdx) ?? "none";
      let b = this.bolts.get(hIdx);
      if (!b) {
        b = this.h.scene.add.image(0, 0, "eco-bolt").setScale(0.95 / RES).setDepth(MARK_DEPTH + 1);
        this.bolts.set(hIdx, b);
      }
      b.setPosition(roof.x - 2, roof.y - 14).setTint(ECO_COLORS[fed]).setData("a", fed === "none" ? 0.65 : 1).setVisible(true);
      // Beside the power badge: in a heatwave, how hot the home is; otherwise a small brown cloud if the air is smoggy.
      const sh = this.heatMix > 0.5 ? s.heat.shade.get(hIdx) : undefined;
      const dirt = sh ? 1 : air[hIdx] >= AIR_OK ? Phaser.Math.Clamp(0.55 + (air[hIdx] - AIR_OK) / 30, 0.55, 1) : 0;
      let cuff = this.cuffs.get(hIdx);
      if (!cuff && dirt > 0) {
        cuff = this.h.scene.add.image(0, 0, "eco-smog").setScale(0.95 / RES).setDepth(MARK_DEPTH).setAlpha(0);
        this.cuffs.set(hIdx, cuff);
      }
      if (cuff) {
        if (sh) cuff.setTexture(sh === "shaded" ? "eco-leaf" : "eco-therm").setTint(HEAT_COLORS[sh]);
        else cuff.setTexture("eco-smog").clearTint();
        cuff.setPosition(roof.x + 13, roof.y - 12).setData("target", dirt).setVisible(true);
      }
    }
    for (const [k, b] of this.bolts) if (!seen.has(k)) b.setVisible(false);
    for (const [k, c] of this.cuffs) if (!seen.has(k)) c.setData("target", 0);
    this.placeLabels();
  }

  private net() {
    const now = this.h.scene.time.now;
    if (this.netDirty || now - this.lastNet > 4000) {
      this.netDirty = false;
      this.lastNet = now;
      const net = powerNetwork(this.h.store.town, this.h.store.sim.stats);
      const key = (l: PowerLink[]) => l.map((x) => `${x.a}-${x.b}-${x.kind}`).join(",");
      if (key(net.links) !== key(this.links)) {
        // Lines that are going away fade out; the new network draws outward from its sources.
        const gone = this.links.filter((l) => !net.links.some((n) => n.a === l.a && n.b === l.b && n.kind === l.kind));
        if (gone.length) this.fading = { links: gone, a: 1 };
        this.links = net.links.slice(0, 160);
        this.maxDepth = Math.max(1, ...this.links.map((l) => l.depth));
        this.grow = this.h.reduced ? 1 : 0;
        this.drawnGrow = -1;
      }
      this.fedMap = net.fed;
      this.sources = net.sources;
      // Soft glows under the power stations.
      this.sourceGlow.forEach((g) => g.destroy());
      this.sourceGlow = net.sources.map((src) => {
        const { x, y } = xy(src.i);
        const p = P(x, y);
        return this.h.scene.add
          .image(p.x, p.y, "fx-glow")
          .setScale(2.2 / RES, 1.1 / RES)
          .setTint(ECO_COLORS[src.kind])
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(LINE_DEPTH + 1)
          .setAlpha(0);
      });
    }
    return this.fedMap;
  }

  /** A small tag over each group of power stations: what they are and how many homes they power. */
  private placeLabels() {
    const t = this.h.store.town;
    const homes = new Set(this.h.store.sim.stats.homes);
    const nameOf = (src: PowerSource) => {
      const id = top(t.cols[src.i])?.id;
      return id === "wind" ? "Wind" : id === "solar" ? "Solar" : id === "hydro" || id === "dam" ? "Hydro" : src.kind === "coal" ? "Coal" : "Power";
    };
    // Neighbouring turbines (or panels) share one tag.
    const groups: { name: string; kind: PowerKind; served: number; at: number[] }[] = [];
    for (const src of this.sources) {
      if (homes.has(src.i)) continue;
      const name = nameOf(src);
      const p = xy(src.i);
      const g = groups.find((x) => x.name === name && x.at.some((a) => Math.max(Math.abs(xy(a).x - p.x), Math.abs(xy(a).y - p.y)) <= 3));
      if (g) {
        g.served += src.served;
        g.at.push(src.i);
      } else groups.push({ name, kind: src.kind, served: src.served, at: [src.i] });
    }
    const list = groups.slice(0, 10);
    while (this.labels.length < list.length)
      this.labels.push(
        this.h.scene.add
          .text(0, 0, "", { fontFamily: "Nunito, system-ui, sans-serif", fontSize: "20px", fontStyle: "800", color: "#ffffff", backgroundColor: "rgba(14,30,28,0.82)", padding: { x: 10, y: 5 } })
          .setOrigin(0.5, 1)
          .setScale(0.5)
          .setDepth(MARK_DEPTH + 3),
      );
    this.labels.forEach((l, k) => {
      const g = list[k];
      if (!g) return void l.setVisible(false).setData("on", false);
      // Over the middle of the group, above its tallest piece.
      const mid = g.at.reduce((m, a) => ({ x: m.x + this.h.roofOf(a).x / g.at.length, y: Math.min(m.y, this.h.roofOf(a).y) }), { x: 0, y: Infinity });
      const tall = g.name === "Wind" ? 64 : g.name === "Coal" ? 70 : 26;
      const what = g.name === "Wind" && g.at.length > 1 ? "Wind farm" : g.name;
      const text = g.served ? `${what} · ${g.served} ${g.served === 1 ? "home" : "homes"}` : g.kind === "coal" ? `${what} · not needed, still burning` : `${what} · spare power`;
      l.setText(text)
        .setColor(g.kind === "clean" ? "#9ff8dc" : "#ffc48a")
        .setPosition(mid.x, mid.y - tall)
        .setData("on", true)
        .setVisible(true);
    });
  }

  // ------------------------------------------------------------------ power lines
  /** Grid cables: along x, then along y, a little above the ground. */
  private path(l: PowerLink) {
    const a = xy(l.a);
    const b = xy(l.b);
    return { a, b, len: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) };
  }

  private pointOn(l: PowerLink, d: number) {
    const { a, b, len } = this.path(l);
    const dxl = Math.abs(b.x - a.x);
    const k = Math.min(len, Math.max(0, d));
    if (k <= dxl) return P(a.x + Math.sign(b.x - a.x) * k, a.y, 2);
    return P(b.x, a.y + Math.sign(b.y - a.y) * (k - dxl), 2);
  }

  private drawLines() {
    const g = this.linesG;
    g.clear();
    const reach = this.grow * (this.maxDepth + 1);
    const stroke = (l: PowerLink, frac: number, alpha: number) => {
      const { len, a, b } = this.path(l);
      if (len === 0 || frac <= 0) return;
      const pts = [this.pointOn(l, 0)];
      const dxl = Math.abs(b.x - a.x);
      if (frac * len > dxl && dxl > 0) pts.push(this.pointOn(l, dxl));
      pts.push(this.pointOn(l, frac * len));
      const clean = l.kind === "clean";
      g.lineStyle(clean ? 6 : 5, ECO_COLORS[l.kind], alpha * (clean ? 0.22 : 0.16));
      polyline(g, pts, false);
      g.strokePath();
      g.lineStyle(clean ? 1.8 : 1.5, ECO_COLORS[l.kind], alpha * 0.9);
      polyline(g, pts, false);
      g.strokePath();
    };
    for (const l of this.links) stroke(l, Phaser.Math.Clamp(reach - (l.depth - 1), 0, 1), 1);
    if (this.fading) for (const l of this.fading.links) stroke(l, 1, this.fading.a);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, time: number, e: Env) {
    // The clearing front keeps time with the store's air time-lapse (real time), so they stay in step on slow devices.
    if (this.pulse) this.pulse.t = this.h.store.pulse ? (performance.now() - this.h.store.pulse.start) / 1000 : this.pulse.t + dt;
    // The ground map turns into the heat layer over a few seconds when a heatwave is forecast, and back after.
    const heatOn = this.h.store.sim.stats.heat.phase !== "none" ? 1 : 0;
    if (this.heatMix !== heatOn) this.heatMix = heatOn > this.heatMix ? Math.min(1, this.heatMix + dt / 3) : Math.max(0, this.heatMix - dt / 4);
    const target = this.on ? 1 : 0;
    if (this.vis !== target) {
      const step = this.h.reduced ? 1 : dt / 0.35;
      const was = this.vis;
      this.vis = target > this.vis ? Math.min(1, this.vis + step) : Math.max(0, this.vis - step);
      const showing = this.vis > 0;
      this.heat.setVisible(showing);
      this.roadsG.setVisible(showing);
      this.linesG.setVisible(showing);
      if (was === 0 && showing) {
        this.netDirty = true;
        this.refresh();
      }
    }
    this.heat.setAlpha(this.vis);
    this.roadsG.setAlpha(this.vis);
    this.linesG.setAlpha(this.vis);
    for (const g of this.sourceGlow) g.setAlpha(0.5 * this.vis).setVisible(this.vis > 0);
    for (const [i, g] of this.plantGlow) g.setAlpha(0.32 * Math.min(1, this.clean[i] / 0.45) * this.vis).setVisible(this.vis > 0);
    for (const l of this.labels) l.setAlpha(this.vis).setVisible(this.vis > 0 && l.getData("on") === true);
    if (this.vis <= 0) {
      for (const b of this.bolts.values()) b.setVisible(false);
      for (const c of this.cuffs.values()) c.setVisible(false).setAlpha(0);
      this.clearParticles();
      return;
    }
    for (const b of this.bolts.values()) if (b.visible) b.setAlpha(((b.getData("a") as number) ?? 1) * this.vis);
    for (const c of this.cuffs.values()) {
      const tgt = ((c.getData("target") as number) ?? 0) * this.vis;
      c.setAlpha(c.alpha + (tgt - c.alpha) * Math.min(1, dt * 2.5));
      c.setVisible(c.alpha > 0.01);
    }

    // Power lines grow outward, old ones fade, pulses flow from the stations.
    if (this.grow < 1) this.grow = Math.min(1, this.grow + dt / 0.9);
    if (this.fading) {
      this.fading.a -= dt / 0.7;
      if (this.fading.a <= 0) this.fading = null;
    }
    if (this.grow !== this.drawnGrow || this.fading) {
      this.drawnGrow = this.grow;
      this.drawLines();
    }
    this.updatePulses(time);
    this.updatePlumes(dt, e);
    this.updateMotes(dt, e);
  }

  /** Each link carries a bright pulse with a short tail, all moving at one steady speed. */
  private updatePulses(time: number) {
    const TRAIL = 3;
    const want = this.h.reduced ? 0 : this.links.length * TRAIL;
    while (this.pulses.length < want) this.pulses.push(this.h.scene.add.image(0, 0, "eco-dot").setBlendMode(Phaser.BlendModes.ADD).setDepth(LINE_DEPTH + 2));
    const reach = this.grow * (this.maxDepth + 1);
    this.pulses.forEach((img, n) => {
      const k = Math.floor(n / TRAIL);
      const tail = n % TRAIL;
      const l = this.links[k];
      if (!l || n >= want || reach < l.depth) return void img.setVisible(false);
      const { len } = this.path(l);
      if (!len) return void img.setVisible(false);
      const run = len / PULSE_SPEED;
      const cycle = run + 0.7;
      const ph = (((time / 1000 + l.depth * 0.35) % cycle) - tail * 0.07) / run;
      if (ph < 0 || ph > 1) return void img.setVisible(false);
      const p = this.pointOn(l, ph * len);
      const fade = Math.min(1, ph * 6, (1 - ph) * 6) * (1 - tail * 0.35);
      img
        .setPosition(p.x, p.y)
        .setScale((tail ? 0.5 : 0.8) / RES)
        .setTint(ECO_COLORS[l.kind])
        .setAlpha(fade * this.vis)
        .setVisible(true);
    });
  }

  // ------------------------------------------------------------------ plumes
  private airAt(gx: number, gy: number) {
    const x = Math.round(gx);
    const y = Math.round(gy);
    return inside(x, y) ? this.airShown[idx(x, y)] : 0;
  }

  private addPlume(gx: number, gy: number, z: number, kind: Plume["kind"]) {
    if (this.plumes.length >= MAX_PLUMES) return;
    const img = this.h.scene.add.image(0, 0, "fx-smog").setDepth(PLUME_DEPTH).setAlpha(0);
    this.plumes.push({ img, gx, gy, z, age: 0, life: kind === "coal" ? 11 + Math.random() * 4 : 3 + Math.random() * 1.5, kind, seed: Math.random() * 100, left: 1, flush: 0 });
  }

  private clearParticles() {
    this.plumes.forEach((p) => p.img.destroy());
    this.plumes = [];
    this.motes.forEach((m) => m.img.destroy());
    this.motes = [];
  }

  private updatePlumes(dt: number, e: Env) {
    if (this.h.reduced) return;
    const t = this.h.store.town;
    const w = windVector(t.clock, e.wind);
    // The plume drifts as fast as the air grid moves.
    const vx = w.x * AIR_TIME;
    const vy = w.y * AIR_TIME;
    // Chimneys.
    this.spawnCoal += dt;
    if (this.spawnCoal > 0.1) {
      this.spawnCoal = 0;
      t.cols.forEach((c, i) => {
        const tp = top(c);
        if (!tp || !piece(tp.id).emit) return;
        const spots = this.h.art.smoke.get(tp.id) ?? [{ x: 0, y: -60 }];
        const { x, y } = xy(i);
        const level = c.s.length - 1;
        for (const s of spots) {
          // Back from screen px (relative to the tile centre) to tile coordinates plus a height.
          const off = s.x / 64;
          this.addPlume(x + off + (Math.random() - 0.5) * 0.12, y - off + (Math.random() - 0.5) * 0.12, -s.y + level * BH, "coal");
        }
      });
    }
    // Busy roads: pick roads by how much traffic they carry.
    this.spawnRoad += dt;
    if (this.spawnRoad > 0.08 && this.roadPick.length) {
      this.spawnRoad = 0;
      let r = Math.random() * this.roadTotal;
      const road = this.roadPick.find((x) => (r -= x.w) <= 0) ?? this.roadPick[0];
      if (Math.random() < Phaser.Math.Clamp(road.w / 1.4, 0.2, 1)) {
        const { x, y } = xy(road.i);
        this.addPlume(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, 4, "road");
      }
    }
    for (let k = this.plumes.length - 1; k >= 0; k--) {
      const p = this.plumes[k];
      p.age += dt;
      const hurry = p.flush > 0 ? 2.8 : 1;
      if (p.flushAt) p.flush = Math.max(0.001, (performance.now() - p.flushAt) / 1000);
      // Wind plus a little sideways turbulence.
      const wob = Math.sin(p.age * 1.3 + p.seed) * 0.12;
      p.gx += (vx * hurry - vy * wob) * dt;
      p.gy += (vy * hurry + vx * wob) * dt;
      if (p.kind === "coal") {
        // Hot smoke rises at first, then settles toward roof height as it cools.
        p.z += (p.age < 1.6 ? 14 : (26 - p.z) * 0.16) * dt;
      } else p.z += 3 * dt;
      const tx = Math.round(p.gx);
      const ty = Math.round(p.gy);
      if (!inside(tx, ty)) {
        p.img.destroy();
        this.plumes.splice(k, 1);
        continue;
      }
      // Plants underneath take a share out, at the rate the simulation's plants clean the air.
      const c = this.clean[idx(tx, ty)];
      if (c > 0 && p.z < 60) {
        p.left *= Math.exp(-c * 0.25 * AIR_TIME * dt);
        if (Math.random() < dt * 1.2 * c) this.addMote(p.gx, p.gy, p.z, 0xe6fff0);
      }
      const local = this.airAt(p.gx, p.gy);
      const thin = Phaser.Math.Clamp(0.35 + (0.65 * local) / (p.kind === "coal" ? 24 : 12), 0.35, 1);
      const fadeIn = Math.min(1, p.age / 0.5);
      const fadeOut = Math.min(1, (p.life - p.age) / 2.5, p.flush > 0 ? 1 - p.flush / 1.3 : 1);
      if (p.age >= p.life || fadeOut <= 0 || p.left < 0.08 || (p.age > 3 && local < 0.8)) {
        p.img.destroy();
        this.plumes.splice(k, 1);
        continue;
      }
      const pos = P(p.gx, p.gy, p.z);
      const grow = Math.min(1, p.age / 8);
      // Once the chimney closes, what's left spreads thin as it blows away.
      const size = (p.kind === "coal" ? 0.3 + grow * 1.0 : 0.16 + p.age * 0.08) * (1 + p.flush * 0.8);
      const base = p.kind === "coal" ? 0.62 : 0.42;
      // Fresh smoke is dark; it greys as it spreads, and goes pale as plants clean it.
      const tint = lerpColor(p.kind === "coal" ? lerpColor(0x3f3229, 0x6e5d4e, grow) : 0x6b6058, 0xdfeee0, (1 - p.left) * 0.7);
      p.img
        .setPosition(pos.x, pos.y)
        .setScale(size / RES, (size * 0.65) / RES)
        .setTint(tint)
        .setAlpha(base * thin * p.left * fadeIn * fadeOut * this.vis);
    }
  }

  // ------------------------------------------------------------------ air through the trees
  private addMote(gx: number, gy: number, z: number, tint: number) {
    if (this.motes.length >= MAX_MOTES || this.h.reduced) return;
    const img = this.h.scene.add.image(0, 0, "eco-dot").setBlendMode(Phaser.BlendModes.ADD).setDepth(PLUME_DEPTH + 1).setAlpha(0);
    this.motes.push({ img, gx, gy, z, age: 0, life: 2.4 + Math.random(), tint });
  }

  /** Fresh air coming off the trees, drifting downwind. */
  private updateMotes(dt: number, e: Env) {
    if (this.h.reduced) return;
    const w = windVector(this.h.store.town.clock, e.wind);
    this.spawnMote += dt;
    if (this.spawnMote > 0.09 && this.plants.length) {
      this.spawnMote = 0;
      const i = this.plants[Math.floor(Math.random() * this.plants.length)];
      const { x, y } = xy(i);
      this.addMote(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, 10 + Math.random() * 18, Math.random() < 0.5 ? 0xe6fff0 : ECO_COLORS.plant);
    }
    for (let k = this.motes.length - 1; k >= 0; k--) {
      const m = this.motes[k];
      m.age += dt;
      if (m.age >= m.life) {
        m.img.destroy();
        this.motes.splice(k, 1);
        continue;
      }
      m.gx += w.x * AIR_TIME * dt;
      m.gy += w.y * AIR_TIME * dt;
      m.z += 2.5 * dt;
      const pos = P(m.gx, m.gy, m.z);
      const a = Math.sin((m.age / m.life) * Math.PI) * 0.75 * this.vis;
      m.img.setPosition(pos.x, pos.y).setTint(m.tint).setScale(0.5 / RES).setAlpha(a);
    }
  }
}

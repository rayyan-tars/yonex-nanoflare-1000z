import Phaser from "phaser";
import { PIECES, piece, type PieceDef } from "../model/pieces";
import { env, windAngle, type Env } from "../model/sim";
import { EcoLayer } from "./EcoLayer";
import { N, PAVED, TOWN_HALL, canPlace, idx, inside, removeInfo, top, xy, type Column } from "../model/world";
import type { GameStore } from "../state/store";
import { Art, BH, P, RES } from "./art";
import { CAR_TYPES, LOOKS, type Dir } from "./artAgents";

export interface SceneDeps {
  store: GameStore;
  resolution: number;
  reduced: boolean;
  onReady: () => void;
  onError: (e: unknown) => void;
}

/** Shop pictures: each buyable piece's texture as an image URL. */
function previews(scene: Phaser.Scene) {
  const out: Record<string, string> = {};
  for (const p of PIECES) {
    if (p.unlock >= 99) continue;
    const ground: Record<string, string> = { road: "g-road-3", rail: "g-rail-3", grass: "g-grass-0", field: "g-field-2" };
    const key = p.kind === "ground" ? (ground[p.id] ?? `g-${p.id}`) : texFor(p);
    const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    if (src && typeof src.toDataURL === "function") out[p.id] = src.toDataURL();
  }
  return out;
}

interface Part {
  id: string;
  img: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  extras: Phaser.GameObjects.Image[];
}

interface Agent {
  img: Phaser.GameObjects.Image;
  /** Headlight glow (cars at night). */
  light?: Phaser.GameObjects.Image;
  from: number;
  to: number;
  t: number;
  speed: number;
  kind: "car" | "bus" | "walker" | "bike" | "train" | "truck";
  /** Car type, or which person it is. */
  look: string | number;
  /** Walking animation. */
  step: number;
  frame: 0 | 1;
  /** Which side of the street a pedestrian keeps to (-1 or 1). */
  side: number;
  /** Walkers moving into a home walk straight there, then vanish. */
  target?: { x: number; y: number };
  sx?: number;
  sy?: number;
  puff?: number;
  /** People stepping out of their homes: the pavement tile they join the street at. */
  join?: number;
}

const GROUND_DEPTH = -100000;
const OVERLAY_DEPTH = -50000;
const SMOG_DEPTH = 900000;
const UI_DEPTH = 950000;
const MAX_LEVEL = 12;
/** Places people like to walk to: walkers gather near them. */
const DESTINATIONS = ["cafe", "shop", "school", "market", "park", "playground", "fountain", "library", "clinic", "shopfront", "bench"];
const ADULTS = LOOKS.map((l, i) => (l.kid ? -1 : i)).filter((i) => i >= 0);
const KIDS = LOOKS.map((l, i) => (l.kid ? i : -1)).filter((i) => i >= 0);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const dirOf = (dx: number, dy: number): Dir => (dx > 0 ? "xp" : dx < 0 ? "xn" : dy > 0 ? "yp" : "yn");

const colDepth = (x: number, y: number) => (x + y) * 40 + 1000;
/** Eco Vision dims the world toward this so the flows read clearly. */
const DIM = 0x6c7a88;
/** Grass and trees in dirty air look tired: dull and yellowed. */
const STRESSED = 0xc9b27a;
/** Sun-scorched grass in a heatwave, where the town has no shade. */
const DRY = 0xd9bf78;
/** Warm, strong sunlight in a heatwave. */
const HEAT_LIGHT = 0xffd9a6;
const stressOf = (air: number) => Phaser.Math.Clamp((air - 5) / 25, 0, 1) * 0.6;
/** Crops grow through three stages; fields nearby are a little out of step. */
const fieldStage = (clock: number, x: number, y: number) => Math.floor(clock / 70 + ((x * 3 + y * 5) % 4) * 0.15) % 3;
const groundKey = (g: string, x: number, y: number) => (g === "road" ? "g-road-0" : g === "rail" ? "g-rail-0" : g === "field" ? "g-field-0" : g === "grass" ? `g-grass-${(x * 7 + y * 13) % 3}` : g === "water" ? `g-water-${(x + y) % 3}` : `g-${g}`);
export const texFor = (p: PieceDef) => (p.kind === "block" ? `b-${p.id}` : p.kind === "roof" ? `r-${p.id}` : p.kind === "nature" ? `n-${p.id}` : `m-${p.id}`);

export class WorldScene extends Phaser.Scene {
  private deps!: SceneDeps;
  private art!: Art;
  private store!: GameStore;
  private ground: Phaser.GameObjects.Image[] = [];
  private cols: Part[][] = [];
  private bars!: Phaser.GameObjects.Graphics;
  /** A brown haze over the whole view, as thick as the air is dirty where people live. */
  private haze!: Phaser.GameObjects.Rectangle;
  private ghost!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Image;
  private selRing!: Phaser.GameObjects.Image;
  private hovered = -1;
  private hoverLevel = 0;
  private agents: Agent[] = [];
  private roads: number[] = [];
  private walkTiles: number[] = [];
  private bikeTiles: number[] = [];
  private busyTiles: number[] = [];
  private railTiles: number[] = [];
  private edgeRoads: number[] = [];
  /** Falling rain, lightning and cloud shadows. */
  private rain: Phaser.GameObjects.Image[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private flash!: Phaser.GameObjects.Rectangle;
  private nextFlash = 0;
  private smog: { img: Phaser.GameObjects.Image; target: number; i: number; bx: number; by: number }[] = [];
  /** How far the smog has been blown off downwind by an Eco Pulse (px; settles back afterwards). */
  private smogDrift = 0;
  private coinBubble!: Phaser.GameObjects.Image;
  private badges: Phaser.GameObjects.Image[] = [];
  private thLabel!: Phaser.GameObjects.Text;
  private butterflies: Phaser.GameObjects.Image[] = [];
  private eco!: EcoLayer;
  /** Seconds into the current Eco Pulse (-1 when none). */
  private pulseT = -1;
  private lastFast = 0;
  private lastCull = { car: 0, bus: 0, walker: 0, bike: 0, train: 0, truck: 0 };
  /** Heat shimmer over sun-baked roads (a small reused pool). */
  private shimmer: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  private lastShimmer = 0;
  private offs: (() => void)[] = [];
  private keys = new Set<string>();
  private e: Env = env(0);
  /** The world's tint: time of day, weather, and the Eco Vision dimming. */
  private tintNow = 0xffffff;
  private zoomTarget = 1;
  private zoomAnchor: { sx: number; sy: number } | null = null;
  private vel = { x: 0, y: 0 };
  private drag: { id: number; x: number; y: number; moved: boolean; pan: boolean; painted: Set<number> } | null = null;
  private pinch: { d: number; z: number; mx: number; my: number } | null = null;
  private lastSlow = 0;
  private lastWater = 0;
  private waterFrame = 0;
  private lastSmoke = 0;
  private spaceDown = false;
  private needHover = true;
  private rev = -1;
  private ready = false;

  constructor() {
    super("world");
  }

  init(deps: SceneDeps) {
    this.deps = deps;
    this.store = deps.store;
  }

  create() {
    try {
      this.art = new Art(this);
      this.art.build();
      if (!Object.keys(this.store.previews).length) this.store.setPreviews(previews(this));
      this.buildWorld();
      this.setupCamera();
      this.setupInput();
      this.subscribe();
      this.syncSlow(true);
      this.ready = true;
      // The four corners of the view, as map tiles (fractional).
      this.store.viewTiles = () => {
        const v = this.cameras.main.worldView;
        return [
          [v.x, v.y],
          [v.right, v.y],
          [v.right, v.bottom],
          [v.x, v.bottom],
        ].map(([wx, wy]) => ({ x: (wy / 16 + wx / 32) / 2, y: (wy / 16 - wx / 32) / 2 }));
      };
      this.store.screenOf = (i) => {
        const { x, y } = xy(i);
        const p = P(x, y);
        const cam = this.cameras.main;
        return { x: ((p.x - cam.worldView.x) * cam.zoom) / this.res, y: ((p.y - cam.worldView.y) * cam.zoom) / this.res };
      };
      // Testing hook (only with ?debug in the address).
      if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { greenholdScene: WorldScene }).greenholdScene = this;
      this.deps.onReady();
    } catch (e) {
      console.error(e);
      this.deps.onError(e);
    }
  }

  // ------------------------------------------------------------------ world
  private put(key: string, wx: number, wy: number, depth: number) {
    const info = this.art.get(key);
    return this.add
      .image(wx, wy, key)
      .setOrigin(info.ox, info.oy)
      .setScale(1 / RES)
      .setDepth(depth);
  }

  private buildWorld() {
    const t = this.store.town;
    for (let i = 0; i < N * N; i++) {
      const { x, y } = xy(i);
      const p = P(x, y);
      this.ground[i] = this.put(groundKey(t.cols[i].g, x, y), p.x, p.y, GROUND_DEPTH + x + y);
      this.cols[i] = [];
    }
    for (let k = 0; k < N; k++) {
      const l = P(k, N - 1);
      this.put("edge-left", l.x, l.y, GROUND_DEPTH - 10);
      const r = P(N - 1, k);
      this.put("edge-right", r.x, r.y, GROUND_DEPTH - 10);
    }
    this.haze = this.add.rectangle(0, 0, 10, 10, 0x8a7653).setOrigin(0).setDepth(SMOG_DEPTH + 5).setAlpha(0);
    this.flash = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setDepth(SMOG_DEPTH + 7).setAlpha(0);
    for (let k = 0; k < 170; k++) this.rain.push(this.add.image(0, 0, "fx-rain").setScale(1 / RES).setDepth(SMOG_DEPTH + 6).setAlpha(0.55).setVisible(false).setRotation(0.25));
    for (let k = 0; k < 7; k++) {
      const p = P(Math.random() * N, Math.random() * N);
      this.clouds.push(this.add.image(p.x, p.y - 60, "fx-smog").setScale(5 / RES, 3 / RES).setTint(0x2a3440).setDepth(SMOG_DEPTH + 1).setAlpha(0));
    }
    this.bars = this.add.graphics().setDepth(UI_DEPTH + 10);
    this.ring = this.put("fx-ring", 0, 0, OVERLAY_DEPTH + 1).setVisible(false);
    this.selRing = this.put("fx-ring", 0, 0, OVERLAY_DEPTH + 2).setVisible(false).setTint(0xffe28a);
    this.ghost = this.add.image(0, 0, "fx-ring").setAlpha(0.65).setVisible(false).setScale(1 / RES);
    this.thLabel = this.add
      .text(0, 0, "", { fontFamily: "Fredoka, system-ui, sans-serif", fontSize: "22px", color: "#ffffff", stroke: "#2c5a3a", strokeThickness: 5 })
      .setOrigin(0.5)
      .setScale(0.5)
      .setDepth(UI_DEPTH);
    this.eco = new EcoLayer({
      scene: this,
      store: this.store,
      art: this.art,
      reduced: this.deps.reduced,
      roofOf: (i) => {
        const { x, y } = xy(i);
        return this.levelY(x, y, this.visualHeight(this.store.town.cols[i]));
      },
    });
    for (let i = 0; i < N * N; i++) {
      this.refreshGround(i);
      this.syncColumn(i, null);
    }
    // Smog blobs: one per 2×2 tiles, faded in where the air is dirty.
    for (let y = 0; y < N; y += 2)
      for (let x = 0; x < N; x += 2) {
        const p = P(x + 0.5, y + 0.5);
        const img = this.add.image(p.x, p.y - 34, "fx-smog").setScale(1.6 / RES).setDepth(SMOG_DEPTH).setTint(0x8f7f62).setAlpha(0);
        this.smog.push({ img, target: 0, i: idx(x, y), bx: p.x, by: p.y - 34 });
      }
    this.coinBubble = this.put("ui-coins", 0, 0, UI_DEPTH + 5).setVisible(false).setInteractive({ cursor: "pointer" });
    this.coinBubble.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.store.collect();
    });
    this.rebuildNetworks();
  }

  /** Re-picks a ground tile's texture (roads join up with their neighbours). */
  private refreshGround(i: number) {
    const { x, y } = xy(i);
    const g = this.store.town.cols[i].g;
    if (g === "road" || g === "rail") {
      const r = (dx: number, dy: number) => inside(x + dx, y + dy) && this.store.town.cols[idx(x + dx, y + dy)].g === g;
      const m = (r(1, 0) ? 1 : 0) | (r(-1, 0) ? 2 : 0) | (r(0, 1) ? 4 : 0) | (r(0, -1) ? 8 : 0);
      this.ground[i].setTexture(`g-${g}-${m}`);
    } else if (g === "field") this.ground[i].setTexture(`g-field-${fieldStage(this.store.town.clock, x, y)}`);
    else this.ground[i].setTexture(groundKey(g, x, y));
  }

  private levelY(x: number, y: number, level: number) {
    const p = P(x, y);
    return { x: p.x, y: p.y - level * BH };
  }

  /** Makes the column's sprites match the town. `anim` animates the top piece. */
  private syncColumn(i: number, anim: "add" | "remove" | null) {
    const c = this.store.town.cols[i];
    const parts = this.cols[i];
    const { x, y } = xy(i);
    // Remove parts that no longer match.
    while (parts.length > c.s.length || parts.some((p, k) => p.id !== c.s[k])) {
      const p = parts.pop()!;
      if (anim === "remove") this.crumble(p);
      else this.destroyPart(p);
    }
    for (let k = parts.length; k < c.s.length; k++) {
      const pd = piece(c.s[k]);
      const pos = this.levelY(x, y, k);
      const img = this.put(texFor(pd), pos.x, pos.y, colDepth(x, y) + k);
      const part: Part = { id: pd.id, img, extras: [] };
      if (this.art.info.has(`${texFor(pd)}-glow`)) part.glow = this.put(`${texFor(pd)}-glow`, pos.x, pos.y, colDepth(x, y) + k + 0.3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      if (pd.id === "wind") {
        const rotor = this.put("m-wind-rotor", pos.x + 1, pos.y - 114, colDepth(x, y) + k + 0.5);
        rotor.setOrigin(0.5, 0.5);
        part.extras.push(rotor);
      }
      if (pd.id === "townhall") {
        const flag = this.put("m-flag", pos.x + 0.4, pos.y - 90, colDepth(x, y) + k + 0.5);
        flag.setOrigin(0, 0);
        this.tweens.add({ targets: flag, scaleX: { from: 1 / RES, to: 0.8 / RES }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        part.extras.push(flag);
        this.thLabel.setPosition(pos.x, pos.y + 22);
      }
      parts.push(part);
      if (anim === "add" && k === c.s.length - 1) this.dropIn(part, x, y);
    }
    if (parts.length) this.applyTint(parts, i);
  }

  private destroyPart(p: Part) {
    p.img.destroy();
    p.glow?.destroy();
    p.extras.forEach((e) => e.destroy());
  }

  private applyTint(parts: Part[], i: number) {
    const air = this.eco.airShown[i];
    for (const p of parts) {
      const tint = piece(p.id).kind === "nature" ? this.stressTint(air) : this.tintNow;
      p.img.setTint(tint);
      p.extras.forEach((e) => e.setTint(tint));
    }
  }

  private stressTint(air: number) {
    const st = stressOf(air);
    return st > 0.01 ? mixColor(this.tintNow, STRESSED, st) & 0xf8f8f8 : this.tintNow;
  }

  /** Re-tints the whole world: time of day, Eco Vision dimming, and plants tired by dirty air. */
  private retint() {
    const air = this.eco.airShown;
    const t = this.store.town;
    const heat = this.store.sim.stats.heat;
    const h = heat.intensity;
    for (let i = 0; i < this.ground.length; i++) {
      let g = t.cols[i].g === "grass" ? this.stressTint(air[i]) : this.tintNow;
      // In the heat, grass in the town dries out where nothing shades it.
      if (h > 0 && heat.cool && t.cols[i].g === "grass" && this.eco.urban[i]) {
        const dry = h * Phaser.Math.Clamp((0.6 - heat.cool[i]) / 0.6, 0, 1);
        if (dry > 0.02) g = mixColor(g, DRY, 0.55 * dry) & 0xf8f8f8;
      }
      this.ground[i].setTint(g);
      if (this.cols[i].length) this.applyTint(this.cols[i], i);
    }
  }

  // ------------------------------------------------------------------ animation helpers
  private dropIn(p: Part, x: number, y: number) {
    const img = p.img;
    const y0 = img.y;
    const s = 1 / RES;
    if (this.deps.reduced) {
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 150 });
      return;
    }
    img.setY(y0 - 46).setAlpha(0);
    this.tweens.add({
      targets: img,
      y: y0,
      alpha: 1,
      duration: 260,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.tweens.add({ targets: img, scaleY: { from: s * 0.82, to: s }, scaleX: { from: s * 1.1, to: s }, duration: 260, ease: "Back.easeOut" });
        this.dust(img.x, y0, 4);
      },
    });
    p.extras.forEach((e) => {
      const ey = e.y;
      e.setY(ey - 46).setAlpha(0);
      this.tweens.add({ targets: e, y: ey, alpha: 1, duration: 260, ease: "Quad.easeIn" });
    });
    void x;
    void y;
  }

  private crumble(p: Part) {
    p.glow?.destroy();
    const imgs = [p.img, ...p.extras];
    if (this.deps.reduced) {
      imgs.forEach((i) => i.destroy());
      return;
    }
    this.dust(p.img.x, p.img.y, 6, 0xb59a7a);
    this.tweens.add({
      targets: imgs,
      alpha: 0,
      scaleY: 0.2 / RES,
      duration: 260,
      ease: "Quad.easeIn",
      onComplete: () => imgs.forEach((i) => i.destroy()),
    });
  }

  private dust(wx: number, wy: number, n: number, tint = 0xe8dcc6) {
    if (this.deps.reduced) return;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const d = this.add.image(wx, wy, "fx-puff").setScale(0.25 / RES).setTint(tint).setAlpha(0.8).setDepth(UI_DEPTH - 1);
      this.tweens.add({
        targets: d,
        x: wx + Math.cos(a) * 26,
        y: wy + Math.sin(a) * 12 - 4,
        scale: 0.6 / RES,
        alpha: 0,
        duration: 520,
        ease: "Quad.easeOut",
        onComplete: () => d.destroy(),
      });
    }
  }

  private sparkle(wx: number, wy: number, n = 10, tint = 0xffe27a) {
    for (let k = 0; k < n; k++) {
      const s = this.add.image(wx, wy, "fx-spark").setScale(0.5 / RES).setTint(tint).setDepth(UI_DEPTH + 2);
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 30;
      this.tweens.add({
        targets: s,
        x: wx + Math.cos(a) * r,
        y: wy + Math.sin(a) * r * 0.6 - 20,
        angle: 180,
        alpha: 0,
        scale: 0.15 / RES,
        duration: 700 + Math.random() * 300,
        ease: "Cubic.easeOut",
        onComplete: () => s.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ camera
  private get res() {
    return this.deps.resolution;
  }

  private setupCamera() {
    const cam = this.cameras.main;
    const th = P(TOWN_HALL.x, TOWN_HALL.y);
    cam.centerOn(th.x, th.y);
    this.zoomTarget = 1.15;
    cam.setZoom(this.res * (this.deps.reduced ? 1.15 : 0.55));
    this.scale.on("resize", () => this.clampCamera());
  }

  private clampCamera() {
    const cam = this.cameras.main;
    const mid = cam.midPoint;
    const half = (N * 64) / 2;
    const cx = Phaser.Math.Clamp(mid.x, -half, half);
    const cy = Phaser.Math.Clamp(mid.y, -40, N * 32);
    if (cx !== mid.x || cy !== mid.y) cam.centerOn(cx, cy);
  }

  /** Smoothly moves the camera to look at a column. */
  focus(i: number) {
    const { x, y } = xy(i);
    const p = P(x, y);
    this.cameras.main.pan(p.x, p.y - 30, this.deps.reduced ? 0 : 600, "Sine.easeInOut");
  }

  // ------------------------------------------------------------------ input
  private setupInput() {
    this.input.addPointer(1);
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget * Math.exp(-dy * 0.0016), 0.4, 2.4);
      this.zoomAnchor = { sx: p.x, sy: p.y };
    });
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        this.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
      if (k === " ") this.spaceDown = true;
      if (k === "+" || k === "=") this.zoomTarget = Math.min(2.4, this.zoomTarget * 1.2);
      if (k === "-" || k === "_") this.zoomTarget = Math.max(0.4, this.zoomTarget / 1.2);
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === " ") this.spaceDown = false;
    };
    const blur = () => {
      this.keys.clear();
      this.spaceDown = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    this.offs.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    });
  }

  private pointers() {
    return [this.input.pointer1, this.input.pointer2].filter((p) => p && p.isDown);
  }

  private onDown(p: Phaser.Input.Pointer) {
    const ps = this.pointers();
    if (ps.length >= 2) {
      // Two fingers: pinch to zoom, drag to pan; cancel any painting.
      const [a, b] = ps;
      this.drag = null;
      this.pinch = { d: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z: this.zoomTarget, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    this.vel = { x: 0, y: 0 };
    const tool = this.store.tool;
    const pan = tool.kind === "none" || p.rightButtonDown() || p.middleButtonDown() || this.spaceDown;
    this.drag = { id: p.id, x: p.x, y: p.y, moved: false, pan, painted: new Set() };
    this.updateHover(p);
    if (!pan && this.hovered >= 0) this.paint(this.hovered, false);
  }

  private paint(i: number, quiet: boolean) {
    if (!this.drag || this.drag.painted.has(i)) return;
    this.drag.painted.add(i);
    if (this.store.tool.kind === "build") this.store.placeAt(i, quiet);
    else if (this.store.tool.kind === "remove") this.store.removeAt(i, quiet);
  }

  private onMove(p: Phaser.Input.Pointer) {
    const cam = this.cameras.main;
    if (this.pinch) {
      const ps = this.pointers();
      if (ps.length >= 2) {
        const [a, b] = ps;
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.zoomTarget = Phaser.Math.Clamp(this.pinch.z * (d / Math.max(1, this.pinch.d)), 0.4, 2.4);
        this.zoomAnchor = { sx: mx, sy: my };
        cam.scrollX -= (mx - this.pinch.mx) / cam.zoom;
        cam.scrollY -= (my - this.pinch.my) / cam.zoom;
        this.pinch.mx = mx;
        this.pinch.my = my;
      }
      return;
    }
    const d = this.drag;
    if (d && p.id === d.id && p.isDown) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 6 * this.res) d.moved = true;
      if (d.pan && d.moved) {
        cam.scrollX -= dx / cam.zoom;
        cam.scrollY -= dy / cam.zoom;
        this.vel = { x: (dx / cam.zoom) * 0.9 + this.vel.x * 0.1, y: (dy / cam.zoom) * 0.9 + this.vel.y * 0.1 };
        d.x = p.x;
        d.y = p.y;
        this.clampCamera();
        return;
      }
      if (!d.pan) {
        this.updateHover(p);
        if (this.hovered >= 0) this.paint(this.hovered, true);
        return;
      }
    }
    this.updateHover(p);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.pinch) {
      if (this.pointers().length < 2) this.pinch = null;
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || p.id !== d.id) return;
    if (d.pan && !d.moved && this.store.tool.kind === "none" && !p.rightButtonReleased()) {
      // A tap: select what's there.
      this.updateHover(p);
      const i = this.hovered;
      const c = i >= 0 ? this.store.town.cols[i] : null;
      this.store.select(c && (c.s.length || c.g !== "grass") ? i : null);
    }
    if (!d.pan) this.vel = { x: 0, y: 0 };
  }

  /** Which column is under the pointer, taking building heights into account. */
  pick(wx: number, wy: number): { i: number; level: number } {
    let best = -1;
    let bestKey = -Infinity;
    let bestLevel = 0;
    const t = this.store.town;
    const tool = this.store.tool;
    // Ground pieces go where the ground is; when building, trees and flowers don't block the view.
    const groundOnly = tool.kind === "build" && piece(tool.id).kind === "ground";
    const softNature = tool.kind === "build";
    for (let h = 0.1; !groundOnly && h <= MAX_LEVEL + 3; h += 0.2) {
      const sy = wy + h * BH;
      const gx = (sy / 16 + wx / 32) / 2;
      const gy = (sy / 16 - wx / 32) / 2;
      const x = Math.floor(gx + 0.5);
      const y = Math.floor(gy + 0.5);
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      const tp = top(t.cols[i]);
      if (softNature && tp?.kind === "nature") continue;
      const vh = this.visualHeight(t.cols[i]);
      if (vh >= h) {
        const key = (x + y) * 100 + h;
        if (key > bestKey) {
          bestKey = key;
          best = i;
          bestLevel = t.cols[i].s.length;
        }
      }
    }
    if (best < 0) {
      const gx = (wy / 16 + wx / 32) / 2;
      const gy = (wy / 16 - wx / 32) / 2;
      const x = Math.floor(gx + 0.5);
      const y = Math.floor(gy + 0.5);
      if (inside(x, y)) {
        best = idx(x, y);
        bestLevel = t.cols[best].s.length;
      }
    }
    return { i: best, level: bestLevel };
  }

  private visualHeight(c: Column) {
    let h = 0;
    for (const id of c.s) h += piece(id).kind === "block" ? 1 : (this.art.vh.get(id) ?? 1);
    return h;
  }

  private updateHover(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const hit = this.pick(w.x, w.y);
    this.hovered = hit.i;
    this.hoverLevel = hit.level;
    this.needHover = true;
  }

  private drawHover() {
    const i = this.hovered;
    const tool = this.store.tool;
    if (i < 0 || this.pinch) {
      this.ring.setVisible(false);
      this.ghost.setVisible(false);
      return;
    }
    const { x, y } = xy(i);
    const g = P(x, y);
    this.ring.setPosition(g.x, g.y).setVisible(true);
    if (tool.kind === "build") {
      const pd = piece(tool.id);
      const ok = canPlace(this.store.town, i, tool.id).ok;
      const key = pd.kind === "ground" ? (pd.id === "road" ? "g-road-0" : groundKey(pd.id, x, y)) : texFor(pd);
      const info = this.art.get(key);
      const level = pd.kind === "ground" ? 0 : this.store.town.cols[i].s.length;
      const pos = this.levelY(x, y, level);
      this.ghost
        .setTexture(key)
        .setOrigin(info.ox, info.oy)
        .setPosition(pos.x, pos.y - (ok ? 3 + Math.sin(this.time.now / 180) * 2 : 0))
        .setDepth(pd.kind === "ground" ? OVERLAY_DEPTH + 3 : colDepth(x, y) + level + 0.9)
        .setTint(ok ? 0xc8ffc8 : 0xff9a8a)
        .setAlpha(ok ? 0.75 : 0.6)
        .setVisible(true);
      this.ring.setTint(ok ? 0x9cff9c : 0xff7a6a);
    } else if (tool.kind === "remove") {
      this.ghost.setVisible(false);
      this.ring.setTint(removeInfo(this.store.town, i).ok ? 0xff7a6a : 0x999999);
    } else {
      this.ghost.setVisible(false);
      this.ring.setTint(0xffffff);
    }
  }

  // ------------------------------------------------------------------ events
  private subscribe() {
    const bus = this.store.bus;
    this.offs.push(
      bus.on("col", ({ i, change }) => {
        if (change === "ground") {
          const { x, y } = xy(i);
          this.refreshGround(i);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (inside(x + dx, y + dy)) this.refreshGround(idx(x + dx, y + dy));
          const g = this.ground[i];
          if (!this.deps.reduced) this.tweens.add({ targets: g, scale: { from: 0.7 / RES, to: 1 / RES }, duration: 240, ease: "Back.easeOut" });
          this.rebuildNetworks();
          this.syncColumn(i, null);
        } else this.syncColumn(i, change);
        this.eco.townChanged();
        this.needHover = true;
      }),
      bus.on("pulse", ({ i, phase }) => {
        if (phase === "start") {
          this.pulseT = 0;
          this.eco.chimneyClosed(i);
          // Once the smoke has gone, people near the old plant come outside.
          this.time.delayedCall(this.deps.reduced ? 0 : 1000, () => this.stepOutside(i));
        } else {
          this.pulseT = -1;
          this.eco.pulseEnded();
          this.eco.townChanged();
          this.slowVisuals();
        }
      }),
      bus.on("townhall", () => {
        const p = P(TOWN_HALL.x, TOWN_HALL.y);
        this.sparkle(p.x, p.y - 60, 30);
        this.sparkle(p.x, p.y - 60, 20, 0x9cf0b0);
        if (!this.deps.reduced) this.cameras.main.shake(200, 0.002);
      }),
      bus.on("moveIn", ({ n }) => this.moveIn(n)),
      // After a heatwave the town handled well, people come back out near the Town Hall.
      bus.on("heatEnd", ({ score }) => {
        if (score >= 70) this.time.delayedCall(this.deps.reduced ? 0 : 1500, () => this.stepOutside(idx(TOWN_HALL.x, TOWN_HALL.y)));
      }),
      bus.on("fail", ({ i }) => {
        const { x, y } = xy(i);
        const g = P(x, y);
        this.ring.setPosition(g.x, g.y).setTint(0xff5a4a).setVisible(true);
        if (!this.deps.reduced) this.tweens.add({ targets: this.ring, x: g.x + 4, duration: 50, yoyo: true, repeat: 3 });
      }),
      bus.on("collect", () => {
        const b = this.coinBubble;
        this.tweens.killTweensOf(b);
        this.tweens.add({ targets: b, scale: { from: 1.3 / RES, to: 0 }, alpha: 0, duration: 260, ease: "Back.easeIn", onComplete: () => b.setVisible(false).setAlpha(1).setScale(1 / RES) });
        const p = P(TOWN_HALL.x, TOWN_HALL.y);
        this.sparkle(p.x, p.y - 100, 10, 0xffd25a);
        // Tell the HUD where the coins fly from (CSS pixels).
        const cam = this.cameras.main;
        const sx = ((p.x - cam.worldView.x) * cam.zoom) / this.res;
        const sy = ((p.y - 100 - cam.worldView.y) * cam.zoom) / this.res;
        window.dispatchEvent(new CustomEvent("greenhold:fly", { detail: { x: sx, y: sy } }));
      }),
      bus.on("focus", ({ i }) => this.focus(i)),
      bus.on("reset", () => this.scene.restart(this.deps)),
    );
    this.events.once("shutdown", () => {
      this.ready = false;
      this.offs.forEach((f) => f());
      this.offs = [];
      this.agents = [];
      this.smog = [];
      this.badges = [];
      this.butterflies = [];
      this.shimmer = [];
      this.ground = [];
      this.cols = [];
    });
  }

  // ------------------------------------------------------------------ agents
  private rebuildNetworks() {
    const t = this.store.town;
    this.roads = [];
    this.walkTiles = [];
    this.bikeTiles = [];
    this.busyTiles = [];
    this.railTiles = [];
    this.edgeRoads = [];
    const spots: number[] = [];
    t.cols.forEach((c, i) => {
      if (c.g === "road") this.roads.push(i);
      if (c.g === "rail") this.railTiles.push(i);
      if (PAVED.includes(c.g)) this.walkTiles.push(i);
      if (c.g === "bike") this.bikeTiles.push(i);
      if (c.s.some((id) => DESTINATIONS.includes(id)) || c.g === "plaza") spots.push(i);
    });
    // Pavements within 3 tiles of a café, school, park or plaza are where crowds gather.
    this.busyTiles = this.walkTiles.filter((w) => {
      const a = xy(w);
      return spots.some((sp) => {
        const b = xy(sp);
        return Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 3;
      });
    });
    // Delivery trucks arrive from roads near the edge of the map.
    this.edgeRoads = this.roads.filter((r) => {
      const p = xy(r);
      return Math.min(p.x, p.y, N - 1 - p.x, N - 1 - p.y) <= 12;
    });
    // Vehicles on tiles that are no longer roads leave.
    this.agents = this.agents.filter((a) => {
      const ok = a.target || this.tileOk(a, a.from) || this.tileOk(a, a.to);
      if (!ok) this.dropAgent(a);
      return ok;
    });
  }

  private dropAgent(a: Agent) {
    a.img.destroy();
    a.light?.destroy();
  }

  private tileOk(a: Agent, i: number) {
    const g = this.store.town.cols[i].g;
    if (a.kind === "car" || a.kind === "bus" || a.kind === "truck") return g === "road";
    if (a.kind === "train") return g === "rail";
    if (a.kind === "bike") return g === "bike";
    return PAVED.includes(g);
  }

  private neighbours(i: number, ok: (g: string) => boolean) {
    const { x, y } = xy(i);
    const out: number[] = [];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (inside(x + dx, y + dy) && ok(this.store.town.cols[idx(x + dx, y + dy)].g)) out.push(idx(x + dx, y + dy));
    }
    return out;
  }

  private textureFor(a: Agent, dx: number, dy: number) {
    if (a.kind === "car") return `v-${a.look}-${dirOf(dx, dy)}`;
    if (a.kind === "bus" || a.kind === "truck" || a.kind === "train") return `v-${a.kind}-${dirOf(dx, dy)}`;
    if (a.kind === "bike") return `c-${a.look}-${a.frame}`;
    return `p-${a.look}-${a.frame}`;
  }

  private spawn(kind: Agent["kind"], at: number, kid = false) {
    const look: string | number = kind === "car" ? pick(CAR_TYPES) : kind === "bus" || kind === "truck" || kind === "train" ? kind : kid ? pick(KIDS) : pick(ADULTS);
    const a: Agent = {
      img: null as unknown as Phaser.GameObjects.Image,
      from: at,
      to: at,
      t: 1,
      speed: kind === "walker" ? (kid ? 0.75 : 0.5 + Math.random() * 0.3) : kind === "bike" ? 1.3 : kind === "bus" || kind === "truck" ? 1.1 : kind === "train" ? 1.8 : 1.5 + Math.random() * 0.6,
      kind,
      look,
      step: Math.random(),
      frame: 0,
      side: Math.random() < 0.5 ? -1 : 1,
      puff: Math.random() * 1000,
    };
    a.img = this.put(this.textureFor(a, 1, 0), 0, 0, 0);
    if (kind === "car" || kind === "bus" || kind === "truck" || kind === "train") a.light = this.add.image(0, 0, "fx-beam").setScale(1 / RES).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.agents.push(a);
    return a;
  }

  private moveIn(n: number) {
    const homes = this.store.sim.stats.homes;
    const starts = this.walkTiles;
    if (!homes.length || !starts.length) return;
    for (let k = 0; k < Math.min(n, 4); k++) {
      const h = homes[Math.floor(Math.random() * homes.length)];
      const hp = xy(h);
      // Start from the nearest pavement.
      let best = starts[0];
      let bd = Infinity;
      for (const s of starts) {
        const p = xy(s);
        const d = Math.abs(p.x - hp.x) + Math.abs(p.y - hp.y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      const a = this.spawn("walker", best);
      const sp = xy(best);
      a.sx = sp.x + (Math.random() - 0.5) * 0.4;
      a.sy = sp.y + (Math.random() - 0.5) * 0.4;
      a.target = hp;
      a.t = 0;
      a.speed = 1 / Math.max(1, Math.hypot(hp.x - sp.x, hp.y - sp.y));
    }
  }

  /** Eco Pulse: people in homes near the closed plant step out onto the street. */
  private stepOutside(near: number) {
    const homes = this.store.sim.stats.homes;
    if (!homes.length || !this.walkTiles.length) return;
    const c = xy(near);
    const close = [...homes].sort((a, b) => {
      const p = xy(a);
      const q = xy(b);
      return Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y);
    });
    for (const h of close.slice(0, this.deps.reduced ? 3 : 7)) {
      const hp = xy(h);
      let best = -1;
      let bd = Infinity;
      for (const w of this.walkTiles) {
        const p = xy(w);
        const d = Math.abs(p.x - hp.x) + Math.abs(p.y - hp.y);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      if (best < 0 || bd > 3) continue;
      const a = this.spawn("walker", best, Math.random() < 0.25);
      const bp = xy(best);
      a.sx = hp.x;
      a.sy = hp.y;
      a.target = bp;
      a.join = best;
      a.t = -Math.random() * 0.8;
      a.speed = 0.7 / Math.max(1, Math.hypot(bp.x - hp.x, bp.y - hp.y));
    }
  }

  private updateAgents(dt: number) {
    const stats = this.store.sim.stats;
    const t = this.store.town;
    const day = 0.35 + 0.65 * (1 - this.e.night);
    const hasSchool = t.cols.some((c) => c.s.includes("school"));
    // Fewer people stay outside when the air at home is bad.
    // In a heatwave, fewer people are out, and those who are keep to the shade.
    const heat = stats.heat;
    const hot = heat.intensity * (1 - this.e.night);
    const outdoors = (1 - 0.5 * Phaser.Math.Clamp((stats.homeAir - 6) / 30, 0, 1)) * (1 - 0.4 * hot);
    const shady = hot > 0.1 && heat.cool ? this.walkTiles.filter((w) => heat.cool![w] >= 0.5) : [];
    const eco = this.eco.vis;
    // How many of each to show.
    const want = {
      car: this.roads.length >= 2 ? Math.min(40, Math.round(stats.travel.cars / 2.5)) : 0,
      bus: this.roads.length >= 2 && t.cols.some((c) => c.s.includes("bus")) ? Math.min(4, 1 + Math.floor(t.residents / 40)) : 0,
      walker: this.walkTiles.length ? Math.round(Math.min(70, 4 + t.residents / 2) * day * outdoors) : 0,
      bike: this.bikeTiles.length >= 2 ? Math.min(18, Math.round(((t.residents * stats.travel.covered) / 4) * outdoors)) : 0,
      train: this.railTiles.length >= 4 && t.cols.some((c) => c.s.includes("station")) ? Math.min(3, Math.ceil(this.railTiles.length / 14)) : 0,
      truck: this.roads.length >= 2 ? Math.min(10, Math.round(stats.trucks)) : 0,
    };
    const have = { car: 0, bus: 0, walker: 0, bike: 0, train: 0, truck: 0 };
    for (const a of this.agents) if (!a.target) have[a.kind]++;
    (Object.keys(want) as Agent["kind"][]).forEach((k) => {
      let pool = k === "car" || k === "bus" ? this.roads : k === "truck" ? (this.edgeRoads.length ? this.edgeRoads : this.roads) : k === "train" ? this.railTiles : k === "bike" ? this.bikeTiles : this.walkTiles;
      // Half of the people on foot start near cafés, schools, parks and plazas.
      if (k === "walker" && this.busyTiles.length && Math.random() < 0.5) pool = this.busyTiles;
      if (k === "walker" && shady.length && Math.random() < 0.75 * hot) pool = shady;
      if (have[k] < want[k] && pool.length) this.spawn(k, pick(pool), k === "walker" && hasSchool && Math.random() < 0.25);
      // Extra people head home gradually, not all at once.
      if (have[k] > want[k] && this.time.now - this.lastCull[k] > (k === "walker" || k === "bike" ? 700 : 0)) {
        this.lastCull[k] = this.time.now;
        const a = this.agents.find((x) => x.kind === k && !x.target);
        if (a) {
          this.dropAgent(a);
          this.agents.splice(this.agents.indexOf(a), 1);
        }
      }
    });
    const tint = this.tintNow;
    const night = this.e.night;
    for (let n = this.agents.length - 1; n >= 0; n--) {
      const a = this.agents[n];
      // People walk a little slower in the heat.
      a.t += dt * a.speed * (a.kind === "walker" ? 1 - 0.25 * hot : 1);
      let fx: number;
      let fy: number;
      let dx = 0;
      let dy = 0;
      if (a.target) {
        const k = Phaser.Math.Clamp(a.t, 0, 1);
        a.img.setVisible(a.t >= 0);
        fx = a.sx! + (a.target.x - a.sx!) * k;
        fy = a.sy! + (a.target.y - a.sy!) * k;
        dx = a.target.x - a.sx!;
        dy = a.target.y - a.sy!;
        if (a.join !== undefined && a.t >= 1) {
          // Out of the front door and onto the street: carry on as a normal walker.
          a.target = undefined;
          a.from = a.to = a.join;
          a.join = undefined;
          a.t = 1;
        } else if (a.t >= 1.1) {
          this.sparkle(a.img.x, a.img.y - 10, 4, 0x9cf0b0);
          this.dropAgent(a);
          this.agents.splice(n, 1);
          continue;
        }
      } else {
        if (a.t >= 1) {
          const ok = (g: string) =>
            a.kind === "car" || a.kind === "bus" || a.kind === "truck" ? g === "road" : a.kind === "train" ? g === "rail" : a.kind === "bike" ? g === "bike" : PAVED.includes(g as never);
          const nb = this.neighbours(a.to, ok);
          const fwd = nb.filter((x) => x !== a.from);
          let choice = fwd.length ? pick(fwd) : nb.length ? nb[0] : a.to;
          // In the heat, people on foot turn toward the shadier way.
          if (a.kind === "walker" && hot > 0.2 && heat.cool && fwd.length > 1 && Math.random() < 0.7 * hot) choice = fwd.reduce((b, x) => (heat.cool![x] > heat.cool![b] ? x : b));
          a.from = a.to;
          a.to = choice;
          a.t = a.from === a.to ? 0.5 : 0;
        }
        const f = xy(a.from);
        const to = xy(a.to);
        fx = f.x + (to.x - f.x) * a.t;
        fy = f.y + (to.y - f.y) * a.t;
        dx = to.x - f.x;
        dy = to.y - f.y;
        if (a.kind === "train") {
          // Trains run down the middle of the track.
        } else if (a.kind === "car" || a.kind === "bus" || a.kind === "truck") {
          // Keep to the right-hand lane.
          fx += -dy * 0.17;
          fy += dx * 0.17;
        } else {
          // People keep to the edge of roads (the pavement); elsewhere they spread out a little.
          const onRoad = t.cols[a.from].g === "road" || t.cols[a.to].g === "road";
          const off = onRoad ? 0.4 : 0.22;
          fx += -dy * off * a.side + (dy ? 0 : Math.sin(a.from * 9.1) * 0.12);
          fy += dx * off * a.side + (dx ? 0 : Math.cos(a.from * 7.3) * 0.12);
        }
        if (!this.deps.reduced && a.kind !== "walker" && a.kind !== "train") {
          // Exhaust; in Eco Vision it shows more clearly, and bikes leave a clean trail.
          // A bus is one engine for many riders, so its trail is lighter than a car's.
          a.puff = (a.puff ?? 0) + dt * 1000;
          const back = P(fx - dx * 0.25, fy - dy * 0.25);
          if ((a.kind === "car" || a.kind === "truck") && a.puff > (eco > 0.5 ? 900 : 2600)) {
            a.puff = 0;
            this.puff(back.x, back.y - 3, eco > 0.5 ? 0x6a5646 : 0x7d7d7d, 0.12 + 0.14 * eco, 0.18, 10);
          } else if (a.kind === "bus" && eco > 0.5 && a.puff > 1800) {
            a.puff = 0;
            this.puff(back.x, back.y - 3, 0x8c8780, 0.12 * eco, 0.16, 8);
          } else if (a.kind === "bike" && eco > 0.5 && a.puff > 650) {
            a.puff = 0;
            this.puff(back.x, back.y - 2, 0x9ff5d6, 0.4 * eco, 0.07, 4);
          }
        }
      }
      // Animate legs and face the way they're going.
      if (a.kind === "walker" || a.kind === "bike") {
        a.step += dt * (a.kind === "bike" ? 3 : 5.5);
        a.frame = Math.floor(a.step) % 2 === 0 ? 0 : 1;
      }
      if (dx || dy) {
        const key = this.textureFor(a, dx, dy);
        if (a.img.texture.key !== key) a.img.setTexture(key);
        if (a.kind === "walker" || a.kind === "bike") a.img.setFlipX(dx - dy < 0);
      }
      const p = P(fx, fy);
      a.img.setPosition(p.x, p.y).setDepth(colDepth(Math.ceil(fx), Math.ceil(fy)) - 20).setTint(tint);
      if (a.light) {
        const ahead = P(fx + dx * 0.45, fy + dy * 0.45);
        a.light.setPosition(ahead.x, ahead.y - 2).setDepth(a.img.depth + 0.1).setAlpha(night * 0.85);
      }
    }
  }

  // ------------------------------------------------------------------ weather
  private updateWeather(dt: number, time: number) {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const w = this.e.weather;
    const reduced = this.deps.reduced;
    const want = reduced ? 0 : w === "storm" ? this.rain.length : w === "rain" ? Math.floor(this.rain.length * 0.6) : 0;
    this.rain.forEach((d, k) => {
      if (k >= want) {
        if (d.visible) d.setVisible(false);
        return;
      }
      if (!d.visible || d.y > view.bottom + 20 || d.x < view.x - 40) {
        d.setPosition(view.x + Math.random() * (view.width + 80), view.y - 20 + (d.visible ? -Math.random() * 60 : Math.random() * view.height)).setVisible(true);
      }
      d.x -= dt * 110;
      d.y += dt * 520;
    });
    // Cloud shadows drift over the land on grey days.
    const cloudAlpha = w === "sunny" ? 0 : w === "cloudy" ? 0.12 : w === "rain" ? 0.18 : 0.26;
    for (const c of this.clouds) {
      c.setAlpha(c.alpha + (cloudAlpha - c.alpha) * Math.min(1, dt));
      if (!reduced) {
        c.x += dt * 14;
        c.y += dt * 4;
        const half = (N * 64) / 2;
        if (c.x > half + 200) {
          c.x = -half - 200;
          c.y = Math.random() * N * 32;
        }
      }
    }
    // Lightning in storms.
    this.flash.setPosition(view.x - 20, view.y - 20).setSize(view.width + 40, view.height + 40);
    if (w === "storm" && !reduced && time > this.nextFlash) {
      this.nextFlash = time + 5000 + Math.random() * 7000;
      this.tweens.add({ targets: this.flash, alpha: { from: 0.55, to: 0 }, duration: 380, ease: "Quad.easeOut" });
      this.time.delayedCall(140, () => this.tweens.add({ targets: this.flash, alpha: { from: 0.35, to: 0 }, duration: 260 }));
    }
  }

  // ------------------------------------------------------------------ heatwave
  /** Heat shimmer: faint wavering air over the hottest unshaded roads and plazas in view. */
  private updateShimmer(time: number) {
    const heat = this.store.sim.stats.heat;
    const h = heat.intensity * (1 - this.e.night);
    if (this.deps.reduced || h <= 0.02 || !heat.cool) {
      for (const s of this.shimmer) s.img.setVisible(false);
      return;
    }
    if (!this.shimmer.length)
      for (let k = 0; k < 16; k++) this.shimmer.push({ img: this.add.image(0, 0, "fx-shimmer").setScale(1 / RES).setDepth(OVERLAY_DEPTH + 5).setVisible(false), phase: Math.random() * 6 });
    // Every few seconds, move the shimmer to hot tiles in view.
    if (time - this.lastShimmer > 3000) {
      this.lastShimmer = time;
      const v = this.cameras.main.worldView;
      const hot = this.walkTiles.filter((i) => {
        if (heat.cool![i] >= 0.5 || this.store.town.cols[i].g === "path") return false;
        const { x, y } = xy(i);
        const p = P(x, y);
        return p.x > v.x && p.x < v.right && p.y > v.y && p.y < v.bottom;
      });
      this.shimmer.forEach((s, k) => {
        const i = hot.length ? hot[(k * 7919 + Math.floor(time / 3000)) % hot.length] : -1;
        s.img.setData("on", i >= 0);
        if (i < 0) return;
        const { x, y } = xy(i);
        const p = P(x, y);
        s.img.setPosition(p.x, p.y - 4).setData("x", p.x);
      });
    }
    for (const s of this.shimmer) {
      if (!s.img.getData("on")) {
        s.img.setVisible(false);
        continue;
      }
      // Slow, gentle wavering; each patch fades in and out on its own rhythm.
      const w = Math.sin(time / 900 + s.phase);
      s.img
        .setVisible(true)
        .setX((s.img.getData("x") as number) + Math.sin(time / 420 + s.phase) * 1.5)
        .setScale(1 / RES, (0.8 + 0.2 * Math.sin(time / 300 + s.phase)) / RES)
        .setAlpha(0.16 * h * (0.55 + 0.45 * w));
    }
  }

  // ------------------------------------------------------------------ effects
  private puff(wx: number, wy: number, tint: number, alpha: number, scale: number, rise: number) {
    const s = this.add
      .image(wx, wy, "fx-puff")
      .setTint(tint)
      .setAlpha(alpha)
      .setScale((scale * 0.4) / RES)
      .setDepth(SMOG_DEPTH - 10);
    // Drift with the wind (grid direction projected onto the screen).
    const ang = windAngle(this.store.town.clock);
    const d = (this.e.wind * 40 + 8) * (Math.random() * 0.5 + 0.75);
    const dx = (Math.cos(ang) - Math.sin(ang)) * d;
    const dy = (Math.cos(ang) + Math.sin(ang)) * d * 0.5;
    this.tweens.add({
      targets: s,
      x: wx + dx,
      y: wy + dy - rise - Math.random() * rise * 0.4,
      scale: (scale * 1.6) / RES,
      alpha: 0,
      duration: 2200 + Math.random() * 800,
      ease: "Sine.easeOut",
      onComplete: () => s.destroy(),
    });
  }

  private emitSmoke() {
    const t = this.store.town;
    t.cols.forEach((c, i) => {
      const tp = top(c);
      if (!tp) return;
      const spots = this.art.smoke.get(tp.id);
      if (!spots) return;
      const { x, y } = xy(i);
      const level = c.s.length - 1;
      const base = this.levelY(x, y, level);
      for (const s of spots) {
        if (tp.id === "coal") this.puff(base.x + s.x, base.y + s.y, 0x57524e, 0.75, 1.6, 80);
        else if (Math.random() < 0.3) this.puff(base.x + s.x, base.y + s.y, 0x9aa060, 0.3, 0.6, 26);
      }
    });
  }

  private butterfliesUpdate() {
    const clean = this.store.sim.stats.meanAir < 6 && this.e.sun > 0.2;
    if (!clean || this.deps.reduced) {
      this.butterflies.forEach((b) => b.destroy());
      this.butterflies = [];
      return;
    }
    if (this.butterflies.length >= 8) return;
    const t = this.store.town;
    const spots: number[] = [];
    t.cols.forEach((c, i) => (c.s[0] === "flowers" || c.s.includes("greenroof")) && spots.push(i));
    if (!spots.length) return;
    const i = spots[Math.floor(Math.random() * spots.length)];
    const { x, y } = xy(i);
    const base = this.levelY(x, y, t.cols[i].s.length);
    const b = this.add
      .image(base.x, base.y - 10, "fx-butterfly")
      .setScale(0.7 / RES)
      .setTint([0xffd24a, 0xffffff, 0xf2a0c0, 0x9ad0ff][this.butterflies.length % 4])
      .setDepth(SMOG_DEPTH - 20);
    this.butterflies.push(b);
    this.tweens.add({ targets: b, scaleX: 0.15 / RES, duration: 120, yoyo: true, repeat: -1 });
    const wander = () => {
      if (!b.active) return;
      this.tweens.add({ targets: b, x: base.x + (Math.random() - 0.5) * 60, y: base.y - 8 - Math.random() * 26, duration: 1400 + Math.random() * 900, ease: "Sine.easeInOut", onComplete: wander });
    };
    wander();
  }

  /** Things that follow the air and the Eco Vision fade: world tint, plants, smog, the overlay. */
  private slowVisuals() {
    this.eco.refresh();
    const heat = this.store.sim.stats.heat.intensity;
    this.tintNow = mixColor(mixColor(dayTint(this.e), HEAT_LIGHT, 0.22 * heat * (1 - this.e.night)), DIM, 0.5 * this.eco.vis) & 0xf8f8f8;
    this.retint();
    const air = this.eco.airShown;
    for (const s of this.smog) {
      const { x, y } = xy(s.i);
      let sum = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        if (inside(x + dx, y + dy)) sum += air[idx(x + dx, y + dy)];
      s.target = Phaser.Math.Clamp((sum / 4 - 3) / 40, 0, 1) * 0.66 * (1 - 0.55 * this.eco.vis);
    }
  }

  // ------------------------------------------------------------------ slow sync (twice a second)
  private syncSlow(first = false) {
    const t = this.store.town;
    const stats = this.store.sim.stats;
    this.e = env(t.clock);
    void first;
    this.slowVisuals();
    // Crops grow through the seasons.
    t.cols.forEach((c, i) => {
      if (c.g !== "field") return;
      const { x, y } = xy(i);
      const key = `g-field-${fieldStage(t.clock, x, y)}`;
      if (this.ground[i].texture.key !== key) this.ground[i].setTexture(key);
    });
    // Lit windows at night in homes with people.
    const homes = new Set(stats.homes);
    const lit = this.e.night * (t.residents > 0 ? 1 : 0);
    this.cols.forEach((parts, i) => {
      const on = homes.has(i) ? lit : 0;
      // Homes light up when people live there; shops, schools and lamps light up every night.
      for (const p of parts) if (p.glow) p.glow.setAlpha((piece(p.id).housing ? on : this.e.night) * 0.95);
    });
    // Tax bubble over the Town Hall.
    const th = P(TOWN_HALL.x, TOWN_HALL.y);
    if (t.chest >= 1 && !this.coinBubble.visible) {
      this.coinBubble.setPosition(th.x, th.y - 100).setVisible(true).setAlpha(1).setScale(1 / RES);
      this.tweens.add({ targets: this.coinBubble, y: th.y - 106, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    } else if (t.chest < 1 && this.coinBubble.visible) {
      this.tweens.killTweensOf(this.coinBubble);
      this.coinBubble.setVisible(false);
    }
    // Problem badges over buildings that can't be lived in yet.
    const probs = [...stats.noRoof.map((i) => ({ i, k: "ui-noroof" })), ...stats.noAccess.map((i) => ({ i, k: "ui-noroad" }))].slice(0, 24);
    while (this.badges.length < probs.length) {
      const b = this.put("ui-noroof", 0, 0, UI_DEPTH).setScale(0.8 / RES);
      if (!this.deps.reduced) this.tweens.add({ targets: b, scale: { from: 0.8 / RES, to: 0.9 / RES }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.badges.push(b);
    }
    this.badges.forEach((b, k) => {
      const pr = probs[k];
      if (!pr) return b.setVisible(false);
      const { x, y } = xy(pr.i);
      const pos = this.levelY(x, y, t.cols[pr.i].s.length);
      b.setTexture(pr.k).setPosition(pos.x, pos.y - 18).setVisible(true);
    });
    // Town Hall level.
    this.thLabel.setText(`Lv ${t.th}`);
    this.butterfliesUpdate();
  }

  // ------------------------------------------------------------------ frame
  update(time: number, deltaMs: number) {
    if (!this.ready) return;
    const dt = Math.min(0.1, deltaMs / 1000);
    const cam = this.cameras.main;
    const reduced = this.deps.reduced;

    // Keyboard panning.
    const speed = 700 / cam.zoom;
    let kx = 0;
    let ky = 0;
    if (this.keys.has("arrowleft") || this.keys.has("a")) kx -= 1;
    if (this.keys.has("arrowright") || this.keys.has("d")) kx += 1;
    if (this.keys.has("arrowup") || this.keys.has("w")) ky -= 1;
    if (this.keys.has("arrowdown") || this.keys.has("s")) ky += 1;
    if (kx || ky) {
      cam.scrollX += kx * speed * dt * this.res;
      cam.scrollY += ky * speed * dt * this.res;
      this.clampCamera();
    }

    // Glide after a drag.
    if (!this.drag && !this.pinch && (Math.abs(this.vel.x) > 0.05 || Math.abs(this.vel.y) > 0.05)) {
      if (reduced) this.vel = { x: 0, y: 0 };
      else {
        cam.scrollX -= this.vel.x;
        cam.scrollY -= this.vel.y;
        const f = Math.exp(-dt * 6);
        this.vel.x *= f;
        this.vel.y *= f;
        this.clampCamera();
      }
    }

    // Smooth zoom toward the pointer.
    const target = this.zoomTarget * this.res;
    if (Math.abs(cam.zoom - target) > 0.0005) {
      const anchor = this.zoomAnchor ?? { sx: cam.width / 2, sy: cam.height / 2 };
      const before = cam.getWorldPoint(anchor.sx, anchor.sy);
      const z = reduced ? target : cam.zoom + (target - cam.zoom) * (1 - Math.exp(-dt * (this.zoomAnchor ? 14 : 3)));
      cam.setZoom(z);
      const after = cam.getWorldPoint(anchor.sx, anchor.sy);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
      this.clampCamera();
      this.needHover = true;
    } else this.zoomAnchor = null;

    // Wind turbines turn with the wind.
    const spin = dt * (0.6 + this.e.wind * 4.5) * (reduced ? 0.3 : 1);
    for (const parts of this.cols) for (const p of parts) if (p.id === "wind" && p.extras[0]) p.extras[0].rotation += spin;

    // Smog drifts and fades. During an Eco Pulse it is blown off downwind as it thins.
    if (this.pulseT >= 0 && !reduced) this.smogDrift += dt * (90 - this.pulseT * 25);
    else this.smogDrift *= Math.exp(-dt * 0.8);
    const ang = windAngle(this.store.town.clock);
    const sdx = (Math.cos(ang) - Math.sin(ang)) * 0.7;
    const sdy = (Math.cos(ang) + Math.sin(ang)) * 0.35;
    for (const s of this.smog) {
      const a = s.img.alpha + (s.target - s.img.alpha) * Math.min(1, dt * (this.pulseT >= 0 ? 2.5 : 1.5));
      s.img.setAlpha(a).setVisible(a > 0.01);
      if (a > 0.01 && !reduced) s.img.setPosition(s.bx + Math.sin(time / 2400 + s.i) * 6 + sdx * this.smogDrift, s.by + sdy * this.smogDrift);
    }

    // Water shimmer.
    if (time - this.lastWater > 520) {
      this.lastWater = time;
      this.waterFrame = (this.waterFrame + 1) % 3;
      if (!reduced)
        this.store.town.cols.forEach((c, i) => {
          if (c.g === "water") {
            const { x, y } = xy(i);
            this.ground[i].setTexture(`g-water-${(x + y + this.waterFrame) % 3}`);
          }
        });
    }

    if (time - this.lastSmoke > 380) {
      this.lastSmoke = time;
      if (!reduced) this.emitSmoke();
    }

    this.updateAgents(dt);
    this.updateWeather(dt, time);
    this.updateShimmer(time);
    const visBefore = this.eco.vis;
    this.eco.update(dt, time, this.e);

    // During an Eco Pulse or an Eco Vision fade, follow the air ten times a second.
    if (this.pulseT >= 0) this.pulseT += dt;
    const hi = this.store.sim.stats.heat.intensity;
    const fading = this.eco.vis !== visBefore || (this.eco.vis > 0 && this.eco.vis < 1) || this.eco.changing || (hi > 0 && hi < 1);
    if ((this.pulseT >= 0 || fading) && time - this.lastFast > 100) {
      this.lastFast = time;
      this.slowVisuals();
    }

    // Haze follows the view and thickens with the air at homes (lighter in Eco Vision, which shows the air itself).
    const view = cam.worldView;
    const hazeTarget = Phaser.Math.Clamp((this.store.sim.stats.homeAir - 3) / 36, 0, 1) * 0.42 * (1 - 0.6 * this.eco.vis);
    this.haze
      .setPosition(view.x - 20, view.y - 20)
      .setSize(view.width + 40, view.height + 40)
      .setAlpha(this.haze.alpha + (hazeTarget - this.haze.alpha) * Math.min(1, dt * (this.pulseT >= 0 ? 3 : 2)));

    if (this.store.rev !== this.rev) {
      this.rev = this.store.rev;
      this.needHover = true;
    }
    if (time - this.lastSlow > 500) {
      this.lastSlow = time;
      this.syncSlow();
    }

    // Selected column.
    const sel = this.store.selected;
    if (sel !== null && sel >= 0) {
      const { x, y } = xy(sel);
      const p = P(x, y);
      this.selRing.setPosition(p.x, p.y).setVisible(true).setAlpha(0.7 + Math.sin(time / 200) * 0.3);
    } else this.selRing.setVisible(false);

    if (this.needHover || this.store.tool.kind === "build") {
      this.needHover = false;
      this.drawHover();
    }
  }
}

/** Mixes two colours (0 = all a, 1 = all b). */
export function mixColor(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t)) << s;
  return ch(16) | ch(8) | ch(0);
}

/** World tint for the time of day: warm at dawn and dusk, blue at night. */
export function dayTint(e: Env) {
  const night = e.night;
  const dusk = Math.max(0, 1 - Math.abs(e.sun - 0.15) / 0.15) * (e.sun > 0 ? 1 : 0.4);
  const mix = mixColor;
  let c = mix(0xffffff, 0x5a6aa8, night * 0.85);
  c = mix(c, 0xffc49a, dusk * 0.35);
  const gloom = { sunny: 0, cloudy: 0.14, rain: 0.28, storm: 0.42 }[e.weather];
  c = mix(c, 0x8a96a4, gloom);
  // Quantise so tints only update when the change is visible.
  return c & 0xf8f8f8;
}

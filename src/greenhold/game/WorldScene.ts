import Phaser from "phaser";
import { PIECES, piece, type PieceDef } from "../model/pieces";
import { env, windAngle, type Env } from "../model/sim";
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
    const key = p.kind === "ground" ? (p.id === "road" ? "g-road-3" : p.id === "grass" ? "g-grass-0" : `g-${p.id}`) : texFor(p);
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
  kind: "car" | "bus" | "walker" | "bike";
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
const groundKey = (g: string, x: number, y: number) => (g === "road" ? "g-road-0" : g === "grass" ? `g-grass-${(x * 7 + y * 13) % 3}` : g === "water" ? `g-water-${(x + y) % 3}` : `g-${g}`);
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
  private smog: { img: Phaser.GameObjects.Image; target: number; i: number }[] = [];
  private coinBubble!: Phaser.GameObjects.Image;
  private badges: Phaser.GameObjects.Image[] = [];
  private thLabel!: Phaser.GameObjects.Text;
  private butterflies: Phaser.GameObjects.Image[] = [];
  private offs: (() => void)[] = [];
  private keys = new Set<string>();
  private e: Env = env(0);
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
      this.store.screenOf = (i) => {
        const { x, y } = xy(i);
        const p = P(x, y);
        const cam = this.cameras.main;
        return { x: ((p.x - cam.worldView.x) * cam.zoom) / this.res, y: ((p.y - cam.worldView.y) * cam.zoom) / this.res };
      };
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
    this.bars = this.add.graphics().setDepth(UI_DEPTH + 10);
    this.ring = this.put("fx-ring", 0, 0, OVERLAY_DEPTH + 1).setVisible(false);
    this.selRing = this.put("fx-ring", 0, 0, OVERLAY_DEPTH + 2).setVisible(false).setTint(0xffe28a);
    this.ghost = this.add.image(0, 0, "fx-ring").setAlpha(0.65).setVisible(false).setScale(1 / RES);
    this.thLabel = this.add
      .text(0, 0, "", { fontFamily: "Fredoka, system-ui, sans-serif", fontSize: "22px", color: "#ffffff", stroke: "#2c5a3a", strokeThickness: 5 })
      .setOrigin(0.5)
      .setScale(0.5)
      .setDepth(UI_DEPTH);
    for (let i = 0; i < N * N; i++) {
      this.refreshGround(i);
      this.syncColumn(i, null);
    }
    // Smog blobs: one per 2×2 tiles, faded in where the air is dirty.
    for (let y = 0; y < N; y += 2)
      for (let x = 0; x < N; x += 2) {
        const p = P(x + 0.5, y + 0.5);
        const img = this.add.image(p.x, p.y - 34, "fx-smog").setScale(1.6 / RES).setDepth(SMOG_DEPTH).setTint(0x8f7f62).setAlpha(0);
        this.smog.push({ img, target: 0, i: idx(x, y) });
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
    if (g === "road") {
      const r = (dx: number, dy: number) => inside(x + dx, y + dy) && this.store.town.cols[idx(x + dx, y + dy)].g === "road";
      const m = (r(1, 0) ? 1 : 0) | (r(-1, 0) ? 2 : 0) | (r(0, 1) ? 4 : 0) | (r(0, -1) ? 8 : 0);
      this.ground[i].setTexture(`g-road-${m}`);
    } else this.ground[i].setTexture(groundKey(g, x, y));
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
    if (parts.length) this.applyTint(parts);
  }

  private destroyPart(p: Part) {
    p.img.destroy();
    p.glow?.destroy();
    p.extras.forEach((e) => e.destroy());
  }

  private applyTint(parts: Part[]) {
    for (const p of parts) {
      p.img.setTint(this.tintNow);
      p.extras.forEach((e) => e.setTint(this.tintNow));
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
        this.needHover = true;
      }),
      bus.on("townhall", () => {
        const p = P(TOWN_HALL.x, TOWN_HALL.y);
        this.sparkle(p.x, p.y - 60, 30);
        this.sparkle(p.x, p.y - 60, 20, 0x9cf0b0);
        if (!this.deps.reduced) this.cameras.main.shake(200, 0.002);
      }),
      bus.on("moveIn", ({ n }) => this.moveIn(n)),
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
    const spots: number[] = [];
    t.cols.forEach((c, i) => {
      if (c.g === "road") this.roads.push(i);
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
    if (a.kind === "car" || a.kind === "bus") return g === "road";
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
    if (a.kind === "bus") return `v-bus-${dirOf(dx, dy)}`;
    if (a.kind === "bike") return `c-${a.look}-${a.frame}`;
    return `p-${a.look}-${a.frame}`;
  }

  private spawn(kind: Agent["kind"], at: number, kid = false) {
    const look: string | number = kind === "car" ? pick(CAR_TYPES) : kind === "bus" ? "bus" : kid ? pick(KIDS) : pick(ADULTS);
    const a: Agent = {
      img: null as unknown as Phaser.GameObjects.Image,
      from: at,
      to: at,
      t: 1,
      speed: kind === "walker" ? (kid ? 0.75 : 0.5 + Math.random() * 0.3) : kind === "bike" ? 1.3 : kind === "bus" ? 1.1 : 1.5 + Math.random() * 0.6,
      kind,
      look,
      step: Math.random(),
      frame: 0,
      side: Math.random() < 0.5 ? -1 : 1,
      puff: Math.random() * 1000,
    };
    a.img = this.put(this.textureFor(a, 1, 0), 0, 0, 0);
    if (kind === "car" || kind === "bus") a.light = this.add.image(0, 0, "fx-beam").setScale(1 / RES).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
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

  private updateAgents(dt: number) {
    const stats = this.store.sim.stats;
    const t = this.store.town;
    const day = 0.35 + 0.65 * (1 - this.e.night);
    const hasSchool = t.cols.some((c) => c.s.includes("school"));
    // How many of each to show.
    const want = {
      car: this.roads.length >= 2 ? Math.min(40, Math.round(stats.travel.cars / 2.5)) : 0,
      bus: this.roads.length >= 2 && t.cols.some((c) => c.s.includes("bus")) ? Math.min(4, 1 + Math.floor(t.residents / 40)) : 0,
      walker: this.walkTiles.length ? Math.round(Math.min(70, 4 + t.residents / 2) * day) : 0,
      bike: this.bikeTiles.length >= 2 ? Math.min(18, Math.round((t.residents * stats.travel.covered) / 4)) : 0,
    };
    const have = { car: 0, bus: 0, walker: 0, bike: 0 };
    for (const a of this.agents) if (!a.target) have[a.kind]++;
    (Object.keys(want) as Agent["kind"][]).forEach((k) => {
      let pool = k === "car" || k === "bus" ? this.roads : k === "bike" ? this.bikeTiles : this.walkTiles;
      // Half of the people on foot start near cafés, schools, parks and plazas.
      if (k === "walker" && this.busyTiles.length && Math.random() < 0.5) pool = this.busyTiles;
      if (have[k] < want[k] && pool.length) this.spawn(k, pick(pool), k === "walker" && hasSchool && Math.random() < 0.25);
      if (have[k] > want[k]) {
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
      a.t += dt * a.speed;
      let fx: number;
      let fy: number;
      let dx = 0;
      let dy = 0;
      if (a.target) {
        const k = Math.min(1, a.t);
        fx = a.sx! + (a.target.x - a.sx!) * k;
        fy = a.sy! + (a.target.y - a.sy!) * k;
        dx = a.target.x - a.sx!;
        dy = a.target.y - a.sy!;
        if (a.t >= 1.1) {
          this.sparkle(a.img.x, a.img.y - 10, 4, 0x9cf0b0);
          this.dropAgent(a);
          this.agents.splice(n, 1);
          continue;
        }
      } else {
        if (a.t >= 1) {
          const ok = (g: string) => (a.kind === "car" || a.kind === "bus" ? g === "road" : a.kind === "bike" ? g === "bike" : PAVED.includes(g as never));
          const nb = this.neighbours(a.to, ok);
          const fwd = nb.filter((x) => x !== a.from);
          const choice = fwd.length ? pick(fwd) : nb.length ? nb[0] : a.to;
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
        if (a.kind === "car" || a.kind === "bus") {
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
        if (a.kind === "car" && !this.deps.reduced) {
          a.puff = (a.puff ?? 0) + dt * 1000;
          if (a.puff > 2600) {
            a.puff = 0;
            const back = P(fx - dx * 0.25, fy - dy * 0.25);
            this.puff(back.x, back.y - 3, 0x7d7d7d, 0.12, 0.18, 10);
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

  // ------------------------------------------------------------------ slow sync (twice a second)
  private syncSlow(first = false) {
    const t = this.store.town;
    const stats = this.store.sim.stats;
    this.e = env(t.clock);
    // Day and night: tint the world.
    const tint = dayTint(this.e);
    if (tint !== this.tintNow || first) {
      this.tintNow = tint;
      for (const g of this.ground) g.setTint(tint);
      for (const parts of this.cols) this.applyTint(parts);
    }
    // Lit windows at night in homes with people.
    const homes = new Set(stats.homes);
    const lit = this.e.night * (t.residents > 0 ? 1 : 0);
    this.cols.forEach((parts, i) => {
      const on = homes.has(i) ? lit : 0;
      // Homes light up when people live there; shops, schools and lamps light up every night.
      for (const p of parts) if (p.glow) p.glow.setAlpha((piece(p.id).housing ? on : this.e.night) * 0.95);
    });
    // Smog where the air is dirty.
    for (const s of this.smog) {
      const { x, y } = xy(s.i);
      let sum = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        if (inside(x + dx, y + dy)) sum += this.store.sim.air[idx(x + dx, y + dy)];
      s.target = Phaser.Math.Clamp((sum / 4 - 3) / 40, 0, 1) * 0.66;
    }
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

    // Smog drifts and fades.
    for (const s of this.smog) {
      const a = s.img.alpha + (s.target - s.img.alpha) * Math.min(1, dt * 1.5);
      s.img.setAlpha(a).setVisible(a > 0.01);
      if (a > 0.01 && !reduced) s.img.x += Math.sin(time / 2400 + s.i) * 0.05;
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
    // Haze follows the view and thickens with the air at homes.
    const view = cam.worldView;
    const hazeTarget = Phaser.Math.Clamp((this.store.sim.stats.homeAir - 3) / 36, 0, 1) * 0.42;
    this.haze
      .setPosition(view.x - 20, view.y - 20)
      .setSize(view.width + 40, view.height + 40)
      .setAlpha(this.haze.alpha + (hazeTarget - this.haze.alpha) * Math.min(1, dt * 2));

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

/** World tint for the time of day: warm at dawn and dusk, blue at night. */
export function dayTint(e: Env) {
  const night = e.night;
  const dusk = Math.max(0, 1 - Math.abs(e.sun - 0.15) / 0.15) * (e.sun > 0 ? 1 : 0.4);
  const mix = (a: number, b: number, t: number) => {
    const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t)) << s;
    return ch(16) | ch(8) | ch(0);
  };
  let c = mix(0xffffff, 0x5a6aa8, night * 0.85);
  c = mix(c, 0xffc49a, dusk * 0.35);
  // Quantise so tints only update when the change is visible.
  return c & 0xf8f8f8;
}

import Phaser from "phaser";
import type { Bus } from "../state/bus";
import { prefersReducedMotion, type EcoState, type EcoStore, type Selection } from "../state/store";
import { iso, type BakedTexture, type V2 } from "./art/iso";
import { FLUE_TOP, GROUND_DEPTH, HUB, bakeArt, type ArtCatalog, type ArtFonts } from "./art/textures";
import { CitizenCrowd } from "./citizens";
import {
  BARRIER_POSTS,
  BENCH,
  CRATES,
  FEEDBACK_BOX,
  FLAGPOLE,
  FLOWERBEDS,
  GRID,
  HOMES,
  KITCHEN,
  LAMPS,
  MEADOW,
  NOTICEBOARD,
  TABLES,
  TRAY_RETURN,
  TREES,
  tileAt,
} from "./layout";
import { ServiceDirector } from "./service";

export interface CitySceneDeps {
  store: EcoStore;
  bus: Bus;
  /** Device pixels per CSS pixel used for the canvas. */
  resolution: number;
  quality: "sharp" | "performance";
  fonts: ArtFonts;
  debugEl: HTMLElement | null;
  onReady(): void;
  onError(error: unknown): void;
}

type Target = "kitchen" | "noticeboard" | "meadow" | "hub";

const DEPTH = { ground: -10000, decal: -9000, ui: 100000 } as const;
/** Depth for something whose ground centre is at grid (x, y). */
const depthAt = (x: number, y: number) => (x + y) * 16;

const ISLAND = {
  minX: iso(1, GRID - 1).x,
  maxX: iso(GRID - 1, 1).x,
  minY: iso(1, 1).y - 90,
  maxY: iso(GRID - 1, GRID - 1).y + GROUND_DEPTH,
};
/** Default view: the cafeteria and its plaza, a little left of centre. */
const HOME_VIEW: V2 = iso(8.2, 6.6, 18);
const SERVICE_VIEW: V2 = iso(7.4, 7.1, 14);
const RESULTS_VIEW: V2 = iso(9.4, 6.4, 18);

const LABEL_TONES = {
  neutral: { bg: "#14241be6", fg: "#f3ecdd" },
  warn: { bg: "#5a3a12ee", fg: "#ffe2a8" },
  bad: { bg: "#5c1f18ee", fg: "#ffd9cf" },
} as const;

/** The living town: scenery, students, selection, lunch service and camera. */
export class CityScene extends Phaser.Scene {
  private deps!: CitySceneDeps;
  private art!: ArtCatalog;
  private crowd!: CitizenCrowd;
  private director!: ServiceDirector;
  private cleanups: (() => void)[] = [];
  private ambient: Phaser.Tweens.Tween[] = [];
  private puffs: Phaser.GameObjects.Image[] = [];
  private shimmers: Phaser.GameObjects.Image[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private flagCloth!: Phaser.GameObjects.Image;
  private cook!: Phaser.GameObjects.Image;
  private targets = new Map<Target, Phaser.GameObjects.Image>();
  private labels = new Set<Phaser.GameObjects.Text>();
  private selRings: Record<"kitchen" | "noticeboard" | "meadow", Phaser.GameObjects.Image> = {} as never;
  private voiceProps!: Record<"rsvp" | "feedback" | "smallPlease" | "sizes", Phaser.GameObjects.Image>;
  private sparkles: Phaser.GameObjects.Image[] = [];
  private plaques: Phaser.GameObjects.Image[] = [];
  private campus!: {
    meadow: Phaser.GameObjects.Image;
    grounds: Phaser.GameObjects.Image;
    hub: Phaser.GameObjects.Image;
    scaffold: Phaser.GameObjects.Image;
    lockPlaque: Phaser.GameObjects.Image;
    buildPlaque: Phaser.GameObjects.Image;
    hubPlaque: Phaser.GameObjects.Image;
    dust: Phaser.GameObjects.Image[];
  };
  private construction: { timers: Phaser.Time.TimerEvent[]; done: boolean } | null = null;
  private buildPulse: Phaser.Tweens.Tween | null = null;
  private reduced = false;
  private fitZoom = 1;
  private userZoom = 1;
  private drag: { x: number; y: number; scrollX: number; scrollY: number; moved: boolean } | null = null;
  private hovered: Target | null = null;
  private lastState: EcoState | null = null;
  private debugTimer = 0;
  private ringTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super("city");
  }

  init(deps: CitySceneDeps) {
    this.deps = deps;
  }

  create() {
    try {
      this.art = bakeArt(this, this.deps.fonts);
      this.buildWorld();
      this.setupCamera();
      this.setupInput();
      const state = this.deps.store.getState();
      this.reduced = prefersReducedMotion(state);
      this.crowd = new CitizenCrowd(this, this.art, this.deps.quality === "performance" ? 6 : 10);
      this.crowd.setReducedMotion(this.reduced);
      this.startAmbient();
      this.applyState(state, true);
      const { store, bus } = this.deps;
      this.cleanups.push(store.subscribe(() => this.applyState(store.getState(), false)));
      this.cleanups.push(bus.on("focus", (e) => this.focusOn(e.target, e.insetRight)));
      this.cleanups.push(bus.on("recenter", () => this.recenter()));
      this.cleanups.push(bus.on("serviceSpeed", (e) => this.director.setSpeed(e.speed)));
      this.cleanups.push(bus.on("serviceSkip", () => this.director.skip()));
      this.cleanups.push(bus.on("constructionSkip", () => this.skipConstruction()));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
      this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
      // Debug builds (?debug=1) expose the scene for inspection in devtools.
      if (this.deps.debugEl) (window as unknown as { __ecoScene?: CityScene }).__ecoScene = this;
      this.deps.onReady();
    } catch (error) {
      this.deps.onError(error);
    }
  }

  private teardown() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    this.crowd?.destroy();
  }

  // ---------------------------------------------------------------- world

  private put(tex: BakedTexture, gx: number, gy: number, depth: number) {
    const p = iso(gx, gy);
    return this.add
      .image(p.x, p.y, tex.key, tex.frame)
      .setOrigin(tex.originX, tex.originY)
      .setScale(1 / tex.scale)
      .setDepth(depth);
  }

  /** Hit area polygon for a box-shaped object, in texture pixels. */
  private boxHitArea(tex: BakedTexture, img: Phaser.GameObjects.Image, w: number, d: number, h: number, x0 = 0, y0 = 0) {
    const fw = img.frame.width;
    const fh = img.frame.height;
    const toTex = (p: V2) => ({ x: tex.originX * fw + p.x * tex.scale, y: tex.originY * fh + p.y * tex.scale });
    const pts = [
      iso(x0, y0, h),
      iso(x0 + w, y0, h),
      iso(x0 + w, y0, 0),
      iso(x0 + w, y0 + d, 0),
      iso(x0, y0 + d, 0),
      iso(x0, y0 + d, h),
    ].map(toTex);
    return new Phaser.Geom.Polygon(pts);
  }

  private makeTarget(target: Target, img: Phaser.GameObjects.Image, area: Phaser.Geom.Polygon) {
    img.setInteractive({ hitArea: area, hitAreaCallback: Phaser.Geom.Polygon.Contains, cursor: "pointer" });
    img.setData("target", target);
    this.targets.set(target, img);
  }

  private buildWorld() {
    const a = this.art;
    this.add.image(0, 0, a.ground.key, a.ground.frame).setOrigin(a.ground.originX, a.ground.originY).setScale(1 / a.ground.scale).setDepth(DEPTH.ground);

    // Water glints around the island.
    const water: V2[] = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (tileAt(x, y) !== "water") continue;
        const nearLand =
          tileAt(x + 1, y) !== "water" || tileAt(x - 1, y) !== "water" || tileAt(x, y + 1) !== "water" || tileAt(x, y - 1) !== "water";
        if (nearLand && (x * 7 + y * 13) % 4 === 0) water.push(iso(x + 0.5, y + 0.5, -GROUND_DEPTH - 6));
      }
    }
    const shimmerCount = this.deps.quality === "performance" ? 0 : 14;
    for (let i = 0; i < Math.min(shimmerCount, water.length); i++) {
      const p = water[Math.floor((i * water.length) / shimmerCount)];
      this.shimmers.push(this.add.image(p.x, p.y, a.shimmer.key, a.shimmer.frame).setScale(1 / a.shimmer.scale).setDepth(DEPTH.decal).setAlpha(0));
    }

    const ring = (tex: BakedTexture, gx: number, gy: number) => this.put(tex, gx, gy, DEPTH.decal + 1).setVisible(false);
    this.selRings.kitchen = ring(a.selKitchen, KITCHEN.x, KITCHEN.y);
    this.selRings.noticeboard = ring(a.selTile, NOTICEBOARD.x, NOTICEBOARD.y);
    this.selRings.meadow = ring(a.selMeadow, MEADOW.x, MEADOW.y);

    // Expansion plot.
    const meadow = this.put(a.meadow, MEADOW.x, MEADOW.y, depthAt(MEADOW.x + MEADOW.w / 2, MEADOW.y) - 30);
    {
      const fw = meadow.frame.width;
      const fh = meadow.frame.height;
      const s = a.meadow.scale;
      const toTex = (p: V2) => ({ x: a.meadow.originX * fw + p.x * s, y: a.meadow.originY * fh + p.y * s });
      const pts = [iso(0, 0, 14), iso(MEADOW.w, 0, 14), iso(MEADOW.w, MEADOW.d, 0), iso(0, MEADOW.d, 0)].map(toTex);
      this.makeTarget("meadow", meadow, new Phaser.Geom.Polygon(pts));
    }

    // The cafeteria and everything that shows its state.
    const kDepth = depthAt(KITCHEN.x + KITCHEN.w / 2, KITCHEN.y + KITCHEN.d / 2);
    const kitchen = this.put(a.kitchen, KITCHEN.x, KITCHEN.y, kDepth);
    this.makeTarget("kitchen", kitchen, this.boxHitArea(a.kitchen, kitchen, KITCHEN.w, KITCHEN.d, 84));
    this.cook = this.put(a.cook, KITCHEN.x, KITCHEN.y, kDepth + 0.1);
    this.positionCook(0.5);
    const pans = {
      full: this.put(a.pans.full, KITCHEN.x, KITCHEN.y, kDepth + 0.2),
      half: this.put(a.pans.half, KITCHEN.x, KITCHEN.y, kDepth + 0.2).setVisible(false),
      empty: this.put(a.pans.empty, KITCHEN.x, KITCHEN.y, kDepth + 0.2).setVisible(false),
    };
    const shutter = this.put(a.shutter, KITCHEN.x, KITCHEN.y, kDepth + 0.3).setVisible(false);
    this.voiceProps = {
      sizes: this.put(a.sizesSign, KITCHEN.x, KITCHEN.y, kDepth + 0.4).setVisible(false),
      smallPlease: this.put(a.smallPleaseSign, 7, 8, depthAt(7.5, 8.5)).setVisible(false),
      rsvp: this.put(a.rsvpSheet, NOTICEBOARD.x, NOTICEBOARD.y, depthAt(NOTICEBOARD.x + 0.5, NOTICEBOARD.y + 0.5) + 0.1).setVisible(false),
      feedback: this.put(a.feedbackBox, FEEDBACK_BOX.x, FEEDBACK_BOX.y, depthAt(FEEDBACK_BOX.x + 0.5, FEEDBACK_BOX.y + 0.5)).setVisible(false),
    };

    // Queue barriers and tray return.
    BARRIER_POSTS.forEach((bp, i) => {
      const tex = i < BARRIER_POSTS.length - 1 ? a.barrier : a.barrierEnd;
      const p = iso(bp.x, bp.y);
      this.add.image(p.x, p.y, tex.key, tex.frame).setOrigin(tex.originX, tex.originY).setScale(1 / tex.scale).setDepth(p.y + 0.2);
    });
    this.put(a.trayReturn, TRAY_RETURN.x, TRAY_RETURN.y, depthAt(TRAY_RETURN.x + 0.5, TRAY_RETURN.y + 0.5));
    const binTop = iso(TRAY_RETURN.x + 0.81, TRAY_RETURN.y + 0.45, 12);
    const scraps = this.add
      .image(binTop.x, binTop.y, a.scraps.key, a.scraps.frame)
      .setOrigin(a.scraps.originX, a.scraps.originY)
      .setScale(0.3 / a.scraps.scale)
      .setDepth(depthAt(TRAY_RETURN.x + 0.5, TRAY_RETURN.y + 0.5) + 0.2)
      .setVisible(false);

    // Council plaza.
    const board = this.put(a.noticeboard, NOTICEBOARD.x, NOTICEBOARD.y, depthAt(NOTICEBOARD.x + 0.5, NOTICEBOARD.y + 0.5));
    this.makeTarget("noticeboard", board, this.boxHitArea(a.noticeboard, board, 0.84, 0.36, 34, 0.08, 0.38));
    this.put(a.bench, BENCH.x, BENCH.y, depthAt(BENCH.x + 0.5, BENCH.y + 0.5));
    this.put(a.flagpole, FLAGPOLE.x, FLAGPOLE.y, depthAt(FLAGPOLE.x + 0.5, FLAGPOLE.y + 0.5));
    const flagTop = iso(FLAGPOLE.x + 0.5, FLAGPOLE.y + 0.5, 42);
    this.flagCloth = this.add
      .image(flagTop.x + 0.6, flagTop.y, a.flagCloth.key, a.flagCloth.frame)
      .setOrigin(a.flagCloth.originX, a.flagCloth.originY)
      .setScale(1 / a.flagCloth.scale)
      .setDepth(depthAt(FLAGPOLE.x + 0.5, FLAGPOLE.y + 0.5) + 0.1);

    for (const h of HOMES) this.put(a.homes[h.id], h.x, h.y, depthAt(h.x + 0.5, h.y + 0.5));
    TREES.forEach((t, i) => {
      const img = this.put(a.trees[`${t.kind}-${i % 2}`], t.x, t.y, depthAt(t.x + 0.5, t.y + 0.5));
      if (t.kind !== "bush") this.trees.push(img);
    });
    TABLES.forEach((t) => this.put(a.table, t.x, t.y, depthAt(t.x + 0.5, t.y + 0.5) - 0.3));
    LAMPS.forEach((l) => this.put(a.lamp, l.x, l.y, depthAt(l.x + 0.5, l.y + 0.5)));
    FLOWERBEDS.forEach((f, i) => this.put(a.flowerbeds[i % a.flowerbeds.length], f.x, f.y, depthAt(f.x + 0.5, f.y + 0.5)));
    this.put(a.crates, CRATES.x, CRATES.y, depthAt(CRATES.x + 0.5, CRATES.y + 0.5));

    // Kitchen flue steam (a small pool reused forever).
    const flue = iso(KITCHEN.x + FLUE_TOP[0], KITCHEN.y + FLUE_TOP[1], FLUE_TOP[2]);
    for (let i = 0; i < 4; i++) {
      this.puffs.push(this.add.image(flue.x, flue.y, a.puff.key, a.puff.frame).setScale(0.3).setAlpha(0).setDepth(DEPTH.ui - 10));
    }
    for (let i = 0; i < 8; i++) {
      this.sparkles.push(this.add.image(0, 0, a.sparkle.key, a.sparkle.frame).setScale(1 / a.sparkle.scale).setVisible(false).setDepth(DEPTH.ui - 5));
    }

    // Name plaques.
    const plaque = (tex: BakedTexture, at: V2) =>
      this.add.image(at.x, at.y, tex.key, tex.frame).setOrigin(tex.originX, tex.originY).setScale(1 / tex.scale).setDepth(DEPTH.ui - 30);
    this.plaques.push(plaque(a.plaqueCafeteria, iso(KITCHEN.x + 1.2, KITCHEN.y + 1.6, 96)));
    const plotTop = iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 26);
    const hubTop = iso(MEADOW.x + HUB.x + HUB.w / 2, MEADOW.y + HUB.y + HUB.d / 2, HUB.h + 30);
    const hubDepth = depthAt(MEADOW.x + HUB.x + HUB.w / 2, MEADOW.y + HUB.y + HUB.d / 2);
    const hub = this.put(a.hub, MEADOW.x, MEADOW.y, hubDepth).setVisible(false);
    this.makeTarget("hub", hub, this.boxHitArea(a.hub, hub, HUB.w, HUB.d, HUB.h + 12, HUB.x, HUB.y));
    this.campus = {
      meadow,
      grounds: this.put(a.hubGrounds, MEADOW.x, MEADOW.y, DEPTH.decal + 2).setVisible(false),
      hub,
      scaffold: this.put(a.scaffold, MEADOW.x, MEADOW.y, hubDepth + 0.5).setVisible(false),
      lockPlaque: plaque(a.plaquePlot, plotTop),
      buildPlaque: plaque(a.plaqueBuild, plotTop).setVisible(false),
      hubPlaque: plaque(a.plaqueHub, hubTop).setVisible(false),
      dust: Array.from({ length: 8 }, () =>
        this.add
          .image(0, 0, a.puff.key, a.puff.frame)
          .setTint(0xc9ad83)
          .setVisible(false)
          .setDepth(hubDepth + 1),
      ),
    };

    this.director = new ServiceDirector(
      this,
      a,
      { pans, shutter, scraps, sparkles: this.sparkles },
      {
        onProgress: (processed) => this.deps.bus.emit("serviceProgress", { processed }),
        onDone: () => this.deps.store.actions.finishService(),
        makeLabel: (text, at, tone) => this.makeLabel(text, at, tone),
        isReduced: () => this.reduced,
      },
      this.deps.quality === "performance" ? 20 : 30,
    );
  }

  private makeLabel(text: string, at: { x: number; y: number; z: number }, tone: keyof typeof LABEL_TONES) {
    const p = iso(at.x, at.y, at.z);
    const t = this.add
      .text(p.x, p.y, text, {
        fontFamily: this.deps.fonts.body,
        fontSize: "13px",
        fontStyle: "600",
        color: LABEL_TONES[tone].fg,
        backgroundColor: LABEL_TONES[tone].bg,
        padding: { x: 8, y: 5 },
        resolution: Math.max(2, this.deps.resolution * 2),
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.ui + 2);
    t.setData("base", { x: p.x, y: p.y });
    this.labels.add(t);
    t.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.labels.delete(t);
      this.layoutLabels();
    });
    this.applyLabelScale(t);
    this.layoutLabels();
    if (!this.reduced) {
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 240 });
    }
    return t;
  }

  private applyLabelScale(t: Phaser.GameObjects.Text) {
    t.setScale(1 / (this.fitZoom * this.userZoom));
  }

  /** Keeps world labels from overlapping at any zoom by nudging later ones upward. */
  private layoutLabels() {
    const list = [...this.labels].sort((a, b) => (b.getData("base").y as number) - (a.getData("base").y as number));
    const gap = 4 / (this.fitZoom * this.userZoom);
    const placed: Phaser.Geom.Rectangle[] = [];
    for (const t of list) {
      const base = t.getData("base") as { x: number; y: number };
      let y = base.y;
      const w = t.displayWidth;
      const h = t.displayHeight;
      for (let guard = 0; guard < 8; guard++) {
        const rect = new Phaser.Geom.Rectangle(base.x - w / 2, y - h, w, h);
        const hit = placed.find((r) => Phaser.Geom.Intersects.RectangleToRectangle(r, rect));
        if (!hit) break;
        y = hit.y - gap;
      }
      t.setPosition(base.x, y);
      placed.push(new Phaser.Geom.Rectangle(base.x - w / 2, y - h, w, h));
    }
  }

  private positionCook(t: number) {
    const p = iso(KITCHEN.x + 0.45 + t * 1.1, KITCHEN.y);
    this.cook.setPosition(p.x, p.y);
  }

  // ---------------------------------------------------------------- campus

  /** Shows the plot, the build prompt or the finished hub to match the save. */
  private syncCampus(state: EcoState) {
    const c = this.campus;
    const { planningHubBuilt: built, planningHubUnlocked: unlocked } = state.save.progress.campus;
    c.meadow.setVisible(!built);
    c.grounds.setVisible(built).setAlpha(1);
    c.hub.setVisible(built).setAlpha(1).setCrop();
    c.scaffold.setVisible(false);
    c.hubPlaque.setVisible(built).setScale(1 / this.art.plaqueHub.scale);
    c.lockPlaque.setVisible(!built && !unlocked);
    const promptBuild = !built && unlocked;
    c.buildPlaque.setVisible(promptBuild);
    const pulse = promptBuild && (state.phase === "building" || state.phase === "planning") && !this.reduced;
    if (pulse && !this.buildPulse) {
      const y = c.buildPlaque.y;
      this.buildPulse = this.tweens.add({ targets: c.buildPlaque, y: y - 5, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      c.buildPlaque.setData("baseY", y);
    } else if (!pulse && this.buildPulse) {
      this.buildPulse.remove();
      this.buildPulse = null;
      c.buildPlaque.setY(c.buildPlaque.getData("baseY") ?? c.buildPlaque.y);
    }
    // In build mode the plot ring stays lit so it is easy to find.
    if (state.phase === "building") this.selRings.meadow.setVisible(true).setAlpha(1);
  }

  /** Ground prep → scaffolding → the hub rises → sign and a small celebration. */
  private startConstruction() {
    const c = this.campus;
    this.buildPulse?.remove();
    this.buildPulse = null;
    this.selRings.meadow.setVisible(false);
    c.buildPlaque.setVisible(false);
    c.lockPlaque.setVisible(false);
    this.focusOn("meadow", 0);
    const timers: Phaser.Time.TimerEvent[] = [];
    this.construction = { timers, done: false };
    const finish = () => {
      if (!this.construction || this.construction.done) return;
      this.construction.done = true;
      this.deps.store.actions.finishConstruction();
    };
    if (this.reduced) {
      c.meadow.setVisible(false);
      c.grounds.setVisible(true).setAlpha(1);
      c.hub.setVisible(true).setAlpha(0).setCrop();
      c.hubPlaque.setVisible(true);
      this.tweens.add({ targets: c.hub, alpha: 1, duration: 300 });
      timers.push(this.time.delayedCall(500, finish));
      return;
    }
    const at = (ms: number, fn: () => void) => timers.push(this.time.delayedCall(ms, fn));
    const centre = iso(MEADOW.x + HUB.x + HUB.w / 2, MEADOW.y + HUB.y + HUB.d / 2, 0);
    const dustBurst = (spread: number) => {
      c.dust.forEach((d, i) => {
        const a = (i / c.dust.length) * Math.PI * 2;
        d.setPosition(centre.x + Math.cos(a) * spread * 0.6, centre.y + Math.sin(a) * spread * 0.3)
          .setVisible(true)
          .setAlpha(0.85)
          .setScale(0.4);
        this.tweens.add({
          targets: d,
          x: d.x + Math.cos(a) * spread,
          y: d.y + Math.sin(a) * spread * 0.4 - 10,
          scale: 1.2,
          alpha: 0,
          duration: 750,
          ease: "Cubic.easeOut",
        });
      });
    };
    // 1. Ground preparation.
    at(450, () => {
      c.meadow.setVisible(false);
      c.grounds.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: c.grounds, alpha: 1, duration: 400 });
      dustBurst(34);
    });
    // 2. Scaffolding and foundation.
    at(1050, () => {
      const s = 1 / this.art.scaffold.scale;
      c.scaffold.setVisible(true).setAlpha(0).setScale(s * 0.92);
      this.tweens.add({ targets: c.scaffold, alpha: 1, scale: s, duration: 350, ease: "Back.easeOut" });
    });
    // 3. The building rises from its foundation.
    at(1500, () => {
      const hub = c.hub.setVisible(true).setAlpha(1);
      const fw = hub.frame.width;
      const fh = hub.frame.height;
      hub.setCrop(0, fh, fw, 0);
      const proxy = { p: 0 };
      this.tweens.add({
        targets: proxy,
        p: 1,
        duration: 2000,
        ease: "Sine.easeInOut",
        onUpdate: () => hub.setCrop(0, fh * (1 - proxy.p), fw, fh * proxy.p),
        onComplete: () => hub.setCrop(),
      });
    });
    at(2100, () => dustBurst(26));
    at(2900, () => dustBurst(22));
    // 4. Scaffolding comes down.
    at(3600, () => this.tweens.add({ targets: c.scaffold, alpha: 0, duration: 450, onComplete: () => c.scaffold.setVisible(false) }));
    // 5. Sign and celebration.
    at(4100, () => {
      const s = 1 / this.art.plaqueHub.scale;
      c.hubPlaque.setVisible(true).setScale(0);
      this.tweens.add({ targets: c.hubPlaque, scale: s, duration: 380, ease: "Back.easeOut" });
      const top = iso(MEADOW.x + HUB.x + HUB.w / 2, MEADOW.y + HUB.y + HUB.d / 2, HUB.h + 10);
      this.sparkles.forEach((sp, i) => {
        const a = (i / this.sparkles.length) * Math.PI * 2;
        sp.setPosition(top.x, top.y).setVisible(true).setAlpha(1).setScale(0.2);
        this.tweens.add({
          targets: sp,
          x: top.x + Math.cos(a) * 34,
          y: top.y + Math.sin(a) * 18 - 8,
          scale: 0.6,
          alpha: 0,
          duration: 850,
          ease: "Cubic.easeOut",
          onComplete: () => sp.setVisible(false),
        });
      });
    });
    at(5000, finish);
  }

  /** Jumps to the finished hub; the outcome is identical. */
  private skipConstruction() {
    const k = this.construction;
    if (!k || k.done) return;
    k.timers.forEach((t) => t.remove(false));
    const c = this.campus;
    this.tweens.killTweensOf([c.grounds, c.scaffold, c.hubPlaque, ...c.dust]);
    c.dust.forEach((d) => d.setVisible(false));
    c.meadow.setVisible(false);
    c.grounds.setVisible(true).setAlpha(1);
    c.scaffold.setVisible(false);
    c.hub.setVisible(true).setAlpha(1).setCrop();
    c.hubPlaque.setVisible(true).setScale(1 / this.art.plaqueHub.scale);
    k.done = true;
    this.time.delayedCall(150, () => this.deps.store.actions.finishConstruction());
  }

  // --------------------------------------------------------------- ambient

  private startAmbient() {
    this.ambient.forEach((t) => t.remove());
    this.ambient = [];
    const reduced = this.reduced;
    this.trees.forEach((t) => t.setAngle(0));
    this.flagCloth.setScale(1 / this.art.flagCloth.scale);
    this.positionCook(0.5);
    this.puffs.forEach((p) => p.setAlpha(0));
    this.shimmers.forEach((s) => s.setAlpha(reduced ? 0.35 : 0));
    if (reduced) return;
    const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => this.ambient.push(this.tweens.add(cfg));
    this.trees.forEach((t, i) =>
      tw({ targets: t, angle: { from: -0.8, to: 0.8 }, duration: 2800 + (i % 5) * 300, delay: (i * 211) % 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }),
    );
    const fs = 1 / this.art.flagCloth.scale;
    tw({ targets: this.flagCloth, scaleX: { from: fs, to: fs * 0.84 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const cookProxy = { t: 0.5 };
    tw({
      targets: cookProxy,
      t: { from: 0.05, to: 0.95 },
      duration: 2400,
      hold: 700,
      repeatDelay: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => this.positionCook(cookProxy.t),
    });
    const top = { x: this.puffs[0]?.x ?? 0, y: this.puffs[0]?.y ?? 0 };
    this.puffs.forEach((p, i) =>
      tw({
        targets: p,
        x: { from: top.x, to: top.x + 12 },
        y: { from: top.y, to: top.y - 34 },
        scale: { from: 0.28, to: 0.8 },
        alpha: { from: 0.75, to: 0 },
        duration: 2800,
        delay: i * 700,
        repeat: -1,
        ease: "Sine.easeOut",
      }),
    );
    this.shimmers.forEach((s, i) =>
      tw({ targets: s, alpha: { from: 0, to: 0.7 }, duration: 1300, delay: (i * 397) % 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }),
    );
  }

  // ------------------------------------------------------------ state sync

  private applyState(state: EcoState, initial: boolean) {
    const prev = this.lastState;
    this.lastState = state;
    const reduced = prefersReducedMotion(state);
    if (reduced !== this.reduced || initial) {
      this.reduced = reduced;
      this.crowd?.setReducedMotion(reduced);
      if (!initial) this.startAmbient();
    }

    // Lunch service lifecycle.
    if (!initial && prev && prev.phase !== state.phase) {
      if (state.phase === "serving" && state.round) {
        this.setHover(null);
        this.crowd.setActive(false);
        this.director.start(state.round.report);
        this.focusOn("service", 0);
      } else if (state.phase === "planning") {
        this.director.reset();
        this.crowd.setActive(true);
      }
    }
    if (initial && state.phase !== "planning") this.director.reset();

    // Campus progression.
    if (!initial && prev && prev.phase !== state.phase) {
      if (state.phase === "building") {
        this.focusOn("meadow", 0);
      } else if (state.phase === "constructing") {
        this.director.reset();
        this.crowd.setActive(true);
        this.startConstruction();
      }
    }
    if (state.phase !== "constructing") this.syncCampus(state);

    if (initial || !prev || prev.selection !== state.selection || prev.introOpen !== state.introOpen || prev.phase !== state.phase) {
      const sel = state.introOpen ? null : state.phase === "planning" || state.phase === "building" ? state.selection : null;
      this.showSelection(sel);
    }
    const voice = state.save.draft.voice;
    const policy = state.save.draft.policy;
    this.setProp(this.voiceProps.rsvp, voice.rsvp, initial);
    this.setProp(this.voiceProps.feedback, voice.feedback, initial);
    this.setProp(this.voiceProps.smallPlease, voice.smallPlease, initial);
    this.setProp(this.voiceProps.sizes, policy.offerSmallServings, initial);
  }

  private setProp(img: Phaser.GameObjects.Image, visible: boolean, instant: boolean) {
    if (img.visible === visible && !img.getData("leaving")) return;
    this.tweens.killTweensOf(img);
    const s = img.getData("baseScale") ?? img.scale;
    img.setData("baseScale", s);
    if (instant || this.reduced) {
      img.setVisible(visible).setAlpha(1).setScale(s).setData("leaving", false);
      return;
    }
    if (visible) {
      img.setVisible(true).setAlpha(0).setScale(s * 0.6).setData("leaving", false);
      this.tweens.add({ targets: img, alpha: 1, scale: s, duration: 260, ease: "Back.easeOut" });
    } else {
      img.setData("leaving", true);
      this.tweens.add({ targets: img, alpha: 0, duration: 160, onComplete: () => img.setVisible(false).setData("leaving", false) });
    }
  }

  private showSelection(sel: Selection) {
    const rings = this.selRings;
    rings.kitchen.setVisible(sel === "kitchen");
    rings.noticeboard.setVisible(sel === "kitchen");
    rings.meadow.setVisible(sel === "meadow");
    this.ringTween?.remove();
    this.ringTween = null;
    const active = [rings.kitchen, rings.noticeboard, rings.meadow].filter((r) => r.visible);
    active.forEach((r) => r.setAlpha(1));
    if (!sel || this.reduced) return;
    this.ringTween = this.tweens.add({ targets: active, alpha: { from: 1, to: 0.55 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private setHover(target: Target | null) {
    if (target === this.hovered) return;
    const prev = this.hovered ? this.targets.get(this.hovered) : null;
    prev?.clearTint();
    if (this.hovered === "meadow" && this.lastState?.selection !== "meadow") this.selRings.meadow.setVisible(false);
    this.hovered = target;
    if (!target) return;
    const img = this.targets.get(target)!;
    img.setTint(0x261f12).setTintMode(Phaser.TintModes.ADD);
    if (target === "meadow" && this.lastState?.selection !== "meadow") this.selRings.meadow.setVisible(true).setAlpha(0.6);
  }

  // ---------------------------------------------------------------- camera

  private cssSize() {
    const r = this.deps.resolution;
    return { w: this.scale.width / r, h: this.scale.height / r };
  }

  private computeFitZoom() {
    const { w, h } = this.cssSize();
    const fit = Math.min(w / 820, (h - 40) / 470);
    return Math.min(2.6, Math.max(0.6, fit));
  }

  private applyZoom() {
    this.cameras.main.setZoom(this.fitZoom * this.userZoom * this.deps.resolution);
    this.labels.forEach((t) => this.applyLabelScale(t));
    this.layoutLabels();
  }

  private setupCamera() {
    const cam = this.cameras.main;
    const m = { x: 200, y: 160 };
    cam.setBounds(ISLAND.minX - m.x, ISLAND.minY - m.y, ISLAND.maxX - ISLAND.minX + m.x * 2, ISLAND.maxY - ISLAND.minY + m.y * 2);
    this.fitZoom = this.computeFitZoom();
    this.applyZoom();
    cam.centerOn(HOME_VIEW.x, HOME_VIEW.y);
    const onResize = () => {
      const mid = { x: cam.midPoint.x, y: cam.midPoint.y };
      cam.setViewport(0, 0, this.scale.width, this.scale.height);
      this.fitZoom = this.computeFitZoom();
      this.applyZoom();
      cam.centerOn(mid.x, mid.y);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.cleanups.push(() => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  private recenter() {
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    this.userZoom = 1;
    this.applyZoom();
    if (this.reduced) cam.centerOn(HOME_VIEW.x, HOME_VIEW.y);
    else cam.pan(HOME_VIEW.x, HOME_VIEW.y, 450, "Sine.easeInOut");
  }

  /** Moves the view so a place sits in the part of the screen not covered by a panel. */
  private focusOn(target: "kitchen" | "meadow" | "service" | "results", insetRight: number) {
    const cam = this.cameras.main;
    const r = this.deps.resolution;
    const world =
      target === "kitchen"
        ? HOME_VIEW
        : target === "service"
          ? SERVICE_VIEW
          : target === "results"
            ? RESULTS_VIEW
            : iso(MEADOW.x + MEADOW.w / 2 - 0.6, MEADOW.y + MEADOW.d / 2 + 0.6, 16);
    const { w, h } = this.cssSize();
    const freeW = Math.max(240, w - insetRight);
    const zc = cam.zoom;
    if (target === "kitchen" || target === "meadow") {
      const sx = (world.x - cam.worldView.x) * (zc / r);
      const sy = (world.y - cam.worldView.y) * (zc / r);
      if (sx > freeW * 0.25 && sx < freeW * 0.75 && sy > h * 0.25 && sy < h * 0.78) return;
    }
    const gx = (freeW / 2) * r;
    const gy = h * 0.54 * r;
    const cx = world.x + (this.scale.width / 2 - gx) / zc;
    const cy = world.y + (this.scale.height / 2 - gy) / zc;
    cam.panEffect.reset();
    if (this.reduced) cam.centerOn(cx, cy);
    else cam.pan(cx, cy, target === "service" || target === "results" ? 700 : 420, "Sine.easeInOut");
  }

  private setupInput() {
    const cam = this.cameras.main;
    const threshold = 6 * this.deps.resolution;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && !p.leftButtonDown()) return;
      this.drag = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, moved: false };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (d && p.isDown) {
        const dx = p.x - d.x;
        const dy = p.y - d.y;
        if (!d.moved && Math.hypot(dx, dy) > threshold) {
          d.moved = true;
          cam.panEffect.reset();
          this.setHover(null);
          this.input.setDefaultCursor("grabbing");
        }
        if (d.moved) cam.setScroll(d.scrollX - dx / cam.zoom, d.scrollY - dy / cam.zoom);
        return;
      }
      this.setHover(this.topTarget(p));
    });
    const end = (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      this.input.setDefaultCursor("default");
      if (!d || d.moved) return;
      const state = this.deps.store.getState();
      if (state.phase !== "planning" && state.phase !== "building") return;
      const hit = this.topTarget(p);
      const actions = this.deps.store.actions;
      if (hit === "kitchen" || hit === "noticeboard") actions.select("kitchen");
      else if (hit === "meadow" || hit === "hub") actions.select("meadow");
      else if (state.selection) actions.clearSelection();
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, end);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => {
      this.drag = null;
      this.input.setDefaultCursor("default");
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.setHover(null));
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      this.userZoom = Math.min(1.8, Math.max(0.7, this.userZoom * (dy > 0 ? 0.9 : 1 / 0.9)));
      cam.zoomEffect.reset();
      this.applyZoom();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.setScroll(cam.scrollX + (before.x - after.x), cam.scrollY + (before.y - after.y));
    });
  }

  private topTarget(p: Phaser.Input.Pointer): Target | null {
    const s = this.deps.store.getState();
    if (s.introOpen || (s.phase !== "planning" && s.phase !== "building")) return null;
    const hits = this.input.hitTestPointer(p) as Phaser.GameObjects.Image[];
    let best: Phaser.GameObjects.Image | null = null;
    for (const h of hits) {
      if (!h.visible || !h.getData("target")) continue;
      // While choosing a plot, only the plot responds.
      if (s.phase === "building" && h.getData("target") !== "meadow") continue;
      if (!best || h.depth > best.depth) best = h;
    }
    return best ? (best.getData("target") as Target) : null;
  }

  update(_time: number, delta: number) {
    this.crowd?.update(delta);
    if (this.director.active) this.director.update(delta);
    else this.director.updateAfter(delta);
    if (this.deps.debugEl) {
      this.debugTimer += delta;
      if (this.debugTimer > 500) {
        this.debugTimer = 0;
        const r = this.game.renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas";
        this.deps.debugEl.textContent = `${this.game.loop.actualFps.toFixed(0)} fps · ${r} · ${this.scale.width}×${this.scale.height}px · ${this.children.length} objects · ${this.tweens.getTweens().length} tweens`;
      }
    }
  }
}

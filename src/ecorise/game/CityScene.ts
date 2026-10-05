import Phaser from "phaser";
import type { Bus } from "../state/bus";
import { prefersReducedMotion, type EcoState, type EcoStore, type Selection } from "../state/store";
import { TEX_SCALE, iso, type BakedTexture, type V2 } from "./art/iso";
import { GROUND_DEPTH, bakeArt, type ArtCatalog } from "./art/textures";
import { CitizenCrowd } from "./citizens";
import {
  BENCH,
  BIN,
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
  TREES,
  tileAt,
} from "./layout";

export interface CitySceneDeps {
  store: EcoStore;
  bus: Bus;
  /** Device pixels per CSS pixel used for the canvas. */
  resolution: number;
  quality: "sharp" | "performance";
  fontFamily: string;
  debugEl: HTMLElement | null;
  onReady(): void;
  onError(error: unknown): void;
}

type Target = "kitchen" | "noticeboard" | "meadow";

const DEPTH = {
  ground: -10000,
  decal: -9000,
  ui: 100000,
} as const;

/** Depth for something whose ground centre is at grid (x, y). */
const depthAt = (x: number, y: number) => (x + y) * 16;

const ISLAND = {
  minX: iso(1, GRID - 1).x,
  maxX: iso(GRID - 1, 1).x,
  minY: iso(1, 1).y - 90,
  maxY: iso(GRID - 1, GRID - 1).y + GROUND_DEPTH,
};
const HOME_VIEW: V2 = { x: 8, y: 248 };

/** The living city: scenery, citizens, hover/selection and camera. */
export class CityScene extends Phaser.Scene {
  private deps!: CitySceneDeps;
  private art!: ArtCatalog;
  private crowd!: CitizenCrowd;
  private cleanups: (() => void)[] = [];
  private ambient: Phaser.Tweens.Tween[] = [];
  private puffs: Phaser.GameObjects.Image[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private shimmers: Phaser.GameObjects.Image[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private flagCloth!: Phaser.GameObjects.Image;
  private cook!: Phaser.GameObjects.Image;
  private cookT = 0.5;
  private targets = new Map<Target, Phaser.GameObjects.Image>();
  private hoverLabel!: Phaser.GameObjects.Text;
  private selRings: Record<"kitchen" | "noticeboard" | "meadow", Phaser.GameObjects.Image> = {} as never;
  private marker!: Phaser.GameObjects.Image;
  private plusBadge!: Phaser.GameObjects.Image;
  private voiceProps!: {
    rsvp: Phaser.GameObjects.Image;
    feedback: Phaser.GameObjects.Image;
    smallPlease: Phaser.GameObjects.Image;
    sizes: Phaser.GameObjects.Image;
  };
  private sparkles: Phaser.GameObjects.Image[] = [];
  private reduced = false;
  private fitZoom = 1;
  private userZoom = 1;
  private drag: { x: number; y: number; scrollX: number; scrollY: number; moved: boolean } | null = null;
  private hovered: Target | null = null;
  private lastState: EcoState | null = null;
  private debugTimer = 0;

  constructor() {
    super("city");
  }

  init(deps: CitySceneDeps) {
    this.deps = deps;
  }

  create() {
    try {
      this.art = bakeArt(this);
      this.buildWorld();
      this.setupCamera();
      this.setupInput();
      const state = this.deps.store.getState();
      this.reduced = prefersReducedMotion(state);
      this.crowd = new CitizenCrowd(this, this.art, this.deps.quality === "performance" ? 6 : 10);
      this.crowd.setReducedMotion(this.reduced);
      this.startAmbient();
      this.applyState(state, true);
      this.cleanups.push(this.deps.store.subscribe(() => this.applyState(this.deps.store.getState(), false)));
      this.cleanups.push(this.deps.bus.on("focus", (e) => this.focusOn(e.target, e.insetRight)));
      this.cleanups.push(this.deps.bus.on("recenter", () => this.recenter()));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
      this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
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
    return this.add.image(p.x, p.y, tex.key).setOrigin(tex.originX, tex.originY).setScale(1 / TEX_SCALE).setDepth(depth);
  }

  /** Hit area polygon for a box-shaped object, in texture pixels. */
  private boxHitArea(tex: BakedTexture, img: Phaser.GameObjects.Image, w: number, d: number, h: number, x0 = 0, y0 = 0) {
    const fw = img.frame.width;
    const fh = img.frame.height;
    const toTex = (p: V2) => ({ x: tex.originX * fw + p.x * TEX_SCALE, y: tex.originY * fh + p.y * TEX_SCALE });
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
    this.add.image(0, 0, a.ground.key).setOrigin(a.ground.originX, a.ground.originY).setScale(1 / TEX_SCALE).setDepth(DEPTH.ground);

    // Water shimmer around the island.
    const water: V2[] = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (tileAt(x, y) !== "water") continue;
        const nearLand =
          tileAt(x + 1, y) !== "water" || tileAt(x - 1, y) !== "water" || tileAt(x, y + 1) !== "water" || tileAt(x, y - 1) !== "water";
        if (nearLand && (x * 7 + y * 13) % 5 === 0) water.push(iso(x + 0.5, y + 0.5, -GROUND_DEPTH - 8));
      }
    }
    const shimmerCount = this.deps.quality === "performance" ? 0 : 12;
    for (let i = 0; i < Math.min(shimmerCount, water.length); i++) {
      const p = water[Math.floor((i * water.length) / shimmerCount)];
      this.shimmers.push(this.add.image(p.x, p.y, a.shimmer.key).setScale(1 / TEX_SCALE).setDepth(DEPTH.decal).setAlpha(0));
    }

    // Selection rings sit just above the ground.
    const ring = (tex: BakedTexture, gx: number, gy: number) => this.put(tex, gx, gy, DEPTH.decal + 1).setVisible(false);
    this.selRings.kitchen = ring(a.selKitchen, KITCHEN.x, KITCHEN.y);
    this.selRings.noticeboard = ring(a.selTile, NOTICEBOARD.x, NOTICEBOARD.y);
    this.selRings.meadow = ring(a.selMeadow, MEADOW.x, MEADOW.y);

    // Expansion meadow.
    const meadow = this.put(a.meadow, MEADOW.x, MEADOW.y, depthAt(MEADOW.x + MEADOW.w / 2, MEADOW.y) - 40);
    {
      const fw = meadow.frame.width;
      const fh = meadow.frame.height;
      const toTex = (p: V2) => ({ x: a.meadow.originX * fw + p.x * TEX_SCALE, y: a.meadow.originY * fh + p.y * TEX_SCALE });
      const pts = [iso(0, 0, 14), iso(MEADOW.w, 0, 14), iso(MEADOW.w, MEADOW.d, 0), iso(0, MEADOW.d, 0)].map(toTex);
      this.makeTarget("meadow", meadow, new Phaser.Geom.Polygon(pts));
    }
    const badgePos = iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 34);
    this.plusBadge = this.add.image(badgePos.x, badgePos.y, a.plusBadge.key).setScale(1 / TEX_SCALE).setDepth(DEPTH.ui - 1);

    // Kitchen and its activity.
    const kitchen = this.put(a.kitchen, KITCHEN.x, KITCHEN.y, depthAt(KITCHEN.x + KITCHEN.w / 2, KITCHEN.y + KITCHEN.d / 2));
    this.makeTarget("kitchen", kitchen, this.boxHitArea(a.kitchen, kitchen, KITCHEN.w, KITCHEN.d, 72));
    this.cook = this.put(a.cook, KITCHEN.x, KITCHEN.y, kitchen.depth + 0.1);
    this.positionCook(0.5);
    this.voiceProps = {
      sizes: this.put(a.sizesSign, KITCHEN.x, KITCHEN.y, kitchen.depth + 0.2).setVisible(false),
      smallPlease: this.put(a.smallPleaseSign, 7, 8, depthAt(7.5, 8.5)).setVisible(false),
      rsvp: this.put(a.rsvpSheet, NOTICEBOARD.x, NOTICEBOARD.y, depthAt(NOTICEBOARD.x + 0.5, NOTICEBOARD.y + 0.5) + 0.1).setVisible(false),
      feedback: this.put(a.feedbackBox, FEEDBACK_BOX.x, FEEDBACK_BOX.y, depthAt(FEEDBACK_BOX.x + 0.5, FEEDBACK_BOX.y + 0.5)).setVisible(false),
    };

    // Council plaza.
    const board = this.put(a.noticeboard, NOTICEBOARD.x, NOTICEBOARD.y, depthAt(NOTICEBOARD.x + 0.5, NOTICEBOARD.y + 0.5));
    this.makeTarget("noticeboard", board, this.boxHitArea(a.noticeboard, board, 0.84, 0.36, 34, 0.08, 0.38));
    this.put(a.bench, BENCH.x, BENCH.y, depthAt(BENCH.x + 0.5, BENCH.y + 0.5));
    this.put(a.flagpole, FLAGPOLE.x, FLAGPOLE.y, depthAt(FLAGPOLE.x + 0.5, FLAGPOLE.y + 0.5));
    const flagTop = iso(FLAGPOLE.x + 0.5, FLAGPOLE.y + 0.5, 42);
    this.flagCloth = this.add
      .image(flagTop.x + 0.6, flagTop.y, a.flagCloth.key)
      .setOrigin(a.flagCloth.originX, a.flagCloth.originY)
      .setScale(1 / TEX_SCALE)
      .setDepth(depthAt(FLAGPOLE.x + 0.5, FLAGPOLE.y + 0.5) + 0.1);

    for (const h of HOMES) this.put(a.homes[h.id], h.x, h.y, depthAt(h.x + 0.5, h.y + 0.5));
    TREES.forEach((t, i) => {
      const tex = a.trees[`${t.kind}-${i % 2}`];
      const img = this.put(tex, t.x, t.y, depthAt(t.x + 0.5, t.y + 0.5));
      if (t.kind !== "bush") this.trees.push(img);
    });
    TABLES.forEach((t) => this.put(a.table, t.x, t.y, depthAt(t.x + 0.5, t.y + 0.5)));
    LAMPS.forEach((l) => this.put(a.lamp, l.x, l.y, depthAt(l.x + 0.5, l.y + 0.5)));
    FLOWERBEDS.forEach((f, i) => this.put(a.flowerbeds[i % a.flowerbeds.length], f.x, f.y, depthAt(f.x + 0.5, f.y + 0.5)));
    this.put(a.bin, BIN.x, BIN.y, depthAt(BIN.x + 0.5, BIN.y + 0.5));
    this.put(a.crates, CRATES.x, CRATES.y, depthAt(CRATES.x + 0.5, CRATES.y + 0.5));

    // Chimney steam (a small pool reused forever).
    const chimneyTop = iso(KITCHEN.x + 2.36, KITCHEN.y + 0.53, 46 + 38);
    for (let i = 0; i < 4; i++) {
      this.puffs.push(this.add.image(chimneyTop.x, chimneyTop.y, a.puff.key).setScale(0.3).setAlpha(0).setDepth(DEPTH.ui - 10));
    }
    const cloudCount = this.deps.quality === "performance" ? 0 : 2;
    for (let i = 0; i < cloudCount; i++) {
      const tex = a.clouds[i % a.clouds.length];
      this.clouds.push(
        this.add
          .image(ISLAND.minX + 180 + i * 420, ISLAND.minY - 20 + i * 30, tex.key)
          .setScale(1 / TEX_SCALE)
          .setAlpha(0.92)
          .setDepth(DEPTH.ui - 20),
      );
    }

    for (let i = 0; i < 6; i++) {
      this.sparkles.push(this.add.image(0, 0, a.sparkle.key).setScale(1 / TEX_SCALE).setVisible(false).setDepth(DEPTH.ui - 5));
    }

    this.marker = this.add.image(0, 0, a.marker.key).setOrigin(a.marker.originX, a.marker.originY).setScale(1 / TEX_SCALE).setDepth(DEPTH.ui).setVisible(false);

    this.hoverLabel = this.add
      .text(0, 0, "", {
        fontFamily: this.deps.fontFamily,
        fontSize: "13px",
        fontStyle: "700",
        color: "#2d241d",
        backgroundColor: "#fffaf0",
        padding: { x: 8, y: 4 },
        resolution: Math.max(2, this.deps.resolution * 2),
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.ui + 1)
      .setVisible(false);
  }

  private positionCook(t: number) {
    const a = iso(0.55, KITCHEN.d);
    const b = iso(1.5, KITCHEN.d);
    const base = iso(KITCHEN.x, KITCHEN.y);
    this.cook.setPosition(base.x + a.x + (b.x - a.x) * t, base.y + a.y + (b.y - a.y) * t);
  }

  // --------------------------------------------------------------- ambient

  private startAmbient() {
    this.ambient.forEach((t) => t.remove());
    this.ambient = [];
    const reduced = this.reduced;
    this.trees.forEach((t) => t.setAngle(0));
    this.flagCloth.setScale(1 / TEX_SCALE, 1 / TEX_SCALE);
    this.positionCook(0.5);
    this.puffs.forEach((p) => p.setAlpha(0));
    this.shimmers.forEach((s) => s.setAlpha(reduced ? 0.35 : 0));
    this.plusBadge.setY(iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 34).y);
    if (reduced) return;

    const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => this.ambient.push(this.tweens.add(cfg));

    this.trees.forEach((t, i) =>
      tw({
        targets: t,
        angle: { from: -0.9, to: 0.9 },
        duration: 2600 + (i % 5) * 300,
        delay: (i * 211) % 1300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
    tw({ targets: this.flagCloth, scaleX: { from: 0.5, to: 0.42 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const cookProxy = { t: 0.5 };
    tw({
      targets: cookProxy,
      t: { from: 0.1, to: 0.9 },
      duration: 2600,
      hold: 900,
      repeatDelay: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => this.positionCook(cookProxy.t),
    });

    const top = { x: this.puffs[0]?.x ?? 0, y: this.puffs[0]?.y ?? 0 };
    this.puffs.forEach((p, i) =>
      tw({
        targets: p,
        x: { from: top.x, to: top.x + 10 },
        y: { from: top.y, to: top.y - 30 },
        scale: { from: 0.28, to: 0.75 },
        alpha: { from: 0.85, to: 0 },
        duration: 2600,
        delay: i * 650,
        repeat: -1,
        ease: "Sine.easeOut",
      }),
    );

    this.shimmers.forEach((s, i) =>
      tw({ targets: s, alpha: { from: 0, to: 0.75 }, duration: 1300, delay: (i * 397) % 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }),
    );
    this.clouds.forEach((c, i) =>
      tw({
        targets: c,
        x: { from: ISLAND.minX - 140 + i * 300, to: ISLAND.maxX + 140 },
        duration: 90000 - i * 15000,
        repeat: -1,
      }),
    );
    tw({
      targets: this.plusBadge,
      y: this.plusBadge.y - 4,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ----------------------------------------------------------- state sync

  private applyState(state: EcoState, initial: boolean) {
    const prev = this.lastState;
    this.lastState = state;
    const reduced = prefersReducedMotion(state);
    if (reduced !== this.reduced || initial) {
      this.reduced = reduced;
      this.crowd?.setReducedMotion(reduced);
      if (!initial) this.startAmbient();
    }
    if (initial || !prev || prev.selection !== state.selection || prev.introOpen !== state.introOpen) {
      this.showSelection(state.introOpen ? null : state.selection);
    }
    const voice = state.save.draft.voice;
    const policy = state.save.draft.policy;
    this.setProp(this.voiceProps.rsvp, voice.rsvp, initial);
    this.setProp(this.voiceProps.feedback, voice.feedback, initial);
    this.setProp(this.voiceProps.smallPlease, voice.smallPlease, initial);
    this.setProp(this.voiceProps.sizes, policy.offerSmallServings, initial);
    const cooperating = voice.smallPlease && policy.offerSmallServings;
    const wasCooperating = !!prev && prev.save.draft.voice.smallPlease && prev.save.draft.policy.offerSmallServings;
    if (!initial && cooperating && !wasCooperating) this.celebrateCooperation();
  }

  private setProp(img: Phaser.GameObjects.Image, visible: boolean, instant: boolean) {
    if (img.visible === visible && !img.getData("leaving")) return;
    this.tweens.killTweensOf(img);
    const s = 1 / TEX_SCALE;
    if (instant || this.reduced) {
      img.setVisible(visible).setAlpha(1).setScale(s).setData("leaving", false);
      return;
    }
    if (visible) {
      img.setVisible(true).setAlpha(0).setScale(s * 0.6).setData("leaving", false);
      this.tweens.add({ targets: img, alpha: 1, scale: s, duration: 260, ease: "Back.easeOut" });
    } else {
      img.setData("leaving", true);
      this.tweens.add({
        targets: img,
        alpha: 0,
        duration: 160,
        onComplete: () => img.setVisible(false).setData("leaving", false),
      });
    }
  }

  private celebrateCooperation() {
    if (this.reduced) return;
    const c = iso(KITCHEN.x + 1.05, KITCHEN.y + KITCHEN.d + 0.3, 30);
    this.sparkles.forEach((s, i) => {
      const ang = (i / this.sparkles.length) * Math.PI * 2;
      this.tweens.killTweensOf(s);
      s.setPosition(c.x, c.y).setVisible(true).setAlpha(1).setScale(0.2);
      this.tweens.add({
        targets: s,
        x: c.x + Math.cos(ang) * 26,
        y: c.y + Math.sin(ang) * 14 - 8,
        scale: 0.55,
        alpha: 0,
        duration: 650,
        ease: "Cubic.easeOut",
        onComplete: () => s.setVisible(false),
      });
    });
  }

  private ringTween: Phaser.Tweens.Tween | null = null;
  private markerTween: Phaser.Tweens.Tween | null = null;

  private showSelection(sel: Selection) {
    const rings = this.selRings;
    rings.kitchen.setVisible(sel === "kitchen");
    rings.noticeboard.setVisible(sel === "kitchen");
    rings.meadow.setVisible(sel === "meadow");
    this.plusBadge.setVisible(sel !== "meadow");
    this.ringTween?.remove();
    this.markerTween?.remove();
    this.ringTween = this.markerTween = null;
    const active = [rings.kitchen, rings.noticeboard, rings.meadow].filter((r) => r.visible);
    active.forEach((r) => r.setAlpha(1));
    if (!sel) {
      this.marker.setVisible(false);
      return;
    }
    const pos =
      sel === "kitchen"
        ? iso(KITCHEN.x + KITCHEN.w / 2, KITCHEN.y + KITCHEN.d / 2, 92)
        : iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 40);
    this.marker.setPosition(pos.x, pos.y).setVisible(true);
    if (this.reduced) return;
    this.ringTween = this.tweens.add({ targets: active, alpha: { from: 1, to: 0.55 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.markerTween = this.tweens.add({ targets: this.marker, y: pos.y - 5, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private setHover(target: Target | null) {
    if (target === this.hovered) return;
    const prev = this.hovered ? this.targets.get(this.hovered) : null;
    prev?.clearTint();
    if (this.hovered === "meadow" && this.lastState?.selection !== "meadow") this.selRings.meadow.setVisible(false);
    this.hovered = target;
    if (!target) {
      this.hoverLabel.setVisible(false);
      return;
    }
    const img = this.targets.get(target)!;
    img.setTint(0x2a2416).setTintMode(Phaser.TintModes.ADD);
    if (target === "meadow" && this.lastState?.selection !== "meadow") this.selRings.meadow.setVisible(true).setAlpha(0.6);
    const label =
      target === "kitchen" ? "Community Kitchen · Lunch Council" : target === "noticeboard" ? "Council noticeboard" : "East Meadow · expansion plot";
    const anchor =
      target === "kitchen"
        ? iso(KITCHEN.x + KITCHEN.w / 2, KITCHEN.y + KITCHEN.d / 2, 100)
        : target === "noticeboard"
          ? iso(NOTICEBOARD.x + 0.5, NOTICEBOARD.y + 0.5, 46)
          : iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 52);
    this.hoverLabel.setText(label).setPosition(anchor.x, anchor.y).setVisible(true);
  }

  // ---------------------------------------------------------------- camera

  private cssSize() {
    const r = this.deps.resolution;
    return { w: this.scale.width / r, h: this.scale.height / r };
  }

  private computeFitZoom() {
    const { w, h } = this.cssSize();
    const fit = Math.min(w / 1040, (h - 96) / 560);
    return Math.min(2.2, Math.max(0.5, fit));
  }

  private applyZoom() {
    const cam = this.cameras.main;
    cam.setZoom(this.fitZoom * this.userZoom * this.deps.resolution);
    this.hoverLabel.setScale(1 / (this.fitZoom * this.userZoom));
  }

  private setupCamera() {
    const cam = this.cameras.main;
    const m = { x: 320, y: 260 };
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
    if (this.reduced) {
      this.applyZoom();
      cam.centerOn(HOME_VIEW.x, HOME_VIEW.y);
      return;
    }
    const zoom = this.fitZoom * this.deps.resolution;
    cam.pan(HOME_VIEW.x, HOME_VIEW.y, 450, "Sine.easeInOut");
    cam.zoomTo(zoom, 450, "Sine.easeInOut", false, (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) this.applyZoom();
    });
    this.hoverLabel.setScale(1 / this.fitZoom);
  }

  /** Brings a target into the part of the view not covered by a side panel. */
  private focusOn(target: "kitchen" | "meadow", insetRight: number) {
    const cam = this.cameras.main;
    const r = this.deps.resolution;
    const world =
      target === "kitchen"
        ? iso(KITCHEN.x + KITCHEN.w / 2 - 1.2, KITCHEN.y + KITCHEN.d / 2 + 1.2, 20)
        : iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 10);
    const { w, h } = this.cssSize();
    const freeW = Math.max(200, w - insetRight);
    const zc = cam.zoom;
    const sx = (world.x - cam.worldView.x) * (zc / r);
    const sy = (world.y - cam.worldView.y) * (zc / r);
    const comfortable = sx > freeW * 0.18 && sx < freeW * 0.82 && sy > h * 0.22 && sy < h * 0.8;
    if (comfortable) return;
    const gx = (freeW / 2) * r;
    const gy = h * 0.52 * r;
    const cx = world.x + (this.scale.width / 2 - gx) / zc;
    const cy = world.y + (this.scale.height / 2 - gy) / zc;
    cam.panEffect.reset();
    if (this.reduced) cam.centerOn(cx, cy);
    else cam.pan(cx, cy, 420, "Sine.easeInOut");
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
        if (d.moved) {
          cam.setScroll(d.scrollX - dx / cam.zoom, d.scrollY - dy / cam.zoom);
        }
        return;
      }
      const hit = this.topTarget(p);
      this.setHover(hit);
    });
    const end = (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      this.input.setDefaultCursor("default");
      if (!d || d.moved) return;
      const hit = this.topTarget(p);
      const actions = this.deps.store.actions;
      if (hit === "kitchen" || hit === "noticeboard") actions.select("kitchen");
      else if (hit === "meadow") actions.select("meadow");
      else if (this.deps.store.getState().selection) actions.clearSelection();
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, end);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => {
      this.drag = null;
      this.input.setDefaultCursor("default");
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.setHover(null));

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        const before = cam.getWorldPoint(p.x, p.y);
        const factor = dy > 0 ? 0.9 : 1 / 0.9;
        this.userZoom = Math.min(1.9, Math.max(0.75, this.userZoom * factor));
        cam.zoomEffect.reset();
        this.applyZoom();
        const after = cam.getWorldPoint(p.x, p.y);
        cam.setScroll(cam.scrollX + (before.x - after.x), cam.scrollY + (before.y - after.y));
      },
    );
  }

  private topTarget(p: Phaser.Input.Pointer): Target | null {
    if (this.deps.store.getState().introOpen) return null;
    const hits = this.input.hitTestPointer(p) as Phaser.GameObjects.Image[];
    let best: Phaser.GameObjects.Image | null = null;
    for (const h of hits) if (h.getData("target") && (!best || h.depth > best.depth)) best = h;
    return best ? (best.getData("target") as Target) : null;
  }

  update(_time: number, delta: number) {
    this.crowd?.update(delta);
    if (this.deps.debugEl) {
      this.debugTimer += delta;
      if (this.debugTimer > 500) {
        this.debugTimer = 0;
        const r = this.game.renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas";
        this.deps.debugEl.textContent = `${this.game.loop.actualFps.toFixed(0)} fps · ${r} · ${this.scale.width}×${this.scale.height}px canvas · ${this.crowd?.count ?? 0} citizens · ${this.tweens.getTweens().length} tweens`;
      }
    }
  }
}

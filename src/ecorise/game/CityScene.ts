import Phaser from "phaser";
import type { Bus } from "../state/bus";
import { auditCompleted, stepsCompleted } from "../model/audit";
import { prefersReducedMotion, sustainabilityFlagRaised, type EcoState, type EcoStore, type Selection } from "../state/store";
import { iso, type BakedTexture, type V2 } from "./art/iso";
import { FLUE_TOP, GROUND_DEPTH, HUB, bakeArt, type ArtCatalog, type ArtFonts } from "./art/textures";
import { CitizenCrowd } from "./citizens";
import type { RoundReport } from "../model/report";
import type { Category } from "../model/missions";
import {
  BARRIER_POSTS,
  BENCH,
  CITY_CHANGES,
  CLASSROOM,
  GATE_TILE,
  REPLACED_HOMES,
  SCHOOL_GATE,
  START_PROPS,
  CRATES,
  DETAILS,
  FEEDBACK_BOX,
  FUTURE,
  FLAGPOLE,
  FLOWERBEDS,
  GRID,
  HOMES,
  KITCHEN,
  LAMPS,
  MEADOW,
  MISSION_BOARD,
  NOTICEBOARD,
  SUSTAIN_FLAG,
  TABLES,
  TRAY_RETURN,
  SEATS,
  TREES,
  YARD,
  jitter,
  tileAt,
} from "./layout";
import { ServiceDirector, type ServiceMoment } from "./service";

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

type Target = "kitchen" | "noticeboard" | "meadow" | "hub" | "mission";

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
  good: { bg: "#2f6b3aee", fg: "#f3ecdd" },
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
  private selRings: Record<"kitchen" | "noticeboard" | "meadow" | "mission", Phaser.GameObjects.Image> = {} as never;
  private board!: { notes: Phaser.GameObjects.Image[]; badge: Phaser.GameObjects.Text; shown: number };
  private sustain!: { pole: Phaser.GameObjects.Image; cloth: Phaser.GameObjects.Image; top: V2; raised: boolean; tween: Phaser.Tweens.Tween | null };
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
  /** Warm light at the serving hatch: ambient, brighter when selected, full during lunch. */
  private hatchGlow!: Phaser.GameObjects.Image;
  private hubGlow!: Phaser.GameObjects.Image;
  private hubGlowTween: Phaser.Tweens.Tween | null = null;
  private hubPlanters: Phaser.GameObjects.Image[] = [];
  private kitchenGold!: Phaser.GameObjects.Image;
  /** Students eating at the terrace tables (seated, legs hidden by the bench). */
  private eaters: Phaser.GameObjects.Image[] = [];
  private eaterChat: Phaser.GameObjects.Image | null = null;
  private bird!: Phaser.GameObjects.Image;
  private birdTimer: Phaser.Time.TimerEvent | null = null;
  private zoomTween: Phaser.Tweens.Tween | null = null;
  private ecoStation!: Phaser.GameObjects.Image;
  private scrapsImg!: Phaser.GameObjects.Image;
  private shutterImg!: Phaser.GameObjects.Image;
  private pansImg!: Record<"full" | "half" | "empty", Phaser.GameObjects.Image>;
  private yardRing!: Phaser.GameObjects.Image;
  /** Props that exist only in the illustrative 2050 views (hidden otherwise). */
  private future!: {
    beds: Phaser.GameObjects.Image[];
    gardeners: Phaser.GameObjects.Image[];
    compost: Phaser.GameObjects.Image;
    canopy: Phaser.GameObjects.Image;
    trees: Phaser.GameObjects.Image[];
    pots: Phaser.GameObjects.Image[];
    bags: Phaser.GameObjects.Image[];
    deadTrees: Phaser.GameObjects.Image[];
    dumpsters: Phaser.GameObjects.Image[];
    butterflies: Phaser.GameObjects.Image[];
  };
  /** Live scenery the business-as-usual 2050 withers. */
  private groundImg!: Phaser.GameObjects.Image;
  private bushes: Phaser.GameObjects.Image[] = [];
  private flowerbedImgs: Phaser.GameObjects.Image[] = [];
  private deadTreeImgs: Phaser.GameObjects.Image[] = [];
  private startProps!: {
    wasteBin: Phaser.GameObjects.Image;
    tidyBin: Phaser.GameObjects.Image;
    /** Shown after a lunch that prepared too much; cleared by the next Ripple. */
    extraBag: Phaser.GameObjects.Image;
    bags: Phaser.GameObjects.Image[];
    pots: Phaser.GameObjects.Image[];
    bareBeds: Phaser.GameObjects.Image[];
  };
  /** Each mission area's campus change (hidden until its school challenge is met). */
  private cityProps!: Record<Category, Phaser.GameObjects.Image[]>;
  private cityShown = new Set<Category>();
  /** Campus growth stage currently shown on the live campus. */
  private growthShown = -1;
  private ripplePending = false;
  /** Before the first lunch, the cafeteria is the one place that invites a tap. */
  private hint = false;
  private capturing = false;
  /** The player's own zoom before lunch, restored afterwards. */
  private preServiceZoom = 1;
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
      this.cleanups.push(bus.on("establish", () => this.establish()));
      this.cleanups.push(bus.on("serviceSpeed", (e) => this.director.setSpeed(e.speed)));
      this.cleanups.push(bus.on("serviceSkip", () => this.director.skip()));
      this.cleanups.push(bus.on("constructionSkip", () => this.skipConstruction()));
      this.cleanups.push(bus.on("captureFutures", () => this.captureFutures()));
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
    this.groundImg = this.add.image(0, 0, a.ground.key, a.ground.frame).setOrigin(a.ground.originX, a.ground.originY).setScale(1 / a.ground.scale).setDepth(DEPTH.ground);

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
    this.selRings.mission = ring(a.selTile, MISSION_BOARD.x, MISSION_BOARD.y);

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
    const hatch = iso(KITCHEN.x + 1.1, KITCHEN.y + KITCHEN.d + 0.25, 16);
    this.hatchGlow = this.add
      .image(hatch.x, hatch.y, a.glow.key, a.glow.frame)
      .setScale(1.2 / a.glow.scale)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.22)
      .setDepth(kDepth + 0.35);
    this.kitchenGold = this.put(a.selKitchen, KITCHEN.x, KITCHEN.y, DEPTH.decal + 1.5).setTint(0xe2c27a).setVisible(false);
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
    this.scrapsImg = scraps;

    // Real-world mission: the sustainability board, and the flag it can earn.
    const mDepth = depthAt(MISSION_BOARD.x + 0.5, MISSION_BOARD.y + 0.5);
    const missionBoard = this.put(a.missionBoard, MISSION_BOARD.x, MISSION_BOARD.y, mDepth);
    this.makeTarget("mission", missionBoard, this.boxHitArea(a.missionBoard, missionBoard, 1, 0.5, 42, 0, 0.35));
    const fDepth = depthAt(SUSTAIN_FLAG.x + 0.5, SUSTAIN_FLAG.y + 0.5);
    // A taller pole than the plaza's: scaled about its own base, so it stays on its tile.
    const poleScale = 1.25;
    const sustainTop = iso(SUSTAIN_FLAG.x + 0.5, SUSTAIN_FLAG.y + 0.5, 44 * poleScale);
    this.sustain = {
      pole: this.put(a.flagpole, SUSTAIN_FLAG.x, SUSTAIN_FLAG.y, fDepth)
        .setScale(poleScale / a.flagpole.scale)
        .setY(iso(SUSTAIN_FLAG.x, SUSTAIN_FLAG.y).y - 16 * (poleScale - 1))
        .setVisible(false),
      cloth: this.add
        .image(sustainTop.x + 0.6, sustainTop.y, a.sustainFlag.key, a.sustainFlag.frame)
        .setOrigin(a.sustainFlag.originX, a.sustainFlag.originY)
        .setScale(1 / a.sustainFlag.scale)
        .setDepth(fDepth + 0.1)
        .setVisible(false),
      top: sustainTop,
      raised: false,
      tween: null,
    };

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

    for (const h of HOMES) if (!REPLACED_HOMES.has(h.id)) this.put(a.homes[h.id], h.x, h.y, depthAt(h.x + 0.5, h.y + 0.5));
    // It's a school: a classroom block on the main street and a gate where students arrive.
    this.put(a.classroom, CLASSROOM.x, CLASSROOM.y, depthAt(CLASSROOM.x + CLASSROOM.w / 2, CLASSROOM.y + CLASSROOM.d / 2));
    this.put(a.schoolGate, SCHOOL_GATE.x, SCHOOL_GATE.y, depthAt(SCHOOL_GATE.x, SCHOOL_GATE.y));
    // Today's food-waste problem, gathered by the kitchen. Cleared as the campus grows.
    const at = (tex: BakedTexture, p: { x: number; y: number }, k = 1) => this.put(tex, p.x, p.y, depthAt(p.x, p.y)).setScale(k / tex.scale);
    this.cityProps = {
      water: CITY_CHANGES.water.map((p) => at(a.refillStation, p).setVisible(false)),
      energy: CITY_CHANGES.energy.map((p) => this.put(a.classroomSolar, p.x, p.y, depthAt(CLASSROOM.x + CLASSROOM.w / 2, CLASSROOM.y + CLASSROOM.d / 2) + 0.02).setVisible(false)),
      waste: CITY_CHANGES.waste.map((p) => at(a.recyclingStation, p).setVisible(false)),
      food: CITY_CHANGES.food.map((p, i) => at(a.gardenBeds[i % a.gardenBeds.length], p).setVisible(false)),
      transport: CITY_CHANGES.transport.map((p) => at(a.bikeRack, p).setVisible(false)),
    };
    this.startProps = {
      wasteBin: at(a.foodWasteBin, START_PROPS.wasteBin, 1.25),
      tidyBin: at(a.foodWasteBinTidy, START_PROPS.wasteBin, 1.25).setVisible(false),
      extraBag: at(a.bags, START_PROPS.extraBag, 1.45).setVisible(false),
      bags: START_PROPS.bags.map((b) => at(a.bags, b, 1.45)),
      pots: START_PROPS.pots.map((p) => at(a.leftoverPot, p, 1.2)),
      bareBeds: START_PROPS.bareBeds.map((b) => at(a.bareBed, b)),
    };
    // Scenery is nudged off the grid so the campus looks planted, not stamped.
    TREES.forEach((t, i) => {
      const j = jitter(i + 3, t.kind === "bush" ? 0.2 : 0.16);
      const img = this.put(a.trees[`${t.kind}-${i % 2}`], t.x + j.x, t.y + j.y, depthAt(t.x + 0.5 + j.x, t.y + 0.5 + j.y));
      if (t.kind === "bush") {
        this.bushes.push(img);
        return;
      }
      this.trees.push(img);
      // Its leafless double, shown only in the business-as-usual 2050.
      this.deadTreeImgs.push(this.put(a.deadTrees[i % 2], t.x + j.x, t.y + j.y, depthAt(t.x + 0.5 + j.x, t.y + 0.5 + j.y)).setVisible(false));
    });
    TABLES.forEach((t) => this.put(a.table, t.x, t.y, depthAt(t.x + 0.5, t.y + 0.5) - 0.3));
    LAMPS.forEach((l) => this.put(a.lamp, l.x, l.y, depthAt(l.x + 0.5, l.y + 0.5)));
    FLOWERBEDS.forEach((f, i) => this.flowerbedImgs.push(this.put(a.flowerbeds[i % a.flowerbeds.length], f.x, f.y, depthAt(f.x + 0.5, f.y + 0.5))));
    this.put(a.crates, CRATES.x, CRATES.y, depthAt(CRATES.x + 0.5, CRATES.y + 0.5));

    // Signs of school life.
    const detail = (tex: BakedTexture, at: { x: number; y: number }, lift = 0) => this.put(tex, at.x, at.y, depthAt(at.x, at.y) + lift);
    detail(a.menuBoard, DETAILS.menuBoard);
    this.ecoStation = detail(a.ecoStation, DETAILS.ecoStation);
    detail(a.mopBucket, DETAILS.mopBucket);
    DETAILS.backpacks.forEach((b) => detail(a.backpacks[b.look], b));
    // Trays sit on the table tops, so they sort just above their table.
    DETAILS.tableTrays.forEach((t) =>
      this.put(a.tableTrays[t.full ? "full" : "empty"], t.x, t.y, depthAt(Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5) - 0.2),
    );
    this.hubPlanters = DETAILS.hubPlanters.map((pl) => detail(a.planters[pl.v], pl).setVisible(false));

    // Students eating at the terrace tables.
    this.eaters = SEATS.map((seat, i) => {
      const look = a.people[(i * 5 + 2) % a.people.length];
      const tex = look[seat.facing][0];
      const p = iso(seat.x, seat.y);
      const img = this.add
        .image(p.x, p.y + 6, tex.key, tex.frame)
        .setOrigin(tex.originX, tex.originY)
        .setScale(1 / tex.scale)
        .setFlipX(i % 2 === 1)
        .setDepth(p.y + 0.5)
        .setVisible(false);
      const feet = tex.originY * img.frame.height;
      img.setCrop(0, 0, img.frame.width, feet - 10 * tex.scale);
      return img;
    });

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
    const missionPlaque = plaque(a.plaqueMission, iso(MISSION_BOARD.x + 0.5, MISSION_BOARD.y + 0.5, 50));
    this.plaques.push(missionPlaque);
    // Progress on the physical board: a pinned note per finished step, and a count on its sign.
    const plaqueW = missionPlaque.frame.width / a.plaqueMission.scale;
    this.board = {
      notes: a.boardNotes.map((t) => this.put(t, MISSION_BOARD.x, MISSION_BOARD.y, mDepth + 0.05).setVisible(false)),
      badge: this.add
        .text(missionPlaque.x + plaqueW / 2 + 7, missionPlaque.y - 19, "0/5", {
          fontFamily: this.deps.fonts.body,
          fontSize: "7px",
          fontStyle: "700",
          color: "#1f3a2a",
          backgroundColor: "#e2c27a",
          padding: { x: 3, y: 1.5 },
          resolution: 8,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH.ui - 29),
      shown: -1,
    };
    const plotTop = iso(MEADOW.x + MEADOW.w / 2, MEADOW.y + MEADOW.d / 2, 26);
    const hubTop = iso(MEADOW.x + HUB.x + HUB.w / 2, MEADOW.y + HUB.y + HUB.d / 2, HUB.h + 30);
    const hubDepth = depthAt(MEADOW.x + HUB.x + HUB.w / 2, MEADOW.y + HUB.y + HUB.d / 2);
    const hub = this.put(a.hub, MEADOW.x, MEADOW.y, hubDepth).setVisible(false);
    const hubDoor = iso(MEADOW.x + HUB.x + 0.7, MEADOW.y + HUB.y + HUB.d + 0.2, 14);
    this.hubGlow = this.add
      .image(hubDoor.x, hubDoor.y, a.glow.key, a.glow.frame)
      .setScale(1 / a.glow.scale)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(hubDepth + 0.6)
      .setVisible(false);
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
      {
        pans,
        shutter,
        scraps,
        sparkles: this.sparkles,
        yardRing: (this.yardRing = this.put(a.selYard, YARD.x, YARD.y, DEPTH.decal + 1).setTint(0xe8a04a).setVisible(false)),
      },
      {
        onProgress: (processed) => this.deps.bus.emit("serviceProgress", { processed }),
        onDone: () => this.deps.store.actions.finishService(),
        makeLabel: (text, at, tone) => this.makeLabel(text, at, tone),
        isReduced: () => this.reduced,
        onMoment: (moment, report) => this.onServiceMoment(moment, report),
      },
      this.deps.quality === "performance" ? 20 : 30,
    );

    this.bird = this.add.image(0, 0, a.bird.key, a.bird.frame).setScale(1 / a.bird.scale).setDepth(DEPTH.ui - 40).setVisible(false);
    this.shutterImg = shutter;
    this.pansImg = pans;

    // Illustrative 2050 props: built once, hidden, only shown while drawing the futures.
    const hidden = (tex: BakedTexture, at: { x: number; y: number }) => this.put(tex, at.x, at.y, depthAt(at.x, at.y)).setVisible(false);
    const mature = (kind: "round" | "pine", at: { x: number; y: number }, k = 1.3) => {
      const t = a.trees[`${kind}-0`];
      // Scaled about the trunk, which sits half a tile in from the texture origin.
      const img = this.put(t, at.x - 0.5, at.y - 0.5, depthAt(at.x, at.y)).setScale(k / t.scale).setVisible(false);
      return img.setY(img.y - 16 * (k - 1));
    };
    this.future = {
      beds: FUTURE.gardenBeds.map((b) => hidden(a.gardenBeds[b.v], b)),
      gardeners: FUTURE.gardeners.map((g) => {
        const tex = a.people[g.look % a.people.length].front[0];
        const p = iso(g.x, g.y);
        return this.add
          .image(p.x, p.y, tex.key, tex.frame)
          .setOrigin(tex.originX, tex.originY)
          .setScale(1 / tex.scale)
          .setFlipX(g.flip)
          .setDepth(p.y + 0.5)
          .setVisible(false);
      }),
      compost: hidden(a.compost, FUTURE.compost),
      canopy: hidden(a.solarCanopy, FUTURE.canopy),
      trees: FUTURE.matureTrees.map((t) => mature(t.kind, t)),
      pots: FUTURE.leftoverPots.map((p) => hidden(a.leftoverPot, p)),
      bags: FUTURE.bags.map((b) => hidden(a.bags, b)),
      deadTrees: this.deadTreeImgs,
      dumpsters: FUTURE.dumpsters.map((d) => hidden(a.dumpster, d)),
      // Life coming back: butterflies drift over the gardens once the campus grows.
      butterflies: [FUTURE.gardenBeds[0], FUTURE.gardenBeds[1], FUTURE.gardenBeds[3], FUTURE.gardenBeds[4], FUTURE.compost].map((at, i) => {
        const p = iso(at.x, at.y, 22 + (i % 2) * 8);
        const t = a.butterflies[i % a.butterflies.length];
        const img = this.add.image(p.x, p.y, t.key, t.frame).setScale(1 / t.scale).setDepth(DEPTH.ui - 50).setVisible(false);
        img.setData("home", { x: p.x, y: p.y });
        return img;
      }),
    };
  }

  /**
   * The live campus grows toward the food-smart 2050, one stage per strong
   * lunch. Stage 1 empties the bin, clears the bags and plants the bare beds;
   * then the surplus pots go and compost arrives; then shade trees; then a
   * bigger garden. With `ripple`, the changes play as a short chain spreading
   * out from the cafeteria; otherwise they simply appear.
   */
  private applyGrowth(level: number, ripple: boolean) {
    const f = this.future;
    const sp = this.startProps;
    type Change = { o: Phaser.GameObjects.Image; stage: number; kind: "clear" | "grow" };
    const changes: Change[] = [
      { o: sp.wasteBin, stage: 1, kind: "clear" },
      { o: sp.tidyBin, stage: 1, kind: "grow" },
      ...sp.bags.map((o) => ({ o, stage: 1, kind: "clear" as const })),
      { o: sp.extraBag, stage: 0, kind: "clear" },
      ...sp.bareBeds.map((o) => ({ o, stage: 1, kind: "clear" as const })),
      ...[f.beds[0], f.beds[1], f.gardeners[0], f.gardeners[1], f.butterflies[0], f.butterflies[1]].map((o) => ({ o, stage: 1, kind: "grow" as const })),
      ...sp.pots.map((o) => ({ o, stage: 2, kind: "clear" as const })),
      ...[f.compost, f.butterflies[4]].map((o) => ({ o, stage: 2, kind: "grow" as const })),
      ...f.trees.slice(0, 3).map((o) => ({ o, stage: 3, kind: "grow" as const })),
      ...[f.beds[3], f.beds[4], f.beds[5], f.gardeners[2], f.gardeners[3], ...f.trees.slice(3), f.butterflies[2], f.butterflies[3]].map((o) => ({ o, stage: 4, kind: "grow" as const })),
    ];
    const prev = Math.max(0, this.growthShown);
    this.growthShown = level;
    const animate = ripple && !this.reduced && level > prev;
    const wanted = (c: Change) => (c.kind === "clear" ? level < c.stage : level >= c.stage);
    const moving = changes.filter((c) => c.o && c.o.visible !== wanted(c));
    if (!animate) {
      changes.forEach((c) => c.o?.setVisible(wanted(c)).setAlpha(1));
      this.deps.bus.emit("growthShown", { level, rippled: ripple && level > prev });
      return;
    }
    // The chain starts at the cafeteria and spreads outward.
    const k = iso(KITCHEN.x + KITCHEN.w / 2, KITCHEN.y + KITCHEN.d / 2);
    moving.sort((a, b) => Math.hypot(a.o.x - k.x, a.o.y - k.y) - Math.hypot(b.o.x - k.x, b.o.y - k.y));
    this.rippleWave(k.x, k.y);
    // Lunch's floating labels have done their job; the campus speaks now.
    this.labels.forEach((l) => this.tweens.add({ targets: l, alpha: 0, duration: 300 }));
    let t = 250;
    let last = 0;
    moving.forEach((c, i) => {
      const o = c.o;
      // Items at the same spot (the bin and its tidy twin, a bed and its bare frame) change together.
      if (i > 0 && Math.hypot(o.x - moving[i - 1].o.x, o.y - moving[i - 1].o.y) > 6) t += 180;
      const at = t;
      last = Math.max(last, at);
      if (c.kind === "clear") {
        this.tweens.add({
          targets: o,
          alpha: 0,
          y: o.y + 4,
          duration: 380,
          delay: at,
          ease: "Quad.easeIn",
          onStart: () => this.dustAt(o.x, o.y - 6),
          onComplete: () => o.setVisible(false).setAlpha(1).setY(o.y - 4),
        });
      } else {
        const y = o.y;
        const sx = o.scaleX;
        const sy = o.scaleY;
        o.setVisible(true).setAlpha(0).setY(y + 6).setScale(sx * 0.6, sy * 0.6);
        this.tweens.add({ targets: o, alpha: 1, y, scaleX: sx, scaleY: sy, duration: 460, delay: at, ease: "Back.easeOut" });
      }
    });
    this.time.delayedCall(last + 450, () => this.deps.bus.emit("growthShown", { level, rippled: true }));
  }

  /**
   * Too much was prepared: the waste ends up by the kitchen. The bin is full
   * again and one more bag lands beside it, until a strong lunch clears it.
   */
  private wastefulLunch() {
    const sp = this.startProps;
    const binWasTidy = sp.tidyBin.visible;
    if (binWasTidy) {
      sp.tidyBin.setVisible(false);
      sp.wasteBin.setVisible(true).setAlpha(1);
      if (!this.reduced) {
        const sy = sp.wasteBin.scaleY;
        sp.wasteBin.setScale(sp.wasteBin.scaleX, sy * 0.92);
        this.tweens.add({ targets: sp.wasteBin, scaleY: sy, duration: 380, delay: 600, ease: "Back.easeOut" });
      }
    }
    const bag = sp.extraBag;
    if (bag.visible) return;
    bag.setVisible(true).setAlpha(1);
    if (this.reduced) return;
    const y = bag.y;
    bag.setAlpha(0).setY(y - 26);
    this.tweens.add({
      targets: bag,
      alpha: 1,
      y,
      duration: 520,
      delay: 900,
      ease: "Bounce.easeOut",
      onStart: () => this.dustAt(bag.x, y - 4),
      onComplete: () => this.noticeAt(bag.x, y),
    });
  }

  /**
   * Mission areas whose school challenge is met change their part of the
   * campus. On load they are simply there; a new one is revealed (once the
   * missions panel has closed) as a small chain of growth from its spot.
   */
  private syncCity(state: EcoState, initial: boolean) {
    if (this.capturing) return;
    const changed = new Set(state.save.missions.cityChanged);
    for (const cat of Object.keys(this.cityProps) as Category[]) {
      const items = this.cityProps[cat];
      if (!changed.has(cat)) {
        if (this.cityShown.has(cat)) {
          items.forEach((o) => o.setVisible(false));
          this.cityShown.delete(cat);
        }
        continue;
      }
      if (this.cityShown.has(cat)) continue;
      if (initial || this.reduced) {
        items.forEach((o) => o.setVisible(true).setAlpha(1));
        this.cityShown.add(cat);
        if (!initial) this.deps.bus.emit("cityChanged", { category: cat });
        continue;
      }
      if (state.overlay) continue; // wait until the player is back on the campus
      this.cityShown.add(cat);
      const first = items[0];
      this.cameras.main.pan(first.x, first.y - 20, 700, "Sine.easeInOut");
      this.time.delayedCall(650, () => {
        this.rippleWave(first.x, first.y);
        items.forEach((o, i) => {
          const y = o.y;
          const sx = o.scaleX;
          const sy = o.scaleY;
          o.setVisible(true).setAlpha(0).setY(y + 6).setScale(sx * 0.6, sy * 0.6);
          this.tweens.add({ targets: o, alpha: 1, y, scaleX: sx, scaleY: sy, duration: 520, delay: 250 + i * 200, ease: "Back.easeOut", onStart: () => this.dustAt(o.x, y - 6) });
        });
      });
      this.time.delayedCall(650 + 250 + items.length * 200 + 600, () => this.deps.bus.emit("cityChanged", { category: cat }));
    }
  }

  /** A brief warm ring on the ground so new waste is noticed, then gone. */
  private noticeAt(x: number, y: number) {
    const g = this.add.graphics().setDepth(DEPTH.ground + 3).setPosition(x, y);
    g.lineStyle(2, 0xe2a24b, 0.9);
    g.strokeEllipse(0, 0, 34, 16);
    g.setScale(0.6);
    this.tweens.add({ targets: g, scale: 1.6, alpha: 0, duration: 700, repeat: 1, onComplete: () => g.destroy() });
  }

  /** A soft warm wave rolling out from the cafeteria: the moment things start to change. */
  private rippleWave(x: number, y: number) {
    const g = this.add.graphics().setDepth(DEPTH.ground + 2).setPosition(x, y);
    g.fillStyle(0xfff1b8, 0.32);
    g.fillEllipse(0, 0, 120, 60);
    g.setScale(0.2).setAlpha(0.9);
    this.tweens.add({ targets: g, scale: 4.2, alpha: 0, duration: 1600, ease: "Sine.easeOut", onComplete: () => g.destroy() });
    this.glowTo(this.hatchGlow, 0.85, 300);
    this.time.delayedCall(900, () => this.glowTo(this.hatchGlow, 0.4, 900));
  }

  /** A little puff where something was cleared away. */
  private dustAt(x: number, y: number) {
    this.sparkles.slice(0, 4).forEach((s, i) => {
      const a = -Math.PI / 2 + (i - 1.5) * 0.5;
      s.setPosition(x, y).setVisible(true).setAlpha(0.9).setScale(0.22);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 12,
        scale: 0.45,
        alpha: 0,
        duration: 520,
        ease: "Cubic.easeOut",
        onComplete: () => s.setVisible(false),
      });
    });
  }

  private sparkleAt(x: number, y: number) {
    this.sparkles.forEach((s, i) => {
      const a = (i / this.sparkles.length) * Math.PI * 2;
      s.setPosition(x, y).setVisible(true).setAlpha(1).setScale(0.25);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * 34,
        y: y + Math.sin(a) * 18 - 12,
        scale: 0.7,
        alpha: 0,
        duration: 900,
        ease: "Cubic.easeOut",
        onComplete: () => s.setVisible(false),
      });
    });
  }

  // ------------------------------------------------------------ 2050 futures

  /**
   * Draws the same campus, from the same camera, as two illustrative 2050
   * scenarios and hands back both pictures. The live scene is restored
   * exactly as it was; nothing here touches game state.
   */
  private captureFutures() {
    if (this.capturing) return;
    this.capturing = true;
    const cam = this.cameras.main;
    type G = Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Alpha & Phaser.GameObjects.Components.Transform;
    const saved = this.children.list.map((o) => {
      const g = o as unknown as G;
      return { g, visible: g.visible, alpha: g.alpha, x: g.x, y: g.y, sx: g.scaleX, sy: g.scaleY, angle: g.angle };
    });
    const view = { x: cam.midPoint.x, y: cam.midPoint.y, zoom: this.userZoom };
    const crowdActive = this.crowd.isActive;
    this.tweens.pauseAll();
    this.crowd.setActive(false);
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    this.userZoom = 1;
    this.applyZoom();
    const focus = iso(9.1, 7.9, 14);
    cam.centerOn(focus.x, focus.y);

    let finished = false;
    const restore = () => {
      for (const s of saved) s.g.setVisible(s.visible).setAlpha(s.alpha).setPosition(s.x, s.y).setScale(s.sx, s.sy).setAngle(s.angle);
      this.director.setExtrasVisible(true);
      this.groundImg.clearTint();
      this.bushes.forEach((b) => b.clearTint());
      this.campus.hub.setCrop();
      this.userZoom = view.zoom;
      this.applyZoom();
      cam.centerOn(view.x, view.y);
      this.tweens.resumeAll();
      this.crowd.setActive(crowdActive);
      // Put back the live hover highlight, if the pointer is still over something.
      if (this.hovered) this.targets.get(this.hovered)?.setTint(0x3a2a12).setTintMode(Phaser.TintModes.ADD);
      this.capturing = false;
    };
    const done = (result: { bau: string; smart: string } | { error: string }) => {
      if (finished) return;
      finished = true;
      restore();
      this.deps.bus.emit("futuresCaptured", result);
    };
    // Never leave the campus in a future state if a snapshot fails.
    this.time.delayedCall(4000, () => done({ error: "timeout" }));
    try {
      const shot = (cb: (src: string) => void) =>
        this.game.renderer.snapshot((img) => {
          if (!finished) cb((img as HTMLImageElement).src);
        });
      this.applyFuture("bau");
      shot((bau) => {
        this.applyFuture("smart");
        // Phaser clears the request after this callback returns, so ask on the next tick.
        window.setTimeout(() => shot((smart) => done({ bau, smart })), 0);
      });
    } catch (error) {
      done({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Puts the campus into one of the two illustrative 2050 states. */
  private applyFuture(kind: "bau" | "smart") {
    const state = this.deps.store.getState();
    const save = state.save;
    const smart = kind === "smart";
    const hubBuilt = save.progress.campus.planningHubBuilt;
    const audited = auditCompleted(save.mission.school);
    const c = this.campus;
    const show = (o: Phaser.GameObjects.Image | Phaser.GameObjects.Text, v: boolean) => o.setVisible(v).setAlpha(1);

    // Only lasting places, no live people or labels.
    for (const o of this.children.list) if (o instanceof Phaser.GameObjects.Text) o.setVisible(false);
    // Townsfolk chat bubbles only start fading when the crowd stops, so hide them outright.
    const chat = this.art.chat;
    for (const o of this.children.list) if (o instanceof Phaser.GameObjects.Image && o.texture.key === chat.key && (chat.frame === undefined || o.frame.name === chat.frame)) o.setVisible(false);
    // A still frame: ambient motion rests in a neutral pose so both futures
    // (and repeat visits) are drawn identically apart from what was built.
    this.trees.forEach((t) => t.setAngle(0));
    // No hover or selection highlight from the live campus: plain buildings, signs at rest.
    this.targets.forEach((t) => t.clearTint());
    this.plaques[0].setScale(1 / this.art.plaqueCafeteria.scale);
    this.flagCloth.setScale(1 / this.art.flagCloth.scale);
    this.sustain.cloth.setScale(1.35 / this.art.sustainFlag.scale);
    this.positionCook(0.5);
    this.puffs.forEach((p) => p.setVisible(false));
    this.shimmers.forEach((sh) => sh.setAlpha(0.35));
    this.director.setExtrasVisible(false);
    [...Object.values(this.selRings), this.yardRing, this.kitchenGold, this.bird, c.scaffold, c.lockPlaque, c.buildPlaque, ...c.dust, ...this.sparkles].forEach((o) => o.setVisible(false));
    this.eaterChat?.setVisible(false);
    this.plaques.forEach((p, i) => show(p, i === 0));
    show(this.shutterImg, false);
    show(this.pansImg.full, true);
    show(this.pansImg.half, false);
    show(this.pansImg.empty, false);
    this.hatchGlow.setAlpha(0.3);

    // Business as usual: the plot never developed, food piles up in the yard.
    show(c.meadow, !smart);
    show(c.grounds, smart);
    show(c.hub.setCrop(), smart);
    show(c.hubPlaque, smart);
    c.hubPlaque.setScale(1 / this.art.plaqueHub.scale);
    this.hubPlanters.forEach((p) => show(p, smart));
    show(this.hubGlow, smart);
    this.hubGlow.setAlpha(smart ? 0.5 : 0);
    this.future.pots.forEach((p) => show(p, !smart));
    this.future.bags.forEach((b) => show(b, !smart));
    this.future.dumpsters.forEach((d) => show(d, !smart));
    this.future.butterflies.forEach((b) => show(b, smart));
    const sp = this.startProps;
    [sp.wasteBin, ...sp.bags, ...sp.pots, ...sp.bareBeds].forEach((o) => show(o, !smart));
    show(sp.tidyBin, false);
    show(sp.extraBag, false);
    Object.values(this.cityProps).flat().forEach((o) => show(o, smart));
    // Business as usual withers the campus: dry ground, bare trees, no flowers.
    if (smart) this.groundImg.clearTint();
    else this.groundImg.setTint(0xd2bd92);
    this.trees.forEach((t) => show(t, smart));
    this.future.deadTrees.forEach((t) => show(t, !smart));
    this.bushes.forEach((b) => (smart ? b.clearTint() : b.setTint(0xa48c5e)));
    this.flowerbedImgs.forEach((f) => show(f, smart));
    show(this.scrapsImg.setScale(1.6 / this.art.scraps.scale), !smart);
    show(this.ecoStation, smart);

    // Food-smart: compost feeds a student garden, shade over seating, mature trees.
    show(this.future.compost, smart);
    this.future.beds.forEach((b, i) => show(b, smart && (i !== 2 || audited)));
    this.future.gardeners.forEach((g) => show(g, smart));
    this.future.trees.forEach((t) => show(t, smart));
    // The upgraded Planning Hub gets a shaded, solar-roofed meeting spot.
    show(this.future.canopy, smart && hubBuilt);

    // A lively terrace, and the Sustainability Board as the audit left it.
    this.eaters.forEach((e, i) => show(e, smart ? true : i < 2));
    const notes = smart && audited ? 5 : smart ? stepsCompleted(save.mission.school) : 0;
    this.board.notes.forEach((n, i) => show(n, i < notes));
    const flag = smart && sustainabilityFlagRaised(save);
    show(this.sustain.pole, flag);
    show(this.sustain.cloth, flag);
    if (flag) this.sustain.cloth.setPosition(this.sustain.top.x + 0.6, this.sustain.top.y);
  }

  // --------------------------------------------------------- lunch moments

  private glowTo(img: Phaser.GameObjects.Image, alpha: number, duration = 300) {
    this.tweens.killTweensOf(img);
    if (this.reduced || duration === 0) img.setAlpha(alpha);
    else this.tweens.add({ targets: img, alpha, duration, ease: "Sine.easeOut" });
  }

  /** Smooth zoom about the view centre; instant with reduced motion. */
  private zoomTo(z: number, duration: number) {
    this.zoomTween?.remove();
    this.zoomTween = null;
    if (this.reduced || duration === 0) {
      this.userZoom = z;
      this.applyZoom();
      return;
    }
    const proxy = { z: this.userZoom };
    this.zoomTween = this.tweens.add({
      targets: proxy,
      z,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.userZoom = proxy.z;
        this.applyZoom();
      },
    });
  }

  private onServiceMoment(moment: ServiceMoment, report: RoundReport) {
    if (moment === "open") {
      // Lunch has started: the hatch lights up and the camera leans in.
      this.setEaters(0);
      // The bin and the extra bag show the latest lunch only: a new lunch starts from the campus as it now is.
      const sp = this.startProps;
      sp.extraBag.setVisible(false);
      if (this.growthShown >= 1) {
        sp.wasteBin.setVisible(false);
        sp.tidyBin.setVisible(true).setAlpha(1);
      }
      this.kitchenGold.setVisible(false);
      this.hatchGlow.setAlpha(0.2);
      this.glowTo(this.hatchGlow, 0.95, 450);
      this.preServiceZoom = this.userZoom;
      if (!this.reduced) this.zoomTo(Math.min(1.8, this.userZoom * 1.1), 800);
      const cue = this.makeLabel("Lunch is served", { x: KITCHEN.x + 1.1, y: KITCHEN.y + KITCHEN.d + 0.2, z: 44 }, "neutral");
      this.time.delayedCall(1300, () => cue.active && cue.destroy());
      return;
    }
    if (moment === "food-out") {
      // The last portion is gone: lights drop, a small jolt.
      this.glowTo(this.hatchGlow, 0.05, 200);
      if (!this.reduced) this.cameras.main.shake(180, 0.0022);
      return;
    }
    // Finale: the terrace and lighting reflect how lunch went.
    const great = report.stars.count === 3;
    const fed = report.player.fed;
    this.zoomTo(this.preServiceZoom, 700);
    if (!report.timeline.foodRanOutAt) this.glowTo(this.hatchGlow, fed ? 0.35 : 0.15, 600);
    this.setEaters(great ? 7 : fed ? 3 : 0, true);
    if (fed && !report.stars.lowWaste) this.wastefulLunch();
    if (great) {
      const ring = this.kitchenGold.setVisible(true).setAlpha(0);
      if (this.reduced) ring.setAlpha(0.45);
      else this.tweens.add({ targets: ring, alpha: { from: 0, to: 0.9 }, duration: 500, yoyo: true, onComplete: () => ring.setAlpha(0.45) });
    }
  }

  /** Shows `count` seated students at the terrace tables. */
  private setEaters(count: number, animate = false) {
    this.eaterChat?.destroy();
    this.eaterChat = null;
    this.eaters.forEach((e, i) => {
      const show = i < count;
      this.tweens.killTweensOf(e);
      if (!show) {
        e.setVisible(false);
        return;
      }
      e.setVisible(true).setAlpha(1);
      if (animate && !this.reduced) {
        e.setAlpha(0);
        this.tweens.add({ targets: e, alpha: 1, duration: 300, delay: 200 + i * 110 });
      }
    });
    if (count >= 2 && !this.reduced) {
      const e = this.eaters[0];
      const t = this.art.chat;
      this.eaterChat = this.add
        .image(e.x + 4, e.y - 26, t.key, t.frame)
        .setOrigin(t.originX, t.originY)
        .setScale(1 / t.scale)
        .setDepth(e.depth + 2000)
        .setAlpha(0);
      this.tweens.add({ targets: this.eaterChat, alpha: 1, duration: 200, delay: 900, hold: 1800, yoyo: true, repeat: -1, repeatDelay: 2600 });
    }
  }

  /** Every so often a bird crosses the sky. */
  private scheduleBird() {
    this.birdTimer?.remove();
    this.birdTimer = this.time.delayedCall(9000 + Math.random() * 16000, () => {
      if (!this.reduced && this.deps.quality !== "performance") this.flyBird();
      this.scheduleBird();
    });
  }

  private flyBird() {
    const view = this.cameras.main.worldView;
    const y = view.y + view.height * (0.12 + Math.random() * 0.25);
    const ltr = Math.random() < 0.5;
    const x0 = ltr ? view.x - 20 : view.right + 20;
    const x1 = ltr ? view.right + 20 : view.x - 20;
    const s = 1 / this.art.bird.scale;
    const b = this.bird.setPosition(x0, y).setVisible(true).setScale(s).setFlipX(!ltr);
    this.tweens.killTweensOf(b);
    this.tweens.add({ targets: b, x: x1, y: y - 30, duration: 7000, ease: "Linear", onComplete: () => b.setVisible(false) });
    this.tweens.add({ targets: b, scaleY: { from: s, to: s * 0.35 }, duration: 180, yoyo: true, repeat: 18 });
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
    const { planningHubBuilt: built, planningHubUnlocked: saved } = state.save.progress.campus;
    // The unlock is saved when lunch is served, but revealed only with the results.
    const unlocked = saved && !(state.phase === "serving" && state.round?.unlockedPlanningHub);
    c.meadow.setVisible(!built);
    c.grounds.setVisible(built).setAlpha(1);
    c.hub.setVisible(built).setAlpha(1).setCrop();
    c.scaffold.setVisible(false);
    c.hubPlaque.setVisible(built).setScale(1 / this.art.plaqueHub.scale);
    this.setHubLights(built, false);
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

  /** The board shows real (school) progress only: demo data never changes the campus. */
  private syncBoard(done: number, instant: boolean) {
    const b = this.board;
    if (done === b.shown) return;
    const grew = done > b.shown && b.shown >= 0;
    b.badge.setText(done >= 5 ? "✓ 5/5" : `${done}/5`);
    b.notes.forEach((n, i) => {
      const s = 1 / this.art.boardNotes[i].scale;
      const visible = i < done;
      this.tweens.killTweensOf(n);
      n.setVisible(visible).setAlpha(1).setScale(s);
      if (visible && grew && i >= b.shown && !instant && !this.reduced) {
        n.setAlpha(0);
        this.tweens.add({ targets: n, alpha: 1, duration: 380, delay: (i - b.shown) * 120, ease: "Sine.easeOut" });
      }
    });
    if (grew && !instant && !this.reduced) {
      const s = b.badge.scale;
      this.tweens.add({ targets: b.badge, scale: { from: s * 1.5, to: s }, duration: 420, ease: "Back.easeOut" });
    }
    b.shown = done;
  }

  /** Hub windows lit and planters out once it stands; students visit it more. */
  private setHubLights(on: boolean, animate: boolean) {
    this.hubPlanters.forEach((pl, i) => {
      if (on === pl.visible) return;
      pl.setVisible(on).setAlpha(1);
      if (on && animate && !this.reduced) {
        const s = pl.scale;
        pl.setScale(0);
        this.tweens.add({ targets: pl, scale: s, duration: 320, delay: i * 140, ease: "Back.easeOut" });
      }
    });
    this.crowd?.setHubBuilt(on);
    if (on === this.hubGlow.visible) return;
    this.hubGlowTween?.remove();
    this.hubGlowTween = null;
    this.hubGlow.setVisible(on);
    if (!on) return;
    this.hubGlow.setAlpha(animate && !this.reduced ? 0 : 0.45);
    if (this.reduced) return;
    // A slow pulse from the information screen inside.
    this.hubGlowTween = this.tweens.add({
      targets: this.hubGlow,
      alpha: { from: 0.32, to: 0.58 },
      duration: 2200,
      delay: animate ? 400 : 0,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** The Campus Sustainability Flag: hidden, or raised up its pole once. */
  private syncFlag(raised: boolean, instant: boolean) {
    const f = this.sustain;
    if (raised === f.raised) return;
    f.raised = raised;
    f.tween?.remove();
    f.tween = null;
    const s = 1.35 / this.art.sustainFlag.scale;
    f.pole.setVisible(raised);
    f.cloth.setVisible(raised).setScale(s).setPosition(f.top.x + 0.6, f.top.y);
    if (!raised || instant || this.reduced) return;
    // Hoist from near the ground, then a short wave and a sparkle.
    f.cloth.setY(f.top.y + 44).setScale(s * 0.9, s);
    f.tween = this.tweens.add({
      targets: f.cloth,
      y: f.top.y,
      duration: 1600,
      ease: "Sine.easeOut",
      onComplete: () => {
        f.tween = this.tweens.add({ targets: f.cloth, scaleX: { from: s, to: s * 0.84 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        this.sparkles.forEach((sp, i) => {
          if (i > 4) return;
          const a = (i / 5) * Math.PI * 2;
          sp.setPosition(f.top.x + 10, f.top.y + 6).setVisible(true).setAlpha(1).setScale(0.18);
          this.tweens.add({
            targets: sp,
            x: f.top.x + 10 + Math.cos(a) * 22,
            y: f.top.y + 6 + Math.sin(a) * 12,
            scale: 0.45,
            alpha: 0,
            duration: 750,
            ease: "Cubic.easeOut",
            onComplete: () => sp.setVisible(false),
          });
        });
      },
    });
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
      this.setHubLights(true, false);
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
    // The building settles: a soft thud of dust.
    at(3520, () => {
      dustBurst(40);
      this.cameras.main.shake(140, 0.0018);
    });
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
    // Lights on, planters out.
    at(4300, () => this.setHubLights(true, true));
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
    this.setHubLights(true, false);
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
        this.kitchenGold.setVisible(false);
        this.setEaters(2);
        this.glowTo(this.hatchGlow, 0.22, 500);
      }
    }
    // A strong lunch's growth plays as the Ripple shortly after the results land; anything else
    // (a reload, a demo reset) simply shows the current stage.
    const growth = state.save.story.growth;
    if (growth !== this.growthShown && !this.capturing && !this.ripplePending) {
      if (!initial && state.phase === "results" && growth > this.growthShown) {
        this.ripplePending = true;
        this.time.delayedCall(this.reduced ? 500 : 1200, () => {
          this.ripplePending = false;
          const now = this.deps.store.getState().save.story.growth;
          if (now !== this.growthShown) this.applyGrowth(now, now > this.growthShown);
        });
      } else {
        this.applyGrowth(growth, false);
      }
    }

    this.syncCity(state, initial);

    if (initial) {
      if (state.phase !== "planning") this.director.reset();
      this.setEaters(2);
      this.scheduleBird();
    }

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
    this.syncFlag(sustainabilityFlagRaised(state.save), initial);
    this.syncBoard(stepsCompleted(state.save.mission.school), initial);
    // The audit sign steps aside while lunch and its consequences play out.
    const quietSign = state.phase === "serving" || state.phase === "results" || state.phase === "constructing";
    this.plaques[1].setVisible(!quietSign);
    this.board.badge.setVisible(!quietSign);

    const hint = state.phase === "planning" && !state.introOpen && !state.selection && !state.overlay && state.save.progress.last === null;
    if (initial || !prev || prev.selection !== state.selection || prev.introOpen !== state.introOpen || prev.phase !== state.phase || hint !== this.hint) {
      this.hint = hint;
      const sel = state.introOpen ? null : state.phase === "planning" || state.phase === "building" ? state.selection : null;
      this.showSelection(sel);
      this.syncLabels();
      if (!initial && sel && prev?.selection !== sel) this.selectPulse(sel);
      if (state.phase === "planning" && !state.introOpen) this.glowTo(this.hatchGlow, sel === "kitchen" ? 0.55 : 0.22, 350);
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
    rings.mission.setVisible(sel === "mission");
    this.ringTween?.remove();
    this.ringTween = null;
    if (this.hint && !sel) rings.kitchen.setVisible(true);
    const active = [rings.kitchen, rings.noticeboard, rings.meadow, rings.mission].filter((r) => r.visible);
    active.forEach((r) => r.setAlpha(1));
    if ((!sel && !this.hint) || this.reduced) return;
    this.ringTween = this.tweens.add({ targets: active, alpha: { from: 1, to: 0.55 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /**
   * World labels stay out of the way: a place's sign shows on hover or
   * selection (and the cafeteria's as the first-lunch hint). The "Build here"
   * prompt is always shown when it applies.
   */
  private syncLabels() {
    const st = this.lastState;
    const sel = st && !st.introOpen ? st.selection : null;
    const h = this.hovered;
    const c = this.campus;
    const want = (pl: Phaser.GameObjects.Image | Phaser.GameObjects.Text, on: boolean) => {
      const a = on ? 1 : 0;
      // Compare with where the label is heading, not where a running fade has got to.
      if (pl.getData("labelTarget") === a) return;
      pl.setData("labelTarget", a);
      (pl.getData("labelFade") as Phaser.Tweens.Tween | undefined)?.remove();
      if (this.reduced) pl.setAlpha(a);
      else pl.setData("labelFade", this.tweens.add({ targets: pl, alpha: a, duration: on ? 160 : 220 }));
    };
    want(this.plaques[0], this.hint || h === "kitchen" || h === "noticeboard" || sel === "kitchen");
    const mission = h === "mission" || sel === "mission";
    want(this.plaques[1], mission);
    want(this.board.badge, mission);
    const plot = h === "meadow" || h === "hub" || sel === "meadow";
    want(c.lockPlaque, plot);
    want(c.hubPlaque, plot);
  }

  /** The sign floating over each clickable place. */
  private plaqueFor(target: Target | Selection): Phaser.GameObjects.Image | null {
    const c = this.campus;
    if (target === "kitchen" || target === "noticeboard") return this.plaques[0];
    if (target === "mission") return this.plaques[1];
    if (target === "hub") return c.hubPlaque;
    if (target === "meadow") return c.buildPlaque.visible ? c.buildPlaque : c.hubPlaque.visible ? c.hubPlaque : c.lockPlaque;
    return null;
  }

  private ringFor(target: Target | Selection): Phaser.GameObjects.Image | null {
    if (target === "kitchen" || target === "noticeboard") return this.selRings.kitchen;
    if (target === "mission") return this.selRings.mission;
    if (target === "meadow" || target === "hub") return this.selRings.meadow;
    return null;
  }

  /** Stops a sign's scale tweens, leaving the "Build here" bob running. */
  private stopScaleTweens(pl: Phaser.GameObjects.Image) {
    for (const t of this.tweens.getTweensOf(pl)) if (t !== this.buildPulse) t.remove();
  }

  /** Raises a sign a little (it grows upward from its pointer). */
  private liftPlaque(pl: Phaser.GameObjects.Image | null, up: boolean) {
    if (!pl || !pl.visible) return;
    const base = (pl.getData("baseScale") as number | undefined) ?? pl.scale;
    pl.setData("baseScale", base);
    this.stopScaleTweens(pl);
    const scale = up ? base * 1.12 : base;
    if (this.reduced) pl.setScale(scale);
    else this.tweens.add({ targets: pl, scale, duration: 140, ease: "Quad.easeOut" });
  }

  /** Warm rim light, a soft ground highlight and a lifted sign. Restrained, never bouncy. */
  private setHover(target: Target | null) {
    if (target === this.hovered) return;
    const prevTarget = this.hovered;
    if (prevTarget) {
      this.targets.get(prevTarget)?.clearTint();
      this.liftPlaque(this.plaqueFor(prevTarget), false);
      const ring = this.ringFor(prevTarget);
      const sel = this.lastState?.selection ?? null;
      if (ring && ring !== this.ringFor(sel)) ring.setVisible(false);
      if (prevTarget === "kitchen" && sel !== "kitchen" && this.lastState?.phase === "planning") this.glowTo(this.hatchGlow, 0.22, 250);
    }
    this.hovered = target;
    this.syncLabels();
    if (!target) return;
    const img = this.targets.get(target)!;
    img.setTint(0x3a2a12).setTintMode(Phaser.TintModes.ADD);
    this.liftPlaque(this.plaqueFor(target), true);
    const ring = this.ringFor(target);
    if (ring && !ring.visible) ring.setVisible(true).setAlpha(0.5);
    if (target === "kitchen" && this.lastState?.phase === "planning") this.glowTo(this.hatchGlow, 0.5, 200);
  }

  /** Immediate feedback when a place is chosen: the ring flashes and the sign pops. */
  private selectPulse(sel: Exclude<Selection, null>) {
    if (this.reduced) return;
    const ring = this.ringFor(sel);
    if (ring) {
      this.ringTween?.pause();
      ring.setAlpha(1);
      this.tweens.add({ targets: ring, alpha: { from: 1, to: 0.35 }, duration: 160, yoyo: true, onComplete: () => this.ringTween?.resume() });
    }
    const pl = this.plaqueFor(sel);
    if (pl && pl.visible) {
      const base = (pl.getData("baseScale") as number | undefined) ?? pl.scale;
      pl.setData("baseScale", base);
      this.stopScaleTweens(pl);
      pl.setScale(base * 1.2);
      this.tweens.add({ targets: pl, scale: base, duration: 260, ease: "Back.easeOut" });
    }
    if (sel === "kitchen") {
      this.hatchGlow.setAlpha(0.9);
      this.glowTo(this.hatchGlow, 0.55, 500);
    }
  }

  // ---------------------------------------------------------------- camera

  private cssSize() {
    const r = this.deps.resolution;
    return { w: this.scale.width / r, h: this.scale.height / r };
  }

  private computeFitZoom() {
    const { w, h } = this.cssSize();
    // A touch closer than "fit everything": a miniature world you lean over.
    const fit = Math.min(w / 780, (h - 40) / 450);
    return Math.min(2.6, Math.max(0.6, fit));
  }

  /** Opening shot: start a little wider and settle on the campus. */
  private establish() {
    this.crowd.arriveFromGate(GATE_TILE, 4);
    if (this.reduced) return;
    const cam = this.cameras.main;
    const z = { v: 0.84 };
    this.userZoom = z.v;
    this.applyZoom();
    cam.centerOn(HOME_VIEW.x, HOME_VIEW.y - 20);
    this.tweens.add({
      targets: z,
      v: 1,
      duration: 2600,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.userZoom = z.v;
        this.applyZoom();
        cam.centerOn(HOME_VIEW.x, HOME_VIEW.y - 20 * (1 - (z.v - 0.84) / 0.16));
      },
    });
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
  private focusOn(target: "kitchen" | "meadow" | "mission" | "service" | "results", insetRight: number) {
    const cam = this.cameras.main;
    const r = this.deps.resolution;
    const world =
      target === "kitchen"
        ? HOME_VIEW
        : target === "service"
          ? SERVICE_VIEW
          : target === "results"
            ? RESULTS_VIEW
            : target === "mission"
              ? iso(MISSION_BOARD.x + 0.2, MISSION_BOARD.y + 0.3, 20)
              : iso(MEADOW.x + MEADOW.w / 2 - 0.6, MEADOW.y + MEADOW.d / 2 + 0.6, 16);
    const { w, h } = this.cssSize();
    const freeW = Math.max(240, w - insetRight);
    const zc = cam.zoom;
    if (target === "kitchen" || target === "meadow" || target === "mission") {
      const sx = (world.x - cam.worldView.x) * (zc / r);
      const sy = (world.y - cam.worldView.y) * (zc / r);
      if (sx > freeW * 0.25 && sx < freeW * 0.75 && sy > h * 0.25 && sy < h * 0.78) {
        // Already in view: just lean a little toward it.
        if (this.reduced) return;
        const gx0 = (freeW / 2) * r;
        const gy0 = h * 0.54 * r;
        const ix = world.x + (this.scale.width / 2 - gx0) / zc;
        const iy = world.y + (this.scale.height / 2 - gy0) / zc;
        const mx = cam.midPoint.x + (ix - cam.midPoint.x) * 0.25;
        const my = cam.midPoint.y + (iy - cam.midPoint.y) * 0.25;
        if (Math.hypot(mx - cam.midPoint.x, my - cam.midPoint.y) * zc > 3 * r) {
          cam.panEffect.reset();
          cam.pan(mx, my, 380, "Sine.easeOut");
        }
        return;
      }
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
      else if (hit === "mission") actions.openMission();
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
    if (this.capturing) return;
    this.crowd?.update(delta);
    if (this.director.active) this.director.update(delta);
    else this.director.updateAfter(delta);
    if (this.deps.debugEl) {
      this.debugTimer += delta;
      if (this.debugTimer > 500) {
        this.debugTimer = 0;
        const r = this.game.renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas";
        const css = this.cssSize();
        this.deps.debugEl.textContent = `${this.game.loop.actualFps.toFixed(0)} fps · ${r} · ${Math.round(css.w)}×${Math.round(css.h)} css @${this.deps.resolution}x (${this.scale.width}×${this.scale.height}px) · ${this.deps.quality} · ${this.children.length} objects`;
      }
    }
  }
}

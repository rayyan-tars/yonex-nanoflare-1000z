/**
 * The game store: owns the town and simulation, runs the clock, saves, and
 * exposes actions for the UI and the scene. The town is mutable; anything
 * that changes it bumps `rev` so React re-renders and emits a bus event so
 * the scene can animate exactly what changed.
 */
import type { HeatResult } from "../model/heat";
import { piece, type Category } from "../model/pieces";
import { deserialize, SAVE_KEY, serialize } from "../model/save";
import { advectAir, airInputs, airLabel, analyze, catchUp, collectTaxes, env, newSim, tick, type Sim, type SimEvent } from "../model/sim";
import { WORLDS } from "../model/worlds";
import { TOWN_HALL, canPlace, idx, newTown, place, remove, removeInfo, thUpgradeCheck, top, upgradeTownHall, type Town } from "../model/world";

export type Tool = { kind: "none" } | { kind: "build"; id: string } | { kind: "remove" };
export type Panel = null | "townhall" | "stars" | "settings" | "intro" | "worlds" | "complete" | "goals";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "warn";
}

export interface BusEvents {
  col: { i: number; change: "add" | "remove" | "ground" };
  moveIn: { n: number };
  goal: { id: string };
  world: { index: number };
  townhall: { level: number };
  collect: { amount: number };
  fail: { i: number; reason: string };
  reset: Record<string, never>;
  focus: { i: number };
  /** Eco Pulse: a polluting chimney closed and the neighbourhood clears (start), then settles (end). */
  pulse: { i: number; phase: "start" | "end" };
  /** A heatwave ended; the town's resilience score. */
  heatEnd: { score: number };
}

export class Bus {
  private map = new Map<keyof BusEvents, Set<(p: never) => void>>();
  on<K extends keyof BusEvents>(k: K, fn: (p: BusEvents[K]) => void) {
    if (!this.map.has(k)) this.map.set(k, new Set());
    this.map.get(k)!.add(fn as (p: never) => void);
    return () => void this.map.get(k)!.delete(fn as (p: never) => void);
  }
  emit<K extends keyof BusEvents>(k: K, p: BusEvents[K]) {
    this.map.get(k)?.forEach((fn) => (fn as (p: BusEvents[K]) => void)(p));
  }
}

const SETTINGS_KEY = "greenhold.settings.v1";
const PROGRESS_KEY = "greenhold.worlds.v1";

/** Which worlds are open and which are finished (kept across towns). */
export interface Progress {
  unlocked: number;
  done: number[];
}
const TICK = 0.25;
/** Eco Pulse: how long it lasts (ms), and how many air steps it fast-forwards (16 a second at normal speed, so 30 s). */
export const PULSE_MS = 2600;
const PULSE_STEPS = 480;

function readLS(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode): the game still plays, it just won't remember.
  }
}

function freshTown(now: number, world: number) {
  const t = newTown(Math.floor(Math.random() * 1e9), now, world);
  // The village is already lived in.
  t.residents = analyze(t, new Float32Array(t.cols.length)).housing;
  return t;
}

export class GameStore {
  readonly bus = new Bus();
  town!: Town;
  sim!: Sim;
  rev = 0;
  tool: Tool = { kind: "none" };
  category: Category | null = null;
  panel: Panel = null;
  selected: number | null = null;
  sound = true;
  toasts: Toast[] = [];
  awayFor = 0;
  saveState: "new" | "loaded" | "repaired" = "new";
  progress: Progress = { unlocked: 0, done: [] };
  /** How the town coped with the last heatwave (shown until dismissed). */
  heatResult: HeatResult | null = null;
  /** Eco Vision: the environmental X-ray overlay. */
  ecoVision = false;
  /** While an Eco Pulse runs: where, and when it started (performance.now). */
  pulse: { i: number; start: number } | null = null;
  private pulseTimer = 0;
  /** Shop pictures drawn by the game art. */
  previews: Record<string, string> = {};
  /** Screen position (CSS px) of a column, set by the scene. */
  screenOf: ((i: number) => { x: number; y: number }) | null = null;
  /** The part of the map in view, in tiles (set by the scene, for the minimap). */
  viewTiles: (() => { x: number; y: number }[]) | null = null;
  private listeners = new Set<() => void>();
  private timer = 0;
  private saveTimer = 0;
  private toastId = 0;
  private lastPersist = 0;

  constructor(readonly now: () => number = () => Date.now()) {
    this.load();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getRev = () => this.rev;
  changed() {
    this.rev++;
    this.listeners.forEach((fn) => fn());
  }

  private load() {
    try {
      const p = JSON.parse(readLS(PROGRESS_KEY) ?? "null");
      if (p && Number.isInteger(p.unlocked) && Array.isArray(p.done))
        this.progress = { unlocked: Math.min(WORLDS.length - 1, Math.max(0, p.unlocked)), done: p.done.filter((d: unknown) => Number.isInteger(d)) };
    } catch {
      // No progress yet.
    }
    const now = this.now();
    const text = readLS(SAVE_KEY);
    const loaded = text ? deserialize(text) : null;
    this.sim = newSim();
    if (loaded) {
      this.town = loaded.town;
      if (loaded.air) this.sim.air.set(loaded.air);
      this.saveState = "loaded";
      this.awayFor = catchUp(this.town, this.sim, now);
    } else {
      this.saveState = text ? "repaired" : "new";
      this.startTown(this.progress.unlocked, now);
    }
    this.town.lastTs = now;
    this.sim.stats = analyze(this.town, this.sim.air);
    try {
      const s = JSON.parse(readLS(SETTINGS_KEY) ?? "{}");
      if (typeof s.sound === "boolean") this.sound = s.sound;
    } catch {
      // Defaults.
    }
  }

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.step(), TICK * 1000);
    this.saveTimer = window.setInterval(() => this.persist(), 5000);
    window.addEventListener("pagehide", this.persist);
  }

  stop() {
    window.clearInterval(this.timer);
    window.clearInterval(this.pulseTimer);
    window.clearInterval(this.saveTimer);
    this.timer = 0;
    window.removeEventListener("pagehide", this.persist);
    this.persist();
  }

  persist = () => {
    this.town.lastTs = this.now();
    writeLS(SAVE_KEY, serialize(this.town, this.sim.air));
    this.lastPersist = this.now();
  };

  private persistSoon() {
    if (this.now() - this.lastPersist > 1500) this.persist();
  }

  step() {
    for (const e of tick(this.town, this.sim, TICK)) this.handle(e);
    this.town.lastTs = this.now();
    this.changed();
  }

  private handle(e: SimEvent) {
    if (e.type === "goal") {
      const g = WORLDS[this.town.world].achievements.find((x) => x.id === e.id)!;
      this.bus.emit("goal", { id: e.id });
      this.toast(`Achievement: ${g.name} (+${g.coins} coins)`, "good");
      this.persist();
    }
    if (e.type === "world") {
      const w = this.town.world;
      if (!this.progress.done.includes(w)) this.progress.done = [...this.progress.done, w];
      this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(WORLDS.length - 1, w + 1));
      writeLS(PROGRESS_KEY, JSON.stringify(this.progress));
      this.bus.emit("world", { index: w });
      this.tool = { kind: "none" };
      this.category = null;
      this.panel = "complete";
      this.persist();
    }
    if (e.type === "moveIn") this.bus.emit("moveIn", { n: e.n });
    if (e.type === "heat") {
      this.heatResult = e.result;
      this.bus.emit("heatEnd", { score: e.result.score });
    }
  }

  // ------------------------------------------------------------------ actions
  setTool(tool: Tool) {
    this.tool = tool;
    this.selected = null;
    this.changed();
  }

  setCategory(c: Category | null) {
    this.category = c;
    if (c === null && this.tool.kind === "build") this.tool = { kind: "none" };
    this.changed();
  }

  openPanel(p: Panel) {
    this.panel = p;
    this.changed();
  }

  setSound(on: boolean) {
    this.sound = on;
    writeLS(SETTINGS_KEY, JSON.stringify({ sound: on }));
    this.changed();
  }

  toast(text: string, tone: Toast["tone"] = "info", ms = 3200) {
    const t = { id: ++this.toastId, text, tone };
    this.toasts = [...this.toasts.filter((x) => x.text !== text).slice(-2), t];
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.changed();
    }, ms);
    this.changed();
  }

  /** Tries to place the current tool's piece. Quiet = no toast (drag-painting). */
  placeAt(i: number, quiet = false) {
    if (this.tool.kind !== "build") return false;
    const id = this.tool.id;
    const ok = canPlace(this.town, i, id);
    if (!ok.ok) {
      if (!quiet) {
        this.bus.emit("fail", { i, reason: ok.reason });
        this.toast(ok.reason, "warn");
      }
      return false;
    }
    place(this.town, i, id);
    this.bus.emit("col", { i, change: piece(id).kind === "ground" ? "ground" : "add" });
    this.refresh();
    return true;
  }

  removeAt(i: number, quiet = false) {
    const info = removeInfo(this.town, i);
    if (!info.ok) {
      if (!quiet) {
        this.bus.emit("fail", { i, reason: info.reason! });
        this.toast(info.reason!, "warn");
      }
      return false;
    }
    const wasGround = !this.town.cols[i].s.length;
    const removed = top(this.town.cols[i]);
    remove(this.town, i);
    this.bus.emit("col", { i, change: wasGround ? "ground" : "remove" });
    if (this.selected === i && !this.town.cols[i].s.length) this.selected = null;
    this.refresh();
    if (removed?.emit) this.ecoPulse(i);
    return true;
  }

  dismissHeatResult() {
    this.heatResult = null;
    this.changed();
  }

  setEcoVision(on: boolean) {
    this.ecoVision = on;
    this.changed();
  }

  /**
   * Eco Pulse: a chimney has closed. Nothing new goes into the air, so the
   * air simulation is fast-forwarded (a time-lapse of the next ~20 seconds of
   * the same physics) while the scene shows smoke stopping and haze leaving.
   */
  private ecoPulse(i: number) {
    window.clearInterval(this.pulseTimer);
    const before = this.sim.stats.homeAir;
    const start = performance.now();
    this.pulse = { i, start };
    this.bus.emit("pulse", { i, phase: "start" });
    const inputs = airInputs(this.town, this.sim.stats);
    let done = 0;
    const run = () => {
      const f = Math.min(1, (performance.now() - start) / PULSE_MS);
      // Fastest at first, easing off as the air settles.
      const want = Math.round(PULSE_STEPS * (1 - Math.pow(1 - f, 3)));
      const e = env(this.town.clock);
      for (; done < want; done++) advectAir(this.sim.air, inputs, e, this.town.clock, TICK);
      this.sim.stats = analyze(this.town, this.sim.air);
      this.changed();
      if (f >= 1) {
        window.clearInterval(this.pulseTimer);
        this.pulse = null;
        const after = this.sim.stats.homeAir;
        this.bus.emit("pulse", { i, phase: "end" });
        const a = airLabel(before);
        const b = airLabel(after);
        // Say what is still dirtying the air, if anything.
        const chimneys = this.town.cols.some((c) => top(c)?.emit);
        const rest = b.good ? "" : chimneys ? " Another chimney is still smoking." : " What's left is mostly traffic: bike lanes and buses help.";
        this.toast(`Chimney closed. Air at homes: ${a.label} ${Math.round(before)} → ${b.label} ${Math.round(after)}.${rest}`, after < before - 0.5 ? "good" : "info", 6500);
        this.persistSoon();
      }
    };
    this.pulseTimer = window.setInterval(run, 50);
  }

  select(i: number | null) {
    this.selected = i;
    if (i !== null && i === idx(TOWN_HALL.x, TOWN_HALL.y)) {
      this.panel = "townhall";
      this.selected = null;
    }
    this.changed();
  }

  collect() {
    const n = collectTaxes(this.town);
    if (n > 0) {
      this.bus.emit("collect", { amount: n });
      this.persistSoon();
    }
    this.changed();
    return n;
  }

  upgradeTownHall() {
    const ok = thUpgradeCheck(this.town, this.sim.stats.starCount);
    if (!ok.ok) {
      this.toast(ok.reason, "warn");
      return false;
    }
    upgradeTownHall(this.town);
    this.bus.emit("townhall", { level: this.town.th });
    this.toast(`Town Hall level ${this.town.th}! New pieces and taller buildings unlocked.`, "good");
    this.persist();
    this.changed();
    return true;
  }

  /** A fresh town in a world, with the starting problem already visible. */
  private startTown(world: number, now: number) {
    this.town = freshTown(now, world);
    this.sim = newSim();
    // Let the smoke build up so the problem shows from the first second.
    for (let k = 0; k < 400; k++) tick(this.town, this.sim, TICK);
    this.town.goal = 0;
    this.town.complete = false;
    this.town.counts = { trees: 0, collected: 0 };
    this.sim.stats = analyze(this.town, this.sim.air);
    this.panel = "intro";
  }

  /** Starts (or restarts) a world. Locked worlds can't be started. */
  playWorld(world: number) {
    if (world > this.progress.unlocked) return;
    window.clearInterval(this.pulseTimer);
    this.pulse = null;
    this.heatResult = null;
    writeLS(SAVE_KEY, null);
    this.startTown(world, this.now());
    this.tool = { kind: "none" };
    this.category = null;
    this.selected = null;
    this.saveState = "new";
    this.awayFor = 0;
    this.bus.emit("reset", {});
    this.persist();
    this.changed();
  }

  /** Starts the current world over. */
  reset() {
    this.playWorld(this.town.world);
  }

  setPreviews(p: Record<string, string>) {
    this.previews = p;
    this.changed();
  }

  /** Re-adds up the town after an edit (without advancing time). */
  private refresh() {
    this.sim.stats = analyze(this.town, this.sim.air);
    this.persistSoon();
    this.changed();
  }
}

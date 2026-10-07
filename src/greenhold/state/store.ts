/**
 * The game store: owns the town and simulation, runs the clock, saves, and
 * exposes actions for the UI and the scene. The town is mutable; anything
 * that changes it bumps `rev` so React re-renders and emits a bus event so
 * the scene can animate exactly what changed.
 */
import { piece, type Category } from "../model/pieces";
import { deserialize, SAVE_KEY, serialize } from "../model/save";
import { analyze, catchUp, collectMats, collectTaxes, env, GOALS, newSim, tick, type Sim, type SimEvent } from "../model/sim";
import {
  N,
  TOWN_HALL,
  canPlace,
  idx,
  newTown,
  place,
  remove,
  removeInfo,
  startThUpgrade,
  thUpgradeCheck,
  type Town,
} from "../model/world";

export type Tool = { kind: "none" } | { kind: "build"; id: string } | { kind: "remove" };
export type Panel = null | "townhall" | "goals" | "stars" | "settings" | "intro" | "info";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "warn";
}

export interface BusEvents {
  col: { i: number; change: "add" | "remove" | "ground" };
  built: { i: number; id: string };
  moveIn: { n: number };
  goal: { id: string };
  townhall: { level: number };
  collect: { kind: "coins" | "mats"; amount: number; i: number };
  fail: { i: number; reason: string };
  reset: Record<string, never>;
  focus: { i: number };
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
const TICK = 0.25;

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

export class GameStore {
  readonly bus = new Bus();
  town!: Town;
  sim!: Sim;
  rev = 0;
  tool: Tool = { kind: "none" };
  category: Category | null = null;
  panel: Panel = null;
  selected: number | null = null;
  overlay: "none" | "air" = "none";
  sound = true;
  toasts: Toast[] = [];
  /** Seconds the player was away (shown once on return). */
  awayFor = 0;
  saveState: "new" | "loaded" | "repaired" = "new";
  /** Shop pictures drawn by the game art. */
  previews: Record<string, string> = {};
  /** Screen position (CSS px) of a column, set by the scene (used by tests and tips). */
  screenOf: ((i: number) => { x: number; y: number }) | null = null;
  private listeners = new Set<() => void>();
  private timer = 0;
  private saveTimer = 0;
  private toastId = 0;
  private lastPersist = 0;

  constructor(readonly now: () => number = () => Date.now()) {
    this.load();
  }

  // --------------------------------------------------------- subscription
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getRev = () => this.rev;
  changed() {
    this.rev++;
    this.listeners.forEach((fn) => fn());
  }

  // --------------------------------------------------------- lifecycle
  private load() {
    const now = this.now();
    const text = readLS(SAVE_KEY);
    const loaded = text ? deserialize(text) : null;
    this.sim = newSim();
    if (loaded) {
      this.town = loaded.town;
      if (loaded.air) this.sim.air.set(loaded.air);
      this.saveState = "loaded";
    } else {
      this.town = newTown(Math.floor(Math.random() * 1e9), now);
      this.saveState = text ? "repaired" : "new";
      this.panel = "intro";
    }
    this.awayFor = loaded ? catchUp(this.town, this.sim, now) : 0;
    this.town.lastTs = now;
    this.sim.stats = analyze(this.town, this.sim.air, env(this.town.clock), now);
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
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop() {
    window.clearInterval(this.timer);
    window.clearInterval(this.saveTimer);
    this.timer = 0;
    window.removeEventListener("pagehide", this.persist);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.persist();
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") this.persist();
  };

  persist = () => {
    this.town.lastTs = this.now();
    writeLS(SAVE_KEY, serialize(this.town, this.sim.air));
    this.lastPersist = this.now();
  };

  /** Saves soon (batches rapid edits such as drag-painting). */
  private persistSoon() {
    if (this.now() - this.lastPersist > 1500) this.persist();
  }

  step() {
    const events = tick(this.town, this.sim, TICK, this.now());
    this.town.lastTs = this.now();
    for (const e of events) this.handle(e);
    this.changed();
  }

  private handle(e: SimEvent) {
    if (e.type === "built") {
      this.bus.emit("built", { i: e.i, id: e.id });
      this.toast(`${piece(e.id).name} finished`, "good");
    }
    if (e.type === "townhall") {
      this.bus.emit("townhall", { level: e.level });
      this.toast(`Town Hall level ${e.level}! New pieces unlocked.`, "good");
      this.persist();
    }
    if (e.type === "goal") {
      const g = GOALS.find((x) => x.id === e.id)!;
      this.bus.emit("goal", { id: e.id });
      this.toast(`Goal complete: ${g.name} (+${g.coins} coins${g.mats ? `, +${g.mats} materials` : ""})`, "good");
      this.persist();
    }
    if (e.type === "moveIn") this.bus.emit("moveIn", { n: e.n });
  }

  setPreviews(p: Record<string, string>) {
    this.previews = p;
    this.changed();
  }

  // --------------------------------------------------------- actions
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

  setOverlay(o: "none" | "air") {
    this.overlay = o;
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
    const ok = canPlace(this.town, i, id, this.now());
    if (!ok.ok) {
      if (!quiet) {
        this.bus.emit("fail", { i, reason: ok.reason });
        this.toast(ok.reason, "warn");
      }
      return false;
    }
    const p = piece(id);
    place(this.town, i, id, this.now());
    this.bus.emit("col", { i, change: p.kind === "ground" ? "ground" : "add" });
    this.refresh();
    this.persistSoon();
    return true;
  }

  removeAt(i: number, quiet = false) {
    const info = removeInfo(this.town, i, this.now());
    if (!info.ok) {
      if (!quiet) {
        this.bus.emit("fail", { i, reason: info.reason! });
        this.toast(info.reason!, "warn");
      }
      return false;
    }
    const wasGround = !this.town.cols[i].s.length;
    remove(this.town, i, this.now());
    this.bus.emit("col", { i, change: wasGround ? "ground" : "remove" });
    if (this.selected === i && !this.town.cols[i].s.length) this.selected = null;
    this.refresh();
    this.persistSoon();
    return true;
  }

  select(i: number | null) {
    this.selected = i;
    if (i !== null && i === idx(TOWN_HALL.x, TOWN_HALL.y)) {
      this.panel = "townhall";
      this.selected = null;
    }
    this.changed();
  }

  collect(kind: "coins" | "mats") {
    const n = kind === "coins" ? collectTaxes(this.town) : collectMats(this.town);
    if (n > 0) {
      const i = kind === "coins" ? idx(TOWN_HALL.x, TOWN_HALL.y) : this.town.cols.findIndex((c) => c.s.includes("recycling"));
      this.bus.emit("collect", { kind, amount: n, i: Math.max(0, i) });
      this.persistSoon();
    } else if (kind === "mats") this.toast("Material storage is full. Upgrade the Town Hall to hold more.", "warn");
    this.changed();
    return n;
  }

  upgradeTownHall() {
    const ok = thUpgradeCheck(this.town, this.sim.stats.starCount, this.now());
    if (!ok.ok) {
      this.toast(ok.reason, "warn");
      return false;
    }
    startThUpgrade(this.town, this.now());
    this.toast("Town Hall upgrade started", "good");
    this.persist();
    this.changed();
    return true;
  }

  reset() {
    writeLS(SAVE_KEY, null);
    this.town = newTown(Math.floor(Math.random() * 1e9), this.now());
    this.sim = newSim();
    this.sim.stats = analyze(this.town, this.sim.air, env(this.town.clock), this.now());
    this.tool = { kind: "none" };
    this.category = null;
    this.selected = null;
    this.panel = "intro";
    this.saveState = "new";
    this.awayFor = 0;
    this.bus.emit("reset", {});
    this.persist();
    this.changed();
  }

  /** Re-adds up the town after an edit (without advancing time). */
  private refresh() {
    this.sim.stats = analyze(this.town, this.sim.air, env(this.town.clock), this.now());
    this.changed();
  }
}

export const MAP_SIZE = N;

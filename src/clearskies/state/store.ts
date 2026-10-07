/**
 * Clear Skies game state: the town, its air, and the story of three
 * decisions. The town is mutable; every change bumps `rev` (so React
 * re-renders) and emits a bus event (so the scene animates what changed).
 */
import { LEVEL_CLOCK, STEPS, applyOp, buildLevel, levelStats, settleAir, type Op, type Step } from "../model/level";
import { env, newSim, stepAir, type Sim } from "../model/sim";
import type { Town } from "../model/world";

export type Phase = "intro" | "choose" | "working" | "learned" | "reveal" | "finale";

export interface BusEvents {
  col: { i: number; change: "add" | "remove" | "ground" };
  focus: { i: number; zoom?: number };
  snapshot: { kind: "before" | "after" };
  restart: Record<string, never>;
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

const TICK = 0.25;
/** Game seconds of air per real second: fast enough to watch the smog clear. */
const AIR_SPEED = 16;
const PLEDGE_KEY = "clearskies.pledge.v1";

function readLS(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the pledge just isn't remembered.
  }
}

export class Store {
  readonly bus = new Bus();
  town!: Town;
  sim!: Sim;
  rev = 0;
  phase: Phase = "intro";
  stepIndex = 0;
  /** The option the player last tried on this step (shows its explanation). */
  tried: string | null = null;
  /** Air reading where people live, eased for the meter. */
  air = 0;
  /** Reading at the start, and when each step's change was made. */
  readings: number[] = [];
  snapshots: { before?: string; after?: string } = {};
  sound = true;
  pledges: string[] = [];
  /** Shop-style pictures of each piece, drawn by the game art. */
  previews: Record<string, string> = {};
  /** Screen position (CSS px) of a column, set by the scene. */
  screenOf: ((i: number) => { x: number; y: number }) | null = null;
  private listeners = new Set<() => void>();
  private timer = 0;
  private timeouts: number[] = [];

  constructor(readonly now: () => number = () => Date.now()) {
    this.setup();
    try {
      const saved = JSON.parse(readLS(PLEDGE_KEY) ?? "null");
      if (Array.isArray(saved)) this.pledges = saved.filter((x): x is string => typeof x === "string");
    } catch {
      // No saved pledge.
    }
  }

  private setup() {
    this.town = buildLevel(this.now());
    this.sim = newSim();
    // Let the smoke build up before the player arrives.
    this.sim.stats = settleAir(this.town, this.sim.air, 500, this.now());
    this.air = this.sim.stats.homeAir;
    this.readings = [this.air];
  }

  get step(): Step {
    return STEPS[this.stepIndex];
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

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), TICK * 1000);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.timeouts.forEach((t) => window.clearTimeout(t));
  }

  private later(ms: number, fn: () => void) {
    this.timeouts.push(window.setTimeout(fn, ms));
  }

  private tick() {
    const t = this.town;
    const e = env(LEVEL_CLOCK);
    const s = levelStats(t, this.sim.air, this.now());
    for (let k = 0; k < AIR_SPEED; k++) stepAir(t, this.sim.air, e, s, TICK, this.now());
    this.sim.stats = levelStats(t, this.sim.air, this.now());
    t.clock = LEVEL_CLOCK;
    this.air += (this.sim.stats.homeAir - this.air) * 0.35;
    this.changed();
  }

  // ------------------------------------------------------------------ story
  begin() {
    this.bus.emit("snapshot", { kind: "before" });
    this.phase = "choose";
    this.stepIndex = 0;
    this.tried = null;
    this.bus.emit("focus", { i: this.step.focus });
    this.changed();
  }

  choose(id: string) {
    if (this.phase !== "choose") return;
    const c = this.step.choices.find((x) => x.id === id);
    if (!c) return;
    this.tried = id;
    if (!c.good) {
      this.changed();
      return;
    }
    this.phase = "working";
    this.changed();
    this.bus.emit("focus", { i: this.step.focus });
    const ops = this.step.ops(this.town);
    const gap = Math.max(40, Math.min(140, 2600 / ops.length));
    ops.forEach((op, k) => this.later(500 + k * gap, () => this.apply(op)));
    this.later(500 + ops.length * gap + 1800, () => {
      this.phase = "learned";
      this.readings.push(this.sim.stats.homeAir);
      this.changed();
    });
  }

  private apply(op: Op) {
    applyOp(this.town, op);
    this.bus.emit("col", { i: op.i, change: op.kind === "ground" ? "ground" : op.kind === "remove" ? "remove" : "add" });
  }

  next() {
    if (this.phase !== "learned") return;
    if (this.stepIndex < STEPS.length - 1) {
      this.stepIndex++;
      this.tried = null;
      this.phase = "choose";
      this.bus.emit("focus", { i: this.step.focus });
      this.changed();
      return;
    }
    // The reveal: wait for the last of the smog to clear, then picture the same view as at the start.
    this.phase = "reveal";
    this.changed();
    this.later(2500, () => this.bus.emit("snapshot", { kind: "after" }));
  }

  setSnapshot(kind: "before" | "after", url: string) {
    this.snapshots = { ...this.snapshots, [kind]: url };
    if (kind === "after" && this.phase === "reveal") {
      this.readings.push(this.sim.stats.homeAir);
      this.phase = "finale";
    }
    this.changed();
  }

  togglePledge(id: string) {
    this.pledges = this.pledges.includes(id) ? this.pledges.filter((p) => p !== id) : [...this.pledges, id];
    writeLS(PLEDGE_KEY, JSON.stringify(this.pledges));
    this.changed();
  }

  setSound(on: boolean) {
    this.sound = on;
    this.changed();
  }

  setPreviews(p: Record<string, string>) {
    this.previews = p;
    this.changed();
  }

  restart() {
    this.timeouts.forEach((t) => window.clearTimeout(t));
    this.timeouts = [];
    this.setup();
    this.phase = "intro";
    this.stepIndex = 0;
    this.tried = null;
    this.snapshots = {};
    this.bus.emit("restart", {});
    this.changed();
  }
}

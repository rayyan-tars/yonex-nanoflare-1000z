/**
 * The town simulation: homes, energy, travel, carbon and the air. Air
 * pollution spreads on a grid, drifts with the wind and is cleaned by
 * plants. Sun and wind count at their daily average, so the town doesn't
 * black out every night. Everything is simplified game units.
 */
import { piece } from "./pieces";
import { CHEST_CAP, N, PAVED, TH_UPGRADE, idx, inside, xy, type Town } from "./world";

export const DAY_SECONDS = 240;
/** Air steps per tick. */
const AIR_SPEED = 4;

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth 1D noise, 0..1. */
function noise(t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * u;
}

export interface Env {
  /** 0..1 through the day (0.5 = noon). */
  dayPhase: number;
  sun: number;
  wind: number;
  /** 0 at noon, 1 at night. */
  night: number;
}

export function env(clock: number): Env {
  const dayPhase = (clock % DAY_SECONDS) / DAY_SECONDS;
  const d = (dayPhase - 0.22) / 0.56;
  const sun = d > 0 && d < 1 ? Math.sin(d * Math.PI) : 0;
  const wind = 0.25 + 0.75 * noise(clock / 37);
  const light = Math.min(1, Math.max(0, (Math.sin(2 * Math.PI * (dayPhase - 0.25)) + 0.3) / 0.6));
  return { dayPhase, sun, wind, night: 1 - light };
}

/** Wind direction in radians (0 = toward +x); it slowly swings around. */
export const windAngle = (clock: number) => 0.9 + Math.sin(clock / 300) * 1.2;

export interface Stats {
  housing: number;
  homes: number[];
  /** Built columns that aren't homes yet, and why. */
  noRoof: number[];
  noAccess: number[];
  energy: { supply: number; demand: number; clean: number; dirty: number; cleanShare: number };
  travel: { covered: number; carShare: number; cars: number };
  /** Carbon made per minute. */
  co2: number;
  /** Coins per minute spent on fuel and buses. */
  upkeep: number;
  /** Average air pollution where people live (0 = clean). */
  homeAir: number;
  meanAir: number;
  happiness: number;
  /** Taxes per second. */
  taxRate: number;
  stars: boolean[];
  starCount: number;
}

export interface Sim {
  air: Float32Array;
  stats: Stats;
}

export function newSim(): Sim {
  return { air: new Float32Array(N * N), stats: null as unknown as Stats };
}

export const STAR_NAMES = [
  { name: "Clean power", how: "At least 70% of your energy from sun and wind, with enough for everyone" },
  { name: "Clean air", how: "The air where people live is Fresh or OK" },
  { name: "Green travel", how: "Fewer than half your residents drive" },
];

/** Adds up everything in the town. Pure: reads the town and the air. */
export function analyze(t: Town, air: Float32Array): Stats {
  const paved = new Uint8Array(N * N);
  const bikeLane = new Uint8Array(N * N);
  t.cols.forEach((c, i) => {
    if (PAVED.includes(c.g)) paved[i] = 1;
    if (c.g === "bike") bikeLane[i] = 1;
  });
  const near = (i: number, r: number, mask: Uint8Array) => {
    const { x, y } = xy(i);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy) && mask[idx(x + dx, y + dy)]) return true;
    return false;
  };
  const within = (a: number, b: number, r: number) => {
    const p = xy(a);
    const q = xy(b);
    return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= r;
  };

  const homes: number[] = [];
  const noRoof: number[] = [];
  const noAccess: number[] = [];
  const homeCap = new Map<number, number>();
  let housing = 0;
  let insulSum = 0;
  let dirty = 0;
  let clean = 0;
  let co2 = 0;
  let upkeep = 0;
  const stops: { i: number; r: number }[] = [];
  const niceSpots: { i: number; r: number }[] = [];

  t.cols.forEach((c, i) => {
    if (!c.s.length) return;
    const pieces = c.s.map(piece);
    const tp = pieces[pieces.length - 1];
    const blocks = pieces.filter((p) => p.kind === "block");
    // Anything built from blocks becomes homes once it has a roof and a path or road within 2 tiles.
    if (blocks.length) {
      const cap = blocks.reduce((n, p) => n + (p.housing ?? 0), 0);
      if (!(tp.kind === "roof" || tp.rooftop)) noRoof.push(i);
      else if (!near(i, 2, paved)) noAccess.push(i);
      else {
        homes.push(i);
        homeCap.set(i, cap);
        housing += cap;
        insulSum += blocks.reduce((n, p) => n + (p.housing ?? 0) * (p.insul ?? 1), 0) * (tp.insul ?? 1);
      }
    }
    for (const p of pieces) {
      if (p.energy && p.energy > 0) dirty += p.energy;
      if (p.solar) clean += p.solar;
      if (p.wind) clean += p.wind;
      if (p.co2) co2 += p.co2;
      if (p.upkeep) upkeep += p.upkeep;
      if (p.cover) stops.push({ i, r: p.cover });
      if (p.nice) niceSpots.push({ i, r: p.nice });
    }
  });

  const residents = Math.min(t.residents, housing);
  const demand = housing ? (residents * insulSum) / housing : 0;
  const supply = dirty + clean;

  // Travel: homes near a bike lane or a bus stop leave the car at home.
  let coveredCap = 0;
  for (const h of homes) if (near(h, 2, bikeLane) || stops.some((s) => within(s.i, h, s.r))) coveredCap += homeCap.get(h)!;
  const covered = housing ? coveredCap / housing : 0;
  const carShare = residents ? 1 - covered * 0.75 : 0;
  const cars = residents * carShare;
  co2 += cars * 0.25 + Math.max(0, demand - supply) * 0.5;

  // Air where people live.
  let meanAir = 0;
  for (let i = 0; i < air.length; i++) meanAir += air[i];
  meanAir /= air.length;
  const homeAir = homes.length ? homes.reduce((n, h) => n + air[h], 0) / homes.length : 0;

  // Happiness: nature nearby, enough energy, clean air.
  const niceHomes = homes.filter((h) => niceSpots.some((s) => within(s.i, h, s.r))).length;
  let happiness = 55;
  happiness += homes.length ? 20 * (niceHomes / homes.length) : 0;
  happiness += supply >= demand - 0.01 ? 10 : -25 * Math.min(1, (demand - supply) / Math.max(1, demand));
  happiness -= homeAir * 0.8;
  happiness = Math.max(5, Math.min(100, happiness));

  const enough = residents >= 4;
  const cleanShare = supply > 0 ? clean / supply : 0;
  const stars = [enough && cleanShare >= 0.7 && supply >= demand, enough && homeAir < AIR_OK, enough && carShare < 0.5];

  return {
    housing,
    homes,
    noRoof,
    noAccess,
    energy: { supply, demand, clean, dirty, cleanShare },
    travel: { covered, carShare, cars },
    co2,
    upkeep,
    homeAir,
    meanAir,
    happiness,
    taxRate: residents * 0.15 * (0.4 + happiness / 100),
    stars,
    starCount: stars.filter(Boolean).length,
  };
}

/** Below this the air at homes counts as clean (Fresh or OK). */
export const AIR_OK = 10;

export function airLabel(v: number): { label: string; good: boolean } {
  if (v < 4) return { label: "Fresh", good: true };
  if (v < AIR_OK) return { label: "OK", good: true };
  if (v < 25) return { label: "Smoggy", good: false };
  return { label: "Toxic", good: false };
}

/** Spreads, drifts and cleans air pollution for one step. */
export function stepAir(t: Town, air: Float32Array, e: Env, stats: Stats, dt: number) {
  const src = new Float32Array(N * N);
  const clean = new Float32Array(N * N);
  let roads = 0;
  t.cols.forEach((c) => c.g === "road" && roads++);
  const perRoad = roads ? (stats.travel.cars * 0.42) / roads : 0;
  t.cols.forEach((c, i) => {
    if (c.g === "road") src[i] += perRoad;
    for (const id of c.s) {
      const p = piece(id);
      if (p.emit) src[i] += p.emit;
      if (p.absorb) clean[i] += p.absorb;
    }
  });
  const out = new Float32Array(N * N);
  const ang = windAngle(t.clock);
  const wx = Math.cos(ang) * e.wind * 0.35;
  const wy = Math.sin(ang) * e.wind * 0.35;
  const at = (x: number, y: number) => air[idx(Math.min(N - 1, Math.max(0, x)), Math.min(N - 1, Math.max(0, y)))];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const p = air[i];
      const nb = (at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1)) / 4;
      const up = at(x - Math.sign(wx), y) * Math.abs(wx) + at(x, y - Math.sign(wy)) * Math.abs(wy);
      let v = p + (nb - p) * Math.min(0.9, 3.2 * dt);
      v += (up - p * (Math.abs(wx) + Math.abs(wy))) * dt;
      v += src[i] * dt * 2.2;
      // Natural clean-up, plus plants taking out a share of what passes over them.
      v -= v * (0.009 + clean[i] * 0.25) * dt;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) v *= 1 - 0.3 * dt;
      out[i] = Math.max(0, Math.min(100, v));
    }
  }
  air.set(out);
}

/** One goal at a time, each teaching one sustainable move. */
export interface Goal {
  id: string;
  name: string;
  why: string;
  coins: number;
  done: (t: Town, s: Stats) => boolean;
}

export const GOALS: readonly Goal[] = [
  { id: "collect", name: "Collect taxes at the Town Hall", why: "Tap the coin bubble above the Town Hall. Happy towns pay more.", coins: 50, done: (t) => t.counts.collected > 0 },
  { id: "clean-power", name: "Build solar panels or a wind turbine", why: "They make energy without smoke, and cost nothing to run.", coins: 100, done: (t) => t.cols.some((c) => c.s.includes("solar") || c.s.includes("wind") || c.s.includes("solarroof")) },
  { id: "no-coal", name: "Remove the coal plant", why: "Once clean power covers your homes, take away the smoke at its source. Watch the air clear.", coins: 200, done: (t) => !t.cols.some((c) => c.s.includes("coal")) },
  { id: "trees", name: "Plant 6 trees", why: "Trees clean the air near homes and make people happier.", coins: 80, done: (t) => t.counts.trees >= 6 },
  { id: "home", name: "Build a new home", why: "Stack blocks, add a roof and keep a path within 2 tiles. Timber stores carbon; concrete releases it.", coins: 100, done: (t, s) => s.housing >= 28 },
  { id: "bikes", name: "Lay a bike lane next to homes", why: "People within 2 tiles of a bike lane cycle instead of driving.", coins: 100, done: (t, s) => s.travel.covered > 0 },
  { id: "town", name: "Upgrade the Town Hall", why: "Tap the Town Hall. Upgrades unlock taller buildings, green roofs and buses.", coins: 200, done: (t) => t.th >= 2 },
  { id: "stars", name: "Earn all 3 eco stars", why: "Clean power, clean air and green travel, all at once.", coins: 500, done: (t, s) => s.starCount === 3 },
];

export type SimEvent = { type: "goal"; id: string } | { type: "moveIn"; n: number };

/** Advances the town by `dt` seconds of play. */
export function tick(t: Town, sim: Sim, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  t.clock += dt;
  const s = analyze(t, sim.air);
  sim.stats = s;

  // People move in while there's room and the town is pleasant; they leave if it isn't.
  const before = Math.floor(t.residents);
  if (t.residents > s.housing) t.residents = s.housing;
  else if (s.happiness >= 25) t.residents = Math.min(s.housing, t.residents + 0.7 * dt);
  if (s.happiness < 18) t.residents = Math.max(0, t.residents - 0.25 * dt);
  const after = Math.floor(t.residents);
  if (after > before) events.push({ type: "moveIn", n: after - before });

  t.chest = Math.min(CHEST_CAP[t.th], t.chest + s.taxRate * dt);
  t.coins = Math.max(0, t.coins - (s.upkeep / 60) * dt);
  t.carbon += (s.co2 / 60) * dt;

  // The air moves faster than the clock, so changes show within seconds.
  const e = env(t.clock);
  for (let k = 0; k < AIR_SPEED; k++) stepAir(t, sim.air, e, s, dt);

  const g = GOALS[t.goal];
  if (g && g.done(t, s)) {
    t.goal++;
    t.coins += g.coins;
    events.push({ type: "goal", id: g.id });
  }
  return events;
}

/** Time away: taxes keep coming in (up to the chest size). */
export function catchUp(t: Town, sim: Sim, now: number) {
  const away = Math.min(8 * 3600, Math.max(0, (now - t.lastTs) / 1000));
  if (away < 5) return 0;
  const s = analyze(t, sim.air);
  t.chest = Math.min(CHEST_CAP[t.th], t.chest + s.taxRate * away);
  t.coins = Math.max(0, t.coins - (s.upkeep / 60) * away);
  return away;
}

export function collectTaxes(t: Town) {
  const n = Math.floor(t.chest);
  t.coins += n;
  t.chest -= n;
  if (n > 0) t.counts.collected++;
  return n;
}

export interface Tip {
  text: string;
  tone: "warn" | "goal" | "good";
  at?: number;
}

/** A problem to fix right now, if there is one; otherwise null (the current goal shows instead). */
export function problem(t: Town, s: Stats): Tip | null {
  if (s.noRoof.length) return { tone: "warn", text: "A building needs a roof (or rooftop solar) before anyone can live in it.", at: s.noRoof[0] };
  if (s.noAccess.length) return { tone: "warn", text: "Nobody can reach that building. Lay a path, bike lane or road within 2 tiles.", at: s.noAccess[0] };
  if (s.energy.demand > s.energy.supply + 0.01) return { tone: "warn", text: "Not enough energy. Add solar panels or a wind turbine." };
  if (t.chest >= CHEST_CAP[t.th] * 0.95) return { tone: "warn", text: "The tax chest is full. Tap the Town Hall's coin bubble to collect.", at: idx(28, 28) };
  return null;
}

/** What the next Town Hall level needs, or null at the top. */
export const nextUpgrade = (t: Town) => (t.th < TH_UPGRADE.length - 1 ? TH_UPGRADE[t.th + 1] : null);

export const homeCapacity = (t: Town, i: number) => t.cols[i].s.reduce((n, id) => n + (piece(id).housing ?? 0), 0);


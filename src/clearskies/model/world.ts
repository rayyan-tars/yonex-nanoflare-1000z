/**
 * The town: a square open map of columns. Each column has a ground surface
 * and a stack of pieces (blocks with an optional roof or rooftop machine on
 * top, or a single machine or tree). All placement rules live here.
 */
import { piece, pieceOrNull, type Cost, type PieceDef } from "./pieces";

export const N = 56;
export const idx = (x: number, y: number) => y * N + x;
export const xy = (i: number) => ({ x: i % N, y: Math.floor(i / N) });
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;

export type Ground = "grass" | "sand" | "water" | "road" | "path" | "bike" | "garden" | "pond";
export const PAVED: readonly Ground[] = ["road", "path", "bike"];

export interface Column {
  g: Ground;
  /** Pieces bottom to top. */
  s: string[];
  /** Construction end time (ms) of the top piece, while it's being built. */
  until?: number;
}

export interface Town {
  v: 1;
  seed: number;
  name: string;
  cols: Column[];
  coins: number;
  mats: number;
  /** Town Hall level, 1..5. */
  th: number;
  /** Town Hall upgrade end time (ms), while upgrading. */
  thUntil?: number;
  /** Taxes waiting at the Town Hall. */
  chest: number;
  /** Materials waiting at recycling centres. */
  matChest: number;
  residents: number;
  /** Carbon footprint so far (game units). */
  carbon: number;
  /** Energy in batteries. */
  battery: number;
  /** Goals already rewarded. */
  goals: string[];
  /** Game clock, seconds (drives day and night, wind and rain). */
  clock: number;
  /** Wall time of the last update (ms), for time away. */
  lastTs: number;
  /** Counts that goals use. */
  counts: { trees: number; built: number; recycledBricks: number };
}

export const MAX_TH = 5;
export const MAX_HEIGHT = [0, 3, 4, 6, 8, 10];
export const CHEST_CAP = [0, 600, 1500, 3500, 7000, 12000];
export const MAT_CAP = [0, 150, 300, 600, 1000, 1600];
export const BUILDERS = [0, 2, 2, 3, 3, 4];
/** What each Town Hall upgrade needs: to reach level i. */
export const TH_UPGRADE: readonly { coins: number; time: number; residents: number; stars: number }[] = [
  { coins: 0, time: 0, residents: 0, stars: 0 },
  { coins: 0, time: 0, residents: 0, stars: 0 },
  { coins: 900, time: 15, residents: 10, stars: 1 },
  { coins: 2200, time: 30, residents: 30, stars: 2 },
  { coins: 4500, time: 45, residents: 60, stars: 3 },
  { coins: 8000, time: 60, residents: 110, stars: 5 },
];
export const TH_TITLES = ["", "Village", "Town", "Green Town", "Eco City", "Green Capital"];

export const TOWN_HALL = { x: 28, y: 28 };
const HUTS = [
  { x: 25, y: 26 },
  { x: 31, y: 26 },
];

export const height = (c: Column) => c.s.length;
export const top = (c: Column): PieceDef | null => (c.s.length ? piece(c.s[c.s.length - 1]) : null);
export const building = (c: Column, now: number) => c.until !== undefined && c.until > now;

/** Deterministic random numbers. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed: number, scale: number) {
  const r = rng(seed);
  const G = Math.ceil(N / scale) + 2;
  const grid = Array.from({ length: G * G }, () => r());
  const at = (gx: number, gy: number) => grid[gy * G + gx];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/** A fresh town: open land with a river, a lake, woods and boulders around a small starting square. */
export function newTown(seed: number, now: number): Town {
  const r = rng(seed);
  const forest = valueNoise(seed + 1, 7);
  const wiggle = valueNoise(seed + 2, 11);
  const cols: Column[] = [];
  const lake = { x: 11 + Math.floor(r() * 5), y: 42 + Math.floor(r() * 5), r: 4.5 + r() * 1.5 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dCentre = Math.hypot(x - TOWN_HALL.x, y - TOWN_HALL.y);
      // A river that winds across the north-east of the map.
      const riverY = 5 + x * 0.32 + (wiggle(x, 3) - 0.5) * 8;
      const inRiver = Math.abs(y - riverY) < 1.3 && dCentre > 11;
      const inLake = Math.hypot(x - lake.x, (y - lake.y) * 1.15) < lake.r + (wiggle(x, y) - 0.5) * 1.6;
      let g: Ground = inRiver || inLake ? "water" : "grass";
      if (g === "grass" && dCentre > 11 && (Math.abs(y - riverY) < 2.2 || Math.hypot(x - lake.x, (y - lake.y) * 1.15) < lake.r + 1.4)) g = "sand";
      const s: string[] = [];
      if ((g === "grass" || g === "sand") && dCentre > 8.5) {
        const f = forest(x, y);
        const v = r();
        if (g === "grass" && f > 0.62 && v < (f - 0.55) * 2.2) s.push(v < 0.5 ? "pine" : "oak");
        else if (v < 0.018) s.push("rock");
        else if (g === "grass" && v < 0.05) s.push("flowers");
      }
      cols.push({ g, s });
    }
  }
  const put = (x: number, y: number, id: string) => (cols[idx(x, y)] = { g: "grass", s: [id] });
  put(TOWN_HALL.x, TOWN_HALL.y, "townhall");
  HUTS.forEach((h) => put(h.x, h.y, "hut"));
  // A starting street past the Town Hall.
  for (let x = 22; x <= 34; x++) cols[idx(x, 30)] = { g: "road", s: [] };
  cols[idx(TOWN_HALL.x, TOWN_HALL.y + 1)] = { g: "path", s: [] };
  // A few starter trees to show what clean air looks like.
  for (const [x, y, id] of [[24, 32, "oak"], [33, 32, "pine"], [26, 33, "flowers"]] as const) put(x, y, id);
  return {
    v: 1,
    seed,
    name: "Greenhold",
    cols,
    coins: 800,
    mats: 40,
    th: 1,
    chest: 0,
    matChest: 0,
    residents: 0,
    carbon: 0,
    battery: 0,
    goals: [],
    clock: 60,
    lastTs: now,
    counts: { trees: 0, built: 0, recycledBricks: 0 },
  };
}

/** Timed builds and the Town Hall upgrade each keep one builder busy. */
export function buildersBusy(t: Town, now: number) {
  let n = t.thUntil && t.thUntil > now ? 1 : 0;
  for (const c of t.cols) if (building(c, now)) n++;
  return n;
}
export const builders = (t: Town) => BUILDERS[t.th];

export const canAfford = (t: Town, c: Cost) => t.coins >= c.coins && t.mats >= c.mats;

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

const LAND: readonly Ground[] = ["grass", "sand"];

/** Can `id` go on column `i` right now? The reason is shown to the player. */
export function canPlace(t: Town, i: number, id: string, now: number): PlaceCheck {
  const p = pieceOrNull(id);
  if (!p || p.fixed || p.unlock >= 99) return { ok: false, reason: "Can't build that" };
  if (p.unlock > t.th) return { ok: false, reason: `Needs Town Hall ${p.unlock}` };
  const c = t.cols[i];
  if (!c) return { ok: false, reason: "Off the map" };
  if (building(c, now)) return { ok: false, reason: "Under construction" };
  const tp = top(c);
  const why = placeRule(t, c, p, tp);
  if (why) return { ok: false, reason: why };
  if (!canAfford(t, p.cost)) return { ok: false, reason: p.cost.mats > t.mats ? "Not enough materials" : "Not enough coins" };
  if (p.time > 0 && buildersBusy(t, now) >= builders(t)) return { ok: false, reason: "All builders are busy" };
  return { ok: true };
}

function placeRule(t: Town, c: Column, p: PieceDef, tp: PieceDef | null): string | null {
  switch (p.kind) {
    case "ground":
      if (c.s.length) return "Clear this spot first";
      if (c.g === "water") return "That's water";
      if (c.g === p.id) return "Already here";
      if ((p.id === "pond" || p.id === "garden") && !LAND.includes(c.g)) return "Needs open ground";
      return null;
    case "block":
      if (!tp) return LAND.includes(c.g) ? null : c.g === "water" ? "That's water" : "Blocks go on grass or sand";
      if (tp.kind !== "block") return tp.kind === "roof" || tp.rooftop ? "There's a roof on top" : "Something is already here";
      if (c.s.length >= MAX_HEIGHT[t.th]) return `Max height ${MAX_HEIGHT[t.th]} at this Town Hall`;
      return null;
    case "roof":
      if (!tp) return "Roofs go on top of blocks";
      if (tp.kind !== "block") return "Roofs go on top of blocks";
      return null;
    case "machine":
      if (tp) {
        if (p.rooftop && tp.kind === "block") return null;
        return p.rooftop ? "Put it on ground or on top of a block" : "Something is already here";
      }
      return LAND.includes(c.g) ? null : c.g === "water" ? "That's water" : "Needs open ground";
    case "nature":
      if (tp) return "Something is already here";
      return LAND.includes(c.g) ? null : "Plants need open ground";
  }
}

/** Places a piece (after `canPlace` said yes). Returns the column index changed. */
export function place(t: Town, i: number, id: string, now: number) {
  const p = piece(id);
  const c = t.cols[i];
  t.coins -= p.cost.coins;
  t.mats -= p.cost.mats;
  t.carbon += Math.max(0, p.carbon);
  if (p.carbon < 0) t.carbon += p.carbon;
  if (p.kind === "ground") {
    c.g = p.id as Ground;
  } else {
    c.s.push(id);
    if (p.time > 0) c.until = now + p.time * 1000;
  }
  if (p.id === "oak" || p.id === "pine") t.counts.trees++;
  if (p.id === "brick") t.counts.recycledBricks++;
  t.counts.built++;
}

export interface RemoveResult {
  ok: boolean;
  reason?: string;
  /** What came back (refund). */
  coins?: number;
  mats?: number;
  removed?: string;
}

/** What removing the top of a column would cost or return. */
export function removeInfo(t: Town, i: number, now: number): RemoveResult {
  const c = t.cols[i];
  const tp = top(c);
  if (!tp) {
    if (PAVED.includes(c.g) || c.g === "garden" || c.g === "pond") {
      const g = piece(c.g);
      return { ok: true, coins: Math.floor(g.cost.coins / 2), mats: 0, removed: c.g };
    }
    return { ok: false, reason: "Nothing to remove" };
  }
  if (tp.fixed) return { ok: false, reason: `${tp.name} stays` };
  if (building(c, now)) return { ok: true, coins: tp.cost.coins, mats: tp.cost.mats, removed: tp.id };
  if (tp.id === "rock") return t.coins >= 20 ? { ok: true, coins: -20, mats: 25, removed: "rock" } : { ok: false, reason: "Clearing costs 20 coins" };
  // Half the coins back; blocks and machines leave salvage you can reuse.
  const salvage = tp.kind === "block" || tp.kind === "machine" ? 2 + Math.floor(tp.cost.mats / 2) : tp.kind === "nature" && tp.id !== "flowers" ? 3 : 0;
  return { ok: true, coins: Math.floor(tp.cost.coins / 2), mats: salvage, removed: tp.id };
}

export function remove(t: Town, i: number, now: number): RemoveResult {
  const info = removeInfo(t, i, now);
  if (!info.ok) return info;
  const c = t.cols[i];
  if (c.s.length) {
    const id = c.s.pop()!;
    const p = piece(id);
    // A cancelled build gives everything back, carbon included; finished things keep their footprint.
    if (c.until !== undefined) {
      if (c.until > now) t.carbon -= Math.max(0, p.carbon);
      c.until = undefined;
    }
  } else {
    c.g = "grass";
  }
  t.coins += info.coins ?? 0;
  t.mats = Math.min(t.mats + (info.mats ?? 0), Math.max(t.mats, MAT_CAP[t.th]));
  return info;
}

/** Finishes construction whose time is up. Returns the columns that just finished. */
export function finishBuilds(t: Town, now: number): number[] {
  const done: number[] = [];
  t.cols.forEach((c, i) => {
    if (c.until !== undefined && c.until <= now) {
      c.until = undefined;
      done.push(i);
    }
  });
  return done;
}

export function thUpgradeCheck(t: Town, stars: number, now: number): PlaceCheck {
  if (t.th >= MAX_TH) return { ok: false, reason: "Fully upgraded" };
  if (t.thUntil && t.thUntil > now) return { ok: false, reason: "Upgrading now" };
  const need = TH_UPGRADE[t.th + 1];
  if (Math.floor(t.residents) < need.residents) return { ok: false, reason: `Needs ${need.residents} residents` };
  if (stars < need.stars) return { ok: false, reason: `Needs ${need.stars} eco ${need.stars === 1 ? "star" : "stars"}` };
  if (t.coins < need.coins) return { ok: false, reason: "Not enough coins" };
  if (buildersBusy(t, now) >= builders(t)) return { ok: false, reason: "All builders are busy" };
  return { ok: true };
}

export function startThUpgrade(t: Town, now: number) {
  const need = TH_UPGRADE[t.th + 1];
  t.coins -= need.coins;
  t.thUntil = now + need.time * 1000;
}

/** Returns true when an upgrade just finished. */
export function finishThUpgrade(t: Town, now: number) {
  if (t.thUntil && t.thUntil <= now) {
    t.thUntil = undefined;
    t.th = Math.min(MAX_TH, t.th + 1);
    return true;
  }
  return false;
}

/**
 * The town: a square open map of columns. Each column has a ground surface
 * and a stack of pieces (blocks with an optional roof or rooftop machine on
 * top, or a single machine or tree). All placement rules live here.
 */
import { piece, pieceOrNull, type PieceDef } from "./pieces";

export const N = 56;
export const idx = (x: number, y: number) => y * N + x;
export const xy = (i: number) => ({ x: i % N, y: Math.floor(i / N) });
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;

export type Ground = "grass" | "sand" | "water" | "road" | "path" | "bike";
export const PAVED: readonly Ground[] = ["road", "path", "bike"];

export interface Column {
  g: Ground;
  /** Pieces bottom to top. */
  s: string[];
}

export interface Town {
  v: 2;
  seed: number;
  name: string;
  cols: Column[];
  coins: number;
  /** Town Hall level, 1..3. */
  th: number;
  /** Taxes waiting at the Town Hall. */
  chest: number;
  residents: number;
  /** Carbon footprint so far (game units). */
  carbon: number;
  /** How far through the goal list the player is. */
  goal: number;
  /** Game clock in seconds (day and night, wind). */
  clock: number;
  /** Wall time of the last update (ms), for time away. */
  lastTs: number;
  counts: { trees: number; collected: number };
}

export const MAX_TH = 3;
export const MAX_HEIGHT = [0, 3, 5, 8];
export const CHEST_CAP = [0, 500, 1500, 4000];
/** What each Town Hall upgrade needs, by the level it reaches. */
export const TH_UPGRADE: readonly { coins: number; residents: number; stars: number }[] = [
  { coins: 0, residents: 0, stars: 0 },
  { coins: 0, residents: 0, stars: 0 },
  { coins: 600, residents: 16, stars: 1 },
  { coins: 1500, residents: 40, stars: 2 },
];
export const TH_TITLES = ["", "Village", "Town", "Green Town"];

export const TOWN_HALL = { x: 28, y: 28 };
/** The smoky coal plant the village starts with, upwind of the homes. */
export const START_COAL = { x: 28, y: 22 };

export const height = (c: Column) => c.s.length;
export const top = (c: Column): PieceDef | null => (c.s.length ? piece(c.s[c.s.length - 1]) : null);

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

/** A fresh village: open land with a river, a lake and woods, a few homes, and a smoky coal plant. */
export function newTown(seed: number, now: number): Town {
  const r = rng(seed);
  const forest = valueNoise(seed + 1, 7);
  const wiggle = valueNoise(seed + 2, 11);
  const cols: Column[] = [];
  const lake = { x: 11 + Math.floor(r() * 5), y: 42 + Math.floor(r() * 5), r: 4.5 + r() * 1.5 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dCentre = Math.hypot(x - TOWN_HALL.x, y - TOWN_HALL.y);
      const riverY = 5 + x * 0.32 + (wiggle(x, 3) - 0.5) * 8;
      const inRiver = Math.abs(y - riverY) < 1.3 && dCentre > 11;
      const inLake = Math.hypot(x - lake.x, (y - lake.y) * 1.15) < lake.r + (wiggle(x, y) - 0.5) * 1.6;
      let g: Ground = inRiver || inLake ? "water" : "grass";
      if (g === "grass" && dCentre > 11 && (Math.abs(y - riverY) < 2.2 || Math.hypot(x - lake.x, (y - lake.y) * 1.15) < lake.r + 1.4)) g = "sand";
      const s: string[] = [];
      if ((g === "grass" || g === "sand") && dCentre > 9) {
        const f = forest(x, y);
        const v = r();
        if (g === "grass" && f > 0.62 && v < (f - 0.55) * 2.2) s.push(v < 0.5 ? "pine" : "oak");
        else if (v < 0.015) s.push("rock");
        else if (g === "grass" && v < 0.045) s.push("flowers");
      }
      cols.push({ g, s });
    }
  }
  const set = (x: number, y: number, g: Ground, s: string[] = []) => (cols[idx(x, y)] = { g, s });
  // Clear the village site.
  for (let y = 20; y <= 34; y++) for (let x = 20; x <= 36; x++) set(x, y, "grass");
  set(TOWN_HALL.x, TOWN_HALL.y, "grass", ["townhall"]);
  set(25, 26, "grass", ["hut"]);
  for (let x = 21; x <= 35; x++) set(x, 30, "road");
  for (let y = 23; y <= 29; y++) set(22, y, "road");
  set(TOWN_HALL.x, TOWN_HALL.y + 1, "path");
  // A few homes along the street.
  const homes: [number, number, string[]][] = [
    [24, 31, ["concrete", "concrete", "roof"]],
    [25, 31, ["concrete", "roof"]],
    [26, 31, ["concrete", "concrete", "roof"]],
    [30, 31, ["brick", "brick", "roof"]],
    [31, 31, ["concrete", "roof"]],
    [32, 31, ["concrete", "concrete", "roof"]],
    [23, 28, ["concrete", "concrete", "roof"]],
    [23, 27, ["brick", "roof"]],
  ];
  for (const [x, y, s] of homes) set(x, y, "grass", s);
  // The coal plant that powers them, upwind.
  set(START_COAL.x, START_COAL.y, "grass", ["coal"]);
  set(START_COAL.x, START_COAL.y + 1, "road");
  for (let x = 23; x < START_COAL.x; x++) set(x, START_COAL.y + 1, "road");
  return {
    v: 2,
    seed,
    name: "Greenhold",
    cols,
    coins: 600,
    th: 1,
    chest: 0,
    residents: 0,
    carbon: 0,
    goal: 0,
    clock: 70,
    lastTs: now,
    counts: { trees: 0, collected: 0 },
  };
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

const LAND: readonly Ground[] = ["grass", "sand"];

/** Can `id` go on column `i`? The reason is shown to the player. */
export function canPlace(t: Town, i: number, id: string): PlaceCheck {
  const p = pieceOrNull(id);
  if (!p || p.fixed || p.unlock >= 99) return { ok: false, reason: "Can't build that" };
  if (p.unlock > t.th) return { ok: false, reason: `Needs Town Hall ${p.unlock}` };
  const c = t.cols[i];
  if (!c) return { ok: false, reason: "Off the map" };
  const why = placeRule(t, c, p, top(c));
  if (why) return { ok: false, reason: why };
  if (t.coins < p.cost) return { ok: false, reason: "Not enough coins" };
  return { ok: true };
}

function placeRule(t: Town, c: Column, p: PieceDef, tp: PieceDef | null): string | null {
  switch (p.kind) {
    case "ground":
      if (c.s.length) return "Clear this spot first";
      if (c.g === "water") return "That's water";
      if (c.g === p.id) return "Already here";
      return null;
    case "block":
      if (!tp) return LAND.includes(c.g) ? null : c.g === "water" ? "That's water" : "Blocks go on grass or sand";
      if (tp.kind !== "block") return tp.kind === "roof" || tp.rooftop ? "There's a roof on top" : "Something is already here";
      if (c.s.length >= MAX_HEIGHT[t.th]) return `Max height ${MAX_HEIGHT[t.th]} at this Town Hall`;
      return null;
    case "roof":
      return tp?.kind === "block" ? null : "Roofs go on top of blocks";
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

/** Places a piece (after `canPlace` said yes). */
export function place(t: Town, i: number, id: string) {
  const p = piece(id);
  const c = t.cols[i];
  t.coins -= p.cost;
  t.carbon += p.carbon;
  if (p.kind === "ground") c.g = p.id as Ground;
  else c.s.push(id);
  if (p.id === "oak" || p.id === "pine") t.counts.trees++;
}

export interface RemoveResult {
  ok: boolean;
  reason?: string;
  /** Coins back (negative when removing costs money). */
  coins?: number;
  removed?: string;
}

/** What removing the top of a column would return. */
export function removeInfo(t: Town, i: number): RemoveResult {
  const c = t.cols[i];
  const tp = top(c);
  if (!tp) {
    if (PAVED.includes(c.g)) return { ok: true, coins: Math.floor(piece(c.g).cost / 2), removed: c.g };
    return { ok: false, reason: "Nothing to remove" };
  }
  if (tp.fixed) return { ok: false, reason: `The ${tp.name.toLowerCase()} stays` };
  if (tp.id === "rock") return t.coins >= 20 ? { ok: true, coins: -20, removed: "rock" } : { ok: false, reason: "Clearing costs 20 coins" };
  return { ok: true, coins: Math.floor(tp.cost / 2), removed: tp.id };
}

/** Removes the top piece (half its price back), or turns paving back to grass. */
export function remove(t: Town, i: number): RemoveResult {
  const info = removeInfo(t, i);
  if (!info.ok) return info;
  const c = t.cols[i];
  if (c.s.length) c.s.pop();
  else c.g = "grass";
  t.coins += info.coins ?? 0;
  return info;
}

export function thUpgradeCheck(t: Town, stars: number): PlaceCheck {
  if (t.th >= MAX_TH) return { ok: false, reason: "Fully upgraded" };
  const need = TH_UPGRADE[t.th + 1];
  if (Math.floor(t.residents) < need.residents) return { ok: false, reason: `Needs ${need.residents} residents` };
  if (stars < need.stars) return { ok: false, reason: `Needs ${need.stars} eco ${need.stars === 1 ? "star" : "stars"}` };
  if (t.coins < need.coins) return { ok: false, reason: "Not enough coins" };
  return { ok: true };
}

export function upgradeTownHall(t: Town) {
  t.coins -= TH_UPGRADE[t.th + 1].coins;
  t.th = Math.min(MAX_TH, t.th + 1);
}

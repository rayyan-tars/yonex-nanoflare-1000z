/**
 * Saving the town on this device (localStorage). The save is compact and
 * checked piece by piece on load, so a damaged save can't break the game.
 */
import { pieceOrNull } from "./pieces";
import { MAX_TH, N, type Column, type Ground, type Town } from "./world";

export const SAVE_KEY = "greenhold.save.v1";

const GROUNDS: readonly Ground[] = ["grass", "sand", "water", "road", "path", "bike", "garden", "pond"];
const CODE = "gswrpbdo";

interface SaveFile {
  v: 1;
  seed: number;
  name: string;
  g: string;
  s: Record<string, string[]>;
  u: Record<string, number>;
  coins: number;
  mats: number;
  th: number;
  thUntil?: number;
  chest: number;
  matChest: number;
  residents: number;
  carbon: number;
  battery: number;
  goals: string[];
  clock: number;
  lastTs: number;
  counts: Town["counts"];
  air?: number[];
}

export function serialize(t: Town, air?: Float32Array): string {
  const s: Record<string, string[]> = {};
  const u: Record<string, number> = {};
  t.cols.forEach((c, i) => {
    if (c.s.length) s[i] = c.s;
    if (c.until !== undefined) u[i] = c.until;
  });
  const file: SaveFile = {
    v: 1,
    seed: t.seed,
    name: t.name,
    g: t.cols.map((c) => CODE[GROUNDS.indexOf(c.g)]).join(""),
    s,
    u,
    coins: t.coins,
    mats: t.mats,
    th: t.th,
    ...(t.thUntil ? { thUntil: t.thUntil } : {}),
    chest: t.chest,
    matChest: t.matChest,
    residents: t.residents,
    carbon: t.carbon,
    battery: t.battery,
    goals: t.goals,
    clock: t.clock,
    lastTs: t.lastTs,
    counts: t.counts,
    ...(air ? { air: Array.from(air, (v) => Math.round(v * 10) / 10) } : {}),
  };
  return JSON.stringify(file);
}

const num = (v: unknown, min = -Infinity, max = Infinity): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** Reads a save. Returns null when it can't be trusted (the game then starts fresh). */
export function deserialize(text: string): { town: Town; air: Float32Array | null } | null {
  let f: Partial<SaveFile>;
  try {
    f = JSON.parse(text);
  } catch {
    return null;
  }
  if (!f || f.v !== 1 || typeof f.g !== "string" || f.g.length !== N * N) return null;
  const seed = num(f.seed);
  const th = num(f.th, 1, MAX_TH);
  if (seed === null || th === null || !Number.isInteger(th)) return null;
  const cols: Column[] = [];
  for (let i = 0; i < N * N; i++) {
    const k = CODE.indexOf(f.g[i]);
    if (k < 0) return null;
    cols.push({ g: GROUNDS[k], s: [] });
  }
  if (f.s && typeof f.s === "object") {
    for (const [key, stack] of Object.entries(f.s)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= N * N || !Array.isArray(stack)) return null;
      if (!stack.every((id) => typeof id === "string" && pieceOrNull(id))) return null;
      cols[i].s = stack.slice(0, 12);
    }
  }
  if (f.u && typeof f.u === "object") {
    for (const [key, until] of Object.entries(f.u)) {
      const i = Number(key);
      const v = num(until);
      if (Number.isInteger(i) && cols[i]?.s.length && v !== null) cols[i].until = v;
    }
  }
  if (!cols.some((c) => c.s.includes("townhall"))) return null;
  const counts = f.counts && typeof f.counts === "object" ? f.counts : { trees: 0, built: 0, recycledBricks: 0 };
  const town: Town = {
    v: 1,
    seed,
    name: typeof f.name === "string" && f.name.trim() ? f.name.slice(0, 24) : "Greenhold",
    cols,
    coins: num(f.coins, 0) ?? 0,
    mats: num(f.mats, 0) ?? 0,
    th,
    ...(num(f.thUntil) !== null ? { thUntil: f.thUntil } : {}),
    chest: num(f.chest, 0) ?? 0,
    matChest: num(f.matChest, 0) ?? 0,
    residents: num(f.residents, 0) ?? 0,
    carbon: num(f.carbon) ?? 0,
    battery: num(f.battery, 0) ?? 0,
    goals: Array.isArray(f.goals) ? f.goals.filter((g): g is string => typeof g === "string") : [],
    clock: num(f.clock, 0) ?? 0,
    lastTs: num(f.lastTs, 0) ?? Date.now(),
    counts: {
      trees: num(counts.trees, 0) ?? 0,
      built: num(counts.built, 0) ?? 0,
      recycledBricks: num(counts.recycledBricks, 0) ?? 0,
    },
  };
  let air: Float32Array | null = null;
  if (Array.isArray(f.air) && f.air.length === N * N && f.air.every((v) => num(v, 0, 100) !== null)) air = Float32Array.from(f.air);
  return { town, air };
}

/**
 * Saving the town on this device (localStorage). The save is compact and
 * checked piece by piece on load, so a damaged save can't break the game.
 */
import { pieceOrNull } from "./pieces";
import { MAX_TH, N, type Column, type Ground, type Town } from "./world";

export const SAVE_KEY = "greenhold.save.v2";

const GROUNDS: readonly Ground[] = ["grass", "sand", "water", "road", "path", "bike", "plaza", "rail", "field", "reservoir"];
const CODE = "gswrpbzlfv";

export function serialize(t: Town, air?: Float32Array): string {
  const { cols, ...rest } = t;
  const s: Record<string, string[]> = {};
  cols.forEach((c, i) => {
    if (c.s.length) s[i] = c.s;
  });
  return JSON.stringify({
    ...rest,
    g: cols.map((c) => CODE[GROUNDS.indexOf(c.g)]).join(""),
    s,
    ...(air ? { air: Array.from(air, (v) => Math.round(v * 10) / 10) } : {}),
  });
}

const num = (v: unknown, min = -Infinity, max = Infinity): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** Reads a save. Returns null when it can't be trusted (the game then starts fresh). */
export function deserialize(text: string): { town: Town; air: Float32Array | null } | null {
  let f: Record<string, unknown>;
  try {
    f = JSON.parse(text);
  } catch {
    return null;
  }
  if (!f || f.v !== 2 || typeof f.g !== "string" || f.g.length !== N * N) return null;
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
    for (const [key, stack] of Object.entries(f.s as Record<string, unknown>)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= N * N || !Array.isArray(stack)) return null;
      if (!stack.every((id) => typeof id === "string" && pieceOrNull(id))) return null;
      cols[i].s = stack.slice(0, 12);
    }
  }
  if (!cols.some((c) => c.s.includes("townhall"))) return null;
  const counts = (f.counts && typeof f.counts === "object" ? f.counts : {}) as Record<string, unknown>;
  const town: Town = {
    v: 2,
    world: Math.floor(num(f.world, 0, 9) ?? 0),
    complete: f.complete === true,
    seed,
    name: typeof f.name === "string" && f.name.trim() ? f.name.slice(0, 24) : "Greenhold",
    cols,
    coins: num(f.coins, 0) ?? 0,
    th,
    chest: num(f.chest, 0) ?? 0,
    residents: num(f.residents, 0) ?? 0,
    carbon: num(f.carbon) ?? 0,
    goal: Math.floor(num(f.goal, 0, 99) ?? 0),
    clock: num(f.clock, 0) ?? 0,
    lastTs: num(f.lastTs, 0) ?? Date.now(),
    counts: { trees: num(counts.trees, 0) ?? 0, collected: num(counts.collected, 0) ?? 0 },
  };
  let air: Float32Array | null = null;
  if (Array.isArray(f.air) && f.air.length === N * N && f.air.every((v) => num(v, 0, 100) !== null)) air = Float32Array.from(f.air as number[]);
  return { town, air };
}

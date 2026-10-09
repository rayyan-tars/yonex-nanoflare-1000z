/**
 * Heatwaves: a forecast, then two minutes of heat that test the town.
 * Only three things matter, and each has one rule:
 * - Shade: a home is shaded by 2 trees, a park or a green roof within 2 tiles.
 *   Unshaded homes get hot and run air-conditioning.
 * - Power: that air-conditioning raises power demand.
 * - Water: everyone uses more water.
 * Heatwaves arrive on a fixed schedule (no dice), so the same town always
 * scores the same. Simplified Greenhold simulation indicators.
 */
import { N, idx, inside, xy, type Town } from "./world";

/**
 * First warning (game clock seconds: 4:30 on day two), the gap between heatwaves (3 days), the
 * warning, the heat itself (8:30 to 17:30, so the result and the recovery come in daylight), and
 * clear skies after.
 */
export const HEAT = { first: 285, period: 720, forecast: 40, length: 90, rampIn: 8, rampOut: 12, after: 40 };

export type HeatPhase = "none" | "forecast" | "event";

export interface HeatState {
  phase: HeatPhase;
  /** 0..1: how hot it is right now (eases in and out). */
  intensity: number;
  /** Seconds until the heat arrives (forecast) or until it ends (event). */
  seconds: number;
  /** Which heatwave this is (0 = the first). */
  n: number;
}

/** True from the warning until a little after the heat ends: the sky stays clear. */
export function heatSkies(clock: number) {
  const n = Math.max(0, Math.floor((clock - HEAT.first) / HEAT.period));
  const warn = HEAT.first + n * HEAT.period;
  return clock >= warn && clock < warn + HEAT.forecast + HEAT.length + HEAT.after;
}

export function heatAt(clock: number): HeatState {
  const n = Math.max(0, Math.floor((clock - HEAT.first) / HEAT.period));
  const warn = HEAT.first + n * HEAT.period;
  const start = warn + HEAT.forecast;
  const end = start + HEAT.length;
  if (clock < warn || clock >= end) return { phase: "none", intensity: 0, seconds: 0, n };
  if (clock < start) return { phase: "forecast", intensity: 0, seconds: start - clock, n };
  const k = Math.min(1, (clock - start) / HEAT.rampIn, (end - clock) / HEAT.rampOut);
  return { phase: "event", intensity: k * k * (3 - 2 * k), seconds: end - clock, n };
}

/** Game clock when the next warning starts (for testing and the goals). */
export const nextHeatwave = (clock: number) => {
  const n = Math.max(0, Math.ceil((clock - HEAT.first) / HEAT.period));
  return HEAT.first + n * HEAT.period;
};

/** What cools the tiles around it: [how much, how far in tiles]. 2 trees (1.0) make full shade. */
const COOLING: Record<string, [number, number]> = {
  oak: [0.5, 2],
  pine: [0.5, 2],
  orchard: [0.5, 2],
  park: [1, 2],
  greenroof: [1, 0],
  fountain: [0.25, 1],
};
const WATER_COOLING: [number, number] = [0.25, 1];

/** Shade on every tile: 1 or more is full shade. */
export function shadeMap(t: Town) {
  const cool = new Float32Array(N * N);
  const add = (i: number, [v, r]: [number, number]) => {
    const { x, y } = xy(i);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy)) cool[idx(x + dx, y + dy)] += v;
  };
  t.cols.forEach((c, i) => {
    if (c.g === "water" || c.g === "reservoir") add(i, WATER_COOLING);
    for (const id of c.s) if (COOLING[id]) add(i, COOLING[id]);
  });
  return cool;
}

export type Shade = "shaded" | "partly" | "exposed";
export const shadeOf = (cool: number): Shade => (cool >= 1 ? "shaded" : cool >= 0.5 ? "partly" : "exposed");

/** Extra power a home needs for air-conditioning at full heat, as a share of its normal use. */
export const AC_EXTRA = 0.6;
/** Extra water everyone uses at full heat. */
export const HEAT_WATER = 0.35;

export interface HeatResult {
  /** 0..100. */
  score: number;
  homes: number;
  shaded: number;
  partly: number;
  exposed: number;
  /** How much of the demand power / water covered while the heat was strong, on average (0..1). */
  power: number;
  water: number;
  peakDemand: number;
  peakSupply: number;
}

/** Running record of one heatwave, sampled every tick while the heat is strong. */
export interface HeatLog {
  n: number;
  samples: number;
  /** Sums of the share of demand covered (each sample at most 1). */
  power: number;
  water: number;
  shadeSum: number;
  last: { homes: number; shaded: number; partly: number; exposed: number };
  peakDemand: number;
  peakSupply: number;
}

/** Resilience: 40% shade at homes, 30% power covering demand, 30% water covering demand. */
export function heatResult(log: HeatLog): HeatResult {
  const s = Math.max(1, log.samples);
  const shade = log.shadeSum / s;
  const power = log.power / s;
  const water = log.water / s;
  return {
    score: Math.round(100 * (0.4 * shade + 0.3 * power + 0.3 * water)),
    ...log.last,
    power,
    water,
    peakDemand: log.peakDemand,
    peakSupply: log.peakSupply,
  };
}

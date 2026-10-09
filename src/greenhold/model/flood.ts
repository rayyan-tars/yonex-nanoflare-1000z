/**
 * Heavy rain: a warning, then rain that floods roads with too much
 * concrete and too little green around them. One rule:
 *
 *   A road floods when there is more concrete than green within 2 tiles.
 *
 * Concrete is roads, paths and plazas (1 each) and buildings (2: roofs
 * shed all their rain). Green is grass and fields (0.5), flowers (1),
 * trees and orchards (4), green roofs (3), water and reservoirs (3) and
 * parks (10). Rain comes on a fixed schedule,
 * so the same town always floods the same way. Simplified Greenhold
 * simulation indicators, not hydrology.
 */
import { HEAT } from "./heat";
import { piece } from "./pieces";
import { N, PAVED, idx, inside, xy, type Town } from "./world";

/**
 * First warning (4:30 on day three, a day after the first heatwave), the gap between storms (3 days),
 * the warning, the rain (8:30 to 17:30), the water draining away, then clear skies for a while.
 */
export const FLOOD = { first: HEAT.first + 240, period: 720, forecast: 40, length: 90, rampIn: 10, rampOut: 12, drain: 30, after: 60 };

export type FloodPhase = "none" | "forecast" | "rain" | "drain";

export interface FloodState {
  phase: FloodPhase;
  /** 0..1: how hard it is raining. */
  intensity: number;
  /** 0..1: how much standing water there is (rises with the rain, drains away afterwards). */
  water: number;
  /** Seconds until the rain (forecast), until it stops (rain) or until the water is gone (drain). */
  seconds: number;
}

const smooth = (k: number) => k * k * (3 - 2 * k);

export function floodAt(clock: number): FloodState {
  const n = Math.max(0, Math.floor((clock - FLOOD.first) / FLOOD.period));
  const warn = FLOOD.first + n * FLOOD.period;
  const start = warn + FLOOD.forecast;
  const end = start + FLOOD.length;
  const dry = end + FLOOD.drain;
  if (clock < warn || clock >= dry) return { phase: "none", intensity: 0, water: 0, seconds: 0 };
  if (clock < start) return { phase: "forecast", intensity: 0, water: 0, seconds: start - clock };
  if (clock < end) {
    const k = smooth(Math.min(1, (clock - start) / FLOOD.rampIn, (end - clock) / FLOOD.rampOut));
    // Water builds up over the first 30 seconds of rain.
    return { phase: "rain", intensity: k, water: smooth(Math.min(1, (clock - start) / 30)), seconds: end - clock };
  }
  return { phase: "drain", intensity: 0, water: smooth(1 - (clock - end) / FLOOD.drain), seconds: dry - clock };
}

/** True for a minute after the water has drained: the sky clears. */
export function floodClearing(clock: number) {
  const n = Math.max(0, Math.floor((clock - FLOOD.first) / FLOOD.period));
  const dry = FLOOD.first + n * FLOOD.period + FLOOD.forecast + FLOOD.length + FLOOD.drain;
  return clock >= dry && clock < dry + FLOOD.after;
}

/** Game clock when the next rain warning starts. */
export const nextFlood = (clock: number) => FLOOD.first + Math.max(0, Math.ceil((clock - FLOOD.first) / FLOOD.period)) * FLOOD.period;

/** How green each tile is, and how much concrete it is. */
function tileGreen(t: Town, i: number) {
  const c = t.cols[i];
  let green = 0;
  let concrete = 0;
  const built = c.s.some((id) => piece(id).kind !== "nature" && !piece(id).fixed);
  if (PAVED.includes(c.g) || c.g === "rail") concrete += 1;
  else if (built) concrete += 2;
  else if (c.g === "grass" || c.g === "field") green += 0.5;
  else if (c.g === "water" || c.g === "reservoir") green += 3;
  for (const id of c.s) green += id === "oak" || id === "pine" || id === "orchard" ? 4 : id === "park" ? 10 : id === "greenroof" ? 3 : id === "flowers" ? 1 : 0;
  return { green, concrete };
}

export interface FloodMap {
  /** Per tile: green minus concrete within 2 tiles (negative = floods if it's a road). */
  margin: Float32Array;
  /** Road and plaza tiles (the ones that can flood). */
  roads: number[];
  /** Roads that flood in heavy rain. */
  flooded: number[];
  /** Groups of touching flooded roads. */
  sections: number[][];
}

const ROAD = (g: string) => g === "road" || g === "plaza";

export function floodMap(t: Town): FloodMap {
  const green = new Float32Array(N * N);
  const concrete = new Float32Array(N * N);
  t.cols.forEach((_, i) => {
    const v = tileGreen(t, i);
    green[i] = v.green;
    concrete[i] = v.concrete;
  });
  const margin = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let g = 0;
      let c = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (inside(x + dx, y + dy)) {
            g += green[idx(x + dx, y + dy)];
            c += concrete[idx(x + dx, y + dy)];
          }
      margin[idx(x, y)] = g - c;
    }
  const roads: number[] = [];
  const flooded: number[] = [];
  t.cols.forEach((c, i) => {
    if (!ROAD(c.g)) return;
    roads.push(i);
    if (margin[i] < 0) flooded.push(i);
  });
  // Touching flooded roads make one section.
  const left = new Set(flooded);
  const sections: number[][] = [];
  for (const f of flooded) {
    if (!left.has(f)) continue;
    const group: number[] = [];
    const stack = [f];
    left.delete(f);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      const { x, y } = xy(i);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = idx(x + dx, y + dy);
        if (inside(x + dx, y + dy) && left.has(j)) {
          left.delete(j);
          stack.push(j);
        }
      }
    }
    sections.push(group);
  }
  return { margin, roads, flooded, sections };
}

export interface FloodResult {
  /** 0..100: share of roads that stayed dry. */
  score: number;
  roads: number;
  flooded: number;
  sections: number;
}

export const floodResult = (m: { roads: number; flooded: number; sections: number }): FloodResult => ({
  score: m.roads ? Math.round(100 * (1 - m.flooded / m.roads)) : 100,
  ...m,
});

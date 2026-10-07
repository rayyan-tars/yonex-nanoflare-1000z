/**
 * Clear Skies: one town, one problem (dirty air), three decisions.
 *
 * The town sits downwind of two coal plants and its streets are full of
 * cars. Each step offers three options; the sustainable one changes the
 * town, the others explain why they wouldn't clear the air. Air numbers are
 * simplified game values, not real measurements.
 */
import { analyze, env, stepAir, type Stats } from "./sim";
import { N, idx, newTown, type Column, type Ground, type Town } from "./world";

/** Noon, clear weather, wind blowing from the coal plants toward the homes. */
export const LEVEL_CLOCK = 120;
const SEED = 2050;

export const COAL = [idx(26, 19), idx(30, 19)];

/** Rows of homes: [y, x from, x to, storeys]. */
const HOME_ROWS: [number, number, number, number][] = [
  [25, 23, 27, 2],
  [25, 29, 33, 3],
  [26, 23, 27, 3],
  [26, 29, 33, 2],
  [31, 23, 27, 3],
  [31, 29, 33, 2],
  [32, 23, 27, 2],
  [32, 29, 33, 3],
];
const BLOCKS = ["concrete", "brick", "timber", "concrete", "glass"];

export function buildLevel(now: number): Town {
  const t = newTown(SEED, now);
  const set = (x: number, y: number, g: Ground, s: string[] = []) => (t.cols[idx(x, y)] = { g, s } satisfies Column);
  // Clear the town site (keeping the Town Hall in the middle).
  for (let y = 16; y <= 37; y++) for (let x = 19; x <= 37; x++) if (!(x === 28 && y === 28)) set(x, y, "grass");
  set(28, 28, "grass", ["townhall"]);
  for (let x = 19; x <= 37; x++) set(x, 30, "road");
  for (let x = 22; x <= 34; x++) set(x, 24, "road");
  for (let y = 18; y <= 36; y++) {
    set(22, y, "road");
    set(34, y, "road");
  }
  set(28, 29, "path");
  for (const [y, x0, x1, h] of HOME_ROWS)
    for (let x = x0; x <= x1; x++) {
      const s: string[] = [];
      for (let k = 0; k < h - ((x + y) % 2); k++) s.push(BLOCKS[(x * 3 + y + k) % BLOCKS.length]);
      if (!s.length) s.push("concrete");
      s.push("roof");
      set(x, y, "grass", s);
    }
  for (const i of COAL) t.cols[i] = { g: "grass", s: ["coal"] };
  t.th = 5;
  t.coins = 1e9;
  t.mats = 1e9;
  t.clock = LEVEL_CLOCK;
  return t;
}

/** One change to the town; the UI plays them one after another with an animation. */
export type Op = { kind: "remove"; i: number } | { kind: "place"; i: number; id: string } | { kind: "ground"; i: number; g: Ground };

export interface Choice {
  id: string;
  title: string;
  blurb: string;
  /** A piece whose picture illustrates the option. */
  pic: string;
  good: boolean;
  /** What happens if you pick it (for the wrong ones: why it won't clear the air). */
  feedback: string;
}

export interface Step {
  id: "power" | "traffic" | "nature";
  title: string;
  problem: string;
  /** Shown once the change is made. */
  fact: string;
  /** Where the camera looks for this step. */
  focus: number;
  choices: Choice[];
  ops: (t: Town) => Op[];
}

const free = (t: Town, x: number, y: number) => t.cols[idx(x, y)]?.g === "grass" && !t.cols[idx(x, y)].s.length;

export const STEPS: readonly Step[] = [
  {
    id: "power",
    title: "Clean up the power",
    problem: "Two coal plants make the town's electricity. The wind blows their smoke straight over people's homes.",
    fact: "Burning coal puts tiny particles into the air we breathe, and CO₂ that heats the planet. Sun and wind make electricity without burning anything.",
    focus: idx(28, 20),
    choices: [
      {
        id: "chimneys",
        title: "Build taller chimneys",
        blurb: "Send the smoke higher up.",
        pic: "coal",
        good: false,
        feedback: "Taller chimneys spread smoke further away, but the same amount still comes out. Someone else breathes it instead.",
      },
      {
        id: "renewables",
        title: "Switch to sun and wind",
        blurb: "Wind turbines and solar panels, with a battery for the night.",
        pic: "solar",
        good: true,
        feedback: "The coal plants close and wind turbines and solar panels take over.",
      },
      {
        id: "more-coal",
        title: "Build a bigger coal plant",
        blurb: "Cheap power for a growing town.",
        pic: "coal",
        good: false,
        feedback: "More coal means more smoke. The air would get worse, not better.",
      },
    ],
    ops: (t) => {
      const ops: Op[] = COAL.map((i) => ({ kind: "remove", i }));
      for (const i of COAL) ops.push({ kind: "place", i, id: "wind" });
      for (const [x, y] of [
        [24, 19],
        [32, 19],
      ])
        if (free(t, x, y)) ops.push({ kind: "place", i: idx(x, y), id: "wind" });
      for (let y = 20; y <= 21; y++)
        for (let x = 25; x <= 31; x++) if (free(t, x, y) && !(x === 28 && y === 21)) ops.push({ kind: "place", i: idx(x, y), id: "solar" });
      ops.push({ kind: "place", i: idx(28, 21), id: "battery" });
      return ops;
    },
  },
  {
    id: "traffic",
    title: "Fix the traffic",
    problem: "Almost everyone drives, even for short trips. Exhaust fumes hang in the streets where children walk to school.",
    fact: "Car exhaust is one of the main sources of air pollution in towns. One bus can carry dozens of people who would otherwise drive, and a bike makes no fumes at all.",
    focus: idx(28, 30),
    choices: [
      {
        id: "wider-roads",
        title: "Widen the roads",
        blurb: "More lanes so traffic moves faster.",
        pic: "road",
        good: false,
        feedback: "Wider roads usually fill up with even more cars after a while. Traffic and fumes grow.",
      },
      {
        id: "parking",
        title: "Build more car parks",
        blurb: "Make it easier to park near home.",
        pic: "road",
        good: false,
        feedback: "Easier parking makes driving more tempting, so there are more cars, not fewer.",
      },
      {
        id: "bikes-buses",
        title: "Bike lanes and buses",
        blurb: "Safe lanes beside every street, and bus stops in walking distance.",
        pic: "bus",
        good: true,
        feedback: "Bike lanes run past every home and two bus stops open. Most people leave the car at home.",
      },
    ],
    ops: (t) => {
      const ops: Op[] = [];
      for (const y of [27, 33]) for (let x = 23; x <= 33; x++) if (free(t, x, y)) ops.push({ kind: "ground", i: idx(x, y), g: "bike" });
      for (const [x, y] of [
        [25, 29],
        [31, 23],
      ])
        if (free(t, x, y)) ops.push({ kind: "place", i: idx(x, y), id: "bus" });
      return ops;
    },
  },
  {
    id: "nature",
    title: "Bring nature back",
    problem: "The streets are bare and grey. There's nothing to soak up dust or shade the pavements on hot days.",
    fact: "Trees and plants catch some dust and cool hot streets. They help, but cutting pollution where it starts, as you did with power and traffic, matters most.",
    focus: idx(28, 28),
    choices: [
      {
        id: "purifiers",
        title: "Air purifiers in every home",
        blurb: "Machines that clean the air indoors.",
        pic: "battery",
        good: false,
        feedback: "Purifiers only clean the air inside one room. The air outside, where people walk and play, stays the same.",
      },
      {
        id: "trees",
        title: "Street trees and green roofs",
        blurb: "Plant trees along the streets and grow plants on rooftops.",
        pic: "oak",
        good: true,
        feedback: "Trees line the streets and plants cover the rooftops.",
      },
      {
        id: "car-park",
        title: "Clear the woods for a car park",
        blurb: "Space for visitors to park.",
        pic: "road",
        good: false,
        feedback: "Woods clean the air. Cutting them down for parking would make it worse.",
      },
    ],
    ops: (t) => {
      const ops: Op[] = [];
      for (const y of [23, 35]) for (let x = 23; x <= 33; x += 1) if (free(t, x, y)) ops.push({ kind: "place", i: idx(x, y), id: x % 2 ? "oak" : "pine" });
      for (const y of [28, 29]) for (const x of [23, 24, 26, 30, 32, 33]) if (free(t, x, y)) ops.push({ kind: "place", i: idx(x, y), id: (x + y) % 3 ? "oak" : "flowers" });
      // Swap tile roofs for green roofs on every other building.
      t.cols.forEach((c, i) => {
        if (c.s[c.s.length - 1] === "roof" && (i % N) % 2 === 0) {
          ops.push({ kind: "remove", i });
          ops.push({ kind: "place", i, id: "greenroof" });
        }
      });
      return ops;
    },
  },
];

/** Applies one change straight to the town (no costs: this is a guided story). */
export function applyOp(t: Town, op: Op) {
  const c = t.cols[op.i];
  if (op.kind === "remove") c.s.pop();
  else if (op.kind === "place") c.s.push(op.id);
  else c.g = op.g;
  c.until = undefined;
}

/** Air quality bands for the game's simplified air index (0 = clean). */
export function airBand(v: number): { label: string; tone: "good" | "fair" | "poor" | "bad" } {
  if (v < 5) return { label: "Good", tone: "good" };
  if (v < 12) return { label: "Moderate", tone: "fair" };
  if (v < 25) return { label: "Unhealthy", tone: "poor" };
  return { label: "Very unhealthy", tone: "bad" };
}

export const PLEDGES = [
  { id: "walk", text: "Walk, cycle or take the bus to school one day this week" },
  { id: "lights", text: "Switch off lights and screens nobody is using" },
  { id: "plant", text: "Plant or look after a tree or plant" },
  { id: "idle", text: "Ask the grown-ups not to leave the car engine running while waiting" },
  { id: "share", text: "Show my family how clean energy cleared the air in Clear Skies" },
];

/** What the town adds up to right now, with every home lived in. */
export function levelStats(t: Town, air: Float32Array, now: number): Stats {
  const e = env(LEVEL_CLOCK);
  let s = analyze(t, air, e, now);
  t.residents = s.housing;
  s = analyze(t, air, e, now);
  // This story is only about air from power and traffic; rubbish is collected off-screen.
  s.waste = { ...s.waste, overflow: 0 };
  return s;
}

/** Lets the air settle for `seconds` of game time (smoke spreads, drifts and clears). */
export function settleAir(t: Town, air: Float32Array, seconds: number, now: number, step = 0.25) {
  const e = env(LEVEL_CLOCK);
  const s = levelStats(t, air, now);
  for (let k = 0; k < seconds / step; k++) stepAir(t, air, e, s, step, now);
  return levelStats(t, air, now);
}

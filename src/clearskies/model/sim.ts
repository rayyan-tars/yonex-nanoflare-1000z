/**
 * The town simulation: what the buildings add up to (energy, water, food,
 * waste, travel, carbon), how air pollution spreads, how happy people are,
 * the five eco stars, goals and the advisor's tips.
 *
 * Everything is simplified game units. Stars use daily-average output (not
 * this instant's sunshine), so they don't flicker between day and night.
 */
import { piece, type PieceDef } from "./pieces";
import {
  CHEST_CAP,
  MAT_CAP,
  N,
  PAVED,
  TH_UPGRADE,
  building,
  finishBuilds,
  finishThUpgrade,
  idx,
  inside,
  top,
  xy,
  type Town,
} from "./world";

export const DAY_SECONDS = 240;
const AVG_SUN = 0.36;
const AVG_WIND = 0.55;
const ORGANIC_SHARE = 0.3;

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
  /** 0..1 position in the day (0.5 = noon). */
  dayPhase: number;
  sun: number;
  wind: number;
  rain: number;
  /** 0 at noon, 1 at midnight. */
  night: number;
}

export function env(clock: number): Env {
  const dayPhase = (clock % DAY_SECONDS) / DAY_SECONDS;
  const d = (dayPhase - 0.22) / 0.56;
  const sun = d > 0 && d < 1 ? Math.sin(d * Math.PI) : 0;
  const wind = 0.2 + 0.8 * noise(clock / 37);
  const r = noise(clock / 70 + 100);
  const rain = r > 0.68 ? Math.min(1, (r - 0.68) / 0.18) : 0;
  const light = Math.min(1, Math.max(0, (Math.sin(2 * Math.PI * (dayPhase - 0.25)) + 0.3) / 0.6));
  const night = 1 - light;
  return { dayPhase, sun, wind, rain, night };
}

/** Wind direction in radians (0 = toward +x). */
export const windAngle = (clock: number) => 0.6 + Math.sin(clock / 300) * 1.7;

export interface Balance {
  supply: number;
  demand: number;
}

export interface Stats {
  housing: number;
  homes: number[];
  /** Built columns that aren't homes yet, and why. */
  noRoof: number[];
  noAccess: number[];
  energy: Balance & { steady: number; solar: number; wind: number; fromBattery: number; batteryCap: number; avgSupply: number; renewShare: number };
  water: Balance & { avgSupply: number };
  food: Balance & { imported: number };
  waste: { made: number; compost: number; recycle: number; landfill: number; overflow: number };
  travel: { covered: number; carShare: number; cars: number };
  /** Carbon per minute: made and taken in. */
  co2: { made: number; sink: number; net: number; perResident: number };
  upkeep: number;
  /** Average air pollution where people live (0..100). */
  homeAir: number;
  meanAir: number;
  happiness: number;
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

const running = (t: Town, i: number, now: number) => !building(t.cols[i], now);

/** Adds up everything in the town. Pure: reads the town, the air and the weather. */
export function analyze(t: Town, air: Float32Array, e: Env, now: number): Stats {
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

  const homes: number[] = [];
  const noRoof: number[] = [];
  const noAccess: number[] = [];
  let housing = 0;
  let insulSum = 0;
  let steady = 0;
  let solarCap = 0;
  let windCap = 0;
  let batteryCap = 0;
  let machineUse = 0;
  let waterSteady = 0;
  let machineCo2 = 0;
  let rainCap = 0;
  let gardens = 0;
  let farms = 0;
  let composters = 0;
  let compostCap = 0;
  let recycleCap = 0;
  let landfillCap = 0;
  let upkeep = 0;
  let sink = 0;
  const stops: { i: number; r: number }[] = [];
  const niceSpots: { i: number; r: number }[] = [];

  t.cols.forEach((c, i) => {
    if (c.g === "garden") {
      gardens++;
      sink += piece("garden").sink!;
      niceSpots.push({ i, r: 2 });
    }
    if (c.g === "pond") niceSpots.push({ i, r: 3 });
    if (!c.s.length) return;
    const live = running(t, i, now);
    const pieces = c.s.map(piece);
    const tp = pieces[pieces.length - 1];
    const blocks = pieces.filter((p) => p.kind === "block");
    // Anything built from blocks becomes homes once it has a roof and a path or road within 2 tiles.
    if (blocks.length) {
      const roofed = tp.kind === "roof" || !!tp.rooftop;
      const cap = blocks.reduce((n, p) => n + (p.housing ?? 0), 0);
      farms += blocks.filter((p) => p.id === "farmblock").length;
      if (cap > 0) {
        if (!roofed) noRoof.push(i);
        else if (!near(i, 2, paved)) noAccess.push(i);
        else {
          homes.push(i);
          housing += cap;
          const roofInsul = tp.insul ?? 1;
          insulSum += blocks.reduce((n, p) => n + (p.housing ?? 0) * (p.insul ?? 1), 0) * roofInsul;
        }
      }
    }
    for (const p of pieces) {
      if (p.id === "greenroof") {
        sink += p.sink!;
        niceSpots.push({ i, r: 1 });
      }
      if (p.id === "solarroof") solarCap += p.solar!;
      if (p.id === "farmblock") machineUse += 3;
    }
    if (!live) return;
    if (tp.kind === "machine" || tp.kind === "nature") applyMachine(tp, i);
  });

  function applyMachine(p: PieceDef, i: number) {
    if (p.energy && p.energy > 0) steady += p.energy;
    if (p.co2) machineCo2 += p.co2;
    if (p.solar) solarCap += p.solar;
    if (p.wind) windCap += p.wind;
    if (p.battery) batteryCap += p.battery;
    if (p.energy && p.energy < 0) machineUse += -p.energy;
    if (p.water && p.water > 0) waterSteady += p.water;
    if (p.rain) rainCap += p.rain;
    if (p.compost) {
      composters++;
      compostCap += p.compost;
    }
    if (p.recycle) recycleCap += p.recycle;
    if (p.landfill) landfillCap += p.landfill;
    if (p.upkeep) upkeep += p.upkeep;
    if (p.cover) stops.push({ i, r: p.cover });
    if (p.sink) sink += p.sink;
    if (p.nice) niceSpots.push({ i, r: p.nice });
  }

  const residents = Math.min(t.residents, housing);
  const avgInsul = housing ? insulSum / housing : 1;

  // Energy: people (by how well their homes keep heat) plus machines.
  const eDemand = residents * avgInsul + machineUse;
  const solarNow = solarCap * e.sun;
  const windNow = windCap * e.wind;
  const produced = steady + solarNow + windNow;
  const fromBattery = Math.min(Math.max(0, eDemand - produced), t.battery);
  const avgSupply = steady + solarCap * AVG_SUN + windCap * AVG_WIND;
  const renewAvg = solarCap * AVG_SUN + windCap * AVG_WIND;
  const renewShare = avgSupply > 0 ? renewAvg / avgSupply : 0;

  // Water.
  const wDemand = residents * 1 + gardens * 1;
  const wSupply = waterSteady + rainCap * (0.4 + 0.6 * e.rain);
  const wAvg = waterSteady + rainCap * 0.55;

  // Food: gardens grow more with compost (one compost bin feeds 4 gardens).
  const boosted = Math.min(gardens, composters * 4);
  const fSupply = gardens * 3 + boosted * 1.5 + farms * 5;
  const fDemand = residents * 0.5;
  const imported = Math.max(0, fDemand - fSupply);

  // Waste: about a third is food waste (compost); then recycling, then landfill.
  const made = residents * 1;
  const toCompost = Math.min(made * ORGANIC_SHARE, compostCap);
  const toRecycle = Math.min(made - toCompost, recycleCap);
  const toLandfill = Math.min(made - toCompost - toRecycle, landfillCap);
  const overflow = Math.max(0, made - toCompost - toRecycle - toLandfill);

  // Travel: homes near a bike lane or a bus or tram stop leave the car.
  let coveredCap = 0;
  for (const h of homes) {
    const { x, y } = xy(h);
    const byStop = stops.some((s) => {
      const p = xy(s.i);
      return Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= s.r;
    });
    if (byStop || near(h, 2, bikeLane)) coveredCap += homeCapacity(t, h);
  }
  const coveredShare = housing ? coveredCap / housing : 0;
  const carShare = residents ? 1 - coveredShare * 0.55 : 0;
  const cars = residents * carShare;

  // Carbon per minute.
  const co2Made =
    machineCo2 +
    toLandfill * 0.12 +
    overflow * 0.2 +
    cars * 0.25 +
    imported * 0.4 +
    // Energy that has to come from somewhere when supply falls short is imported fossil power.
    Math.max(0, eDemand - produced - fromBattery) * 0.5;
  const net = co2Made - sink;

  // Air where people live.
  let airSum = 0;
  let meanAir = 0;
  for (let i = 0; i < air.length; i++) meanAir += air[i];
  meanAir /= air.length;
  for (const h of homes) airSum += air[h];
  const homeAir = homes.length ? airSum / homes.length : 0;

  // Happiness.
  let niceHomes = 0;
  for (const h of homes) {
    const { x, y } = xy(h);
    if (niceSpots.some((s) => {
      const p = xy(s.i);
      return Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= s.r;
    }))
      niceHomes++;
  }
  const eOk = produced + fromBattery >= eDemand - 0.01;
  const wOk = wSupply >= wDemand - 0.01;
  let happiness = 50;
  happiness += homes.length ? 20 * (niceHomes / homes.length) : 0;
  happiness += eOk ? 8 : -15;
  happiness += wOk ? 8 : -15;
  happiness += fDemand ? 6 * Math.min(1, fSupply / fDemand) : 0;
  happiness -= homeAir * 0.7;
  happiness -= made ? 20 * (overflow / made) : 0;
  happiness = Math.max(5, Math.min(100, happiness));

  const perResident = residents ? net / residents : 0;
  const enough = residents >= 4;
  const stars = [
    enough && renewShare >= 0.7 && avgSupply >= eDemand,
    enough && homeAir < 12,
    enough && overflow === 0 && toLandfill / made <= 0.3,
    enough && co2Made / residents <= 0.35,
    enough && carShare <= 0.4,
  ];

  return {
    housing,
    homes,
    noRoof,
    noAccess,
    energy: { supply: produced + fromBattery, demand: eDemand, steady, solar: solarNow, wind: windNow, fromBattery, batteryCap, avgSupply, renewShare },
    water: { supply: wSupply, demand: wDemand, avgSupply: wAvg },
    food: { supply: fSupply, demand: fDemand, imported },
    waste: { made, compost: toCompost, recycle: toRecycle, landfill: toLandfill, overflow },
    travel: { covered: coveredShare, carShare, cars },
    co2: { made: co2Made, sink, net, perResident },
    upkeep: upkeep + imported * 0.6,
    homeAir,
    meanAir,
    happiness,
    taxRate: residents * 0.15 * (0.4 + happiness / 100),
    stars,
    starCount: stars.filter(Boolean).length,
  };
}

export function homeCapacity(t: Town, i: number) {
  return t.cols[i].s.reduce((n, id) => n + (piece(id).housing ?? 0), 0);
}

export const STAR_NAMES = [
  { name: "Clean power", how: "70% of your energy from sun and wind, with enough for everyone" },
  { name: "Clean air", how: "Air where people live stays below 12" },
  { name: "Zero waste", how: "No overflowing waste, and at most 30% goes to landfill" },
  { name: "Low carbon", how: "The town makes at most 0.35 carbon per resident per minute" },
  { name: "Green travel", how: "At most 40% of residents drive" },
];

/** Spreads, drifts and cleans air pollution for one step. */
export function stepAir(t: Town, air: Float32Array, e: Env, stats: Stats, dt: number, now: number) {
  const src = new Float32Array(N * N);
  const clean = new Float32Array(N * N);
  let roads = 0;
  t.cols.forEach((c) => c.g === "road" && roads++);
  const perRoad = roads ? (stats.travel.cars * 0.42) / roads : 0;
  t.cols.forEach((c, i) => {
    if (c.g === "road") src[i] += perRoad;
    if (c.g === "garden") clean[i] += piece("garden").absorb!;
    if (c.g === "pond") clean[i] += piece("pond").absorb!;
    if (!c.s.length) return;
    const live = running(t, i, now);
    for (const id of c.s) {
      const p = piece(id);
      if (p.kind === "roof" && p.absorb) clean[i] += p.absorb;
    }
    const tp = top(c)!;
    if (live && tp.emit) src[i] += tp.emit;
    if ((tp.kind === "nature" || tp.kind === "machine") && tp.absorb && live) clean[i] += tp.absorb;
  });
  if (stats.waste.overflow > 0) {
    // Uncollected rubbish piles up by the Town Hall.
    src[idx(28, 29)] += stats.waste.overflow * 0.3;
  }
  const out = new Float32Array(N * N);
  // The wind slowly swings around, carrying smoke to different parts of town.
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
      // Natural clean-up, plus plants and water taking out a share of what passes over them.
      v -= v * (0.009 + clean[i] * 0.25) * dt;
      // Rain washes the air.
      v -= v * e.rain * 0.05 * dt;
      // The map edge lets air out.
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) v *= 1 - 0.3 * dt;
      out[i] = Math.max(0, Math.min(100, v));
    }
  }
  air.set(out);
}

export interface Goal {
  id: string;
  name: string;
  how: string;
  coins: number;
  mats: number;
  done: (t: Town, s: Stats) => boolean;
}

export const GOALS: readonly Goal[] = [
  { id: "first-home", name: "First neighbours", how: "Build blocks, roof them and connect a path so 2 people move in", coins: 120, mats: 10, done: (t) => t.residents >= 2 },
  { id: "power", name: "Lights on", how: "Make enough energy for everyone", coins: 100, mats: 0, done: (t, s) => s.energy.demand > 0 && s.energy.supply >= s.energy.demand },
  { id: "water", name: "Fresh water", how: "Supply enough water for everyone", coins: 100, mats: 0, done: (t, s) => s.water.demand > 0 && s.water.supply >= s.water.demand },
  { id: "trees", name: "Tree planter", how: "Plant 10 trees", coins: 120, mats: 0, done: (t) => t.counts.trees >= 10 },
  { id: "compost", name: "Close the loop", how: "Compost some food waste", coins: 80, mats: 10, done: (t, s) => s.waste.compost > 0 },
  { id: "food", name: "Home grown", how: "Grow all the food your town eats", coins: 150, mats: 0, done: (t, s) => s.food.demand >= 3 && s.food.imported === 0 },
  { id: "town20", name: "Growing town", how: "Reach 20 residents", coins: 200, mats: 20, done: (t) => t.residents >= 20 },
  { id: "bikes", name: "Pedal power", how: "Get car use below 60%", coins: 150, mats: 0, done: (t, s) => t.residents >= 8 && s.travel.carShare < 0.6 },
  { id: "star1", name: "First eco star", how: "Earn any eco star", coins: 150, mats: 20, done: (t, s) => s.starCount >= 1 },
  { id: "recycle", name: "Circular builder", how: "Build 10 recycled brick blocks", coins: 200, mats: 0, done: (t) => t.counts.recycledBricks >= 10 },
  { id: "star3", name: "Three stars", how: "Hold 3 eco stars at once", coins: 400, mats: 40, done: (t, s) => s.starCount >= 3 },
  { id: "town60", name: "Busy town", how: "Reach 60 residents", coins: 500, mats: 40, done: (t) => t.residents >= 60 },
  { id: "nocoal", name: "Coal-free", how: "Have 30+ residents and no coal plant", coins: 400, mats: 0, done: (t) => t.residents >= 30 && !t.cols.some((c) => c.s.includes("coal")) },
  { id: "star5", name: "Five stars", how: "Hold all 5 eco stars", coins: 1000, mats: 100, done: (t, s) => s.starCount === 5 },
];

export type SimEvent =
  | { type: "built"; i: number; id: string }
  | { type: "townhall"; level: number }
  | { type: "goal"; id: string }
  | { type: "moveIn"; n: number }
  | { type: "moveOut"; n: number };

/** Advances the town by `dt` seconds of play. */
export function tick(t: Town, sim: Sim, dt: number, now: number): SimEvent[] {
  const events: SimEvent[] = [];
  t.clock += dt;
  for (const i of finishBuilds(t, now)) events.push({ type: "built", i, id: t.cols[i].s[t.cols[i].s.length - 1] });
  if (finishThUpgrade(t, now)) events.push({ type: "townhall", level: t.th });
  const e = env(t.clock);
  const s = analyze(t, sim.air, e, now);
  sim.stats = s;

  // Batteries: charge from spare sun and wind, give it back when short.
  const spare = s.energy.steady + s.energy.solar + s.energy.wind - s.energy.demand;
  if (spare > 0) t.battery = Math.min(s.energy.batteryCap, t.battery + spare * dt);
  else t.battery = Math.max(0, t.battery - s.energy.fromBattery * dt);
  t.battery = Math.min(t.battery, s.energy.batteryCap);

  // People move in while there's room and the town is pleasant; they leave if it isn't.
  const before = Math.floor(t.residents);
  if (t.residents > s.housing) t.residents = s.housing;
  else if (s.happiness >= 30) t.residents = Math.min(s.housing, t.residents + 0.7 * dt);
  if (s.happiness < 22) t.residents = Math.max(0, t.residents - 0.25 * dt);
  const after = Math.floor(t.residents);
  if (after > before) events.push({ type: "moveIn", n: after - before });
  if (after < before) events.push({ type: "moveOut", n: before - after });

  // Money and materials.
  t.chest = Math.min(CHEST_CAP[t.th], t.chest + s.taxRate * dt);
  t.coins = Math.max(0, t.coins - (s.upkeep / 60) * dt);
  t.matChest = Math.min(Math.max(0, MAT_CAP[t.th] - t.mats), t.matChest + s.waste.recycle * 0.005 * dt);
  t.carbon += (s.co2.net / 60) * dt;

  stepAir(t, sim.air, e, s, dt, now);

  for (const g of GOALS) {
    if (!t.goals.includes(g.id) && g.done(t, s)) {
      t.goals.push(g.id);
      t.coins += g.coins;
      t.mats = Math.min(Math.max(t.mats, MAT_CAP[t.th]), t.mats + g.mats);
      events.push({ type: "goal", id: g.id });
    }
  }
  return events;
}

/** Time away: taxes and builds carry on (up to the chest size), capped at 8 hours. */
export function catchUp(t: Town, sim: Sim, now: number) {
  const away = Math.min(8 * 3600, Math.max(0, (now - t.lastTs) / 1000));
  if (away < 5) return 0;
  const e = env(t.clock);
  const s = analyze(t, sim.air, e, now);
  t.chest = Math.min(CHEST_CAP[t.th], t.chest + s.taxRate * away);
  t.coins = Math.max(0, t.coins - (s.upkeep / 60) * away);
  t.clock += Math.min(away, DAY_SECONDS);
  return away;
}

export function collectTaxes(t: Town) {
  const n = Math.floor(t.chest);
  t.coins += n;
  t.chest -= n;
  return n;
}

export function collectMats(t: Town) {
  const n = Math.floor(Math.min(t.matChest, Math.max(0, MAT_CAP[t.th] - t.mats)));
  t.mats += n;
  t.matChest -= n;
  return n;
}

export interface Tip {
  id: string;
  text: string;
  tone: "info" | "warn" | "good";
  /** Column to point at, if any. */
  at?: number;
}

/** The advisor's single most useful tip right now. */
export function advise(t: Town, s: Stats, now: number): Tip {
  const has = (id: string) => t.cols.some((c) => c.s.includes(id) || c.g === id);
  if (!s.homes.length && !s.noRoof.length && !s.noAccess.length)
    return { id: "start", tone: "info", text: "Stack blocks on the grass, top them with a roof, and keep a road or path within 2 tiles. People will move in." };
  if (s.noRoof.length) return { id: "roof", tone: "info", text: "A building needs a roof (or rooftop solar or a rain tank) before anyone can live in it.", at: s.noRoof[0] };
  if (s.noAccess.length) return { id: "access", tone: "warn", text: "Nobody can reach that building. Lay a path, bike lane or road within 2 tiles.", at: s.noAccess[0] };
  if (s.waste.overflow > 0)
    return { id: "waste", tone: "warn", text: "Rubbish is piling up. Compost bins take food waste; a recycling centre turns the rest into materials." };
  if (s.energy.demand > s.energy.supply + 0.01)
    return { id: "power", tone: "warn", text: has("coal") || has("solar") ? "Power is short. Solar runs free by day; batteries or wind cover the night." : "Homes need energy. Solar panels are clean; a coal plant is cheap but smoky and costs fuel every minute." };
  if (s.water.demand > s.water.supply + 0.01) return { id: "water", tone: "warn", text: "Water is short. Rain tanks fit on rooftops and need no power to pump." };
  if (s.homeAir >= 12) {
    const coal = t.cols.findIndex((c) => c.s.includes("coal"));
    return { id: "air", tone: "warn", text: coal >= 0 ? "Smoke is drifting over homes. Plant trees between them, or swap the coal plant for clean power." : "Traffic fumes are reaching homes. Trees, bike lanes and buses clear the air.", at: coal >= 0 ? coal : undefined };
  }
  if (t.residents >= 6 && s.travel.carShare > 0.6) return { id: "cars", tone: "info", text: "Most people drive. Bike lanes near homes, or a bus stop, get cars off the road." };
  if (s.food.imported > 0 && t.residents >= 6) return { id: "food", tone: "info", text: "Food is being trucked in. Veg gardens grow it locally, and compost helps them grow more." };
  if (has("coal") && s.energy.renewShare < 0.7 && t.th >= 2) return { id: "coal", tone: "info", text: "Your coal plant costs 6 coins of fuel and makes 24 carbon every minute. Wind and solar cost nothing to run." };
  if (t.chest >= CHEST_CAP[t.th] * 0.9) return { id: "chest", tone: "info", text: "The tax chest at the Town Hall is full. Tap it to collect.", at: idx(28, 28) };
  const next = TH_UPGRADE[t.th + 1];
  if (next && t.residents >= next.residents && s.starCount >= next.stars && !(t.thUntil && t.thUntil > now))
    return { id: "upgrade", tone: "good", text: "Your Town Hall can be upgraded! Tap it to unlock new pieces and taller buildings.", at: idx(28, 28) };
  if (s.starCount === 5) return { id: "five", tone: "good", text: "Five eco stars. Your town proves a good life doesn't have to cost the planet." };
  const missing = s.stars.findIndex((x) => !x);
  if (t.residents >= 4 && missing >= 0) return { id: `star-${missing}`, tone: "info", text: `Next star, ${STAR_NAMES[missing].name}: ${STAR_NAMES[missing].how}.` };
  return { id: "grow", tone: "good", text: "Looking good. Keep growing; build higher, or try a new kind of building." };
}


/**
 * The town simulation: homes, energy, travel, carbon and the air. Air
 * pollution spreads on a grid, drifts with the wind and is cleaned by
 * plants. Sun and wind count at their daily average, so the town doesn't
 * black out every night. Everything is simplified game units.
 */
import { piece } from "./pieces";
import { CHEST_CAP, N, PAVED, TH_UPGRADE, idx, inside, xy, type Town } from "./world";
import { WORLDS } from "./worlds";

export const DAY_SECONDS = 240;
/** Clean water from the Town Hall's old well. */
const WELL = 15;
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

export type Weather = "sunny" | "cloudy" | "rain" | "storm";

/** How each kind of weather changes clean power and the air. */
export const WEATHER: Record<Weather, { label: string; solar: number; wind: number; wash: number }> = {
  sunny: { label: "Sunny", solar: 1.2, wind: 0.8, wash: 0 },
  cloudy: { label: "Cloudy", solar: 0.7, wind: 1, wash: 0 },
  rain: { label: "Rain", solar: 0.45, wind: 1.15, wash: 0.03 },
  storm: { label: "Storm", solar: 0.3, wind: 1.6, wash: 0.06 },
};

/** The weather at a moment of game time; spells last a minute or two. */
export function weatherAt(clock: number): Weather {
  const n = noise(clock / 90 + 50);
  return n < 0.4 ? "sunny" : n < 0.64 ? "cloudy" : n < 0.86 ? "rain" : "storm";
}

/** The next change of weather within the next few minutes, if any. */
export function forecast(clock: number): { weather: Weather; inSeconds: number } | null {
  const now = weatherAt(clock);
  for (let dt = 5; dt <= 240; dt += 5) {
    const w = weatherAt(clock + dt);
    if (w !== now) return { weather: w, inSeconds: dt };
  }
  return null;
}

export interface Env {
  /** 0..1 through the day (0.5 = noon). */
  dayPhase: number;
  sun: number;
  wind: number;
  /** 0 at noon, 1 at night. */
  night: number;
  weather: Weather;
}

export function env(clock: number): Env {
  const dayPhase = (clock % DAY_SECONDS) / DAY_SECONDS;
  const d = (dayPhase - 0.22) / 0.56;
  const sun = d > 0 && d < 1 ? Math.sin(d * Math.PI) : 0;
  const weather = weatherAt(clock);
  const wind = Math.min(1.2, (0.25 + 0.75 * noise(clock / 37)) * WEATHER[weather].wind);
  const light = Math.min(1, Math.max(0, (Math.sin(2 * Math.PI * (dayPhase - 0.25)) + 0.3) / 0.6));
  return { dayPhase, sun, wind, night: 1 - light, weather };
}

/** Wind direction in radians (0 = toward +x); it slowly swings around. */
export const windAngle = (clock: number) => 0.9 + Math.sin(clock / 300) * 1.2;

export interface Stats {
  housing: number;
  homes: number[];
  /** Built columns that aren't homes yet, and why. */
  noRoof: number[];
  noAccess: number[];
  /** Train stations with no railway next to them. */
  noRail: number[];
  /** Supply is today's, with the weather; `clean`/`dirty`/`cleanShare` are on an average day. */
  energy: { supply: number; demand: number; clean: number; dirty: number; cleanShare: number; average: number };
  food: { supply: number; demand: number; imported: number };
  /** Safe drinking water: supply is the Town Hall's well plus filtered water. */
  water: { supply: number; demand: number; raw: number; filterCap: number };
  /** Delivery trucks bringing in food the town doesn't grow. */
  trucks: number;
  weather: Weather;
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
  /** Coins per minute from shops and cafés. */
  income: number;
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
  const rails = new Uint8Array(N * N);
  let food = 0;
  let raw = 0;
  let filterCap = 0;
  let hydroCap = 0;
  t.cols.forEach((c, i) => {
    if (PAVED.includes(c.g)) paved[i] = 1;
    if (c.g === "bike") bikeLane[i] = 1;
    if (c.g === "rail") rails[i] = 1;
    if (c.g === "field") food += piece("field").food!;
    if (c.g === "reservoir") raw += piece("reservoir").water!;
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
  const noRail: number[] = [];
  let solarCap = 0;
  let windCap = 0;
  const homeCap = new Map<number, number>();
  let housing = 0;
  let insulSum = 0;
  let dirty = 0;
  let clean = 0;
  let co2 = 0;
  let upkeep = 0;
  let use = 0;
  const earners: { i: number; income: number }[] = [];
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
      if (p.energy && p.energy < 0) use -= p.energy;
      if (p.income) earners.push({ i, income: p.income });
      if (p.solar) solarCap += p.solar;
      if (p.wind) windCap += p.wind;
      if (p.food) food += p.food;
      if (p.water) raw += p.water;
      if (p.filter) filterCap += p.filter;
      if (p.hydro) hydroCap += p.hydro;
      if (p.co2) co2 += p.co2;
      if (p.upkeep) upkeep += p.upkeep;
      if (p.id === "station" && !near(i, 1, rails)) noRail.push(i);
      else if (p.cover) stops.push({ i, r: p.cover });
      if (p.nice) niceSpots.push({ i, r: p.nice });
    }
  });

  const residents = Math.min(t.residents, housing);
  const demand = (housing ? (residents * insulSum) / housing : 0) + use;
  const weather = weatherAt(t.clock);
  const w = WEATHER[weather];
  clean = solarCap + windCap + hydroCap;
  const average = dirty + clean;
  const wet = weather === "rain" || weather === "storm";
  const supply = dirty + solarCap * w.solar + windCap * w.wind + hydroCap * (wet ? 1.1 : 1);

  // Water: the Town Hall's old well, plus rain and river water collected and filtered.
  const collected = raw * (weather === "sunny" ? 0.85 : wet ? 1.25 : 1);
  const waterSupply = WELL + Math.min(collected, filterCap);
  const waterDemand = residents * 0.5;

  // Food: what the farms grow, and what has to be trucked in.
  const foodDemand = residents * 0.5;
  const imported = Math.max(0, foodDemand - food);
  co2 += imported * 0.4;
  upkeep += imported * 0.3;

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
  if (waterDemand > waterSupply + 0.01) happiness -= 20 * Math.min(1, (waterDemand - waterSupply) / waterDemand);
  happiness = Math.max(5, Math.min(100, happiness));

  // Shops and cafés earn from residents within 6 tiles (full takings at 12 or more).
  const occupancy = housing ? residents / housing : 0;
  let income = 0;
  for (const e of earners) {
    let customers = 0;
    for (const h of homes) if (within(e.i, h, 6)) customers += homeCap.get(h)! * occupancy;
    income += e.income * Math.min(1, customers / 12);
  }

  const enough = residents >= 4;
  const cleanShare = average > 0 ? clean / average : 0;
  const stars = [enough && cleanShare >= 0.7 && average >= demand, enough && homeAir < AIR_OK, enough && carShare < 0.5];

  return {
    housing,
    homes,
    noRoof,
    noAccess,
    noRail,
    energy: { supply, demand, clean, dirty, cleanShare, average },
    food: { supply: food, demand: foodDemand, imported },
    water: { supply: waterSupply, demand: waterDemand, raw: collected, filterCap },
    trucks: imported / 3,
    weather,
    travel: { covered, carShare, cars },
    co2,
    upkeep,
    homeAir,
    meanAir,
    happiness,
    taxRate: residents * 0.15 * (0.4 + happiness / 100),
    income,
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
  const perRoad = roads ? ((stats.travel.cars + stats.trucks * 2) * 0.85) / roads : 0;
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
      v -= v * (0.009 + clean[i] * 0.25 + WEATHER[e.weather].wash) * dt;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) v *= 1 - 0.3 * dt;
      out[i] = Math.max(0, Math.min(100, v));
    }
  }
  air.set(out);
}

export type SimEvent = { type: "goal"; id: string } | { type: "world" } | { type: "moveIn"; n: number };

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

  t.chest = Math.min(CHEST_CAP[t.th], t.chest + (s.taxRate + s.income / 60) * dt);
  t.coins = Math.max(0, t.coins - (s.upkeep / 60) * dt);
  t.carbon += (s.co2 / 60) * dt;

  // The air moves faster than the clock, so changes show within seconds.
  const e = env(t.clock);
  for (let k = 0; k < AIR_SPEED; k++) stepAir(t, sim.air, e, s, dt);

  // Achievements come one at a time; the last one completes the world.
  const list = WORLDS[t.world]?.achievements ?? [];
  const g = list[t.goal];
  if (g && g.done(t, s)) {
    t.goal++;
    t.coins += g.coins;
    events.push({ type: "goal", id: g.id });
    if (t.goal >= list.length && !t.complete) {
      t.complete = true;
      events.push({ type: "world" });
    }
  }
  return events;
}

/** Time away: taxes keep coming in (up to the chest size). */
export function catchUp(t: Town, sim: Sim, now: number) {
  const away = Math.min(8 * 3600, Math.max(0, (now - t.lastTs) / 1000));
  if (away < 5) return 0;
  const s = analyze(t, sim.air);
  t.chest = Math.min(CHEST_CAP[t.th], t.chest + (s.taxRate + s.income / 60) * away);
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
  if (s.noRail.length) return { tone: "warn", text: "That train station has no railway. Lay track next to it, then trains will run.", at: s.noRail[0] };
  if (s.water.demand > s.water.supply + 0.01) {
    if (s.water.raw > s.water.filterCap + 0.01)
      return { tone: "warn", text: "There's water in your reservoirs, but it isn't safe to drink yet. Build a water filtration plant." };
    return { tone: "warn", text: "Taps are running dry. Flood a reservoir or dam the river, then filter the water so it's safe to drink." };
  }
  if (s.energy.demand > s.energy.average + 0.01) return { tone: "warn", text: "Not enough energy. Add solar panels or a wind turbine." };
  if (s.energy.demand > s.energy.supply + 0.01)
    return { tone: "warn", text: `The ${WEATHER[s.weather].label.toLowerCase()} weather is cutting your clean power. A mix of solar and wind keeps the lights on in any weather.` };
  if (t.chest >= CHEST_CAP[t.th] * 0.95) return { tone: "warn", text: "The tax chest is full. Tap the Town Hall's coin bubble to collect.", at: idx(28, 28) };
  return null;
}

/** What the next Town Hall level needs, or null at the top. */
export const nextUpgrade = (t: Town) => (t.th < TH_UPGRADE.length - 1 ? TH_UPGRADE[t.th + 1] : null);

export const homeCapacity = (t: Town, i: number) => t.cols[i].s.reduce((n, id) => n + (piece(id).housing ?? 0), 0);


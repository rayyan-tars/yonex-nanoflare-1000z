/**
 * The worlds: each one is a different place with its own problem and its
 * own list of achievements. Finishing every achievement unlocks the next.
 */
import type { Stats } from "./sim";
import type { Town } from "./world";

export interface Achievement {
  id: string;
  name: string;
  /** How to do it, and why it helps. */
  why: string;
  coins: number;
  done: (t: Town, s: Stats) => boolean;
}

export interface WorldDef {
  name: string;
  /** One line on the problem to solve. */
  problem: string;
  /** What the player is asked to do. */
  mission: string;
  emoji: string;
  achievements: readonly Achievement[];
}

/** How many pieces of these kinds the town has. */
export const count = (t: Town, ...ids: string[]) => t.cols.reduce((n, c) => n + c.s.filter((id) => ids.includes(id)).length + (ids.includes(c.g) ? 1 : 0), 0);
const hasNo = (t: Town, id: string) => count(t, id) === 0;

export const WORLDS: readonly WorldDef[] = [
  {
    name: "Greenhold Valley",
    emoji: "🏭",
    problem: "A coal plant upwind of the village fills the streets with smoke.",
    mission: "Switch to clean power, close the coal plant and grow a happy village.",
    achievements: [
      { id: "collect", name: "Collect taxes at the Town Hall", why: "Tap the coin bubble above the Town Hall. Happy towns pay more.", coins: 50, done: (t) => t.counts.collected > 0 },
      { id: "clean-power", name: "Build solar panels or a wind turbine", why: "They make energy without smoke and cost nothing to run.", coins: 100, done: (t) => count(t, "solar", "wind", "solarroof") > 0 },
      { id: "no-coal", name: "Remove the coal plant", why: "Once clean power covers your homes, take the smoke away at its source. Watch the air clear.", coins: 200, done: (t) => hasNo(t, "coal") },
      { id: "trees", name: "Plant 6 trees", why: "Trees clean the air near homes and make people happier.", coins: 80, done: (t) => t.counts.trees >= 6 },
      { id: "home", name: "Build a new home", why: "Stack blocks, add a roof and keep a path within 2 tiles. Timber stores carbon; concrete releases it.", coins: 100, done: (t, s) => s.housing >= 28 },
      { id: "school", name: "Build a school near homes", why: "Children who live within 6 tiles walk to school instead of being driven.", coins: 120, done: (t) => count(t, "school") > 0 },
      { id: "cafe", name: "Open a café or a shop", why: "Places to go nearby make people happier, and they earn coins too.", coins: 100, done: (t) => count(t, "cafe", "shop", "shopfront", "market") > 0 },
      { id: "stars", name: "Earn all 3 eco stars", why: "Clean power, clean air and green travel, all at once. Tap the stars to see what's missing.", coins: 300, done: (t, s) => s.starCount === 3 },
    ],
  },
  {
    name: "Riverbend City",
    emoji: "🚗",
    problem: "Wind turbines power the city, but everyone drives everywhere. Exhaust fills the streets.",
    mission: "Make the city walkable: schools, shops, bike lanes and buses, until most people leave the car at home.",
    achievements: [
      { id: "city-school", name: "Build a school in the city", why: "The school run is a big share of morning traffic. Children within 6 tiles walk instead.", coins: 120, done: (t) => count(t, "school") > 0 },
      { id: "city-shop", name: "Open a corner shop or market", why: "Groceries a short walk away mean fewer car trips.", coins: 100, done: (t) => count(t, "shop", "market", "shopfront") > 0 },
      { id: "city-bikes", name: "Lay 12 tiles of bike lane", why: "Turn a road or path next to homes into a bike lane. People within 2 tiles cycle.", coins: 120, done: (t) => count(t, "bike") >= 12 },
      { id: "city-bus", name: "Add 2 bus stops", why: "One bus carries dozens of people who would otherwise drive.", coins: 120, done: (t) => count(t, "bus") >= 2 },
      { id: "city-park", name: "Build a park or playground", why: "Green space between the blocks makes the city a nicer place to walk.", coins: 80, done: (t) => count(t, "park", "playground") > 0 },
      { id: "city-plaza", name: "Pave 4 more plaza tiles", why: "Pave a square for people on foot, or swap a stretch of road for one. Car-free squares fill with people.", coins: 100, done: (t) => count(t, "plaza") >= 7 },
      { id: "city-travel", name: "Get car use below half", why: "Keep adding schools, shops, bike lanes and buses until fewer than half the residents drive.", coins: 200, done: (t, s) => t.residents >= 4 && s.travel.carShare < 0.5 },
      { id: "city-stars", name: "Earn all 3 eco stars", why: "Clean power, clean air and green travel, all at once.", coins: 300, done: (t, s) => s.starCount === 3 },
    ],
  },
  {
    name: "Sunny Isle",
    emoji: "🏝️",
    problem: "The island runs on a smoky generator, and the sea breeze carries the fumes over the beach town.",
    mission: "Run the whole island on sun and wind, green the rooftops and build a town people love to visit.",
    achievements: [
      { id: "isle-renew", name: "Build 2 wind turbines", why: "Islands are windy: turbines work day and night.", coins: 120, done: (t) => count(t, "wind") >= 2 },
      { id: "isle-coal", name: "Shut down the generator", why: "Remove the smoky plant once the wind covers your needs.", coins: 200, done: (t) => hasNo(t, "coal") },
      { id: "isle-full", name: "Run on 100% clean energy", why: "Every bit of energy from sun and wind, with enough for everyone.", coins: 150, done: (t, s) => s.energy.cleanShare >= 0.999 && s.energy.supply >= s.energy.demand },
      { id: "isle-trees", name: "Plant 10 trees", why: "Shade and clean air for a hot island.", coins: 100, done: (t) => t.counts.trees >= 10 },
      { id: "isle-roofs", name: "Put green roofs or terraces on 3 buildings", why: "Upgrade the Town Hall to unlock them. Plants on roofs keep homes cool.", coins: 150, done: (t) => count(t, "greenroof", "terrace") >= 3 },
      { id: "isle-cafe", name: "Open a café and a farmers' market", why: "Local food and places to meet keep visitors coming without long trips.", coins: 150, done: (t) => count(t, "cafe") > 0 && count(t, "market") > 0 },
      { id: "isle-grow", name: "Grow to 50 residents", why: "Build more homes. Painted plaster keeps them cool in the sun.", coins: 200, done: (t) => t.residents >= 50 },
      { id: "isle-stars", name: "Earn all 3 eco stars", why: "A clean, green, walkable island.", coins: 400, done: (t, s) => s.starCount === 3 },
    ],
  },
];

/**
 * Greenhold building pieces. Everything the player can place: ground
 * surfaces, stackable blocks (anything built from them that has a roof and a
 * path nearby becomes homes), roofs, machines and nature.
 *
 * Numbers are simplified game units chosen so the trade-offs point the same
 * way as the real world (timber stores carbon, concrete emits it; coal is
 * cheap to build but dirty to run). They are not real measurements.
 */

export type PieceKind = "ground" | "block" | "roof" | "machine" | "nature";
export type Category = "ground" | "homes" | "roofs" | "energy" | "water" | "waste" | "travel" | "nature";

export interface Cost {
  coins: number;
  mats: number;
}

export interface PieceDef {
  id: string;
  name: string;
  kind: PieceKind;
  cat: Category;
  cost: Cost;
  /** Build time in seconds (0 = placed at once). Timed builds need a free builder. */
  time: number;
  /** Town Hall level that unlocks it. */
  unlock: number;
  /** One-off carbon to make it (negative = stores carbon). */
  carbon: number;
  /** Ongoing carbon per minute while it runs. */
  co2?: number;
  /** Air pollution it puts out per second at its spot. */
  emit?: number;
  /** Air pollution it cleans per second at its spot. */
  absorb?: number;
  /** Carbon it takes in per minute. */
  sink?: number;
  /** Steady energy: + makes, − uses. */
  energy?: number;
  /** Energy at full sun / full wind. */
  solar?: number;
  wind?: number;
  /** Battery size (energy-seconds). */
  battery?: number;
  water?: number;
  /** Rain-fed water at full rain (and 40% of it in dry weather). */
  rain?: number;
  food?: number;
  /** Waste it can take, by route. */
  landfill?: number;
  recycle?: number;
  compost?: number;
  /** Coins per minute to run (fuel, staff). */
  upkeep?: number;
  /** Residents per block when the column has a roof and a path nearby. */
  housing?: number;
  /** Energy each resident in this block needs (insulation). */
  insul?: number;
  /** Public transport reach (tiles). */
  cover?: number;
  /** Makes nearby homes nicer to live in (radius in tiles). */
  nice?: number;
  /** Can sit on top of a block (rooftop machines); counts as a roof. */
  rooftop?: boolean;
  /** Placed by the game; can't be built or removed. */
  fixed?: boolean;
  desc: string;
  /** The sustainability lesson, shown before you build. */
  tip: string;
}

export const PIECES: readonly PieceDef[] = [
  // Ground
  { id: "road", name: "Road", kind: "ground", cat: "ground", cost: { coins: 6, mats: 0 }, time: 0, unlock: 1, carbon: 1, desc: "Cars and buses drive here. Homes need a road or path nearby.", tip: "Every road invites cars. Paths and bike lanes also connect homes." },
  { id: "path", name: "Footpath", kind: "ground", cat: "ground", cost: { coins: 2, mats: 0 }, time: 0, unlock: 1, carbon: 0.2, desc: "Connects homes for people on foot.", tip: "The cheapest, cleanest way to connect homes." },
  { id: "bike", name: "Bike lane", kind: "ground", cat: "travel", cost: { coins: 5, mats: 0 }, time: 0, unlock: 1, carbon: 0.4, cover: 2, desc: "Homes within 2 tiles ride instead of drive.", tip: "Residents near a bike lane leave the car at home." },
  { id: "grass", name: "Grass", kind: "ground", cat: "ground", cost: { coins: 1, mats: 0 }, time: 0, unlock: 1, carbon: 0, desc: "Turns paved ground back into grass.", tip: "Unpaved ground soaks up rain and stays cool." },
  { id: "garden", name: "Veg garden", kind: "ground", cat: "nature", cost: { coins: 12, mats: 0 }, time: 0, unlock: 1, carbon: 0, food: 3, water: -1, absorb: 0.15, sink: 0.1, nice: 2, desc: "Grows food for 6 residents. Needs a little water.", tip: "Local food means fewer delivery trucks. Compost makes gardens grow 50% more." },
  { id: "pond", name: "Pond", kind: "ground", cat: "nature", cost: { coins: 25, mats: 0 }, time: 0, unlock: 2, carbon: 0, absorb: 0.2, nice: 3, desc: "Cools the air and brings wildlife.", tip: "Water and plants make streets cooler on hot days." },

  // Blocks: build anything; roofed blocks near a path become homes.
  { id: "timber", name: "Timber block", kind: "block", cat: "homes", cost: { coins: 22, mats: 0 }, time: 0, unlock: 1, carbon: -1, housing: 2, insul: 0.85, desc: "Warm and light. Houses 2 when roofed.", tip: "Wood stores the carbon the tree took in, and insulates well." },
  { id: "concrete", name: "Concrete block", kind: "block", cat: "homes", cost: { coins: 16, mats: 0 }, time: 0, unlock: 1, carbon: 6, housing: 2, insul: 1.25, desc: "Cheap and strong. Houses 2 when roofed.", tip: "Making cement releases lots of carbon, and plain concrete loses heat." },
  { id: "glass", name: "Glass block", kind: "block", cat: "homes", cost: { coins: 26, mats: 0 }, time: 0, unlock: 1, carbon: 5, housing: 2, insul: 1.1, desc: "Bright rooms that glow at night. Houses 2 when roofed.", tip: "Daylight saves lamps, but big windows lose heat." },
  { id: "brick", name: "Recycled brick", kind: "block", cat: "homes", cost: { coins: 8, mats: 6 }, time: 0, unlock: 2, carbon: 1, housing: 2, insul: 0.95, desc: "Made from recycled materials. Houses 2 when roofed.", tip: "Reusing materials skips most of the carbon of making new ones." },
  { id: "farmblock", name: "Vertical farm", kind: "block", cat: "homes", cost: { coins: 60, mats: 10 }, time: 0, unlock: 4, carbon: 3, food: 5, energy: -3, insul: 1, desc: "A floor of indoor farming: food for 10, no housing.", tip: "Grows food all year with very little water, but needs power." },

  // Roofs
  { id: "roof", name: "Tile roof", kind: "roof", cat: "roofs", cost: { coins: 10, mats: 0 }, time: 0, unlock: 1, carbon: 1, desc: "Closes a building so people can move in.", tip: "Any roof turns the blocks below into homes." },
  { id: "greenroof", name: "Green roof", kind: "roof", cat: "roofs", cost: { coins: 24, mats: 0 }, time: 0, unlock: 2, carbon: 0.5, absorb: 0.25, sink: 0.12, insul: 0.85, nice: 1, desc: "Plants on top: cleaner air, 15% less energy below.", tip: "Plants insulate the building and clean the air." },
  { id: "solarroof", name: "Solar roof", kind: "roof", cat: "roofs", cost: { coins: 55, mats: 0 }, time: 0, unlock: 2, carbon: 3, solar: 5, desc: "A roof that makes 5 energy in full sun.", tip: "Making power where it's used wastes none on the way." },

  // Energy
  { id: "coal", name: "Coal plant", kind: "machine", cat: "energy", cost: { coins: 90, mats: 0 }, time: 15, unlock: 1, carbon: 20, energy: 40, co2: 24, emit: 45, upkeep: 6, desc: "40 energy, day and night. Smoky and costs fuel.", tip: "Cheap to build, but it burns coins and fills the air with smoke every minute." },
  { id: "solar", name: "Solar panels", kind: "machine", cat: "energy", cost: { coins: 75, mats: 0 }, time: 8, unlock: 1, carbon: 4, solar: 12, rooftop: true, desc: "12 energy in full sun, none at night. Fits on rooftops.", tip: "Clean and free to run. Pair it with batteries for the night." },
  { id: "wind", name: "Wind turbine", kind: "machine", cat: "energy", cost: { coins: 130, mats: 0 }, time: 20, unlock: 2, carbon: 10, wind: 22, desc: "Up to 22 energy, day and night, when it's windy.", tip: "Wind often blows at night, when solar sleeps." },
  { id: "battery", name: "Battery", kind: "machine", cat: "energy", cost: { coins: 110, mats: 8 }, time: 12, unlock: 3, carbon: 6, battery: 900, desc: "Stores spare sunshine for the night.", tip: "Storage lets clean power cover the whole day." },

  // Water
  { id: "well", name: "Water pump", kind: "machine", cat: "water", cost: { coins: 45, mats: 0 }, time: 8, unlock: 1, carbon: 3, water: 30, energy: -3, desc: "30 water. Uses 3 energy.", tip: "Pumping water takes energy. Rain tanks use none." },
  { id: "raintank", name: "Rain tank", kind: "machine", cat: "water", cost: { coins: 30, mats: 0 }, time: 0, unlock: 1, carbon: 1, rain: 8, rooftop: true, desc: "Up to 8 water from rain. Fits on rooftops.", tip: "Catching rain saves pumping and stops streets flooding." },

  // Waste
  { id: "landfill", name: "Landfill", kind: "machine", cat: "waste", cost: { coins: 25, mats: 0 }, time: 5, unlock: 1, carbon: 1, landfill: 25, co2: 3, emit: 8, desc: "Takes 25 waste. Smells and leaks methane.", tip: "Buried waste rots into methane, a strong greenhouse gas." },
  { id: "compost", name: "Compost bins", kind: "machine", cat: "waste", cost: { coins: 28, mats: 0 }, time: 0, unlock: 1, carbon: 0.5, compost: 8, desc: "Turns 8 food waste into soil. Gardens grow 50% more.", tip: "About a third of household waste is food. It can feed gardens instead." },
  { id: "recycling", name: "Recycling centre", kind: "machine", cat: "waste", cost: { coins: 160, mats: 0 }, time: 25, unlock: 2, carbon: 12, recycle: 30, energy: -4, desc: "Sorts 30 waste into materials for recycled bricks.", tip: "Recycling turns rubbish back into building materials." },

  // Travel
  { id: "bus", name: "Bus stop", kind: "machine", cat: "travel", cost: { coins: 50, mats: 0 }, time: 5, unlock: 2, carbon: 2, cover: 6, upkeep: 1, desc: "Homes within 6 tiles take the bus.", tip: "One bus can replace dozens of cars." },
  { id: "tram", name: "Tram stop", kind: "machine", cat: "travel", cost: { coins: 140, mats: 10 }, time: 20, unlock: 3, carbon: 8, cover: 10, energy: -4, desc: "Electric. Homes within 10 tiles ride the tram.", tip: "Electric transit runs clean when the power is clean." },

  // Nature
  { id: "oak", name: "Oak tree", kind: "nature", cat: "nature", cost: { coins: 8, mats: 0 }, time: 0, unlock: 1, carbon: 0, absorb: 0.6, sink: 0.36, nice: 2, desc: "Cleans the air and takes in carbon.", tip: "Trees are the cheapest air filter there is." },
  { id: "pine", name: "Pine tree", kind: "nature", cat: "nature", cost: { coins: 8, mats: 0 }, time: 0, unlock: 1, carbon: 0, absorb: 0.5, sink: 0.3, nice: 2, desc: "Evergreen: cleans the air all year.", tip: "Trees near homes make people happier, too." },
  { id: "flowers", name: "Wildflowers", kind: "nature", cat: "nature", cost: { coins: 3, mats: 0 }, time: 0, unlock: 1, carbon: 0, absorb: 0.08, nice: 1, desc: "Food for bees and butterflies.", tip: "Pollinators help gardens grow." },
  { id: "rock", name: "Boulder", kind: "nature", cat: "nature", cost: { coins: 0, mats: 0 }, time: 0, unlock: 99, carbon: 0, fixed: false, desc: "Clear it for building materials.", tip: "" },

  // Fixed
  { id: "townhall", name: "Town Hall", kind: "machine", cat: "energy", cost: { coins: 0, mats: 0 }, time: 0, unlock: 99, carbon: 0, energy: 8, water: 10, co2: 3, fixed: true, desc: "The heart of your town. Taxes collect here. Its old diesel generator and well give 8 energy and 10 water.", tip: "" },
  { id: "hut", name: "Builder's hut", kind: "machine", cat: "energy", cost: { coins: 0, mats: 0 }, time: 0, unlock: 99, carbon: 0, fixed: true, desc: "Home of your builders.", tip: "" },
];

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));
export const piece = (id: string): PieceDef => {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Unknown piece ${id}`);
  return p;
};
export const pieceOrNull = (id: string) => BY_ID.get(id) ?? null;

export const CATEGORIES: readonly { id: Category; name: string }[] = [
  { id: "homes", name: "Build" },
  { id: "roofs", name: "Roofs" },
  { id: "ground", name: "Ground" },
  { id: "energy", name: "Energy" },
  { id: "water", name: "Water" },
  { id: "waste", name: "Waste" },
  { id: "travel", name: "Travel" },
  { id: "nature", name: "Nature" },
];

/** Pieces the player can buy in a category (fixed and natural-only pieces excluded). */
export const shopPieces = (cat: Category) => PIECES.filter((p) => p.cat === cat && p.unlock < 99);

export const isRenewable = (p: PieceDef) => !!(p.solar || p.wind);

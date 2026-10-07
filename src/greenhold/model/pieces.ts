/**
 * Greenhold building pieces: ground, stackable blocks (any building with a
 * roof and a path nearby becomes homes), roofs, power and nature.
 *
 * Numbers are simplified game units chosen so the trade-offs point the same
 * way as the real world (timber stores carbon, concrete emits it; coal is
 * cheap to build but dirty to run). They are not real measurements.
 */

export type PieceKind = "ground" | "block" | "roof" | "machine" | "nature";
export type Category = "homes" | "roofs" | "power" | "streets" | "nature";

export interface PieceDef {
  id: string;
  name: string;
  kind: PieceKind;
  cat: Category;
  /** Price in coins. */
  cost: number;
  /** Town Hall level that unlocks it. */
  unlock: number;
  /** One-off carbon to make it (negative = stores carbon). */
  carbon: number;
  /** Carbon per minute while it runs. */
  co2?: number;
  /** Smoke it puts into the air per second. */
  emit?: number;
  /** How much it cleans the air around it. */
  absorb?: number;
  /** Carbon it takes in per minute. */
  sink?: number;
  /** Steady energy: + makes, − uses. */
  energy?: number;
  /** Energy on an average day from sun or wind. */
  solar?: number;
  wind?: number;
  /** Coins per minute to run (fuel). */
  upkeep?: number;
  /** Residents per block once the building has a roof and a path nearby. */
  housing?: number;
  /** Energy each resident needs in this block (insulation). */
  insul?: number;
  /** Homes this close leave the car at home (tiles). */
  cover?: number;
  /** Makes homes this close nicer to live in (tiles). */
  nice?: number;
  /** Can sit on top of a block, and counts as its roof. */
  rooftop?: boolean;
  /** Placed by the game: can't be bought or removed. */
  fixed?: boolean;
  desc: string;
  /** The sustainability lesson, shown before you build. */
  tip: string;
}

export const PIECES: readonly PieceDef[] = [
  // Homes: stack blocks into any shape.
  { id: "timber", name: "Timber block", kind: "block", cat: "homes", cost: 22, unlock: 1, carbon: -1, housing: 2, insul: 0.85, desc: "Warm and light. Houses 2 once roofed.", tip: "Wood stores the carbon the tree took in, and keeps heat in." },
  { id: "brick", name: "Recycled brick", kind: "block", cat: "homes", cost: 18, unlock: 1, carbon: 1, housing: 2, insul: 0.95, desc: "Made from old bricks. Houses 2 once roofed.", tip: "Reusing materials skips most of the carbon of making new ones." },
  { id: "concrete", name: "Concrete block", kind: "block", cat: "homes", cost: 14, unlock: 1, carbon: 6, housing: 2, insul: 1.25, desc: "Cheapest. Houses 2 once roofed.", tip: "Making cement releases lots of carbon, and plain concrete lets heat escape." },
  { id: "glass", name: "Glass block", kind: "block", cat: "homes", cost: 26, unlock: 2, carbon: 5, housing: 2, insul: 1.1, desc: "Bright rooms that glow at night. Houses 2 once roofed.", tip: "Daylight saves lamps, but big windows lose heat." },

  // Roofs
  { id: "roof", name: "Tile roof", kind: "roof", cat: "roofs", cost: 10, unlock: 1, carbon: 1, desc: "Closes a building so people can move in.", tip: "Any roof turns the blocks below into homes." },
  { id: "solarroof", name: "Solar roof", kind: "roof", cat: "roofs", cost: 45, unlock: 1, carbon: 3, solar: 3, desc: "A roof that makes 3 clean energy.", tip: "Making power where it's used wastes none on the way." },
  { id: "greenroof", name: "Green roof", kind: "roof", cat: "roofs", cost: 24, unlock: 2, carbon: 0.5, absorb: 0.25, sink: 0.12, insul: 0.85, nice: 1, desc: "Plants on top: cleaner air and 15% less energy below.", tip: "Plants keep the building cool in summer and warm in winter." },

  // Power
  { id: "coal", name: "Coal plant", kind: "machine", cat: "power", cost: 60, unlock: 1, carbon: 20, energy: 40, co2: 24, emit: 45, upkeep: 6, desc: "40 energy. Smoky, and burns 6 coins of coal a minute.", tip: "Cheap to build, but it pays for fuel forever and fills the air with smoke." },
  { id: "solar", name: "Solar panels", kind: "machine", cat: "power", cost: 70, unlock: 1, carbon: 4, solar: 8, rooftop: true, desc: "8 clean energy. Free to run. Fits on rooftops too.", tip: "Sunlight is free and makes no smoke." },
  { id: "wind", name: "Wind turbine", kind: "machine", cat: "power", cost: 110, unlock: 1, carbon: 10, wind: 14, desc: "14 clean energy. Free to run.", tip: "Wind keeps blowing at night, when solar rests." },

  // Streets
  { id: "road", name: "Road", kind: "ground", cat: "streets", cost: 5, unlock: 1, carbon: 1, desc: "Cars drive here. Homes need a road or path nearby.", tip: "Every road invites more cars." },
  { id: "path", name: "Footpath", kind: "ground", cat: "streets", cost: 2, unlock: 1, carbon: 0.2, desc: "Connects homes for people on foot.", tip: "The cheapest, cleanest way to connect homes." },
  { id: "bike", name: "Bike lane", kind: "ground", cat: "streets", cost: 5, unlock: 1, carbon: 0.4, cover: 2, desc: "Homes within 2 tiles cycle instead of driving.", tip: "A bike makes no fumes at all." },
  { id: "bus", name: "Bus stop", kind: "machine", cat: "streets", cost: 50, unlock: 2, carbon: 2, cover: 6, upkeep: 1, desc: "Homes within 6 tiles take the bus.", tip: "One bus can replace dozens of cars." },

  // Nature
  { id: "oak", name: "Oak tree", kind: "nature", cat: "nature", cost: 8, unlock: 1, carbon: 0, absorb: 0.6, sink: 0.36, nice: 2, desc: "Cleans the air and takes in carbon.", tip: "Trees are the cheapest air filter there is." },
  { id: "pine", name: "Pine tree", kind: "nature", cat: "nature", cost: 8, unlock: 1, carbon: 0, absorb: 0.5, sink: 0.3, nice: 2, desc: "Evergreen: cleans the air all year.", tip: "Trees near homes make people happier too." },
  { id: "flowers", name: "Wildflowers", kind: "nature", cat: "nature", cost: 3, unlock: 1, carbon: 0, absorb: 0.08, nice: 1, desc: "Food for bees and butterflies.", tip: "Butterflies only visit when the air is clean." },
  { id: "grass", name: "Grass", kind: "ground", cat: "nature", cost: 1, unlock: 1, carbon: 0, desc: "Turns paving back into grass.", tip: "Unpaved ground soaks up rain and stays cool." },

  // Placed by the game
  { id: "rock", name: "Boulder", kind: "nature", cat: "nature", cost: 0, unlock: 99, carbon: 0, desc: "Clearing it costs 20 coins.", tip: "" },
  { id: "townhall", name: "Town Hall", kind: "machine", cat: "power", cost: 0, unlock: 99, carbon: 0, fixed: true, desc: "The heart of your town. Taxes collect here.", tip: "" },
  { id: "hut", name: "Builder's hut", kind: "machine", cat: "power", cost: 0, unlock: 99, carbon: 0, fixed: true, desc: "Home of your builders.", tip: "" },
];

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));
export const piece = (id: string): PieceDef => {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Unknown piece ${id}`);
  return p;
};
export const pieceOrNull = (id: string) => BY_ID.get(id) ?? null;

export const CATEGORIES: readonly { id: Category; name: string }[] = [
  { id: "homes", name: "Homes" },
  { id: "roofs", name: "Roofs" },
  { id: "power", name: "Power" },
  { id: "streets", name: "Streets" },
  { id: "nature", name: "Nature" },
];

/** Pieces the player can buy in a category. */
export const shopPieces = (cat: Category) => PIECES.filter((p) => p.cat === cat && p.unlock < 99);

/**
 * Greenhold building pieces: ground, stackable blocks (any building with a
 * roof and a path nearby becomes homes), roofs, power and nature.
 *
 * Numbers are simplified game units chosen so the trade-offs point the same
 * way as the real world (timber stores carbon, concrete emits it; coal is
 * cheap to build but dirty to run). They are not real measurements.
 */

export type PieceKind = "ground" | "block" | "roof" | "machine" | "nature";
export type Category = "homes" | "roofs" | "town" | "power" | "streets" | "farms" | "nature";

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
  /** Coins per minute it earns when plenty of residents live within 6 tiles. */
  income?: number;
  /** Food it grows (feeds two residents per unit). */
  food?: number;
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
  { id: "sunny", name: "Yellow plaster", kind: "block", cat: "homes", cost: 20, unlock: 1, carbon: 3, housing: 2, insul: 1, desc: "Sunny walls, shutters and window boxes. Houses 2 once roofed.", tip: "Thick plaster walls keep homes cool in summer." },
  { id: "rose", name: "Pink plaster", kind: "block", cat: "homes", cost: 20, unlock: 1, carbon: 3, housing: 2, insul: 1, desc: "Pink walls with blue shutters. Houses 2 once roofed.", tip: "Thick plaster walls keep homes cool in summer." },
  { id: "sky", name: "Blue plaster", kind: "block", cat: "homes", cost: 20, unlock: 1, carbon: 3, housing: 2, insul: 1, desc: "Blue walls with red shutters. Houses 2 once roofed.", tip: "Thick plaster walls keep homes cool in summer." },
  { id: "shopfront", name: "Shop floor", kind: "block", cat: "homes", cost: 40, unlock: 1, carbon: 3, income: 4, cover: 3, nice: 2, insul: 1, desc: "A shop at street level with homes above. Earns coins from neighbours.", tip: "Shops near homes mean errands on foot instead of by car." },
  { id: "glass", name: "Glass block", kind: "block", cat: "homes", cost: 26, unlock: 2, carbon: 5, housing: 2, insul: 1.1, desc: "Bright rooms that glow at night. Houses 2 once roofed.", tip: "Daylight saves lamps, but big windows lose heat." },

  // Roofs
  { id: "roof", name: "Tile roof", kind: "roof", cat: "roofs", cost: 10, unlock: 1, carbon: 1, desc: "Closes a building so people can move in.", tip: "Any roof turns the blocks below into homes." },
  { id: "slate", name: "Slate roof", kind: "roof", cat: "roofs", cost: 12, unlock: 1, carbon: 1, insul: 0.95, desc: "Blue-grey slate. Closes a building so people can move in.", tip: "Slate lasts a century, so it rarely needs replacing." },
  { id: "solarroof", name: "Solar roof", kind: "roof", cat: "roofs", cost: 45, unlock: 1, carbon: 3, solar: 3, desc: "A roof that makes 3 clean energy.", tip: "Making power where it's used wastes none on the way." },
  { id: "greenroof", name: "Green roof", kind: "roof", cat: "roofs", cost: 24, unlock: 2, carbon: 0.5, absorb: 0.25, sink: 0.12, insul: 0.85, nice: 1, desc: "Plants on top: cleaner air and 15% less energy below.", tip: "Plants keep the building cool in summer and warm in winter." },

  { id: "terrace", name: "Roof terrace", kind: "roof", cat: "roofs", cost: 30, unlock: 2, carbon: 1, nice: 2, desc: "A sunny deck with a parasol and plants.", tip: "Outdoor space at home makes people happier." },

  // Town: places people walk to.
  { id: "school", name: "School", kind: "machine", cat: "town", cost: 180, unlock: 1, carbon: 8, cover: 6, nice: 3, desc: "Children within 6 tiles walk to school.", tip: "The school run is a big share of morning traffic. A school within walking distance takes those cars off the road." },
  { id: "cafe", name: "Café", kind: "machine", cat: "town", cost: 60, unlock: 1, carbon: 2, income: 6, nice: 3, desc: "Coffee and a sunny terrace. Earns coins from neighbours.", tip: "Places to meet nearby make a town worth walking around." },
  { id: "shop", name: "Corner shop", kind: "machine", cat: "town", cost: 70, unlock: 1, carbon: 3, income: 5, cover: 4, nice: 1, desc: "Groceries within 4 tiles: fewer car trips. Earns coins.", tip: "When the shop is a short walk away, nobody needs the car for a pint of milk." },
  { id: "market", name: "Farmers' market", kind: "machine", cat: "town", cost: 90, unlock: 1, carbon: 1, income: 4, cover: 3, nice: 3, desc: "Local food on market day. Earns coins.", tip: "Food grown nearby travels a short way to your plate." },
  { id: "park", name: "Park", kind: "machine", cat: "town", cost: 40, unlock: 1, carbon: 0, absorb: 0.4, sink: 0.2, nice: 4, desc: "Trees, flowers and a bench. Cleans the air.", tip: "Green space near homes is good for body and mind." },
  { id: "playground", name: "Playground", kind: "machine", cat: "town", cost: 50, unlock: 1, carbon: 2, nice: 4, desc: "Slide, swings and a sandpit.", tip: "Families stay in towns where children can play outside." },
  { id: "fountain", name: "Fountain", kind: "machine", cat: "town", cost: 60, unlock: 1, carbon: 2, nice: 3, desc: "A cool place to sit on hot days.", tip: "Water and shade make squares pleasant in summer." },
  { id: "library", name: "Library", kind: "machine", cat: "town", cost: 150, unlock: 2, carbon: 6, nice: 5, desc: "Books, homework help and a quiet room.", tip: "Shared spaces mean fewer things everyone has to buy." },
  { id: "clinic", name: "Health clinic", kind: "machine", cat: "town", cost: 180, unlock: 2, carbon: 6, nice: 6, cover: 3, desc: "Doctors within walking distance.", tip: "Healthcare close to home is easier to reach without a car." },

  // Power
  { id: "coal", name: "Coal plant", kind: "machine", cat: "power", cost: 60, unlock: 1, carbon: 20, energy: 40, co2: 24, emit: 45, upkeep: 6, desc: "40 energy. Smoky, and burns 6 coins of coal a minute.", tip: "Cheap to build, but it pays for fuel forever and fills the air with smoke." },
  { id: "solar", name: "Solar panels", kind: "machine", cat: "power", cost: 70, unlock: 1, carbon: 4, solar: 8, rooftop: true, desc: "8 clean energy. Free to run. Fits on rooftops too.", tip: "Sunlight is free and makes no smoke." },
  { id: "wind", name: "Wind turbine", kind: "machine", cat: "power", cost: 110, unlock: 1, carbon: 10, wind: 14, desc: "14 clean energy. Free to run.", tip: "Wind keeps blowing at night, when solar rests." },

  // Streets
  { id: "road", name: "Road", kind: "ground", cat: "streets", cost: 5, unlock: 1, carbon: 1, desc: "Cars drive here. Homes need a road or path nearby.", tip: "Every road invites more cars." },
  { id: "path", name: "Footpath", kind: "ground", cat: "streets", cost: 2, unlock: 1, carbon: 0.2, desc: "Connects homes for people on foot.", tip: "The cheapest, cleanest way to connect homes." },
  { id: "plaza", name: "Plaza", kind: "ground", cat: "streets", cost: 4, unlock: 1, carbon: 0.5, desc: "Paved square for people on foot. Connects homes.", tip: "Car-free squares fill up with people." },
  { id: "rail", name: "Railway", kind: "ground", cat: "streets", cost: 8, unlock: 1, carbon: 1, desc: "Track for electric trains. Join it up past a station.", tip: "Trains carry hundreds of people on a strip of land narrower than a road." },
  { id: "station", name: "Train station", kind: "machine", cat: "streets", cost: 150, unlock: 1, carbon: 6, cover: 8, energy: -2, nice: 1, desc: "Homes within 8 tiles take the train. Needs railway next to it.", tip: "Electric trains run on clean power and take cars off the road." },
  { id: "bike", name: "Bike lane", kind: "ground", cat: "streets", cost: 5, unlock: 1, carbon: 0.4, cover: 2, desc: "Homes within 2 tiles cycle instead of driving.", tip: "A bike makes no fumes at all." },
  { id: "bus", name: "Bus stop", kind: "machine", cat: "streets", cost: 50, unlock: 2, carbon: 2, cover: 6, upkeep: 1, desc: "Homes within 6 tiles take the bus.", tip: "One bus can replace dozens of cars." },

  { id: "bikedock", name: "Bike share", kind: "machine", cat: "streets", cost: 40, unlock: 1, carbon: 1, cover: 3, desc: "Shared bikes for homes within 3 tiles.", tip: "Shared bikes mean you don't need to own one." },
  { id: "lamp", name: "Street lamp", kind: "machine", cat: "streets", cost: 6, unlock: 1, carbon: 0.5, energy: -0.2, nice: 1, desc: "Lights the street at night.", tip: "LED street lamps use a fraction of the energy of old bulbs." },
  { id: "bench", name: "Bench", kind: "machine", cat: "streets", cost: 4, unlock: 1, carbon: 0.2, nice: 1, desc: "A place to sit.", tip: "Benches make walking easier for older people." },

  // Farms: food grown here doesn't need trucking in.
  { id: "field", name: "Crop field", kind: "ground", cat: "farms", cost: 15, unlock: 1, carbon: 0, food: 3, sink: 0.05, desc: "Wheat and vegetables that grow through the seasons. Feeds 6.", tip: "Food grown nearby doesn't need trucks driving it in." },
  { id: "orchard", name: "Orchard", kind: "nature", cat: "farms", cost: 20, unlock: 1, carbon: 0, food: 1.5, absorb: 0.5, sink: 0.3, nice: 2, desc: "Fruit trees: food, shade and cleaner air.", tip: "Fruit trees feed people and take in carbon at the same time." },
  { id: "beehives", name: "Beehives", kind: "machine", cat: "farms", cost: 25, unlock: 1, carbon: 0.5, food: 1, nice: 1, desc: "Honey, and bees to pollinate the crops.", tip: "About a third of the food we eat depends on pollinators like bees." },
  { id: "greenhouse", name: "Greenhouse", kind: "machine", cat: "farms", cost: 90, unlock: 2, carbon: 4, food: 6, energy: -2, desc: "Grows food all year. Feeds 12. Uses a little energy.", tip: "Greenhouses grow a lot of food on a little land." },

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
  { id: "town", name: "Town" },
  { id: "power", name: "Power" },
  { id: "streets", name: "Streets" },
  { id: "farms", name: "Farms" },
  { id: "nature", name: "Nature" },
];

/** Pieces the player can buy in a category. */
export const shopPieces = (cat: Category) => PIECES.filter((p) => p.cat === cat && p.unlock < 99);

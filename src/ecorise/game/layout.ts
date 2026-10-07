/**
 * Static city layout on a 16 × 16 isometric grid.
 * Grid x increases toward the screen's lower right, grid y toward the lower left.
 * "East" (screen right) is high x, low y.
 */

export const GRID = 16;

export type TileKind = "water" | "grass" | "path" | "plaza" | "terrace" | "meadow" | "yard";

export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
}

export type HomeStyle = "cottage" | "townhouse" | "bungalow";

export interface HomeSpec {
  id: string;
  x: number;
  y: number;
  style: HomeStyle;
  door: "left" | "right";
  wall: number;
  roof: number;
}

/** The school cafeteria (the hero building). */
export const KITCHEN: Footprint = { x: 7, y: 4, w: 4, d: 3 };
/** Service yard beside the kitchen: bins, crates and leftover containers. */
export const YARD: Footprint = { x: 11, y: 4, w: 1, d: 3 };
export const MEADOW: Footprint = { x: 12, y: 2, w: 3, d: 3 };
export const PLAZA: Footprint = { x: 3, y: 8, w: 3, d: 2 };
export const TERRACE: Footprint = { x: 8, y: 8, w: 4, d: 2 };

export const HOMES: readonly HomeSpec[] = [
  { id: "h1", x: 2, y: 6, style: "cottage", door: "left", wall: 0xeee3cd, roof: 0xa9523a },
  { id: "h2", x: 4, y: 6, style: "townhouse", door: "left", wall: 0xc9cfb0, roof: 0x4c5a63 },
  { id: "h3", x: 5, y: 4, style: "bungalow", door: "right", wall: 0xe3cfa2, roof: 0x55703f },
  { id: "h4", x: 5, y: 2, style: "cottage", door: "right", wall: 0xd8b6a0, roof: 0x5e4b5c },
  { id: "h5", x: 8, y: 10, style: "townhouse", door: "left", wall: 0xbfc8cc, roof: 0xa9523a },
  { id: "h6", x: 10, y: 10, style: "bungalow", door: "left", wall: 0xeee3cd, roof: 0x4c5a63 },
];

/** The classroom block takes the place of two homes beside the main street. */
export const CLASSROOM: Footprint = { x: 2, y: 5, w: 3, d: 2 };
/** Homes not drawn: the classroom block and the open ground in front of the terrace replace them. */
export const REPLACED_HOMES: ReadonlySet<string> = new Set(["h1", "h2", "h5", "h6"]);
/** The school gate where Street B meets the campus edge; students arrive here. */
export const SCHOOL_GATE = { x: 6.5, y: 12.95 };
export const GATE_TILE = { x: 6, y: 12 };

/**
 * Today's food-waste problem, gathered by the kitchen so the eye finds it:
 * an overflowing food-waste bin, bags of waste, yesterday's surplus pots and
 * two bare beds where a garden could be.
 */
export const START_PROPS = {
  wasteBin: { x: 11.62, y: 6.55 },
  bags: [
    { x: 11.28, y: 6.05 },
    { x: 11.82, y: 5.9 },
    { x: 12.42, y: 7.62 },
  ],
  pots: [
    { x: 11.3, y: 4.95 },
    { x: 11.72, y: 5.2 },
  ],
  /** Where the bag from a wasteful lunch lands, beside the bin. */
  extraBag: { x: 12.05, y: 6.95 },
  bareBeds: [
    { x: 8.5, y: 10.45 },
    { x: 9.65, y: 10.45 },
  ],
} as const;

/** Tile a citizen stands on when "at the door" of each home. */
export function doorTile(h: HomeSpec): { x: number; y: number } {
  return h.door === "left" ? { x: h.x, y: h.y + 1 } : { x: h.x + 1, y: h.y };
}

export const NOTICEBOARD = { x: 3, y: 8 };
export const FEEDBACK_BOX = { x: 4, y: 8 };
export const TABLES = [
  { x: 9, y: 8 },
  { x: 10, y: 9 },
];
/** Tray return with a food-scraps bin, where plate waste becomes visible. */
export const TRAY_RETURN = { x: 11, y: 8 };
/** Tile students stand on to hand back trays. */
export const TRAY_RETURN_APPROACH = { x: 11, y: 7 };
/** Sustainability board for the real-world Cafeteria Waste Audit, by the tray return. */
export const MISSION_BOARD = { x: 12, y: 8 };
/** Campus Sustainability Flag: raised once a real audit is verified. */
export const SUSTAIN_FLAG = { x: 13, y: 7 };
export const BENCH = { x: 3, y: 9 };
export const FLAGPOLE = { x: 2, y: 9 };
export const CRATES = { x: 11, y: 4 };
export const LAMPS = [
  { x: 5, y: 6 },
  { x: 7, y: 12 },
  { x: 13, y: 6 },
];

/** Where the head of the lunch queue stands, in front of the serving hatch. */
export const SERVE_POINT = { x: 8.1, y: 7.38 };

/**
 * Queue slots along Street A, snaking back on a second lane. Grid
 * coordinates (fractional). Slot 0 is at the hatch.
 */
export const QUEUE_SLOTS: readonly { x: number; y: number }[] = (() => {
  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < 14; i++) slots.push({ x: SERVE_POINT.x - 0.42 * i, y: 7.38 });
  for (let i = 0; i < 13; i++) slots.push({ x: 2.64 + 0.42 * i, y: 7.84 });
  return slots;
})();

/** Rope barrier posts between the two queue lanes. */
export const BARRIER_POSTS: readonly { x: number; y: number }[] = [3.0, 4.0, 5.0, 6.0, 7.0].map((x) => ({
  x,
  y: 7.62,
}));

export const TREES: readonly { x: number; y: number; kind: "round" | "pine" | "bush" }[] = [
  { x: 3, y: 3, kind: "round" },
  { x: 2, y: 4, kind: "pine" },
  { x: 4, y: 2, kind: "bush" },
  { x: 8, y: 2, kind: "pine" },
  { x: 7, y: 3, kind: "round" },
  { x: 9, y: 3, kind: "bush" },
  { x: 1, y: 8, kind: "round" },
  { x: 2, y: 10, kind: "pine" },
  { x: 4, y: 13, kind: "round" },
  { x: 2, y: 12, kind: "bush" },
  { x: 9, y: 13, kind: "pine" },
  { x: 12, y: 12, kind: "round" },
  { x: 13, y: 10, kind: "bush" },
  { x: 14, y: 9, kind: "pine" },
  { x: 14, y: 6, kind: "round" },
  { x: 7, y: 9, kind: "bush" },
  { x: 11, y: 12, kind: "bush" },
];

/**
 * Lived-in details, at fractional grid positions (prop centres). None of
 * them block walking: they sit on grass, at path edges or beside furniture.
 */
export const DETAILS = {
  menuBoard: { x: 9.62, y: 7.56 },
  ecoStation: { x: 12.5, y: 9.45 },
  mopBucket: { x: 10.78, y: 8.2 },
  backpacks: [
    { x: 3.28, y: 9.8, look: 0 },
    { x: 3.72, y: 9.86, look: 1 },
    { x: 8.72, y: 9.9, look: 2 },
  ],
  tableTrays: [
    { x: 9.38, y: 8.44, full: true },
    { x: 9.64, y: 8.56, full: false },
    { x: 10.58, y: 9.48, full: false },
  ],
  /** Appear once the Planning Hub is built. */
  hubPlanters: [
    { x: 12.35, y: 4.78, v: 0 },
    { x: 14.55, y: 4.62, v: 1 },
  ],
} as const;

/**
 * Props that exist only in the illustrative 2050 views. Same map, same
 * coordinates: the futures differ only in what the school chose to build.
 */
export const FUTURE = {
  gardenBeds: [
    /** The first two grow where today's bare beds stand. */
    { x: 8.5, y: 10.45, v: 0 },
    { x: 9.65, y: 10.45, v: 1 },
    /** Third bed only when the real Waste Audit was completed. */
    { x: 5.5, y: 13.45, v: 0 },
    /** Beds beside the plaza and by the cafeteria, in view of the opening. */
    { x: 1.55, y: 9.45, v: 1 },
    { x: 1.6, y: 10.45, v: 0 },
    { x: 6.45, y: 2.6, v: 1 },
  ],
  gardeners: [
    { x: 9.1, y: 10.95, look: 3, flip: false },
    { x: 8.0, y: 10.9, look: 8, flip: true },
    { x: 2.15, y: 9.95, look: 5, flip: true },
    { x: 6.95, y: 2.95, look: 6, flip: false },
  ],
  compost: { x: 11.5, y: 5.7 },
  canopy: { x: 13.6, y: 4.75 },
  matureTrees: [
    { x: 3.5, y: 10.4, kind: "round" as const },
    { x: 12.55, y: 11.35, kind: "round" as const },
    { x: 7.45, y: 10.4, kind: "round" as const },
    { x: 1.4, y: 6.3, kind: "round" as const },
    { x: 6.35, y: 9.55, kind: "round" as const },
    { x: 13.45, y: 8.95, kind: "pine" as const },
  ],
  /** Business as usual: food left in the yard and bags by the tray return. */
  leftoverPots: [
    { x: 11.3, y: 4.95 }, { x: 11.72, y: 4.95 }, { x: 11.3, y: 5.4 }, { x: 11.72, y: 5.4 },
    { x: 11.3, y: 5.85 }, { x: 11.72, y: 5.85 }, { x: 11.3, y: 6.3 }, { x: 11.72, y: 6.3 },
  ],
  bags: [
    { x: 12.3, y: 9.35 },
    { x: 11.85, y: 9.0 },
    { x: 8.55, y: 10.05 },
    { x: 3.6, y: 10.2 },
    { x: 6.55, y: 7.55 },
  ],
  /** Business as usual: an overflowing skip beside the kitchen yard. */
  dumpsters: [
    { x: 12.45, y: 6.4 },
    { x: 6.7, y: 3.7 },
  ],
} as const;

/** Seats on the benches of each terrace table (far bench faces the viewer). */
export const SEATS: readonly { x: number; y: number; facing: "front" | "back" }[] = tableSeats();

function tableSeats() {
  const out: { x: number; y: number; facing: "front" | "back" }[] = [];
  for (const t of [
    { x: 9, y: 8 },
    { x: 10, y: 9 },
  ]) {
    for (const sx of [0.36, 0.64]) {
      out.push({ x: t.x + sx, y: t.y + 0.24, facing: "front" });
      out.push({ x: t.x + sx, y: t.y + 0.78, facing: "back" });
    }
  }
  return out;
}

/** A small, stable offset so scenery isn't stamped exactly on the grid. */
export function jitter(i: number, amount = 0.16): { x: number; y: number } {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { x: ((a - Math.floor(a)) - 0.5) * 2 * amount, y: ((b - Math.floor(b)) - 0.5) * 2 * amount };
}

export const FLOWERBEDS = [
  { x: 4, y: 10 },
  { x: 5, y: 10 },
  { x: 12, y: 10 },
];

const PATH_TILES: [number, number][] = [];
// Street A (screen diagonal through the kitchen front).
for (let x = 2; x <= 12; x++) PATH_TILES.push([x, 7]);
// Street B.
for (let y = 2; y <= 12; y++) PATH_TILES.push([6, y]);
// Street C.
for (let x = 3; x <= 11; x++) PATH_TILES.push([x, 11]);
// Lane from Street A up to the East Meadow gate.
PATH_TILES.push([12, 5], [12, 6]);

function inIsland(x: number, y: number): boolean {
  if (x < 1 || y < 1 || x > 14 || y > 14) return false;
  const cx = Math.abs(x + 0.5 - 8);
  const cy = Math.abs(y + 0.5 - 8);
  if (cx > 4.5 && cy > 4.5) {
    const dx = cx - 4.5;
    const dy = cy - 4.5;
    return dx * dx + dy * dy <= 2.6 * 2.6;
  }
  return true;
}

function inFootprint(f: Footprint, x: number, y: number) {
  return x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.d;
}

export const TILES: TileKind[][] = (() => {
  const t: TileKind[][] = [];
  for (let y = 0; y < GRID; y++) {
    const row: TileKind[] = [];
    for (let x = 0; x < GRID; x++) {
      if (!inIsland(x, y)) row.push("water");
      else if (inFootprint(MEADOW, x, y)) row.push("meadow");
      else if (inFootprint(PLAZA, x, y)) row.push("plaza");
      else if (inFootprint(TERRACE, x, y)) row.push("terrace");
      else if (inFootprint(YARD, x, y)) row.push("yard");
      else row.push("grass");
    }
    t.push(row);
  }
  for (const [x, y] of PATH_TILES) t[y][x] = "path";
  return t;
})();

export function tileAt(x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return "water";
  return TILES[y][x];
}

const BLOCKED = new Set<string>([
  `${NOTICEBOARD.x},${NOTICEBOARD.y}`,
  `${FEEDBACK_BOX.x},${FEEDBACK_BOX.y}`,
  `${FLAGPOLE.x},${FLAGPOLE.y}`,
  `${BENCH.x},${BENCH.y}`,
  // Tables are not blocked: a student standing on a table tile is eating there.
  `${TRAY_RETURN.x},${TRAY_RETURN.y}`,
]);

/** Tiles citizens may walk on. */
export function isWalkable(x: number, y: number): boolean {
  const k = tileAt(x, y);
  if (k !== "path" && k !== "plaza" && k !== "terrace") return false;
  return !BLOCKED.has(`${x},${y}`);
}

/** Named destinations for ambient citizen life. */
export const DESTINATIONS = {
  queue: [
    { x: 7, y: 7 },
    { x: 8, y: 7 },
    { x: 9, y: 7 },
  ],
  council: [
    { x: 4, y: 9 },
    { x: 5, y: 8 },
    { x: 5, y: 9 },
  ],
  terrace: [
    { x: 9, y: 8 },
    { x: 10, y: 9 },
    { x: 8, y: 9 },
    { x: 11, y: 9 },
    { x: 8, y: 8 },
  ],
  lookout: [{ x: 12, y: 5 }],
  /** In front of the Sustainability Board. */
  board: [{ x: 12, y: 7 }],
};

/** Breadth-first path between two walkable tiles (4-neighbour). */
export function findPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] | null {
  const key = (x: number, y: number) => y * GRID + x;
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goal) break;
    const cx = cur % GRID;
    const cy = Math.floor(cur / GRID);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(nx, ny)) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      queue.push(k);
    }
  }
  if (!prev.has(goal)) return null;
  const out: { x: number; y: number }[] = [];
  for (let k = goal; k !== -1; k = prev.get(k)!) out.push({ x: k % GRID, y: Math.floor(k / GRID) });
  return out.reverse();
}

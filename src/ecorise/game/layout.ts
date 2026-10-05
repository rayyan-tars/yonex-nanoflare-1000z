/**
 * Static city layout on a 16 × 16 isometric grid.
 * Grid x increases toward the screen's lower right, grid y toward the lower left.
 * "East" (screen right) is high x, low y.
 */

export const GRID = 16;

export type TileKind = "water" | "grass" | "path" | "plaza" | "terrace" | "meadow";

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

export const KITCHEN: Footprint = { x: 7, y: 5, w: 3, d: 2 };
export const MEADOW: Footprint = { x: 10, y: 1, w: 4, d: 4 };
export const PLAZA: Footprint = { x: 3, y: 8, w: 3, d: 2 };
export const TERRACE: Footprint = { x: 8, y: 8, w: 4, d: 2 };

export const HOMES: readonly HomeSpec[] = [
  { id: "h1", x: 2, y: 6, style: "cottage", door: "left", wall: 0xfff1dc, roof: 0xd9623b },
  { id: "h2", x: 4, y: 6, style: "townhouse", door: "left", wall: 0xcfe3c2, roof: 0x4d7fa3 },
  { id: "h3", x: 5, y: 4, style: "bungalow", door: "right", wall: 0xf7dc9a, roof: 0x4f8a5b },
  { id: "h4", x: 5, y: 2, style: "cottage", door: "right", wall: 0xf4c9b8, roof: 0x8a5a9e },
  { id: "h5", x: 8, y: 10, style: "townhouse", door: "left", wall: 0xc9dceb, roof: 0xd9623b },
  { id: "h6", x: 10, y: 10, style: "bungalow", door: "left", wall: 0xfff1dc, roof: 0x4d7fa3 },
];

/** Tile a citizen stands on when "at the door" of each home. */
export function doorTile(h: HomeSpec): { x: number; y: number } {
  return h.door === "left" ? { x: h.x, y: h.y + 1 } : { x: h.x + 1, y: h.y };
}

export const NOTICEBOARD = { x: 3, y: 8 };
export const FEEDBACK_BOX = { x: 4, y: 8 };
export const TABLES = [
  { x: 9, y: 8 },
  { x: 11, y: 9 },
];
export const BENCH = { x: 3, y: 9 };
export const FLAGPOLE = { x: 2, y: 9 };
export const BIN = { x: 12, y: 8 };
export const CRATES = { x: 10, y: 6 };
export const LAMPS = [
  { x: 5, y: 6 },
  { x: 7, y: 12 },
  { x: 12, y: 6 },
];

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
  { x: 13, y: 8, kind: "pine" },
  { x: 14, y: 6, kind: "round" },
  { x: 7, y: 9, kind: "bush" },
  { x: 11, y: 12, kind: "bush" },
];

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
PATH_TILES.push([11, 5], [11, 6]);

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
  ...TABLES.map((t) => `${t.x},${t.y}`),
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
    { x: 8, y: 8 },
    { x: 10, y: 8 },
    { x: 9, y: 9 },
    { x: 10, y: 9 },
    { x: 8, y: 9 },
  ],
  lookout: [{ x: 11, y: 5 }],
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

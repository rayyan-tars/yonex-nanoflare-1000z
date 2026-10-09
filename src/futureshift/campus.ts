// One deliberately composed school campus. All positions are tile coordinates
// (x runs down-right on screen, y runs down-left), heights are world pixels.

import type { HotspotId } from "./model";

export const GX = 16;
export const GY = 14.2;
export const SLAB_DEPTH = 34;

export type Rect = { x0: number; x1: number; y0: number; y1: number };

export const ACADEMIC = { x0: 1.0, x1: 10.8, y0: 0.6, y1: 3.4, h: 46 };
export const CAFETERIA = { x0: 0.6, x1: 3.4, y0: 4.2, y1: 9.8, h: 28 };

export const COURTYARD: Rect = { x0: 3.8, x1: 10.9, y0: 3.8, y1: 10.25 };
export const TERRACE: Rect = { x0: 3.6, x1: 5.3, y0: 4.3, y1: 6.7 };
export const GATE_PATH: Rect = { x0: 6.2, x1: 8.6, y0: 10.25, y1: 11.75 };
export const APRON: Rect = { x0: 1.1, x1: 5.5, y0: 10.35, y1: 11.55 };
export const FOOTPATH: Rect = { x0: 0, x1: GX, y0: 11.75, y1: 12.3 };
export const ROAD: Rect = { x0: 0, x1: GX, y0: 12.3, y1: GY };
export const BIKE_LANE: Rect = { x0: 0, x1: GX, y0: 12.3, y1: 12.78 };
export const CARPARK: Rect = { x0: 11.6, x1: 15.75, y0: 6.1, y1: 11.7 };
export const CANOPY: Rect = { x0: 14.05, x1: 15.7, y0: 6.35, y1: 11.3 };
export const COURT: Rect = { x0: 11.6, x1: 15.75, y0: 0.5, y1: 5.7 };
export const RACKS: Rect = { x0: 8.85, x1: 10.45, y0: 10.45, y1: 11.4 };

export const FENCE_Y = 11.72;
/** Front boundary runs, leaving the pedestrian gate and car park entrance open. */
export const FENCE_RUNS: [number, number][] = [
  [0.2, 6.2],
  [8.6, 12.2],
  [13.5, 15.8],
];

export const DOORS = {
  academic: { x: 6.55, y: 3.45 },
  cafeteria: { x: 3.45, y: 7.1 },
};

export const EXISTING_TREE = { x: 4.35, y: 5.35 };
export const COURT_TREES = [
  { x: 5.75, y: 6.05 },
  { x: 9.2, y: 5.85 },
  { x: 5.95, y: 8.85 },
  { x: 9.35, y: 8.95 },
];
export const STREET_TREES = [
  { x: 1.3, y: 12.0 },
  { x: 3.4, y: 12.0 },
  { x: 5.45, y: 12.0 },
  { x: 9.3, y: 12.0 },
  { x: 11.35, y: 12.0 },
  { x: 14.6, y: 12.0 },
];
export const BENCHES = [
  { x: 6.45, y: 6.3, dir: "x" as const },
  { x: 8.45, y: 6.15, dir: "x" as const },
  { x: 6.6, y: 8.55, dir: "x" as const },
  { x: 8.6, y: 8.65, dir: "x" as const },
];
export const PLANTER = { x: 7.45, y: 7.45, r: 0.62 };

/** Car park bays: two rows facing the aisle. dir = car facing. */
export const BAYS: { x: number; y: number; dir: "xp" | "xn" }[] = [
  ...[6.75, 7.65, 8.55, 9.45, 10.35].map((y) => ({ x: 12.25, y, dir: "xn" as const })),
  ...[6.75, 7.65, 8.55, 9.45, 10.35].map((y) => ({ x: 15.1, y, dir: "xp" as const })),
];

export const LANES = {
  east: 13.0,
  eastBike: 13.15,
  west: 13.72,
  bike: 12.54,
};
export const DROP_X = 7.25;

// --------------------------------------------------------------- activity areas

export type AreaId =
  | "terrace"
  | "court-shade"
  | "court-open"
  | "court-seats"
  | "gate"
  | "gate-shade"
  | "sports"
  | "garden"
  | "racks"
  | "indoor-academic"
  | "indoor-cafeteria";

export const AREAS: Record<AreaId, Rect[]> = {
  terrace: [{ x0: 3.75, x1: 5.0, y0: 4.6, y1: 6.3 }],
  "court-shade": COURT_TREES.map((t) => ({ x0: t.x - 0.55, x1: t.x + 0.55, y0: t.y - 0.25, y1: t.y + 0.75 })),
  "court-open": [{ x0: 5.2, x1: 10.4, y0: 4.6, y1: 9.9 }],
  "court-seats": [
    { x0: 6.6, x1: 8.3, y0: 6.6, y1: 6.75 },
    { x0: 6.6, x1: 8.3, y0: 8.15, y1: 8.3 },
    { x0: 6.55, x1: 6.7, y0: 6.7, y1: 8.2 },
    { x0: 8.2, x1: 8.35, y0: 6.7, y1: 8.2 },
  ],
  gate: [{ x0: 6.4, x1: 8.4, y0: 10.3, y1: 11.4 }],
  "gate-shade": [{ x0: 6.4, x1: 8.4, y0: 10.9, y1: 11.45 }],
  sports: [{ x0: 12.1, x1: 15.2, y0: 1.0, y1: 5.1 }],
  garden: [{ x0: 2.2, x1: 4.6, y0: 9.85, y1: 10.25 }],
  racks: [{ x0: 8.9, x1: 10.3, y0: 10.3, y1: 10.5 }],
  "indoor-academic": [],
  "indoor-cafeteria": [],
};

// --------------------------------------------------------------- hotspots

export type Hotspot = {
  id: HotspotId;
  /** Clickable footprint in tile space at height z. */
  area: Rect;
  z: number;
  /** Where the label pin sits (tile coords + height). */
  pin: [number, number, number];
  /** Optional planting rings drawn while previewing. */
  rings?: { x: number; y: number }[];
};

export const HOTSPOTS: Record<HotspotId, Hotspot> = {
  "trees-courtyard": {
    id: "trees-courtyard",
    area: { x0: 5.0, x1: 10.1, y0: 5.2, y1: 9.6 },
    z: 0,
    pin: [7.5, 7.4, 26],
    rings: COURT_TREES,
  },
  "trees-street": {
    id: "trees-street",
    area: { x0: 0.6, x1: 15.4, y0: 11.75, y1: 12.3 },
    z: 0,
    pin: [3.4, 12.0, 26],
    rings: STREET_TREES,
  },
  "solar-roof": {
    id: "solar-roof",
    area: { x0: ACADEMIC.x0, x1: ACADEMIC.x1, y0: ACADEMIC.y0, y1: ACADEMIC.y1 },
    z: ACADEMIC.h,
    pin: [6.4, 2.0, ACADEMIC.h + 14],
  },
  "solar-canopy": {
    id: "solar-canopy",
    area: CANOPY,
    z: 0,
    pin: [14.9, 8.8, 30],
  },
  "bike-gate": {
    id: "bike-gate",
    area: { x0: 0.4, x1: 15.6, y0: 12.3, y1: 12.8 },
    z: 0,
    pin: [10.6, 12.55, 18],
  },
  "rain-lowpoint": {
    id: "rain-lowpoint",
    area: APRON,
    z: 0,
    pin: [3.3, 10.95, 18],
  },
  "roof-academic": {
    id: "roof-academic",
    area: { x0: ACADEMIC.x0, x1: ACADEMIC.x1, y0: ACADEMIC.y0, y1: ACADEMIC.y1 },
    z: ACADEMIC.h,
    pin: [6.4, 2.0, ACADEMIC.h + 14],
  },
  "roof-cafeteria": {
    id: "roof-cafeteria",
    area: { x0: CAFETERIA.x0, x1: CAFETERIA.x1, y0: CAFETERIA.y0, y1: CAFETERIA.y1 },
    z: CAFETERIA.h,
    pin: [2.0, 7.0, CAFETERIA.h + 14],
  },
};

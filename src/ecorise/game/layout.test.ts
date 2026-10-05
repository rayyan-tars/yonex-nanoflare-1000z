import { describe, expect, it } from "vitest";
import {
  DESTINATIONS,
  FLOWERBEDS,
  HOMES,
  KITCHEN,
  LAMPS,
  MEADOW,
  MISSION_BOARD,
  QUEUE_SLOTS,
  SUSTAIN_FLAG,
  SERVE_POINT,
  TRAY_RETURN_APPROACH,
  TREES,
  doorTile,
  findPath,
  isWalkable,
  tileAt,
} from "./layout";

const allDestinations = [
  ...Object.values(DESTINATIONS).flat(),
  ...HOMES.map(doorTile),
];

function occupiedByBuilding(x: number, y: number) {
  const inF = (f: { x: number; y: number; w: number; d: number }) =>
    x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.d;
  return inF(KITCHEN) || HOMES.some((h) => h.x === x && h.y === y);
}

describe("city layout", () => {
  it("every destination and front door is on a walkable tile", () => {
    for (const p of allDestinations) expect(isWalkable(p.x, p.y), `${p.x},${p.y}`).toBe(true);
  });

  it("every destination can reach every other along walkable tiles", () => {
    for (const a of allDestinations) {
      for (const b of allDestinations) {
        const path = findPath(a, b);
        expect(path, `${a.x},${a.y} → ${b.x},${b.y}`).not.toBeNull();
        for (const step of path!) expect(isWalkable(step.x, step.y)).toBe(true);
        // 4-neighbour steps only, so citizens never cut across building corners.
        for (let i = 1; i < path!.length; i++) {
          const d = Math.abs(path![i].x - path![i - 1].x) + Math.abs(path![i].y - path![i - 1].y);
          expect(d).toBe(1);
        }
      }
    }
  });

  it("no walkable tile lies under a building", () => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (occupiedByBuilding(x, y)) expect(isWalkable(x, y)).toBe(false);
      }
    }
  });

  it("scenery sits on grass, not on paths, buildings or water", () => {
    for (const p of [...TREES, ...LAMPS, ...FLOWERBEDS, MISSION_BOARD, SUSTAIN_FLAG]) {
      expect(tileAt(p.x, p.y), `${p.x},${p.y}`).toBe("grass");
      expect(occupiedByBuilding(p.x, p.y)).toBe(false);
    }
  });

  it("queue slots and the serving point lie on walkable street tiles", () => {
    for (const s of [SERVE_POINT, ...QUEUE_SLOTS, TRAY_RETURN_APPROACH]) {
      expect(isWalkable(Math.floor(s.x), Math.floor(s.y)), `${s.x},${s.y}`).toBe(true);
    }
  });

  it("the expansion meadow sits on the island next to the lane", () => {
    for (let y = MEADOW.y; y < MEADOW.y + MEADOW.d; y++) {
      for (let x = MEADOW.x; x < MEADOW.x + MEADOW.w; x++) expect(tileAt(x, y)).toBe("meadow");
    }
    expect(isWalkable(12, MEADOW.y + MEADOW.d)).toBe(true);
  });

  it("the mission board and flag have their own tiles", () => {
    const props = [...TREES, ...LAMPS, ...FLOWERBEDS].map((p) => `${p.x},${p.y}`);
    for (const p of [MISSION_BOARD, SUSTAIN_FLAG]) expect(props).not.toContain(`${p.x},${p.y}`);
  });
});

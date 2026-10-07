import { describe, expect, it } from "vitest";
import { PIECES } from "./pieces";
import { deserialize, serialize } from "./save";
import { GOALS, analyze, collectTaxes, newSim, tick } from "./sim";
import { MAX_HEIGHT, N, START_COAL, TOWN_HALL, canPlace, idx, newTown, place, remove, removeInfo, thUpgradeCheck, type Town } from "./world";

/** A starting village with plenty of coins and a clear lot south-east of the street. */
function village(): Town {
  const t = newTown(7, 0);
  t.coins = 100_000;
  for (let y = 33; y < 40; y++) for (let x = 30; x < 40; x++) t.cols[idx(x, y)] = { g: "grass", s: [] };
  t.residents = analyze(t, new Float32Array(N * N)).housing;
  return t;
}

function build(t: Town, x: number, y: number, ...ids: string[]) {
  for (const id of ids) {
    const ok = canPlace(t, idx(x, y), id);
    if (!ok.ok) throw new Error(`${id} at ${x},${y}: ${ok.reason}`);
    place(t, idx(x, y), id);
  }
}

function run(t: Town, seconds: number) {
  const sim = newSim();
  for (let k = 0; k < seconds * 4; k++) tick(t, sim, 0.25);
  return sim;
}

describe("the village", () => {
  it("is the same from the same seed, with the Town Hall, homes and a coal plant", () => {
    const a = newTown(3, 0);
    expect(JSON.stringify(a.cols)).toBe(JSON.stringify(newTown(3, 0).cols));
    expect(a.cols[idx(TOWN_HALL.x, TOWN_HALL.y)].s).toEqual(["townhall"]);
    expect(a.cols[idx(START_COAL.x, START_COAL.y)].s).toEqual(["coal"]);
    const s = analyze(a, new Float32Array(N * N));
    expect(s.housing).toBeGreaterThan(20);
    expect(s.noAccess).toEqual([]);
  });

  it("starts with smoky air that clean power and removing the coal plant clear up", () => {
    const t = village();
    const before = run(t, 120).stats;
    expect(before.homeAir).toBeGreaterThan(10);
    expect(before.stars[1]).toBe(false);
    build(t, 34, 34, "wind");
    build(t, 36, 34, "wind");
    build(t, 38, 34, "wind");
    remove(t, idx(START_COAL.x, START_COAL.y));
    const after = run(t, 300).stats;
    expect(after.energy.supply).toBeGreaterThanOrEqual(after.energy.demand);
    expect(after.stars[0]).toBe(true);
    expect(after.homeAir).toBeLessThan(before.homeAir / 2);
  });
});

describe("building", () => {
  it("stacks blocks then a roof; roofs need a block below", () => {
    const t = village();
    expect(canPlace(t, idx(32, 34), "roof")).toMatchObject({ ok: false });
    build(t, 32, 34, "timber", "brick", "roof");
    expect(canPlace(t, idx(32, 34), "timber")).toMatchObject({ ok: false, reason: "There's a roof on top" });
  });

  it("limits height by Town Hall level and locks later pieces", () => {
    const t = village();
    for (let k = 0; k < MAX_HEIGHT[1]; k++) build(t, 32, 34, "timber");
    expect(canPlace(t, idx(32, 34), "timber")).toMatchObject({ ok: false });
    expect(canPlace(t, idx(35, 35), "bus")).toMatchObject({ ok: false, reason: "Needs Town Hall 2" });
  });

  it("homes need a roof and a path within 2 tiles, then people move in", () => {
    const t = village();
    const housing = analyze(t, new Float32Array(N * N)).housing;
    build(t, 33, 36, "timber", "roof");
    expect(analyze(t, new Float32Array(N * N)).noAccess).toContain(idx(33, 36));
    build(t, 33, 37, "path");
    const s = analyze(t, new Float32Array(N * N));
    expect(s.housing).toBe(housing + 2);
  });

  it("never pays back more than it cost", () => {
    for (const p of PIECES.filter((x) => x.unlock < 99)) {
      const t = village();
      t.th = 3;
      if (p.kind === "roof") build(t, 33, 35, "timber");
      const before = t.coins;
      if (!canPlace(t, idx(33, 35), p.id).ok) continue;
      place(t, idx(33, 35), p.id);
      remove(t, idx(33, 35));
      expect(t.coins, p.id).toBeLessThanOrEqual(before);
    }
  });

  it("clearing a boulder costs coins; the Town Hall can't be removed", () => {
    const t = village();
    t.cols[idx(35, 35)].s = ["rock"];
    expect(removeInfo(t, idx(35, 35))).toMatchObject({ ok: true, coins: -20 });
    expect(removeInfo(t, idx(TOWN_HALL.x, TOWN_HALL.y)).ok).toBe(false);
  });
});

describe("progress", () => {
  it("goals come one at a time and pay once", () => {
    const t = village();
    run(t, 5);
    expect(t.goal).toBe(0);
    collectTaxes(t);
    run(t, 1);
    expect(t.goal).toBe(1);
    const coins = t.coins;
    run(t, 5);
    expect(t.goal).toBe(1);
    expect(t.coins).toBeLessThanOrEqual(coins + 100);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
  });

  it("the Town Hall upgrade needs residents and eco stars", () => {
    const t = village();
    expect(thUpgradeCheck(t, 0)).toMatchObject({ ok: false });
    t.residents = 30;
    expect(thUpgradeCheck(t, 0)).toMatchObject({ ok: false, reason: "Needs 1 eco star" });
    expect(thUpgradeCheck(t, 1)).toMatchObject({ ok: true });
  });
});

describe("saves", () => {
  it("round-trip the town", () => {
    const t = village();
    build(t, 32, 34, "timber", "roof");
    const back = deserialize(serialize(t));
    expect(back).not.toBeNull();
    expect(serialize(back!.town)).toBe(serialize(t));
  });

  it("refuse damaged or tampered saves", () => {
    const f = JSON.parse(serialize(village()));
    expect(deserialize("not json")).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, g: f.g.slice(1) }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, s: { ...f.s, 5: ["dragon"] } }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, th: 9 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, coins: -50 }))!.town.coins).toBe(0);
  });
});

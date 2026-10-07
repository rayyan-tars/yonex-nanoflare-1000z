import { describe, expect, it } from "vitest";
import { PIECES, piece } from "./pieces";
import { deserialize, serialize } from "./save";
import { DAY_SECONDS, GOALS, analyze, env, newSim, tick } from "./sim";
import { MAX_HEIGHT, N, TOWN_HALL, canPlace, idx, newTown, place, remove, removeInfo, type Town } from "./world";

const T0 = 1_800_000_000_000;

/** A town with a clear 12×12 lot of grass south-east of the Town Hall. */
function lotTown(): Town {
  const t = newTown(7, T0);
  t.coins = 100_000;
  t.mats = 100;
  for (let y = 31; y < 43; y++) for (let x = 30; x < 42; x++) t.cols[idx(x, y)] = { g: "grass", s: [] };
  return t;
}

function build(t: Town, x: number, y: number, ...ids: string[]) {
  for (const id of ids) {
    const ok = canPlace(t, idx(x, y), id, T0);
    if (!ok.ok) throw new Error(`${id} at ${x},${y}: ${ok.reason}`);
    place(t, idx(x, y), id, T0);
  }
}

/** Builds and finishes at once (as if the builders were done). */
function buildNow(t: Town, x: number, y: number, id: string) {
  build(t, x, y, id);
  t.cols[idx(x, y)].until = undefined;
}

function run(t: Town, seconds: number, start = T0) {
  const sim = newSim();
  for (let s = 0; s < seconds * 4; s++) tick(t, sim, 0.25, start + 60_000 + s * 250);
  return sim;
}

describe("the map", () => {
  it("is generated the same way from the same seed, with the Town Hall at the centre", () => {
    const a = newTown(3, T0);
    const b = newTown(3, T0);
    expect(serialize(a)).toBe(serialize(b));
    expect(a.cols[idx(TOWN_HALL.x, TOWN_HALL.y)].s).toEqual(["townhall"]);
    expect(a.cols.length).toBe(N * N);
    expect(a.cols.some((c) => c.g === "water")).toBe(true);
    expect(a.cols.some((c) => c.s[0] === "oak" || c.s[0] === "pine")).toBe(true);
  });
});

describe("freeform building", () => {
  it("stacks blocks, then a roof; roofs need a block underneath", () => {
    const t = lotTown();
    expect(canPlace(t, idx(32, 33), "roof", T0)).toMatchObject({ ok: false });
    build(t, 32, 33, "timber", "concrete", "roof");
    expect(t.cols[idx(32, 33)].s).toEqual(["timber", "concrete", "roof"]);
    expect(canPlace(t, idx(32, 33), "timber", T0)).toMatchObject({ ok: false, reason: "There's a roof on top" });
  });

  it("limits height by Town Hall level and locks later pieces", () => {
    const t = lotTown();
    for (let i = 0; i < MAX_HEIGHT[1]; i++) build(t, 32, 33, "timber");
    expect(canPlace(t, idx(32, 33), "timber", T0)).toMatchObject({ ok: false, reason: "Max height 3 at this Town Hall" });
    expect(canPlace(t, idx(34, 34), "wind", T0)).toMatchObject({ ok: false, reason: "Needs Town Hall 2" });
  });

  it("needs builders for timed buildings", () => {
    const t = lotTown();
    build(t, 31, 31, "coal");
    build(t, 33, 31, "solar");
    expect(canPlace(t, idx(35, 31), "well", T0)).toMatchObject({ ok: false, reason: "All builders are busy" });
    expect(canPlace(t, idx(35, 31), "well", T0 + 20_000)).toMatchObject({ ok: true });
  });

  it("rooftop solar sits on a block and counts as its roof", () => {
    const t = lotTown();
    build(t, 32, 32, "timber", "solar");
    const s = analyze(t, new Float32Array(N * N), env(DAY_SECONDS / 2), T0 + 60_000);
    expect(s.homes).toContain(idx(32, 32));
  });

  it("never pays back more than it cost, so building and demolishing can't farm coins", () => {
    for (const p of PIECES.filter((x) => !x.fixed && x.unlock < 99)) {
      const t = lotTown();
      t.th = 5;
      const i = idx(33, 33);
      if (p.kind === "roof") build(t, 33, 33, "timber");
      const before = { coins: t.coins, mats: t.mats };
      if (!canPlace(t, i, p.id, T0).ok) continue;
      place(t, i, p.id, T0);
      remove(t, i, T0 + 3_600_000);
      expect(t.coins + t.mats, p.id).toBeLessThanOrEqual(before.coins + before.mats + 2);
    }
  });

  it("clearing a boulder costs coins and gives materials", () => {
    const t = lotTown();
    t.cols[idx(35, 35)].s = ["rock"];
    expect(removeInfo(t, idx(35, 35), T0)).toMatchObject({ ok: true, coins: -20, mats: 25 });
  });
});

describe("homes and people", () => {
  it("roofed buildings near a path fill with residents; unroofed or unreachable ones don't", () => {
    const t = lotTown();
    build(t, 32, 33, "timber", "timber", "roof"); // no path yet
    build(t, 36, 36, "timber"); // no roof
    let s = analyze(t, new Float32Array(N * N), env(120), T0);
    expect(s.noAccess).toContain(idx(32, 33));
    expect(s.noRoof).toContain(idx(36, 36));
    build(t, 32, 35, "path");
    s = analyze(t, new Float32Array(N * N), env(120), T0);
    expect(s.housing).toBe(4);
    run(t, 20);
    expect(Math.floor(t.residents)).toBe(4);
  });
});

/** Two towns of 24 people: one powered by coal, one by sun and wind with batteries. */
function powerTowns() {
  const make = (power: (t: Town) => void) => {
    const t = lotTown();
    t.th = 3;
    for (let x = 30; x < 42; x++) build(t, x, 34, "bike");
    for (let x = 31; x < 37; x++) build(t, x, 33, "timber", "timber", "greenroof");
    for (let x = 31; x < 37; x++) build(t, x, 35, "flowers");
    buildNow(t, 38, 36, "well");
    build(t, 39, 36, "compost");
    build(t, 40, 36, "compost");
    for (let x = 30; x < 36; x++) build(t, x, 38, "garden");
    power(t);
    t.residents = 24;
    return t;
  };
  const coal = make((t) => {
    buildNow(t, 32, 36, "coal");
    buildNow(t, 33, 40, "landfill");
  });
  const clean = make((t) => {
    t.th = 3;
    buildNow(t, 32, 40, "wind");
    buildNow(t, 33, 40, "wind");
    buildNow(t, 34, 40, "solar");
    buildNow(t, 35, 40, "solar");
    buildNow(t, 36, 40, "battery");
    t.th = 3;
    buildNow(t, 37, 40, "landfill");
    for (let x = 30; x < 42; x++) build(t, x, 42, "oak");
  });
  return { coal, clean };
}

describe("sustainability", () => {
  it("coal leaves smoky air and no clean-power star; sun and wind earn stars", () => {
    const { coal, clean } = powerTowns();
    // Finish construction and let the air settle over a few days.
    const later = T0 + 120_000;
    const sc = run(coal, DAY_SECONDS, later);
    const ss = run(clean, DAY_SECONDS, later);
    expect(sc.stats.stars[0]).toBe(false);
    expect(ss.stats.stars[0]).toBe(true);
    expect(sc.stats.co2.net).toBeGreaterThan(ss.stats.co2.net);
    expect(sc.stats.homeAir).toBeGreaterThan(ss.stats.homeAir);
    expect(ss.stats.starCount).toBeGreaterThanOrEqual(3);
  });

  it("stars don't flicker between day and night", () => {
    const { clean } = powerTowns();
    const sim = run(clean, 30, T0 + 120_000);
    const noon = analyze(clean, sim.air, env(DAY_SECONDS / 2), T0 + 300_000).stars[0];
    const midnight = analyze(clean, sim.air, env(0), T0 + 300_000).stars[0];
    expect(noon).toBe(midnight);
  });

  it("solar makes nothing at night", () => {
    expect(env(0).sun).toBe(0);
    expect(env(DAY_SECONDS / 2).sun).toBeCloseTo(1, 1);
  });
});

describe("goals", () => {
  it("reward once only", () => {
    const t = lotTown();
    build(t, 32, 33, "timber", "roof");
    build(t, 32, 34, "path");
    run(t, 10);
    expect(t.goals).toContain("first-home");
    const coins = t.coins;
    run(t, 10, T0 + 100_000);
    expect(t.goals.filter((g) => g === "first-home")).toHaveLength(1);
    expect(t.coins).toBeLessThanOrEqual(coins + 200);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
  });
});

describe("saves", () => {
  it("round-trip the town", () => {
    const t = lotTown();
    build(t, 32, 33, "timber", "roof");
    build(t, 34, 34, "coal");
    const back = deserialize(serialize(t));
    expect(back).not.toBeNull();
    expect(serialize(back!.town)).toBe(serialize(t));
  });

  it("refuse damaged or tampered saves", () => {
    const t = lotTown();
    expect(deserialize("not json")).toBeNull();
    const f = JSON.parse(serialize(t));
    expect(deserialize(JSON.stringify({ ...f, g: f.g.slice(1) }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, s: { ...f.s, 5: ["dragon"] } }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, th: 9 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...f, coins: -50 }))!.town.coins).toBe(0);
  });

  it("knows every piece it saves", () => {
    expect(() => piece("timber")).not.toThrow();
  });
});

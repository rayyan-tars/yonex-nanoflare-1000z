import { describe, expect, it } from "vitest";
import { PIECES } from "./pieces";
import { deserialize, serialize } from "./save";
import { analyze, collectTaxes, newSim, tick, weatherAt } from "./sim";
import { WORLDS } from "./worlds";
import { powerNetwork } from "./eco";
import { FLOOD, floodAt, floodMap, nextFlood, type FloodResult } from "./flood";
import { HEAT, heatAt, nextHeatwave, type HeatResult } from "./heat";
import { MAX_HEIGHT, N, START_COAL, TOWN_HALL, canPlace, idx, inside, newTown, place, remove, removeInfo, thUpgradeCheck, type Town } from "./world";

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
  }, 30000);
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
    const ids = WORLDS.flatMap((w) => w.achievements.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
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

describe("worlds", () => {
  const settle = (t: Town) => {
    t.residents = analyze(t, new Float32Array(N * N)).housing;
    return run(t, 60).stats;
  };

  it("each world starts with its own problem", () => {
    const valley = settle(newTown(1, 0, 0));
    expect(valley.energy.dirty).toBeGreaterThan(0);
    const city = newTown(1, 0, 1);
    const cs = settle(city);
    expect(city.th).toBe(2);
    expect(cs.travel.carShare).toBeGreaterThan(0.9);
    expect(cs.energy.cleanShare).toBe(1);
    expect(cs.noAccess).toEqual([]);
    const isle = newTown(1, 0, 2);
    const is = settle(isle);
    expect(isle.cols.filter((c) => c.g === "water").length).toBeGreaterThan(N * N * 0.6);
    expect(is.energy.dirty).toBeGreaterThan(0);
    expect(is.noAccess).toEqual([]);
  });

  it("finishing the last achievement completes the world, once", () => {
    const t = village();
    t.goal = WORLDS[0].achievements.length - 1;
    const sim = newSim();
    const fired: string[] = [];
    // Make the last achievement (3 eco stars) true by forcing a clean, car-free town.
    const last = WORLDS[0].achievements[t.goal];
    const orig = last.done;
    (last as { done: typeof orig }).done = () => true;
    try {
      for (let k = 0; k < 8; k++) fired.push(...tick(t, sim, 0.25).map((e) => e.type));
    } finally {
      (last as { done: typeof orig }).done = orig;
    }
    expect(t.complete).toBe(true);
    expect(fired.filter((e) => e === "world")).toHaveLength(1);
  });

  it("shops and cafés earn coins from nearby residents", () => {
    const t = village();
    const before = analyze(t, new Float32Array(N * N)).income;
    build(t, 27, 32, "cafe");
    expect(analyze(t, new Float32Array(N * N)).income).toBeGreaterThan(before);
  });
});

describe("weather, farms and trains", () => {
  it("weather changes clean power but not the eco star", () => {
    const t = village();
    build(t, 34, 34, "solar");
    build(t, 36, 34, "wind");
    const kinds = new Set<string>();
    const supply: Record<string, number> = {};
    for (let c = 0; c < 4000; c += 7) {
      t.clock = c;
      const s = analyze(t, new Float32Array(N * N));
      kinds.add(s.weather);
      supply[s.weather] = s.energy.supply;
      expect(s.energy.average).toBe(analyze(t, new Float32Array(N * N)).energy.average);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(new Set(Object.values(supply)).size).toBeGreaterThan(1);
  });

  it("crop fields cut the food trucked in", () => {
    const t = village();
    const before = analyze(t, new Float32Array(N * N)).food;
    expect(before.imported).toBeGreaterThan(0);
    for (let x = 30; x < 35; x++) build(t, x, 37, "field");
    const after = analyze(t, new Float32Array(N * N)).food;
    expect(after.imported).toBeLessThan(before.imported);
  });

  it("a station needs railway next to it before it takes cars off the road", () => {
    const t = village();
    build(t, 30, 35, "station");
    let s = analyze(t, new Float32Array(N * N));
    expect(s.noRail).toContain(idx(30, 35));
    const cars = s.travel.carShare;
    for (let x = 28; x <= 33; x++) build(t, x, 36, "rail");
    s = analyze(t, new Float32Array(N * N));
    expect(s.noRail).toEqual([]);
    expect(s.travel.carShare).toBeLessThan(cars);
  });

  it("Golden Plains starts by trucking in its food", () => {
    const t = newTown(2, 0, 3);
    t.residents = analyze(t, new Float32Array(N * N)).housing;
    const s = analyze(t, new Float32Array(N * N));
    expect(s.food.imported).toBeGreaterThan(0);
    expect(s.noAccess).toEqual([]);
    expect(s.energy.cleanShare).toBe(1);
  });
});

describe("water", () => {
  it("reservoirs need filtering before people can drink the water", () => {
    const t = village();
    t.residents = 60;
    const base = analyze(t, new Float32Array(N * N)).water;
    for (let x = 30; x < 36; x++) build(t, x, 37, "reservoir");
    expect(analyze(t, new Float32Array(N * N)).water.supply).toBe(base.supply);
    build(t, 36, 36, "filtration");
    expect(analyze(t, new Float32Array(N * N)).water.supply).toBeGreaterThan(base.supply);
  });

  it("dams go in water, and hydro power needs a dam beside it", () => {
    const t = village();
    const water = t.cols.findIndex((c, i) => c.g === "water" && t.cols[i + 1]?.g === "water" && t.cols[i + 2]?.g === "water");
    expect(water).toBeGreaterThan(0);
    expect(canPlace(t, idx(33, 35), "dam")).toMatchObject({ ok: false, reason: "Build it in a river or lake" });
    expect(canPlace(t, water + 2, "hydro")).toMatchObject({ ok: false, reason: "Needs a dam right next to it" });
    place(t, water, "dam");
    place(t, water + 1, "hydro");
    const s = analyze(t, new Float32Array(N * N));
    expect(s.energy.clean).toBeGreaterThanOrEqual(20);
  });
});

describe("eco vision", () => {
  it("routes clean power first and lets coal fill the gap", () => {
    const t = village();
    let s = analyze(t, new Float32Array(N * N));
    let net = powerNetwork(t, s);
    expect(net.sources.map((x) => x.kind)).toEqual(["coal"]);
    expect([...net.fed.values()].every((k) => k === "coal")).toBe(true);
    build(t, 34, 34, "wind");
    s = analyze(t, new Float32Array(N * N));
    net = powerNetwork(t, s);
    const kinds = [...net.fed.values()];
    expect(kinds).toContain("clean");
    expect(net.links.some((l) => l.kind === "clean" && l.a === idx(34, 34))).toBe(true);
    remove(t, idx(START_COAL.x, START_COAL.y));
    s = analyze(t, new Float32Array(N * N));
    net = powerNetwork(t, s);
    expect(net.sources.every((x) => x.kind === "clean")).toBe(true);
  });

  it("puts car exhaust on the roads near the homes that drive", () => {
    const t = village();
    const s = analyze(t, new Float32Array(N * N));
    let total = 0;
    s.traffic.forEach((v) => (total += v));
    expect(total).toBeCloseTo(s.travel.cars + s.trucks * 2, 3);
    const roads = t.cols.map((c, i) => (c.g === "road" ? i : -1)).filter((i) => i >= 0);
    const nearHome = (r: number) => s.homes.some((h) => Math.abs((h % N) - (r % N)) <= 2 && Math.abs(Math.floor(h / N) - Math.floor(r / N)) <= 2);
    const busy = roads.filter(nearHome);
    const quiet = roads.filter((r) => !nearHome(r));
    expect(busy.length).toBeGreaterThan(0);
    if (quiet.length) expect(Math.max(...quiet.map((r) => s.traffic[r]))).toBeLessThan(Math.min(...busy.map((r) => s.traffic[r])));
  });
});

/** Runs a town from the next heatwave warning until it has passed; returns the result. */
function heatwave(t: Town): HeatResult {
  const sim = newSim();
  for (let k = 0; k < 40; k++) tick(t, sim, 0.25);
  t.clock = nextHeatwave(t.clock);
  let result: HeatResult | null = null;
  for (let k = 0; k < (HEAT.forecast + HEAT.length + 2) * 4; k++) for (const e of tick(t, sim, 0.25)) if (e.type === "heat") result = e.result;
  if (!result) throw new Error("no heatwave result");
  return result;
}

describe("heatwave", () => {
  it("is forecast, then hot and sunny for two minutes, then over", () => {
    const w = HEAT.first + HEAT.period;
    expect(heatAt(w - 1).phase).toBe("none");
    expect(heatAt(w).phase).toBe("forecast");
    expect(heatAt(w + HEAT.forecast + 60)).toMatchObject({ phase: "event", intensity: 1 });
    expect(heatAt(w + HEAT.forecast + HEAT.length).phase).toBe("none");
    expect(weatherAt(w + HEAT.forecast + 30)).toBe("sunny");
    expect(nextHeatwave(w + 1)).toBe(w + HEAT.period);
  });

  it("makes unshaded homes need air-conditioning; trees shade them", () => {
    const t = village();
    t.clock = nextHeatwave(0) + HEAT.forecast + 60;
    const hot = analyze(t, new Float32Array(N * N));
    expect(hot.heat.exposed).toBeGreaterThan(0);
    t.clock = 0;
    const normal = analyze(t, new Float32Array(N * N));
    expect(hot.energy.demand).toBeGreaterThan(normal.energy.demand);
    expect(hot.water.demand).toBeGreaterThan(normal.water.demand);
    // Two trees beside every home.
    t.clock = nextHeatwave(0) + HEAT.forecast + 60;
    for (const h of hot.homes) {
      const x = h % N;
      const y = Math.floor(h / N);
      let n = 0;
      for (let dy = -2; dy <= 2 && n < 2; dy++)
        for (let dx = -2; dx <= 2 && n < 2; dx++) {
          const i = idx(x + dx, y + dy);
          if (!t.cols[i].s.length && canPlace(t, i, "oak").ok) {
            place(t, i, "oak");
            n++;
          }
        }
    }
    const shaded = analyze(t, new Float32Array(N * N));
    expect(shaded.heat.exposed).toBeLessThan(hot.heat.exposed);
    expect(shaded.heat.acPeak).toBeLessThan(hot.heat.acPeak);
  });

  it("scores the same town the same every time, and a prepared town higher", () => {
    const a = heatwave(village());
    const b = heatwave(village());
    expect(b.score).toBe(a.score);
    const t = village();
    build(t, 34, 34, "wind");
    build(t, 36, 34, "wind");
    for (let x = 30; x < 40; x += 2) build(t, x, 36, "oak");
    for (const [x, y] of [[26, 26], [30, 26], [26, 30], [30, 30], [24, 28], [32, 28]]) if (canPlace(t, idx(x, y), "oak").ok) build(t, x, y, "oak");
    const c = heatwave(t);
    expect(a.score).toBeGreaterThan(30);
    expect(c.score).toBeGreaterThan(a.score);
    expect(c.power).toBe(1);
    expect(a.power).toBeLessThan(1);
  }, 60000);
});

describe("heavy rain", () => {
  it("warns, rains for 90 seconds, then drains away; never during a heatwave", () => {
    const w = nextFlood(0);
    expect(floodAt(w).phase).toBe("forecast");
    expect(floodAt(w + FLOOD.forecast + 40)).toMatchObject({ phase: "rain", intensity: 1, water: 1 });
    expect(weatherAt(w + FLOOD.forecast + 40)).toBe("rain");
    expect(floodAt(w + FLOOD.forecast + FLOOD.length + 10).phase).toBe("drain");
    expect(floodAt(w + FLOOD.forecast + FLOOD.length + FLOOD.drain).phase).toBe("none");
    for (let c = 0; c < 3000; c += 5) expect(heatAt(c).phase !== "none" && floodAt(c).phase !== "none").toBe(false);
  });

  it("floods roads with more concrete than green; a park beside them keeps them dry", () => {
    const t = village();
    const before = floodMap(t);
    expect(before.flooded.length).toBeGreaterThan(0);
    // A park and trees next to the first flooded road.
    const f = before.flooded[0];
    const x = f % N;
    const y = Math.floor(f / N);
    let planted = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const i = idx(x + dx, y + dy);
        if (inside(x + dx, y + dy) && !t.cols[i].s.length && t.cols[i].g === "grass") {
          const id = planted === 0 ? "park" : "oak";
          if (canPlace(t, i, id).ok) {
            place(t, i, id);
            planted++;
          }
        }
      }
    const after = floodMap(t);
    expect(after.margin[f]).toBeGreaterThan(before.margin[f]);
    expect(after.flooded).not.toContain(f);
    expect(after.flooded.length).toBeLessThan(before.flooded.length);
  });

  it("scores the share of roads that stayed dry, the same every time", () => {
    const run = (t: Town) => {
      const sim = newSim();
      t.clock = nextFlood(0);
      let r: FloodResult | null = null;
      for (let k = 0; k < (FLOOD.forecast + FLOOD.length + 2) * 4; k++) for (const e of tick(t, sim, 0.25)) if (e.type === "flood") r = e.result;
      return r!;
    };
    const a = run(village());
    const b = run(village());
    expect(a).toEqual(b);
    expect(a.score).toBe(Math.round(100 * (1 - a.flooded / a.roads)));
  }, 60000);
});

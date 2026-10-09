import { describe, expect, it } from "vitest";
import {
  INTERVENTIONS,
  MAX_CHOICES,
  bridgePrompt,
  canPlace,
  finishHeatwave,
  heatwaveResult,
  initialState,
  place,
  replay,
  reveal,
  signals,
  startHeatwave,
  undo,
  type GameState,
  type HotspotId,
} from "../../src/futureshift/model";
import { planFor } from "../../src/futureshift/sim";

const play = (...spots: HotspotId[]) => spots.reduce<GameState>((s, spot) => place(s, spot), initialState());

describe("three choices", () => {
  it("offers exactly five interventions", () => {
    expect(INTERVENTIONS.map((i) => i.id)).toEqual(["trees", "solar", "bike", "rain", "roof"]);
  });

  it("commits exactly three interventions, then is ready", () => {
    const s = play("trees-courtyard", "solar-roof", "bike-gate");
    expect(s.placements).toHaveLength(MAX_CHOICES);
    expect(s.phase).toBe("ready");
  });

  it("refuses a fourth choice", () => {
    const s = play("trees-courtyard", "solar-roof", "bike-gate");
    const s4 = place(s, "rain-lowpoint");
    expect(s4).toBe(s);
    expect(canPlace(s.placements, s.phase, "rain-lowpoint")).toBe(false);
  });

  it("uses each intervention once", () => {
    const s = play("trees-courtyard");
    expect(place(s, "trees-street")).toBe(s);
  });

  it("keeps the classroom roof for one use only", () => {
    const s = play("solar-roof");
    expect(canPlace(s.placements, s.phase, "roof-academic")).toBe(false);
    expect(canPlace(s.placements, s.phase, "roof-cafeteria")).toBe(true);
  });

  it("allows one undo before the future is locked", () => {
    let s = play("trees-courtyard", "solar-roof", "bike-gate");
    s = undo(s);
    expect(s.placements.map((p) => p.id)).toEqual(["trees", "solar"]);
    expect(s.phase).toBe("choose");
    // only one undo is held
    expect(undo(s)).toBe(s);
    s = place(s, "rain-lowpoint");
    s = reveal(s);
    expect(s.phase).toBe("reveal");
    expect(undo(s)).toBe(s);
  });

  it("replay resets the choices but remembers completed futures", () => {
    let s = play("trees-courtyard", "solar-roof", "bike-gate");
    s = finishHeatwave(startHeatwave(reveal(s)));
    expect(s.phase).toBe("result");
    expect(s.futuresCompleted).toBe(1);
    const r = replay(s);
    expect(r.placements).toEqual([]);
    expect(r.phase).toBe("choose");
    expect(r.futuresCompleted).toBe(1);
  });
});

describe("future signals", () => {
  it("cannot max all three qualities with three moves", () => {
    const all = ["trees-courtyard", "trees-street", "solar-roof", "solar-canopy", "bike-gate", "rain-lowpoint", "roof-academic", "roof-cafeteria"] as HotspotId[];
    let best = 0;
    for (const a of all)
      for (const b of all)
        for (const c of all) {
          const s = play(a, b, c);
          if (s.placements.length < 3) continue;
          const g = signals(s.placements);
          best = Math.max(best, g.cooler + g.cleaner + g.safer);
          expect(g.cooler === 3 && g.cleaner === 3 && g.safer === 3).toBe(false);
        }
    expect(best).toBeGreaterThanOrEqual(7);
  });

  it("maps each change to its strongest quality", () => {
    expect(signals(play("trees-courtyard").placements)).toEqual({ cooler: 2, cleaner: 0, safer: 1 });
    expect(signals(play("solar-roof").placements)).toEqual({ cooler: 0, cleaner: 2, safer: 0 });
    expect(signals(play("bike-gate").placements)).toEqual({ cooler: 0, cleaner: 2, safer: 0 });
    expect(signals(play("rain-lowpoint").placements)).toEqual({ cooler: 0, cleaner: 0, safer: 2 });
    expect(signals(play("roof-cafeteria").placements)).toEqual({ cooler: 2, cleaner: 0, safer: 1 });
  });
});

describe("2050 heatwave", () => {
  it("is deterministic", () => {
    const pl = play("trees-courtyard", "roof-academic", "solar-canopy").placements;
    expect(heatwaveResult(pl)).toEqual(heatwaveResult(pl));
  });

  it("strong future: shade + cool roof + solar", () => {
    const r = heatwaveResult(play("trees-courtyard", "roof-academic", "solar-canopy").placements);
    expect(r.comfortable).toBe(6);
    expect(r.resilience).toBe("STRONG");
    expect(r.lines).toEqual(["2050 HEATWAVE PASSED", "6/8 campus zones stayed comfortable", "Clean power covered cooling demand"]);
  });

  it("trees change the heat outcome", () => {
    const without = heatwaveResult(play("bike-gate", "rain-lowpoint").placements);
    const withTrees = heatwaveResult(play("bike-gate", "rain-lowpoint", "trees-courtyard").placements);
    expect(withTrees.comfortable - without.comfortable).toBe(2);
  });

  it("a cool roof changes the heat outcome", () => {
    const base = heatwaveResult(play("bike-gate").placements);
    expect(heatwaveResult(play("bike-gate", "roof-academic").placements).comfortable).toBe(base.comfortable + 2);
    expect(heatwaveResult(play("bike-gate", "roof-cafeteria").placements).comfortable).toBe(base.comfortable + 1);
  });

  it("solar provides clean power for cooling", () => {
    const without = heatwaveResult(play("trees-courtyard", "bike-gate").placements);
    const withSolar = heatwaveResult(play("trees-courtyard", "solar-roof").placements);
    expect(without.cleanPower).toBe(false);
    expect(withSolar.cleanPower).toBe(true);
    expect(withSolar.comfortable).toBe(without.comfortable + 2);
    expect(withSolar.lines[2]).toBe("Clean power covered cooling demand");
  });

  it("an unshaded future is vulnerable and says why", () => {
    const r = heatwaveResult(play("solar-roof", "bike-gate", "rain-lowpoint").placements);
    expect(r.resilience).toBe("VULNERABLE");
    expect(r.comfortable).toBe(3);
    expect(r.lines).toHaveLength(3);
  });

  it("prompts about shade when the courtyard and gate stay exposed", () => {
    const r = heatwaveResult(play("rain-lowpoint", "bike-gate", "roof-cafeteria").placements);
    expect(r.lines[2]).toBe("More shade would protect the courtyard");
  });
});

describe("future state follows the choices", () => {
  it("bike access means cyclists and fewer cars in 2050", () => {
    const none = planFor("future", [], 0);
    const bike = planFor("future", play("bike-gate").placements, 0);
    expect(none.cyclists).toBe(0);
    expect(bike.cyclists).toBeGreaterThan(0);
    expect(bike.carsEast + bike.carsWest).toBeLessThan(none.carsEast + none.carsWest);
  });

  it("courtyard trees bring students outside; no trees keeps them clustered", () => {
    const none = planFor("future", [], 0);
    const trees = planFor("future", play("trees-courtyard").placements, 0);
    expect(none.areas["court-shade"] ?? 0).toBe(0);
    expect(trees.areas["court-shade"]).toBeGreaterThan(0);
    const out = (p: typeof none) => Object.values(p.areas).reduce((a, b) => a + (b ?? 0), 0);
    expect(out(trees)).toBeGreaterThan(out(none));
  });

  it("the heatwave sends exposed students to shade", () => {
    const hot = planFor("future", [], 1);
    expect(hot.areas["court-open"] ?? 0).toBe(0);
    expect(hot.areas.terrace).toBeGreaterThan(0);
    const shaded = planFor("future", play("trees-courtyard").placements, 1);
    expect(shaded.areas["court-shade"]).toBeGreaterThan(0);
  });

  it("today does not change with 2050 choices except the first cyclist", () => {
    const t0 = planFor("today", [], 0);
    const t1 = planFor("today", play("trees-courtyard", "bike-gate").placements, 0);
    expect(t1.areas).toEqual(t0.areas);
    expect(t1.cyclists).toBe(1);
  });
});

describe("real-world bridge", () => {
  it("adapts to the weakest dimension", () => {
    expect(bridgePrompt(play("solar-roof", "bike-gate", "rain-lowpoint").placements).question).toBe("Where around your school needs more shade?");
    expect(bridgePrompt(play("trees-courtyard", "roof-cafeteria", "rain-lowpoint").placements).question).toBe("Where could students safely walk or cycle instead?");
    expect(bridgePrompt(play("trees-courtyard", "solar-roof", "bike-gate").placements).question).toBe("Where does rainwater collect around your school?");
  });
});

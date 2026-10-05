import { describe, expect, it } from "vitest";
import { APPETITE_UNITS, BALANCE, SERVING_UNITS } from "./config";
import { feedbackReveal, forecastRange, planningView, toggleVoiceAction, NO_VOICE } from "./planning";
import { MONDAY_STEW, generateScenario, getScenario, scenarioFromDiners } from "./scenarios";
import { runService, sanitizePortions, servingCapacity } from "./simulation";
import type { Diner, KitchenPolicy, ServiceResult, StudentVoice, Upgrades } from "./types";
import { NO_UPGRADES } from "./types";

const monday = getScenario(MONDAY_STEW.id);

const VOICES: StudentVoice[] = [
  NO_VOICE,
  { rsvp: true, smallPlease: false, feedback: false },
  { rsvp: false, smallPlease: true, feedback: false },
  { rsvp: false, smallPlease: false, feedback: true },
  { rsvp: true, smallPlease: true, feedback: false },
  { rsvp: false, smallPlease: true, feedback: true },
];
const UPGRADE_SETS: Upgrades[] = [
  NO_UPGRADES,
  { planningOffice: true, secondCounter: false },
  { planningOffice: false, secondCounter: true },
  { planningOffice: true, secondCounter: true },
];

function* allPlans() {
  for (let portions = 0; portions <= 200; portions += 7) {
    for (const offerSmallServings of [false, true]) {
      for (const voice of VOICES) {
        for (const upgrades of UPGRADE_SETS) {
          yield { policy: { portionsPrepared: portions, offerSmallServings }, voice, upgrades };
        }
      }
    }
  }
}

function expectConsistent(r: ServiceResult) {
  const f = r.food;
  // Food conservation, in integer units.
  expect(f.served + f.unserved).toBe(f.prepared);
  expect(f.eaten + f.plateWaste).toBe(f.served);
  for (const v of [f.prepared, f.served, f.unserved, f.eaten, f.plateWaste]) {
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  }
  // People accounting: every attendee counted exactly once.
  expect(r.hotMeals + r.missedBecauseFoodRanOut + r.missedBecauseServiceTimeEnded).toBe(r.attendance);
  expect(r.outcomes).toHaveLength(r.attendance);
  expect(r.smallServings + r.regularServings).toBe(r.hotMeals);
  expect(r.hotMeals).toBeLessThanOrEqual(r.servingCapacity);
  // Servings are consistent with the food actually handed out.
  expect(f.served).toBe(r.smallServings * SERVING_UNITS.small + r.regularServings * SERVING_UNITS.regular);
}

describe("runService accounting", () => {
  it("conserves food and people for every plan on the Monday scenario", () => {
    let count = 0;
    for (const plan of allPlans()) {
      expectConsistent(runService({ scenario: monday, ...plan }));
      count++;
    }
    expect(count).toBeGreaterThan(500);
  });

  it("never serves more food than was prepared, even with odd leftovers", () => {
    const diners: Diner[] = Array.from({ length: 30 }, (_, i) => ({
      appetite: i % 2 ? "small" : "regular",
      askPropensity: (i * 0.37) % 1,
    }));
    const scenario = scenarioFromDiners(diners);
    for (let portions = 0; portions <= 35; portions++) {
      const r = runService({
        scenario,
        policy: { portionsPrepared: portions, offerSmallServings: true },
        voice: { ...NO_VOICE, smallPlease: true },
        upgrades: NO_UPGRADES,
      });
      expectConsistent(r);
      expect(r.food.served).toBeLessThanOrEqual(portions * SERVING_UNITS.regular);
    }
  });
});

describe("capacity and shortage boundaries", () => {
  const regulars = (n: number): Diner[] =>
    Array.from({ length: n }, () => ({ appetite: "regular", askPropensity: 0.5 }));

  it("serves exactly as many diners as there are whole servings", () => {
    const scenario = scenarioFromDiners(regulars(10));
    const r = runService({
      scenario,
      policy: { portionsPrepared: 7, offerSmallServings: false },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    expect(r.hotMeals).toBe(7);
    expect(r.missedBecauseFoodRanOut).toBe(3);
    expect(r.food.unserved).toBe(0);
    expect(r.outcomes.slice(7)).toEqual(["missed-food", "missed-food", "missed-food"]);
  });

  it("stops serving when the lunch window's capacity is reached, even with food left", () => {
    const cap = servingCapacity(false, NO_UPGRADES);
    const scenario = scenarioFromDiners(regulars(cap + 5));
    const r = runService({
      scenario,
      policy: { portionsPrepared: cap + 50, offerSmallServings: false },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    expect(r.hotMeals).toBe(cap);
    expect(r.missedBecauseServiceTimeEnded).toBe(5);
    expect(r.missedBecauseFoodRanOut).toBe(0);
    expect(r.food.unserved).toBe(50 * SERVING_UNITS.regular);
  });

  it("offering small servings costs serving speed and a second counter adds it back", () => {
    expect(servingCapacity(true, NO_UPGRADES)).toBeLessThan(servingCapacity(false, NO_UPGRADES));
    expect(servingCapacity(true, { planningOffice: false, secondCounter: true })).toBeGreaterThan(
      servingCapacity(false, NO_UPGRADES),
    );
  });

  it("a leftover too small for a regular serving can still serve a small request", () => {
    const diners: Diner[] = [
      { appetite: "regular", askPropensity: 0.9 },
      { appetite: "regular", askPropensity: 0.9 },
      { appetite: "small", askPropensity: 0.1 },
    ];
    const r = runService({
      scenario: scenarioFromDiners(diners),
      policy: { portionsPrepared: 2, offerSmallServings: true },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    // 20 units: two regulars take all of it; the small request then misses.
    expect(r.outcomes).toEqual(["regular", "regular", "missed-food"]);

    const r2 = runService({
      scenario: scenarioFromDiners([diners[0], diners[2], diners[1]]),
      policy: { portionsPrepared: 2, offerSmallServings: true },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    // 20 → regular (10 left) → small (4 left) → regular cannot be served.
    expect(r2.outcomes).toEqual(["regular", "small", "missed-food"]);
    expect(r2.food.unserved).toBe(4);
  });

  it("handles zero preparation and zero attendance without NaN", () => {
    const zeroPrep = runService({
      scenario: monday,
      policy: { portionsPrepared: 0, offerSmallServings: false },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    expect(zeroPrep.hotMeals).toBe(0);
    expect(zeroPrep.foodUseShare).toBeNull();
    expect(zeroPrep.hotMealShare).toBe(0);

    const empty = runService({
      scenario: scenarioFromDiners([]),
      policy: { portionsPrepared: 40, offerSmallServings: true },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    expect(empty.hotMealShare).toBeNull();
    expect(empty.foodUseShare).toBe(0);
    expect(empty.food.unserved).toBe(400);
  });

  it("sanitises invalid cooking quantities", () => {
    expect(sanitizePortions(-5)).toBe(0);
    expect(sanitizePortions(Number.NaN)).toBe(0);
    expect(sanitizePortions("12")).toBe(12);
    expect(sanitizePortions(12.6)).toBe(13);
    expect(sanitizePortions(1e9)).toBe(BALANCE.maxPortionsPrepared);
  });
});

describe("small servings", () => {
  it("only go to small-appetite diners, so nobody gets less than they eat", () => {
    for (const plan of allPlans()) {
      const r = runService({ scenario: monday, ...plan });
      r.outcomes.forEach((o, i) => {
        if (o === "small") expect(monday.diners[i].appetite).toBe("small");
      });
      // Every served diner ate their full appetite, so eaten equals the sum of
      // appetites of everyone who was served.
      const expectedEaten = r.outcomes.reduce(
        (sum, o, i) =>
          o === "small" || o === "regular" ? sum + APPETITE_UNITS[monday.diners[i].appetite] : sum,
        0,
      );
      expect(r.food.eaten).toBe(expectedEaten);
    }
  });

  it("are only served when the kitchen offers them", () => {
    const r = runService({
      scenario: monday,
      policy: { portionsPrepared: 150, offerSmallServings: false },
      voice: { ...NO_VOICE, smallPlease: true },
      upgrades: NO_UPGRADES,
    });
    expect(r.smallServings).toBe(0);
  });

  it("the reminder only adds askers and reduces plate waste when the kitchen cooperates", () => {
    const base = { scenario: monday, upgrades: NO_UPGRADES };
    const policy: KitchenPolicy = { portionsPrepared: 150, offerSmallServings: true };
    const without = runService({ ...base, policy, voice: NO_VOICE });
    const withReminder = runService({ ...base, policy, voice: { ...NO_VOICE, smallPlease: true } });
    expect(withReminder.smallServings).toBeGreaterThan(without.smallServings);
    without.outcomes.forEach((o, i) => {
      if (o === "small") expect(withReminder.outcomes[i]).toBe("small");
    });
    expect(withReminder.food.plateWaste).toBeLessThan(without.food.plateWaste);
  });
});

describe("determinism and information", () => {
  it("the same seed always generates the same scenario", () => {
    const a = generateScenario(MONDAY_STEW);
    const b = generateScenario(MONDAY_STEW);
    expect(a).toEqual(b);
    expect(a.actualAttendance).toBeGreaterThanOrEqual(MONDAY_STEW.attendanceRange[0]);
    expect(a.actualAttendance).toBeLessThanOrEqual(MONDAY_STEW.attendanceRange[1]);
    const other = generateScenario({ ...MONDAY_STEW, seed: MONDAY_STEW.seed + 1 });
    expect(other).not.toEqual(a);
  });

  it("identical inputs always give identical results", () => {
    const input = {
      scenario: monday,
      policy: { portionsPrepared: 118, offerSmallServings: true },
      voice: { ...NO_VOICE, smallPlease: true },
      upgrades: NO_UPGRADES,
    };
    expect(runService(input)).toEqual(runService(input));
  });

  it("RSVP and Feedback change what the player knows, not what happens", () => {
    const policy: KitchenPolicy = { portionsPrepared: 120, offerSmallServings: true };
    const plain = runService({ scenario: monday, policy, voice: NO_VOICE, upgrades: NO_UPGRADES });
    const informed = runService({
      scenario: monday,
      policy,
      voice: { rsvp: true, smallPlease: false, feedback: true },
      upgrades: { planningOffice: true, secondCounter: false },
    });
    expect(informed).toEqual(plain);
    expect(monday.actualAttendance).toBe(generateScenario(MONDAY_STEW).actualAttendance);
  });

  it("every forecast contains the true attendance and better information nests inside", () => {
    for (let i = 0; i < 400; i++) {
      const anchor = i / 400;
      const s = { ...monday, forecastAnchor: anchor };
      const wide = forecastRange(s, { rsvp: false, planningOffice: false });
      const rsvp = forecastRange(s, { rsvp: true, planningOffice: false });
      const best = forecastRange(s, { rsvp: true, planningOffice: true });
      for (const r of [wide, rsvp, best]) {
        expect(r.low).toBeLessThanOrEqual(s.actualAttendance);
        expect(r.high).toBeGreaterThanOrEqual(s.actualAttendance);
      }
      expect(rsvp.low).toBeGreaterThanOrEqual(wide.low);
      expect(rsvp.high).toBeLessThanOrEqual(wide.high);
      expect(best.high - best.low).toBeLessThan(rsvp.high - rsvp.low);
      expect(best.low).toBeGreaterThanOrEqual(rsvp.low);
      expect(best.high).toBeLessThanOrEqual(rsvp.high);
    }
  });

  it("the Feedback Box reports a rounded share without changing appetites", () => {
    const reveal = feedbackReveal(monday);
    expect(reveal.portionTooBigPercent % 5).toBe(0);
    const actual = monday.diners.filter((d) => d.appetite === "small").length / monday.diners.length;
    expect(Math.abs(reveal.portionTooBigPercent / 100 - actual)).toBeLessThanOrEqual(0.025);
  });
});

describe("Student Voice tokens", () => {
  it("allows at most two actions, deselection and no duplicates", () => {
    let v = NO_VOICE;
    v = toggleVoiceAction(v, "rsvp").voice;
    v = toggleVoiceAction(v, "feedback").voice;
    const third = toggleVoiceAction(v, "smallPlease");
    expect(third.rejected).toBe("token-limit");
    expect(third.voice).toEqual(v);
    v = toggleVoiceAction(v, "rsvp").voice;
    expect(v).toEqual({ rsvp: false, smallPlease: false, feedback: true });
    v = toggleVoiceAction(v, "smallPlease").voice;
    expect(v).toEqual({ rsvp: false, smallPlease: true, feedback: true });
  });

  it("planning view only reveals feedback when the Feedback Box is chosen", () => {
    const policy: KitchenPolicy = { portionsPrepared: 120, offerSmallServings: false };
    expect(planningView(monday, NO_VOICE, policy, NO_UPGRADES).feedback).toBeNull();
    expect(
      planningView(monday, { ...NO_VOICE, feedback: true }, policy, NO_UPGRADES).feedback,
    ).not.toBeNull();
  });
});

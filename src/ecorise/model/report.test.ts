import { describe, expect, it } from "vitest";
import { NO_VOICE, planRisk, planningView } from "./planning";
import { businessAsUsualPlan, computeRoundReport, type RoundPlan } from "./report";
import { MONDAY_STEW, getScenario } from "./scenarios";
import { NO_UPGRADES, type StudentVoice } from "./types";

const monday = getScenario(MONDAY_STEW.id);

function plan(portionsPrepared: number, offerSmallServings = false, voice: Partial<StudentVoice> = {}): RoundPlan {
  return {
    voice: { ...NO_VOICE, ...voice },
    policy: { portionsPrepared, offerSmallServings },
    upgrades: NO_UPGRADES,
  };
}

describe("round report", () => {
  it("same seed and same decisions always give the same report", () => {
    const a = computeRoundReport(monday, plan(118, true, { rsvp: true, smallPlease: true }));
    const b = computeRoundReport(getScenario(MONDAY_STEW.id), plan(118, true, { rsvp: true, smallPlease: true }));
    expect(a).toEqual(b);
  });

  it("the baseline is the same for every player decision on the same day", () => {
    const reports = [plan(90), plan(140), plan(118, true, { smallPlease: true, feedback: true })].map((p) =>
      computeRoundReport(monday, p),
    );
    for (const r of reports) expect(r.baseline).toEqual(reports[0].baseline);
    const bau = businessAsUsualPlan(monday);
    expect(bau.voice).toEqual(NO_VOICE);
    expect(bau.policy.offerSmallServings).toBe(false);
    expect(reports[0].baseline.result.attendance).toBe(monday.actualAttendance);
  });

  it("waste figures reconcile with the food account", () => {
    for (const p of [0, 60, 100, 118, 125, 140, 180]) {
      for (const offer of [false, true]) {
        const r = computeRoundReport(monday, plan(p, offer, { smallPlease: true }));
        const f = r.player.result.food;
        expect(r.player.waste.surplus * 10).toBeCloseTo(f.unserved, 6);
        expect(r.player.waste.plateWaste * 10).toBeCloseTo(f.plateWaste, 6);
        expect(r.player.waste.avoidable * 10).toBeCloseTo(f.unserved + f.plateWaste, 6);
        expect(r.prevented).toBeCloseTo(r.baseline.waste.avoidable - r.player.waste.avoidable, 6);
      }
    }
  });

  it("underproduction never earns the waste stars or a success outcome", () => {
    let unfedRounds = 0;
    for (let p = 0; p <= 180; p++) {
      for (const offer of [false, true]) {
        const r = computeRoundReport(monday, plan(p, offer, { smallPlease: true, rsvp: true }));
        if (r.player.fed) continue;
        unfedRounds++;
        expect(r.stars).toEqual({ fed: false, lowWaste: false, beatBaseline: false, count: 0 });
        expect(r.evaluation.outcome).toBe("missed-target");
        expect(r.insight).toMatch(/missed lunch|still queuing/);
        // Near-zero waste from cooking too little is never presented as a win.
        expect(r.evaluation.value).toBeLessThan(computeRoundReport(monday, plan(180)).evaluation.value);
      }
    }
    expect(unfedRounds).toBeGreaterThan(100);
    // Well below demand, no serving strategy can meet the goal.
    expect(computeRoundReport(monday, plan(90, true, { smallPlease: true })).player.fed).toBe(false);
  });

  it("massive overproduction feeds everyone but earns no waste stars", () => {
    const r = computeRoundReport(monday, plan(180));
    expect(r.stars.fed).toBe(true);
    expect(r.stars.lowWaste).toBe(false);
    expect(r.stars.beatBaseline).toBe(false);
    expect(r.prevented).toBeLessThan(0);
  });

  it("a cooperative, well-sized plan earns all three stars", () => {
    const r = computeRoundReport(monday, plan(110, true, { rsvp: true, smallPlease: true }));
    expect(r.stars.count).toBe(3);
    expect(r.prevented).toBeGreaterThan(0);
    expect(r.percentLess).toBeGreaterThan(50);
  });

  it("the low-waste target sits between the best possible plan and business as usual", () => {
    const r = computeRoundReport(monday, plan(120));
    const base = r.baseline.waste.perMeal!;
    const best = r.bestPossible.waste.perMeal!;
    expect(best).toBeLessThan(base);
    expect(r.lowWasteTarget).toBeGreaterThan(best);
    expect(r.lowWasteTarget).toBeLessThan(base);
    expect(r.bestPossible.result.hotMeals).toBe(monday.actualAttendance);
  });

  it("small servings alone do not reduce total waste if the kitchen cooks the same", () => {
    const regular = computeRoundReport(monday, plan(130, false));
    const small = computeRoundReport(monday, plan(130, true, { smallPlease: true }));
    expect(small.player.waste.plateWaste).toBeLessThan(regular.player.waste.plateWaste);
    expect(small.player.waste.surplus).toBeGreaterThan(regular.player.waste.surplus);
    expect(small.player.waste.avoidable).toBeCloseTo(regular.player.waste.avoidable, 6);
  });
});

describe("service timeline", () => {
  it("ends exactly at the simulated totals and only counts down food", () => {
    for (const p of [60, 100, 118, 140]) {
      for (const offer of [false, true]) {
        const r = computeRoundReport(monday, plan(p, offer, { smallPlease: true }));
        const t = r.timeline;
        const last = t.steps[t.steps.length - 1];
        const res = r.player.result;
        expect(t.steps).toHaveLength(res.attendance);
        expect(last.served).toBe(res.hotMeals);
        expect(last.missedFood).toBe(res.missedBecauseFoodRanOut);
        expect(last.missedTime).toBe(res.missedBecauseServiceTimeEnded);
        expect(last.foodLeft).toBe(res.food.unserved);
        expect(last.plateWaste).toBe(res.food.plateWaste);
        expect(last.smallServings).toBe(res.smallServings);
        for (let i = 1; i < t.steps.length; i++) {
          expect(t.steps[i].foodLeft).toBeLessThanOrEqual(t.steps[i - 1].foodLeft);
          expect(t.steps[i].minute).toBeGreaterThanOrEqual(t.steps[i - 1].minute);
        }
        expect(t.endMinute).toBeLessThanOrEqual(t.windowMinutes);
      }
    }
  });

  it("marks where the food ran out", () => {
    const r = computeRoundReport(monday, plan(100));
    expect(r.timeline.foodRanOutAt).toBe(100);
    expect(r.timeline.steps[99].foodLeft).toBe(0);
    expect(computeRoundReport(monday, plan(140)).timeline.foodRanOutAt).toBeNull();
  });
});

describe("plan risk", () => {
  it("shows the trade-off: cooking more lowers shortage risk and raises expected waste", () => {
    const voice = { ...NO_VOICE, rsvp: true };
    let prevShort = 101;
    let prevWaste = -1;
    for (let p = 100; p <= 150; p += 5) {
      const view = planningView(monday, voice, { portionsPrepared: p, offerSmallServings: false }, NO_UPGRADES);
      const risk = planRisk(view, false);
      expect(risk.shortagePercent).toBeLessThanOrEqual(prevShort);
      expect(risk.expectedWaste).toBeGreaterThanOrEqual(prevWaste);
      prevShort = risk.shortagePercent;
      prevWaste = risk.expectedWaste;
    }
  });

  it("uses only what the kitchen knows: without feedback, plate waste is invisible", () => {
    const policy = { portionsPrepared: 125, offerSmallServings: true };
    const blind = planRisk(planningView(monday, NO_VOICE, policy, NO_UPGRADES), true);
    const informed = planRisk(planningView(monday, { ...NO_VOICE, feedback: true }, policy, NO_UPGRADES), true);
    expect(blind.plateWasteKnown).toBe(false);
    expect(informed.plateWasteKnown).toBe(true);
    expect(informed.expectedWaste).toBeGreaterThan(blind.expectedWaste);
  });

  it("RSVP narrows uncertainty, so the same quantity is less risky", () => {
    const policy = { portionsPrepared: 128, offerSmallServings: false };
    const wide = planRisk(planningView(monday, NO_VOICE, policy, NO_UPGRADES), false);
    const narrow = planRisk(planningView(monday, { ...NO_VOICE, rsvp: true }, policy, NO_UPGRADES), false);
    expect(narrow.shortagePercent).toBeLessThan(wide.shortagePercent);
  });
});

import { describe, expect, it } from "vitest";
import { BUILDING_COSTS, REWARDS } from "./config";
import { NO_VOICE } from "./planning";
import { EMPTY_LEDGER, creditAttempt, evaluateRound, type RewardLedger } from "./rewards";
import { MONDAY_STEW, getScenario, scenarioFromDiners } from "./scenarios";
import { runService } from "./simulation";
import { NO_UPGRADES, type ServiceResult } from "./types";

const monday = getScenario(MONDAY_STEW.id);

function serve(portionsPrepared: number, offerSmallServings = false, smallPlease = false) {
  return runService({
    scenario: monday,
    policy: { portionsPrepared, offerSmallServings },
    voice: { ...NO_VOICE, smallPlease },
    upgrades: NO_UPGRADES,
  });
}

describe("evaluateRound", () => {
  it("keeps every reward within its stated bounds", () => {
    for (let p = 0; p <= 250; p++) {
      for (const offer of [false, true]) {
        for (const ask of [false, true]) {
          const e = evaluateRound(serve(p, offer, ask));
          expect(e.value).toBeGreaterThanOrEqual(0);
          expect(e.value).toBeLessThanOrEqual(REWARDS.successBase + REWARDS.maxEfficiencyBonus);
          expect(e.efficiencyBonus).toBeGreaterThanOrEqual(0);
          expect(e.efficiencyBonus).toBeLessThanOrEqual(REWARDS.maxEfficiencyBonus);
          if (e.outcome !== "success") expect(e.efficiencyBonus).toBe(0);
        }
      }
    }
  });

  it("never pays an underfed service more than any successful one", () => {
    let bestFailure = 0;
    let worstSuccess = Infinity;
    for (let p = 0; p <= 250; p++) {
      for (const offer of [false, true]) {
        const e = evaluateRound(serve(p, offer, true));
        if (e.outcome === "success") worstSuccess = Math.min(worstSuccess, e.value);
        else bestFailure = Math.max(bestFailure, e.value);
      }
    }
    expect(worstSuccess).toBeLessThan(Infinity);
    expect(bestFailure).toBeLessThan(worstSuccess);
  });

  it("cooking nothing earns only the small support value", () => {
    const e = evaluateRound(serve(0));
    expect(e.outcome).toBe("missed-target");
    expect(e.value).toBe(REWARDS.missedTargetSupport);
  });

  it("massive over-cooking succeeds but earns less than a well-planned service", () => {
    const wasteful = evaluateRound(serve(250));
    expect(wasteful.outcome).toBe("success");
    let bestSuccess = 0;
    for (let p = 0; p <= 250; p++) {
      for (const offer of [false, true]) {
        const e = evaluateRound(serve(p, offer, true));
        if (e.outcome === "success") bestSuccess = Math.max(bestSuccess, e.value);
      }
    }
    expect(bestSuccess).toBeGreaterThan(wasteful.value);
  });

  it("the Monday scenario is winnable, so a failed round is always recoverable", () => {
    expect(evaluateRound(serve(monday.actualAttendance)).outcome).toBe("success");
    // One success from the starting balance always affords the first building.
    const cheapest = Math.min(...Object.values(BUILDING_COSTS));
    expect(REWARDS.startingCredits + REWARDS.successBase).toBeGreaterThanOrEqual(cheapest);
  });

  it("treats an empty service as no-diners rather than dividing by zero", () => {
    const empty = runService({
      scenario: scenarioFromDiners([]),
      policy: { portionsPrepared: 10, offerSmallServings: false },
      voice: NO_VOICE,
      upgrades: NO_UPGRADES,
    });
    const e = evaluateRound(empty);
    expect(e.outcome).toBe("no-diners");
    expect(e.value).toBe(0);
  });

  it("handles a malformed result without awarding a bonus", () => {
    const bogus = { ...serve(120), hotMealShare: 1, foodUseShare: Number.NaN } as ServiceResult;
    expect(evaluateRound(bogus).efficiencyBonus).toBe(0);
  });
});

describe("creditAttempt", () => {
  const id = MONDAY_STEW.id;

  it("pays only the improvement, so total credit equals the best performance", () => {
    let ledger: RewardLedger = EMPTY_LEDGER;
    let total = 0;
    for (const [attemptId, value] of [
      ["a1", 3],
      ["a2", 3],
      ["a3", 14],
      ["a4", 11],
      ["a5", 18],
      ["a6", 3],
    ] as const) {
      const r = creditAttempt(ledger, { scenarioId: id, attemptId, value });
      ledger = r.ledger;
      total += r.credited;
    }
    expect(total).toBe(18);
    expect(ledger.scenarios[id].bestCreditedValue).toBe(18);
  });

  it("a failure followed by a success pays the same as succeeding first time", () => {
    const failThenWin = [3, 15].reduce(
      (acc, value, i) => {
        const r = creditAttempt(acc.ledger, { scenarioId: id, attemptId: `x${i}`, value });
        return { ledger: r.ledger, total: acc.total + r.credited };
      },
      { ledger: EMPTY_LEDGER, total: 0 },
    );
    const winOnly = creditAttempt(EMPTY_LEDGER, { scenarioId: id, attemptId: "y", value: 15 });
    expect(failThenWin.total).toBe(winOnly.credited);
  });

  it("repeated failures cannot farm credits", () => {
    let ledger: RewardLedger = EMPTY_LEDGER;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const r = creditAttempt(ledger, {
        scenarioId: id,
        attemptId: `fail-${i}`,
        value: REWARDS.missedTargetSupport,
      });
      ledger = r.ledger;
      total += r.credited;
    }
    expect(total).toBe(REWARDS.missedTargetSupport);
  });

  it("never credits the same attempt twice", () => {
    const first = creditAttempt(EMPTY_LEDGER, { scenarioId: id, attemptId: "same", value: 12 });
    const again = creditAttempt(first.ledger, { scenarioId: id, attemptId: "same", value: 20 });
    expect(first.credited).toBe(12);
    expect(again.credited).toBe(0);
    expect(again.reason).toBe("duplicate-attempt");
    expect(again.ledger).toBe(first.ledger);
  });

  it("does not mutate the ledger it was given", () => {
    const before = JSON.stringify(EMPTY_LEDGER);
    creditAttempt(EMPTY_LEDGER, { scenarioId: id, attemptId: "m", value: 9 });
    expect(JSON.stringify(EMPTY_LEDGER)).toBe(before);
  });

  it("rejects invalid attempts", () => {
    for (const bad of [
      { scenarioId: "", attemptId: "a", value: 5 },
      { scenarioId: id, attemptId: "", value: 5 },
      { scenarioId: id, attemptId: "a", value: Number.NaN },
      { scenarioId: id, attemptId: "a", value: -4 },
    ]) {
      const r = creditAttempt(EMPTY_LEDGER, bad);
      expect(r.credited).toBe(0);
      expect(r.reason).toBe("invalid");
    }
  });

  it("keeps scenarios independent", () => {
    const a = creditAttempt(EMPTY_LEDGER, { scenarioId: "s1", attemptId: "a", value: 15 });
    const b = creditAttempt(a.ledger, { scenarioId: "s2", attemptId: "b", value: 12 });
    expect(b.credited).toBe(12);
  });
});

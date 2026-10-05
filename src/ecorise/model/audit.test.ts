import { describe, expect, it } from "vitest";
import {
  DEMO_BASELINE,
  DEMO_FOLLOW_UP,
  auditCompleted,
  auditOutcome,
  chooseChange,
  compareMeasurements,
  comparisonSentence,
  markChangeTested,
  measurementWarnings,
  newAuditRecord,
  recordBaseline,
  recordFollowUp,
  setCauses,
  setDiscussed,
  setFeedback,
  stepsCompleted,
  submitAudit,
  validAuditRecord,
  validMeasurement,
  verifyAuditDemo,
  wastePerMeal,
  type AuditMeasurement,
  type AuditRecord,
  type AuditResult,
} from "./audit";
import { computeRoundReport } from "./report";
import { NO_VOICE } from "./planning";
import { MONDAY_STEW, getScenario } from "./scenarios";
import { NO_UPGRADES } from "./types";

/** Measurement with `perMeal` grams per meal over 120 meals. */
const m = (meals: number, plate: number, surplus: number): AuditMeasurement => ({
  mealsServed: meals,
  plateWasteG: plate,
  surplusG: surplus,
  date: null,
  menu: null,
});
const BASE = m(120, 4800, 1200); // 50 g/meal

function unwrap(r: AuditResult): AuditRecord {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.record;
}

/** A school audit taken through steps 1–3. */
function ready(baseline = BASE): AuditRecord {
  let r = newAuditRecord("school");
  r = unwrap(recordBaseline(r, baseline));
  r = unwrap(setCauses(r, ["portions-large"]));
  r = unwrap(setDiscussed(r, true));
  return unwrap(chooseChange(r, "smaller-first"));
}

/** Submitted, verified and tested: ready for a follow-up. */
function tested(baseline = BASE): AuditRecord {
  return unwrap(markChangeTested(unwrap(verifyAuditDemo(unwrap(submitAudit(ready(baseline)))))));
}

function measured(followUp: AuditMeasurement, baseline = BASE) {
  return unwrap(recordFollowUp(tested(baseline), followUp, true));
}

describe("calculations", () => {
  it("total edible waste is plate waste plus unserved surplus", () => {
    expect(wastePerMeal(m(120, 4800, 1200)).totalG).toBe(6000);
    expect(wastePerMeal(m(10, 0, 0)).totalG).toBe(0);
  });

  it("waste per meal is total ÷ meals served", () => {
    expect(wastePerMeal(m(120, 4800, 1200)).perMealG).toBe(50);
    expect(wastePerMeal(m(3, 100, 0)).perMealG).toBeCloseTo(33.333, 3);
  });

  it("never divides by zero meals", () => {
    expect(wastePerMeal(m(0, 500, 500)).perMealG).toBeNull();
    expect(compareMeasurements(m(0, 10, 0), BASE)).toBeNull();
    expect(validMeasurement(m(0, 10, 10))).toBe(false);
  });

  it("compares follow-up − baseline and the percentage change", () => {
    const c = compareMeasurements(BASE, m(120, 3600, 1200))!; // 40 g/meal
    expect(c.differenceG).toBeCloseTo(-10, 9);
    expect(c.percentChange).toBeCloseTo(-20, 9);
    expect(c.direction).toBe("lower");
  });

  it("has no percentage when the baseline is zero", () => {
    const c = compareMeasurements(m(100, 0, 0), m(100, 500, 0))!;
    expect(c.percentChange).toBeNull();
    expect(c.direction).toBe("higher");
    expect(comparisonSentence(c)).toBe("Waste per meal was 5 g higher in the follow-up measurement.");
  });

  it("rejects impossible measurements and warns about unusual ones", () => {
    for (const bad of [m(0, 10, 10), m(12.5, 10, 10), m(100, -1, 10), m(100, 10, Number.NaN), m(100, Infinity, 0)]) {
      expect(recordBaseline(newAuditRecord("school"), bad)).toEqual({ ok: false, reason: "invalid-measurement" });
    }
    expect(validMeasurement({ ...BASE, date: "2026-02-30" })).toBe(false);
    expect(validMeasurement({ ...BASE, date: "2026-10-05", menu: "Stew" })).toBe(true);
    expect(measurementWarnings(m(100, 150_000, 0))).toHaveLength(1); // 1.5 kg per meal
    expect(measurementWarnings(m(100, 5, 0))).toHaveLength(1); // probably kilograms
    expect(measurementWarnings(m(100, 0, 0))).toHaveLength(1); // nothing weighed
    expect(measurementWarnings(BASE)).toEqual([]);
  });
});

describe("manual cases", () => {
  it("A: no improvement is not celebrated", () => {
    const o = auditOutcome(measured(m(120, 5040, 1200))); // 52 g/meal
    expect(o.kind).toBe("measured");
    if (o.kind !== "measured") return;
    expect(o.comparison.direction).toBe("higher");
    expect(comparisonSentence(o.comparison)).toBe("Waste per meal was 4% higher in the follow-up measurement.");
  });

  it("B: improvement is described, not attributed to the change", () => {
    const o = auditOutcome(measured(m(120, 3600, 1200))); // 40 g/meal
    if (o.kind !== "measured") throw new Error("not measured");
    const text = comparisonSentence(o.comparison);
    expect(text).toBe("Waste per meal was 20% lower in the follow-up measurement.");
    expect(text).not.toMatch(/caus|because|reduced by/i);
  });

  it("C: the same result is 'no change measured'", () => {
    const o = auditOutcome(measured(m(100, 4000, 1000))); // 50 g/meal
    if (o.kind !== "measured") throw new Error("not measured");
    expect(o.comparison.direction).toBe("same");
    expect(comparisonSentence(o.comparison)).toBe("No change measured.");
  });

  it("D: a missing follow-up makes no outcome claim", () => {
    const r = tested();
    expect(auditCompleted(r)).toBe(true);
    const o = auditOutcome(r);
    expect(o.kind).toBe("follow-up-not-measured");
    expect(o).not.toHaveProperty("comparison");
  });
});

describe("mission states", () => {
  it("moves proposed → submitted → verified → measured in order", () => {
    let r = ready();
    expect(r.status).toBe("proposed");
    r = unwrap(submitAudit(r));
    expect(r.status).toBe("submitted");
    r = unwrap(verifyAuditDemo(r));
    expect(r.status).toBe("verified");
    r = unwrap(markChangeTested(r));
    r = unwrap(recordFollowUp(r, m(120, 3600, 1200), true));
    expect(r.status).toBe("measured");
    expect(stepsCompleted(r)).toBe(5);
  });

  it("rejects impossible transitions", () => {
    const fresh = newAuditRecord("school");
    expect(submitAudit(fresh)).toEqual({ ok: false, reason: "incomplete" });
    expect(verifyAuditDemo(fresh)).toEqual({ ok: false, reason: "wrong-status" });
    expect(verifyAuditDemo(ready())).toEqual({ ok: false, reason: "wrong-status" });
    expect(markChangeTested(ready())).toEqual({ ok: false, reason: "wrong-status" });
    expect(recordFollowUp(ready(), BASE, true)).toEqual({ ok: false, reason: "wrong-status" });
    const submitted = unwrap(submitAudit(ready()));
    expect(submitAudit(submitted)).toEqual({ ok: false, reason: "wrong-status" });
    expect(markChangeTested(submitted)).toEqual({ ok: false, reason: "wrong-status" });
    // Steps 1–3 are frozen once submitted.
    expect(recordBaseline(submitted, BASE).ok).toBe(false);
    expect(setCauses(submitted, ["timing"]).ok).toBe(false);
    expect(chooseChange(submitted, "rsvp").ok).toBe(false);
    const verified = unwrap(verifyAuditDemo(submitted));
    expect(verifyAuditDemo(verified)).toEqual({ ok: false, reason: "wrong-status" });
    expect(recordFollowUp(verified, BASE, true)).toEqual({ ok: false, reason: "not-tested" });
    const t = unwrap(markChangeTested(verified));
    expect(recordFollowUp(t, BASE, false)).toEqual({ ok: false, reason: "method-not-confirmed" });
    const done = unwrap(recordFollowUp(t, BASE, true));
    expect(recordFollowUp(done, BASE, true)).toEqual({ ok: false, reason: "wrong-status" });
  });

  it("a baseline is required before anything can be submitted or followed up", () => {
    let r = newAuditRecord("school");
    r = unwrap(setCauses(r, ["unsure"]));
    r = unwrap(setDiscussed(r, true));
    r = unwrap(chooseChange(r, "rsvp"));
    expect(submitAudit(r)).toEqual({ ok: false, reason: "incomplete" });
    expect(validAuditRecord({ ...r, status: "verified", changeTested: true }, "school")).toBe(false);
  });

  it("one intervention at a time: choosing another replaces it", () => {
    let r = ready();
    r = unwrap(chooseChange(r, "rsvp"));
    r = unwrap(chooseChange(r, "prep-quantity"));
    expect(r.change).toBe("prep-quantity");
  });

  it("stores the baseline and follow-up separately", () => {
    const after = { ...m(110, 3000, 900), date: "2026-11-02", menu: "Pasta" };
    const r = measured(after);
    expect(r.baseline).toEqual(BASE);
    expect(r.followUp).toEqual(after);
  });

  it("feedback is optional, anonymous counts only", () => {
    const r = ready();
    expect(r.feedback).toBeNull();
    const withTally = unwrap(setFeedback(r, { portion: 4, disliked: 2, full: 0, time: 1, other: 0 }));
    expect(withTally.feedback!.portion).toBe(4);
    expect(setFeedback(r, { portion: -1, disliked: 0, full: 0, time: 0, other: 0 })).toEqual({ ok: false, reason: "invalid-feedback" });
    expect(setFeedback(r, { portion: 1, disliked: 0, full: 0, time: 0, other: 0, name: 3 } as never).ok).toBe(false);
  });
});

describe("data honesty", () => {
  it("completing the audit does not imply less waste", () => {
    const verified = unwrap(verifyAuditDemo(unwrap(submitAudit(ready()))));
    expect(auditCompleted(verified)).toBe(true);
    expect(auditOutcome(verified).kind).toBe("follow-up-not-measured");
    expect(auditOutcome(unwrap(submitAudit(ready()))).kind).toBe("in-progress");
  });

  it("user-entered data is never verified automatically", () => {
    for (const r of [newAuditRecord("school"), ready(), unwrap(submitAudit(ready()))]) {
      expect(r.status === "verified" || r.status === "measured").toBe(false);
    }
  });

  it("demo data is always labelled demo and uses only the demo numbers", () => {
    const d = newAuditRecord("demo");
    expect(d.source).toBe("demo");
    expect(d.baseline).toEqual(DEMO_BASELINE);
    expect(wastePerMeal(DEMO_BASELINE).perMealG).toBe(50);
    expect(recordBaseline(d, BASE)).toEqual({ ok: false, reason: "demo-is-fixed" });
    const t = unwrap(markChangeTested(unwrap(verifyAuditDemo(unwrap(submitAudit(d))))));
    expect(recordFollowUp(t, m(118, 1, 1), true)).toEqual({ ok: false, reason: "demo-is-fixed" });
    const done = unwrap(recordFollowUp(t, DEMO_FOLLOW_UP, true));
    expect(done.source).toBe("demo");
    expect(validAuditRecord(done, "demo")).toBe(true);
    // A demo record can never be stored as a school record, or carry other numbers.
    expect(validAuditRecord(done, "school")).toBe(false);
    expect(validAuditRecord({ ...d, baseline: BASE }, "demo")).toBe(false);
    expect(validAuditRecord(ready(), "demo")).toBe(false);
  });

  it("simulated lunch results cannot be stored as school measurements", () => {
    const report = computeRoundReport(getScenario(MONDAY_STEW.id), {
      voice: NO_VOICE,
      policy: { portionsPrepared: 130, offerSmallServings: false },
      upgrades: NO_UPGRADES,
    });
    expect(validMeasurement(report.player.result)).toBe(false);
    expect(validMeasurement(report.player.waste)).toBe(false);
    expect(recordBaseline(newAuditRecord("school"), report.player.result as never).ok).toBe(false);
  });

  it("stored records must be internally consistent", () => {
    expect(validAuditRecord(ready(), "school")).toBe(true);
    expect(validAuditRecord({ ...ready(), status: "measured" }, "school")).toBe(false);
    expect(validAuditRecord({ ...ready(), followUp: BASE }, "school")).toBe(false);
    expect(validAuditRecord({ ...ready(), changeTested: true }, "school")).toBe(false);
    expect(validAuditRecord({ ...measured(BASE), changeTested: false }, "school")).toBe(false);
    expect(validAuditRecord({ ...ready(), causes: ["made-up"] }, "school")).toBe(false);
  });
});

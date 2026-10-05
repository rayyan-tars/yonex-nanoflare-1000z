import { describe, expect, it } from "vitest";
import {
  SAMPLE_BASELINE,
  SAMPLE_FOLLOW_UP,
  auditCompleted,
  auditOutcome,
  chooseChange,
  newAuditRecord,
  recordBaseline,
  recordFollowUp,
  setCauses,
  setDiscussed,
  submitAudit,
  validAuditRecord,
  verifyAuditDemo,
  wastePerMeal,
  type AuditMeasurement,
  type AuditRecord,
  type AuditResult,
} from "./audit";

const BASE: AuditMeasurement = { mealsServed: 200, plateWasteG: 6000, surplusG: 4000 };
const AFTER: AuditMeasurement = { mealsServed: 190, plateWasteG: 3800, surplusG: 2000 };

function unwrap(r: AuditResult): AuditRecord {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.record;
}

/** A school audit taken through steps 1–4. */
function ready(): AuditRecord {
  let r = newAuditRecord("school");
  r = unwrap(recordBaseline(r, BASE));
  r = unwrap(setCauses(r, ["portions"]));
  r = unwrap(setDiscussed(r, true));
  return unwrap(chooseChange(r, "smaller-first"));
}

describe("waste per meal", () => {
  it("is (plate waste + surplus) ÷ meals served", () => {
    expect(wastePerMeal(BASE)).toEqual({ totalG: 10000, mealsServed: 200, perMealG: 50 });
    expect(wastePerMeal({ mealsServed: 3, plateWasteG: 100, surplusG: 0 }).perMealG).toBeCloseTo(33.333, 3);
    expect(wastePerMeal({ mealsServed: 120, plateWasteG: 0, surplusG: 0 }).perMealG).toBe(0);
  });

  it("rejects impossible measurements", () => {
    const r = newAuditRecord("school");
    for (const bad of [
      { mealsServed: 0, plateWasteG: 10, surplusG: 10 },
      { mealsServed: 12.5, plateWasteG: 10, surplusG: 10 },
      { mealsServed: 100, plateWasteG: -1, surplusG: 10 },
      { mealsServed: 100, plateWasteG: 10, surplusG: Number.NaN },
      { mealsServed: 100, plateWasteG: Infinity, surplusG: 0 },
    ]) {
      expect(recordBaseline(r, bad)).toEqual({ ok: false, reason: "invalid-measurement" });
    }
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
    r = unwrap(recordFollowUp(r, AFTER, true));
    expect(r.status).toBe("measured");
  });

  it("rejects impossible transitions", () => {
    const fresh = newAuditRecord("school");
    expect(submitAudit(fresh)).toEqual({ ok: false, reason: "incomplete" });
    expect(verifyAuditDemo(fresh)).toEqual({ ok: false, reason: "wrong-status" });
    expect(verifyAuditDemo(ready())).toEqual({ ok: false, reason: "wrong-status" });
    expect(recordFollowUp(ready(), AFTER, true)).toEqual({ ok: false, reason: "wrong-status" });
    const submitted = unwrap(submitAudit(ready()));
    expect(submitAudit(submitted)).toEqual({ ok: false, reason: "wrong-status" });
    expect(recordFollowUp(submitted, AFTER, true)).toEqual({ ok: false, reason: "wrong-status" });
    // Steps 1–4 are frozen once submitted.
    expect(recordBaseline(submitted, AFTER).ok).toBe(false);
    expect(setCauses(submitted, ["unpopular"]).ok).toBe(false);
    expect(chooseChange(submitted, "rsvp").ok).toBe(false);
    const verified = unwrap(verifyAuditDemo(submitted));
    expect(verifyAuditDemo(verified)).toEqual({ ok: false, reason: "wrong-status" });
    expect(recordFollowUp(verified, AFTER, false)).toEqual({ ok: false, reason: "method-not-confirmed" });
    const measured = unwrap(recordFollowUp(verified, AFTER, true));
    expect(recordFollowUp(measured, BASE, true)).toEqual({ ok: false, reason: "wrong-status" });
  });

  it("each of steps 1–4 is required before submitting", () => {
    let r = newAuditRecord("school");
    r = unwrap(recordBaseline(r, BASE));
    expect(submitAudit(r).ok).toBe(false);
    r = unwrap(setCauses(r, ["attendance"]));
    expect(submitAudit(r).ok).toBe(false);
    r = unwrap(setDiscussed(r, true));
    expect(submitAudit(r).ok).toBe(false);
    r = unwrap(chooseChange(r, "rsvp"));
    expect(submitAudit(r).ok).toBe(true);
  });

  it("stores the baseline and follow-up separately", () => {
    let r = unwrap(verifyAuditDemo(unwrap(submitAudit(ready()))));
    r = unwrap(recordFollowUp(r, AFTER, true));
    expect(r.baseline).toEqual(BASE);
    expect(r.followUp).toEqual(AFTER);
    expect(r.baseline).not.toBe(r.followUp);
  });
});

describe("completion is not impact", () => {
  it("a verified audit without a follow-up claims completion only", () => {
    const r = unwrap(verifyAuditDemo(unwrap(submitAudit(ready()))));
    expect(auditCompleted(r)).toBe(true);
    const o = auditOutcome(r);
    expect(o.kind).toBe("audit-completed");
    expect(o).not.toHaveProperty("direction");
    expect(o).not.toHaveProperty("changeG");
  });

  it("before submission or verification there is no outcome at all", () => {
    expect(auditOutcome(ready()).kind).toBe("in-progress");
    expect(auditOutcome(unwrap(submitAudit(ready()))).kind).toBe("in-progress");
    expect(auditCompleted(unwrap(submitAudit(ready())))).toBe(false);
  });

  it("a reduction is reported only when the follow-up is actually lower", () => {
    const verified = unwrap(verifyAuditDemo(unwrap(submitAudit(ready()))));
    const lower = auditOutcome(unwrap(recordFollowUp(verified, AFTER, true)));
    expect(lower.kind === "measured" && lower.direction).toBe("lower");
    if (lower.kind === "measured") {
      expect(lower.baseline.perMealG).toBe(50);
      expect(lower.followUp.perMealG).toBeCloseTo(5800 / 190, 9);
      expect(lower.changePercent).toBeCloseTo(((5800 / 190 - 50) / 50) * 100, 9);
    }
    const higher = auditOutcome(unwrap(recordFollowUp(verified, { mealsServed: 200, plateWasteG: 8000, surplusG: 4000 }, true)));
    expect(higher.kind === "measured" && higher.direction).toBe("higher");
    const same = auditOutcome(unwrap(recordFollowUp(verified, { mealsServed: 400, plateWasteG: 12000, surplusG: 8000 }, true)));
    expect(same.kind === "measured" && same.direction).toBe("same");
  });
});

describe("sample records", () => {
  it("are always labelled sample and carry only the sample numbers", () => {
    const s = newAuditRecord("sample");
    expect(s.source).toBe("sample");
    expect(s.baseline).toEqual(SAMPLE_BASELINE);
    // Sample numbers cannot be swapped for other numbers.
    expect(recordBaseline(s, BASE)).toEqual({ ok: false, reason: "sample-is-fixed" });
    const verified = unwrap(verifyAuditDemo(unwrap(submitAudit(s))));
    expect(recordFollowUp(verified, AFTER, true)).toEqual({ ok: false, reason: "sample-is-fixed" });
    const measured = unwrap(recordFollowUp(verified, SAMPLE_FOLLOW_UP, true));
    expect(measured.source).toBe("sample");
    expect(validAuditRecord(measured, "sample")).toBe(true);
  });

  it("a stored record can never change source", () => {
    const sample = newAuditRecord("sample");
    expect(validAuditRecord(sample, "school")).toBe(false);
    expect(validAuditRecord(ready(), "sample")).toBe(false);
    // A "sample" with school numbers in it is rejected.
    expect(validAuditRecord({ ...sample, baseline: BASE }, "sample")).toBe(false);
  });

  it("stored records must be internally consistent", () => {
    expect(validAuditRecord(ready(), "school")).toBe(true);
    // Measured without a follow-up, or a follow-up before measurement.
    expect(validAuditRecord({ ...ready(), status: "measured" }, "school")).toBe(false);
    expect(validAuditRecord({ ...ready(), followUp: AFTER }, "school")).toBe(false);
    // Submitted with steps missing.
    expect(validAuditRecord({ ...newAuditRecord("school"), status: "verified" }, "school")).toBe(false);
    expect(validAuditRecord({ ...ready(), causes: ["made-up"] }, "school")).toBe(false);
  });
});

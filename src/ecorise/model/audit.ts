/**
 * Cafeteria Waste Audit: the one real-world mission.
 *
 * Everything here describes measurements taken at a real school (or a
 * clearly labelled sample). It never reads from or writes to the lunch
 * simulation, so simulated results and school measurements cannot mix.
 */

/** Where a record's numbers come from. Fixed when the record is created. */
export type AuditSource = "school" | "sample";

/**
 * Proposed → Submitted → Verified as completed → Outcome measured.
 * "verified" means the audit was done; it says nothing about waste going down.
 */
export type MissionStatus = "proposed" | "submitted" | "verified" | "measured";

/** One collective measurement of a lunch service. Grams, never per student. */
export interface AuditMeasurement {
  mealsServed: number;
  plateWasteG: number;
  surplusG: number;
}

export const AUDIT_CAUSES = ["portions", "attendance", "unpopular", "unsure"] as const;
export type AuditCause = (typeof AUDIT_CAUSES)[number];

export const AUDIT_CHANGES = ["rsvp", "smaller-first", "attendance-planning", "feedback"] as const;
export type AuditChange = (typeof AUDIT_CHANGES)[number];

export interface AuditRecord {
  source: AuditSource;
  status: MissionStatus;
  /** Step 1. */
  baseline: AuditMeasurement | null;
  /** Step 2: likely causes, chosen as a group. */
  causes: AuditCause[];
  /** Step 3: findings shared with cafeteria staff or a supervising teacher. */
  discussed: boolean;
  /** Step 4: the one change to test. */
  change: AuditChange | null;
  /** Step 5: kept apart from the baseline; only set once the audit is verified. */
  followUp: AuditMeasurement | null;
}

export const MEASUREMENT_LIMITS = { maxMeals: 10_000, maxGrams: 1_000_000 } as const;

export function validMeasurement(m: unknown): m is AuditMeasurement {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  const grams = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MEASUREMENT_LIMITS.maxGrams;
  return (
    typeof r.mealsServed === "number" &&
    Number.isInteger(r.mealsServed) &&
    r.mealsServed >= 1 &&
    r.mealsServed <= MEASUREMENT_LIMITS.maxMeals &&
    grams(r.plateWasteG) &&
    grams(r.surplusG)
  );
}

export interface WastePerMeal {
  totalG: number;
  mealsServed: number;
  /** Edible waste per meal served, in grams. */
  perMealG: number;
}

/** (edible plate waste + unserved surplus) ÷ meals served. */
export function wastePerMeal(m: AuditMeasurement): WastePerMeal {
  const totalG = m.plateWasteG + m.surplusG;
  return { totalG, mealsServed: m.mealsServed, perMealG: totalG / m.mealsServed };
}

export function newAuditRecord(source: AuditSource): AuditRecord {
  if (source === "sample") return sampleRecord();
  return { source, status: "proposed", baseline: null, causes: [], discussed: false, change: null, followUp: null };
}

/**
 * Invented numbers for showing the workflow. Never real school data:
 * the record is labelled sample everywhere it appears.
 */
export const SAMPLE_BASELINE: AuditMeasurement = { mealsServed: 240, plateWasteG: 9600, surplusG: 7200 };
export const SAMPLE_FOLLOW_UP: AuditMeasurement = { mealsServed: 236, plateWasteG: 6800, surplusG: 4500 };

function sameMeasurement(a: AuditMeasurement | null, b: AuditMeasurement) {
  return !!a && a.mealsServed === b.mealsServed && a.plateWasteG === b.plateWasteG && a.surplusG === b.surplusG;
}

function sampleRecord(): AuditRecord {
  return {
    source: "sample",
    status: "proposed",
    baseline: { ...SAMPLE_BASELINE },
    causes: ["portions", "attendance"],
    discussed: true,
    change: "smaller-first",
    followUp: null,
  };
}

export type AuditRefusal =
  | "wrong-status"
  | "invalid-measurement"
  | "sample-is-fixed"
  | "incomplete"
  | "method-not-confirmed";

export type AuditResult = { ok: true; record: AuditRecord } | { ok: false; reason: AuditRefusal };

const ok = (record: AuditRecord): AuditResult => ({ ok: true, record });
const no = (reason: AuditRefusal): AuditResult => ({ ok: false, reason });

/** Steps 1–4 can only be edited before the audit is submitted. */
function editable(r: AuditRecord): AuditRefusal | null {
  if (r.status !== "proposed") return "wrong-status";
  if (r.source === "sample") return "sample-is-fixed";
  return null;
}

export function recordBaseline(r: AuditRecord, m: AuditMeasurement): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  if (!validMeasurement(m)) return no("invalid-measurement");
  return ok({ ...r, baseline: { ...m } });
}

export function setCauses(r: AuditRecord, causes: readonly AuditCause[]): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  const unique = AUDIT_CAUSES.filter((c) => causes.includes(c));
  return ok({ ...r, causes: unique });
}

export function setDiscussed(r: AuditRecord, discussed: boolean): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  return ok({ ...r, discussed });
}

export function chooseChange(r: AuditRecord, change: AuditChange | null): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  if (change !== null && !AUDIT_CHANGES.includes(change)) return no("incomplete");
  return ok({ ...r, change });
}

/** Which of steps 1–4 are done (the audit can be submitted when all are). */
export function stepsDone(r: AuditRecord) {
  return {
    measure: r.baseline !== null,
    understand: r.causes.length > 0,
    discuss: r.discussed,
    change: r.change !== null,
  };
}

export function readyToSubmit(r: AuditRecord): boolean {
  const s = stepsDone(r);
  return r.status === "proposed" && s.measure && s.understand && s.discuss && s.change;
}

export function submitAudit(r: AuditRecord): AuditResult {
  if (r.status !== "proposed") return no("wrong-status");
  if (!readyToSubmit(r)) return no("incomplete");
  return ok({ ...r, status: "submitted" });
}

/**
 * Demo staff verification. There is no backend: a production version would
 * need authenticated staff approval, and the UI says so.
 */
export function verifyAuditDemo(r: AuditRecord): AuditResult {
  if (r.status !== "submitted") return no("wrong-status");
  return ok({ ...r, status: "verified" });
}

/** Step 5. Only after verification, and only measured the same way. */
export function recordFollowUp(r: AuditRecord, m: AuditMeasurement, sameMethod: boolean): AuditResult {
  if (r.status !== "verified") return no("wrong-status");
  if (!sameMethod) return no("method-not-confirmed");
  if (!validMeasurement(m)) return no("invalid-measurement");
  if (r.source === "sample" && !sameMeasurement(m, SAMPLE_FOLLOW_UP)) return no("sample-is-fixed");
  return ok({ ...r, status: "measured", followUp: { ...m } });
}

export type AuditOutcome =
  | { kind: "in-progress" }
  /** Done and verified, but nothing measured afterwards: no impact claim. */
  | { kind: "audit-completed"; baseline: WastePerMeal }
  | {
      kind: "measured";
      baseline: WastePerMeal;
      followUp: WastePerMeal;
      /** Follow-up minus baseline, grams per meal (negative = less waste). */
      changeG: number;
      changePercent: number;
      direction: "lower" | "higher" | "same";
    };

/**
 * What the record can honestly claim. A reduction is only reported when
 * real before and after numbers exist and the after number is lower.
 */
export function auditOutcome(r: AuditRecord): AuditOutcome {
  if ((r.status === "verified" || r.status === "measured") && r.baseline) {
    const baseline = wastePerMeal(r.baseline);
    if (r.status === "verified" || !r.followUp) return { kind: "audit-completed", baseline };
    const followUp = wastePerMeal(r.followUp);
    const changeG = followUp.perMealG - baseline.perMealG;
    const changePercent = baseline.perMealG > 0 ? (changeG / baseline.perMealG) * 100 : 0;
    // Differences under half a gram per meal are reported as no change.
    const direction = Math.abs(changeG) < 0.5 ? "same" : changeG < 0 ? "lower" : "higher";
    return { kind: "measured", baseline, followUp, changeG, changePercent, direction };
  }
  return { kind: "in-progress" };
}

/** True once the audit itself is done (verified), regardless of outcome. */
export function auditCompleted(r: AuditRecord | null): boolean {
  return !!r && (r.status === "verified" || r.status === "measured");
}

const STATUSES: readonly MissionStatus[] = ["proposed", "submitted", "verified", "measured"];

/** Structural and logical checks for a stored record. */
export function validAuditRecord(raw: unknown, source: AuditSource): raw is AuditRecord {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.source !== source) return false;
  if (!STATUSES.includes(r.status as MissionStatus)) return false;
  if (r.baseline !== null && !validMeasurement(r.baseline)) return false;
  if (r.followUp !== null && !validMeasurement(r.followUp)) return false;
  if (!Array.isArray(r.causes) || !r.causes.every((c) => AUDIT_CAUSES.includes(c))) return false;
  if (typeof r.discussed !== "boolean") return false;
  if (r.change !== null && !AUDIT_CHANGES.includes(r.change as AuditChange)) return false;
  const rec = r as unknown as AuditRecord;
  // Past "proposed", steps 1–4 must be complete.
  if (rec.status !== "proposed" && !readyToSubmit({ ...rec, status: "proposed" })) return false;
  // A follow-up exists exactly when the outcome was measured.
  if ((rec.status === "measured") !== (rec.followUp !== null)) return false;
  // Sample records always carry the sample numbers.
  if (source === "sample") {
    if (!sameMeasurement(rec.baseline, SAMPLE_BASELINE)) return false;
    if (rec.followUp && !sameMeasurement(rec.followUp, SAMPLE_FOLLOW_UP)) return false;
  }
  return true;
}

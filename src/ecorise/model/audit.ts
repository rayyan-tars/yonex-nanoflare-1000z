/**
 * Cafeteria Waste Audit: the one real-world mission.
 *
 * Everything here describes measurements taken at a real school (or a
 * clearly labelled demo record). It never reads from or writes to the lunch
 * simulation, and uses its own shapes, so simulated lunch results and school
 * measurements cannot be mixed up.
 */

/** Where a record's numbers come from. Fixed when the record is created. */
export type AuditSource = "school" | "demo";

/**
 * Proposed → Submitted → Verified as completed → Outcome measured.
 * "verified" means the audit was done; it says nothing about waste going down.
 */
export type MissionStatus = "proposed" | "submitted" | "verified" | "measured";

/** One collective measurement of one lunch service. Grams, never per student. */
export interface AuditMeasurement {
  mealsServed: number;
  /** Edible food left on plates, grams. */
  plateWasteG: number;
  /** Edible food cooked but never served, grams. */
  surplusG: number;
  /** Optional, YYYY-MM-DD. */
  date: string | null;
  /** Optional menu or meal name. */
  menu: string | null;
}

/** Possible causes. Observations to investigate, never confirmed causes. */
export const AUDIT_CAUSES = [
  "attendance-lower",
  "portions-large",
  "disliked",
  "too-much-prepared",
  "little-choice",
  "timing",
  "unsure",
] as const;
export type AuditCause = (typeof AUDIT_CAUSES)[number];

/** Optional anonymous tally of why students left food. Counts only. */
export const FEEDBACK_REASONS = ["portion", "disliked", "full", "time", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];
export type FeedbackTally = Record<FeedbackReason, number>;

/** The one change to test. */
export const AUDIT_CHANGES = ["rsvp", "smaller-first", "feedback", "prep-quantity", "menu-communication"] as const;
export type AuditChange = (typeof AUDIT_CHANGES)[number];

export interface AuditRecord {
  source: AuditSource;
  status: MissionStatus;
  /** Step 1. */
  baseline: AuditMeasurement | null;
  /** Step 2: possible causes, chosen as a group. */
  causes: AuditCause[];
  /** Step 2 (optional): anonymous feedback counts. */
  feedback: FeedbackTally | null;
  /** Step 3: findings discussed with staff, and one realistic change chosen. */
  discussed: boolean;
  change: AuditChange | null;
  /** Step 4: the change has been tried at a later lunch (after verification). */
  changeTested: boolean;
  /** Step 5: kept apart from the baseline. */
  followUp: AuditMeasurement | null;
}

/** Hard limits: anything outside is refused. */
export const MEASUREMENT_LIMITS = { maxMeals: 10_000, maxGrams: 1_000_000, maxMenu: 60, maxFeedback: 10_000 } as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

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
    grams(r.surplusG) &&
    validDate(r.date) &&
    (r.menu === null || (typeof r.menu === "string" && r.menu.trim().length > 0 && r.menu.length <= MEASUREMENT_LIMITS.maxMenu))
  );
}

export interface WastePerMeal {
  /** Plate waste + unserved surplus, grams. */
  totalG: number;
  mealsServed: number;
  /** Edible waste per meal served, grams; null when no meals were served. */
  perMealG: number | null;
}

/** Total edible waste = plate waste + unserved surplus; per meal = total ÷ meals served. */
export function wastePerMeal(m: Pick<AuditMeasurement, "mealsServed" | "plateWasteG" | "surplusG">): WastePerMeal {
  const totalG = m.plateWasteG + m.surplusG;
  return { totalG, mealsServed: m.mealsServed, perMealG: m.mealsServed > 0 ? totalG / m.mealsServed : null };
}

export interface Comparison {
  baselinePerMealG: number;
  followUpPerMealG: number;
  /** Follow-up − baseline, g/meal (negative = less waste). */
  differenceG: number;
  /** ((follow-up − baseline) ÷ baseline) × 100; null when the baseline is 0. */
  percentChange: number | null;
  direction: "lower" | "higher" | "same";
}

/** Compares two measurements per meal served. Null if either has no meals. */
export function compareMeasurements(baseline: AuditMeasurement, followUp: AuditMeasurement): Comparison | null {
  const b = wastePerMeal(baseline).perMealG;
  const f = wastePerMeal(followUp).perMealG;
  if (b === null || f === null) return null;
  const differenceG = f - b;
  // Values are shown to 0.1 g, so anything that rounds to 0.0 g is "no change".
  const shown = Math.round(differenceG * 10) / 10;
  const direction = shown === 0 ? "same" : shown < 0 ? "lower" : "higher";
  return {
    baselinePerMealG: b,
    followUpPerMealG: f,
    differenceG,
    percentChange: b > 0 ? (differenceG / b) * 100 : null,
    direction,
  };
}

/** Grams with at most one decimal: "50 g", "47.9 g". */
export function formatGrams(g: number): string {
  const r = Math.round(g * 10) / 10;
  return `${r.toLocaleString("en-GB", { maximumFractionDigits: 1 })} g`;
}

/** The headline for a comparison. Describes the measurement, never a cause. */
export function comparisonSentence(c: Comparison): string {
  if (c.direction === "same") return "No change measured.";
  const word = c.direction === "lower" ? "lower" : "higher";
  if (c.percentChange === null) {
    return `Waste per meal was ${formatGrams(Math.abs(c.differenceG))} ${word} in the follow-up measurement.`;
  }
  const pct = Math.round(Math.abs(c.percentChange));
  const amount = pct === 0 ? "less than 1%" : `${pct}%`;
  return `Waste per meal was ${amount} ${word} in the follow-up measurement.`;
}

/**
 * Friendly warnings for numbers that are possible but unusual. They never
 * block saving; they ask the player to double-check.
 */
export function measurementWarnings(m: Pick<AuditMeasurement, "mealsServed" | "plateWasteG" | "surplusG">): string[] {
  const out: string[] = [];
  const w = wastePerMeal(m);
  if (w.perMealG !== null && w.perMealG > 1000) out.push("That's over 1 kg of waste per meal. Are the weights in grams?");
  if (w.perMealG !== null && w.totalG > 0 && w.perMealG < 1) out.push("Under 1 g per meal. Check the weights are grams, not kilograms.");
  if (w.totalG === 0) out.push("No waste recorded at all. Were both bins weighed?");
  if (m.mealsServed > 3000) out.push("Over 3,000 meals. Check this is one lunch service.");
  return out;
}

export const EMPTY_FEEDBACK: FeedbackTally = { portion: 0, disliked: 0, full: 0, time: 0, other: 0 };

export function validFeedback(v: unknown): v is FeedbackTally {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    Object.keys(r).length === FEEDBACK_REASONS.length &&
    FEEDBACK_REASONS.every((k) => {
      const n = r[k];
      return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MEASUREMENT_LIMITS.maxFeedback;
    })
  );
}

export function newAuditRecord(source: AuditSource): AuditRecord {
  if (source === "demo") return demoRecord();
  return {
    source,
    status: "proposed",
    baseline: null,
    causes: [],
    feedback: null,
    discussed: false,
    change: null,
    changeTested: false,
    followUp: null,
  };
}

/**
 * Demonstration values only. Never measured at any school: the record is
 * labelled DEMO DATA wherever it appears and its numbers cannot be edited.
 */
export const DEMO_BASELINE: AuditMeasurement = { mealsServed: 120, plateWasteG: 4800, surplusG: 1200, date: null, menu: "Demo lunch" };
export const DEMO_FOLLOW_UP: AuditMeasurement = { mealsServed: 118, plateWasteG: 3600, surplusG: 1120, date: null, menu: "Demo lunch" };

function sameNumbers(a: AuditMeasurement | null, b: AuditMeasurement) {
  return (
    !!a &&
    a.mealsServed === b.mealsServed &&
    a.plateWasteG === b.plateWasteG &&
    a.surplusG === b.surplusG &&
    a.date === b.date &&
    a.menu === b.menu
  );
}

function demoRecord(): AuditRecord {
  return {
    source: "demo",
    status: "proposed",
    baseline: { ...DEMO_BASELINE },
    causes: ["portions-large", "too-much-prepared"],
    feedback: { portion: 14, disliked: 6, full: 9, time: 3, other: 2 },
    discussed: true,
    change: "smaller-first",
    changeTested: false,
    followUp: null,
  };
}

export type AuditRefusal =
  | "wrong-status"
  | "invalid-measurement"
  | "invalid-feedback"
  | "demo-is-fixed"
  | "incomplete"
  | "not-tested"
  | "method-not-confirmed";

export type AuditResult = { ok: true; record: AuditRecord } | { ok: false; reason: AuditRefusal };

const ok = (record: AuditRecord): AuditResult => ({ ok: true, record });
const no = (reason: AuditRefusal): AuditResult => ({ ok: false, reason });

/** Steps 1–3 can only be edited before the audit is submitted, and never on demo data. */
function editable(r: AuditRecord): AuditRefusal | null {
  if (r.status !== "proposed") return "wrong-status";
  if (r.source === "demo") return "demo-is-fixed";
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
  return ok({ ...r, causes: AUDIT_CAUSES.filter((c) => causes.includes(c)) });
}

export function setFeedback(r: AuditRecord, feedback: FeedbackTally | null): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  if (feedback !== null && !validFeedback(feedback)) return no("invalid-feedback");
  return ok({ ...r, feedback: feedback ? { ...feedback } : null });
}

export function setDiscussed(r: AuditRecord, discussed: boolean): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  return ok({ ...r, discussed });
}

/** Exactly one change at a time: choosing a new one replaces the old. */
export function chooseChange(r: AuditRecord, change: AuditChange | null): AuditResult {
  const refusal = editable(r);
  if (refusal) return no(refusal);
  if (change !== null && !AUDIT_CHANGES.includes(change)) return no("incomplete");
  return ok({ ...r, change });
}

/** Which steps are done. */
export function stepsDone(r: AuditRecord) {
  return {
    measure: r.baseline !== null,
    understand: r.causes.length > 0,
    discuss: r.discussed && r.change !== null,
    test: r.changeTested,
    remeasure: r.followUp !== null,
  };
}

/** Steps 1–3 complete and not yet submitted. */
export function readyToSubmit(r: AuditRecord): boolean {
  const s = stepsDone(r);
  return r.status === "proposed" && s.measure && s.understand && s.discuss;
}

export function submitAudit(r: AuditRecord): AuditResult {
  if (r.status !== "proposed") return no("wrong-status");
  if (!readyToSubmit(r)) return no("incomplete");
  return ok({ ...r, status: "submitted" });
}

/**
 * Demo staff verification. There is no backend: a production version would
 * need authenticated staff accounts, and the interface says so.
 */
export function verifyAuditDemo(r: AuditRecord): AuditResult {
  if (r.status !== "submitted") return no("wrong-status");
  return ok({ ...r, status: "verified" });
}

/** Step 4: the chosen change has been tried at a later lunch. */
export function markChangeTested(r: AuditRecord): AuditResult {
  if (r.status !== "verified") return no("wrong-status");
  return ok({ ...r, changeTested: true });
}

/** Step 5. Needs a baseline, a verified audit and a tested change, measured the same way. */
export function recordFollowUp(r: AuditRecord, m: AuditMeasurement, sameMethod: boolean): AuditResult {
  if (r.status !== "verified" || !r.baseline) return no("wrong-status");
  if (!r.changeTested) return no("not-tested");
  if (!sameMethod) return no("method-not-confirmed");
  if (!validMeasurement(m)) return no("invalid-measurement");
  if (r.source === "demo" && !sameNumbers(m, DEMO_FOLLOW_UP)) return no("demo-is-fixed");
  return ok({ ...r, status: "measured", followUp: { ...m } });
}

export type AuditOutcome =
  | { kind: "in-progress" }
  /** Audit verified as done, nothing measured afterwards: no outcome claim. */
  | { kind: "follow-up-not-measured"; baseline: WastePerMeal }
  | { kind: "measured"; baseline: WastePerMeal; followUp: WastePerMeal; comparison: Comparison };

/**
 * What the record can honestly say. Completing the audit is not an
 * environmental outcome; only a follow-up measurement produces one.
 */
export function auditOutcome(r: AuditRecord): AuditOutcome {
  if ((r.status !== "verified" && r.status !== "measured") || !r.baseline) return { kind: "in-progress" };
  const baseline = wastePerMeal(r.baseline);
  if (r.status === "verified" || !r.followUp) return { kind: "follow-up-not-measured", baseline };
  const comparison = compareMeasurements(r.baseline, r.followUp);
  if (!comparison) return { kind: "follow-up-not-measured", baseline };
  return { kind: "measured", baseline, followUp: wastePerMeal(r.followUp), comparison };
}

/** True once the audit itself is verified as done, whatever the outcome. */
export function auditCompleted(r: AuditRecord | null): boolean {
  return !!r && (r.status === "verified" || r.status === "measured");
}

/** Mission steps completed, 0–5, for the progress path and the board. */
export function stepsCompleted(r: AuditRecord | null): number {
  if (!r) return 0;
  return Object.values(stepsDone(r)).filter(Boolean).length;
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
  if (r.feedback !== null && !validFeedback(r.feedback)) return false;
  if (typeof r.discussed !== "boolean" || typeof r.changeTested !== "boolean") return false;
  if (r.change !== null && !AUDIT_CHANGES.includes(r.change as AuditChange)) return false;
  const rec = r as unknown as AuditRecord;
  // Past "proposed", steps 1–3 must be complete.
  if (rec.status !== "proposed" && !readyToSubmit({ ...rec, status: "proposed" })) return false;
  // A change can only be tested after verification.
  if (rec.changeTested && rec.status !== "verified" && rec.status !== "measured") return false;
  // A follow-up exists exactly when the outcome was measured, and only after testing.
  if ((rec.status === "measured") !== (rec.followUp !== null)) return false;
  if (rec.status === "measured" && !rec.changeTested) return false;
  // Demo records always carry the demo numbers.
  if (source === "demo") {
    if (!sameNumbers(rec.baseline, DEMO_BASELINE)) return false;
    if (rec.followUp && !sameNumbers(rec.followUp, DEMO_FOLLOW_UP)) return false;
  }
  return true;
}

"use client";

import { useId, useState } from "react";
import {
  AUDIT_CAUSES,
  AUDIT_CHANGES,
  DEMO_FOLLOW_UP,
  EMPTY_FEEDBACK,
  FEEDBACK_REASONS,
  MEASUREMENT_LIMITS,
  auditOutcome,
  comparisonSentence,
  formatGrams,
  measurementWarnings,
  readyToSubmit,
  stepsDone,
  validMeasurement,
  wastePerMeal,
  type AuditCause,
  type AuditChange,
  type AuditMeasurement,
  type AuditRecord,
  type AuditSource,
  type FeedbackReason,
  type FeedbackTally,
} from "../model/audit";
import { useEco, useEcoEnv } from "./context";
import {
  AlertIcon,
  CheckIcon,
  ClipboardIcon,
  FeedbackIcon,
  FlagIcon,
  FlaskIcon,
  OfficeIcon,
  PotIcon,
  RepeatIcon,
  ScaleIcon,
  SearchIcon,
  ShieldIcon,
  SmallBowlIcon,
  UsersIcon,
} from "./icons";
import { InfoTip } from "./InfoTip";
import { SidePanel } from "./SidePanel";

type Step = "measure" | "understand" | "discuss" | "test" | "remeasure";

const PATH: { id: Step; label: string; Icon: typeof ScaleIcon }[] = [
  { id: "measure", label: "Measure", Icon: ScaleIcon },
  { id: "understand", label: "Understand", Icon: SearchIcon },
  { id: "discuss", label: "Discuss", Icon: UsersIcon },
  { id: "test", label: "Test", Icon: FlaskIcon },
  { id: "remeasure", label: "Measure again", Icon: RepeatIcon },
];

const CAUSE_LABEL: Record<AuditCause, string> = {
  "attendance-lower": "Attendance lower than expected",
  "portions-large": "Portions seemed too large",
  disliked: "Students disliked part of the meal",
  "too-much-prepared": "Too much food prepared",
  "little-choice": "Students had little choice",
  timing: "Service timing affected demand",
  unsure: "Unsure / needs more investigation",
};

const FEEDBACK_LABEL: Record<FeedbackReason, string> = {
  portion: "Portion too large",
  disliked: "Didn't like part of meal",
  full: "Already full",
  time: "Not enough time",
  other: "Other",
};

const CHANGES: Record<AuditChange, { label: string; Icon: typeof ScaleIcon }> = {
  rsvp: { label: "Better RSVP / attendance estimate", Icon: ClipboardIcon },
  "smaller-first": { label: "Smaller first serving option", Icon: SmallBowlIcon },
  feedback: { label: "Student feedback", Icon: FeedbackIcon },
  "prep-quantity": { label: "Adjust preparation quantity", Icon: PotIcon },
  "menu-communication": { label: "Better menu communication", Icon: OfficeIcon },
};

/** The step a record is on, from its state. */
function currentStep(r: AuditRecord): Step {
  const s = stepsDone(r);
  if (r.status === "proposed") return !s.measure ? "measure" : !s.understand ? "understand" : "discuss";
  if (r.status === "submitted") return "discuss";
  if (r.status === "verified") return s.test ? "remeasure" : "test";
  return "remeasure";
}

/** Cafeteria Waste Audit: the one real-world mission, opened from the board. */
export function MissionPanel() {
  const { store } = useEcoEnv();
  const view = useEco((s) => s.missionView);
  const record = useEco((s) => s.save.mission[view]);
  const hasDemo = useEco((s) => s.save.mission.demo !== null);

  return (
    <SidePanel
      eyebrow="Community mission · real world"
      title="Cafeteria Waste Audit"
      onClose={store.actions.clearSelection}
      compact
      className="eco-mission"
    >
      <p className="eco-tagline">Learn in the simulation. Test in the real world.</p>
      <SourceBar view={view} record={record} hasDemo={hasDemo} />
      {record ? <AuditFlow key={view} record={record} /> : <MissionIntro />}
    </SidePanel>
  );
}

function SourceBar({ view, record, hasDemo }: { view: AuditSource; record: AuditRecord | null; hasDemo: boolean }) {
  const { store } = useEcoEnv();
  if (view === "demo") {
    return (
      <div className="eco-source eco-source--demo">
        <span className="eco-source__badge">Demo data</span>
        <span className="eco-source__text">Demonstration values only</span>
        <button type="button" className="eco-source__link" onClick={() => store.actions.discardAudit("demo")}>
          Reset demo
        </button>
      </div>
    );
  }
  return (
    <div className="eco-source">
      <span className="eco-source__badge">School measurement</span>
      <span className="eco-source__text">Your real numbers only</span>
      {record && (
        <button type="button" className="eco-source__link" onClick={() => store.actions.startAudit("demo")}>
          {hasDemo ? "View demo" : "Try demo"}
        </button>
      )}
    </div>
  );
}

function MissionIntro() {
  const { store } = useEcoEnv();
  const hubBuilt = useEco((s) => s.save.progress.campus.planningHubBuilt);
  return (
    <>
      <p className="eco-mission__lead">
        What is actually happening in <em>our</em> cafeteria? Gather evidence before deciding what to change.
      </p>
      <ol className="eco-path eco-path--static" aria-label="Mission steps">
        {PATH.map(({ id, label, Icon }) => (
          <li key={id} className="eco-path__node">
            <span className="eco-path__dot">
              <Icon size={15} />
            </span>
            <span className="eco-path__label">{label}</span>
          </li>
        ))}
      </ol>
      <div className="eco-bridge">
        <span className="eco-bridge__chain" aria-hidden="true">
          <OfficeIcon size={16} />
          <span>→</span>
          <ClipboardIcon size={16} />
        </span>
        <span>
          In the simulation, {hubBuilt ? "your" : "the"} Planning Hub uses better information to cut planning mistakes.{" "}
          <strong>The audit checks whether your real cafeteria has this problem.</strong>
        </span>
      </div>
      <p className="eco-privacy">
        <ShieldIcon size={14} /> Anonymous, whole-cafeteria totals. No names, photos or individual records.
      </p>
      <div className="eco-mission__actions">
        <button type="button" className="eco-btn eco-btn--primary" onClick={() => store.actions.startAudit("school")}>
          Start school audit
        </button>
        <button type="button" className="eco-btn" onClick={() => store.actions.startAudit("demo")}>
          Try with demo data
        </button>
      </div>
    </>
  );
}

function AuditFlow({ record }: { record: AuditRecord }) {
  const auto = currentStep(record);
  // Steps advance when the player presses Next. Before submission, finished
  // steps can be revisited; afterwards the flow is fixed.
  // The demo starts at step 1 so every stage can be shown in order.
  const [picked, setPicked] = useState<Step>(record.source === "demo" && record.status === "proposed" ? "measure" : auto);
  const step = record.status === "proposed" ? picked : auto;
  const done = stepsDone(record);
  const verified = record.status === "verified" || record.status === "measured";

  return (
    <>
      <ol className="eco-path" aria-label="Audit progress">
        {PATH.map(({ id, label, Icon }, i) => {
          const isDone = done[id] && (id !== "discuss" || record.status !== "proposed" || step !== "discuss");
          const canVisit = record.status === "proposed" && i < 3 && (done[id] || id === auto) && id !== step;
          return (
            <li key={id} className={`eco-path__node${isDone ? " is-done" : ""}${id === step ? " is-current" : ""}`}>
              {i === 3 && (
                <span className={`eco-path__seal${verified ? " is-on" : ""}`} title="Staff check" aria-hidden="true">
                  <ShieldIcon size={12} />
                </span>
              )}
              <button
                type="button"
                className="eco-path__dot"
                disabled={!canVisit}
                aria-current={id === step ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}${isDone ? ", done" : id === step ? ", current" : ""}`}
                onClick={() => setPicked(id)}
              >
                {isDone && id !== step ? <CheckIcon size={13} /> : <Icon size={15} />}
              </button>
              <span className="eco-path__label">{label}</span>
            </li>
          );
        })}
      </ol>
      <StatusLine record={record} />

      {record.status === "proposed" && step === "measure" && <MeasureStep record={record} onDone={() => setPicked("understand")} />}
      {record.status === "proposed" && step === "understand" && <UnderstandStep record={record} onNext={() => setPicked("discuss")} />}
      {record.status === "proposed" && step === "discuss" && <DiscussStep record={record} />}
      {record.status === "submitted" && <SubmittedCard record={record} />}
      {verified && <CompletedCard record={record} />}
      {record.status === "verified" && !record.changeTested && <TestStep record={record} />}
      {record.status === "verified" && record.changeTested && <FollowUpStep record={record} />}
      {record.status === "measured" && <Comparison record={record} />}
    </>
  );
}

function StatusLine({ record }: { record: AuditRecord }) {
  const label =
    record.status === "proposed"
      ? "Audit in progress"
      : record.status === "submitted"
        ? "Waiting for staff check"
        : record.status === "verified"
          ? "Audit completed"
          : "Outcome measured";
  return (
    <p className="eco-status">
      <span className={`eco-status__pill eco-status__pill--${record.status}`}>{label}</span>
      {record.source === "school" && record.status === "proposed" && <DiscardDraft />}
    </p>
  );
}

function DiscardDraft() {
  const { store } = useEcoEnv();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button type="button" className="eco-source__link" onClick={() => setConfirm(true)}>
        Discard draft
      </button>
    );
  }
  return (
    <span className="eco-status__confirm">
      Discard?
      <button type="button" className="eco-source__link eco-source__link--danger" onClick={() => store.actions.discardAudit("school")}>
        Yes
      </button>
      <button type="button" className="eco-source__link" onClick={() => setConfirm(false)}>
        No
      </button>
    </span>
  );
}

function StepHead({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="eco-step__head">
      <span className="eco-step__num" aria-hidden="true">
        {n}
      </span>
      <h3 className="eco-step__title">{title}</h3>
      {children}
    </div>
  );
}

// -------------------------------------------------------------- step 1 & 5

type Draft = { meals: string; plate: string; surplus: string; date: string; menu: string };
type Field = "meals" | "plate" | "surplus";

const toDraft = (m: AuditMeasurement | null): Draft =>
  m
    ? { meals: String(m.mealsServed), plate: String(m.plateWasteG), surplus: String(m.surplusG), date: m.date ?? "", menu: m.menu ?? "" }
    : { meals: "", plate: "", surplus: "", date: "", menu: "" };

const toNumber = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/[\s,]/g, "")));

/** A friendly message per field, or null when it's fine. */
function fieldError(field: Field, raw: string): string | null {
  const v = toNumber(raw);
  if (raw.trim() === "") return field === "meals" ? "Enter meals served" : "Enter 0 if none";
  if (!Number.isFinite(v)) return "Numbers only";
  if (v < 0) return "Can't be negative";
  if (field === "meals") {
    if (!Number.isInteger(v)) return "Whole meals only";
    if (v === 0) return "At least 1 meal";
    if (v > MEASUREMENT_LIMITS.maxMeals) return "Too many for one lunch";
  } else if (v > MEASUREMENT_LIMITS.maxGrams) {
    return "Over 1,000 kg: check units";
  }
  return null;
}

function parseDraft(d: Draft): AuditMeasurement | null {
  const m: AuditMeasurement = {
    mealsServed: toNumber(d.meals),
    plateWasteG: toNumber(d.plate),
    surplusG: toNumber(d.surplus),
    date: d.date || null,
    menu: d.menu.trim() ? d.menu.trim().slice(0, MEASUREMENT_LIMITS.maxMenu) : null,
  };
  return validMeasurement(m) ? m : null;
}

/** Three numbers, optional date and menu, and the live calculation. */
function MeasureForm({ draft, setDraft, readOnly, tried }: { draft: Draft; setDraft: (d: Draft) => void; readOnly: boolean; tried: boolean }) {
  const id = useId();
  const [extras, setExtras] = useState(!!(draft.date || draft.menu));
  const parsed = parseDraft(draft);
  const result = parsed ? wastePerMeal(parsed) : null;
  const warnings = parsed ? measurementWarnings(parsed) : [];
  const field = (key: Field, label: string, unit: string | null) => {
    const err = tried || draft[key] !== "" ? fieldError(key, draft[key]) : null;
    return (
      <div className="eco-field">
        <label className="eco-field__label" htmlFor={`${id}-${key}`}>
          {label}
        </label>
        <span className={`eco-field__box${err ? " is-bad" : ""}`}>
          <input
            id={`${id}-${key}`}
            inputMode={key === "meals" ? "numeric" : "decimal"}
            autoComplete="off"
            value={draft[key]}
            readOnly={readOnly}
            placeholder="0"
            aria-invalid={!!err}
            aria-describedby={err ? `${id}-${key}-err` : undefined}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value.slice(0, 9) })}
          />
          {unit && <span className="eco-field__unit">{unit}</span>}
        </span>
        {err && (
          <span className="eco-field__err" id={`${id}-${key}-err`}>
            {err}
          </span>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="eco-fields">
        {field("meals", "Meals served", null)}
        {field("plate", "Plate waste", "g")}
        {field("surplus", "Unserved surplus", "g")}
      </div>
      {extras ? (
        <div className="eco-fields eco-fields--extra">
          <div className="eco-field">
            <label className="eco-field__label" htmlFor={`${id}-date`}>
              Date <span className="eco-muted">(optional)</span>
            </label>
            <span className="eco-field__box">
              <input id={`${id}-date`} type="date" value={draft.date} readOnly={readOnly} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </span>
          </div>
          <div className="eco-field">
            <label className="eco-field__label" htmlFor={`${id}-menu`}>
              Menu <span className="eco-muted">(optional)</span>
            </label>
            <span className="eco-field__box">
              <input
                id={`${id}-menu`}
                value={draft.menu}
                readOnly={readOnly}
                maxLength={MEASUREMENT_LIMITS.maxMenu}
                placeholder="e.g. Vegetable stew"
                onChange={(e) => setDraft({ ...draft, menu: e.target.value })}
              />
            </span>
          </div>
        </div>
      ) : (
        !readOnly && (
          <button type="button" className="eco-source__link eco-extras-link" onClick={() => setExtras(true)}>
            + Add date and menu (optional)
          </button>
        )
      )}
      <div className="eco-calc" aria-live="polite">
        <span className="eco-calc__eq">
          <span>Total edible waste</span>
          <b>{result ? formatGrams(result.totalG) : "—"}</b>
        </span>
        <span className="eco-calc__op" aria-hidden="true">
          ÷
        </span>
        <span className="eco-calc__eq">
          <span>Meals</span>
          <b>{result ? result.mealsServed.toLocaleString("en-GB") : "—"}</b>
        </span>
        <span className="eco-calc__op" aria-hidden="true">
          =
        </span>
        <span className="eco-calc__eq eco-calc__eq--out">
          <span>Per meal</span>
          <b>{result?.perMealG != null ? `${formatGrams(result.perMealG)}/meal` : "—"}</b>
        </span>
      </div>
      {warnings.map((w) => (
        <p key={w} className="eco-warn" role="status">
          <AlertIcon size={14} /> {w}
        </p>
      ))}
    </>
  );
}

function MeasureStep({ record, onDone }: { record: AuditRecord; onDone: () => void }) {
  const { store } = useEcoEnv();
  const demo = record.source === "demo";
  const [draft, setDraft] = useState(() => toDraft(record.baseline));
  const [tried, setTried] = useState(false);
  const parsed = parseDraft(draft);
  return (
    <section className="eco-step">
      <StepHead n={1} title="Measure a baseline lunch">
        <InfoTip label="How to measure">
          During one normal lunch, count meals served. Scrape edible leftovers from all trays into one container and weigh it.
          Weigh cooked food that was never served. Leave out bones, peels and packaging.
        </InfoTip>
      </StepHead>
      <MeasureForm draft={draft} setDraft={setDraft} readOnly={demo} tried={tried} />
      <p className="eco-privacy">
        <ShieldIcon size={14} /> Weigh the shared bin, never individual plates.
      </p>
      <button
        type="button"
        className="eco-btn eco-btn--primary"
        onClick={() => {
          if (demo) return onDone();
          setTried(true);
          if (parsed && store.actions.auditBaseline(parsed)) onDone();
        }}
      >
        {demo ? "Next" : "Save baseline"}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- step 2

function UnderstandStep({ record, onNext }: { record: AuditRecord; onNext: () => void }) {
  const { store } = useEcoEnv();
  const demo = record.source === "demo";
  const [showFeedback, setShowFeedback] = useState(record.feedback !== null);
  const toggle = (c: AuditCause) => {
    const next = record.causes.includes(c) ? record.causes.filter((x) => x !== c) : [...record.causes, c];
    store.actions.auditCauses(next);
  };
  return (
    <section className="eco-step">
      <StepHead n={2} title="Why might food have been wasted?">
        <InfoTip label="About possible causes">
          These are possible causes to investigate, not confirmed causes. Pick every one your group noticed. The simulation&rsquo;s
          causes are assumptions; your audit is about what really happens.
        </InfoTip>
      </StepHead>
      <p className="eco-kicker">Possible causes · pick any</p>
      <div className="eco-chips" role="group" aria-label="Possible causes">
        {AUDIT_CAUSES.map((c) => {
          const on = record.causes.includes(c);
          return (
            <button key={c} type="button" className={`eco-chip-btn${on ? " is-on" : ""}`} aria-pressed={on} disabled={demo} onClick={() => toggle(c)}>
              {on && <CheckIcon size={12} />} {CAUSE_LABEL[c]}
            </button>
          );
        })}
      </div>
      {showFeedback ? (
        <FeedbackTallyEditor record={record} />
      ) : (
        !demo && (
          <button type="button" className="eco-source__link eco-extras-link" onClick={() => setShowFeedback(true)}>
            + Add anonymous student feedback (optional)
          </button>
        )
      )}
      <button type="button" className="eco-btn eco-btn--primary" disabled={record.causes.length === 0} onClick={onNext}>
        Next
      </button>
    </section>
  );
}

/** Counts only: how many students gave each reason. No names. */
function FeedbackTallyEditor({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  const id = useId();
  const tally: FeedbackTally = record.feedback ?? EMPTY_FEEDBACK;
  const demo = record.source === "demo";
  const set = (k: FeedbackReason, raw: string) => {
    const n = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > MEASUREMENT_LIMITS.maxFeedback) return;
    store.actions.auditFeedback({ ...tally, [k]: n });
  };
  return (
    <fieldset className="eco-tally">
      <legend>
        Why was food left? <span className="eco-muted">· anonymous counts</span>
      </legend>
      {FEEDBACK_REASONS.map((k) => (
        <label key={k} className="eco-tally__row" htmlFor={`${id}-${k}`}>
          <span>{FEEDBACK_LABEL[k]}</span>
          <input
            id={`${id}-${k}`}
            inputMode="numeric"
            value={tally[k] === 0 ? "" : String(tally[k])}
            placeholder="0"
            readOnly={demo}
            onChange={(e) => set(k, e.target.value)}
          />
        </label>
      ))}
    </fieldset>
  );
}

// ---------------------------------------------------------------- step 3

function DiscussStep({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  const demo = record.source === "demo";
  return (
    <section className="eco-step">
      <StepHead n={3} title="Discuss the findings with staff">
        <InfoTip label="Why discuss">
          Cafeteria staff, a supervising teacher or the sustainability team know things students don&rsquo;t: ordering,
          budgets and food-safety rules. Agree on one realistic change together.
        </InfoTip>
      </StepHead>
      <label className={`eco-check${record.discussed ? " is-on" : ""}`}>
        <input type="checkbox" checked={record.discussed} disabled={demo} onChange={(e) => store.actions.auditDiscussed(e.target.checked)} />
        <span className="eco-check__box" aria-hidden="true">
          {record.discussed && <CheckIcon size={12} />}
        </span>
        <span>Findings discussed with staff</span>
      </label>
      <p className="eco-kicker">What change is realistic to test? · one only</p>
      <div className="eco-options" role="radiogroup" aria-label="Change to test">
        {AUDIT_CHANGES.map((c) => {
          const { label, Icon } = CHANGES[c];
          const on = record.change === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              className={`eco-option${on ? " is-on" : ""}`}
              disabled={demo}
              onClick={() => store.actions.auditChange(c)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="eco-btn eco-btn--primary" disabled={!readyToSubmit(record)} onClick={store.actions.submitAudit}>
        Submit for staff check
      </button>
      <p className="eco-next-hint">After approval, test the change during a future lunch and measure again.</p>
    </section>
  );
}

// ------------------------------------------------------- after submission

function SubmittedCard({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  return (
    <section className="eco-step">
      <div className="eco-verify">
        <span className="eco-verify__tag">Demo workflow · prototype</span>
        <p>
          Submitted. A staff member confirms the audit happened and agrees to test{" "}
          <strong>{record.change ? CHANGES[record.change].label.toLowerCase() : "the change"}</strong>.
        </p>
      </div>
      <div className="eco-verify__row">
        <button type="button" className="eco-btn eco-btn--gold" onClick={store.actions.verifyAuditDemo}>
          <ShieldIcon size={16} /> Demo staff verification
        </button>
        <InfoTip label="About verification">
          A production version would require authenticated staff accounts. In this prototype anyone can press the button, so it
          is not real verification.
        </InfoTip>
      </div>
    </section>
  );
}

/** Mission completion, kept visibly apart from any environmental outcome. */
function CompletedCard({ record }: { record: AuditRecord }) {
  const outcome = auditOutcome(record);
  if (outcome.kind === "in-progress") return null;
  return (
    <div className="eco-done">
      <span className="eco-done__seal" aria-hidden="true">
        <ShieldIcon size={20} />
      </span>
      <div>
        <strong>Audit completed</strong>
        <span>
          Outcome: {outcome.kind === "measured" ? "measured below" : "follow-up not measured yet"}
        </span>
      </div>
      {record.source === "school" ? (
        <span className="eco-done__reward" title="Campus Sustainability Flag raised">
          <FlagIcon size={15} /> Flag raised
        </span>
      ) : (
        <span className="eco-done__reward eco-done__reward--off" title="Demo data earns no campus reward">
          No reward
        </span>
      )}
    </div>
  );
}

function TestStep({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  const change = record.change ? CHANGES[record.change] : null;
  return (
    <section className="eco-step">
      <StepHead n={4} title="Test this change during a future lunch">
        <InfoTip label="Running a fair test">
          Try only this change and keep everything else as normal. Give it a few lunches before measuring again.
        </InfoTip>
      </StepHead>
      {change && (
        <div className="eco-testcard">
          <change.Icon size={22} />
          <span>{change.label}</span>
        </div>
      )}
      <button type="button" className="eco-btn eco-btn--primary" onClick={store.actions.markChangeTested}>
        Change tested · measure again
      </button>
    </section>
  );
}

function FollowUpStep({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  const demo = record.source === "demo";
  const [draft, setDraft] = useState(() => toDraft(demo ? DEMO_FOLLOW_UP : null));
  const [same, setSame] = useState(demo);
  const [tried, setTried] = useState(false);
  const parsed = parseDraft(draft);
  return (
    <section className="eco-step">
      <StepHead n={5} title="Measure again">
        <InfoTip label="About the follow-up">
          Measure one lunch in exactly the same way as the baseline. A similar menu and day of the week make the comparison
          fairer.
        </InfoTip>
      </StepHead>
      <MeasureForm draft={draft} setDraft={setDraft} readOnly={demo} tried={tried} />
      <label className={`eco-check${same ? " is-on" : ""}`}>
        <input type="checkbox" checked={same} disabled={demo} onChange={(e) => setSame(e.target.checked)} />
        <span className="eco-check__box" aria-hidden="true">
          {same && <CheckIcon size={12} />}
        </span>
        <span>Measured the same way as the baseline</span>
      </label>
      <button
        type="button"
        className="eco-btn eco-btn--primary"
        disabled={!same}
        onClick={() => {
          setTried(true);
          if (parsed) store.actions.auditFollowUp(parsed, same);
        }}
      >
        Save follow-up
      </button>
    </section>
  );
}

function Comparison({ record }: { record: AuditRecord }) {
  const o = auditOutcome(record);
  if (o.kind !== "measured") return null;
  const c = o.comparison;
  const max = Math.max(c.baselinePerMealG, c.followUpPerMealG, 1);
  const demo = record.source === "demo";
  const diff =
    c.direction === "same"
      ? "No difference"
      : `${formatGrams(Math.abs(c.differenceG))} ${c.direction === "lower" ? "less" : "more"} per meal`;
  return (
    <section
      className={`eco-compare-real eco-compare-real--${c.direction}`}
      aria-label={demo ? "Demo data: baseline and follow-up" : "School measurement: baseline and follow-up"}
    >
      <span className={`eco-measure-tag${demo ? " eco-measure-tag--demo" : ""}`}>{demo ? "Demo data" : "School measurement"}</span>
      {[
        { label: "Baseline", m: record.baseline!, v: c.baselinePerMealG },
        { label: "Follow-up", m: record.followUp!, v: c.followUpPerMealG },
      ].map(({ label, m, v }, i) => (
        <div key={label} className={`eco-bar-row${i === 1 ? " eco-bar-row--after" : ""}`}>
          <span className="eco-bar-row__lab">{label}</span>
          <span className="eco-bar-row__track" title={`${m.mealsServed} meals · ${formatGrams(m.plateWasteG + m.surplusG)} total`}>
            <span style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <b>{formatGrams(v)}/meal</b>
        </div>
      ))}
      <p className="eco-compare-real__diff">{diff}</p>
      <p className="eco-compare-real__head">{comparisonSentence(c)}</p>
      <p className="eco-small eco-muted">Other differences such as attendance, menu or day may also affect the result.</p>
    </section>
  );
}

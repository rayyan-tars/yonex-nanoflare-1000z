"use client";

import { useId, useState } from "react";
import {
  AUDIT_CAUSES,
  AUDIT_CHANGES,
  MEASUREMENT_LIMITS,
  SAMPLE_FOLLOW_UP,
  auditOutcome,
  readyToSubmit,
  stepsDone,
  validMeasurement,
  wastePerMeal,
  type AuditCause,
  type AuditChange,
  type AuditMeasurement,
  type AuditRecord,
  type MissionStatus,
} from "../model/audit";
import { useEco, useEcoEnv } from "./context";
import {
  CheckIcon,
  ClipboardIcon,
  FeedbackIcon,
  FlagIcon,
  FlaskIcon,
  OfficeIcon,
  RepeatIcon,
  ScaleIcon,
  SearchIcon,
  ShieldIcon,
  SmallBowlIcon,
  UsersIcon,
} from "./icons";
import { InfoTip } from "./InfoTip";
import { SidePanel } from "./SidePanel";

type Step = "measure" | "understand" | "discuss" | "change" | "remeasure";

const PATH: { id: Step; label: string; Icon: typeof ScaleIcon }[] = [
  { id: "measure", label: "Measure", Icon: ScaleIcon },
  { id: "understand", label: "Understand", Icon: SearchIcon },
  { id: "discuss", label: "Discuss", Icon: UsersIcon },
  { id: "change", label: "Test", Icon: FlaskIcon },
  { id: "remeasure", label: "Re-measure", Icon: RepeatIcon },
];

const STATUS_LABEL: Record<MissionStatus, string> = {
  proposed: "Proposed",
  submitted: "Submitted",
  verified: "Verified as completed",
  measured: "Outcome measured",
};

const CAUSE_LABEL: Record<AuditCause, string> = {
  portions: "Portions too large",
  attendance: "Attendance differed",
  unpopular: "Meal unpopular",
  unsure: "Not sure yet",
};

const CHANGES: Record<AuditChange, { label: string; Icon: typeof ScaleIcon }> = {
  rsvp: { label: "Better RSVP", Icon: ClipboardIcon },
  "smaller-first": { label: "Smaller first servings", Icon: SmallBowlIcon },
  "attendance-planning": { label: "Attendance planning", Icon: OfficeIcon },
  feedback: { label: "Student feedback", Icon: FeedbackIcon },
};

/** Grams with at most one decimal, e.g. 70 g or 47.9 g. */
export function formatGrams(g: number): string {
  const r = Math.round(g * 10) / 10;
  return `${r.toLocaleString("en-GB", { maximumFractionDigits: 1 })} g`;
}

/** The step a record is on, given its status and what is filled in. */
function currentStep(r: AuditRecord): Step {
  if (r.status !== "proposed") return r.status === "submitted" ? "change" : "remeasure";
  const s = stepsDone(r);
  if (!s.measure) return "measure";
  if (!s.understand) return "understand";
  if (!s.discuss) return "discuss";
  return "change";
}

/** Cafeteria Waste Audit: the one real-world mission, opened from the board. */
export function MissionPanel() {
  const { store } = useEcoEnv();
  const view = useEco((s) => s.missionView);
  const record = useEco((s) => s.save.mission[view]);
  const hasSample = useEco((s) => s.save.mission.sample !== null);

  return (
    <SidePanel
      eyebrow="Community mission · real world"
      title="Cafeteria Waste Audit"
      onClose={store.actions.clearSelection}
      compact
      className="eco-mission"
    >
      <SourceBar view={view} record={record} hasSample={hasSample} />
      {record ? <AuditFlow key={view} record={record} /> : <MissionIntro />}
    </SidePanel>
  );
}

function SourceBar({ view, record, hasSample }: { view: "school" | "sample"; record: AuditRecord | null; hasSample: boolean }) {
  const { store } = useEcoEnv();
  if (view === "sample") {
    return (
      <div className="eco-source eco-source--sample">
        <span className="eco-source__badge">Sample record</span>
        <span className="eco-source__text">Invented numbers · demo workflow</span>
        <button type="button" className="eco-source__link" onClick={() => store.actions.discardAudit("sample")}>
          Close sample
        </button>
      </div>
    );
  }
  return (
    <div className="eco-source">
      <span className="eco-source__badge">Your school</span>
      <span className="eco-source__text">Real measurements only</span>
      {record && hasSample && (
        <button type="button" className="eco-source__link" onClick={() => store.actions.startAudit("sample")}>
          View sample
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
        Find out where your cafeteria&rsquo;s avoidable food waste comes from <em>before</em> proposing a change.
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
        <OfficeIcon size={18} />
        <span>
          {hubBuilt ? "Your Planning Hub" : "The game's Planning Hub"} shows that better information makes better plans.{" "}
          <strong>This audit tests that idea at your real school.</strong>
        </span>
      </div>
      <p className="eco-privacy">
        <ShieldIcon size={14} /> Whole-cafeteria totals only: no names, plate photos or individual records.
      </p>
      <div className="eco-mission__actions">
        <button type="button" className="eco-btn eco-btn--primary" onClick={() => store.actions.startAudit("school")} data-autofocus>
          Start real audit
        </button>
        <button type="button" className="eco-btn" onClick={() => store.actions.startAudit("sample")}>
          Try a sample
        </button>
      </div>
    </>
  );
}

function AuditFlow({ record }: { record: AuditRecord }) {
  const auto = currentStep(record);
  // Steps advance only when the player presses Next. Before submission,
  // completed steps can be revisited; afterwards the flow is fixed.
  const [picked, setPicked] = useState<Step>(auto);
  const step = record.status === "proposed" ? picked : auto;
  const done = stepsDone(record);
  const isDone = (id: Step) =>
    id === "remeasure" ? record.status === "measured" : record.status !== "proposed" || done[id as keyof typeof done];

  return (
    <>
      <ol className="eco-path" aria-label="Audit progress">
        {PATH.map(({ id, label, Icon }, i) => {
          const canVisit = record.status === "proposed" && id !== "remeasure" && (isDone(id) || id === auto) && id !== step;
          const cls = `eco-path__node${isDone(id) ? " is-done" : ""}${id === step ? " is-current" : ""}`;
          return (
            <li key={id} className={cls}>
              {i === 4 && (
                <span
                  className={`eco-path__seal${record.status === "verified" || record.status === "measured" ? " is-on" : ""}`}
                  title="Verified as completed"
                  aria-hidden="true"
                >
                  <ShieldIcon size={12} />
                </span>
              )}
              <button
                type="button"
                className="eco-path__dot"
                disabled={!canVisit}
                aria-current={id === step ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}${isDone(id) ? " (done)" : ""}`}
                onClick={() => setPicked(id)}
              >
                {isDone(id) && id !== step ? <CheckIcon size={13} /> : <Icon size={15} />}
              </button>
              <span className="eco-path__label">{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="eco-status">
        <span className={`eco-status__pill eco-status__pill--${record.status}`}>{STATUS_LABEL[record.status]}</span>
        {record.source === "school" && record.status === "proposed" && <DiscardDraft />}
      </p>

      {record.status === "proposed" && step === "measure" && <MeasureStep record={record} onDone={() => setPicked("understand")} />}
      {record.status === "proposed" && step === "understand" && <UnderstandStep record={record} onNext={() => setPicked("discuss")} />}
      {record.status === "proposed" && step === "discuss" && <DiscussStep record={record} onNext={() => setPicked("change")} />}
      {record.status === "proposed" && step === "change" && <ChangeStep record={record} />}
      {record.status === "submitted" && <SubmittedCard record={record} />}
      {(record.status === "verified" || record.status === "measured") && <CompletedCard record={record} />}
      {record.status === "verified" && <FollowUpStep record={record} />}
      {record.status === "measured" && <Comparison record={record} />}
    </>
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

type Draft = { meals: string; plate: string; surplus: string };

const toDraft = (m: AuditMeasurement | null): Draft =>
  m ? { meals: String(m.mealsServed), plate: String(m.plateWasteG), surplus: String(m.surplusG) } : { meals: "", plate: "", surplus: "" };

function parseDraft(d: Draft): AuditMeasurement | null {
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/[\s,]/g, "")));
  const m = { mealsServed: num(d.meals), plateWasteG: num(d.plate), surplusG: num(d.surplus) };
  return validMeasurement(m) ? m : null;
}

/** Three numbers and the live calculation they produce. */
function MeasureForm({
  id,
  draft,
  setDraft,
  readOnly,
}: {
  id: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  readOnly: boolean;
}) {
  const parsed = parseDraft(draft);
  const result = parsed ? wastePerMeal(parsed) : null;
  const field = (key: keyof Draft, label: string, unit: string | null, max: number) => (
    <label className="eco-field">
      <span className="eco-field__label">{label}</span>
      <span className="eco-field__box">
        <input
          id={`${id}-${key}`}
          inputMode="numeric"
          autoComplete="off"
          value={draft[key]}
          readOnly={readOnly}
          placeholder="0"
          aria-describedby={`${id}-calc`}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value.slice(0, String(max).length + 2) })}
        />
        {unit && <span className="eco-field__unit">{unit}</span>}
      </span>
    </label>
  );
  return (
    <>
      <div className="eco-fields">
        {field("meals", "Meals served", null, MEASUREMENT_LIMITS.maxMeals)}
        {field("plate", "Plate waste", "g", MEASUREMENT_LIMITS.maxGrams)}
        {field("surplus", "Unserved surplus", "g", MEASUREMENT_LIMITS.maxGrams)}
      </div>
      <div className="eco-calc" id={`${id}-calc`} aria-live="polite">
        <span className="eco-calc__eq">
          <span>Edible waste</span>
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
          <b>{result ? formatGrams(result.perMealG) : "—"}</b>
        </span>
      </div>
    </>
  );
}

function MeasureStep({ record, onDone }: { record: AuditRecord; onDone: () => void }) {
  const { store } = useEcoEnv();
  const id = useId();
  const sample = record.source === "sample";
  const [draft, setDraft] = useState(() => toDraft(record.baseline));
  const parsed = parseDraft(draft);
  return (
    <section className="eco-step">
      <StepHead n={1} title="Measure one lunch">
        <InfoTip label="How to measure">
          Over one normal lunch, count the meals served. Scrape edible leftovers from all trays into one container and
          weigh it. Weigh cooked food that was never served. Leave out bones, peels and packaging.
        </InfoTip>
      </StepHead>
      <MeasureForm id={id} draft={draft} setDraft={setDraft} readOnly={sample} />
      <p className="eco-privacy">
        <ShieldIcon size={14} /> Weigh the shared bin, never individual plates.
      </p>
      {sample ? (
        <button type="button" className="eco-btn eco-btn--primary" onClick={onDone}>
          Next
        </button>
      ) : (
        <button
          type="button"
          className="eco-btn eco-btn--primary"
          disabled={!parsed}
          onClick={() => {
            if (parsed && store.actions.auditBaseline(parsed)) onDone();
          }}
        >
          Save baseline
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- step 2

function UnderstandStep({ record, onNext }: { record: AuditRecord; onNext: () => void }) {
  const { store } = useEcoEnv();
  const sample = record.source === "sample";
  const toggle = (c: AuditCause) => {
    const next = record.causes.includes(c) ? record.causes.filter((x) => x !== c) : [...record.causes, c];
    store.actions.auditCauses(next);
  };
  return (
    <section className="eco-step">
      <StepHead n={2} title="Why was food left?">
        <InfoTip label="About causes">
          Decide together, using what you saw and what students said. Pick every cause that applies.
        </InfoTip>
      </StepHead>
      <div className="eco-chips" role="group" aria-label="Likely causes">
        {AUDIT_CAUSES.map((c) => {
          const on = record.causes.includes(c);
          return (
            <button key={c} type="button" className={`eco-chip-btn${on ? " is-on" : ""}`} aria-pressed={on} disabled={sample} onClick={() => toggle(c)}>
              {on && <CheckIcon size={12} />} {CAUSE_LABEL[c]}
            </button>
          );
        })}
      </div>
      <button type="button" className="eco-btn eco-btn--primary" disabled={record.causes.length === 0} onClick={onNext}>
        Next
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- step 3

function DiscussStep({ record, onNext }: { record: AuditRecord; onNext: () => void }) {
  const { store } = useEcoEnv();
  return (
    <section className="eco-step">
      <StepHead n={3} title="Discuss with staff">
        <InfoTip label="Why discuss">
          Cafeteria staff know things students don&rsquo;t: ordering, budgets and food-safety rules. Agree on the change
          together.
        </InfoTip>
      </StepHead>
      <label className={`eco-check${record.discussed ? " is-on" : ""}`}>
        <input
          type="checkbox"
          checked={record.discussed}
          disabled={record.source === "sample"}
          onChange={(e) => store.actions.auditDiscussed(e.target.checked)}
        />
        <span className="eco-check__box" aria-hidden="true">
          {record.discussed && <CheckIcon size={12} />}
        </span>
        <span>Findings shared with cafeteria staff or a supervising teacher</span>
      </label>
      <button type="button" className="eco-btn eco-btn--primary" disabled={!record.discussed} onClick={onNext}>
        Next
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- step 4

function ChangeStep({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  const sample = record.source === "sample";
  return (
    <section className="eco-step">
      <StepHead n={4} title="Test one change">
        <InfoTip label="Why only one">
          Change one thing at a time. If you change several, you can&rsquo;t tell which one made a difference.
        </InfoTip>
      </StepHead>
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
              disabled={sample}
              onClick={() => store.actions.auditChange(c)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="eco-btn eco-btn--primary" disabled={!readyToSubmit(record)} onClick={store.actions.submitAudit}>
        Submit audit
      </button>
    </section>
  );
}

// ------------------------------------------------------- after submission

function SubmittedCard({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  return (
    <section className="eco-step">
      <div className="eco-verify">
        <span className="eco-verify__tag">Demo workflow</span>
        <p>
          Audit submitted. A member of staff checks that it really happened{record.change ? ` and that “${CHANGES[record.change].label.toLowerCase()}” is being tried` : ""}.
        </p>
      </div>
      <div className="eco-verify__row">
        <button type="button" className="eco-btn eco-btn--gold" onClick={store.actions.verifyAuditDemo}>
          <ShieldIcon size={16} /> Demo staff verification
        </button>
        <InfoTip label="About verification">
          A production version would require authenticated staff approval. In this demo anyone can press the button, so it
          proves nothing on its own.
        </InfoTip>
      </div>
    </section>
  );
}

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
          Baseline {formatGrams(outcome.baseline.perMealG)} per meal
          {record.status === "verified" && " · no follow-up yet, so no change in waste is claimed"}
        </span>
      </div>
      {record.source === "school" ? (
        <span className="eco-done__reward" title="Campus Sustainability Flag raised">
          <FlagIcon size={16} /> Flag
        </span>
      ) : (
        <span className="eco-done__reward eco-done__reward--off" title="Sample walkthroughs earn no campus reward">
          No reward
        </span>
      )}
    </div>
  );
}

function FollowUpStep({ record }: { record: AuditRecord }) {
  const { store } = useEcoEnv();
  const id = useId();
  const sample = record.source === "sample";
  const [draft, setDraft] = useState(() => toDraft(sample ? SAMPLE_FOLLOW_UP : null));
  const [same, setSame] = useState(sample);
  const parsed = parseDraft(draft);
  return (
    <section className="eco-step">
      <StepHead n={5} title="Measure again">
        <InfoTip label="About the follow-up">
          After the change has run for a while, measure one lunch again in exactly the same way. A similar menu and day
          of the week make the comparison fairer.
        </InfoTip>
      </StepHead>
      <MeasureForm id={id} draft={draft} setDraft={setDraft} readOnly={sample} />
      <label className={`eco-check${same ? " is-on" : ""}`}>
        <input type="checkbox" checked={same} disabled={sample} onChange={(e) => setSame(e.target.checked)} />
        <span className="eco-check__box" aria-hidden="true">
          {same && <CheckIcon size={12} />}
        </span>
        <span>Measured the same way as the baseline</span>
      </label>
      <button
        type="button"
        className="eco-btn eco-btn--primary"
        disabled={!parsed || !same}
        onClick={() => parsed && store.actions.auditFollowUp(parsed, same)}
      >
        Save follow-up
      </button>
    </section>
  );
}

function Comparison({ record }: { record: AuditRecord }) {
  const o = auditOutcome(record);
  if (o.kind !== "measured") return null;
  const max = Math.max(o.baseline.perMealG, o.followUp.perMealG, 1);
  const pct = Math.abs(Math.round(o.changePercent));
  const sample = record.source === "sample";
  const headline =
    o.direction === "lower"
      ? `Waste per meal fell ${pct}%`
      : o.direction === "higher"
        ? `Waste per meal rose ${pct}%`
        : "No clear change in waste per meal";
  return (
    <section className={`eco-compare-real eco-compare-real--${o.direction}`} aria-label={sample ? "Sample before and after" : "Measured before and after"}>
      <div className="eco-compare-real__head">
        <strong>
          {sample && "Sample: "}
          {headline}
        </strong>
        <InfoTip label="Reading the result">
          One before-and-after pair shows what changed, not why. Repeat on several days before drawing conclusions.
        </InfoTip>
      </div>
      {[
        { label: "Before", v: o.baseline },
        { label: "After", v: o.followUp },
      ].map(({ label, v }, i) => (
        <div key={label} className={`eco-bar-row${i === 1 ? " eco-bar-row--after" : ""}`}>
          <span className="eco-bar-row__lab">{label}</span>
          <span className="eco-bar-row__track">
            <span style={{ width: `${(v.perMealG / max) * 100}%` }} />
          </span>
          <b>{formatGrams(v.perMealG)}</b>
        </div>
      ))}
      <p className="eco-small eco-muted">
        {sample ? "Invented sample numbers. " : "Measured at your school. "}
        Grams of edible waste per meal served.
      </p>
    </section>
  );
}

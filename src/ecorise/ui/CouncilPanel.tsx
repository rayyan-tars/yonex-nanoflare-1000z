"use client";

import { useMemo } from "react";
import { BALANCE } from "../model/config";
import { planningView, voiceTokensUsed, type PlanningView } from "../model/planning";
import { getScenario } from "../model/scenarios";
import type { StudentVoiceAction } from "../model/types";
import { useEco, useEcoEnv } from "./context";
import {
  AlertIcon,
  CheckIcon,
  ClipboardIcon,
  ClockIcon,
  CrossCircleIcon,
  FeedbackIcon,
  InfoIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  PotIcon,
  SmallBowlIcon,
  UsersIcon,
} from "./icons";
import { SidePanel } from "./SidePanel";

const SLIDER_MIN = 60;
const SLIDER_MAX = 180;

const VOICE_CARDS: {
  action: StudentVoiceAction;
  title: string;
  effect: string;
  Icon: typeof ClipboardIcon;
}[] = [
  { action: "rsvp", title: "Lunch RSVP", effect: "Students say if they're coming. Narrows the attendance forecast.", Icon: ClipboardIcon },
  {
    action: "smallPlease",
    title: "“Small, please”",
    effect: "Reminds students who want less to ask for a small serving.",
    Icon: SmallBowlIcon,
  },
  { action: "feedback", title: "Feedback Box", effect: "Reveals how diners feel about today's portion size.", Icon: FeedbackIcon },
];

export function CouncilPanel() {
  const { store } = useEcoEnv();
  const voice = useEco((s) => s.save.draft.voice);
  const policy = useEco((s) => s.save.draft.policy);
  const upgrades = useEco((s) => s.upgrades);
  const scenarioId = useEco((s) => s.save.scenarioId);
  const scenario = getScenario(scenarioId);
  const view = useMemo(() => planningView(scenario, voice, policy, upgrades), [scenario, voice, policy, upgrades]);
  const used = voiceTokensUsed(voice);
  const max = BALANCE.maxStudentVoiceTokens;
  const def = scenario.definition;

  return (
    <SidePanel
      eyebrow={`${def.dayLabel} · ${def.dish}`}
      title="Lunch Council"
      onClose={store.actions.clearSelection}
      footer={
        <div className="eco-pending" role="note">
          <ClockIcon size={18} />
          <div>
            <strong>Lunch service arrives in the next build.</strong>
            <span>Your plan is saved and will be used when it does.</span>
          </div>
        </div>
      }
    >
      <p className="eco-brief">{def.briefing}</p>

      <section className="eco-section" aria-labelledby="eco-voice-h">
        <div className="eco-section__head">
          <h3 id="eco-voice-h">
            <UsersIcon size={18} /> Student Voice
          </h3>
          <div className="eco-tokens" aria-label={`${used} of ${max} tokens used`}>
            {Array.from({ length: max }, (_, i) => (
              <span key={i} className={`eco-token${i < used ? " eco-token--used" : ""}`} aria-hidden="true" />
            ))}
            <span className="eco-tokens__text">
              {max - used} of {max} left
            </span>
          </div>
        </div>
        <p className="eco-hint">What students can do. Choose up to two; you can change your mind.</p>
        <div className="eco-voice-grid">
          {VOICE_CARDS.map(({ action, title, effect, Icon }) => {
            const on = voice[action];
            const blocked = !on && used >= max;
            return (
              <button
                key={action}
                type="button"
                className={`eco-voice${on ? " eco-voice--on" : ""}${blocked ? " eco-voice--blocked" : ""}`}
                aria-pressed={on}
                aria-describedby={`eco-voice-${action}`}
                onClick={() => store.actions.toggleVoice(action)}
              >
                <span className="eco-voice__icon">
                  <Icon size={22} />
                </span>
                <span className="eco-voice__title">{title}</span>
                <span className="eco-voice__effect" id={`eco-voice-${action}`}>
                  {effect}
                </span>
                <span className="eco-voice__state" aria-hidden="true">
                  {on ? (
                    <>
                      <CheckIcon size={14} /> Chosen
                    </>
                  ) : blocked ? (
                    <>
                      <LockIcon size={13} /> No tokens left
                    </>
                  ) : (
                    "Choose"
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="eco-section" aria-labelledby="eco-know-h">
        <h3 id="eco-know-h">
          <InfoIcon size={18} /> What the kitchen knows
        </h3>
        <ForecastBar view={view} />
        <div className={`eco-feedback${view.feedback ? " eco-feedback--on" : ""}`}>
          <FeedbackIcon size={18} />
          {view.feedback ? (
            <p>
              <strong>Feedback Box:</strong> about {view.feedback.portionTooBigPercent}% of today&rsquo;s diners say a
              regular {def.dish.toLowerCase()} portion is more than they eat.
            </p>
          ) : (
            <p className="eco-muted">Portion preferences unknown. Choose the Feedback Box to find out.</p>
          )}
        </div>
      </section>

      <section className="eco-section" aria-labelledby="eco-plan-h">
        <h3 id="eco-plan-h">
          <PotIcon size={18} /> Kitchen plan
        </h3>
        <PortionControl view={view} />
        <label className="eco-switch">
          <input
            type="checkbox"
            role="switch"
            checked={policy.offerSmallServings}
            onChange={(e) => store.actions.setOfferSmall(e.target.checked)}
          />
          <span className="eco-switch__track" aria-hidden="true">
            <span className="eco-switch__thumb" />
          </span>
          <span className="eco-switch__text">
            <strong>Offer small servings</strong>
            <span>Less left on plates, but each diner takes a little longer to serve.</span>
          </span>
        </label>
        <Checks view={view} />
      </section>
    </SidePanel>
  );
}

function ForecastBar({ view }: { view: PlanningView }) {
  const lo = SLIDER_MIN;
  const hi = SLIDER_MAX;
  const pos = (n: number) => `${((Math.min(hi, Math.max(lo, n)) - lo) / (hi - lo)) * 100}%`;
  const { low, high, basis } = view.forecast;
  return (
    <div className="eco-forecast">
      <div className="eco-forecast__label">
        <span>Expected diners</span>
        <strong>
          {low}–{high}
        </strong>
      </div>
      <div className="eco-forecast__track" aria-hidden="true">
        <span className="eco-forecast__band" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
        <span className="eco-forecast__cooked" style={{ left: pos(view.portions) }} title="Portions to cook" />
      </div>
      <div className="eco-forecast__scale" aria-hidden="true">
        <span>{lo}</span>
        <span>{(lo + hi) / 2}</span>
        <span>{hi}</span>
      </div>
      <p className="eco-small eco-muted">
        {basis === "rsvp" ? "Narrowed by RSVP replies." : "A broad estimate. RSVP replies would narrow it."}
      </p>
    </div>
  );
}

function PortionControl({ view }: { view: PlanningView }) {
  const { store } = useEcoEnv();
  const value = view.portions;
  return (
    <div className="eco-portions">
      <div className="eco-portions__row">
        <label htmlFor="eco-portions" className="eco-portions__label">
          Portions to cook
        </label>
        <output htmlFor="eco-portions" className="eco-portions__value">
          {value}
        </output>
      </div>
      <div className="eco-portions__row">
        <button
          type="button"
          className="eco-icon-btn eco-icon-btn--soft"
          aria-label="Cook one fewer portion"
          onClick={() => store.actions.setPortions(value - 1)}
          disabled={value <= SLIDER_MIN}
        >
          <MinusIcon size={18} />
        </button>
        <input
          id="eco-portions"
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          value={Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value))}
          onChange={(e) => store.actions.setPortions(Number(e.target.value))}
          aria-valuetext={`${value} portions`}
          style={{ ["--fill" as string]: `${((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%` }}
        />
        <button
          type="button"
          className="eco-icon-btn eco-icon-btn--soft"
          aria-label="Cook one more portion"
          onClick={() => store.actions.setPortions(value + 1)}
          disabled={value >= SLIDER_MAX}
        >
          <PlusIcon size={18} />
        </button>
      </div>
    </div>
  );
}

type Level = "ok" | "warn" | "bad" | "info";

function Check({ level, children }: { level: Level; children: React.ReactNode }) {
  const Icon = level === "ok" ? CheckIcon : level === "warn" ? AlertIcon : level === "bad" ? CrossCircleIcon : InfoIcon;
  const label = level === "ok" ? "Looks fine" : level === "warn" ? "Risk" : level === "bad" ? "Problem" : "Note";
  return (
    <li className={`eco-check eco-check--${level}`}>
      <span className="eco-check__icon" role="img" aria-label={label}>
        <Icon size={16} />
      </span>
      <span>{children}</span>
    </li>
  );
}

function Checks({ view }: { view: PlanningView }) {
  const { low, high } = view.forecast;
  const p = view.portions;
  const minutes = BALANCE.lunchWindowMinutes;
  return (
    <ul className="eco-checks" aria-label="Plan check">
      {p >= high ? (
        <Check level={p - low > 15 ? "warn" : "ok"}>
          Enough regular servings even if all {high} come.
          {p - low > 15 && ` But if only ${low} come, up to ${p - low} portions could go unserved.`}
        </Check>
      ) : p >= low ? (
        <Check level="warn">
          Covers up to {p} diners on regular servings. If more come (up to {high}), some could miss the hot meal unless
          small servings stretch the food.
        </Check>
      ) : (
        <Check level="bad">
          Fewer portions than the lowest forecast ({low}). Some diners will probably miss the hot meal.
        </Check>
      )}
      <Check level={view.capacityCoversForecastHigh ? "ok" : "warn"}>
        The counter can serve about {view.capacity} diners in the {minutes}-minute window
        {view.capacityCoversForecastHigh ? "." : `, fewer than the top of the forecast (${high}).`}
        {view.capacity !== view.capacityIfToggled &&
          (view.capacity < view.capacityIfToggled
            ? ` Without small servings it could serve ${view.capacityIfToggled}.`
            : ` Offering small servings would lower this to ${view.capacityIfToggled}.`)}
      </Check>
      {view.cooperation === "both" && (
        <Check level="ok">
          Kitchen and students are working together: about {Math.round(view.askRatePercent / 10)} in 10 diners who want
          less will ask for a small serving.
        </Check>
      )}
      {view.cooperation === "kitchen-only" && (
        <Check level="info">
          Small servings are on offer, but only about {Math.round(view.askRatePercent / 10)} in 10 diners who want less
          will ask. A &ldquo;Small, please&rdquo; reminder would help.
        </Check>
      )}
      {view.cooperation === "students-only" && (
        <Check level="warn">Students are reminded to ask for small servings, but the kitchen isn&rsquo;t offering them yet.</Check>
      )}
      {view.cooperation === "neither" && <Check level="info">Everyone will get a regular serving.</Check>}
    </ul>
  );
}

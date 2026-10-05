"use client";

import { useMemo } from "react";
import { BALANCE } from "../model/config";
import { planRisk, planningView, voiceTokensUsed, type PlanningView } from "../model/planning";
import { getScenario } from "../model/scenarios";
import type { StudentVoiceAction } from "../model/types";
import { useEco, useEcoEnv } from "./context";
import { CheckIcon, ClipboardIcon, FeedbackIcon, PlayIcon, SmallBowlIcon } from "./icons";
import { InfoTip } from "./InfoTip";
import { SidePanel } from "./SidePanel";

const SLIDER_MIN = 60;
const SLIDER_MAX = 180;

const VOICE: { action: StudentVoiceAction; title: string; effect: string; more: string; Icon: typeof ClipboardIcon }[] = [
  {
    action: "rsvp",
    title: "RSVP",
    effect: "Better forecast",
    more: "Students say in the morning whether they'll eat lunch. The kitchen sees a narrower attendance range.",
    Icon: ClipboardIcon,
  },
  {
    action: "smallPlease",
    title: "Small, please",
    effect: "Less plate waste",
    more: "Reminds students who usually leave food to ask for a small serving. Only helps if the kitchen offers small servings.",
    Icon: SmallBowlIcon,
  },
  {
    action: "feedback",
    title: "Feedback",
    effect: "Know preferences",
    more: "Students say whether a full portion is more than they eat. The kitchen can then plan for small servings.",
    Icon: FeedbackIcon,
  },
];

export function CouncilPanel() {
  const { store } = useEcoEnv();
  const voice = useEco((s) => s.save.draft.voice);
  const policy = useEco((s) => s.save.draft.policy);
  const upgrades = useEco((s) => s.upgrades);
  const scenarioId = useEco((s) => s.save.scenarioId);
  const scenario = getScenario(scenarioId);
  const view = useMemo(() => planningView(scenario, voice, policy, upgrades), [scenario, voice, policy, upgrades]);
  const risk = useMemo(() => planRisk(view, policy.offerSmallServings), [view, policy.offerSmallServings]);
  const used = voiceTokensUsed(voice);
  const max = BALANCE.maxStudentVoiceTokens;
  const def = scenario.definition;

  return (
    <SidePanel
      eyebrow={`${def.dayLabel} · ${def.dish}`}
      title="Lunch Council"
      onClose={store.actions.clearSelection}
      footer={
        <button type="button" className="eco-btn eco-btn--primary eco-btn--serve" onClick={store.actions.serveLunch}>
          <PlayIcon size={16} /> Serve lunch
        </button>
      }
    >
      <section className="eco-step" aria-labelledby="eco-s1">
        <div className="eco-step__head">
          <span className="eco-step__num" aria-hidden="true">
            1
          </span>
          <h3 id="eco-s1" className="eco-step__title">
            Student Voice
          </h3>
          <span className="eco-tokens" aria-label={`${max - used} of ${max} tokens left`} role="img">
            {Array.from({ length: max }, (_, i) => (
              <span key={i} className={`eco-token${i < used ? " eco-token--used" : ""}`} />
            ))}
          </span>
          <InfoTip label="About Student Voice">Students can do two things before lunch. Pick up to two; you can change your mind.</InfoTip>
        </div>
        <div className="eco-voice-grid">
          {VOICE.map(({ action, title, effect, more, Icon }) => {
            const on = voice[action];
            const blocked = !on && used >= max;
            return (
              <button
                key={action}
                type="button"
                className={`eco-voice${on ? " eco-voice--on" : ""}${blocked ? " eco-voice--blocked" : ""}`}
                aria-pressed={on}
                title={more}
                onClick={() => store.actions.toggleVoice(action)}
              >
                <span className="eco-voice__check" aria-hidden="true">
                  {on && <CheckIcon size={11} />}
                </span>
                <span className="eco-voice__icon">
                  <Icon size={20} />
                </span>
                <span className="eco-voice__title">{title}</span>
                <span className="eco-voice__effect">{effect}</span>
              </button>
            );
          })}
        </div>
        {view.feedback && (
          <p className="eco-reveal">
            <FeedbackIcon size={16} />
            <span>
              <strong>{view.feedback.portionTooBigPercent}%</strong> say a full portion is too much
            </span>
          </p>
        )}
      </section>

      <section className="eco-step" aria-labelledby="eco-s2">
        <div className="eco-step__head">
          <span className="eco-step__num" aria-hidden="true">
            2
          </span>
          <h3 id="eco-s2" className="eco-step__title">
            Kitchen plan
          </h3>
          <InfoTip label="About the forecast">
            Any number in the range is equally likely. Cook more and fewer students miss out, but more food may be wasted.
          </InfoTip>
        </div>
        <Forecast view={view} />
        <Portions view={view} />
        <div className="eco-risk" aria-live="polite">
          <div className="eco-risk__item">
            <div className="eco-risk__row">
              <span>Shortage risk</span>
              <strong>{risk.shortagePercent}%</strong>
            </div>
            <div className="eco-meter eco-meter--short" aria-hidden="true">
              <span style={{ width: `${risk.shortagePercent}%` }} />
            </div>
          </div>
          <div className="eco-risk__item">
            <div className="eco-risk__row">
              <span>Likely waste</span>
              <strong>
                ~{risk.expectedWaste}
                {!risk.plateWasteKnown && "+"}
              </strong>
            </div>
            <div className="eco-meter eco-meter--waste" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (risk.expectedWaste / 40) * 100)}%` }} />
            </div>
          </div>
        </div>
        {policy.offerSmallServings && !risk.plateWasteKnown && (
          <p className="eco-hint-line">Risk assumes full portions. Feedback shows how far small servings stretch the food.</p>
        )}
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
          <span className="eco-switch__label">Offer small servings</span>
          <InfoTip label="About small servings">
            Students who ask get about 60% of a portion. Less is left on plates, but each student takes a little longer to
            serve. It saves food only if the kitchen also cooks less.
          </InfoTip>
        </label>
        {!view.capacityCoversForecastHigh && (
          <p className="eco-note">Counter serves ~{view.capacity} in {BALANCE.lunchWindowMinutes} min</p>
        )}
      </section>
    </SidePanel>
  );
}

function Forecast({ view }: { view: PlanningView }) {
  const pos = (n: number) => `${((Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, n)) - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%`;
  const { low, high, basis } = view.forecast;
  return (
    <div>
      <div className="eco-forecast">
        <div>
          <div className="eco-forecast__lab">Low</div>
          <div className="eco-forecast__num">{low}</div>
        </div>
        <div className="eco-forecast__mid">
          Expected students
          {basis === "rsvp" && <span className="eco-forecast__tag">RSVP</span>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="eco-forecast__lab">High</div>
          <div className="eco-forecast__num">{high}</div>
        </div>
      </div>
      <div className="eco-track" aria-hidden="true">
        <span className="eco-track__band" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
        <span className="eco-track__mark" style={{ left: pos(view.portions) }} />
      </div>
    </div>
  );
}

function Portions({ view }: { view: PlanningView }) {
  const { store } = useEcoEnv();
  const value = view.portions;
  return (
    <div className="eco-portions">
      <label htmlFor="eco-portions">Portions</label>
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
      <input
        className="eco-num"
        type="number"
        min={0}
        max={BALANCE.maxPortionsPrepared}
        value={value}
        aria-label="Portions to cook"
        onChange={(e) => store.actions.setPortions(Number(e.target.value))}
      />
    </div>
  );
}

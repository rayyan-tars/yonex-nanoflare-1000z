"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { BALANCE } from "../model/config";
import { planRisk, planningView, voiceTokensUsed } from "../model/planning";
import { getScenario } from "../model/scenarios";
import type { StudentVoiceAction } from "../model/types";
import { prefersReducedMotion } from "../state/store";
import { useEco, useEcoEnv } from "./context";
import { ClipboardIcon, CloseIcon, FeedbackIcon, SmallBowlIcon, UsersIcon } from "./icons";

/** This session's player has opened the prep counter (retires the "Tap the cafeteria" hint). */
export const prepSession = { opened: false };

const LARGE = 10;
const SMALL = 5;

const ASKS: { action: StudentVoiceAction; label: string; hint: string; Icon: typeof ClipboardIcon }[] = [
  { action: "rsvp", label: "RSVP", hint: "Students say if they'll eat: a narrower crowd estimate.", Icon: ClipboardIcon },
  { action: "feedback", label: "Feedback", hint: "Find out how many think a full portion is too much.", Icon: FeedbackIcon },
  { action: "smallPlease", label: "Small please", hint: "Students who leave food ask for a small serving.", Icon: SmallBowlIcon },
];

/**
 * The lunch plan at the counter: ask the students, set out pots, serve.
 * A compact, world-first replacement for the planning form; it drives the
 * same store actions, so the simulation is unchanged.
 */
export function PrepBar() {
  const { store } = useEcoEnv();
  const voice = useEco((s) => s.save.draft.voice);
  const policy = useEco((s) => s.save.draft.policy);
  const upgrades = useEco((s) => s.upgrades);
  const scenarioId = useEco((s) => s.save.scenarioId);
  const reduced = useEco(prefersReducedMotion);
  const scenario = getScenario(scenarioId);
  const view = useMemo(() => planningView(scenario, voice, policy, upgrades), [scenario, voice, policy, upgrades]);
  const risk = useMemo(() => planRisk(view, policy.offerSmallServings), [view, policy.offerSmallServings]);
  const meals = view.portions;
  const used = voiceTokensUsed(voice);
  const max = BALANCE.maxStudentVoiceTokens;
  const { low, high } = view.forecast;
  useEffect(() => {
    prepSession.opened = true;
  }, []);

  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? Math.floor(meals / SMALL) * SMALL + SMALL : Math.ceil(meals / SMALL) * SMALL - SMALL;
    store.actions.setPortions(Math.max(0, Math.min(BALANCE.maxPortionsPrepared, next)));
  };

  // Plain words for the same model risk: uncertainty is named, a reasonable trade-off is not scolded.
  const status =
    risk.confidence === "low"
      ? { tone: "warn", text: "No student feedback yet" }
      : risk.shortagePercent >= 50
        ? { tone: "bad", text: "Likely to run out" }
        : risk.shortagePercent >= 20
          ? { tone: "warn", text: "Tight plan" }
          : risk.expectedWaste >= 20
            ? { tone: "warn", text: "Likely surplus" }
            : risk.shortagePercent >= 5
              ? { tone: "good", text: "Balanced, some uncertainty" }
              : risk.expectedWaste >= 10
                ? { tone: "good", text: "Safer buffer" }
                : { tone: "good", text: "Balanced" };
  const detail =
    risk.confidence === "low"
      ? "Without Feedback the kitchen can't tell how far small plates stretch the food. Ask students for a clearer estimate."
      : `Runs short on about ${risk.shortagePercent}% of likely days; about ${risk.expectedWaste}${risk.plateWasteKnown ? "" : "+"} portions left over.`;

  // Crowd band and meal marker on one shared scale.
  const lo = Math.min(low, meals) - 10;
  const hi = Math.max(high, meals) + 10;
  const at = (n: number) => `${((n - lo) / (hi - lo)) * 100}%`;

  return (
    <motion.section
      className="eco-prep"
      aria-label="Plan today's lunch"
      initial={reduced ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="eco-prep__group eco-prep__ask">
        <p className="eco-prep__label">
          Ask students
          <span className="eco-prep__tokens" aria-label={`${max - used} of ${max} asks left`} role="img">
            {Array.from({ length: max }, (_, i) => (
              <i key={i} className={i < used ? "is-used" : undefined} />
            ))}
          </span>
        </p>
        <div className="eco-prep__asks">
          {ASKS.map(({ action, label, hint, Icon }) => {
            const on = voice[action];
            return (
              <button
                key={action}
                type="button"
                className={`eco-ask${on ? " is-on" : ""}${!on && used >= max ? " is-blocked" : ""}`}
                aria-pressed={on}
                title={hint}
                onClick={() => store.actions.toggleVoice(action)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <p className="eco-prep__crowd">
          <UsersIcon size={15} />
          <strong>
            {low}–{high}
          </strong>{" "}
          coming
          {view.feedback && <span className="eco-prep__reveal">{view.feedback.portionTooBigPercent}% want less</span>}
        </p>
      </div>

      <div className="eco-prep__group eco-prep__food">
        <p className="eco-prep__label">Food prep</p>
        <div className="eco-prep__pots-row">
          <button type="button" className="eco-prep__step" onClick={() => step(-1)} aria-label="Remove 5 meals" disabled={meals <= 0}>
            −
          </button>
          <Pots meals={meals} />
          <button type="button" className="eco-prep__step" onClick={() => step(1)} aria-label="Add 5 meals" disabled={meals >= BALANCE.maxPortionsPrepared}>
            +
          </button>
        </div>
        <div className="eco-prep__fit">
          <span className="eco-prep__meals" aria-live="polite">
            <strong>{meals}</strong> meals
          </span>
          <span className="eco-prep__track" aria-hidden="true">
            <span className="eco-prep__band" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
            <span className="eco-prep__mark" style={{ left: at(meals) }} />
          </span>
          <span className={`eco-prep__status is-${status.tone}`} title={detail}>
            {status.text}
            <span className="sr-only">. {detail}</span>
          </span>
        </div>
        <button
          type="button"
          className={`eco-ask eco-ask--small${policy.offerSmallServings ? " is-on" : ""}`}
          aria-pressed={policy.offerSmallServings}
          title="Students who ask get about 60% of a portion."
          onClick={() => store.actions.setOfferSmall(!policy.offerSmallServings)}
        >
          <SmallBowlIcon size={16} />
          <span>Small plates</span>
        </button>
      </div>

      <ServeBell />

      <button type="button" className="eco-prep__close" onClick={store.actions.clearSelection} aria-label="Close lunch plan">
        <CloseIcon size={14} />
      </button>
    </motion.section>
  );
}

/** Pots on the counter: a large pot feeds 10, a small one 5; odd meals show as a ladle count. */
function Pots({ meals }: { meals: number }) {
  const large = Math.floor(meals / LARGE);
  const small = meals % LARGE >= SMALL ? 1 : 0;
  const extra = meals % SMALL;
  return (
    <span className="eco-pots" role="img" aria-label={`${large} large pots and ${small} small pot: ${meals} meals`}>
      {Array.from({ length: large }, (_, i) => (
        <PotSvg key={`l${i}`} size="large" />
      ))}
      {small > 0 && <PotSvg size="small" />}
      {extra > 0 && <span className="eco-pots__extra">+{extra}</span>}
    </span>
  );
}

function PotSvg({ size }: { size: "large" | "small" }) {
  const w = size === "large" ? 26 : 19;
  return (
    <svg className={`eco-pot eco-pot--${size}`} width={w} height={w} viewBox="0 0 26 26" aria-hidden="true">
      <path d="M8 6.5c0-1.4 1.6-2.4 2.6-1.6M13.5 5.8c.2-1.5 1.8-2.2 2.6-1.2" stroke="#ffffff" strokeOpacity=".75" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <ellipse cx="13" cy="10" rx="9.5" ry="2.6" fill="#7c8a8f" />
      <path d="M3.5 10v8.5c0 2 4.2 3.6 9.5 3.6s9.5-1.6 9.5-3.6V10" fill="#a9b5b9" />
      <path d="M3.5 10v8.5c0 2 4.2 3.6 9.5 3.6V12.6c-5.3 0-9.5-1.2-9.5-2.6Z" fill="#c6d0d3" />
      <ellipse cx="13" cy="10" rx="8.2" ry="2" fill="#d9a441" />
      <path d="M1.5 12.2h2M22.5 12.2h2" stroke="#5c676b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** One strong action: the bell starts lunch. */
function ServeBell() {
  const { store } = useEcoEnv();
  const reduced = useEco(prefersReducedMotion);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      className={`eco-bell${pressed ? " is-pressed" : ""}`}
      disabled={pressed}
      onClick={() => {
        if (reduced) return store.actions.serveLunch();
        setPressed(true);
        window.setTimeout(() => store.actions.serveLunch(), 150);
        window.setTimeout(() => setPressed(false), 1200);
      }}
    >
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <path d="M15 5.5a1.6 1.6 0 1 1 0 .1Z" fill="#e2c27a" />
        <path d="M5 21c0-6 4.4-10.5 10-10.5S25 15 25 21Z" fill="#e2c27a" />
        <rect x="3" y="21" width="24" height="3" rx="1.5" fill="#c9a24b" />
      </svg>
      <span>Serve</span>
    </button>
  );
}

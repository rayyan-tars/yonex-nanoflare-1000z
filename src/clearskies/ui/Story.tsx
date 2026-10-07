"use client";

import { ArrowRight, ArrowsCounterClockwise, Check, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PLEDGES, STEPS, airBand } from "../model/level";
import { useGame } from "./context";

type Tone = "good" | "fair" | "poor" | "bad";

/** Mia lives in the town. Her face shows how the air feels. */
export function Mia({ tone, size = 64 }: { tone: Tone; size?: number }) {
  const mouth = {
    good: "M22 40 Q32 49 42 40",
    fair: "M23 42 Q32 45 41 42",
    poor: "M24 44 Q32 40 40 44",
    bad: "M24 45 Q32 39 40 45",
  }[tone];
  return (
    <svg className={`cs-mia cs-mia--${tone}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" className="cs-mia__bg" />
      <path d="M10 28 Q12 6 32 6 Q52 6 54 28 Q50 16 32 15 Q14 16 10 28 Z" fill="#5a3a22" />
      <circle cx="32" cy="34" r="20" fill="#f4c9a3" />
      <path d="M12 30 Q14 12 32 12 Q50 12 52 30 Q46 20 32 20 Q18 20 12 30 Z" fill="#6b4428" />
      <circle cx="24" cy="33" r="2.6" fill="#2b2b2b" />
      <circle cx="40" cy="33" r="2.6" fill="#2b2b2b" />
      {(tone === "good" || tone === "fair") && (
        <>
          <circle cx="19" cy="39" r="3" fill="#f29a8a" opacity="0.6" />
          <circle cx="45" cy="39" r="3" fill="#f29a8a" opacity="0.6" />
        </>
      )}
      {tone === "bad" ? (
        <g>
          <path d="M17 37 Q32 33 47 37 L45 48 Q32 53 19 48 Z" fill="#e8eef2" stroke="#9aa6ae" strokeWidth="1" />
          <path d="M20 41 H44 M21 45 H43" stroke="#b8c2c8" strokeWidth="1" />
        </g>
      ) : (
        <path d={mouth} stroke="#7a3a2a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      )}
      {(tone === "poor" || tone === "bad") && (
        <g className="cs-mia__cough">
          <circle cx="54" cy="44" r="3" />
          <circle cx="58" cy="38" r="2" />
        </g>
      )}
    </svg>
  );
}

const MIA_SAYS: Record<string, string> = {
  start: "*cough* The air hurts when I walk to school.",
  power: "The sky looks lighter already!",
  traffic: "Mum says I can bike to school now!",
  nature: "I can see the hills again. And smell the trees!",
};

/** Index 0..40+ placed on a gauge from Good to Very unhealthy. */
function gaugePos(v: number) {
  return Math.min(100, Math.max(0, (v / 40) * 100));
}

export function AirCard() {
  const store = useGame();
  const v = store.air;
  const band = airBand(v);
  const done = store.phase === "learned" || store.phase === "reveal" || store.phase === "finale" ? store.stepIndex + 1 : store.stepIndex;
  const says = done === 0 ? MIA_SAYS.start : MIA_SAYS[STEPS[done - 1].id];
  return (
    <section className={`cs-air cs-air--${band.tone}`} aria-label="Air quality">
      <Mia tone={band.tone} />
      <div className="cs-air__body">
        <div className="cs-air__top">
          <span className="cs-air__label">Air where people live</span>
          <b className="cs-air__band" aria-live="polite">
            {band.label}
          </b>
        </div>
        <div className="cs-gauge" role="meter" aria-valuemin={0} aria-valuemax={40} aria-valuenow={Math.round(v)} aria-valuetext={`${band.label}, index ${Math.round(v)}`}>
          <i className="cs-gauge__marker" style={{ left: `${gaugePos(v)}%` }} />
        </div>
        <p className="cs-air__says">
          <b>Mia:</b> {says}
        </p>
      </div>
      <ol className="cs-steps" aria-label="Decisions">
        {STEPS.map((s, k) => (
          <li key={s.id} className={k < done ? "is-done" : k === store.stepIndex && store.phase !== "intro" ? "is-now" : undefined}>
            <span>{k < done ? <Check weight="bold" /> : k + 1}</span>
            {s.id === "power" ? "Power" : s.id === "traffic" ? "Traffic" : "Nature"}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Intro() {
  const store = useGame();
  return (
    <motion.section
      className="cs-intro"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      aria-labelledby="cs-intro-title"
    >
      <p className="cs-eyebrow">A town with one problem</p>
      <h1 id="cs-intro-title" className="cs-display">
        Clear Skies
      </h1>
      <p className="cs-lead">
        Greenhold is covered in smog. Its power comes from burning coal and almost everyone drives. You have <b>three decisions</b> to clear the air for Mia and her
        neighbours.
      </p>
      <p className="cs-fact">
        Air pollution is one of the greatest environmental risks to health. <span>World Health Organization</span>
      </p>
      <button type="button" className="cs-btn cs-btn--go" onClick={() => store.begin()}>
        Start <ArrowRight weight="bold" aria-hidden="true" />
      </button>
      <p className="cs-small">Drag to look around, scroll or pinch to zoom. Air numbers are a simplified game index.</p>
    </motion.section>
  );
}

export function Decision() {
  const store = useGame();
  const step = store.step;
  const k = store.stepIndex;
  const tried = step.choices.find((c) => c.id === store.tried) ?? null;
  const working = store.phase === "working";
  const learned = store.phase === "learned";
  const before = store.readings[k];
  const after = store.readings[k + 1];
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (learned) nextRef.current?.focus();
  }, [learned]);
  return (
    <motion.section
      key={step.id}
      className="cs-decision"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      aria-labelledby="cs-step-title"
    >
      <header className="cs-decision__head">
        <span className="cs-eyebrow">
          Decision {k + 1} of {STEPS.length}
        </span>
        <h2 id="cs-step-title" className="cs-display">
          {step.title}
        </h2>
        {!learned && <p>{step.problem}</p>}
      </header>

      {!learned && (
        <div className="cs-choices" role="group" aria-label="Options">
          {step.choices.map((c) => {
            const state = store.tried === c.id ? (c.good ? "is-right" : "is-wrong") : "";
            return (
              <button key={c.id} type="button" className={`cs-choice ${state}`} disabled={working} onClick={() => store.choose(c.id)} aria-pressed={store.tried === c.id}>
                <span className="cs-choice__pic" aria-hidden="true">
                  {store.previews[c.pic] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={store.previews[c.pic]} alt="" />
                  )}
                </span>
                <span className="cs-choice__text">
                  <b>{c.title}</b>
                  <small>{c.blurb}</small>
                </span>
                {store.tried === c.id && (
                  <span className="cs-choice__mark" aria-hidden="true">
                    {c.good ? <Check weight="bold" /> : <X weight="bold" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tried && !tried.good && !working && (
        <motion.p key={tried.id} className="cs-why cs-why--wrong" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <b>That won&rsquo;t clear the air.</b> {tried.feedback} Try another option.
        </motion.p>
      )}
      {working && (
        <p className="cs-why cs-why--working" role="status">
          <span className="cs-spinner" aria-hidden="true" /> {tried?.feedback}
        </p>
      )}
      {learned && (
        <motion.div className="cs-learned" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="cs-why cs-why--right">
            <b>Why it works.</b> {step.fact}
          </p>
          <div className="cs-learned__row">
            {before !== undefined && after !== undefined && (
              <span className="cs-change">
                Air <b className={`cs-tone--${airBand(before).tone}`}>{airBand(before).label}</b>
                <ArrowRight weight="bold" aria-hidden="true" />
                <b className={`cs-tone--${airBand(after).tone}`}>{airBand(after).label}</b>
              </span>
            )}
            <button ref={nextRef} type="button" className="cs-btn cs-btn--go" onClick={() => store.next()}>
              {k < STEPS.length - 1 ? "Next decision" : "See the difference"} <ArrowRight weight="bold" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}

export function Reveal() {
  return (
    <div className="cs-reveal" role="status">
      <span className="cs-spinner" aria-hidden="true" /> Letting the last of the smog clear…
    </div>
  );
}

/** Drag across the same view of the town, before and after your decisions. */
function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="cs-compare">
      <div className="cs-compare__frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt="Greenhold after your decisions: clear air, wind turbines, bike lanes and trees" />
        <div className="cs-compare__before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt="Greenhold at the start: smog from coal plants and traffic" />
        </div>
        <span className="cs-compare__line" style={{ left: `${pos}%` }} aria-hidden="true">
          <i />
        </span>
        <span className="cs-compare__tag cs-compare__tag--l">Before</span>
        <span className="cs-compare__tag cs-compare__tag--r">After</span>
      </div>
      <label className="cs-compare__range">
        <span className="cs-sr">Compare before and after</span>
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} id="cs-compare" />
      </label>
    </div>
  );
}

export function Finale() {
  const store = useGame();
  const start = store.readings[0];
  const end = store.readings[store.readings.length - 1];
  const b0 = airBand(start);
  const b1 = airBand(end);
  const drop = start > 0 ? Math.round((1 - end / start) * 100) : 0;
  return (
    <motion.div className="cs-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.section
        className="cs-finale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-finale-title"
        initial={{ y: 30, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
      >
        <div className="cs-finale__head">
          <Mia tone="good" size={56} />
          <div>
            <p className="cs-eyebrow">You cleared the skies</p>
            <h2 id="cs-finale-title" className="cs-display">
              Same town. Same people. Cleaner air.
            </h2>
          </div>
        </div>
        {store.snapshots.before && store.snapshots.after && <BeforeAfter before={store.snapshots.before} after={store.snapshots.after} />}
        <div className="cs-result">
          <span className={`cs-result__pill cs-tone-bg--${b0.tone}`}>
            <small>Before</small>
            {b0.label}
          </span>
          <ArrowRight weight="bold" aria-hidden="true" />
          <span className={`cs-result__pill cs-tone-bg--${b1.tone}`}>
            <small>After</small>
            {b1.label}
          </span>
          <span className="cs-result__drop">
            <b>{drop}%</b> less air pollution where people live (game index)
          </span>
        </div>
        <ul className="cs-changed">
          <li>
            <b>Power</b> Coal plants replaced by wind, solar and a battery.
          </li>
          <li>
            <b>Traffic</b> Bike lanes past every home and buses within walking distance.
          </li>
          <li>
            <b>Nature</b> Street trees and green roofs.
          </li>
        </ul>
        <Pledge />
        <div className="cs-finale__foot">
          <button type="button" className="cs-btn" onClick={() => store.restart()}>
            <ArrowsCounterClockwise weight="bold" aria-hidden="true" /> Play again
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function Pledge() {
  const store = useGame();
  return (
    <section className="cs-pledge" aria-labelledby="cs-pledge-title">
      <h3 id="cs-pledge-title">Now clear the air for real. Pick what you&rsquo;ll do this week:</h3>
      <div className="cs-pledge__list">
        {PLEDGES.map((p) => {
          const on = store.pledges.includes(p.id);
          return (
            <button key={p.id} type="button" className={`cs-pledge__item ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => store.togglePledge(p.id)}>
              <span className="cs-pledge__box" aria-hidden="true">
                {on && <Check weight="bold" />}
              </span>
              {p.text}
            </button>
          );
        })}
      </div>
      {store.pledges.length > 0 && (
        <p className="cs-pledge__done" role="status">
          {store.pledges.length === 1 ? "One promise" : `${store.pledges.length} promises`} made. Small actions add up when lots of people do them.
        </p>
      )}
    </section>
  );
}

export function SoundToggle() {
  const store = useGame();
  return (
    <button type="button" className="cs-icon-btn" onClick={() => store.setSound(!store.sound)} aria-pressed={store.sound} aria-label={store.sound ? "Sound on" : "Sound off"}>
      {store.sound ? <SpeakerHigh weight="fill" /> : <SpeakerSlash weight="fill" />}
    </button>
  );
}

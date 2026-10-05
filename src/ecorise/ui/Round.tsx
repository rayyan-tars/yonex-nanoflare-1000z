"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { UNITS_PER_PORTION } from "../model/config";
import type { RoundReport } from "../model/report";
import { getScenario } from "../model/scenarios";
import type { ActiveRound } from "../state/store";
import { useEco, useEcoEnv } from "./context";
import { AlertIcon, BulbIcon, CoinIcon, StarIcon } from "./icons";
import { SidePanel } from "./SidePanel";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const clock = (minute: number) => {
  const m = Math.floor(minute);
  return `12:${String(m).padStart(2, "0")}`;
};

/** Minimal live display during lunch. Counts come straight from the report's timeline. */
export function ServiceHud({ round, figureSize }: { round: ActiveRound; figureSize: number }) {
  const { bus, store } = useEcoEnv();
  const [processed, setProcessed] = useState(0);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [caption, setCaption] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashed = useRef<Set<string>>(new Set());
  const report = round.report;
  const steps = report.timeline.steps;
  const total = steps.length;
  const step = processed > 0 ? steps[processed - 1] : null;
  const served = step?.served ?? 0;
  const prepared = report.player.result.food.prepared;
  const left = step ? step.foodLeft : prepared;
  const minute = step?.minute ?? 0;

  useEffect(() => bus.on("serviceProgress", (e) => setProcessed(e.processed)), [bus]);
  useEffect(() => {
    const t = window.setTimeout(() => setCaption(false), 4500);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const tl = report.timeline;
    const show = (key: string, text: string) => {
      if (flashed.current.has(key)) return;
      flashed.current.add(key);
      setFlash(text);
      window.setTimeout(() => setFlash((f) => (f === text ? null : f)), 2200);
    };
    if (tl.foodRanOutAt !== null && processed > tl.foodRanOutAt) show("food", "Food ran out");
    if (tl.windowClosedAt !== null && processed > tl.windowClosedAt) show("time", "Lunch time is over");
  }, [processed, report]);

  const changeSpeed = (s: 1 | 2) => {
    setSpeed(s);
    bus.emit("serviceSpeed", { speed: s });
  };
  const skip = () => {
    bus.emit("serviceSkip", undefined);
    // Safety net: never leave the player stuck if the city view is unavailable.
    window.setTimeout(() => {
      if (store.getState().phase === "serving") store.actions.finishService();
    }, 900);
  };

  return (
    <>
      <motion.div
        className="eco-service"
        role="status"
        aria-label="Lunch service"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <div className="eco-service__cell">
          <span className="eco-service__lab">Lunch</span>
          <span className="eco-service__val">{clock(minute)}</span>
        </div>
        <div className="eco-service__cell">
          <span className="eco-service__lab">Served</span>
          <span className="eco-service__val">
            {served} <small>/ {total}</small>
          </span>
        </div>
        <div className={`eco-service__cell eco-pot${left === 0 ? " eco-pot--empty" : ""}`}>
          <div>
            <span className="eco-service__lab">Food left</span>
            <span className="eco-service__val" style={{ display: "block" }}>
              {fmt(left / UNITS_PER_PORTION)} <small>portions</small>
            </span>
          </div>
          <span className="eco-pot__gauge" aria-hidden="true">
            <span style={{ width: `${prepared === 0 ? 0 : (left / prepared) * 100}%` }} />
          </span>
        </div>
        <div className="eco-speed" role="group" aria-label="Playback speed">
          <button type="button" aria-pressed={speed === 1} onClick={() => changeSpeed(1)}>
            1×
          </button>
          <button type="button" aria-pressed={speed === 2} onClick={() => changeSpeed(2)}>
            2×
          </button>
          <button type="button" onClick={skip}>
            Skip
          </button>
        </div>
        <AnimatePresence>
          {caption && (
            <motion.span className="eco-service__caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              1 figure ≈ {figureSize} students
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash}
            className="eco-flash"
            role="alert"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function FoodFlow({ report }: { report: RoundReport }) {
  const food = report.player.result.food;
  const p = food.prepared;
  const pct = (u: number) => (p === 0 ? 0 : (u / p) * 100);
  return (
    <div className="eco-flow">
      <div className="eco-flow__bar" role="img" aria-label="Where the cooked food went">
        <span className="c-eaten" style={{ width: `${pct(food.eaten)}%` }} />
        <span className="c-plate" style={{ width: `${pct(food.plateWaste)}%` }} />
        <span className="c-surplus" style={{ width: `${pct(food.unserved)}%` }} />
      </div>
      <div className="eco-flow__legend">
        <span>
          Cooked <b>{fmt(p / UNITS_PER_PORTION)}</b>
        </span>
        <span>
          <i className="c-eaten" /> Eaten <b>{fmt(food.eaten / UNITS_PER_PORTION)}</b>
        </span>
        <span>
          <i className="c-plate" /> Left on plates <b>{fmt(food.plateWaste / UNITS_PER_PORTION)}</b>
        </span>
        <span>
          <i className="c-surplus" /> Never served <b>{fmt(food.unserved / UNITS_PER_PORTION)}</b>
        </span>
      </div>
    </div>
  );
}

function Comparison({ report }: { report: RoundReport }) {
  const base = report.baseline.waste.avoidable;
  const you = report.player.waste.avoidable;
  const scale = Math.max(base, you, 1);
  const attendance = report.player.result.attendance;
  let verdict: React.ReactNode;
  if (!report.player.fed) {
    verdict = (
      <>
        Business as usual fed everyone.
        <small>Wasting less only counts when students still get lunch.</small>
      </>
    );
  } else if (report.prevented > 0) {
    verdict = (
      <>
        {fmt(report.prevented)} portions not wasted
        {report.percentLess !== null && <small>{report.percentLess}% less waste than business as usual</small>}
      </>
    );
  } else if (report.prevented < 0) {
    verdict = (
      <>
        {fmt(-report.prevented)} more portions wasted
        <small>than a kitchen cooking for the top of the forecast</small>
      </>
    );
  } else {
    verdict = <>The same waste as business as usual</>;
  }
  return (
    <section className="eco-compare" aria-label="Simulated comparison">
      <span className="eco-compare__tag">Simulated comparison · same {attendance} students</span>
      <div className="eco-compare__row">
        <span>Business as usual</span>
        <span className="eco-compare__bar eco-compare__bar--base">
          <span style={{ width: `${(base / scale) * 100}%` }} />
        </span>
        <b>{fmt(base)}</b>
      </div>
      <div className="eco-compare__row">
        <span>Your plan</span>
        <span className="eco-compare__bar eco-compare__bar--you">
          <span style={{ width: `${(you / scale) * 100}%` }} />
        </span>
        <b>{fmt(you)}</b>
      </div>
      <p className="eco-compare__verdict">{verdict}</p>
    </section>
  );
}

export function ResultsPanel({ round }: { round: ActiveRound }) {
  const { store } = useEcoEnv();
  const report = round.report;
  const res = report.player.result;
  const def = getScenario(report.scenarioId).definition;
  const missed = res.missedBecauseFoodRanOut + res.missedBecauseServiceTimeEnded;
  const perMeal = report.player.waste.perMeal;
  const best = useEco((s) => s.save.progress.ledger.scenarios[report.scenarioId]?.bestCreditedValue ?? 0);
  const campus = useEco((s) => s.save.progress.campus);
  const canImprove = campus.planningHubUnlocked && !campus.planningHubBuilt;
  const stars = [
    { on: report.stars.fed, label: "Everyone fed" },
    { on: report.stars.lowWaste, label: "Low waste" },
    { on: report.stars.beatBaseline, label: "Beat usual" },
  ];

  return (
    <SidePanel
      eyebrow={`${def.dayLabel} lunch · simulated results`}
      title={report.stars.count === 3 ? "A lunch to be proud of" : report.player.fed ? "Everyone ate" : "Not everyone ate"}
      onClose={store.actions.tryAgain}
      closeLabel="Close results and plan again"
      className="eco-results"
      footer={
        <div className="eco-row eco-row--between">
          <button type="button" className="eco-link" onClick={() => store.actions.openOverlay("about")}>
            How is this worked out?
          </button>
          <span className="eco-row">
            <button
              type="button"
              className={`eco-btn${canImprove ? "" : " eco-btn--primary"}`}
              onClick={store.actions.tryAgain}
              data-autofocus={canImprove ? undefined : true}
            >
              Try again
            </button>
            {canImprove && (
              <button type="button" className="eco-btn eco-btn--primary eco-btn--gold" onClick={store.actions.improveCampus} data-autofocus>
                Improve campus
              </button>
            )}
          </span>
        </div>
      }
    >
      <div className="eco-stars" role="list" aria-label={`${report.stars.count} of 3 stars`}>
        {stars.map((s) => (
          <div key={s.label} role="listitem" className={`eco-star${s.on ? " eco-star--on" : ""}`}>
            <StarIcon size={20} />
            <span>
              {s.label}
              <span className="sr-only">{s.on ? " achieved" : " not achieved"}</span>
            </span>
          </div>
        ))}
      </div>

      {round.unlockedPlanningHub && (
        <p className="eco-unlock" role="status">
          <strong>Planning Hub unlocked</strong>
          <span>Better lunch data can reduce uncertainty.</span>
        </p>
      )}

      {missed > 0 && (
        <p className="eco-alert" role="alert">
          <AlertIcon size={18} /> {missed} {missed === 1 ? "student" : "students"} missed lunch
          {res.missedBecauseFoodRanOut >= res.missedBecauseServiceTimeEnded ? " (food ran out)" : " (queue too slow)"}
        </p>
      )}

      <div className={`eco-kpi${report.player.fed ? "" : " eco-kpi--muted"}`}>
        <span className="eco-kpi__num">{perMeal === null ? "–" : perMeal.toFixed(2)}</span>
        <span>
          <span className="eco-kpi__label">portions wasted per meal served</span>
          <br />
          <span className="eco-kpi__sub">
            {fmt(report.player.waste.avoidable)} wasted · {res.hotMeals} of {res.attendance} fed
          </span>
        </span>
      </div>

      <FoodFlow report={report} />
      <Comparison report={report} />

      <div className="eco-credits">
        <span className="eco-credits__val">
          <CoinIcon size={20} /> +{round.credited} Eco Credits
        </span>
        <span className="eco-credits__note">
          {round.creditReason === "improvement"
            ? round.previousBest > 0
              ? "Improvement on your best"
              : "First result for Monday"
            : `Replays pay only for beating your best (${best})`}
        </span>
      </div>

      <p className="eco-insight">
        <BulbIcon size={18} />
        <span>{report.insight}</span>
      </p>

      <details className="eco-details">
        <summary>All numbers</summary>
        <table>
          <tbody>
            <tr>
              <td>Expected students</td>
              <td>
                {report.forecast.low}–{report.forecast.high}
              </td>
            </tr>
            <tr>
              <td>Actual students</td>
              <td>{res.attendance}</td>
            </tr>
            <tr>
              <td>Portions cooked</td>
              <td>{fmt(res.food.prepared / UNITS_PER_PORTION)}</td>
            </tr>
            <tr>
              <td>Hot meals served</td>
              <td>
                {res.hotMeals} ({res.smallServings} small)
              </td>
            </tr>
            <tr>
              <td>Students without a meal</td>
              <td>{missed}</td>
            </tr>
            <tr>
              <td>Never served (surplus)</td>
              <td>{fmt(report.player.waste.surplus)}</td>
            </tr>
            <tr>
              <td>Left on plates</td>
              <td>{fmt(report.player.waste.plateWaste)}</td>
            </tr>
            <tr>
              <td>Avoidable waste</td>
              <td>{fmt(report.player.waste.avoidable)}</td>
            </tr>
            <tr>
              <td>Food use (eaten ÷ cooked)</td>
              <td>{res.foodUseShare === null ? "–" : `${Math.round(res.foodUseShare * 100)}%`}</td>
            </tr>
            <tr>
              <td>Low-waste target</td>
              <td>≤ {report.lowWasteTarget.toFixed(2)} per meal</td>
            </tr>
          </tbody>
        </table>
      </details>
    </SidePanel>
  );
}

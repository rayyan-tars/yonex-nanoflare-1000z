"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { forecastRange } from "../model/planning";
import { getScenario } from "../model/scenarios";
import { PLANNING_HUB_COST, planningHubRefusal } from "../state/store";
import { useEco, useEcoEnv } from "./context";
import { ClipboardIcon, CoinIcon, LockIcon, OfficeIcon, PlayIcon } from "./icons";
import { SidePanel } from "./SidePanel";

/** Smoothly counts a number to its new value (instant with reduced motion). */
export function useAnimatedNumber(value: number, reduced: boolean, duration = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, reduced, duration]);
  return reduced ? value : shown;
}

function useHubRanges() {
  const scenarioId = useEco((s) => s.save.scenarioId);
  const scenario = getScenario(scenarioId);
  return {
    before: forecastRange(scenario, { rsvp: false, planningOffice: false }),
    after: forecastRange(scenario, { rsvp: false, planningOffice: true }),
  };
}

/** The one thing you can build: shown when the plot is chosen. */
export function BuildCard() {
  const { store } = useEcoEnv();
  const credits = useEco((s) => s.save.progress.credits);
  const refusal = useEco(planningHubRefusal);
  const { before, after } = useHubRanges();
  const phase = useEco((s) => s.phase);
  return (
    <SidePanel
      eyebrow="Improve campus"
      title="Planning Hub"
      onClose={phase === "building" ? store.actions.tryAgain : store.actions.clearSelection}
      compact
      footer={
        <button
          type="button"
          className="eco-btn eco-btn--primary eco-btn--serve"
          onClick={store.actions.buildPlanningHub}
          disabled={refusal !== null}
        >
          Build · <CoinIcon size={16} /> {PLANNING_HUB_COST}
        </button>
      }
    >
      <div className="eco-hubcard">
        <span className="eco-hubcard__icon">
          <OfficeIcon size={24} />
        </span>
        <div>
          <strong>Better attendance forecasts</strong>
          <span>Lunch RSVPs and past meal data in one place.</span>
        </div>
      </div>
      <div className="eco-range-compare" aria-label={`Expected students: ${before.low} to ${before.high} now, ${after.low} to ${after.high} with the hub`}>
        <span>
          Now <b>{before.low}–{before.high}</b>
        </span>
        <span aria-hidden="true">→</span>
        <span>
          With hub <b>{after.low}–{after.high}</b>
        </span>
      </div>
      <p className="eco-build-lock">
        <CoinIcon size={15} /> You have {credits} Eco Credits
        {refusal === "not-enough-credits" && ` · need ${PLANNING_HUB_COST - credits} more`}
      </p>
    </SidePanel>
  );
}

/** Plot info when nothing can be built yet, or once the hub stands. */
export function PlotInfo() {
  const { store } = useEcoEnv();
  const campus = useEco((s) => s.save.progress.campus);
  const { before, after } = useHubRanges();
  if (campus.planningHubUnlocked && !campus.planningHubBuilt) return <BuildCard />;
  return (
    <SidePanel
      eyebrow={campus.planningHubBuilt ? "Campus" : "Future building"}
      title={campus.planningHubBuilt ? "Planning Hub" : "East plot"}
      onClose={store.actions.clearSelection}
      compact
    >
      {campus.planningHubBuilt ? (
        <div className="eco-range-compare">
          <span>
            Forecast <s>{before.low}–{before.high}</s>
          </span>
          <span aria-hidden="true">→</span>
          <b>
            {after.low}–{after.high}
          </b>
        </div>
      ) : (
        <p className="eco-build-lock">
          <LockIcon size={15} /> Feed every student at lunch to unlock the Planning Hub.
        </p>
      )}
    </SidePanel>
  );
}

/** Prompt shown while the player picks the plot. */
export function BuildPrompt() {
  const { store } = useEcoEnv();
  return (
    <motion.div className="eco-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <span>Choose the highlighted plot</span>
      <button type="button" className="eco-banner__btn" onClick={() => store.actions.select("meadow")}>
        Choose plot
      </button>
      <button type="button" className="eco-banner__btn eco-banner__btn--ghost" onClick={store.actions.tryAgain}>
        Cancel
      </button>
    </motion.div>
  );
}

/** Minimal display while the hub is going up. */
export function ConstructionHud() {
  const { bus, store } = useEcoEnv();
  useEffect(() => {
    // Safety net: never leave the player stuck if the city view is unavailable.
    const t = window.setTimeout(() => {
      if (store.getState().phase === "constructing") store.actions.finishConstruction();
    }, 15000);
    return () => window.clearTimeout(t);
  }, [store]);
  return (
    <motion.div className="eco-banner" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <span className="eco-spinner" aria-hidden="true" />
      <span>Building the Planning Hub…</span>
      <button type="button" className="eco-banner__btn eco-banner__btn--ghost" onClick={() => bus.emit("constructionSkip", undefined)}>
        Skip
      </button>
    </motion.div>
  );
}

/** Shown when construction finishes: the upgrade and what it changed. */
export function BuiltCard() {
  const { store } = useEcoEnv();
  const { before, after } = useHubRanges();
  return (
    <SidePanel eyebrow="Campus improved" title="Planning Hub built" onClose={store.actions.tryAgain} compact
      footer={
        <button type="button" className="eco-btn eco-btn--primary eco-btn--serve" onClick={store.actions.tryAgain} data-autofocus>
          <PlayIcon size={16} /> Try another lunch
        </button>
      }
    >
      <p className="eco-built-lead">Better lunch data narrows the forecast.</p>
      <div className="eco-range-big">
        <div>
          <span className="eco-forecast__lab">Before</span>
          <span className="eco-range-big__old">
            {before.low}–{before.high}
          </span>
        </div>
        <span aria-hidden="true" className="eco-range-big__arrow">
          →
        </span>
        <div>
          <span className="eco-forecast__lab">Now</span>
          <span className="eco-range-big__new">
            {after.low}–{after.high}
          </span>
        </div>
      </div>
      <p className="eco-small eco-muted">Still a range: the hub improves information, it doesn&rsquo;t reveal the answer.</p>
      <button
        type="button"
        className="eco-bridge eco-bridge--btn"
        onClick={() => {
          store.actions.tryAgain();
          store.actions.openMission("school");
        }}
      >
        <ClipboardIcon size={18} />
        <span>
          <strong>Try it for real:</strong> the Cafeteria Waste Audit applies the same idea at your school.
        </span>
      </button>
    </SidePanel>
  );
}

"use client";

import { getScenario } from "../model/scenarios";
import { prefersReducedMotion } from "../state/store";
import { useAnimatedNumber } from "./Campus";
import { useEco, useEcoEnv } from "./context";
import { PlaytestChip } from "./Playtest";
import { ClipboardIcon, CoinIcon, GearIcon, HelpIcon, LeafIcon, LogoMark, PlayIcon, TargetIcon } from "./icons";

export function TopBar() {
  const { store } = useEcoEnv();
  const credits = useEco((s) => s.save.progress.credits);
  const pending = useEco((s) => (s.phase === "serving" && s.round ? s.round.credited : 0));
  const scenarioId = useEco((s) => s.save.scenarioId);
  const def = getScenario(scenarioId).definition;
  const serving = useEco((s) => s.phase === "serving");
  const reduced = useEco(prefersReducedMotion);
  const shownCredits = useAnimatedNumber(credits - pending, reduced);
  return (
    <header className="eco-topbar">
      <div className="eco-bar eco-brand">
        <LogoMark size={30} />
        <div>
          <p className="eco-brand__name">EcoRise</p>
          <p className="eco-brand__tag">Smarter lunches · less waste</p>
        </div>
      </div>
      {!serving && (
        <div className="eco-bar eco-status">
          <PlaytestChip />
          <span className="eco-chip">
            {def.dayLabel.slice(0, 3)}, Week 1
          </span>
          <span className="eco-sep" aria-hidden="true" />
          <span className="eco-chip" title="Eco Credits">
            <span key={credits - pending} className="eco-coin-pop" aria-hidden="true">
              <CoinIcon size={18} />
            </span>
            <span className="eco-chip__value">{shownCredits}</span>
            <span className="sr-only">Eco Credits</span>
          </span>
          <span className="eco-sep" aria-hidden="true" />
          <button type="button" className="eco-icon-btn" onClick={store.actions.showIntro} aria-label="How to play" title="How to play">
            <HelpIcon size={18} />
          </button>
          <button
            type="button"
            className="eco-icon-btn"
            onClick={() => store.actions.openOverlay("settings")}
            aria-label="Settings"
            title="Settings"
          >
            <GearIcon size={18} />
          </button>
        </div>
      )}
    </header>
  );
}

/** Bottom-left: the day's goal plus keyboard-reachable actions. */
export function Dock() {
  const { store, bus } = useEcoEnv();
  const selection = useEco((s) => s.selection);
  const campus = useEco((s) => s.save.progress.campus);
  return (
    <div className="eco-dock">
      <div className="eco-goal">
        <span className="eco-goal__icon" aria-hidden="true">
          <LeafIcon size={17} />
        </span>
        <span>
          <span className="eco-goal__title">Today&rsquo;s goal</span>
          <br />
          <span className="eco-goal__text">Feed every student, waste as little as you can.</span>
        </span>
      </div>
      {selection !== "kitchen" && (
        <button type="button" className="eco-dock__btn" data-place="kitchen" onClick={() => store.actions.select("kitchen")}>
          <PlayIcon size={14} /> Plan lunch
        </button>
      )}
      {selection !== "mission" && (
        <button type="button" className="eco-dock__btn" onClick={() => store.actions.openMission()} title="Cafeteria Waste Audit (real-world mission)">
          <ClipboardIcon size={15} /> Waste audit
        </button>
      )}
      {campus.planningHubUnlocked && !campus.planningHubBuilt && (
        <button type="button" className="eco-dock__btn eco-dock__btn--gold" onClick={store.actions.improveCampus}>
          Improve campus
        </button>
      )}
      <button
        type="button"
        className="eco-dock__btn eco-dock__icon"
        onClick={() => bus.emit("recenter", undefined)}
        aria-label="Recenter the view"
        title="Recenter the view"
      >
        <TargetIcon size={18} />
      </button>
    </div>
  );
}

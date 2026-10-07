"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { prepSession } from "./PrepBar";
import { useOpenMissions } from "./Missions";
import { GROWTH_STAGES } from "../state/persistence";
import { GROWTH_NAMES, prefersReducedMotion } from "../state/store";
import { useAnimatedNumber } from "./Campus";
import { useEco, useEcoEnv } from "./context";
import { PlaytestChip } from "./Playtest";
import { ClipboardIcon, CoinIcon, GearIcon, HelpIcon, LogoMark, PlayIcon, TargetIcon } from "./icons";

export function TopBar() {
  const { store } = useEcoEnv();
  const credits = useEco((s) => s.save.progress.credits);
  const pending = useEco((s) => (s.phase === "serving" && s.round ? s.round.credited : 0));
  const serving = useEco((s) => s.phase === "serving");
  const reduced = useEco(prefersReducedMotion);
  const shownCredits = useAnimatedNumber(credits - pending, reduced);
  const futures = useEco((s) => s.save.story.futuresUnlocked && s.phase !== "constructing");
  const savedGrowth = useEco((s) => s.save.story.growth);
  // The meter moves when the campus visibly changes (after the Ripple), not the instant lunch ends.
  const { bus } = useEcoEnv();
  const [shown, setShown] = useState(() => ({ level: savedGrowth, pulse: 0 }));
  useEffect(() => bus.on("growthShown", ({ level, rippled }) => setShown((p) => ({ level, pulse: rippled ? p.pulse + 1 : p.pulse }))), [bus]);
  const growth = Math.min(savedGrowth, shown.level);
  const sound = useEco((s) => s.save.settings.sound);
  const nextGrowth = growth < GROWTH_STAGES ? `Next strong lunch adds ${GROWTH_NAMES[growth]}` : "Your campus is fully grown";
  return (
    <header className="eco-topbar">
      <div className="eco-bar eco-brand">
        <LogoMark size={30} />
        <p className="eco-brand__name">
          Second Life <span>2050</span>
        </p>
      </div>
      {!serving && (
        <div className="eco-bar eco-status">
          <PlaytestChip />
          <span className="eco-chip" title="Eco Credits">
            <span key={credits - pending} className="eco-coin-pop" aria-hidden="true">
              <CoinIcon size={18} />
            </span>
            <span className="eco-chip__value">{shownCredits}</span>
            <span className="sr-only">Eco Credits</span>
          </span>
          <span className="eco-sep" aria-hidden="true" />
          <span key={shown.pulse} className={`eco-chip eco-growth${shown.pulse ? " is-pulsing" : ""}`} title={nextGrowth}>
            <span className="eco-growth__label">Toward 2050</span>
            <span className="eco-growth__track" aria-hidden="true">
              {Array.from({ length: GROWTH_STAGES }, (_, i) => (
                <i key={i} className={i < growth ? (i === growth - 1 && shown.pulse ? "is-on is-new" : "is-on") : undefined} />
              ))}
            </span>
            <span className="sr-only">
              Campus growth {growth} of {GROWTH_STAGES}. {nextGrowth}.
            </span>
          </span>
          <span className="eco-sep" aria-hidden="true" />
          {futures && (
            <button
              type="button"
              className="eco-future-btn"
              onClick={() => store.actions.openFutures()}
              aria-label="Open the two possible futures (2050)"
              title="Two possible futures"
            >
              2050
            </button>
          )}
          <button
            type="button"
            className="eco-icon-btn"
            onClick={() => store.actions.setSound(!sound)}
            aria-label={sound ? "Mute sound" : "Turn sound on"}
            aria-pressed={!sound}
            title={sound ? "Sound on" : "Sound off"}
          >
            <SoundIcon on={sound} />
          </button>
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
  const open = useOpenMissions();
  return (
    <div className="eco-dock">
      <button
        type="button"
        className="eco-dock__btn eco-dock__btn--missions"
        onClick={() => {
          store.actions.clearSelection();
          store.actions.openOverlay("missions");
        }}
        aria-label={`2050 Missions, ${open} open today`}
      >
        2050 Missions
        {open > 0 && (
          <span className="eco-dock__badge" aria-hidden="true">
            {open}
          </span>
        )}
      </button>
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

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity="0.15" />
      {on ? (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
        </>
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

/** Before the first lunch: one line, and the cafeteria glows in the world. */
export function LunchHint() {
  // Always renders (visibility is decided by the parent) so its fade-out can finish.
  // The tap hint is only for someone who hasn't opened the cafeteria yet.
  const learned = prepSession.opened;
  return (
    <motion.p className="eco-lunch-hint" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: 0.6 }}>
      <strong>Lunch starts soon.</strong> Feed everyone. Waste less.
      {!learned && <span>Tap the cafeteria</span>}
    </motion.p>
  );
}

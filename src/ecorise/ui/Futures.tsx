"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion } from "../state/store";
import { useEco, useEcoEnv } from "./context";

const YEARS = [2026, 2030, 2035, 2040, 2045, 2050];

/** 2026 → 2050 marks: today, a few faded years, one possible future. */
function Timeline({ animate }: { animate: boolean }) {
  return (
    <div className={`eco-timeline${animate ? " is-animated" : ""}`} aria-hidden="true">
      <span className="eco-timeline__line">
        <span />
      </span>
      {YEARS.map((y, i) => (
        <span key={y} className={`eco-timeline__mark${i === 0 || i === YEARS.length - 1 ? " is-key" : ""}`} style={{ left: `${(i / (YEARS.length - 1)) * 100}%` }}>
          <i />
          <b>{y}</b>
          {i === 0 && <small>Today</small>}
          {i === YEARS.length - 1 && <small>Possible future</small>}
        </span>
      ))}
    </div>
  );
}

/**
 * Two illustrative 2050 views of the same campus from the same camera.
 * The pictures are drawn once by the city view; dragging only moves a clip.
 */
export function FuturesOverlay() {
  const { store, bus } = useEcoEnv();
  const intro = useEco((s) => s.futuresIntro);
  const reduced = useEco(prefersReducedMotion);
  const hubBuilt = useEco((s) => s.save.progress.campus.planningHubBuilt);
  const measured = useEco((s) => s.save.mission.school?.status === "measured");
  const [shots, setShots] = useState<{ bau: string; smart: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState<"timeline" | "compare">(intro ? "timeline" : "compare");
  const [split, setSplit] = useState(50);
  const rangeRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const close = store.actions.closeOverlay;

  useEffect(() => {
    const off = bus.on("futuresCaptured", (r) => {
      if ("error" in r) setFailed(true);
      else setShots(r);
    });
    // Let the overlay cover the screen before the campus is redrawn for 2050.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => bus.emit("captureFutures", undefined)));
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [bus]);

  useEffect(() => {
    if (stage !== "timeline") return;
    const t = window.setTimeout(() => setStage("compare"), reduced ? 1200 : 3400);
    return () => window.clearTimeout(t);
  }, [stage, reduced]);

  useEffect(() => {
    if (stage === "compare" && shots) rangeRef.current?.focus({ preventScroll: true });
  }, [stage, shots]);

  const ready = stage === "compare" && shots;
  return (
    <motion.div
      className={`eco-futures${stage === "timeline" ? " eco-futures--timeline" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      {stage === "timeline" ? (
        <div className="eco-changed">
          <p className="eco-changed__eyebrow">Monday&rsquo;s lunch</p>
          <Timeline animate={!reduced} />
          <h2 id={titleId} className="eco-changed__title">
            Timeline changed
          </h2>
          <p className="eco-changed__sub">Same school. Different future.</p>
          {/* Focus starts inside the dialog so Escape and Tab work from the first frame. */}
          <button type="button" className="eco-changed__skip" onClick={() => setStage("compare")} autoFocus>
            Skip
          </button>
        </div>
      ) : (
        <>
          {shots && (
            <div className="eco-futures__view">
              {/* In-memory snapshots of the live canvas (data URLs), so next/image does not apply. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="eco-futures__img" src={shots.bau} alt="" draggable={false} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="eco-futures__img" src={shots.smart} alt="" draggable={false} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
              <span className="eco-futures__divider" style={{ left: `${split}%` }} aria-hidden="true" />
              {/* The handle stays fully on screen even when one future fills the view. */}
              <span className="eco-futures__handle" style={{ left: `clamp(56px, ${split}%, calc(100% - 56px))` }} aria-hidden="true">
                <span>‹</span>
                <b>2050</b>
                <span>›</span>
              </span>
              <span className="eco-futures__tag eco-futures__tag--left" style={{ opacity: split < 12 ? 0 : 1 }}>
                Business as usual · 2050
              </span>
              <span className="eco-futures__tag eco-futures__tag--right" style={{ opacity: split > 88 ? 0 : 1 }}>
                Food-smart future · 2050
              </span>
              <input
                ref={rangeRef}
                className="eco-futures__range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                aria-label="Compare the two possible futures: left is business as usual, right is the food-smart future"
                aria-valuetext={split <= 5 ? "Food-smart future" : split >= 95 ? "Business as usual" : `${100 - split}% food-smart future shown`}
              />
            </div>
          )}
          <header className="eco-futures__head">
            <p className="eco-futures__eyebrow" id={titleId}>
              Possible 2050 scenarios
            </p>
            <p className="eco-futures__lead">Same school. Two possible futures.</p>
            <Timeline animate={false} />
          </header>
          {!shots && !failed && <p className="eco-futures__status">Drawing 2050…</p>}
          {failed && <p className="eco-futures__status">The future view couldn&rsquo;t be drawn on this device.</p>}
          <footer className="eco-futures__foot">
            <div className="eco-futures__switch" role="group" aria-label="Show one future">
              <button type="button" disabled={!ready} aria-pressed={split >= 95} onClick={() => setSplit(100)}>
                Show business as usual
              </button>
              <button type="button" disabled={!ready} aria-pressed={split <= 5} onClick={() => setSplit(0)}>
                Show food-smart future
              </button>
            </div>
            <p className="eco-futures__note">
              Illustrative scenarios, not predictions. Your decisions contribute toward a possible future.
              {hubBuilt && <span className="eco-futures__chip">Planning Hub upgraded</span>}
              {measured && <span className="eco-futures__chip eco-futures__chip--real">School measurement added</span>}
            </p>
            <button type="button" className="eco-btn eco-btn--primary" onClick={close}>
              Back to today
            </button>
          </footer>
        </>
      )}
    </motion.div>
  );
}

/** Opening: a short message from 2050, then today. */
export function MessageFrom2050({ onDone }: { onDone: () => void }) {
  const reduced = useEco(prefersReducedMotion);
  useEffect(() => {
    const t = window.setTimeout(onDone, reduced ? 8000 : 7500);
    return () => window.clearTimeout(t);
  }, [onDone, reduced]);
  return (
    <motion.section
      className="eco-message"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eco-message-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="eco-message__strip">
        <span className="eco-message__year" aria-hidden="true">
          2050
        </span>
        <p id="eco-message-title" className="eco-message__eyebrow">
          Message from 2050
        </p>
        <p className="eco-message__line">The future of our food system was shaped long before we arrived.</p>
        <p className="eco-message__line eco-message__line--2">What your school does today changes what comes next.</p>
        <div className="eco-message__actions">
          <button type="button" className="eco-btn eco-btn--primary eco-message__next" onClick={onDone} autoFocus>
            Continue
          </button>
          <button type="button" className="eco-message__skip" onClick={onDone}>
            Skip
          </button>
        </div>
      </div>
    </motion.section>
  );
}

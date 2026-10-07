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

/** Painted 2050 panels, used when present; otherwise the campus is drawn live for both futures. */
const PAINTED = { bau: "/ecorise/bau-2050.webp", smart: "/ecorise/smart-2050.webp" };

function loads(src: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/**
 * The opening: a message from 2050 above two possible futures of this
 * campus, side by side. One button starts today's lunch.
 */
export function OpeningFutures({ onStart }: { onStart: () => void }) {
  const { bus } = useEcoEnv();
  const [shots, setShots] = useState<{ bau: string; smart: string; painted: boolean } | null>(null);
  const titleId = useId();

  useEffect(() => {
    let live = true;
    let raf = 0;
    const off = bus.on("futuresCaptured", (r) => {
      if (live && !("error" in r)) setShots({ ...r, painted: false });
    });
    Promise.all([loads(PAINTED.bau), loads(PAINTED.smart)]).then(([a, b]) => {
      if (!live) return;
      if (a && b) setShots({ ...PAINTED, painted: true });
      else raf = requestAnimationFrame(() => requestAnimationFrame(() => bus.emit("captureFutures", undefined)));
    });
    return () => {
      live = false;
      off();
      cancelAnimationFrame(raf);
    };
  }, [bus]);

  return (
    <motion.div
      className="eco-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <motion.p className="eco-open__message" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}>
        <SproutMark />
        <span>
          <small>Message from 2050</small>
          What your school does today shapes what comes next.
        </span>
      </motion.p>
      <motion.section className="eco-open__card" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}>
        <header className="eco-open__head">
          <p className="eco-open__eyebrow">Two futures</p>
          <h1 id={titleId}>The same campus. Two possible 2050 outcomes.</h1>
        </header>
        <div className={`eco-open__panels${shots ? " is-ready" : ""}${shots?.painted ? " is-painted" : ""}`}>
          <figure className="eco-open__panel eco-open__panel--bau">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shots && <img src={shots.bau} alt="The campus in 2050 if nothing changes: bare ground, dead trees and food waste piling up." />}
            <figcaption>
              <b>Business as usual</b>
              <span>More waste. Missed opportunities.</span>
            </figcaption>
          </figure>
          <span className="eco-open__divider" aria-hidden="true">
            <span>‹</span>
            <span>›</span>
          </span>
          <figure className="eco-open__panel eco-open__panel--smart">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shots && <img src={shots.smart} alt="The campus in 2050 if the school wastes less: gardens, compost, trees and students eating together." />}
            <figcaption>
              <b>Food-smart future</b>
              <span>Less waste. A stronger, healthier school.</span>
            </figcaption>
            <i className="eco-open__tag">Illustrative future scenarios</i>
          </figure>
          {!shots && <p className="eco-open__status">Drawing 2050…</p>}
        </div>
        <footer className="eco-open__foot">
          <ol className="eco-open__steps">
            <li>
              <b>1</b>
              <span>
                <strong>Play today</strong>
                Plan the school lunch: feed everyone, waste less.
              </span>
            </li>
            <li>
              <b>2</b>
              <span>
                <strong>Grow your campus</strong>
                Every strong lunch moves your school toward 2050.
              </span>
            </li>
            <li>
              <b>3</b>
              <span>
                <strong>Measure real impact</strong>
                Run a waste audit in your own school.
              </span>
            </li>
          </ol>
          <button type="button" className="eco-open__cta" onClick={onStart} autoFocus>
            <span aria-hidden="true">▸</span> Play today
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}

function SproutMark() {
  return (
    <svg className="eco-open__sprout" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 40V22" stroke="#b7791f" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 24C22 14 15 9 6 9c0 10 7 15 16 15Z" fill="#c9a24b" />
      <path d="M22 21c0-9 6-14 16-14 0 9-6 14-16 14Z" fill="#e2c27a" />
      <ellipse cx="22" cy="41" rx="9" ry="2.2" fill="#c9a24b" opacity=".35" />
    </svg>
  );
}

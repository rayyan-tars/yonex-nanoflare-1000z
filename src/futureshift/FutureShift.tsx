"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowCounterClockwise, Info, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import { cardThumb } from "./art";
import { HOTSPOTS } from "./campus";
import {
  INTERVENTIONS,
  INTERVENTION_BY_ID,
  MAX_CHOICES,
  SPOT_LABEL,
  ZONES,
  isUsed,
  signals,
  validSpots,
  zoneOutcome,
  type HotspotId,
  type Signals,
} from "./model";
import { Scene } from "./scene";
import { Store } from "./store";
import "./futureshift.css";

declare global {
  interface Window {
    __futureshift?: { store: Store; scene: Scene };
  }
}

function useStore(store: Store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export default function FutureShift() {
  const [store] = useState(() => new Store(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  const st = useStore(store);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [layoutRev, setLayoutRev] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [introLine, setIntroLine] = useState(false);
  const [cardsIn, setCardsIn] = useState(false);
  const dragging = useRef(false);

  // ------------------------------------------------------------ scene lifecycle
  useEffect(() => {
    const cv = canvasRef.current!;
    const sc = new Scene(cv, store);
    setScene(sc);
    window.__futureshift = { store, scene: sc };
    const t = INTERVENTIONS.reduce<Record<string, string>>((m, i) => ((m[i.id] = cardThumb(i.id, sc.sprites)), m), {});
    setThumbs(t);
    const onResize = () => {
      sc.resize();
      setLayoutRev((r) => r + 1);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(cv);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => store.setReduced(mq.matches);
    mq.addEventListener("change", onMq);
    const reduced = store.state.reduced;
    const t1 = window.setTimeout(() => setIntroLine(true), reduced ? 0 : 500);
    const t2 = window.setTimeout(() => setCardsIn(true), reduced ? 0 : 1300);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onMq);
      clearTimeout(t1);
      clearTimeout(t2);
      sc.destroy();
      store.dispose();
      delete window.__futureshift;
    };
  }, [store]);

  useEffect(() => {
    if (!scene) return;
    scene.setOverlay({ handle: handleRef.current, peek: peekRef.current, heat: heatRef.current });
  });

  // ------------------------------------------------------------ phase effects on the lens
  const phase = st.game.phase;
  const prevPhase = useRef(phase);
  const prevGen = useRef(st.gen);
  useEffect(() => {
    if (!scene) return;
    if (st.gen !== prevGen.current) {
      prevGen.current = st.gen;
      scene.resetForReplay();
    }
    if (phase !== prevPhase.current) {
      const from = prevPhase.current;
      prevPhase.current = phase;
      if (phase === "reveal" && from === "ready") scene.animateLens([0.94, 0.5], 1800);
      if (phase === "heatwave") scene.startHeat();
      if (phase === "result") scene.animateLens([0.5], 900);
    }
  }, [scene, phase, st.gen]);

  // ------------------------------------------------------------ canvas pointer (hotspots)
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    if (!scene || dragging.current) return;
    const p = local(e);
    const hit = scene.hitTest(p.x, p.y);
    scene.setHover(hit);
    canvasRef.current!.style.cursor = hit ? "pointer" : "default";
  };
  const onCanvasClick = (e: React.MouseEvent) => {
    if (!scene) return;
    const p = local(e);
    const hit = scene.hitTest(p.x, p.y);
    if (hit) {
      store.placeAt(hit);
      scene.setHover(null);
      canvasRef.current!.style.cursor = "default";
    }
  };

  // ------------------------------------------------------------ lens drag + keys
  const lensEnabled = (st.lensReady || phase === "reveal" || phase === "result") && phase !== "heatwave";
  const lensVisible = st.lensReady || phase === "reveal" || phase === "heatwave" || phase === "result";
  const setFromX = useCallback(
    (clientX: number) => {
      if (!scene) return;
      const r = canvasRef.current!.getBoundingClientRect();
      scene.setLens(1 - (clientX - r.left) / r.width, true);
      store.touchLens();
    },
    [scene, store],
  );
  const onHandleDown = (e: React.PointerEvent) => {
    if (!lensEnabled) return;
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handleRef.current?.classList.add("is-drag");
    setFromX(e.clientX);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setFromX(e.clientX);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    dragging.current = false;
    handleRef.current?.classList.remove("is-drag");
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };
  useEffect(() => {
    if (!scene) return;
    const onKey = (e: KeyboardEvent) => {
      if (store.state.about || !lensEnabled) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-no-lens-keys]")) return;
      let v: number | null = null;
      const step = e.shiftKey ? 0.2 : 0.05;
      if (e.key === "ArrowLeft") v = scene.lens + step;
      else if (e.key === "ArrowRight") v = scene.lens - step;
      else if (e.key === "Home") v = 0;
      else if (e.key === "End") v = 1;
      else if (e.key === "PageUp") v = scene.lens + 0.25;
      else if (e.key === "PageDown") v = scene.lens - 0.25;
      if (v === null) return;
      e.preventDefault();
      scene.setLens(v, true);
      store.touchLens();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, store, lensEnabled]);

  // ------------------------------------------------------------ derived
  const used = st.game.placements.length;
  const sig: Signals = useMemo(() => signals(st.game.placements), [st.game.placements]);
  const spots: HotspotId[] = st.selected && phase === "choose" ? validSpots(st.game.placements, phase, st.selected) : [];
  void layoutRev;

  let line: string | null = null;
  if (phase === "choose") {
    if (st.selected) line = `Tap a glowing spot to add ${INTERVENTION_BY_ID[st.selected].name}.`;
    else if (used === 0) line = introLine ? "You get 3 changes. What will your school become by 2050?" : null;
    else if (st.lensReady && !st.lensTouched) line = "Drag the 2050 lens to see what your change becomes.";
    else line = `${MAX_CHOICES - used} ${MAX_CHOICES - used === 1 ? "change" : "changes"} left. Choose wisely.`;
  }

  const heatE = st.heatProgress;
  const heatBanner = phase === "heatwave" ? (heatE < 0.12 ? "HEATWAVE APPROACHING" : "2050 HEATWAVE") : null;
  const showZones = phase === "heatwave" && heatE > 0.25 && st.result === null;
  const zoneResults = useMemo(() => {
    const ok: Record<string, boolean> = {};
    for (const z of zoneOutcome(st.game.placements)) ok[z.id] = z.comfortable;
    return { ok, solar: st.game.placements.some((p) => p.id === "solar") };
  }, [st.game.placements]);

  const project = (x: number, y: number, z: number) => scene?.project(x, y, z) ?? { x: -999, y: -999 };

  return (
    <div className={`fs-root${st.reduced ? " is-reduced" : ""}`} ref={rootRef} data-phase={phase}>
      <div className="fs-sky" />
      <canvas
        ref={canvasRef}
        className="fs-canvas"
        data-testid="fs-canvas"
        onPointerMove={onCanvasMove}
        onPointerLeave={() => scene?.setHover(null)}
        onClick={onCanvasClick}
        aria-label="School campus. Today on the left of the lens, 2050 on the right."
        role="img"
      />
      <div className="fs-heatlight" ref={heatRef} style={{ opacity: 0 }} aria-hidden="true" />

      {/* Future Lens peek window after the first change */}
      <div className="fs-peek" ref={peekRef} style={{ opacity: 0 }} aria-hidden="true">
        <span className="fs-tag fs-tag--future">2050</span>
      </div>

      {/* Hotspot pins */}
      {spots.map((id) => {
        const h = HOTSPOTS[id];
        const p = project(h.pin[0], h.pin[1], h.pin[2]);
        return (
          <button
            key={id}
            type="button"
            className="fs-pin"
            data-hotspot={id}
            style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
            onClick={() => store.placeAt(id)}
            onPointerEnter={() => scene?.setHover(id)}
            onPointerLeave={() => scene?.setHover(null)}
          >
            {SPOT_LABEL[id]}
          </button>
        );
      })}

      {/* Heatwave zone markers */}
      {showZones &&
        ZONES.map((z, i) => {
          const p = project(z.at[0], z.at[1], z.at[2] + (z.indoor ? 0 : 22));
          const ok = zoneResults.ok[z.id];
          const shown = heatE > 0.26 + i * 0.02;
          return (
            <div
              key={z.id}
              className={`fs-zone ${ok ? "is-ok" : "is-hot"}${shown ? " is-on" : ""}`}
              style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
              data-zone={z.id}
              data-ok={ok ? "1" : "0"}
              title={`${z.label}: ${ok ? "comfortable" : "too hot"}`}
            >
              <span aria-hidden="true">{ok ? "✓" : "!"}</span>
              <em>{z.label}</em>
            </div>
          );
        })}
      {phase === "heatwave" && zoneResults.solar && heatE > 0.22 && (
        <div className="fs-power" style={{ transform: `translate3d(${project(8.6, 1.8, 70).x}px, ${project(8.6, 1.8, 70).y}px, 0)` }}>
          <i aria-hidden="true" /> Cooling on clean solar power
        </div>
      )}

      {/* Future Lens handle */}
      <div
        ref={handleRef}
        className={`fs-lens${lensVisible ? " is-on" : ""}${lensEnabled ? "" : " is-locked"}`}
        data-edge="today"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      >
        <div className="fs-lens__line" />
        <span className="fs-tag fs-tag--today fs-lens__today">TODAY</span>
        <span className="fs-tag fs-tag--future fs-lens__future">2050</span>
        <div
          className="fs-lens__knob"
          role="slider"
          tabIndex={lensVisible ? 0 : -1}
          aria-label="Future Lens: drag to reveal 2050"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-orientation="horizontal"
          data-testid="fs-lens"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
          </svg>
          <span className="fs-lens__hint">2050</span>
        </div>
      </div>

      {/* Brand + choices */}
      <header className="fs-brand">
        <div className="fs-brand__mark" aria-hidden="true">
          <i />
          <i />
        </div>
        <div>
          <h1>
            FUTURESHIFT <span>CAMPUS 2050</span>
          </h1>
          <div className="fs-choices" aria-label={`${used} of 3 changes used`}>
            Choices
            {[0, 1, 2].map((i) => (
              <b key={i} className={i < used ? "is-used" : ""} />
            ))}
          </div>
        </div>
      </header>

      <div className="fs-tools">
        <button type="button" className="fs-icon" aria-label={st.muted ? "Unmute" : "Mute"} onClick={() => store.setMuted(!st.muted)}>
          {st.muted ? <SpeakerSlash weight="bold" /> : <SpeakerHigh weight="bold" />}
        </button>
        <button type="button" className="fs-icon" aria-label="About FutureShift" onClick={() => store.setAbout(true)}>
          <Info weight="bold" />
        </button>
      </div>

      {/* Top line / banners */}
      <div className="fs-top" aria-live="polite">
        {line && (
          <p key={line} className={`fs-line${used === 0 && !st.selected ? " is-hero" : ""}`} data-testid="fs-line">
            {line}
          </p>
        )}
        {(phase === "reveal" || phase === "heatwave" || phase === "result") && <SignalsBar s={sig} />}
        {heatBanner && (
          <div className="fs-heatbar" data-testid="fs-heat">
            <b>{heatBanner}</b>
            <span className="fs-heatbar__track">
              <i style={{ transform: `scaleX(${1 - heatE})` }} />
            </span>
            <small>Shade and clean power decide who stays comfortable</small>
          </div>
        )}
      </div>

      {/* Cards */}
      {(phase === "choose" || (phase === "ready" && !st.readyShown)) && (
        <div className={`fs-tray${cardsIn ? " is-in" : ""}`} data-no-lens-keys>
          {INTERVENTIONS.map((iv, i) => {
            const isUsedNow = isUsed(st.game.placements, iv.id);
            const full = used >= MAX_CHOICES;
            const disabled = isUsedNow || full || phase !== "choose";
            return (
              <button
                key={iv.id}
                type="button"
                className={`fs-card${st.selected === iv.id ? " is-on" : ""}${isUsedNow ? " is-used" : ""}${full && !isUsedNow ? " is-full" : ""}`}
                style={{ transitionDelay: cardsIn ? `${i * 50}ms` : "0ms" }}
                data-card={iv.id}
                aria-pressed={st.selected === iv.id}
                disabled={disabled}
                onClick={() => store.select(iv.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL from the game's own art */}
                <span className="fs-card__pic">{thumbs[iv.id] && <img src={thumbs[iv.id]} alt="" />}</span>
                <span className="fs-card__name">{iv.name}</span>
                <span className="fs-card__blurb">{iv.blurb}</span>
                {isUsedNow && <span className="fs-card__check">Placed</span>}
              </button>
            );
          })}
        </div>
      )}
      {(phase === "choose" || phase === "ready") && st.game.undoable && (
        <button type="button" className="fs-undo" onClick={() => store.undo()} data-testid="fs-undo">
          <ArrowCounterClockwise weight="bold" /> Undo
        </button>
      )}

      {/* Ready → reveal */}
      {phase === "ready" && st.readyShown && (
        <div className="fs-cta" data-no-lens-keys>
          <p className="fs-cta__title">YOUR 2050 IS READY</p>
          <button type="button" className="fs-btn fs-btn--future" onClick={() => store.reveal()} data-testid="fs-reveal" autoFocus>
            REVEAL MY FUTURE
          </button>
        </div>
      )}
      {phase === "reveal" && st.revealSettled && (
        <div className="fs-cta" data-no-lens-keys>
          <p className="fs-cta__sub">Drag the lens to compare, then put your 2050 to the test.</p>
          <button type="button" className="fs-btn fs-btn--heat" onClick={() => store.testHeat()} data-testid="fs-test">
            TEST MY 2050
          </button>
        </div>
      )}

      {/* Result */}
      {phase === "result" && st.result && (
        <div className="fs-result" data-testid="fs-result" data-no-lens-keys>
          <div className={`fs-result__badge is-${st.result.resilience.toLowerCase()}`}>Future resilience: {st.result.resilience}</div>
          <p className="fs-result__l1">{st.result.lines[0]}</p>
          <p className="fs-result__l2">{st.result.lines[1]}</p>
          <p className="fs-result__l3">{st.result.lines[2]}</p>
          <div className="fs-result__foot">
            <span>What if you chose differently?</span>
            <button type="button" className="fs-btn fs-btn--future" onClick={() => store.replay()} data-testid="fs-replay" autoFocus>
              TRY ANOTHER 2050
            </button>
          </div>
          <small className="fs-result__sdg">Connects to SDG 11 · 13 · 7</small>
        </div>
      )}

      {/* Real-world bridge (first completed future only) */}
      {phase === "result" && (st.bridge === "shown" || st.bridge === "spot") && (
        <div className="fs-bridge" data-testid="fs-bridge" data-no-lens-keys>
          {st.bridge === "shown" ? (
            <>
              <p>{store.bridgeQuestion()}</p>
              <div>
                <button type="button" className="fs-btn fs-btn--small" onClick={() => store.answerBridge(true)}>
                  I can think of a spot
                </button>
                <button type="button" className="fs-link" onClick={() => store.answerBridge(false)}>
                  Keep playing
                </button>
              </div>
            </>
          ) : (
            <p>Take a look at it on your way out tomorrow.</p>
          )}
        </div>
      )}

      {st.about && <About onClose={() => store.setAbout(false)} reduced={st.reduced} onReduced={(r) => store.setReduced(r)} />}
    </div>
  );
}

function Pips({ n }: { n: number }) {
  return (
    <span className="fs-pips" aria-label={`${n} of 3`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? "is-on" : ""} />
      ))}
    </span>
  );
}

function SignalsBar({ s }: { s: Signals }) {
  return (
    <div className="fs-signals" data-testid="fs-signals" data-cooler={s.cooler} data-cleaner={s.cleaner} data-safer={s.safer}>
      <span>
        COOLER <Pips n={s.cooler} />
      </span>
      <span>
        CLEANER <Pips n={s.cleaner} />
      </span>
      <span>
        SAFER <Pips n={s.safer} />
      </span>
    </div>
  );
}

function About({ onClose, reduced, onReduced }: { onClose: () => void; reduced: boolean; onReduced: (r: boolean) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fs-scrim" onClick={onClose} data-no-lens-keys>
      <div className="fs-about" role="dialog" aria-modal="true" aria-label="About FutureShift" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fs-icon fs-about__x" aria-label="Close" onClick={onClose} autoFocus>
          <X weight="bold" />
        </button>
        <h2>FutureShift: Campus 2050</h2>
        <p>Three choices. One future. Make three changes to a school today, then drag the Future Lens to see what they could help create by 2050.</p>
        <ul className="fs-sdgs">
          <li>
            <b>SDG 11</b> Sustainable Cities and Communities
          </li>
          <li>
            <b>SDG 13</b> Climate Action
          </li>
          <li>
            <b>SDG 7</b> Affordable and Clean Energy
          </li>
        </ul>
        <p className="fs-about__small">
          Cooler, Cleaner and Safer are FutureShift simulation signals that compare choices. They are not scientific measurements.
        </p>
        <label className="fs-about__toggle">
          <input type="checkbox" checked={reduced} onChange={(e) => onReduced(e.target.checked)} /> Reduced motion
        </label>
      </div>
    </div>
  );
}

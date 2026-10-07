"use client";

import { CloudFog, Coins, Eraser, Gear, Hammer, Lightning, Smiley, SmileyMeh, SmileySad, Star, Users } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { GOALS, airLabel, problem } from "../model/sim";
import { TH_TITLES } from "../model/world";
import { useGame, useStoreRef } from "./context";
import { fmt } from "./format";

export function TopBar() {
  const store = useGame();
  const t = store.town;
  const s = store.sim.stats;
  const Face = s.happiness >= 65 ? Smiley : s.happiness >= 40 ? SmileyMeh : SmileySad;
  return (
    <>
      <div className="gh-town">
        <button type="button" className="gh-town__badge" onClick={() => store.openPanel("townhall")} aria-label={`Town Hall level ${t.th}`}>
          <span className="gh-town__lvl">{t.th}</span>
        </button>
        <div className="gh-town__body">
          <span className="gh-town__name gh-display">{t.name}</span>
          <span className="gh-town__title">{TH_TITLES[t.th]}</span>
          <button type="button" className="gh-stars" onClick={() => store.openPanel("stars")} aria-label={`${s.starCount} of 3 eco stars`}>
            {s.stars.map((on, k) => (
              <Star key={k} weight="fill" className={on ? "is-on" : undefined} aria-hidden="true" />
            ))}
          </button>
        </div>
      </div>

      <div className="gh-res" aria-label="Your town">
        <div className="gh-res__row" id="gh-coins">
          <Coins weight="fill" className="gh-ico gh-ico--gold" aria-hidden="true" />
          <span className="gh-res__num">{fmt(t.coins)}</span>
          <span className="gh-res__label">coins</span>
        </div>
        <div className="gh-res__mini">
          <span title="People living here">
            <Users weight="fill" aria-hidden="true" /> {Math.floor(t.residents)}
          </span>
          <span title="Happiness">
            <Face weight="fill" aria-hidden="true" /> {Math.round(s.happiness)}%
          </span>
        </div>
      </div>
    </>
  );
}

/** The two things that matter: is there enough energy, and is the air clean? */
export function Meters() {
  const store = useGame();
  const s = store.sim.stats;
  const e = s.energy;
  const enough = e.supply >= e.demand - 0.01;
  const air = airLabel(s.homeAir);
  const cleanPct = Math.round(e.cleanShare * 100);
  return (
    <div className="gh-meters">
      <div className={`gh-meter ${enough ? "is-good" : "is-bad"}`}>
        <span className="gh-meter__ico">
          <Lightning weight="fill" />
        </span>
        <span className="gh-meter__body">
          <span className="gh-meter__top">
            <span>Energy</span>
            <b>
              {fmt(Math.floor(e.supply + 0.01))}/{fmt(Math.ceil(e.demand - 0.01))}
            </b>
          </span>
          <span className="gh-meter__bar" title={`${cleanPct}% from sun and wind`}>
            <i className="gh-meter__clean" style={{ width: `${Math.min(100, (e.clean / Math.max(1, e.demand, e.supply)) * 100)}%` }} />
            <i className="gh-meter__dirty" style={{ width: `${Math.min(100, (e.dirty / Math.max(1, e.demand, e.supply)) * 100)}%` }} />
          </span>
          <small className="gh-meter__note">{cleanPct}% clean</small>
        </span>
      </div>
      <div className={`gh-meter ${air.good ? "is-good" : "is-bad"}`}>
        <span className="gh-meter__ico">
          <CloudFog weight="fill" />
        </span>
        <span className="gh-meter__body">
          <span className="gh-meter__top">
            <span>Air at homes</span>
            <b>{air.label}</b>
          </span>
          <span className="gh-meter__bar gh-meter__bar--air">
            <i style={{ left: `${Math.min(100, (s.homeAir / 40) * 100)}%` }} />
          </span>
        </span>
      </div>
    </div>
  );
}

/** Fern, the eco advisor: a problem to fix now, or the one next goal. */
export function Advisor() {
  const store = useGame();
  const t = store.town;
  const warn = problem(t, store.sim.stats);
  const goal = GOALS[t.goal];
  const at = warn?.at;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={warn ? warn.text : goal ? goal.id : "done"}
        className={`gh-advisor ${warn ? "gh-advisor--warn" : goal ? "" : "gh-advisor--good"}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        role="status"
      >
        <span className="gh-advisor__face" aria-hidden="true">
          🌱
        </span>
        <span className="gh-advisor__text">
          {warn ? (
            <>
              <b>Fern says</b>
              {warn.text}
            </>
          ) : goal ? (
            <>
              <b>
                Goal {t.goal + 1} of {GOALS.length} · +{goal.coins} coins
              </b>
              <strong>{goal.name}</strong>
              <span>{goal.why}</span>
            </>
          ) : (
            <>
              <b>All goals done</b>
              Your town runs on clean power with clean air. Keep building however you like!
            </>
          )}
        </span>
        {at !== undefined && (
          <button type="button" className="gh-link" onClick={() => store.bus.emit("focus", { i: at })}>
            Show me
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function Dock() {
  const store = useGame();
  const remove = store.tool.kind === "remove";
  return (
    <div className="gh-dock">
      <button type="button" className="gh-round" onClick={() => store.openPanel("settings")}>
        <Gear weight="fill" aria-hidden="true" />
        <small>Settings</small>
      </button>
      <button
        type="button"
        className={`gh-round ${remove ? "is-on is-red" : ""}`}
        onClick={() => {
          store.setCategory(null);
          store.setTool(remove ? { kind: "none" } : { kind: "remove" });
        }}
        aria-pressed={remove}
      >
        <Eraser weight="fill" aria-hidden="true" />
        <small>Remove</small>
      </button>
      <button
        type="button"
        className={`gh-build ${store.category ? "is-open" : ""}`}
        onClick={() => {
          if (store.category) store.setCategory(null);
          else {
            if (remove) store.setTool({ kind: "none" });
            store.setCategory("homes");
          }
        }}
        aria-expanded={!!store.category}
      >
        <Hammer weight="fill" aria-hidden="true" />
        <span>{store.category ? "Close" : "Build"}</span>
      </button>
    </div>
  );
}

export function Toasts() {
  const store = useGame();
  return (
    <div className="gh-toasts" aria-live="polite">
      <AnimatePresence>
        {store.toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`gh-toast gh-toast--${t.tone}`}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
            layout
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface Fly {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  k: number;
  sw: number;
}

/** Coins fly from the Town Hall into the counter. */
export function FlyLayer() {
  const store = useStoreRef();
  const [items, setItems] = useState<Fly[]>([]);
  useEffect(() => {
    let id = 0;
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ x: number; y: number }>).detail;
      const r = document.getElementById("gh-coins")?.getBoundingClientRect();
      const tx = r ? r.left + 18 : window.innerWidth - 120;
      const ty = r ? r.top + r.height / 2 : 30;
      const batch = Array.from({ length: 8 }, (_, k) => ({ id: ++id, x: d.x + (Math.random() - 0.5) * 40, y: d.y + (Math.random() - 0.5) * 30, tx, ty, k, sw: (Math.random() - 0.5) * 60 }));
      setItems((v) => [...v, ...batch]);
      window.setTimeout(() => setItems((v) => v.filter((x) => !batch.includes(x))), 1400);
    };
    window.addEventListener("greenhold:fly", on);
    return () => window.removeEventListener("greenhold:fly", on);
  }, [store]);
  return (
    <div className="gh-fly" aria-hidden="true">
      {items.map((f) => (
        <motion.span
          key={f.id}
          className="gh-fly__item"
          initial={{ x: f.x, y: f.y, scale: 0.4, opacity: 0 }}
          animate={{ x: [f.x, f.x + f.sw, f.tx], y: [f.y, f.y - 50, f.ty], scale: [0.4, 1.1, 0.7], opacity: [0, 1, 1] }}
          transition={{ duration: 0.9, delay: f.k * 0.05, ease: "easeInOut" }}
        >
          <Coins weight="fill" />
        </motion.span>
      ))}
    </div>
  );
}

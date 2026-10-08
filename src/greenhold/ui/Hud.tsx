"use client";

import { Cloud, CloudFog, Drop, CloudLightning, Eye, CloudRain, Coins, Eraser, Gear, Globe, Hammer, Lightning, Moon, Plant, Smiley, SmileyMeh, SmileySad, Star, Sun, Trophy, Users } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ecoSummary, powerNetwork } from "../model/eco";
import { WEATHER, airLabel, env, forecast, problem, type Weather } from "../model/sim";
import { WORLDS } from "../model/worlds";
import { TH_TITLES } from "../model/world";
import { useGame, useStoreRef } from "./context";
import { fmt } from "./format";

export function TopBar() {
  const store = useGame();
  const t = store.town;
  const s = store.sim.stats;
  const Face =
    s.happiness >= 65 ? Smiley : s.happiness >= 40 ? SmileyMeh : SmileySad;
  return (
    <>
      <div className="gh-town">
        <button
          type="button"
          className="gh-town__badge"
          onClick={() => store.openPanel("townhall")}
          aria-label={`Town Hall level ${t.th}`}
        >
          <span className="gh-town__lvl">{t.th}</span>
        </button>
        <div className="gh-town__body">
          <span className="gh-town__name gh-display">{t.name}</span>
          <span className="gh-town__title">
            World {t.world + 1} · {TH_TITLES[t.th]}
          </span>
          <button
            type="button"
            className="gh-stars"
            onClick={() => store.openPanel("stars")}
            aria-label={`${s.starCount} of 3 eco stars`}
          >
            {s.stars.map((on, k) => (
              <Star
                key={k}
                weight="fill"
                className={on ? "is-on" : undefined}
                aria-hidden="true"
              />
            ))}
          </button>
        </div>
      </div>

      <div className="gh-res" aria-label="Your town">
        <div className="gh-res__row" id="gh-coins">
          <Coins
            weight="fill"
            className="gh-ico gh-ico--gold"
            aria-hidden="true"
          />
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
              {fmt(Math.floor(e.supply + 0.01))}/
              {fmt(Math.ceil(e.demand - 0.01))}
            </b>
          </span>
          <span
            className="gh-meter__bar"
            title={`${cleanPct}% from sun and wind`}
          >
            <i
              className="gh-meter__clean"
              style={{
                width: `${Math.min(100, (e.clean / Math.max(1, e.demand, e.supply)) * 100)}%`,
              }}
            />
            <i
              className="gh-meter__dirty"
              style={{
                width: `${Math.min(100, (e.dirty / Math.max(1, e.demand, e.supply)) * 100)}%`,
              }}
            />
          </span>
          <small className="gh-meter__note">{cleanPct}% clean</small>
        </span>
      </div>
      <div
        className={`gh-meter ${s.water.supply >= s.water.demand - 0.01 ? "is-good" : "is-bad"}`}
        title={`Town Hall well ${15}, plus ${fmt(Math.min(s.water.raw, s.water.filterCap))} filtered from reservoirs and dams (${fmt(s.water.raw)} collected, ${fmt(s.water.filterCap)} filtration capacity)`}
      >
        <span className="gh-meter__ico">
          <Drop weight="fill" />
        </span>
        <span className="gh-meter__body">
          <span className="gh-meter__top">
            <span>Clean water</span>
            <b>
              {fmt(Math.floor(s.water.supply))}/{fmt(Math.ceil(s.water.demand - 0.01))}
            </b>
          </span>
          <span className="gh-meter__bar">
            <i className="gh-meter__clean gh-meter__water" style={{ width: `${s.water.demand ? Math.min(100, (s.water.supply / s.water.demand) * 100) : 100}%` }} />
          </span>
        </span>
      </div>
      <div className={`gh-meter ${s.food.imported === 0 ? "is-good" : "is-warn"}`} title={s.food.imported > 0 ? `${fmt(s.food.imported)} food trucked in: costs coins and makes fumes` : "All food grown locally"}>
        <span className="gh-meter__ico">
          <Plant weight="fill" />
        </span>
        <span className="gh-meter__body">
          <span className="gh-meter__top">
            <span>Food grown</span>
            <b>
              {fmt(Math.floor(s.food.supply))}/{fmt(Math.ceil(s.food.demand - 0.01))}
            </b>
          </span>
          <span className="gh-meter__bar">
            <i className="gh-meter__clean" style={{ width: `${s.food.demand ? Math.min(100, (s.food.supply / s.food.demand) * 100) : 100}%` }} />
          </span>
          {s.food.imported > 0 && <small className="gh-meter__note">🚚 {fmt(s.food.imported)} trucked in</small>}
        </span>
      </div>
      <div className={`gh-meter ${air.good ? "is-good" : "is-bad"}${store.pulse ? " is-clearing" : ""}`}>
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

/** Fern, the eco advisor: a problem to fix now, or the next achievement in this world. */
export function Advisor() {
  const store = useGame();
  const t = store.town;
  const world = WORLDS[t.world];
  const warn = problem(t, store.sim.stats);
  const goal = world.achievements[t.goal];
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
                {world.name} · achievement {t.goal + 1} of{" "}
                {world.achievements.length} · +{goal.coins} coins
              </b>
              <strong>{goal.name}</strong>
              <span>{goal.why}</span>
              <span className="gh-progress" aria-hidden="true">
                {world.achievements.map((a, k) => (
                  <i
                    key={a.id}
                    className={
                      k < t.goal
                        ? "is-done"
                        : k === t.goal
                          ? "is-now"
                          : undefined
                    }
                  />
                ))}
              </span>
            </>
          ) : (
            <>
              <b>{world.name} complete</b>
              {store.progress.done.length < WORLDS.length
                ? "Every achievement done! The next world is waiting."
                : "You finished every world. Keep building however you like!"}
              {store.progress.done.length < WORLDS.length && (
                <button
                  type="button"
                  className="gh-btn gh-btn--green gh-advisor__next"
                  onClick={() => store.openPanel("worlds")}
                >
                  Go to the next world
                </button>
              )}
            </>
          )}
        </span>
        {at !== undefined && (
          <button
            type="button"
            className="gh-link"
            onClick={() => store.bus.emit("focus", { i: at })}
          >
            Show me
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

const WEATHER_ICON: Record<Weather, typeof Sun> = { sunny: Sun, cloudy: Cloud, rain: CloudRain, storm: CloudLightning };
const WEATHER_TIP: Record<Weather, string> = {
  sunny: "Solar panels at their best; less wind.",
  cloudy: "Solar makes less; wind as usual.",
  rain: "Rain washes the air; solar is weak, wind picks up.",
  storm: "Turbines spin fast; solar barely works. Rain washes the air.",
};

/** Time of day, today's weather and what's coming. */
export function WeatherChip() {
  const store = useGame();
  const e = env(store.town.clock);
  const next = forecast(store.town.clock);
  const Icon = e.sun <= 0 && e.weather === "sunny" ? Moon : WEATHER_ICON[e.weather];
  const hours = (e.dayPhase * 24 + 24) % 24;
  const time = `${String(Math.floor(hours)).padStart(2, "0")}:${String(Math.floor(((hours % 1) * 60) / 10) * 10).padStart(2, "0")}`;
  return (
    <div className={`gh-weather gh-weather--${e.weather}`} title={WEATHER_TIP[e.weather]}>
      <Icon weight="fill" aria-hidden="true" />
      <b>{WEATHER[e.weather].label}</b>
      <span>{time}</span>
      {next && (
        <span className="gh-weather__next">
          Next: {WEATHER[next.weather].label.toLowerCase()} in {next.inSeconds < 60 ? `${next.inSeconds}s` : `${Math.round(next.inSeconds / 60)} min`}
        </span>
      )}
    </div>
  );
}

const ECO_SEEN_KEY = "greenhold.ecovision.seen";
const readSeen = () => {
  try {
    return window.localStorage.getItem(ECO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
const writeSeen = () => {
  try {
    window.localStorage.setItem(ECO_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the explainer just shows again next time.
  }
};

/** Eco Vision: the X-ray toggle, a one-line key that reads the town, and a first-time explainer. */
export function EcoVisionButton() {
  const store = useGame();
  const on = store.ecoVision;
  const [explain, setExplain] = useState(false);
  const toggle = () => {
    const next = !on;
    store.setEcoVision(next);
    if (next && !readSeen()) setExplain(true);
    if (!next) setExplain(false);
  };
  // The explainer shows once, then tucks itself away.
  useEffect(() => {
    if (!explain) return;
    const t = window.setTimeout(() => {
      setExplain(false);
      writeSeen();
    }, 12000);
    return () => window.clearTimeout(t);
  }, [explain]);
  const close = () => {
    setExplain(false);
    writeSeen();
  };
  return (
    <>
      <div className={`gh-eco${on ? " is-on" : ""}`}>
        <button type="button" className="gh-eco__btn" aria-pressed={on} onClick={toggle} title="Eco Vision (V): see power, pollution and nature at work">
          <Eye weight={on ? "fill" : "bold"} aria-hidden="true" />
          Eco Vision
        </button>
        <AnimatePresence>{on && <EcoKey key="key" onHelp={() => setExplain((x) => !x)} />}</AnimatePresence>
      </div>
      <AnimatePresence>{on && explain && <EcoExplainer key="explain" onClose={close} />}</AnimatePresence>
    </>
  );
}

function EcoKey({ onHelp }: { onHelp: () => void }) {
  const store = useGame();
  const s = store.sim.stats;
  const sum = ecoSummary(s, store.sim.air, powerNetwork(store.town, s));
  return (
    <motion.div className="gh-eco__key" role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
      <span title="Homes where the air is above the OK line">
        <i className="gh-eco__sw gh-eco__sw--smog" />
        Smoggy homes <b>{sum.smoggyHomes}</b>/{sum.homes}
      </span>
      <span title="Homes powered by sun, wind or water">
        <i className="gh-eco__sw gh-eco__sw--clean" />
        Clean power <b>{sum.cleanHomes}</b>
      </span>
      {sum.coalHomes > 0 && (
        <span title="Homes powered by coal">
          <i className="gh-eco__sw gh-eco__sw--coal" />
          Coal <b>{sum.coalHomes}</b>
        </span>
      )}
      {sum.unpoweredHomes > 0 && (
        <span className="gh-eco__none" title="Not enough power to go round">
          No power <b>{sum.unpoweredHomes}</b>
        </span>
      )}
      <button type="button" className="gh-eco__help" onClick={onHelp} aria-label="What am I looking at?">
        ?
      </button>
    </motion.div>
  );
}

function EcoExplainer({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="gh-eco__explain" role="dialog" aria-label="Eco Vision" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
      <b className="gh-eco__title">Eco Vision</b>
      <div className="gh-eco__row">
        <i className="gh-eco__sw gh-eco__sw--air" />
        <span>Brown: dirty air. Smoke drifts from chimneys and busy roads with the wind.</span>
      </div>
      <div className="gh-eco__row">
        <i className="gh-eco__sw gh-eco__sw--clean" />
        <span>Green lines: clean power flowing to homes. Orange: coal.</span>
      </div>
      <div className="gh-eco__row">
        <i className="gh-eco__sw gh-eco__sw--plant" />
        <span>Green glow: trees and parks cleaning the air that passes over them.</span>
      </div>
      <div className="gh-eco__row">
        <i className="gh-eco__sw gh-eco__sw--smog" />
        <span>A brown cloud on a roof: those people are breathing smog.</span>
      </div>
      <small>Greenhold simulation indicators: simplified, not real-world measurements.</small>
      <button type="button" className="gh-btn gh-btn--green gh-eco__ok" onClick={onClose}>
        Got it
      </button>
    </motion.div>
  );
}

export function Dock() {
  const store = useGame();
  const remove = store.tool.kind === "remove";
  return (
    <div className="gh-dock">
      {!store.category && (
        <>
          <button type="button" className="gh-round" onClick={() => store.openPanel("goals")}>
            <Trophy weight="fill" aria-hidden="true" />
            <small>Goals</small>
          </button>
          <button
            type="button"
            className="gh-round"
            onClick={() => store.openPanel("worlds")}
          >
            <Globe weight="fill" aria-hidden="true" />
            <small>Worlds</small>
          </button>
          <button
            type="button"
            className="gh-round"
            onClick={() => store.openPanel("settings")}
          >
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
        </>
      )}
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
      const batch = Array.from({ length: 8 }, (_, k) => ({
        id: ++id,
        x: d.x + (Math.random() - 0.5) * 40,
        y: d.y + (Math.random() - 0.5) * 30,
        tx,
        ty,
        k,
        sw: (Math.random() - 0.5) * 60,
      }));
      setItems((v) => [...v, ...batch]);
      window.setTimeout(
        () => setItems((v) => v.filter((x) => !batch.includes(x))),
        1400,
      );
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
          animate={{
            x: [f.x, f.x + f.sw, f.tx],
            y: [f.y, f.y - 50, f.ty],
            scale: [0.4, 1.1, 0.7],
            opacity: [0, 1, 1],
          }}
          transition={{ duration: 0.9, delay: f.k * 0.05, ease: "easeInOut" }}
        >
          <Coins weight="fill" />
        </motion.span>
      ))}
    </div>
  );
}

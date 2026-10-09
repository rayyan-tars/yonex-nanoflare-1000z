"use client";

import { Cloud, CloudFog, Drop, CloudLightning, CloudRain as RainIcon, Eye, Fire, Thermometer, Tree, Warning, X, CloudRain, Coins, Eraser, Gear, Globe, Hammer, Lightning, Moon, Plant, Smiley, SmileyMeh, SmileySad, Star, Sun, Trophy, Users } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ecoSummary, powerNetwork } from "../model/eco";
import type { EventResult } from "../state/store";
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
        key={warn ? (warn.key ?? warn.text) : goal ? goal.id : "done"}
        className={`gh-advisor ${warn ? (warn.tone === "good" ? "gh-advisor--good" : "gh-advisor--warn") : goal ? "" : "gh-advisor--good"}`}
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

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Time of day, today's weather and what's coming (or the heatwave countdown). */
export function WeatherChip() {
  const store = useGame();
  const e = env(store.town.clock);
  const next = forecast(store.town.clock);
  const h = store.sim.stats.heat;
  const f = store.sim.stats.flood;
  const Icon = e.sun <= 0 && e.weather === "sunny" ? Moon : WEATHER_ICON[e.weather];
  const hours = (e.dayPhase * 24 + 24) % 24;
  const time = `${String(Math.floor(hours)).padStart(2, "0")}:${String(Math.floor(((hours % 1) * 60) / 10) * 10).padStart(2, "0")}`;
  if (f.phase === "forecast" || f.phase === "rain") {
    const sections = f.sections.length;
    return (
      <div className={`gh-weather gh-weather--flood${f.phase === "rain" ? " is-on" : ""}`} role="status">
        <RainIcon weight="fill" aria-hidden="true" />
        <b>{f.phase === "forecast" ? `Heavy rain in ${clock(f.seconds)}` : `Heavy rain · ${clock(f.seconds)} left`}</b>
        <span className="gh-heatchips">
          <span className={sections ? "is-bad" : "is-good"} title="Roads with more concrete than green around them flood">
            <Drop weight="fill" aria-hidden="true" /> {sections ? `${sections} ${sections === 1 ? "road" : "roads"} at risk` : "Roads safe"}
          </span>
        </span>
      </div>
    );
  }
  if (h.phase !== "none") {
    const homes = store.sim.stats.homes.length;
    return (
      <div className={`gh-weather gh-weather--heat${h.phase === "event" ? " is-on" : ""}`} role="status" title="Shade, power and water decide how your town copes">
        {h.phase === "forecast" ? <Warning weight="fill" aria-hidden="true" /> : <Fire weight="fill" aria-hidden="true" />}
        <b>{h.phase === "forecast" ? `Heatwave in ${clock(h.seconds)}` : `Heatwave · ${clock(h.seconds)} left`}</b>
        <span className="gh-heatchips">
          <span className={h.exposed ? "is-bad" : "is-good"} title="Homes with shade: 2 trees, a park or a green roof within 2 tiles">
            <Tree weight="fill" aria-hidden="true" /> Shade {homes - h.exposed}/{homes}
          </span>
          <span className={h.powerHolds ? "is-good" : "is-bad"} title="Power at the peak of the heat, with air-conditioning">
            <Lightning weight="fill" aria-hidden="true" /> Power {h.powerHolds ? "OK" : "short"}
          </span>
          <span className={h.waterHolds ? "is-good" : "is-bad"} title="Water at the peak of the heat">
            <Drop weight="fill" aria-hidden="true" /> Water {h.waterHolds ? "OK" : "short"}
          </span>
        </span>
      </div>
    );
  }
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

const BRIDGE_KEY = "greenhold.bridge.v1";
/** One optional real-world question after a challenge handled well, shown once per kind of event. */
const BRIDGE = {
  heat: { lead: "Shade protected your homes.", ask: "Is there one place around your school that needs more shade?" },
  flood: { lead: "Your town used green space to handle the rain.", ask: "Where does rainwater collect around your school or street?" },
};
function bridgeSeen(kind: string) {
  try {
    return (JSON.parse(window.localStorage.getItem(BRIDGE_KEY) ?? "[]") as string[]).includes(kind);
  } catch {
    return false;
  }
}
function markBridge(kind: string) {
  try {
    const seen = JSON.parse(window.localStorage.getItem(BRIDGE_KEY) ?? "[]") as string[];
    window.localStorage.setItem(BRIDGE_KEY, JSON.stringify([...seen, kind]));
  } catch {
    // Storage blocked: it may show again, which is harmless.
  }
}

/** After a heatwave or heavy rain: the score and at most two lines on why. */
export function EventResultCard() {
  const store = useGame();
  const e = store.eventResult;
  useEffect(() => {
    if (!e) return;
    const t = window.setTimeout(() => store.dismissResult(), 20000);
    return () => window.clearTimeout(t);
  }, [e, store]);
  return <AnimatePresence>{e && <ResultCard key={`${e.kind}-${e.r.score}`} e={e} onClose={() => store.dismissResult()} />}</AnimatePresence>;
}

function resultLines(e: EventResult): string[] {
  if (e.kind === "flood") {
    const r = e.r;
    if (!r.flooded) return ["Green spaces kept every road clear."];
    if (r.score >= 70) return ["Green spaces protected most roads.", `${r.sections} ${r.sections === 1 ? "road" : "roads"} still flooded: add green beside ${r.sections === 1 ? "it" : "them"}.`];
    return [`${r.sections} ${r.sections === 1 ? "road" : "roads"} flooded: too much concrete around ${r.sections === 1 ? "it" : "them"}.`, "Add trees or a park beside them."];
  }
  const r = e.r;
  const shade = r.exposed ? `${r.exposed} ${r.exposed === 1 ? "home" : "homes"} overheated: plant trees beside ${r.exposed === 1 ? "it" : "them"}.` : "Shade protected every home.";
  const supply = r.power < 0.99 ? "Power fell short at the peak: add solar or wind." : r.water < 0.99 ? "Water ran short: add a reservoir and filtration." : "Power and water held up.";
  return [shade, supply];
}

function ResultCard({ e, onClose }: { e: EventResult; onClose: () => void }) {
  const good = e.r.score >= 70;
  const [bridge] = useState(() => good && !bridgeSeen(e.kind));
  const done = () => {
    if (bridge) markBridge(e.kind);
    onClose();
  };
  const b = BRIDGE[e.kind];
  return (
    <motion.div className={`gh-heatcard${good ? " is-good" : ""}`} role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
      <button type="button" className="gh-heatcard__x" onClick={done} aria-label="Close">
        <X weight="bold" />
      </button>
      <b className="gh-heatcard__title">
        {e.kind === "heat" ? <Thermometer weight="fill" aria-hidden="true" /> : <RainIcon weight="fill" aria-hidden="true" />}
        {e.kind === "heat" ? "Heatwave passed" : "Heavy rain passed"}
      </b>
      <div className="gh-heatcard__score">
        Resilience <strong>{e.r.score}%</strong>
      </div>
      <ul>
        {resultLines(e).map((l) => (
          <li key={l} className={/flooded|overheated|short/.test(l) ? "is-bad" : "is-ok"}>
            {l}
          </li>
        ))}
      </ul>
      {bridge && (
        <div className="gh-bridge">
          <p>
            <b>{b.lead}</b> {b.ask}
          </p>
          <div className="gh-bridge__btns">
            <button type="button" className="gh-btn gh-btn--green" onClick={done}>
              I&apos;ll look for one spot
            </button>
            <button type="button" className="gh-link" onClick={done}>
              Keep building
            </button>
          </div>
        </div>
      )}
      <small>Greenhold simulation indicator</small>
    </motion.div>
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
  const fl = s.flood;
  if (fl.phase !== "none") {
    const atRisk = fl.flooded.length;
    return (
      <motion.div className="gh-eco__key" role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
        <span title="Blue: too much concrete, floods in heavy rain. Green: protected.">
          <i className="gh-eco__sw gh-eco__sw--flood" />
          Flood risk
        </span>
        <span title="Road tiles with more concrete than green within 2 tiles">
          <i className="gh-eco__dot gh-eco__dot--wet" />
          Roads at risk <b>{atRisk}</b>
        </span>
        <span title="Road tiles with enough green around them">
          <i className="gh-eco__dot gh-eco__dot--cool" />
          Protected <b>{fl.roads - atRisk}</b>
        </span>
        <button type="button" className="gh-eco__help" onClick={onHelp} aria-label="What am I looking at?">
          ?
        </button>
      </motion.div>
    );
  }
  const h = s.heat;
  if (h.phase !== "none")
    return (
      <motion.div className="gh-eco__key" role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
        <span title="Heat layer: warm colours are exposed, blue-green is shaded">
          <i className="gh-eco__sw gh-eco__sw--heat" />
          Heat layer
        </span>
        <span title="No shade within 2 tiles">
          <i className="gh-eco__dot gh-eco__dot--hot" />
          Hot homes <b>{h.exposed}</b>
        </span>
        <span title="2 trees, a park or a green roof within 2 tiles">
          <i className="gh-eco__dot gh-eco__dot--cool" />
          Shaded <b>{h.shaded + h.partly}</b>
        </span>
        <button type="button" className="gh-eco__help" onClick={onHelp} aria-label="What am I looking at?">
          ?
        </button>
      </motion.div>
    );
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

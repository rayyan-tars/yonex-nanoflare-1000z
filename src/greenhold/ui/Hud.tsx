"use client";

import {
  Bicycle,
  CloudFog,
  CloudRain,
  Coins,
  Drop,
  Eraser,
  Gear,
  Hammer,
  Lightning,
  MapTrifold,
  Moon,
  Package,
  Plant,
  Smiley,
  SmileyMeh,
  SmileySad,
  Star,
  Sun,
  Target,
  Trash,
  Users,
  Wind,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { GOALS, STAR_NAMES, advise, env } from "../model/sim";
import { BUILDERS, CHEST_CAP, MAT_CAP, TH_TITLES, buildersBusy } from "../model/world";
import { useGame, useStoreRef } from "./context";
import { fmt } from "./format";

export function TopBar() {
  const store = useGame();
  const t = store.town;
  const s = store.sim.stats;
  const now = store.now();
  const busy = buildersBusy(t, now);
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
          <button type="button" className="gh-stars" onClick={() => store.openPanel("stars")} aria-label={`${s.starCount} of 5 eco stars`}>
            {s.stars.map((on, k) => (
              <Star key={k} weight="fill" className={on ? "is-on" : undefined} aria-hidden="true" />
            ))}
          </button>
        </div>
      </div>

      <div className="gh-res" aria-label="Resources">
        <div className="gh-res__row" id="gh-coins">
          <Coins weight="fill" className="gh-ico gh-ico--gold" aria-hidden="true" />
          <span className="gh-res__num">{fmt(t.coins)}</span>
          <span className="gh-res__label">coins</span>
        </div>
        <div className="gh-res__row" id="gh-mats" title={`Storage ${MAT_CAP[t.th]}`}>
          <Package weight="fill" className="gh-ico gh-ico--teal" aria-hidden="true" />
          <span className="gh-res__num">{fmt(t.mats)}</span>
          <span className="gh-res__cap">
            <i style={{ width: `${Math.min(100, (t.mats / MAT_CAP[t.th]) * 100)}%` }} />
          </span>
        </div>
        <div className="gh-res__mini">
          <span title="Builders free">
            <Hammer weight="fill" aria-hidden="true" /> {BUILDERS[t.th] - busy}/{BUILDERS[t.th]}
          </span>
          <span title="Residents / room">
            <Users weight="fill" aria-hidden="true" /> {Math.floor(t.residents)}/{s.housing}
          </span>
          <span title="Happiness">
            <Face weight="fill" aria-hidden="true" /> {Math.round(s.happiness)}%
          </span>
        </div>
      </div>
    </>
  );
}

function Meter({ icon, label, supply, demand, good, title }: { icon: React.ReactNode; label: string; supply: number; demand: number; good: boolean; title?: string }) {
  const k = demand > 0 ? Math.min(1, supply / demand) : 1;
  return (
    <div className={`gh-meter ${good ? "is-good" : "is-bad"}`} title={title}>
      <span className="gh-meter__ico">{icon}</span>
      <span className="gh-meter__body">
        <span className="gh-meter__top">
          <span>{label}</span>
          <b>
            {fmt(Math.floor(supply + 0.01))}/{fmt(Math.ceil(demand - 0.01))}
          </b>
        </span>
        <span className="gh-meter__bar">
          <i style={{ width: `${k * 100}%` }} />
        </span>
      </span>
    </div>
  );
}

export function Meters() {
  const store = useGame();
  const s = store.sim.stats;
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 760);
  const e = s.energy;
  const w = s.water;
  const f = s.food;
  const ws = s.waste;
  const handled = ws.made - ws.overflow;
  return (
    <div className={`gh-meters ${open ? "" : "is-closed"}`}>
      <button type="button" className="gh-meters__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Town needs {open ? "▾" : "▸"}
      </button>
      {open && (
        <>
          <Meter
            icon={<Lightning weight="fill" />}
            label="Energy"
            supply={e.supply}
            demand={e.demand}
            good={e.supply >= e.demand - 0.01}
            title={`Now: ${fmt(e.steady)} steady, ${fmt(e.solar)} solar, ${fmt(e.wind)} wind${e.batteryCap ? `, battery ${fmt(store.town.battery)}/${fmt(e.batteryCap)}` : ""}. Clean share (daily average): ${Math.round(e.renewShare * 100)}%`}
          />
          <Meter icon={<Drop weight="fill" />} label="Water" supply={w.supply} demand={w.demand} good={w.supply >= w.demand - 0.01} />
          <Meter
            icon={<Plant weight="fill" />}
            label="Food grown"
            supply={f.supply}
            demand={f.demand}
            good={f.imported === 0}
            title={f.imported > 0 ? `${fmt(f.imported)} trucked in (costs coins and carbon)` : "All grown locally"}
          />
          <Meter
            icon={<Trash weight="fill" />}
            label="Waste handled"
            supply={handled}
            demand={ws.made}
            good={ws.overflow === 0}
            title={`Compost ${fmt(ws.compost)}, recycled ${fmt(ws.recycle)}, landfill ${fmt(ws.landfill)}, overflowing ${fmt(ws.overflow)}`}
          />
          <div className="gh-meter gh-meter--plain" title="Average air pollution where people live (0 clean, 100 very dirty)">
            <span className="gh-meter__ico">
              <CloudFog weight="fill" />
            </span>
            <span className="gh-meter__body">
              <span className="gh-meter__top">
                <span>Air</span>
                <b className={s.homeAir < 12 ? "gh-good" : "gh-bad"}>{s.homeAir < 6 ? "Fresh" : s.homeAir < 12 ? "OK" : s.homeAir < 30 ? "Smoggy" : "Toxic"}</b>
              </span>
            </span>
          </div>
          <div className="gh-meter gh-meter--plain" title="Car use among residents">
            <span className="gh-meter__ico">
              <Bicycle weight="fill" />
            </span>
            <span className="gh-meter__body">
              <span className="gh-meter__top">
                <span>Drive</span>
                <b className={s.travel.carShare <= 0.4 ? "gh-good" : "gh-bad"}>{Math.round(s.travel.carShare * 100)}%</b>
              </span>
            </span>
          </div>
          <div className="gh-meter gh-meter--plain" title={`Carbon your town makes each minute. Trees, gardens and green roofs take in ${s.co2.sink.toFixed(0)} a minute, so keep the woods standing.`}>
            <span className="gh-meter__ico gh-co2">CO₂</span>
            <span className="gh-meter__body">
              <span className="gh-meter__top">
                <span>Made /min</span>
                <b className={s.stars[3] || store.town.residents < 4 ? "gh-good" : "gh-bad"}>{s.co2.made.toFixed(1)}</b>
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function Clock() {
  const store = useGame();
  const e = env(store.town.clock);
  const day = e.sun > 0;
  const hours = (e.dayPhase * 24 + 24) % 24;
  const label = `${String(Math.floor(hours)).padStart(2, "0")}:${String(Math.floor((hours % 1) * 60 / 10) * 10).padStart(2, "0")}`;
  return (
    <div className="gh-clock" aria-label={`Time ${label}, ${day ? "day" : "night"}, wind ${Math.round(e.wind * 100)}%${e.rain > 0 ? ", raining" : ""}`}>
      {day ? <Sun weight="fill" className="gh-ico--gold" /> : <Moon weight="fill" className="gh-ico--moon" />}
      <span>{label}</span>
      <span className="gh-clock__sep" />
      <Wind weight="bold" />
      <span>{Math.round(e.wind * 100)}%</span>
      {e.rain > 0.05 && (
        <>
          <span className="gh-clock__sep" />
          <CloudRain weight="fill" />
        </>
      )}
    </div>
  );
}

export function Advisor() {
  const store = useGame();
  const tip = advise(store.town, store.sim.stats, store.now());
  const [hidden, setHidden] = useState<string | null>(null);
  if (hidden === tip.text || store.panel === "intro") return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tip.id}
        className={`gh-advisor gh-advisor--${tip.tone}`}
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
          <b>Fern, your eco advisor</b>
          {tip.text}
        </span>
        <span className="gh-advisor__actions">
          {tip.at !== undefined && (
            <button type="button" className="gh-link" onClick={() => store.bus.emit("focus", { i: tip.at! })}>
              Show me
            </button>
          )}
          <button type="button" className="gh-x" aria-label="Hide tip" onClick={() => setHidden(tip.text)}>
            ×
          </button>
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

export function Dock() {
  const store = useGame();
  const t = store.town;
  const goalsLeft = GOALS.length - t.goals.length;
  const remove = store.tool.kind === "remove";
  return (
    <div className="gh-dock">
      <button type="button" className={`gh-round ${store.overlay === "air" ? "is-on" : ""}`} onClick={() => store.setOverlay(store.overlay === "air" ? "none" : "air")} aria-pressed={store.overlay === "air"}>
        <MapTrifold weight="fill" aria-hidden="true" />
        <small>Air map</small>
      </button>
      <button type="button" className="gh-round" onClick={() => store.openPanel("goals")}>
        <Target weight="fill" aria-hidden="true" />
        <small>Goals</small>
        {goalsLeft > 0 && <span className="gh-round__badge">{goalsLeft}</span>}
      </button>
      <button type="button" className={`gh-round ${remove ? "is-on is-red" : ""}`} onClick={() => store.setTool(remove ? { kind: "none" } : { kind: "remove" })} aria-pressed={remove}>
        <Eraser weight="fill" aria-hidden="true" />
        <small>Remove</small>
      </button>
      <button type="button" className="gh-round" onClick={() => store.openPanel("settings")}>
        <Gear weight="fill" aria-hidden="true" />
        <small>Settings</small>
      </button>
      <button
        type="button"
        className={`gh-build ${store.category ? "is-open" : ""}`}
        onClick={() => {
          if (store.category) store.setCategory(null);
          else {
            if (store.tool.kind === "remove") store.setTool({ kind: "none" });
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

/** Taxes ready to collect, shown beside the Town Hall button too (for keyboard and small screens). */
export function ChestPill() {
  const store = useGame();
  const t = store.town;
  if (t.chest < 1) return null;
  const full = t.chest >= CHEST_CAP[t.th] * 0.999;
  return (
    <button type="button" className={`gh-chest ${full ? "is-full" : ""}`} onClick={() => store.collect("coins")}>
      <Coins weight="fill" aria-hidden="true" /> Collect {fmt(t.chest)} {full ? "(full)" : ""}
    </button>
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
  kind: "coins" | "mats";
  x: number;
  y: number;
  tx: number;
  ty: number;
  k: number;
  /** Sideways swing on the way. */
  sw: number;
}

/** Coins and materials fly from the town into the counters. */
export function FlyLayer() {
  const store = useStoreRef();
  const [items, setItems] = useState<Fly[]>([]);
  useEffect(() => {
    let id = 0;
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ kind: "coins" | "mats"; x: number; y: number }>).detail;
      const el = document.getElementById(d.kind === "coins" ? "gh-coins" : "gh-mats");
      const r = el?.getBoundingClientRect();
      const tx = r ? r.left + 18 : window.innerWidth - 120;
      const ty = r ? r.top + r.height / 2 : 30;
      const batch = Array.from({ length: 8 }, (_, k) => ({ id: ++id, kind: d.kind, x: d.x + (Math.random() - 0.5) * 40, y: d.y + (Math.random() - 0.5) * 30, tx, ty, k, sw: (Math.random() - 0.5) * 60 }));
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
          className={`gh-fly__item gh-fly__item--${f.kind}`}
          initial={{ x: f.x, y: f.y, scale: 0.4, opacity: 0 }}
          animate={{ x: [f.x, f.x + f.sw, f.tx], y: [f.y, f.y - 50, f.ty], scale: [0.4, 1.1, 0.7], opacity: [0, 1, 1] }}
          transition={{ duration: 0.9, delay: f.k * 0.05, ease: "easeInOut" }}
        >
          {f.kind === "coins" ? <Coins weight="fill" /> : <Package weight="fill" />}
        </motion.span>
      ))}
    </div>
  );
}

export function StarHint() {
  const store = useGame();
  const s = store.sim.stats;
  const missing = s.stars.findIndex((x) => !x);
  if (missing < 0 || store.town.residents < 4) return null;
  return <span className="gh-sr">Next eco star: {STAR_NAMES[missing].name}</span>;
}

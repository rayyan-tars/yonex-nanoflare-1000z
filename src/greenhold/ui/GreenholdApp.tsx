"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { env } from "../model/sim";
import { GameStore } from "../state/store";
import { sfx } from "./audio";
import { StoreContext, useGame, useStoreRef } from "./context";
import { fmt } from "./format";
import { Advisor, ChestPill, Clock, Dock, FlyLayer, Meters, Toasts, TopBar } from "./Hud";
import { GoalsPanel, InfoCard, IntroPanel, SettingsPanel, StarsPanel, TownHallPanel } from "./Panels";
import { Shop } from "./Shop";
import { Splash } from "./Splash";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

export default function GreenholdApp() {
  const [store] = useState(() => new GameStore());
  const [boot, setBoot] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  const [bootKey, setBootKey] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    store.start();
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { greenhold: GameStore }).greenhold = store;
    return () => store.stop();
  }, [store]);

  return (
    <StoreContext.Provider value={store}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>
        <div className="gh-root">
          <div className="gh-sea" aria-hidden="true" />
          {boot.status !== "error" && (
            <GameCanvas
              key={`${bootKey}-${reduced}`}
              reduced={reduced}
              onReady={() => setBoot({ status: "ready" })}
              onError={(e) => setBoot({ status: "error", error: e instanceof Error ? e.message : String(e) })}
            />
          )}
          {boot.status === "ready" ? (
            <Game />
          ) : (
            <Splash
              error={boot.error}
              onRetry={() => {
                setBoot({ status: "loading" });
                setBootKey((k) => k + 1);
              }}
            />
          )}
        </div>
      </MotionConfig>
    </StoreContext.Provider>
  );
}

function GameCanvas({ reduced, onReady, onError }: { reduced: boolean; onReady: () => void; onError: (e: unknown) => void }) {
  const store = useStoreRef();
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onReady, onError });
  useEffect(() => {
    cb.current = { onReady, onError };
  });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let handle: { destroy(): void } | null = null;
    const mount = document.createElement("div");
    mount.className = "gh-canvas-mount";
    el.appendChild(mount);
    const watchdog = window.setTimeout(() => !cancelled && !handle && cb.current.onError(new Error("The town took too long to start.")), 20000);
    import("../game/createGame")
      .then(({ createGame }) => {
        if (cancelled) return;
        handle = createGame(mount, {
          store,
          reduced,
          onReady: () => !cancelled && cb.current.onReady(),
          onError: (e) => !cancelled && cb.current.onError(e),
        });
      })
      .catch((e) => !cancelled && cb.current.onError(e));
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      handle?.destroy();
      mount.remove();
    };
  }, [store, reduced]);
  return <div ref={host} className="gh-canvas" />;
}

function Game() {
  const store = useGame();
  useSounds();
  useKeys();
  useAwayNote();
  const e = env(store.town.clock);
  const building = store.tool.kind !== "none";
  return (
    <>
      <div className="gh-night" style={{ opacity: e.night * 0.25 }} aria-hidden="true" />
      {e.rain > 0.05 && <div className="gh-rain" style={{ opacity: Math.min(0.85, e.rain) }} aria-hidden="true" />}
      <div className="gh-hud" inert={store.panel !== null}>
        <TopBar />
        <Clock />
        <Meters />
        <ChestPill />
        {building && (
          <div className="gh-mode" role="status">
            {store.tool.kind === "remove" ? "Remove mode: tap or drag to remove the top piece" : "Building: tap or drag on the map"}
            <button type="button" className="gh-link" onClick={() => store.setTool({ kind: "none" })}>
              Done
            </button>
          </div>
        )}
        <AnimatePresence>{store.selected !== null && <InfoCard key={`info-${store.selected}`} />}</AnimatePresence>
        <AnimatePresence>{!store.category && <Advisor key="advisor" />}</AnimatePresence>
        <AnimatePresence>{store.category && <Shop key="shop" />}</AnimatePresence>
        <Dock />
      </div>
      <Toasts />
      <FlyLayer />
      <AnimatePresence>
        {store.panel === "intro" && <IntroPanel key="intro" />}
        {store.panel === "townhall" && <TownHallPanel key="th" />}
        {store.panel === "stars" && <StarsPanel key="stars" />}
        {store.panel === "goals" && <GoalsPanel key="goals" />}
        {store.panel === "settings" && <SettingsPanel key="settings" />}
      </AnimatePresence>
    </>
  );
}

function useSounds() {
  const store = useStoreRef();
  useEffect(() => {
    const play = (f: () => void) => () => store.sound && f();
    const offs = [
      store.bus.on("col", ({ change }) => store.sound && (change === "remove" ? sfx.remove() : change === "ground" ? sfx.ground() : sfx.place())),
      store.bus.on("built", play(sfx.built)),
      store.bus.on("goal", play(sfx.goal)),
      store.bus.on("townhall", play(sfx.goal)),
      store.bus.on("collect", play(sfx.collect)),
      store.bus.on("fail", play(sfx.error)),
      store.bus.on("moveIn", play(sfx.movein)),
    ];
    return () => offs.forEach((f) => f());
  }, [store]);
}

function useKeys() {
  const store = useStoreRef();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (store.panel) return;
      if (e.key === "Escape") {
        if (store.tool.kind !== "none") store.setTool({ kind: "none" });
        else if (store.category) store.setCategory(null);
        else if (store.selected !== null) store.select(null);
      }
      if (e.key.toLowerCase() === "b" && !e.metaKey && !e.ctrlKey) store.setCategory(store.category ? null : "homes");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [store]);
}

function useAwayNote() {
  const store = useStoreRef();
  useEffect(() => {
    if (store.saveState === "repaired") store.toast("Your saved town couldn't be read, so a new one was started.", "warn", 8000);
    if (store.awayFor > 60) store.toast(`Welcome back! Taxes kept coming in while you were away: ${fmt(store.town.chest)} coins are waiting.`, "good", 6000);
  }, [store]);
}

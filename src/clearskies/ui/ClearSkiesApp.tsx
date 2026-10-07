"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Store } from "../state/store";
import { sfx } from "./audio";
import { StoreContext, useGame, useStoreRef } from "./context";
import { Splash } from "./Splash";
import { AirCard, Decision, Finale, Intro, Reveal, SoundToggle } from "./Story";

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

export default function ClearSkiesApp() {
  const [store] = useState(() => new Store());
  const [boot, setBoot] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  const [bootKey, setBootKey] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    store.start();
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { clearskies: Store }).clearskies = store;
    return () => store.stop();
  }, [store]);

  return (
    <StoreContext.Provider value={store}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>
        <div className="cs-root">
          <div className="cs-sea" aria-hidden="true" />
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
    mount.className = "cs-canvas-mount";
    el.appendChild(mount);
    const watchdog = window.setTimeout(() => !cancelled && !handle && cb.current.onError(new Error("The town took too long to load.")), 20000);
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
  return <div ref={host} className="cs-canvas" />;
}

function Game() {
  const store = useGame();
  useSounds();
  const p = store.phase;
  return (
    <>
      <header className="cs-bar">
        <span className="cs-brand cs-display">Clear Skies</span>
        <SoundToggle />
      </header>
      <AirCard />
      <AnimatePresence mode="wait">
        {p === "intro" && <Intro key="intro" />}
        {(p === "choose" || p === "working" || p === "learned") && <Decision key={`decision-${store.stepIndex}`} />}
      </AnimatePresence>
      {p === "reveal" && <Reveal />}
      <AnimatePresence>{p === "finale" && <Finale key="finale" />}</AnimatePresence>
    </>
  );
}

function useSounds() {
  const store = useStoreRef();
  const last = useRef({ phase: store.phase, tried: store.tried });
  useEffect(() => {
    const off = store.bus.on("col", ({ change }) => store.sound && (change === "remove" ? sfx.remove() : change === "ground" ? sfx.ground() : sfx.place()));
    const unsub = store.subscribe(() => {
      const prev = last.current;
      if (store.sound) {
        if (store.tried && store.tried !== prev.tried) {
          const c = store.step.choices.find((x) => x.id === store.tried);
          if (c && !c.good) sfx.error();
          else sfx.click();
        }
        if (store.phase === "learned" && prev.phase !== "learned") sfx.built();
        if (store.phase === "finale" && prev.phase !== "finale") sfx.goal();
      }
      last.current = { phase: store.phase, tried: store.tried };
    });
    return () => {
      off();
      unsub();
    };
  }, [store]);
}

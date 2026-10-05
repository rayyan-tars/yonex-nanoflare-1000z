"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createBus } from "../state/bus";
import { getBrowserStorage, loadSave } from "../state/persistence";
import { createEcoStore, prefersReducedMotion, type Selection } from "../state/store";
import { CouncilPanel } from "./CouncilPanel";
import { EcoContext, useEco, useEcoEnv, type EcoEnv } from "./context";
import { GameCanvas } from "./GameCanvas";
import { PlacesNav, TopBar } from "./Hud";
import { MeadowPanel } from "./MeadowPanel";
import { BootError, BootSplash } from "./BootScreens";
import { AboutDialog, IntroOverlay, ResetConfirmDialog, SettingsDialog, Toast } from "./Overlays";

const LOAD_NOTICES: Record<string, string | undefined> = {
  unreadable: "Saved EcoRise data couldn't be read, so a fresh game was started.",
  obsolete: "Saved EcoRise data was from an older version, so a fresh game was started.",
  repaired: "Some saved settings were invalid and have been reset.",
  unavailable: "This browser is blocking storage, so progress won't be saved.",
};

function createEnv(): EcoEnv {
  const storage = getBrowserStorage();
  const loaded = loadSave(storage);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const store = createEcoStore({
    initialSave: loaded.data,
    loadStatus: loaded.status,
    storage,
    systemReducedMotion: mq.matches,
  });
  const notice = LOAD_NOTICES[loaded.status];
  if (notice) store.actions.notify(notice);
  return { store, bus: createBus(), debug: new URLSearchParams(window.location.search).has("debug") };
}

/** Client-only root. Loaded with `ssr: false`, so browser APIs are safe here. */
export default function EcoRiseApp() {
  const [env] = useState(createEnv);
  return (
    <EcoContext.Provider value={env}>
      <Shell />
    </EcoContext.Provider>
  );
}

function Shell() {
  const { store, bus } = useEcoEnv();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelSlotRef = useRef<HTMLDivElement>(null);
  const boot = useEco((s) => s.boot);
  const introOpen = useEco((s) => s.introOpen);
  const selection = useEco((s) => s.selection);
  const overlay = useEco((s) => s.overlay);
  const quality = useEco((s) => s.save.settings.quality);
  const reduced = useEco(prefersReducedMotion);
  const [bootKey, setBootKey] = useState(0);
  const [fontFamily, setFontFamily] = useState("system-ui, sans-serif");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const body = getComputedStyle(root).getPropertyValue("--font-eco-body").trim();
    if (body) setFontFamily(`${body}, system-ui, sans-serif`);
  }, []);

  // Follow the device's reduced-motion preference.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => store.actions.setSystemReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [store]);

  // Save promptly when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => store.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [store]);

  // Escape closes the side panel (dialogs handle their own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const s = store.getState();
      if (!s.overlay && !s.introOpen && s.selection) store.actions.clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  // Keep the selected place visible beside the panel, and restore focus on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const prevSelection = useRef<Selection>(null);
  useEffect(() => {
    const prev = prevSelection.current;
    prevSelection.current = selection;
    if (selection && !prev) {
      const active = document.activeElement as HTMLElement | null;
      openerRef.current = active && active !== document.body ? active : null;
    }
    if (selection) {
      const raf = requestAnimationFrame(() => {
        const slot = panelSlotRef.current?.firstElementChild as HTMLElement | null;
        const rect = slot?.getBoundingClientRect();
        const insetRight = rect ? Math.max(0, window.innerWidth - rect.left) : 0;
        bus.emit("focus", { target: selection, insetRight });
      });
      return () => cancelAnimationFrame(raf);
    }
    if (prev && !selection) {
      const opener = openerRef.current;
      openerRef.current = null;
      const fallback = rootRef.current?.querySelector<HTMLElement>(`.eco-place[data-place="${prev}"]`);
      if (opener && opener.isConnected && !opener.closest(".eco-panel")) opener.focus({ preventScroll: true });
      else if (document.activeElement === document.body || !document.activeElement?.isConnected) fallback?.focus({ preventScroll: true });
    }
  }, [selection, bus]);

  const ready = boot.status === "ready";
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div ref={rootRef} className="eco-root" data-reduced-motion={reduced || undefined} data-lenis-prevent>
        <div className="eco-sea" aria-hidden="true" />
        {boot.status !== "error" && <GameCanvas key={`${bootKey}-${quality}`} quality={quality} fontFamily={fontFamily} />}

        {ready && (
          <div className="eco-hud" inert={introOpen || !!overlay ? true : undefined}>
            <TopBar />
            <PlacesNav />
            <div ref={panelSlotRef} className="eco-panel-slot">
              <AnimatePresence>
                {selection === "kitchen" && <CouncilPanel key="kitchen" />}
                {selection === "meadow" && <MeadowPanel key="meadow" />}
              </AnimatePresence>
            </div>
          </div>
        )}

        <AnimatePresence>{ready && introOpen && <IntroOverlay key="intro" />}</AnimatePresence>
        <AnimatePresence>
          {overlay === "about" && <AboutDialog key="about" />}
          {overlay === "settings" && <SettingsDialog key="settings" />}
          {overlay === "reset-confirm" && <ResetConfirmDialog key="reset" />}
        </AnimatePresence>

        {boot.status === "loading" && <BootSplash />}
        {boot.status === "error" && (
          <BootError
            message={boot.message}
            onRetry={() => {
              store.actions.bootRetry();
              setBootKey((k) => k + 1);
            }}
          />
        )}
        <Toast />
      </div>
    </MotionConfig>
  );
}

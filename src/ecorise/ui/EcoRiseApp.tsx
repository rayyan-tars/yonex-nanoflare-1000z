"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createBus } from "../state/bus";
import { getBrowserStorage, loadSave } from "../state/persistence";
import { createEcoStore, prefersReducedMotion, type Selection } from "../state/store";
import { BootError, BootSplash } from "./BootScreens";
import { CouncilPanel } from "./CouncilPanel";
import { EcoContext, useEco, useEcoEnv, type EcoEnv } from "./context";
import { GameCanvas } from "./GameCanvas";
import { Dock, TopBar } from "./Hud";
import { BuildCard, BuildPrompt, BuiltCard, ConstructionHud, PlotInfo } from "./Campus";
import { AboutDialog, IntroOverlay, ResetConfirmDialog, SettingsDialog, Toast } from "./Overlays";
import { MissionPanel } from "./MissionPanel";
import { ResultsPanel, ServiceHud } from "./Round";

const LOAD_NOTICES: Record<string, string | undefined> = {
  unreadable: "Saved EcoRise data couldn't be read, so a fresh game was started.",
  obsolete: "Saved EcoRise data was from an older version, so a fresh game was started.",
  repaired: "Some saved settings were invalid and have been reset.",
  unavailable: "This browser is blocking storage, so progress won't be saved.",
};

type Fonts = { body: string; display: string };

function readFonts(): Fonts {
  const host = document.querySelector(".eco-fonts") ?? document.body;
  const style = getComputedStyle(host);
  const body = style.getPropertyValue("--font-eco-body").trim();
  const display = style.getPropertyValue("--font-eco-display").trim();
  return {
    body: body ? `${body}, system-ui, sans-serif` : "system-ui, sans-serif",
    display: display ? `${display}, Georgia, serif` : "Georgia, serif",
  };
}

function createEnv(): EcoEnv & { fonts: Fonts } {
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
  return {
    store,
    bus: createBus(),
    debug: new URLSearchParams(window.location.search).has("debug"),
    fonts: readFonts(),
  };
}

/** Client-only root. Loaded with `ssr: false`, so browser APIs are safe here. */
export default function EcoRiseApp() {
  const [env] = useState(createEnv);
  return (
    <EcoContext.Provider value={env}>
      <Shell fonts={env.fonts} />
    </EcoContext.Provider>
  );
}

function Shell({ fonts }: { fonts: Fonts }) {
  const { store, bus } = useEcoEnv();
  const panelSlotRef = useRef<HTMLDivElement>(null);
  const boot = useEco((s) => s.boot);
  const introOpen = useEco((s) => s.introOpen);
  const selection = useEco((s) => s.selection);
  const overlay = useEco((s) => s.overlay);
  const phase = useEco((s) => s.phase);
  const round = useEco((s) => s.round);
  const quality = useEco((s) => s.save.settings.quality);
  const reduced = useEco(prefersReducedMotion);
  const [bootKey, setBootKey] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => store.actions.setSystemReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [store]);

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

  const insetRight = () => {
    const slot = panelSlotRef.current?.firstElementChild as HTMLElement | null;
    const rect = slot?.getBoundingClientRect();
    return rect ? Math.max(0, window.innerWidth - rect.left) : 0;
  };

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
      const raf = requestAnimationFrame(() => bus.emit("focus", { target: selection, insetRight: insetRight() }));
      return () => cancelAnimationFrame(raf);
    }
    if (prev && !selection && phase === "planning") {
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected && !opener.closest(".eco-panel")) opener.focus({ preventScroll: true });
    }
  }, [selection, bus, phase]);

  // Frame the kitchen, leftovers and bin beside the results card.
  useEffect(() => {
    if (phase !== "results" && phase !== "built") return;
    const raf = requestAnimationFrame(() => bus.emit("focus", { target: phase === "built" ? "meadow" : "results", insetRight: insetRight() }));
    return () => cancelAnimationFrame(raf);
  }, [phase, bus]);

  const ready = boot.status === "ready";
  const maxFigures = quality === "performance" ? 20 : 30;
  const figureSize = round ? Math.max(1, Math.ceil(round.report.timeline.steps.length / maxFigures)) : 1;
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div className="eco-root" data-reduced-motion={reduced || undefined} data-lenis-prevent>
        <div className="eco-sea" aria-hidden="true" />
        {boot.status !== "error" && <GameCanvas key={`${bootKey}-${quality}`} quality={quality} fonts={fonts} />}
        <div className="eco-grade" aria-hidden="true" />

        {ready && (
          <div className="eco-hud" inert={introOpen || !!overlay ? true : undefined}>
            <TopBar />
            {phase === "planning" && <Dock />}
            <AnimatePresence>
              {phase === "serving" && round && <ServiceHud key={round.attemptId} round={round} figureSize={figureSize} />}
              {phase === "building" && selection !== "meadow" && <BuildPrompt key="build-prompt" />}
              {phase === "constructing" && <ConstructionHud key="constructing" />}
            </AnimatePresence>
            <div ref={panelSlotRef} className={`eco-panel-slot${phase === "results" ? " eco-panel-slot--wide" : ""}`}>
              <AnimatePresence mode="wait">
                {phase === "planning" && selection === "kitchen" && <CouncilPanel key="kitchen" />}
                {phase === "planning" && selection === "meadow" && <PlotInfo key="meadow" />}
                {phase === "planning" && selection === "mission" && <MissionPanel key="mission" />}
                {phase === "building" && selection === "meadow" && <BuildCard key="build" />}
                {phase === "built" && <BuiltCard key="built" />}
                {phase === "results" && round && <ResultsPanel key={`results-${round.attemptId}`} round={round} />}
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

"use client";

import { useEffect } from "react";
import { sfx } from "./audio";
import { useEco, useEcoEnv } from "./context";

/** Plays the game's sounds from state changes and clicks. Renders nothing. */
export function GameSounds() {
  const { store, bus } = useEcoEnv();
  const sound = useEco((s) => s.save.settings.sound);

  useEffect(() => sfx.setMuted(!sound), [sound]);

  // Every press gets a soft tick; choices get a rounder pop.
  useEffect(() => {
    const onDown = () => sfx.unlock();
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("button, [role='switch'], label.eco-radio");
      if (!el || (el as HTMLButtonElement).disabled) return;
      if (el.closest(".eco-voice, .eco-switch")) sfx.pop();
      else sfx.tick();
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("keydown", onDown);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  // Moments: the serving bell, the result, coins, opening 2050, the campus growing.
  useEffect(() => {
    let prev = store.getState();
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    const off = store.subscribe(() => {
      const s = store.getState();
      if (s.phase !== prev.phase) {
        if (s.phase === "serving") sfx.serve();
        if (s.phase === "results" && s.round) {
          const stars = s.round.report.stars.count;
          later(350, () => sfx.result(stars));
        }
      }
      if (s.save.progress.credits > prev.save.progress.credits) later(900, () => sfx.coin());
      if (s.overlay === "futures" && prev.overlay !== "futures") sfx.future();
      prev = s;
    });
    // The campus changing is the reward: chime with the Ripple.
    const offGrow = bus.on("growthShown", ({ rippled }) => {
      if (rippled) sfx.grow();
    });
    return () => {
      off();
      offGrow();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [store, bus]);

  // Birdsong on the living campus, now and then.
  useEffect(() => {
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        const s = store.getState();
        if (document.visibilityState === "visible" && s.phase === "planning" && !s.introOpen && !s.overlay) sfx.bird();
        next();
      }, 5000 + Math.random() * 7000);
    };
    next();
    return () => window.clearTimeout(t);
  }, [store]);

  return null;
}

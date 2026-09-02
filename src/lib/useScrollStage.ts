"use client";

import { useEffect, useRef } from "react";

export type StageProgressHandler = (progress: number) => void;

/**
 * Shared scroll-progress engine for every pinned cinematic scene.
 *
 * Reads how far a tall `sectionRef` element has scrolled behind a
 * viewport-height sticky child and reports a normalized 0-1 progress value
 * on every animation frame (rAF-throttled, passive scroll listener). All
 * per-scene visual response (canvas draw, SVG transforms, text opacity)
 * happens inside the caller's `onProgress`, mutating refs directly —
 * nothing here triggers a React re-render.
 */
export function useScrollStage(
  sectionRef: React.RefObject<HTMLElement | null>,
  onProgress: StageProgressHandler,
  options?: { disabled?: boolean; staticProgress?: number },
) {
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    if (options?.disabled) {
      // Explicitly (re)apply the resting pose so a stray scroll-driven
      // mutation from before reduced-motion was detected (e.g. during
      // hydration's client/server snapshot correction) never gets left on
      // screen — see the rAF-cancellation note below for the other half
      // of that fix.
      onProgressRef.current(options.staticProgress ?? 1);
      return;
    }

    let rafId = 0;

    const computeAndApply = () => {
      rafId = 0;
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      const progress =
        scrollable <= 0
          ? 0
          : Math.min(1, Math.max(0, -rect.top / scrollable));

      onProgressRef.current(progress);
    };

    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(computeAndApply);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      // A scroll-triggered rAF scheduled just before this effect is torn
      // down (e.g. reduced-motion flipping true right after hydration)
      // must not fire afterwards and clobber the resting pose above.
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sectionRef, options?.disabled, options?.staticProgress]);
}

/** Clamp + remap a value from one 0-1 range to a 0-1 output range. */
export function remap(value: number, inStart: number, inEnd: number) {
  if (inEnd === inStart) return value >= inEnd ? 1 : 0;
  return Math.min(1, Math.max(0, (value - inStart) / (inEnd - inStart)));
}

/** Ease-out cubic — used for snappier reveals than linear scroll mapping. */
export function easeOutCubic(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

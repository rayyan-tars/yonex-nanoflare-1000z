"use client";

import { useEffect, useRef, useState } from "react";
import { SequenceConfig, framePath } from "./sequences";

export type FrameSequenceState = {
  framesRef: React.RefObject<HTMLImageElement[]>;
  /** True once enough of the sequence is available to start the scene. */
  ready: boolean;
  loadProgress: number;
  /** True when this sequence has no configured frames — caller should render the vector fallback. */
  isFallback: boolean;
};

/**
 * Progressive frame-sequence loader.
 *
 * - If `sequence.frameCount` is 0 (no assets dropped in yet), resolves
 *   immediately as a fallback so the caller can render the vector racket.
 * - Otherwise loads the poster frame first, then a high-priority window of
 *   frames (sequence.priorityFraction), then streams the remainder in the
 *   background via requestIdleCallback so the scene never blocks on the
 *   full sequence.
 */
export function useFrameSequence(sequence: SequenceConfig): FrameSequenceState {
  const framesRef = useRef<HTMLImageElement[]>([]);
  const [ready, setReady] = useState(sequence.frameCount === 0);
  const [loadProgress, setLoadProgress] = useState(sequence.frameCount === 0 ? 1 : 0);

  useEffect(() => {
    // The useState initializers above already cover the no-frames case —
    // sequence.frameCount is a static config value, never toggled at
    // runtime, so there is nothing to (re)synchronize here.
    if (sequence.frameCount === 0) return;

    let cancelled = false;
    let idleHandle: number | ReturnType<typeof setTimeout> | null = null;
    const total = sequence.frameCount;
    const imgs: HTMLImageElement[] = new Array(total);
    let settledCount = 0;

    const onSettle = () => {
      if (cancelled) return;
      settledCount++;
      setLoadProgress(Math.min(1, settledCount / total));
    };

    const loadOne = (n: number, priority: boolean) => {
      const img = new Image();
      img.decoding = "async";
      if (priority) img.fetchPriority = "high";
      img.src = framePath(sequence, n);
      img.onload = onSettle;
      img.onerror = onSettle;
      imgs[n - 1] = img;
    };

    const priorityCount = Math.max(
      1,
      Math.round(total * sequence.priorityFraction),
    );

    loadOne(1, true);
    imgs[0].onload = () => {
      onSettle();
      if (!cancelled) setReady(true);
    };
    imgs[0].onerror = () => {
      onSettle();
      if (!cancelled) setReady(true);
    };

    for (let i = 2; i <= priorityCount; i++) loadOne(i, true);

    const scheduleIdle = (cb: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        return window.requestIdleCallback(cb, { timeout: 2000 });
      }
      return setTimeout(cb, 250);
    };

    idleHandle = scheduleIdle(() => {
      for (let i = priorityCount + 1; i <= total; i++) loadOne(i, false);
    });

    framesRef.current = imgs;

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        if (typeof window.cancelIdleCallback === "function" && typeof idleHandle === "number") {
          window.cancelIdleCallback(idleHandle);
        } else {
          clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
        }
      }
    };
  }, [sequence]);

  return { framesRef, ready, loadProgress, isFallback: sequence.frameCount === 0 };
}

"use client";

import { useEffect, useRef } from "react";
import { useInView } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Wraps one row of a scroll-synced list (engineering breakdown, anatomy
 * steps). Reports itself active via `onActive` while it sits in a band
 * around the vertical center of the viewport, so a sibling panel (racket
 * highlight, sticky image) can track which row the reader is on.
 */
export function ScrollRevealRow({
  index,
  active,
  onActive,
  className = "",
  children,
}: {
  index: number;
  active: boolean;
  onActive: (i: number) => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { margin: "-42% 0px -42% 0px" });

  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  return (
    <div ref={ref} data-active={active} className={className}>
      {children}
    </div>
  );
}

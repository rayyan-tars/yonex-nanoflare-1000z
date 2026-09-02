"use client";

import type { ReactNode, RefObject } from "react";

type Props = {
  id?: string;
  sectionRef: RefObject<HTMLElement | null>;
  /** CSS class (defined in globals.css) controlling scroll-jacked height per breakpoint. */
  heightClassName: string;
  reducedMotion: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Shared pinned-stage wrapper for every scroll-scrubbed scene (hero, speed
 * sequence, speed break). Under `prefers-reduced-motion`, the tall
 * scroll-jacked section collapses to a single natural-height static frame
 * instead of forcing a long empty scroll — see useReducedMotion.
 */
export function CinematicSection({
  id,
  sectionRef,
  heightClassName,
  reducedMotion,
  className = "",
  children,
}: Props) {
  if (reducedMotion) {
    return (
      <section id={id} ref={sectionRef} className={`relative ${className}`}>
        <div className="relative min-h-[100dvh] w-full overflow-hidden bg-background">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section id={id} ref={sectionRef} className={`relative ${heightClassName} ${className}`}>
      <div
        className="sticky top-0 h-[100dvh] w-full overflow-hidden bg-background"
        style={{ willChange: "transform", transform: "translateZ(0)" }}
      >
        {children}
      </div>
    </section>
  );
}

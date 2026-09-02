"use client";

import { forwardRef, useId } from "react";

/**
 * Restrained light-trail atmosphere used behind the racket in the hero,
 * speed sequence, and speed-break transition. Pure SVG, no particle system —
 * a handful of gradient streaks whose opacity/position is driven by the
 * caller via inline style on the forwarded ref (kept out of React state).
 */
export const SpeedStreaks = forwardRef<
  SVGSVGElement,
  { className?: string; variant?: "ambient" | "burst" }
>(function SpeedStreaks({ className = "", variant = "ambient" }, ref) {
  const gradientId = useId();
  const count = variant === "ambient" ? 5 : 7;

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      className={className}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e7ff3d" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e7ff3d" stopOpacity="0.7" />
          <stop offset="1" stopColor="#e7ff3d" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: count }).map((_, i) => {
        const y = 80 + i * (840 / (count - 1));
        const skew = variant === "burst" ? -22 : -6;
        const length = variant === "burst" ? 640 : 220;
        return (
          <rect
            key={i}
            data-streak={i}
            x={-length}
            y={y}
            width={length}
            height={variant === "burst" ? 1.5 : 1}
            fill={`url(#${gradientId})`}
            opacity={variant === "burst" ? 0.5 : 0.22}
            transform={`skewX(${skew})`}
          />
        );
      })}
    </svg>
  );
});

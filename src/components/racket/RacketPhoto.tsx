"use client";

import { forwardRef } from "react";

type Props = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
};

/** Real NANOFLARE 1000 Z product photography (background-removed cutouts), used as the site's primary racket visual. */
export const RacketPhoto = forwardRef<HTMLImageElement, Props>(function RacketPhoto(
  { src, alt, className, style, priority },
  ref,
) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      style={{ objectFit: "contain", ...style }}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
});

/**
 * Dims everything outside a vertical band (0-100, top to bottom) of the
 * racket photo it's layered over — used by the engineering/anatomy scenes
 * to spotlight one part (frame, shaft, grip...) at a time without needing
 * separate per-part artwork.
 */
export function RacketBandMask({ from, to }: { from: number; to: number }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 bg-background/88 transition-[height] duration-500 ease-out"
        style={{ height: `${from}%` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/88 transition-[height] duration-500 ease-out"
        style={{ height: `${100 - to}%` }}
      />
    </>
  );
}

"use client";

import { useCallback, useRef } from "react";
import { CinematicSection } from "@/components/cinematic/CinematicSection";
import { RacketPhoto } from "@/components/racket/RacketPhoto";
import { SpeedStreaks } from "@/components/racket/SpeedStreaks";
import { useScrollStage } from "@/lib/useScrollStage";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { interpolate, bandOpacity } from "@/lib/keyframes";

export function SpeedBreak() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const racketRef = useRef<HTMLImageElement | null>(null);
  const streaksRef = useRef<SVGSVGElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);

  const reducedMotion = useReducedMotion();

  const applyProgress = useCallback((progress: number) => {
    if (racketRef.current) {
      const translateX = interpolate(progress, [
        [0, -55],
        [0.5, 8],
        [1, 65],
      ]);
      const rotate = interpolate(progress, [
        [0, -10],
        [0.5, -2],
        [1, 6],
      ]);
      const blur = interpolate(progress, [
        [0, 12],
        [0.18, 8],
        [0.5, 1.5],
        [0.82, 8],
        [1, 12],
      ]);
      const opacity = bandOpacity(progress, 0.04, 0.96, 0.06);
      racketRef.current.style.transform = `translateX(${translateX}%) rotate(${rotate}deg)`;
      racketRef.current.style.filter = `blur(${blur}px)`;
      racketRef.current.style.opacity = String(opacity);
    }
    if (streaksRef.current) {
      streaksRef.current.style.opacity = String(
        interpolate(progress, [
          [0, 0],
          [0.3, 0.7],
          [0.5, 1],
          [0.7, 0.7],
          [1, 0],
        ]),
      );
      streaksRef.current.style.transform = `translateX(${interpolate(progress, [[0, -8], [1, 8]])}%)`;
    }
    if (headlineRef.current) {
      headlineRef.current.style.opacity = String(bandOpacity(progress, 0.28, 0.68, 0.07));
    }
  }, []);

  useScrollStage(sectionRef, applyProgress, { disabled: reducedMotion, staticProgress: 0.5 });

  return (
    <CinematicSection
      id="speed-break"
      sectionRef={sectionRef}
      heightClassName="stage-break"
      reducedMotion={reducedMotion}
      className="border-t border-white/5 bg-background"
    >
      <SpeedStreaks ref={streaksRef} variant="burst" className="opacity-0" />

      {!reducedMotion && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="relative h-[58vh] w-[34vw] max-w-[220px]">
            <RacketPhoto
              ref={racketRef}
              src="/nanoflare/stills/racket-full.webp"
              alt=""
              className="h-full w-full"
              style={{ transformOrigin: "50% 50%" }}
            />
          </div>
        </div>
      )}

      <h2
        ref={headlineRef}
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-6 text-center font-sans text-[13vw] font-bold uppercase leading-[0.85] tracking-tighter text-foreground md:text-[6vw]"
        style={{ opacity: reducedMotion ? 1 : 0 }}
      >
        Speed is
        <br />
        the <span className="text-accent">weapon.</span>
      </h2>
    </CinematicSection>
  );
}

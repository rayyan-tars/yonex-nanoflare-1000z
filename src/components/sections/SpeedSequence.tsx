"use client";

import { useCallback, useRef } from "react";
import { CinematicSection } from "@/components/cinematic/CinematicSection";
import { RacketPhoto } from "@/components/racket/RacketPhoto";
import { SpeedStreaks } from "@/components/racket/SpeedStreaks";
import { useScrollStage } from "@/lib/useScrollStage";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { interpolate, bandOpacity } from "@/lib/keyframes";

export function SpeedSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const racketRef = useRef<HTMLImageElement | null>(null);
  const streaksRef = useRef<SVGSVGElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const noteARef = useRef<HTMLDivElement | null>(null);
  const noteBRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

  const reducedMotion = useReducedMotion();

  const applyProgress = useCallback((progress: number) => {
    if (racketRef.current) {
      const rotate = interpolate(progress, [
        [0, 4],
        [0.4, -4],
        [0.75, 1],
        [1, -1],
      ]);
      const scale = interpolate(progress, [
        [0, 0.9],
        [0.24, 1],
        [0.5, 1.35],
        [0.78, 1.6],
        [1, 1.35],
      ]);
      const translateY = interpolate(progress, [
        [0, 6],
        [0.24, 4],
        [0.5, 8],
        [0.78, 16],
        [1, 10],
      ]);
      racketRef.current.style.transform = `translateY(${translateY}%) rotate(${rotate}deg) scale(${scale})`;
    }

    if (streaksRef.current) {
      streaksRef.current.style.opacity = String(interpolate(progress, [[0, 0], [0.3, 0.5], [0.8, 0.25], [1, 0.1]]));
    }

    if (headlineRef.current) headlineRef.current.style.opacity = String(bandOpacity(progress, 0, 0.22));
    if (labelRef.current) labelRef.current.style.opacity = String(bandOpacity(progress, 0.18, 0.42));
    if (noteARef.current) noteARef.current.style.opacity = String(bandOpacity(progress, 0.22, 0.48));
    if (noteBRef.current) noteBRef.current.style.opacity = String(bandOpacity(progress, 0.55, 0.9));
  }, []);

  useScrollStage(sectionRef, applyProgress, { disabled: reducedMotion, staticProgress: 0.7 });

  return (
    <CinematicSection
      id="technology"
      sectionRef={sectionRef}
      heightClassName="stage-speed"
      reducedMotion={reducedMotion}
      className="border-t border-white/5 bg-background"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 45%, rgba(231,255,61,0.04) 0%, transparent 55%)" }}
      />

      <SpeedStreaks ref={streaksRef} variant="ambient" className="opacity-0" />

      <div className="pointer-events-none absolute inset-0 flex items-end justify-center overflow-hidden pb-[4vh]">
        <div className="relative h-[56vh] w-[74vw] max-w-[480px]">
          <RacketPhoto
            ref={racketRef}
            src="/nanoflare/stills/racket-macro.webp"
            alt="Close-up of the YONEX NANOFLARE 1000 Z frame and string bed"
            className="h-full w-full"
            style={{ transformOrigin: "50% 30%" }}
          />
        </div>
      </div>

      <h2
        ref={headlineRef}
        className="pointer-events-none absolute inset-x-0 top-[10%] z-10 px-6 text-center font-sans text-[14vw] font-bold leading-[0.85] tracking-tighter text-foreground md:text-[6.4vw]"
      >
        BUILT
        <br />
        FOR <span className="text-accent">SPEED.</span>
      </h2>

      <div ref={labelRef} className="pointer-events-none absolute left-6 top-[18%] z-10 opacity-0 md:left-12 md:top-[22%]">
        <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent">Sonic Flare System</span>
      </div>

      <div ref={noteARef} className="pointer-events-none absolute inset-x-6 bottom-[30%] z-10 max-w-[38ch] opacity-0 md:inset-x-auto md:left-12">
        <p className="font-sans text-lg leading-snug text-zinc-300 md:text-xl">
          High-modulus graphite at the frame&rsquo;s tip and base, tuned for explosive repulsion through every swing.
        </p>
      </div>

      <div ref={noteBRef} className="pointer-events-none absolute inset-x-6 bottom-[14%] z-10 max-w-[36ch] opacity-0 md:inset-x-auto md:right-12 md:text-right">
        <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.3em] text-accent">Nanometric DR</span>
        <p className="font-sans text-base leading-snug text-zinc-300 md:text-lg">
          A firm shuttle hold at contact, released into maximum repulsion.
        </p>
      </div>
    </CinematicSection>
  );
}

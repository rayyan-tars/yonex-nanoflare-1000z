"use client";

import { useCallback, useRef } from "react";
import { CinematicSection } from "@/components/cinematic/CinematicSection";
import { HudFrame } from "@/components/ui/HudFrame";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { RacketPhoto } from "@/components/racket/RacketPhoto";
import { useScrollStage } from "@/lib/useScrollStage";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { interpolate, bandOpacity } from "@/lib/keyframes";
import { PRODUCT } from "@/lib/product";

const MACRO_CALLOUTS = ["AERO COMPACT FRAME", "M40X", "NANOMETRIC DR"];

export function ProductHero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const racketRef = useRef<HTMLImageElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const scrollCueRef = useRef<HTMLDivElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);

  const eyebrowRef = useRef<HTMLDivElement | null>(null);
  const t1Ref = useRef<HTMLHeadingElement | null>(null);
  const t2Ref = useRef<HTMLDivElement | null>(null);
  const t3Ref = useRef<HTMLDivElement | null>(null);
  const t4Ref = useRef<HTMLHeadingElement | null>(null);
  const t5Ref = useRef<HTMLDivElement | null>(null);
  const t6Ref = useRef<HTMLDivElement | null>(null);

  const reducedMotion = useReducedMotion();

  const applyProgress = useCallback((progress: number) => {
    if (racketRef.current) {
      const rotate = interpolate(progress, [
        [0, -10],
        [0.22, -5],
        [0.42, 1],
        [0.62, 5],
        [0.85, -2],
        [1, -4],
      ]);
      const scale = interpolate(progress, [
        [0, 0.88],
        [0.22, 1],
        [0.55, 1.24],
        [0.7, 1.26],
        [0.85, 1.02],
        [1, 1],
      ]);
      const translateY = interpolate(progress, [
        [0, 26],
        [0.25, 0],
        [0.55, -14],
        [0.85, 0],
        [1, -4],
      ]);
      const translateX = interpolate(progress, [
        [0.55, 0],
        [0.7, -6],
        [1, 0],
      ]);
      const opacity = interpolate(progress, [
        [0, 0.1],
        [0.12, 1],
      ]);
      racketRef.current.style.transform = `translate(${translateX}%, ${translateY}px) rotate(${rotate}deg) scale(${scale})`;
      racketRef.current.style.opacity = String(opacity);
    }

    if (eyebrowRef.current) eyebrowRef.current.style.opacity = String(bandOpacity(progress, 0, 0.94, 0.05));

    if (t1Ref.current) {
      t1Ref.current.style.opacity = String(bandOpacity(progress, 0, 0.1));
      const nameScale = interpolate(progress, [[0, 0.82], [0.1, 1.06]]);
      t1Ref.current.style.transform = `scale(${nameScale})`;
      t1Ref.current.style.transformOrigin = "0% 100%";
    }
    if (t2Ref.current) t2Ref.current.style.opacity = String(bandOpacity(progress, 0.1, 0.25));
    if (t3Ref.current) t3Ref.current.style.opacity = String(bandOpacity(progress, 0.25, 0.4));
    if (t4Ref.current) t4Ref.current.style.opacity = String(bandOpacity(progress, 0.4, 0.55));
    if (t5Ref.current) t5Ref.current.style.opacity = String(bandOpacity(progress, 0.56, 0.72));
    if (t6Ref.current) t6Ref.current.style.opacity = String(bandOpacity(progress, 0.72, 0.9));

    if (scrollCueRef.current) {
      scrollCueRef.current.style.opacity = String(1 - interpolate(progress, [[0, 0], [0.035, 1]]));
    }
    if (bottomBarRef.current) {
      bottomBarRef.current.style.opacity = String(interpolate(progress, [[0, 0], [0.04, 1], [0.94, 1], [1, 0]]));
    }
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${progress})`;
    }
  }, []);

  useScrollStage(sectionRef, applyProgress, { disabled: reducedMotion, staticProgress: 0.8 });

  return (
    <CinematicSection
      id="hero"
      sectionRef={sectionRef}
      heightClassName="stage-hero"
      reducedMotion={reducedMotion}
      className="bg-background"
    >
      {/* atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 72% 38%, rgba(231,255,61,0.06) 0%, transparent 45%), radial-gradient(140% 100% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 55%)",
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center md:justify-end">
        <div className="relative h-[68vh] w-[58vw] max-w-[340px] md:mr-[9vw] md:h-[80vh] md:w-[26vw] md:max-w-[380px]">
          <RacketPhoto
            ref={racketRef}
            src="/nanoflare/stills/racket-full.webp"
            alt="YONEX NANOFLARE 1000 Z badminton racket in Lightning Yellow"
            priority
            className="h-full w-full"
            style={{
              transformOrigin: "50% 55%",
              filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.65))",
            }}
          />
        </div>
      </div>

      {/* corner brackets */}
      <div className="pointer-events-none absolute left-6 top-24 text-accent/70 md:left-10 md:top-28">
        <HudFrame corner="tl" size={24} />
      </div>
      <div className="pointer-events-none absolute right-6 top-24 text-accent/70 md:right-10 md:top-28">
        <HudFrame corner="tr" size={24} />
      </div>
      <div className="pointer-events-none absolute bottom-16 left-6 text-accent/70 md:bottom-20 md:left-10">
        <HudFrame corner="bl" size={24} />
      </div>
      <div className="pointer-events-none absolute bottom-16 right-6 text-accent/70 md:bottom-20 md:right-10">
        <HudFrame corner="br" size={24} />
      </div>

      {/* headline stack */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-24 md:px-12 md:pb-32">
        <div ref={eyebrowRef} className="mb-5" style={{ transition: "opacity 200ms linear" }}>
          <EyebrowBadge>{PRODUCT.brand} &mdash; {PRODUCT.series}</EyebrowBadge>
        </div>

        <div
          className="relative max-w-[22ch] md:max-w-[16ch]"
          style={{ height: "clamp(180px, 32vw, 340px)" }}
        >
          <h1
            ref={t1Ref}
            className="absolute inset-x-0 bottom-0 font-sans text-[13vw] font-bold leading-[0.86] tracking-tighter text-foreground md:text-[6.4vw]"
            style={{ transition: "opacity 260ms ease-out, transform 80ms linear" }}
          >
            NANOFLARE
            <br />
            <span className="text-accent">1000 Z.</span>
          </h1>

          <div
            ref={t2Ref}
            className="absolute inset-x-0 bottom-0 opacity-0"
            style={{ transition: "opacity 260ms ease-out" }}
          >
            <h2 className="font-sans text-[10vw] font-bold leading-[0.9] tracking-tighter text-foreground md:text-[5vw]">
              HEAD LIGHT.
              <br />
              <span className="text-accent">BUILT FOR SPEED.</span>
            </h2>
          </div>

          <div
            ref={t3Ref}
            className="absolute inset-x-0 bottom-0 flex flex-col gap-1 opacity-0"
            style={{ transition: "opacity 260ms ease-out" }}
          >
            <span className="font-mono text-xs uppercase tracking-[0.35em] text-accent">Core technology</span>
            <h2 className="font-sans text-[9vw] font-bold leading-[0.92] tracking-tighter text-foreground md:text-[4.6vw]">
              SONIC
              <br />
              FLARE SYSTEM
            </h2>
          </div>

          <h2
            ref={t4Ref}
            className="absolute inset-x-0 bottom-0 font-sans text-[10vw] font-bold leading-[0.88] tracking-tighter text-foreground opacity-0 md:text-[5.4vw]"
            style={{ transition: "opacity 260ms ease-out" }}
          >
            EXPLOSIVE
            <br />
            <span className="text-accent">REPULSION.</span>
          </h2>

          <div
            ref={t5Ref}
            className="absolute inset-x-0 bottom-0 flex flex-col gap-2 opacity-0"
            style={{ transition: "opacity 260ms ease-out" }}
          >
            <span className="font-mono text-xs uppercase tracking-[0.35em] text-zinc-500">Frame profile</span>
            {MACRO_CALLOUTS.map((label) => (
              <span key={label} className="font-mono text-sm uppercase tracking-[0.2em] text-foreground/90 md:text-base">
                &mdash; {label}
              </span>
            ))}
          </div>

          <h2
            ref={t6Ref}
            className="absolute inset-x-0 bottom-0 font-sans text-[9vw] font-bold leading-[0.88] tracking-tighter text-foreground opacity-0 md:text-[5vw]"
            style={{ transition: "opacity 260ms ease-out" }}
          >
            SPEED WITHOUT
            <br />
            <span className="text-accent">HESITATION.</span>
          </h2>
        </div>
      </div>

      {/* scroll cue */}
      <div
        ref={scrollCueRef}
        className="pointer-events-none absolute inset-x-0 top-[52%] z-10 flex flex-col items-center gap-3"
        style={{ transition: "opacity 200ms linear" }}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-zinc-400">
          Scroll to unleash speed
        </span>
        <span aria-hidden className="h-8 w-px animate-pulse bg-accent/60" />
      </div>

      {/* bottom bar */}
      <div ref={bottomBarRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-10" style={{ transition: "opacity 200ms linear" }}>
        <div className="mx-6 mb-3 h-px bg-white/10 md:mx-10">
          <div ref={progressFillRef} className="h-full origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
        </div>
        <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
          <span>{PRODUCT.itemCode} &mdash; {PRODUCT.color}</span>
          <span className="hidden md:inline">Reveal sequence</span>
          <span>Scroll &darr;</span>
        </div>
      </div>
    </CinematicSection>
  );
}

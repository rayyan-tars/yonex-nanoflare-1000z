"use client";

import { useState } from "react";
import { RacketPhoto, RacketBandMask } from "@/components/racket/RacketPhoto";
import { ScrollRevealRow } from "@/components/cinematic/ScrollRevealRow";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";

type AnatomyStep = {
  band: { from: number; to: number };
  label: string;
  note: string;
};

const STEPS: AnatomyStep[] = [
  {
    band: { from: 2, to: 40 },
    label: "Frame",
    note: "AERO compact frame in HM Graphite, reinforced with M40X and EX-Hyper MG.",
  },
  {
    band: { from: 44, to: 72 },
    label: "Shaft",
    note: "A super slim HM Graphite shaft, stiffened with Ultra PE Fiber to resist twisting.",
  },
  {
    band: { from: 38, to: 46 },
    label: "T-Joint",
    note: "The NEW Built-in T-Joint connects shaft to frame with minimal energy loss.",
  },
  {
    band: { from: 72, to: 100 },
    label: "Grip",
    note: "Tapered for 4U or 3U setups, in grip sizes G4 through G6.",
  },
  {
    band: { from: 6, to: 34 },
    label: "String bed",
    note: "Recommended at 20–29 lbs — AEROBITE for control, EXBOLT65 for hard hitters.",
  },
];

export function RacketAnatomy() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section
      id="anatomy"
      className="relative border-t border-white/5 bg-background-elevated px-6 pb-28 pt-24 md:px-10 md:pb-32 md:pt-28"
    >
      <div className="mx-auto max-w-[1400px]">
        <EyebrowBadge className="mb-6">Precision in every line</EyebrowBadge>
        <h2 className="max-w-[16ch] font-sans text-3xl font-bold leading-[0.95] tracking-tighter text-foreground md:text-5xl">
          Every part, <span className="text-accent">engineered on purpose.</span>
        </h2>

        <div className="mt-14 grid gap-12 md:mt-20 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:gap-20">
          <div>
            {STEPS.map((step, i) => (
              <ScrollRevealRow
                key={step.label}
                index={i}
                active={i === activeIndex}
                onActive={setActiveIndex}
                className={`flex items-center gap-6 border-t border-white/8 py-7 transition-opacity duration-300 md:py-9 ${
                  i === activeIndex ? "opacity-100" : "opacity-40"
                }`}
              >
                <span className="font-mono text-xs text-zinc-500">0{i + 1}</span>
                <div>
                  <h3 className="font-sans text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                    {step.label}
                  </h3>
                  <p className="mt-1.5 max-w-[42ch] font-sans text-sm leading-relaxed text-zinc-400 md:text-base">
                    {step.note}
                  </p>
                </div>
              </ScrollRevealRow>
            ))}
          </div>

          <div className="relative md:sticky md:top-28 md:self-start">
            <div className="relative mx-auto aspect-[161/519] w-full max-w-[200px] overflow-hidden">
              <RacketPhoto
                src="/nanoflare/stills/racket-full.webp"
                alt="YONEX NANOFLARE 1000 Z badminton racket"
                className="h-full w-full"
              />
              <RacketBandMask from={STEPS[activeIndex].band.from} to={STEPS[activeIndex].band.to} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

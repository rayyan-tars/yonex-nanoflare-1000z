"use client";

import { useState } from "react";
import { RacketPhoto, RacketBandMask } from "@/components/racket/RacketPhoto";
import { ScrollRevealRow } from "@/components/cinematic/ScrollRevealRow";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { PRODUCT, type Technology } from "@/lib/product";

type Band = { from: number; to: number };

const BAND_BY_TECH: Record<string, Band> = {
  "sonic-flare": { from: 2, to: 40 },
  "ex-hyper-mg": { from: 2, to: 20 },
  m40x: { from: 20, to: 40 },
  "nanometric-dr": { from: 2, to: 40 },
  "ultra-pe-fiber": { from: 44, to: 72 },
  "t-joint": { from: 38, to: 46 },
};

function TechRow({
  tech,
  index,
  active,
  onActive,
}: {
  tech: Technology;
  index: number;
  active: boolean;
  onActive: (i: number) => void;
}) {
  return (
    <ScrollRevealRow
      index={index}
      active={active}
      onActive={onActive}
      className={`border-t border-white/8 py-10 transition-opacity duration-300 md:py-12 ${
        active ? "opacity-100" : "opacity-45"
      }`}
    >
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-sm text-accent">{tech.index}</span>
        <h3 className="font-sans text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
          {tech.name}
        </h3>
      </div>
      <p className="mt-3 max-w-[46ch] font-sans text-base leading-relaxed text-zinc-400 md:text-lg">
        {tech.summary}
      </p>
    </ScrollRevealRow>
  );
}

export function EngineeringSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = PRODUCT.technologies[activeIndex];
  const band = BAND_BY_TECH[active.id];

  return (
    <section
      id="engineering"
      className="relative border-t border-white/5 bg-background px-6 pb-32 pt-28 md:px-10 md:pb-40 md:pt-36"
    >
      <div className="mx-auto max-w-[1400px]">
        <EyebrowBadge className="mb-6">Material engineering</EyebrowBadge>
        <h2 className="max-w-[18ch] font-sans text-4xl font-bold leading-[0.95] tracking-tighter text-foreground md:text-6xl">
          Six technologies.
          <br />
          One <span className="text-accent">frame.</span>
        </h2>

        <div className="mt-16 grid gap-12 md:mt-24 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:gap-20">
          <div>
            {PRODUCT.technologies.map((tech, i) => (
              <TechRow key={tech.id} tech={tech} index={i} active={i === activeIndex} onActive={setActiveIndex} />
            ))}
          </div>

          <div className="relative md:order-first md:sticky md:top-28 md:self-start">
            <div className="relative mx-auto aspect-[161/519] w-full max-w-[220px] overflow-hidden">
              <RacketPhoto
                src="/nanoflare/stills/racket-full.webp"
                alt="YONEX NANOFLARE 1000 Z frame, shaft, and grip"
                className="h-full w-full"
              />
              <RacketBandMask from={band.from} to={band.to} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

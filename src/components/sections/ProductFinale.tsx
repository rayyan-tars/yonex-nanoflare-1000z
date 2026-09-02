import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { RacketPhoto } from "@/components/racket/RacketPhoto";
import { AnimatedItem, AnimatedSection } from "@/components/ui/AnimatedSection";
import { PRODUCT } from "@/lib/product";

export function ProductFinale() {
  return (
    <section
      id="finale"
      className="relative overflow-hidden border-t border-white/5 bg-background px-6 pb-24 pt-28 md:px-10 md:pb-32 md:pt-36"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(90% 70% at 50% 28%, rgba(231,255,61,0.07) 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto flex max-w-[1400px] flex-col items-center text-center">
        <AnimatedSection className="flex flex-col items-center gap-6">
          <AnimatedItem>
            <EyebrowBadge>{PRODUCT.series}</EyebrowBadge>
          </AnimatedItem>

          <AnimatedItem>
            <h2 className="font-sans text-[20vw] font-bold leading-[0.8] tracking-tighter text-foreground md:text-[10rem]">
              {PRODUCT.shortName}
            </h2>
          </AnimatedItem>

          <AnimatedItem className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-6 w-6 overflow-hidden rounded-sm border border-white/15"
              style={{ backgroundImage: "url(/nanoflare/stills/racket-tile.webp)", backgroundSize: "220%", backgroundPosition: "38% 42%" }}
            />
            <p className="font-mono text-sm uppercase tracking-[0.4em] text-accent md:text-base">
              {PRODUCT.color}
            </p>
          </AnimatedItem>

          <AnimatedItem>
            <p className="max-w-[36ch] font-sans text-lg text-zinc-400 md:text-xl">{PRODUCT.tagline}</p>
          </AnimatedItem>

          <AnimatedItem className="relative my-14 h-[42vh] w-[42vw] max-w-[240px] md:my-16">
            <RacketPhoto
              src="/nanoflare/stills/racket-full.webp"
              alt="YONEX NANOFLARE 1000 Z badminton racket in Lightning Yellow"
              className="h-full w-full"
              style={{ filter: "drop-shadow(0 24px 48px rgba(0,0,0,0.6))" }}
            />
          </AnimatedItem>

          <AnimatedItem>
            <span className="tabular-nums font-sans text-6xl font-bold tracking-tighter text-foreground md:text-7xl">
              {PRODUCT.priceDisplay}
            </span>
          </AnimatedItem>
          <AnimatedItem>
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">
              {PRODUCT.priceLabel}
            </span>
          </AnimatedItem>

          <AnimatedItem>
            <a
              href={PRODUCT.officialProductUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 inline-flex items-center gap-2 border border-white/15 px-7 py-3.5 font-mono text-xs font-medium uppercase tracking-[0.28em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
            >
              View at Yonex
              <ArrowUpRight
                size={14}
                weight="bold"
                className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
          </AnimatedItem>

          <AnimatedItem>
            <p className="mt-4 max-w-[40ch] font-sans text-xs text-zinc-600">{PRODUCT.priceDisclaimer}</p>
          </AnimatedItem>
        </AnimatedSection>
      </div>
    </section>
  );
}

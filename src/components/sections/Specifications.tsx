import { AnimatedItem, AnimatedSection } from "@/components/ui/AnimatedSection";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { PRODUCT } from "@/lib/product";

function SpecStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="tabular-nums flex items-baseline gap-1.5">
        <span className="font-sans text-6xl font-bold leading-none tracking-tighter text-foreground md:text-7xl">
          {value}
        </span>
        {unit && <span className="font-mono text-base text-accent md:text-lg">{unit}</span>}
      </div>
      <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</span>
    </div>
  );
}

export function Specifications() {
  const [u4, u3] = PRODUCT.weights;
  const [s4, s3] = PRODUCT.stringingAdvice;

  return (
    <section
      id="specs"
      className="relative border-t border-white/5 bg-background px-6 pb-36 pt-32 md:px-10 md:pb-44 md:pt-40"
    >
      <div className="mx-auto max-w-[1400px]">
        <AnimatedSection>
          <AnimatedItem>
            <EyebrowBadge>Specifications &mdash; {PRODUCT.itemCode}</EyebrowBadge>
          </AnimatedItem>
          <AnimatedItem>
            <h2 className="mt-6 font-sans text-5xl font-bold leading-[0.88] tracking-tighter text-foreground md:text-8xl">
              ENGINEERED
              <br />
              TO THE
              <br />
              <span className="text-accent">MILLIMETER.</span>
            </h2>
          </AnimatedItem>
        </AnimatedSection>

        <AnimatedSection className="mt-20 grid grid-cols-2 gap-x-8 gap-y-14 border-t border-white/8 pt-16 md:mt-28 md:grid-cols-12 md:gap-x-10 md:pt-20">
          <AnimatedItem className="col-span-2 md:col-span-4">
            <SpecStat value={String(u4.grams)} unit="G" label={`Avg. ${u4.code} — ${u4.grips.join(", ")}`} />
          </AnimatedItem>
          <AnimatedItem className="col-span-2 md:col-span-4">
            <SpecStat value={String(u3.grams)} unit="G" label={`Avg. ${u3.code} — ${u3.grips.join(", ")}`} />
          </AnimatedItem>
          <AnimatedItem className="col-span-2 md:col-span-4">
            <SpecStat value={`+${PRODUCT.length.extraMm}`} unit="MM" label={PRODUCT.length.note} />
          </AnimatedItem>

          <AnimatedItem className="col-span-2 md:col-span-6">
            <div className="flex flex-col gap-3">
              <span className="font-sans text-4xl font-bold leading-none tracking-tighter text-foreground md:text-6xl">
                {PRODUCT.flex.toUpperCase()}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                Flex &mdash; {PRODUCT.balance} balance
              </span>
            </div>
          </AnimatedItem>
          <AnimatedItem className="col-span-1 md:col-span-3">
            <SpecStat value={s4.tension} unit={`LBS / ${s4.code}`} label="Stringing tension" />
          </AnimatedItem>
          <AnimatedItem className="col-span-1 md:col-span-3">
            <SpecStat value={s3.tension} unit={`LBS / ${s3.code}`} label="Stringing tension" />
          </AnimatedItem>

          <AnimatedItem className="col-span-2 border-t border-white/8 pt-10 md:col-span-6 md:pt-14">
            <span className="mb-4 block font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Frame &amp; shaft
            </span>
            <ul className="flex flex-col gap-2">
              {[...PRODUCT.frameMaterials, ...PRODUCT.shaftMaterials].map((m) => (
                <li key={m} className="font-sans text-lg text-foreground md:text-xl">
                  {m}
                </li>
              ))}
              <li className="font-sans text-lg text-foreground md:text-xl">{PRODUCT.joint}</li>
            </ul>
          </AnimatedItem>

          <AnimatedItem className="col-span-2 border-t border-white/8 pt-10 md:col-span-6 md:pt-14">
            <span className="mb-4 block font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Recommended strings
            </span>
            <ul className="flex flex-col gap-4">
              {PRODUCT.recommendedStrings.map((r) => (
                <li key={r.string} className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-3">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">{r.playerType}</span>
                  <span className="font-sans text-lg font-medium text-foreground md:text-xl">{r.string}</span>
                </li>
              ))}
            </ul>
          </AnimatedItem>
        </AnimatedSection>
      </div>
    </section>
  );
}

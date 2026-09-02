import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { PRODUCT } from "@/lib/product";

const LINKS: Array<[string, string]> = [
  ["Technology", "#technology"],
  ["Engineering", "#engineering"],
  ["Specs", "#specs"],
  ["View at Yonex", PRODUCT.officialProductUrl],
];

export function Footer() {
  return (
    <footer id="footer" className="border-t border-white/5 bg-background px-6 py-14 md:px-10 md:py-16">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-foreground">
              <span aria-hidden className="inline-block h-1.5 w-3.5 rounded-full bg-accent" />
              {PRODUCT.brand} {PRODUCT.shortName}
            </div>
            <p className="max-w-[38ch] font-sans text-sm leading-relaxed text-zinc-500">{PRODUCT.disclaimer}</p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 md:grid-cols-4">
            {LINKS.map(([label, href]) => {
              const external = href.startsWith("http");
              return (
                <a
                  key={label}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="group flex items-center gap-1 font-sans text-[13px] font-medium text-foreground transition-colors hover:text-accent"
                >
                  {label}
                  {external && (
                    <ArrowUpRight
                      size={11}
                      weight="bold"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  )}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 pt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-600 md:flex-row md:items-center md:justify-between">
          <span>
            {PRODUCT.itemCode} &nbsp;&middot;&nbsp; {PRODUCT.color}
          </span>
          <span>Concept website &mdash; not an online store</span>
        </div>
      </div>
    </footer>
  );
}

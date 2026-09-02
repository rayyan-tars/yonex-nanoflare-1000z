type Props = {
  index: string;
  name: string;
  summary: string;
  active: boolean;
  align?: "left" | "right";
  className?: string;
};

/** Numbered engineering label used by the material/anatomy scenes to point at a racket part. */
export function TechnicalCallout({ index, name, summary, active, align = "left", className = "" }: Props) {
  return (
    <div
      className={`flex flex-col gap-2 transition-all duration-500 ease-out ${
        align === "right" ? "items-end text-right" : "items-start text-left"
      } ${active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"} ${className}`}
    >
      <span className="font-mono text-[11px] tracking-[0.3em] text-accent">{index}</span>
      <h3 className="font-sans text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {name}
      </h3>
      <p className="max-w-[34ch] font-sans text-sm leading-relaxed text-zinc-400">{summary}</p>
    </div>
  );
}

type Props = { children: React.ReactNode; className?: string };

/** Technical eyebrow label — a tick mark and mono uppercase text, no pill/glass chrome. */
export function EyebrowBadge({ children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-accent ${className}`}
    >
      <span aria-hidden className="h-px w-6 bg-accent/70" />
      {children}
    </span>
  );
}

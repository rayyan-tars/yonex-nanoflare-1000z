"use client";

import { motion } from "framer-motion";
import { forwardRef, useEffect, useId, useRef } from "react";
import { CloseIcon } from "./icons";

/** Non-modal side panel: the city stays visible and interactive beside it. */
export const SidePanel = forwardRef<
  HTMLElement,
  {
    eyebrow: string;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    compact?: boolean;
  }
>(function SidePanel({ eyebrow, title, onClose, children, footer, compact }, ref) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <motion.aside
      ref={ref}
      className={`eco-panel${compact ? " eco-panel--compact" : ""}`}
      aria-labelledby={id}
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <header className="eco-panel__head">
        <div>
          <p className="eco-eyebrow">{eyebrow}</p>
          <h2 id={id} ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <button type="button" className="eco-icon-btn" onClick={onClose} aria-label={`Close ${title}`}>
          <CloseIcon />
        </button>
      </header>
      <div className="eco-panel__body">{children}</div>
      {footer && <footer className="eco-panel__foot">{footer}</footer>}
    </motion.aside>
  );
});

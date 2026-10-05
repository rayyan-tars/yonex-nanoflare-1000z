"use client";

import { useId } from "react";
import { InfoIcon } from "./icons";

/** Small (i) button that reveals a one-paragraph explanation on hover or focus. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="eco-tip">
      <button type="button" className="eco-tip__btn" aria-label={label} aria-describedby={id}>
        <InfoIcon size={15} />
      </button>
      <span role="tooltip" id={id} className="eco-tip__bubble">
        {children}
      </span>
    </span>
  );
}

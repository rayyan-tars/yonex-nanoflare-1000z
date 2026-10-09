"use client";

import dynamic from "next/dynamic";

// The game is canvas-only and reads the browser's motion preference on mount.
const FutureShift = dynamic(() => import("@/futureshift/FutureShift"), { ssr: false });

export default function FutureShiftClient() {
  return <FutureShift />;
}

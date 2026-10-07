"use client";

import dynamic from "next/dynamic";
import { Splash } from "./Splash";

/** The game needs `window` (canvas, audio), so it renders only in the browser. */
const ClearSkiesApp = dynamic(() => import("./ClearSkiesApp"), { ssr: false, loading: () => <Splash /> });

export function ClearSkiesLoader() {
  return <ClearSkiesApp />;
}

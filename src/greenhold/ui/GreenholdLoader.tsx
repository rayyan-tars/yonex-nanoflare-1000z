"use client";

import dynamic from "next/dynamic";
import { Splash } from "./Splash";

/** The game needs `window` (storage, canvas), so it renders only in the browser. */
const GreenholdApp = dynamic(() => import("./GreenholdApp"), { ssr: false, loading: () => <Splash /> });

export function GreenholdLoader() {
  return <GreenholdApp />;
}

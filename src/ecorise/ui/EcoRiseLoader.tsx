"use client";

import dynamic from "next/dynamic";
import { BootSplash } from "./BootScreens";

/**
 * The game shell reads localStorage and the game engine needs `window`, so
 * the whole app renders only in the browser. The server sends the same
 * splash screen the client shows while loading, so there is no blank flash.
 */
const EcoRiseApp = dynamic(() => import("./EcoRiseApp"), {
  ssr: false,
  loading: () => (
    <div className="eco-root">
      <div className="eco-sea" aria-hidden="true" />
      <BootSplash />
    </div>
  ),
});

export function EcoRiseLoader() {
  return <EcoRiseApp />;
}

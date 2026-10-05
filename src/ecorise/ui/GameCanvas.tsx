"use client";

import { useEffect, useRef } from "react";
import type { QualitySetting } from "../state/persistence";
import { useEcoEnv } from "./context";

const BOOT_TIMEOUT_MS = 20000;

/**
 * Hosts exactly one Phaser game. Phaser is imported only inside the effect,
 * so it is never evaluated during server rendering. Each mount gets its own
 * child element; cleanup destroys the game and removes that element, so
 * development double-mounts cannot leave a second canvas behind.
 */
export function GameCanvas({ quality, fonts }: { quality: QualitySetting; fonts: { body: string; display: string } }) {
  const { store, bus, debug } = useEcoEnv();
  const hostRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let handle: { destroy(): void } | null = null;
    const mount = document.createElement("div");
    mount.className = "eco-canvas-mount";
    host.appendChild(mount);

    const fail = (error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      store.actions.bootFailed(message);
    };
    const watchdog = window.setTimeout(() => {
      if (!cancelled && store.getState().boot.status === "loading") {
        fail(new Error("The city took too long to start."));
      }
    }, BOOT_TIMEOUT_MS);

    // Canvas-baked signs need the web fonts before the art is drawn.
    const fontsReady = Promise.all([
      document.fonts?.load(`600 12px ${fonts.body}`),
      document.fonts?.load(`600 12px ${fonts.display}`),
    ]).catch(() => undefined);
    Promise.all([import("../game/createGame"), fontsReady])
      .then(([{ createGame }]) => {
        if (cancelled) return;
        try {
          handle = createGame(mount, {
            store,
            bus,
            quality,
            fonts,
            debugEl: debug ? debugRef.current : null,
            onReady: () => {
              if (!cancelled) store.actions.bootReady();
            },
            onError: fail,
          });
        } catch (error) {
          fail(error);
        }
      })
      .catch(fail);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      handle?.destroy();
      handle = null;
      mount.remove();
    };
  }, [store, bus, quality, fonts, debug]);

  return (
    <>
      <div ref={hostRef} className="eco-canvas-host" aria-hidden="true" />
      {debug && <div ref={debugRef} className="eco-debug" aria-hidden="true" />}
    </>
  );
}

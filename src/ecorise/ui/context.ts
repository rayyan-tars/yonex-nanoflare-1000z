"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Bus } from "../state/bus";
import type { EcoState, EcoStore } from "../state/store";

export interface EcoEnv {
  store: EcoStore;
  bus: Bus;
  debug: boolean;
}

export const EcoContext = createContext<EcoEnv | null>(null);

export function useEcoEnv(): EcoEnv {
  const env = useContext(EcoContext);
  if (!env) throw new Error("EcoRise context missing");
  return env;
}

/**
 * Subscribes to a slice of the single EcoRise store. Components re-render
 * only when the selected value changes (by reference), never per frame.
 */
export function useEco<T>(selector: (s: EcoState) => T): T {
  const { store } = useEcoEnv();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

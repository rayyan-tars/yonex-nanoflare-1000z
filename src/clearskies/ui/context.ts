"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Store } from "../state/store";

export const StoreContext = createContext<Store | null>(null);

/** The game store; the component re-renders whenever the town changes. */
export function useGame() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useGame outside the game");
  useSyncExternalStore(store.subscribe, store.getRev, store.getRev);
  return store;
}

/** The store without subscribing (for event handlers only). */
export function useStoreRef() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStoreRef outside the game");
  return store;
}

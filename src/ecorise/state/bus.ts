/** One-off commands from the interface to the city view (not state). */
export interface BusEvents {
  focus: { target: "kitchen" | "meadow" | "mission" | "service" | "results"; insetRight: number };
  recenter: undefined;
  /** Lunch playback: diners handled so far (in queue order). */
  serviceProgress: { processed: number };
  serviceSpeed: { speed: 1 | 2 };
  serviceSkip: undefined;
  constructionSkip: undefined;
  /** Render the two illustrative 2050 views of the campus. */
  captureFutures: undefined;
  futuresCaptured: { bau: string; smart: string } | { error: string };
}

type Handler<T> = (payload: T) => void;

export interface Bus {
  on<K extends keyof BusEvents>(type: K, handler: Handler<BusEvents[K]>): () => void;
  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void;
}

export function createBus(): Bus {
  const handlers = new Map<keyof BusEvents, Set<Handler<never>>>();
  return {
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as Handler<never>);
      return () => set!.delete(handler as Handler<never>);
    },
    emit(type, payload) {
      handlers.get(type)?.forEach((h) => (h as Handler<typeof payload>)(payload));
    },
  };
}

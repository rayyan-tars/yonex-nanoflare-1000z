// Small external store shared by React UI and the canvas scene.

import {
  bridgePrompt,
  finishHeatwave,
  heatwaveResult,
  initialState,
  place,
  replay,
  reveal,
  startHeatwave,
  undo,
  type GameState,
  type HeatResult,
  type HotspotId,
  type InterventionId,
} from "./model";
import { setMuted, sfx } from "./sound";

export type UIState = {
  game: GameState;
  gen: number;
  selected: InterventionId | null;
  /** The handle appears after the first change's lens preview. */
  lensReady: boolean;
  lensTouched: boolean;
  /** Short pause after the third choice before "YOUR 2050 IS READY". */
  readyShown: boolean;
  revealSettled: boolean;
  heatProgress: number;
  result: HeatResult | null;
  bridge: "hidden" | "shown" | "spot" | "done";
  muted: boolean;
  reduced: boolean;
  about: boolean;
};

export class Store {
  state: UIState;
  private listeners = new Set<() => void>();
  private timers: number[] = [];

  constructor(reduced: boolean) {
    this.state = {
      game: initialState(),
      gen: 0,
      selected: null,
      lensReady: false,
      lensTouched: false,
      readyShown: false,
      revealSettled: false,
      heatProgress: 0,
      result: null,
      bridge: "hidden",
      muted: false,
      reduced,
      about: false,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = () => this.state;

  private set(patch: Partial<UIState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, this.state.reduced ? Math.min(ms, 150) : ms));
  }

  dispose() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  // ---------------------------------------------------------------- actions

  select(id: InterventionId | null) {
    if (this.state.game.phase !== "choose") return;
    const next = this.state.selected === id ? null : id;
    if (next) sfx.select();
    this.set({ selected: next });
  }

  placeAt(spot: HotspotId) {
    const g = place(this.state.game, spot);
    if (g === this.state.game) return false;
    this.set({ game: g, selected: null, readyShown: false });
    if (g.phase === "ready") {
      const gen = this.state.gen;
      const count = g.placements.length;
      // let the third placement land before the prompt appears
      this.later(1100, () => {
        if (this.state.gen === gen && this.state.game.phase === "ready" && this.state.game.placements.length === count) this.set({ readyShown: true });
      });
    }
    return true;
  }

  undo() {
    const g = undo(this.state.game);
    if (g === this.state.game) return;
    sfx.undo();
    this.set({ game: g, readyShown: false });
  }

  lensIntroduced() {
    if (!this.state.lensReady) this.set({ lensReady: true });
  }

  touchLens() {
    if (!this.state.lensTouched) this.set({ lensTouched: true });
  }

  reveal() {
    const g = reveal(this.state.game);
    if (g === this.state.game) return;
    sfx.reveal();
    this.set({ game: g, lensReady: true, revealSettled: false });
    this.later(1900, () => {
      if (this.state.game.phase === "reveal") this.set({ revealSettled: true });
    });
  }

  testHeat() {
    const g = startHeatwave(this.state.game);
    if (g === this.state.game) return;
    this.set({ game: g, heatProgress: 0 });
  }

  heatTick(p: number) {
    if (Math.abs(p - this.state.heatProgress) > 0.004) this.set({ heatProgress: p });
  }

  heatDone() {
    const g = finishHeatwave(this.state.game);
    if (g === this.state.game) return;
    sfx.result();
    const result = heatwaveResult(g.placements);
    const firstFuture = g.futuresCompleted === 1;
    this.set({ game: g, result, heatProgress: 1 });
    if (firstFuture) this.later(1400, () => this.state.game.phase === "result" && this.set({ bridge: "shown" }));
  }

  replay() {
    this.set({
      game: replay(this.state.game),
      gen: this.state.gen + 1,
      selected: null,
      readyShown: false,
      revealSettled: false,
      heatProgress: 0,
      result: null,
      bridge: this.state.bridge === "hidden" ? "hidden" : "done",
    });
  }

  answerBridge(spot: boolean) {
    this.set({ bridge: spot ? "spot" : "done" });
    if (spot) this.later(3200, () => this.state.bridge === "spot" && this.set({ bridge: "done" }));
  }

  setMuted(m: boolean) {
    setMuted(m);
    this.set({ muted: m });
  }

  setReduced(r: boolean) {
    this.set({ reduced: r });
  }

  setAbout(open: boolean) {
    this.set({ about: open });
  }

  bridgeQuestion() {
    return bridgePrompt(this.state.game.placements).question;
  }
}

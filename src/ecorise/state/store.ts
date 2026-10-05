import { toggleVoiceAction } from "../model/planning";
import { computeRoundReport, type RoundReport } from "../model/report";
import { creditAttempt, type CreditReason } from "../model/rewards";
import { getScenario } from "../model/scenarios";
import { sanitizePortions } from "../model/simulation";
import { NO_UPGRADES, type StudentVoiceAction, type Upgrades } from "../model/types";
import {
  clearEcoRiseData,
  defaultSave,
  type LoadStatus,
  type MotionSetting,
  type QualitySetting,
  type SaveData,
  type StorageLike,
  writeSave,
} from "./persistence";

export type Selection = "kitchen" | "meadow" | null;
export type Overlay = "about" | "settings" | "reset-confirm" | null;
export type BootStatus = "loading" | "ready" | "error";
export type Phase = "planning" | "serving" | "results";

/** One committed lunch service. Computed once when the player presses Serve. */
export interface ActiveRound {
  attemptId: string;
  report: RoundReport;
  /** Eco Credits actually paid for this attempt (improvement over the best). */
  credited: number;
  creditReason: CreditReason;
  /** Best value previously credited for this scenario, before this attempt. */
  previousBest: number;
}

export interface EcoState {
  /** Persisted portion. */
  save: SaveData;
  /** Upgrades owned. Building is a Step 2 feature, so this is always empty for now. */
  upgrades: Upgrades;
  /** Session-only UI state. */
  phase: Phase;
  round: ActiveRound | null;
  boot: { status: BootStatus; message: string | null };
  introOpen: boolean;
  selection: Selection;
  overlay: Overlay;
  systemReducedMotion: boolean;
  storage: { available: boolean; loadStatus: LoadStatus; lastWriteFailed: boolean };
  notice: { id: number; text: string } | null;
}

type Listener = () => void;

export interface EcoActions {
  bootReady(): void;
  bootFailed(message: string): void;
  bootRetry(): void;
  enterCity(): void;
  showIntro(): void;
  select(selection: Selection): void;
  clearSelection(): void;
  openOverlay(overlay: Overlay): void;
  closeOverlay(): void;
  toggleVoice(action: StudentVoiceAction): void;
  setPortions(value: number): void;
  setOfferSmall(offerSmallServings: boolean): void;
  /** Locks the plan, computes the round once and credits it. */
  serveLunch(): void;
  finishService(): void;
  /** Back to planning the same day, keeping the last plan for adjustment. */
  tryAgain(): void;
  setMotion(motion: MotionSetting): void;
  setQuality(quality: QualitySetting): void;
  setSystemReducedMotion(value: boolean): void;
  dismissNotice(): void;
  notify(text: string): void;
  resetAll(): void;
}

export interface EcoStore {
  getState(): EcoState;
  subscribe(listener: Listener): () => void;
  actions: EcoActions;
  /** Flush any pending save immediately (used on page hide / unmount). */
  flush(): void;
  dispose(): void;
}

const SAVE_DEBOUNCE_MS = 250;

export function createEcoStore(options: {
  initialSave: SaveData;
  loadStatus: LoadStatus;
  storage: StorageLike | null;
  systemReducedMotion: boolean;
}): EcoStore {
  let state: EcoState = {
    save: options.initialSave,
    upgrades: NO_UPGRADES,
    phase: "planning",
    round: null,
    boot: { status: "loading", message: null },
    introOpen: !options.initialSave.onboardingDone,
    selection: null,
    overlay: null,
    systemReducedMotion: options.systemReducedMotion,
    storage: {
      available: !!options.storage,
      loadStatus: options.loadStatus,
      lastWriteFailed: false,
    },
    notice: null,
  };
  const listeners = new Set<Listener>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let noticeId = 0;

  const persistNow = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!options.storage) return;
    const ok = writeSave(options.storage, state.save);
    if (ok === state.storage.lastWriteFailed) {
      set({ storage: { ...state.storage, lastWriteFailed: !ok } }, false);
    }
  };

  function set(patch: Partial<EcoState>, persist: boolean) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
    if (persist && options.storage) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persistNow, SAVE_DEBOUNCE_MS);
    }
  }

  const updateSave = (fn: (s: SaveData) => SaveData) => set({ save: fn(state.save) }, true);
  const notify = (text: string) => set({ notice: { id: ++noticeId, text } }, false);

  function createActions(): EcoActions {
    return {
      bootReady: () => set({ boot: { status: "ready", message: null } }, false),
      bootFailed: (message: string) => set({ boot: { status: "error", message } }, false),
      bootRetry: () => set({ boot: { status: "loading", message: null } }, false),

      enterCity: () => {
        // The opening card leads straight into planning the day.
        set({ introOpen: false, selection: state.phase === "planning" ? "kitchen" : state.selection }, false);
        updateSave((s) => ({ ...s, onboardingDone: true }));
      },
      showIntro: () => {
        if (state.phase === "serving") return;
        set({ introOpen: true, selection: null, overlay: null }, false);
      },

      select: (selection: Selection) => {
        if (state.introOpen || state.phase === "serving") return;
        if (state.phase === "results" && selection !== null) return;
        set({ selection, overlay: null }, false);
      },
      clearSelection: () => set({ selection: null }, false),
      openOverlay: (overlay: Overlay) => set({ overlay }, false),
      closeOverlay: () => set({ overlay: null }, false),

      toggleVoice: (action: StudentVoiceAction) => {
        if (state.phase !== "planning") return;
        const result = toggleVoiceAction(state.save.draft.voice, action);
        if (result.rejected) {
          notify("Both Student Voice tokens are in use. Deselect one to choose another.");
          return;
        }
        updateSave((s) => ({ ...s, draft: { ...s.draft, voice: result.voice } }));
      },
      setPortions: (value: number) => {
        if (state.phase !== "planning") return;
        const portionsPrepared = sanitizePortions(value);
        if (portionsPrepared === state.save.draft.policy.portionsPrepared) return;
        updateSave((s) => ({
          ...s,
          draft: { ...s.draft, policy: { ...s.draft.policy, portionsPrepared } },
        }));
      },
      setOfferSmall: (offerSmallServings: boolean) => {
        if (state.phase !== "planning") return;
        updateSave((s) => ({
          ...s,
          draft: { ...s.draft, policy: { ...s.draft.policy, offerSmallServings } },
        }));
      },

      serveLunch: () => {
        if (state.phase !== "planning" || state.introOpen) return;
        const save = state.save;
        const scenario = getScenario(save.scenarioId);
        const report = computeRoundReport(scenario, {
          voice: save.draft.voice,
          policy: save.draft.policy,
          upgrades: state.upgrades,
        });
        const attemptId = newAttemptId();
        const previousBest = save.progress.ledger.scenarios[save.scenarioId]?.bestCreditedValue ?? 0;
        const credit = creditAttempt(save.progress.ledger, {
          scenarioId: save.scenarioId,
          attemptId,
          value: report.evaluation.value,
        });
        const prevBest = save.progress.best[save.scenarioId];
        const perMeal = report.player.fed ? report.player.waste.perMeal : null;
        const best = {
          stars: Math.max(prevBest?.stars ?? 0, report.stars.count),
          wastePerMeal:
            perMeal === null
              ? (prevBest?.wastePerMeal ?? null)
              : prevBest?.wastePerMeal == null
                ? perMeal
                : Math.min(prevBest.wastePerMeal, perMeal),
        };
        const res = report.player.result;
        // Reward, ledger and records change in one save so a reload can never pay twice.
        state = {
          ...state,
          phase: "serving",
          selection: null,
          overlay: null,
          round: { attemptId, report, credited: credit.credited, creditReason: credit.reason, previousBest },
          save: {
            ...save,
            progress: {
              credits: save.progress.credits + credit.credited,
              ledger: credit.ledger,
              best: { ...save.progress.best, [save.scenarioId]: best },
              last: {
                scenarioId: save.scenarioId,
                hotMeals: res.hotMeals,
                attendance: res.attendance,
                wastePerMeal: report.player.waste.perMeal,
              },
            },
          },
        };
        listeners.forEach((l) => l());
        persistNow();
      },
      finishService: () => {
        if (state.phase !== "serving") return;
        set({ phase: "results" }, false);
      },
      tryAgain: () => {
        if (state.phase === "serving") return;
        set({ phase: "planning", round: null, selection: "kitchen", overlay: null }, false);
      },

      setMotion: (motion: MotionSetting) =>
        updateSave((s) => ({ ...s, settings: { ...s.settings, motion } })),
      setQuality: (quality: QualitySetting) =>
        updateSave((s) => ({ ...s, settings: { ...s.settings, quality } })),
      setSystemReducedMotion: (value: boolean) => set({ systemReducedMotion: value }, false),

      dismissNotice: () => set({ notice: null }, false),
      notify,

      /** Clears only EcoRise data, then restarts from a fresh save. */
      resetAll: () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        const cleared = clearEcoRiseData(options.storage);
        set(
          {
            save: defaultSave(),
            upgrades: NO_UPGRADES,
            phase: "planning",
            round: null,
            introOpen: true,
            selection: null,
            overlay: null,
            storage: { ...state.storage, loadStatus: "fresh" },
          },
          false,
        );
        notify(
          cleared || !options.storage
            ? "EcoRise has been reset."
            : "EcoRise was reset for this session, but saved data could not be cleared.",
        );
      },
    };
  }

  const actions = createActions();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
    flush: persistNow,
    dispose() {
      persistNow();
      listeners.clear();
    },
  };
}

let attemptCounter = 0;
function newAttemptId(): string {
  attemptCounter++;
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${Date.now().toString(36)}-${attemptCounter}-${rand}`;
}

export function prefersReducedMotion(state: EcoState): boolean {
  const m = state.save.settings.motion;
  return m === "reduce" || (m === "system" && state.systemReducedMotion);
}

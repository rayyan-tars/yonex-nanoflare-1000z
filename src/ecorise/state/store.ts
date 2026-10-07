import {
  chooseChange,
  markChangeTested,
  newAuditRecord,
  setFeedback,
  recordBaseline,
  recordFollowUp,
  setCauses,
  setDiscussed,
  submitAudit,
  verifyAuditDemo,
  type AuditCause,
  type AuditChange,
  type AuditMeasurement,
  type FeedbackTally,
  type AuditRecord,
  type AuditRefusal,
  type AuditResult,
  type AuditSource,
} from "../model/audit";
import { toggleVoiceAction } from "../model/planning";
import { completeMission as completeMissionRule, dayKey, newlyMet, type CompleteRefusal } from "../model/missions";
import { computeRoundReport, type RoundReport } from "../model/report";
import { creditAttempt, type CreditReason } from "../model/rewards";
import { BUILDING_COSTS } from "../model/config";
import { getScenario } from "../model/scenarios";
import { sanitizePortions } from "../model/simulation";
import { NO_UPGRADES, type StudentVoiceAction, type Upgrades } from "../model/types";
import {
  abandonSession,
  addDemoSessions,
  clearDemoSessions,
  emptyPlaytests,
  finishSession,
  recordFirstResults,
  recordHubBuilt,
  recordMissionOpened,
  recordOnboarding,
  recordRound,
  startSession,
  writePlaytests,
  type PlaytestAnswers,
  type PlaytestData,
} from "./playtest";
import {
  clearEcoRiseData,
  defaultSave,
  type LoadStatus,
  type MotionSetting,
  type QualitySetting,
  type SaveData,
  type StorageLike,
  GROWTH_STAGES,
  writeSave,
} from "./persistence";

/** What each campus growth stage adds, in order. */
export const GROWTH_NAMES = ["a student vegetable garden", "a compost station", "new shade trees", "a bigger community garden"] as const;

/** What the Planning Hub costs, in Eco Credits. */
export const PLANNING_HUB_COST = BUILDING_COSTS.planningOffice;

/** Upgrades in force, derived from what has been built. */
export function upgradesOf(save: SaveData): Upgrades {
  return save.progress.campus.planningHubBuilt ? { planningOffice: true, secondCounter: false } : NO_UPGRADES;
}

export type BuildRefusal = "locked" | "already-built" | "not-enough-credits" | "busy";

/** Why the Planning Hub cannot be bought right now, or null if it can. */
export function planningHubRefusal(state: EcoState): BuildRefusal | null {
  const c = state.save.progress.campus;
  if (c.planningHubBuilt) return "already-built";
  if (!c.planningHubUnlocked) return "locked";
  if (state.save.progress.credits < PLANNING_HUB_COST) return "not-enough-credits";
  if (state.phase === "serving" || state.phase === "constructing") return "busy";
  return null;
}

export type Selection = "kitchen" | "meadow" | "mission" | null;

/** The Sustainability Flag flies once a real (school) audit is verified. */
export function sustainabilityFlagRaised(save: SaveData): boolean {
  const r = save.mission.school;
  return !!r && (r.status === "verified" || r.status === "measured");
}

const AUDIT_REFUSALS: Record<AuditRefusal, string> = {
  "wrong-status": "That step isn't available yet.",
  "invalid-measurement": "Check the numbers: meals served must be a whole number above 0, and grams can't be negative.",
  "invalid-feedback": "Feedback counts must be whole numbers, 0 or more.",
  "demo-is-fixed": "Demo data can't be edited. Start a school audit to enter your own measurements.",
  incomplete: "Finish steps 1 to 3 first.",
  "not-tested": "Test the change at a later lunch first.",
  "method-not-confirmed": "Confirm the follow-up was measured the same way as the baseline.",
};
export type Overlay =
  | "about"
  | "settings"
  | "reset-confirm"
  | "demo-reset"
  | "playtest-start"
  | "playtest-finish"
  | "playtest-summary"
  | "futures"
  | "missions"
  | "impact"
  | null;
export type BootStatus = "loading" | "ready" | "error";
/**
 * planning → serving → results → (building → constructing → built) → planning
 * The build phases only happen when the Planning Hub is available.
 */
export type Phase = "planning" | "serving" | "results" | "building" | "constructing" | "built";

/** One committed lunch service. Computed once when the player presses Serve. */
export interface ActiveRound {
  attemptId: string;
  report: RoundReport;
  /** Eco Credits actually paid for this attempt (improvement over the best). */
  credited: number;
  creditReason: CreditReason;
  /** Best value previously credited for this scenario, before this attempt. */
  previousBest: number;
  /** True if this round unlocked the Planning Hub for the first time. */
  unlockedPlanningHub: boolean;
}

export interface EcoState {
  /** Persisted portion. */
  save: SaveData;
  /** Upgrades in force (derived from the save; kept as a stable reference). */
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
  /** Which mission record the mission card shows (session only). */
  missionView: AuditSource;
  /** Anonymous playtest records, stored apart from the game save. */
  playtest: PlaytestData;
  /** Session only: the first strong lunch should lead into Two Futures. */
  futureIntroPending: boolean;
  /** Session only: the futures view opens with the "Timeline changed" moment. */
  futuresIntro: boolean;
}

type Listener = () => void;

export interface EcoActions {
  bootReady(): void;
  bootFailed(message: string): void;
  bootRetry(): void;
  enterCity(): void;
  /** Opens on the campus itself, with nothing selected (the world-first opening). */
  startDay(): void;
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
  /** From results: highlight the plot so the player can choose to build. */
  improveCampus(): void;
  /** Buys and starts building the Planning Hub. Pays exactly once. */
  buildPlanningHub(): void;
  finishConstruction(): void;
  /** Real-world mission. Every change goes through the audit rules. */
  openMission(view?: AuditSource): void;
  startAudit(source: AuditSource): void;
  discardAudit(source: AuditSource): void;
  auditBaseline(m: AuditMeasurement): boolean;
  auditCauses(causes: AuditCause[]): void;
  auditFeedback(feedback: FeedbackTally | null): void;
  markChangeTested(): void;
  auditDiscussed(discussed: boolean): void;
  auditChange(change: AuditChange | null): void;
  submitAudit(): void;
  verifyAuditDemo(): void;
  auditFollowUp(m: AuditMeasurement, sameMethod: boolean): boolean;
  /** Restarts the game from a clean Monday and begins an anonymous playtest session. */
  startPlaytest(): void;
  /** Saves the three answers and completes the session; false if it can't count. */
  submitPlaytest(answers: PlaytestAnswers): boolean;
  /** Ends the session without counting it. */
  abandonPlaytest(): void;
  /** Removes playtest records only; game progress is untouched. */
  clearPlaytests(): void;
  addDemoPlaytests(): void;
  clearDemoPlaytests(): void;
  /** Clean filming state: fresh Monday, settings and playtest records kept. */
  resetDemo(): void;
  /** Story layer. */
  markMessageSeen(): void;
  /** The real-world audit prompt was answered (either way). */
  markAuditPrompted(): void;
  /** Marks a real-life mission done for today (a bigger mission needs a photo). */
  completeMission(missionId: string, photo?: string): CompleteRefusal | null;
  /** Today's local calendar day, from the store's clock. */
  today(): string;
  openFutures(withIntro?: boolean): void;
  setMotion(motion: MotionSetting): void;
  setQuality(quality: QualitySetting): void;
  setSound(sound: boolean): void;
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
  initialPlaytest?: PlaytestData;
  /** Clock for playtest timing (injectable for tests). */
  now?: () => number;
}): EcoStore {
  const now = options.now ?? (() => Date.now());
  let state: EcoState = {
    save: options.initialSave,
    upgrades: upgradesOf(options.initialSave),
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
    missionView: options.initialSave.mission.school || !options.initialSave.mission.demo ? "school" : "demo",
    playtest: options.initialPlaytest ?? emptyPlaytests(),
    futureIntroPending: false,
    futuresIntro: false,
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

  /** Updates playtest records and writes them straight away (they are small). */
  const updatePlaytest = (fn: (d: PlaytestData) => PlaytestData) => {
    const next = fn(state.playtest);
    if (next === state.playtest) return;
    state = { ...state, playtest: next };
    listeners.forEach((l) => l());
    writePlaytests(options.storage, next);
  };

  /** A clean Monday, keeping settings. Used for filming and before each playtest. */
  const freshGame = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const save: SaveData = { ...defaultSave(), settings: state.save.settings };
    state = {
      ...state,
      save,
      upgrades: upgradesOf(save),
      phase: "planning",
      round: null,
      introOpen: true,
      selection: null,
      overlay: null,
      missionView: "school",
      notice: null,
      futureIntroPending: false,
      futuresIntro: false,
    };
    listeners.forEach((l) => l());
    persistNow();
  };

  /** Applies one audit rule to the record on show; refusals become a notice. */
  const applyAudit = (fn: (r: AuditRecord) => AuditResult, persistImmediately = false): boolean => {
    const source = state.missionView;
    const record = state.save.mission[source];
    if (!record) return false;
    const result = fn(record);
    if (!result.ok) {
      notify(AUDIT_REFUSALS[result.reason]);
      return false;
    }
    const save = { ...state.save, mission: { ...state.save.mission, [source]: result.record } };
    if (persistImmediately) {
      // Status changes are written at once so a reload never loses them.
      state = { ...state, save };
      listeners.forEach((l) => l());
      persistNow();
    } else {
      set({ save }, true);
    }
    return true;
  };

  function createActions(): EcoActions {
    return {
      bootReady: () => set({ boot: { status: "ready", message: null } }, false),
      bootFailed: (message: string) => set({ boot: { status: "error", message } }, false),
      bootRetry: () => set({ boot: { status: "loading", message: null } }, false),

      enterCity: () => {
        // The opening card leads straight into planning the day.
        set({ introOpen: false, selection: state.phase === "planning" ? "kitchen" : state.selection }, false);
        updateSave((s) => ({ ...s, onboardingDone: true }));
        updatePlaytest(recordOnboarding);
      },
      startDay: () => {
        set({ introOpen: false, selection: null }, false);
        updateSave((s) => ({ ...s, onboardingDone: true, story: { ...s.story, messageSeen: true } }));
        updatePlaytest(recordOnboarding);
      },
      showIntro: () => {
        if (state.phase === "serving" || state.phase === "constructing") return;
        set({ introOpen: true, selection: null, overlay: null }, false);
      },

      select: (selection: Selection) => {
        if (state.introOpen || state.phase === "serving" || state.phase === "constructing") return;
        if (state.phase === "results" && selection !== null) return;
        if (state.phase === "building" && selection !== "meadow" && selection !== null) return;
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
          upgrades: upgradesOf(save),
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
        // Feeding everyone unlocks the Planning Hub (once).
        const campus = save.progress.campus;
        const unlockedNow = report.player.fed && !campus.planningHubUnlocked;
        // Reward, ledger and records change in one save so a reload can never pay twice.
        state = {
          ...state,
          phase: "serving",
          selection: null,
          overlay: null,
          round: {
            attemptId,
            report,
            credited: credit.credited,
            creditReason: credit.reason,
            previousBest,
            unlockedPlanningHub: unlockedNow,
          },
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
              campus: unlockedNow ? { ...campus, planningHubUnlocked: true } : campus,
            },
          },
        };
        listeners.forEach((l) => l());
        persistNow();
        updatePlaytest((d) =>
          recordRound(d, {
            voice: { ...save.draft.voice },
            portionsPrepared: save.draft.policy.portionsPrepared,
            smallServings: save.draft.policy.offerSmallServings,
            everyoneFed: report.player.fed,
            studentsFed: res.hotMeals,
            attendance: res.attendance,
            wastePortionsPerMeal: report.player.waste.perMeal,
            stars: report.stars.count,
          }),
        );
      },
      finishService: () => {
        if (state.phase !== "serving") return;
        set({ phase: "results" }, false);
        // A strong lunch (everyone fed, low waste) introduces the two futures, once.
        const stars = state.round?.report.stars;
        if (stars?.fed && stars.lowWaste) {
          // Every strong lunch grows the campus one stage toward the food-smart 2050.
          const story = state.save.story;
          const growth = Math.min(GROWTH_STAGES, story.growth + 1);
          const first = !story.futuresUnlocked;
          state = {
            ...state,
            futureIntroPending: first || state.futureIntroPending,
            save: { ...state.save, story: { ...story, futuresUnlocked: true, growth } },
          };
          listeners.forEach((l) => l());
          persistNow();
        }
        updatePlaytest((d) => recordFirstResults(d, now()));
      },
      tryAgain: () => {
        if (state.phase === "serving" || state.phase === "constructing") return;
        set({ phase: "planning", round: null, selection: "kitchen", overlay: null, futureIntroPending: false }, false);
      },
      improveCampus: () => {
        if (state.phase !== "results" && state.phase !== "planning") return;
        const c = state.save.progress.campus;
        if (!c.planningHubUnlocked || c.planningHubBuilt) return;
        set({ phase: "building", selection: null, overlay: null }, false);
      },
      buildPlanningHub: () => {
        const refusal = planningHubRefusal(state);
        if (refusal) {
          if (refusal === "not-enough-credits") notify(`The Planning Hub needs ${PLANNING_HUB_COST} Eco Credits.`);
          return;
        }
        const save = state.save;
        const next: SaveData = {
          ...save,
          progress: {
            ...save.progress,
            credits: save.progress.credits - PLANNING_HUB_COST,
            campus: { ...save.progress.campus, planningHubBuilt: true },
          },
        };
        // Payment and the built flag are written together, immediately.
        state = { ...state, save: next, upgrades: upgradesOf(next), phase: "constructing", selection: null, overlay: null };
        listeners.forEach((l) => l());
        persistNow();
        updatePlaytest(recordHubBuilt);
      },
      finishConstruction: () => {
        if (state.phase !== "constructing") return;
        set({ phase: "built" }, false);
      },

      openMission: (view?: AuditSource) => {
        if (state.introOpen || state.phase !== "planning") return;
        set({ selection: "mission", overlay: null, missionView: view ?? state.missionView }, false);
        updatePlaytest(recordMissionOpened);
      },
      startAudit: (source: AuditSource) => {
        if (state.save.mission[source]) {
          set({ missionView: source }, false);
          return;
        }
        state = {
          ...state,
          missionView: source,
          save: { ...state.save, mission: { ...state.save.mission, [source]: newAuditRecord(source) } },
        };
        listeners.forEach((l) => l());
        persistNow();
      },
      discardAudit: (source: AuditSource) => {
        const r = state.save.mission[source];
        if (!r) return;
        // A submitted school audit is a record of real work: it stays.
        if (source === "school" && r.status !== "proposed") return;
        state = {
          ...state,
          missionView: "school",
          save: { ...state.save, mission: { ...state.save.mission, [source]: null } },
        };
        listeners.forEach((l) => l());
        persistNow();
      },
      auditBaseline: (m: AuditMeasurement) => applyAudit((r) => recordBaseline(r, m), true),
      auditCauses: (causes: AuditCause[]) => void applyAudit((r) => setCauses(r, causes)),
      auditFeedback: (feedback: FeedbackTally | null) => void applyAudit((r) => setFeedback(r, feedback)),
      markChangeTested: () => void applyAudit(markChangeTested, true),
      auditDiscussed: (discussed: boolean) => void applyAudit((r) => setDiscussed(r, discussed)),
      auditChange: (change: AuditChange | null) => void applyAudit((r) => chooseChange(r, change)),
      submitAudit: () => void applyAudit(submitAudit, true),
      verifyAuditDemo: () => void applyAudit(verifyAuditDemo, true),
      auditFollowUp: (m: AuditMeasurement, sameMethod: boolean) => applyAudit((r) => recordFollowUp(r, m, sameMethod), true),

      startPlaytest: () => {
        if (state.phase === "serving" || state.phase === "constructing") return;
        freshGame();
        updatePlaytest((d) => startSession(d, now()));
        notify(`Playtest #${state.playtest.activeId} started. Hand over to the player.`);
      },
      submitPlaytest: (answers: PlaytestAnswers) => {
        const result = finishSession(state.playtest, answers, now());
        if (!result.ok) {
          notify(
            result.reason === "no-lunch"
              ? "Serve at least one lunch before finishing, or end without saving."
              : result.reason === "invalid-answers"
                ? "Choose how easy EcoRise was to understand (1 to 5)."
                : "No playtest is running.",
          );
          return false;
        }
        const id = state.playtest.activeId;
        updatePlaytest(() => result.data);
        set({ overlay: null }, false);
        notify(`Playtest #${id} saved. Thank you!`);
        return true;
      },
      abandonPlaytest: () => {
        updatePlaytest((d) => abandonSession(d, now()));
        set({ overlay: null }, false);
      },
      clearPlaytests: () => {
        updatePlaytest(() => emptyPlaytests());
        notify("Playtest data cleared. Game progress was not changed.");
      },
      addDemoPlaytests: () => updatePlaytest((d) => addDemoSessions(d, now())),
      clearDemoPlaytests: () => updatePlaytest(clearDemoSessions),
      resetDemo: () => {
        if (state.phase === "serving" || state.phase === "constructing") return;
        updatePlaytest((d) => abandonSession(d, now()));
        freshGame();
        notify("Demo reset: a clean Monday. Playtest records were kept.");
      },

      markMessageSeen: () => {
        if (state.save.story.messageSeen) return;
        updateSave((s) => ({ ...s, story: { ...s.story, messageSeen: true } }));
      },
      today: () => dayKey(now()),
      completeMission: (missionId: string, photo?: string) => {
        const day = dayKey(now());
        const r = completeMissionRule(state.save.missions, missionId, day, photo);
        if (r.refused) return r.refused;
        // A school challenge met by this action: its part of the campus changes, and 2050 can be viewed.
        const met = newlyMet(r.save);
        const missions = met.length ? { ...r.save, cityChanged: [...r.save.cityChanged, ...met] } : r.save;
        updateSave((s) => ({ ...s, missions, story: met.length ? { ...s.story, futuresUnlocked: true } : s.story }));
        persistNow();
        return null;
      },
      markAuditPrompted: () => {
        if (state.save.story.auditPrompted) return;
        updateSave((s) => ({ ...s, story: { ...s.story, auditPrompted: true } }));
      },
      openFutures: (withIntro = false) => {
        if (!state.save.story.futuresUnlocked || state.phase === "serving" || state.phase === "constructing") return;
        set({ overlay: "futures", futuresIntro: withIntro, futureIntroPending: false, selection: null }, false);
      },

      setMotion: (motion: MotionSetting) =>
        updateSave((s) => ({ ...s, settings: { ...s.settings, motion } })),
      setSound: (sound: boolean) => updateSave((s) => ({ ...s, settings: { ...s.settings, sound } })),
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
            upgrades: upgradesOf(defaultSave()),
            phase: "planning",
            round: null,
            introOpen: true,
            selection: null,
            overlay: null,
            storage: { ...state.storage, loadStatus: "fresh" },
            missionView: "school",
            playtest: emptyPlaytests(),
            futureIntroPending: false,
            futuresIntro: false,
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

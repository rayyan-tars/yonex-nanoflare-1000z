import { BALANCE, REWARDS } from "../model/config";
import { NO_VOICE, voiceTokensUsed } from "../model/planning";
import { EMPTY_LEDGER, type RewardLedger, type ScenarioLedgerEntry } from "../model/rewards";
import { validAuditRecord, type AuditRecord } from "../model/audit";
import { DEFAULT_SCENARIO_ID, findScenarioDefinition } from "../model/scenarios";
import { sanitizePortions } from "../model/simulation";
import type { KitchenPolicy, StudentVoice } from "../model/types";

/** All EcoRise keys share this prefix; reset only ever touches these keys. */
export const STORAGE_PREFIX = "ecorise:";
export const SAVE_KEY = `${STORAGE_PREFIX}save`;
export const CORRUPT_BACKUP_KEY = `${STORAGE_PREFIX}save-unreadable-backup`;
export const SAVE_SCHEMA_VERSION = 1;

export type MotionSetting = "system" | "reduce" | "full";
export type QualitySetting = "sharp" | "performance";

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  settings: { motion: MotionSetting; quality: QualitySetting };
  onboardingDone: boolean;
  scenarioId: string;
  draft: { voice: StudentVoice; policy: KitchenPolicy };
  progress: {
    credits: number;
    ledger: RewardLedger;
    /** Best stars and lowest waste per meal per scenario (display only). */
    best: Record<string, BestRecord>;
    /** Most recent round, for the top-bar indicators. */
    last: LastRound | null;
    /** Campus progression. A building is only ever built once. */
    campus: CampusState;
  };
  /**
   * Real-world mission measurements. Kept apart from simulated lunch
   * progress, and the school record apart from the demo record: demo numbers
   * are never shown as school measurements.
   */
  mission: MissionSave;
}

export interface MissionSave {
  school: AuditRecord | null;
  demo: AuditRecord | null;
}

export const DEFAULT_MISSION: MissionSave = { school: null, demo: null };

export interface CampusState {
  planningHubUnlocked: boolean;
  planningHubBuilt: boolean;
}

export const DEFAULT_CAMPUS: CampusState = { planningHubUnlocked: false, planningHubBuilt: false };

export interface BestRecord {
  stars: number;
  wastePerMeal: number | null;
}

export interface LastRound {
  scenarioId: string;
  hotMeals: number;
  attendance: number;
  wastePerMeal: number | null;
}

export const DEFAULT_POLICY: KitchenPolicy = { portionsPrepared: 125, offerSmallServings: false };

export function defaultSave(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: { motion: "system", quality: "sharp" },
    onboardingDone: false,
    scenarioId: DEFAULT_SCENARIO_ID,
    draft: { voice: { ...NO_VOICE }, policy: { ...DEFAULT_POLICY } },
    progress: { credits: REWARDS.startingCredits, ledger: EMPTY_LEDGER, best: {}, last: null, campus: { ...DEFAULT_CAMPUS } },
    mission: { ...DEFAULT_MISSION },
  };
}

export type LoadStatus = "fresh" | "loaded" | "repaired" | "unreadable" | "obsolete" | "unavailable";

export interface LoadResult {
  data: SaveData;
  status: LoadStatus;
  storageAvailable: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates parsed save data field by field. Invalid or out-of-range fields
 * fall back to defaults instead of discarding the whole save.
 */
export function validateSave(raw: unknown): { data: SaveData; repaired: boolean } | null {
  if (!isRecord(raw) || raw.schemaVersion !== SAVE_SCHEMA_VERSION) return null;
  const d = defaultSave();
  let repaired = false;
  const fix = <T>(ok: boolean, value: T, fallback: T): T => {
    if (!ok) repaired = true;
    return ok ? value : fallback;
  };

  const settings = isRecord(raw.settings) ? raw.settings : {};
  const motion = settings.motion;
  const quality = settings.quality;
  const out: SaveData = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: {
      motion: fix(motion === "system" || motion === "reduce" || motion === "full", motion as MotionSetting, d.settings.motion),
      quality: fix(quality === "sharp" || quality === "performance", quality as QualitySetting, d.settings.quality),
    },
    onboardingDone: fix(typeof raw.onboardingDone === "boolean", raw.onboardingDone as boolean, false),
    scenarioId: fix(
      typeof raw.scenarioId === "string" && !!findScenarioDefinition(raw.scenarioId),
      raw.scenarioId as string,
      d.scenarioId,
    ),
    draft: d.draft,
    progress: d.progress,
    mission: d.mission,
  };

  const draft = isRecord(raw.draft) ? raw.draft : {};
  const voice = isRecord(draft.voice) ? draft.voice : null;
  const voiceOk =
    !!voice &&
    typeof voice.rsvp === "boolean" &&
    typeof voice.smallPlease === "boolean" &&
    typeof voice.feedback === "boolean" &&
    voiceTokensUsed(voice as unknown as StudentVoice) <= BALANCE.maxStudentVoiceTokens;
  const policy = isRecord(draft.policy) ? draft.policy : null;
  const policyOk =
    !!policy &&
    typeof policy.offerSmallServings === "boolean" &&
    typeof policy.portionsPrepared === "number" &&
    sanitizePortions(policy.portionsPrepared) === policy.portionsPrepared;
  out.draft = {
    voice: fix(
      voiceOk,
      voiceOk
        ? {
            rsvp: voice!.rsvp as boolean,
            smallPlease: voice!.smallPlease as boolean,
            feedback: voice!.feedback as boolean,
          }
        : d.draft.voice,
      d.draft.voice,
    ),
    policy: fix(
      policyOk,
      policyOk
        ? {
            portionsPrepared: policy!.portionsPrepared as number,
            offerSmallServings: policy!.offerSmallServings as boolean,
          }
        : d.draft.policy,
      d.draft.policy,
    ),
  };

  const progress = isRecord(raw.progress) ? raw.progress : {};
  const credits = progress.credits;
  const ledger = validateLedger(progress.ledger);
  out.progress = {
    credits: fix(
      typeof credits === "number" && Number.isInteger(credits) && credits >= 0 && credits <= 1_000_000,
      credits as number,
      d.progress.credits,
    ),
    ledger: fix(ledger !== null, ledger ?? EMPTY_LEDGER, EMPTY_LEDGER),
    // Added after the first build: absent is normal, malformed is repaired.
    best: progress.best === undefined ? {} : fix(validBest(progress.best), progress.best as Record<string, BestRecord>, {}),
    last: progress.last === undefined || progress.last === null ? null : fix(validLast(progress.last), progress.last as LastRound, null),
    campus: progress.campus === undefined ? { ...DEFAULT_CAMPUS } : fix(validCampus(progress.campus), progress.campus as CampusState, { ...DEFAULT_CAMPUS }),
  };

  // Added in Phase 3: absent is normal; each record is checked on its own.
  if (raw.mission !== undefined) {
    const mission = isRecord(raw.mission) ? raw.mission : {};
    const record = (v: unknown, source: "school" | "demo") =>
      v === undefined || v === null ? null : fix(validAuditRecord(v, source), v as AuditRecord, null);
    out.mission = { school: record(mission.school, "school"), demo: record(mission.demo, "demo") };
    if (!isRecord(raw.mission)) repaired = true;
  }

  return { data: out, repaired };
}

const finiteOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

function validBest(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  return Object.values(raw).every(
    (b) => isRecord(b) && typeof b.stars === "number" && b.stars >= 0 && b.stars <= 3 && finiteOrNull(b.wastePerMeal),
  );
}

function validCampus(raw: unknown): boolean {
  return (
    isRecord(raw) &&
    typeof raw.planningHubUnlocked === "boolean" &&
    typeof raw.planningHubBuilt === "boolean" &&
    // A built hub must have been unlocked first.
    (!raw.planningHubBuilt || raw.planningHubUnlocked)
  );
}

function validLast(raw: unknown): boolean {
  return (
    isRecord(raw) &&
    typeof raw.scenarioId === "string" &&
    typeof raw.hotMeals === "number" &&
    typeof raw.attendance === "number" &&
    raw.hotMeals >= 0 &&
    raw.hotMeals <= raw.attendance &&
    finiteOrNull(raw.wastePerMeal)
  );
}

function validateLedger(raw: unknown): RewardLedger | null {
  if (!isRecord(raw) || !isRecord(raw.scenarios)) return null;
  const scenarios: Record<string, ScenarioLedgerEntry> = {};
  for (const [id, entry] of Object.entries(raw.scenarios)) {
    if (
      !isRecord(entry) ||
      typeof entry.bestCreditedValue !== "number" ||
      !Number.isFinite(entry.bestCreditedValue) ||
      entry.bestCreditedValue < 0 ||
      !Array.isArray(entry.creditedAttemptIds) ||
      !entry.creditedAttemptIds.every((a) => typeof a === "string")
    ) {
      return null;
    }
    scenarios[id] = {
      bestCreditedValue: entry.bestCreditedValue,
      creditedAttemptIds: (entry.creditedAttemptIds as string[]).slice(-REWARDS.attemptHistoryLimit),
    };
  }
  return { scenarios };
}

/** Minimal storage interface so tests can supply a fake. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function getBrowserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSave(storage: StorageLike | null): LoadResult {
  if (!storage) return { data: defaultSave(), status: "unavailable", storageAvailable: false };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { data: defaultSave(), status: "unavailable", storageAvailable: false };
  }
  if (text === null) return { data: defaultSave(), status: "fresh", storageAvailable: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    backupUnreadable(storage, text);
    return { data: defaultSave(), status: "unreadable", storageAvailable: true };
  }
  if (isRecord(parsed) && parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    // No older schema exists yet, so there is nothing to migrate from.
    backupUnreadable(storage, text);
    return { data: defaultSave(), status: "obsolete", storageAvailable: true };
  }
  const validated = validateSave(parsed);
  if (!validated) {
    backupUnreadable(storage, text);
    return { data: defaultSave(), status: "unreadable", storageAvailable: true };
  }
  return {
    data: validated.data,
    status: validated.repaired ? "repaired" : "loaded",
    storageAvailable: true,
  };
}

/** Best-effort backup of unreadable data. Failure here must never block recovery. */
function backupUnreadable(storage: StorageLike, text: string) {
  try {
    storage.setItem(CORRUPT_BACKUP_KEY, text.slice(0, 50_000));
  } catch {
    // Storage full or blocked: continue with a fresh save anyway.
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Removes every EcoRise key and nothing else. */
export function clearEcoRiseData(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
    return true;
  } catch {
    return false;
  }
}

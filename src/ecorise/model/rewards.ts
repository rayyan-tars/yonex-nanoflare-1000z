import { REWARDS } from "./config";
import type { ServiceResult } from "./types";

export type RoundOutcome = "success" | "missed-target" | "no-diners";

export interface RoundEvaluation {
  outcome: RoundOutcome;
  /** Credits this performance is worth before replay rules are applied. */
  value: number;
  efficiencyBonus: number;
  /** Only a successful service unlocks the next day (future step). */
  unlocksNextScenario: boolean;
}

/**
 * Scores one service. Underfeeding is never profitable: a service below the
 * hot-meal target earns only the small support value, however little food
 * it wasted, and the efficiency bonus applies only after the target is met.
 */
export function evaluateRound(result: ServiceResult): RoundEvaluation {
  if (result.attendance === 0 || result.hotMealShare === null) {
    return { outcome: "no-diners", value: 0, efficiencyBonus: 0, unlocksNextScenario: false };
  }
  if (result.hotMealShare < REWARDS.successHotMealShare) {
    return {
      outcome: "missed-target",
      value: REWARDS.missedTargetSupport,
      efficiencyBonus: 0,
      unlocksNextScenario: false,
    };
  }
  const efficiencyBonus = efficiencyBonusFor(result.foodUseShare);
  return {
    outcome: "success",
    value: REWARDS.successBase + efficiencyBonus,
    efficiencyBonus,
    unlocksNextScenario: true,
  };
}

function efficiencyBonusFor(foodUseShare: number | null): number {
  if (foodUseShare === null || !Number.isFinite(foodUseShare)) return 0;
  const span = REWARDS.bonusFullAtFoodUse - REWARDS.bonusStartsAtFoodUse;
  const t = (foodUseShare - REWARDS.bonusStartsAtFoodUse) / span;
  const clamped = Math.min(1, Math.max(0, t));
  return Math.round(REWARDS.maxEfficiencyBonus * clamped);
}

export interface ScenarioLedgerEntry {
  /** Highest round value already paid out for this scenario. */
  bestCreditedValue: number;
  /** Attempt IDs already processed (most recent last, bounded). */
  creditedAttemptIds: string[];
}

export interface RewardLedger {
  scenarios: Record<string, ScenarioLedgerEntry>;
}

export const EMPTY_LEDGER: RewardLedger = { scenarios: {} };

export type CreditReason = "improvement" | "no-improvement" | "duplicate-attempt" | "invalid";

export interface CreditResult {
  ledger: RewardLedger;
  credited: number;
  reason: CreditReason;
}

/**
 * Pays only the improvement over the best value already credited for the
 * scenario, and never pays the same attempt twice. The total ever credited
 * for a scenario therefore equals the best single performance, no matter how
 * many attempts (failed or successful) came before it.
 *
 * Returns a new ledger; the input is never mutated. The caller must persist
 * the returned ledger together with the credited amount.
 */
export function creditAttempt(
  ledger: RewardLedger,
  attempt: { scenarioId: string; attemptId: string; value: number },
): CreditResult {
  const { scenarioId, attemptId, value } = attempt;
  if (!scenarioId || !attemptId || !Number.isFinite(value) || value < 0) {
    return { ledger, credited: 0, reason: "invalid" };
  }
  const entry = ledger.scenarios[scenarioId] ?? { bestCreditedValue: 0, creditedAttemptIds: [] };
  if (entry.creditedAttemptIds.includes(attemptId)) {
    return { ledger, credited: 0, reason: "duplicate-attempt" };
  }
  const credited = Math.max(0, Math.floor(value) - entry.bestCreditedValue);
  const nextEntry: ScenarioLedgerEntry = {
    bestCreditedValue: entry.bestCreditedValue + credited,
    creditedAttemptIds: [...entry.creditedAttemptIds, attemptId].slice(-REWARDS.attemptHistoryLimit),
  };
  return {
    ledger: { scenarios: { ...ledger.scenarios, [scenarioId]: nextEntry } },
    credited,
    reason: credited > 0 ? "improvement" : "no-improvement",
  };
}

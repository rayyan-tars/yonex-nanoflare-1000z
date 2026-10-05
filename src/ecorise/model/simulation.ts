import { APPETITE_UNITS, BALANCE, SERVING_UNITS } from "./config";
import type {
  KitchenPolicy,
  Scenario,
  ServiceResult,
  ServingOutcome,
  StudentVoice,
  Upgrades,
} from "./types";

/** Clamps a requested cooking quantity to a whole number within limits. */
export function sanitizePortions(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(BALANCE.maxPortionsPrepared, Math.max(0, Math.round(n)));
}

/** Diners the counter(s) can serve before the lunch window closes. */
export function servingCapacity(offerSmallServings: boolean, upgrades: Upgrades): number {
  const perCounter = offerSmallServings
    ? BALANCE.servingRateTenthsPerMinute.withSmallOption
    : BALANCE.servingRateTenthsPerMinute.standard;
  const multiplier = upgrades.secondCounter ? BALANCE.secondCounterRateMultiplier : 1;
  return Math.floor((BALANCE.lunchWindowMinutes * perCounter * multiplier) / 10);
}

/** Chance that a small-appetite diner asks for a small serving (when offered). */
export function askRate(voice: Pick<StudentVoice, "smallPlease">): number {
  return voice.smallPlease ? BALANCE.askRate.withSmallPleaseReminder : BALANCE.askRate.baseline;
}

export interface ServiceInput {
  scenario: Scenario;
  policy: KitchenPolicy;
  voice: StudentVoice;
  upgrades: Upgrades;
}

/**
 * Runs one lunch service. Pure and deterministic: the same input always
 * gives the same result, independent of any animation or playback speed.
 *
 * Model rules (simplifications, not claims about real students):
 * - Diners are served in the scenario's fixed queue order.
 * - Once the counter has served `servingCapacity` diners, the window has
 *   closed and everyone still queuing misses the hot meal ("missed-time").
 * - A diner asks for a small serving only if the kitchen offers small
 *   servings, the diner has a small appetite, and their fixed ask
 *   propensity is below the current ask rate. Everyone else asks for regular.
 * - No partial servings. If the food left is less than the serving a diner
 *   asks for, that diner misses the hot meal ("missed-food"). A later diner
 *   asking for a small serving can still be served from what is left.
 * - Each diner eats up to their appetite; the rest of the serving is plate waste.
 * - No seconds, no batch cooking, no reuse of leftovers. Preparation
 *   scraps and spoilage are outside the model.
 */
export function runService({ scenario, policy, voice, upgrades }: ServiceInput): ServiceResult {
  const prepared = sanitizePortions(policy.portionsPrepared) * SERVING_UNITS.regular;
  const capacity = servingCapacity(policy.offerSmallServings, upgrades);
  const rate = askRate(voice);

  let remaining = prepared;
  let served = 0;
  let eaten = 0;
  let hotMeals = 0;
  let smallServings = 0;
  let missedFood = 0;
  let missedTime = 0;
  const outcomes: ServingOutcome[] = [];

  for (const diner of scenario.diners) {
    if (hotMeals >= capacity) {
      missedTime++;
      outcomes.push("missed-time");
      continue;
    }
    const wantsSmall =
      policy.offerSmallServings && diner.appetite === "small" && diner.askPropensity < rate;
    const serving = wantsSmall ? SERVING_UNITS.small : SERVING_UNITS.regular;
    if (remaining < serving) {
      missedFood++;
      outcomes.push("missed-food");
      continue;
    }
    remaining -= serving;
    served += serving;
    eaten += Math.min(serving, APPETITE_UNITS[diner.appetite]);
    hotMeals++;
    if (wantsSmall) smallServings++;
    outcomes.push(wantsSmall ? "small" : "regular");
  }

  const attendance = scenario.diners.length;
  return {
    attendance,
    hotMeals,
    missedBecauseFoodRanOut: missedFood,
    missedBecauseServiceTimeEnded: missedTime,
    smallServings,
    regularServings: hotMeals - smallServings,
    servingCapacity: capacity,
    food: {
      prepared,
      served,
      unserved: prepared - served,
      eaten,
      plateWaste: served - eaten,
    },
    hotMealShare: attendance === 0 ? null : hotMeals / attendance,
    foodUseShare: prepared === 0 ? null : eaten / prepared,
    outcomes,
  };
}

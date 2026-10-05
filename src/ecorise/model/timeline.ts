import { APPETITE_UNITS, BALANCE, SERVING_UNITS } from "./config";
import type { Scenario, ServiceResult, ServingOutcome, Upgrades } from "./types";

/** Cumulative state after each diner in queue order. Food in integer units. */
export interface TimelineStep {
  outcome: ServingOutcome;
  /** Minutes after the hatch opened when this diner was handled. */
  minute: number;
  served: number;
  missedFood: number;
  missedTime: number;
  foodLeft: number;
  plateWaste: number;
  smallServings: number;
}

export interface ServiceTimeline {
  steps: TimelineStep[];
  windowMinutes: number;
  /** Index of the first diner turned away because the food ran out. */
  foodRanOutAt: number | null;
  /** Index of the first diner still queuing when the lunch window closed. */
  windowClosedAt: number | null;
  /** Minute the last diner was handled. */
  endMinute: number;
}

/**
 * Expands a finished service result into a per-diner timeline for playback.
 * It never re-decides anything: outcomes come from `result.outcomes`, so the
 * animation can only show what the simulation already computed.
 */
export function buildTimeline(
  scenario: Scenario,
  result: ServiceResult,
  offerSmallServings: boolean,
  upgrades: Upgrades,
): ServiceTimeline {
  const perCounter = offerSmallServings
    ? BALANCE.servingRateTenthsPerMinute.withSmallOption
    : BALANCE.servingRateTenthsPerMinute.standard;
  const multiplier = upgrades.secondCounter ? BALANCE.secondCounterRateMultiplier : 1;
  const perMinute = (perCounter * multiplier) / 10;
  const window = BALANCE.lunchWindowMinutes;

  const steps: TimelineStep[] = [];
  let served = 0;
  let missedFood = 0;
  let missedTime = 0;
  let foodLeft = result.food.prepared;
  let plateWaste = 0;
  let small = 0;
  let minute = 0;
  let foodRanOutAt: number | null = null;
  let windowClosedAt: number | null = null;

  result.outcomes.forEach((outcome, i) => {
    const diner = scenario.diners[i];
    if (outcome === "regular" || outcome === "small") {
      const serving = outcome === "small" ? SERVING_UNITS.small : SERVING_UNITS.regular;
      served++;
      if (outcome === "small") small++;
      foodLeft -= serving;
      plateWaste += serving - Math.min(serving, APPETITE_UNITS[diner.appetite]);
      minute = served / perMinute;
    } else if (outcome === "missed-food") {
      missedFood++;
      if (foodRanOutAt === null) foodRanOutAt = i;
    } else {
      missedTime++;
      if (windowClosedAt === null) windowClosedAt = i;
      minute = window;
    }
    steps.push({ outcome, minute, served, missedFood, missedTime, foodLeft, plateWaste, smallServings: small });
  });

  return { steps, windowMinutes: window, foodRanOutAt, windowClosedAt, endMinute: minute };
}

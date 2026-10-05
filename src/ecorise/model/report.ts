import { BALANCE, REWARDS, UNITS_PER_PORTION } from "./config";
import { NO_VOICE, forecastRange, type ForecastRange } from "./planning";
import { evaluateRound, type RoundEvaluation } from "./rewards";
import { runService, sanitizePortions } from "./simulation";
import { buildTimeline, type ServiceTimeline } from "./timeline";
import type { KitchenPolicy, Scenario, ServiceResult, StudentVoice, Upgrades } from "./types";
import { NO_UPGRADES } from "./types";

export interface RoundPlan {
  voice: StudentVoice;
  policy: KitchenPolicy;
  upgrades: Upgrades;
}

/** Waste in portions (one decimal place at most, from integer food units). */
export interface WasteSummary {
  /** Cooked but never served. Thrown away in this model. */
  surplus: number;
  /** Served but left on plates. */
  plateWaste: number;
  /** Surplus thrown away + plate waste. */
  avoidable: number;
  /** Avoidable waste ÷ hot meals served, or null when no meals were served. */
  perMeal: number | null;
}

export interface OutcomeSummary {
  plan: RoundPlan;
  result: ServiceResult;
  waste: WasteSummary;
  /** At least the success share of diners got a hot meal. */
  fed: boolean;
}

export interface Stars {
  fed: boolean;
  lowWaste: boolean;
  beatBaseline: boolean;
  count: number;
}

export interface RoundReport {
  scenarioId: string;
  /** The forecast the player saw when planning. */
  forecast: ForecastRange;
  player: OutcomeSummary;
  /** Same diners, no student input, regular servings, cooked to the top of the broad forecast. */
  baseline: OutcomeSummary;
  /** Fewest avoidable waste portions any plan could reach today while feeding everyone. */
  bestPossible: OutcomeSummary;
  /** Low-waste star threshold, in portions per meal. */
  lowWasteTarget: number;
  /** Portions of avoidable waste prevented relative to the baseline (negative = more waste). */
  prevented: number;
  /** Percentage less avoidable waste than the baseline, or null when the baseline wasted nothing. */
  percentLess: number | null;
  stars: Stars;
  evaluation: RoundEvaluation;
  timeline: ServiceTimeline;
  insight: string;
}

const portions = (units: number) => Math.round(units) / UNITS_PER_PORTION;

export function summarise(scenario: Scenario, plan: RoundPlan): OutcomeSummary {
  const result = runService({ scenario, ...plan });
  const surplus = result.food.unserved;
  const plate = result.food.plateWaste;
  const avoidable = surplus + plate;
  return {
    plan,
    result,
    waste: {
      surplus: portions(surplus),
      plateWaste: portions(plate),
      avoidable: portions(avoidable),
      perMeal: result.hotMeals === 0 ? null : avoidable / UNITS_PER_PORTION / result.hotMeals,
    },
    fed: result.hotMealShare !== null && result.hotMealShare >= REWARDS.successHotMealShare,
  };
}

/**
 * "Business as usual": a kitchen with no student input, regular servings
 * only, cooking to the top of the broad forecast so nobody goes without.
 * Uses the same seeded diners as the player's round.
 */
export function businessAsUsualPlan(scenario: Scenario): RoundPlan {
  const broad = forecastRange(scenario, { rsvp: false, planningOffice: false });
  return {
    voice: NO_VOICE,
    policy: { portionsPrepared: broad.high, offerSmallServings: false },
    upgrades: NO_UPGRADES,
  };
}

/**
 * The least avoidable waste reachable today with perfect information:
 * every cooking quantity, with and without small servings, with students
 * reminded to ask. Plans that feed everyone are preferred; if none can
 * (the queue is too slow), plans meeting the success share are used.
 */
export function bestPossible(scenario: Scenario, upgrades: Upgrades): OutcomeSummary {
  let bestAll: OutcomeSummary | null = null;
  let bestFed: OutcomeSummary | null = null;
  const voice: StudentVoice = { rsvp: true, smallPlease: true, feedback: true };
  const upper = Math.min(BALANCE.maxPortionsPrepared, scenario.actualAttendance + 5);
  for (let p = 0; p <= upper; p++) {
    for (const offerSmallServings of [false, true]) {
      const s = summarise(scenario, { voice, policy: { portionsPrepared: p, offerSmallServings }, upgrades });
      if (!s.fed) continue;
      const better = (cur: OutcomeSummary | null) => !cur || s.waste.avoidable < cur.waste.avoidable;
      if (s.result.hotMeals === s.result.attendance && better(bestAll)) bestAll = s;
      if (better(bestFed)) bestFed = s;
    }
  }
  return bestAll ?? bestFed ?? summarise(scenario, businessAsUsualPlan(scenario));
}

export function computeRoundReport(scenario: Scenario, plan: RoundPlan): RoundReport {
  const cleanPlan: RoundPlan = {
    ...plan,
    policy: { ...plan.policy, portionsPrepared: sanitizePortions(plan.policy.portionsPrepared) },
  };
  const player = summarise(scenario, cleanPlan);
  const baseline = summarise(scenario, businessAsUsualPlan(scenario));
  const best = bestPossible(scenario, cleanPlan.upgrades);

  // Low waste = at least halfway from business as usual to the best possible plan.
  const basePerMeal = baseline.waste.perMeal ?? 0;
  const bestPerMeal = best.waste.perMeal ?? 0;
  const lowWasteTarget = (basePerMeal + Math.min(basePerMeal, bestPerMeal)) / 2;

  const fed = player.fed;
  const perMeal = player.waste.perMeal;
  const lowWaste = fed && perMeal !== null && perMeal <= lowWasteTarget + 1e-9;
  const beatBaseline = fed && (!baseline.fed || player.waste.avoidable < baseline.waste.avoidable);
  const stars: Stars = { fed, lowWaste, beatBaseline, count: [fed, lowWaste, beatBaseline].filter(Boolean).length };

  const prevented = Math.round((baseline.waste.avoidable - player.waste.avoidable) * 10) / 10;
  const percentLess =
    baseline.waste.avoidable > 0 ? Math.round((prevented / baseline.waste.avoidable) * 100) : null;

  const forecast = forecastRange(scenario, {
    rsvp: cleanPlan.voice.rsvp,
    planningOffice: cleanPlan.upgrades.planningOffice,
  });

  const report: Omit<RoundReport, "insight"> = {
    scenarioId: scenario.definition.id,
    forecast,
    player,
    baseline,
    bestPossible: best,
    lowWasteTarget,
    prevented,
    percentLess,
    stars,
    evaluation: evaluateRound(player.result),
    timeline: buildTimeline(scenario, player.result, cleanPlan.policy.offerSmallServings, cleanPlan.upgrades),
  };
  return { ...report, insight: insightFor(report) };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One learning statement, chosen from what actually happened this round. */
export function insightFor(r: Omit<RoundReport, "insight">): string {
  const { player, forecast, baseline } = r;
  const res = player.result;
  const { voice, policy } = player.plan;
  const missed = res.missedBecauseFoodRanOut + res.missedBecauseServiceTimeEnded;

  if (!player.fed) {
    if (res.missedBecauseFoodRanOut >= res.missedBecauseServiceTimeEnded) {
      return `${missed} students missed lunch because the food ran out. Wasting less only counts when the kitchen still feeds everyone who comes${
        voice.rsvp ? "." : ". RSVP replies would have shown how many were coming."
      }`;
    }
    return `${missed} students were still queuing when lunch ended. Small servings take longer to serve, so the counter could not reach everyone in time.`;
  }

  const surplus = player.waste.surplus;
  const plate = player.waste.plateWaste;
  if (r.stars.count === 3) {
    return `Everyone got a hot meal and only ${fmt(player.waste.avoidable)} portions were wasted. Student information let the kitchen cook close to real demand.`;
  }
  if (policy.offerSmallServings && res.smallServings > 0 && policy.portionsPrepared >= baseline.plan.policy.portionsPrepared - 2) {
    return `Small servings cut plate waste, but the kitchen cooked as much as usual, so the saved food stayed in the pots. When students take less, the kitchen can cook less.`;
  }
  if (surplus >= plate && surplus >= 5) {
    if (policy.portionsPrepared > forecast.high) {
      return `You cooked ${fmt(surplus)} portions that were never served, more than even the top of the forecast (${forecast.high}) could eat.`;
    }
    if (!voice.rsvp) {
      return `You cooked ${fmt(surplus)} portions that were never served. The forecast was wide (${forecast.low}–${forecast.high}); RSVP replies would have let the kitchen cook closer to real demand.`;
    }
    return `${fmt(surplus)} portions were never served, even with RSVP's narrower forecast (${forecast.low}–${forecast.high}). The kitchen could cook a little closer to the middle of the range.`;
  }
  if (plate >= 5) {
    if (!policy.offerSmallServings) {
      return `${fmt(plate)} portions came back on plates. Offering small servings lets students who want less take less, and lets the kitchen cook less.`;
    }
    if (!voice.smallPlease) {
      return `${fmt(plate)} portions came back on plates. Small servings were on offer, but many students who wanted less didn't ask; a "Small, please" reminder helps.`;
    }
  }
  return `Everyone got a hot meal. Better information and cooking closer to demand would cut the remaining ${fmt(player.waste.avoidable)} portions of waste.`;
}

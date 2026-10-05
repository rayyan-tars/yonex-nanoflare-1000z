import { BALANCE } from "./config";
import { askRate, sanitizePortions, servingCapacity } from "./simulation";
import type { KitchenPolicy, Scenario, StudentVoice, StudentVoiceAction, Upgrades } from "./types";

export interface ForecastRange {
  low: number;
  high: number;
  /** Which information produced this range. */
  basis: "estimate" | "rsvp";
  planningOffice: boolean;
}

/**
 * The attendance range the player sees. Game simplification: the true
 * attendance is always inside the range. Better information only narrows the
 * range around the same fixed truth; it never changes who comes to lunch.
 */
export function forecastRange(
  scenario: Scenario,
  info: { rsvp: boolean; planningOffice: boolean },
): ForecastRange {
  let half: number = info.rsvp ? BALANCE.forecastHalfWidth.withRsvp : BALANCE.forecastHalfWidth.base;
  if (info.planningOffice) {
    half = Math.max(2, Math.round(half * BALANCE.planningOfficeRangeMultiplier));
  }
  const width = half * 2;
  const offset = Math.round(scenario.forecastAnchor * width);
  const low = Math.max(0, scenario.actualAttendance - offset);
  return {
    low,
    high: low + width,
    basis: info.rsvp ? "rsvp" : "estimate",
    planningOffice: info.planningOffice,
  };
}

/** Feedback Box reveal: share of today's diners for whom a regular serving is too much. */
export function feedbackReveal(scenario: Scenario): { portionTooBigPercent: number } {
  const n = scenario.diners.length;
  if (n === 0) return { portionTooBigPercent: 0 };
  const small = scenario.diners.filter((d) => d.appetite === "small").length;
  return { portionTooBigPercent: Math.round(((small / n) * 100) / 5) * 5 };
}

export type Cooperation = "both" | "kitchen-only" | "students-only" | "neither";

export interface PlanningView {
  forecast: ForecastRange;
  feedback: { portionTooBigPercent: number } | null;
  capacity: number;
  /** Capacity if the small-serving option were toggled the other way. */
  capacityIfToggled: number;
  askRatePercent: number;
  cooperation: Cooperation;
  portions: number;
  /** Food check assumes every diner takes a regular serving (worst case). */
  foodCoversForecastHigh: boolean;
  foodCoversForecastLow: boolean;
  capacityCoversForecastHigh: boolean;
}

/** Everything the planning panel shows, derived only from information the player has. */
export function planningView(
  scenario: Scenario,
  voice: StudentVoice,
  policy: KitchenPolicy,
  upgrades: Upgrades,
): PlanningView {
  const forecast = forecastRange(scenario, {
    rsvp: voice.rsvp,
    planningOffice: upgrades.planningOffice,
  });
  const capacity = servingCapacity(policy.offerSmallServings, upgrades);
  const portions = sanitizePortions(policy.portionsPrepared);
  const cooperation: Cooperation =
    policy.offerSmallServings && voice.smallPlease
      ? "both"
      : policy.offerSmallServings
        ? "kitchen-only"
        : voice.smallPlease
          ? "students-only"
          : "neither";
  return {
    forecast,
    feedback: voice.feedback ? feedbackReveal(scenario) : null,
    capacity,
    capacityIfToggled: servingCapacity(!policy.offerSmallServings, upgrades),
    askRatePercent: Math.round(askRate(voice) * 100),
    cooperation,
    portions,
    foodCoversForecastHigh: portions >= forecast.high,
    foodCoversForecastLow: portions >= forecast.low,
    capacityCoversForecastHigh: capacity >= forecast.high,
  };
}

export const NO_VOICE: StudentVoice = Object.freeze({
  rsvp: false,
  smallPlease: false,
  feedback: false,
});

export function voiceTokensUsed(voice: StudentVoice): number {
  return (voice.rsvp ? 1 : 0) + (voice.smallPlease ? 1 : 0) + (voice.feedback ? 1 : 0);
}

/**
 * Toggles one Student Voice action. Deselecting always works; selecting a
 * third action is rejected so the token limit cannot be exceeded.
 */
export function toggleVoiceAction(
  voice: StudentVoice,
  action: StudentVoiceAction,
): { voice: StudentVoice; rejected: "token-limit" | null } {
  if (voice[action]) return { voice: { ...voice, [action]: false }, rejected: null };
  if (voiceTokensUsed(voice) >= BALANCE.maxStudentVoiceTokens) {
    return { voice, rejected: "token-limit" };
  }
  return { voice: { ...voice, [action]: true }, rejected: null };
}

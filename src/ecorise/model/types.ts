export type Appetite = "regular" | "small";

/** One simulated diner. Fixed by the scenario seed; never changed by player choices. */
export interface Diner {
  appetite: Appetite;
  /**
   * Fixed per-diner value in [0, 1). A small-appetite diner asks for a small
   * serving when this is below the current ask rate, so a stronger reminder
   * only ever adds askers; it never reshuffles who they are.
   */
  askPropensity: number;
}

export interface ScenarioDefinition {
  id: string;
  seed: number;
  dayLabel: string;
  dish: string;
  /** Inclusive range the true attendance is drawn from. */
  attendanceRange: readonly [number, number];
  /** Probability that a generated diner has a small appetite (provisional). */
  smallAppetiteChance: number;
  /** Short fictional scenario briefing. */
  briefing: string;
}

/** A generated scenario. Everything here is decided once, from the seed. */
export interface Scenario {
  definition: ScenarioDefinition;
  actualAttendance: number;
  /** Diners in queue order. Length === actualAttendance. */
  diners: readonly Diner[];
  /**
   * Where the true attendance sits inside any forecast range, in [0, 1).
   * Fixed by the seed so better information narrows the range around the
   * same truth instead of moving it.
   */
  forecastAnchor: number;
}

export interface StudentVoice {
  rsvp: boolean;
  smallPlease: boolean;
  feedback: boolean;
}

export type StudentVoiceAction = keyof StudentVoice;

export interface KitchenPolicy {
  /** Whole regular-portion equivalents cooked before service. */
  portionsPrepared: number;
  offerSmallServings: boolean;
}

export interface Upgrades {
  planningOffice: boolean;
  secondCounter: boolean;
}

export const NO_UPGRADES: Upgrades = Object.freeze({
  planningOffice: false,
  secondCounter: false,
});

export type ServingOutcome = "regular" | "small" | "missed-food" | "missed-time";

export interface FoodAccount {
  /** All quantities are integer food units (10 = one regular portion). */
  prepared: number;
  served: number;
  unserved: number;
  eaten: number;
  plateWaste: number;
}

export interface ServiceResult {
  attendance: number;
  hotMeals: number;
  missedBecauseFoodRanOut: number;
  missedBecauseServiceTimeEnded: number;
  smallServings: number;
  regularServings: number;
  /** Most diners the counter(s) can serve before the lunch window closes. */
  servingCapacity: number;
  food: FoodAccount;
  /** hotMeals ÷ attendance, or null when nobody attended. */
  hotMealShare: number | null;
  /** eaten ÷ prepared, or null when nothing was prepared. */
  foodUseShare: number | null;
  /** One entry per diner in queue order, for later playback. */
  outcomes: readonly ServingOutcome[];
}

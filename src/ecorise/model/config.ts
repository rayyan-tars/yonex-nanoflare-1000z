/**
 * Provisional game-balancing assumptions for EcoRise.
 *
 * None of these numbers are research findings. They were chosen so the
 * trade-offs are visible and fair in a short round. The "About the
 * simulation" view in the interface explains this to players.
 */

/**
 * Food is tracked in integer "food units": one regular portion = 10 units.
 * Integers avoid floating-point drift when small (0.6) servings are mixed
 * with regular (1.0) servings.
 */
export const UNITS_PER_PORTION = 10;

export const SERVING_UNITS = {
  regular: 10,
  small: 6,
} as const;

/** How much of a serving a simulated diner of each appetite type eats. */
export const APPETITE_UNITS = {
  regular: 10,
  small: 6,
} as const;

export const BALANCE = {
  lunchWindowMinutes: 20,
  /** Diners served per minute per counter, in tenths (66 = 6.6 per minute). */
  servingRateTenthsPerMinute: {
    standard: 66,
    withSmallOption: 61,
  },
  /** Serving-rate multiplier once the Second Counter is built (future step). */
  secondCounterRateMultiplier: 1.5,
  /** Chance that a small-appetite diner asks for a small serving when offered. */
  askRate: {
    baseline: 0.4,
    withSmallPleaseReminder: 0.8,
  },
  /** Half-width of the attendance forecast range, in students. */
  forecastHalfWidth: {
    base: 15,
    withRsvp: 6,
  },
  /** Planning Office (future step) narrows whatever range would be shown. */
  planningOfficeRangeMultiplier: 0.6,
  maxStudentVoiceTokens: 2,
  maxPortionsPrepared: 250,
} as const;

export const REWARDS = {
  /** Provisional success rule: at least this share of attendees got a hot meal. */
  successHotMealShare: 0.95,
  successBase: 10,
  maxEfficiencyBonus: 10,
  /** Food-use share (eaten ÷ prepared) where the bonus starts and where it is full. */
  bonusStartsAtFoodUse: 0.7,
  bonusFullAtFoodUse: 0.95,
  /** One-time support for a scenario that has not yet been completed. */
  missedTargetSupport: 3,
  startingCredits: 15,
  /** Remember at most this many attempt IDs per scenario. */
  attemptHistoryLimit: 50,
} as const;

export const BUILDING_COSTS = {
  planningOffice: 25,
  secondCounter: 25,
} as const;

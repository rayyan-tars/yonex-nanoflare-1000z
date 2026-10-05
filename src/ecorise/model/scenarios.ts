import { createRng } from "./rng";
import type { Diner, Scenario, ScenarioDefinition } from "./types";

/** Fictional scenario. Not based on any real school's data. */
export const MONDAY_STEW: ScenarioDefinition = {
  id: "day1-monday-stew",
  seed: 20261005,
  dayLabel: "Monday",
  dish: "Vegetable stew",
  attendanceRange: [110, 124],
  smallAppetiteChance: 0.32,
  briefing:
    "It's the first lunch of the week. The kitchen has to decide how much stew to cook before anyone arrives, and last week a lot of it came back on plates.",
};

export const SCENARIO_DEFINITIONS: readonly ScenarioDefinition[] = [MONDAY_STEW];

export const DEFAULT_SCENARIO_ID = MONDAY_STEW.id;

export function findScenarioDefinition(id: string): ScenarioDefinition | undefined {
  return SCENARIO_DEFINITIONS.find((d) => d.id === id);
}

/**
 * Generates a scenario from its seed. The same definition always produces the
 * same attendance, appetites, queue order and forecast anchor.
 */
export function generateScenario(definition: ScenarioDefinition): Scenario {
  const rng = createRng(definition.seed);
  const [min, max] = definition.attendanceRange;
  const actualAttendance = min + Math.floor(rng() * (max - min + 1));
  const forecastAnchor = rng();
  const diners: Diner[] = [];
  for (let i = 0; i < actualAttendance; i++) {
    const appetite = rng() < definition.smallAppetiteChance ? "small" : "regular";
    diners.push({ appetite, askPropensity: rng() });
  }
  return { definition, actualAttendance, diners, forecastAnchor };
}

const cache = new Map<string, Scenario>();

/** Memoised scenario lookup so re-renders never regenerate anything. */
export function getScenario(id: string): Scenario {
  const cached = cache.get(id);
  if (cached) return cached;
  const definition = findScenarioDefinition(id);
  if (!definition) throw new Error(`Unknown scenario: ${id}`);
  const scenario = generateScenario(definition);
  cache.set(id, scenario);
  return scenario;
}

/** Builds a scenario from explicit diners (used by tests and future custom days). */
export function scenarioFromDiners(
  diners: readonly Diner[],
  forecastAnchor = 0.5,
  definition: Partial<ScenarioDefinition> = {},
): Scenario {
  return {
    definition: { ...MONDAY_STEW, id: "custom", ...definition },
    actualAttendance: diners.length,
    diners,
    forecastAnchor,
  };
}

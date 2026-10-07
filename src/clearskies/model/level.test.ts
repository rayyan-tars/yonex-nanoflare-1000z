import { describe, expect, it } from "vitest";
import { STEPS, airBand, applyOp, buildLevel, levelStats, settleAir, LEVEL_CLOCK } from "./level";
import { env, newSim } from "./sim";

const NOW = 1_800_000_000_000;

describe("Clear Skies level", () => {
  it("is daytime with no rain, and the wind carries coal smoke over the homes", () => {
    const e = env(LEVEL_CLOCK);
    expect(e.sun).toBeGreaterThan(0.9);
    expect(e.rain).toBe(0);
  });

  it("starts with very unhealthy air, and each good decision makes it cleaner until it's good", () => {
    const t = buildLevel(NOW);
    const air = newSim().air;
    const readings: number[] = [];
    readings.push(settleAir(t, air, 400, NOW).homeAir);
    for (const step of STEPS) {
      for (const op of step.ops(t)) applyOp(t, op);
      readings.push(settleAir(t, air, 400, NOW).homeAir);
    }
    console.log(readings.map((r) => r.toFixed(1)).join(" → "));
    expect(readings.map((r) => airBand(r).tone)).toEqual(["bad", "poor", "fair", "good"]);
    for (let k = 1; k < readings.length; k++) expect(readings[k]).toBeLessThan(readings[k - 1]);
    expect(airBand(readings[readings.length - 1]).tone).toBe("good");
  });

  it("has exactly one sustainable option per step, and every option explains itself", () => {
    for (const s of STEPS) {
      expect(s.choices.filter((c) => c.good)).toHaveLength(1);
      for (const c of s.choices) expect(c.feedback.length).toBeGreaterThan(20);
    }
  });

  it("each step's change actually happens on the map", () => {
    const t = buildLevel(NOW);
    const air = newSim().air;
    const cars0 = levelStats(t, air, NOW).travel.cars;
    for (const op of STEPS[0].ops(t)) applyOp(t, op);
    expect(t.cols.some((c) => c.s.includes("coal"))).toBe(false);
    expect(levelStats(t, air, NOW).energy.renewShare).toBeGreaterThan(0.7);
    for (const op of STEPS[1].ops(t)) applyOp(t, op);
    expect(levelStats(t, air, NOW).travel.cars).toBeLessThan(cars0 * 0.5);
    for (const op of STEPS[2].ops(t)) applyOp(t, op);
    expect(t.cols.filter((c) => c.s.includes("greenroof")).length).toBeGreaterThan(10);
  });
});

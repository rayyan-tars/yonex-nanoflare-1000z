import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  DEFAULT_MISSIONS_SAVE,
  SCHOOL_TARGET,
  badges,
  completeMission,
  dailyMissions,
  dayKey,
  impact,
  newlyMet,
  schoolChallenge,
  streak,
  timelineYear,
  weekStart,
  type MissionsSave,
} from "./missions";

const done = (save: MissionsSave, id: string, day: string, photo?: string) => {
  const r = completeMission(save, id, day, photo);
  expect(r.refused).toBeNull();
  return r.save;
};

describe("daily missions", () => {
  it("are stable for a day and rotate the 2050 alert through all five areas", () => {
    expect(dailyMissions("2026-10-07")).toEqual(dailyMissions("2026-10-07"));
    const alerts = new Set(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => dailyMissions(d).alert));
    expect(alerts.size).toBe(5);
  });

  it("offer three small missions from three areas (including the alert's) and one bigger mission", () => {
    for (const day of ["2026-10-05", "2026-10-06", "2026-11-30"]) {
      const d = dailyMissions(day);
      expect(d.small).toHaveLength(3);
      expect(d.small.every((m) => m.size === "small")).toBe(true);
      expect(new Set(d.small.map((m) => m.category)).size).toBe(3);
      expect(d.small.map((m) => m.category)).toContain(d.alert);
      expect(d.big.size).toBe("big");
      expect(d.big.category).toBe(d.alert);
    }
  });
});

describe("completing missions", () => {
  it("counts a mission once per day, on trust for small missions", () => {
    let s = done(DEFAULT_MISSIONS_SAVE, "water-tap", "2026-10-07");
    expect(completeMission(s, "water-tap", "2026-10-07").refused).toBe("already");
    s = done(s, "water-tap", "2026-10-08");
    expect(s.completions).toHaveLength(2);
  });

  it("needs a photo for a bigger mission", () => {
    expect(completeMission(DEFAULT_MISSIONS_SAVE, "big-cleanup", "2026-10-07").refused).toBe("photo-needed");
    const s = done(DEFAULT_MISSIONS_SAVE, "big-cleanup", "2026-10-07", "data:image/jpeg;base64,AAA");
    expect(s.completions[0]).toMatchObject({ big: true, category: "waste" });
  });

  it("refuses unknown missions", () => {
    expect(completeMission(DEFAULT_MISSIONS_SAVE, "nope", "2026-10-07").refused).toBe("unknown");
  });
});

describe("streaks, timeline and badges", () => {
  it("counts consecutive days, allowing today to be still open", () => {
    let s = DEFAULT_MISSIONS_SAVE;
    for (const d of ["2026-10-04", "2026-10-05", "2026-10-06"]) s = done(s, "energy-light", d);
    expect(streak(s, "2026-10-06")).toBe(3);
    expect(streak(s, "2026-10-07")).toBe(3);
    expect(streak(s, "2026-10-08")).toBe(0);
  });

  it("moves through years instead of levels", () => {
    expect(timelineYear(0).year).toBe(2026);
    expect(timelineYear(3).year).toBe(2030);
    expect(timelineYear(39).year).toBe(2045);
    expect(timelineYear(40)).toMatchObject({ year: 2050, next: null });
  });

  it("earns badges only for real actions", () => {
    expect(badges(DEFAULT_MISSIONS_SAVE, "2026-10-07").some((b) => b.earned)).toBe(false);
    let s = DEFAULT_MISSIONS_SAVE;
    for (const id of ["water-tap", "energy-light", "waste-recycle", "food-finish", "transport-walk"]) s = done(s, id, "2026-10-07");
    const earned = badges(s, "2026-10-07").filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(expect.arrayContaining(["first", "all-five"]));
    expect(earned).not.toContain("photo");
  });
});

describe("school challenges", () => {
  it("add your real actions to a demo baseline, and are met by them", () => {
    let s = DEFAULT_MISSIONS_SAVE;
    expect(schoolChallenge(s, "water")).toMatchObject({ yours: 0, met: false, target: SCHOOL_TARGET });
    s = done(s, "water-tap", "2026-10-06");
    expect(schoolChallenge(s, "water").met).toBe(false);
    s = done(s, "water-tap", "2026-10-07");
    expect(schoolChallenge(s, "water")).toMatchObject({ yours: 2, met: true, total: SCHOOL_TARGET });
    expect(newlyMet(s)).toEqual(["water"]);
    expect(newlyMet({ ...s, cityChanged: ["water"] })).toEqual([]);
  });
});

describe("impact", () => {
  it("counts this week's actions by area and the last four weeks", () => {
    let s = DEFAULT_MISSIONS_SAVE;
    s = done(s, "water-tap", "2026-09-29");
    s = done(s, "water-tap", "2026-10-06");
    s = done(s, "food-finish", "2026-10-07");
    const i = impact(s, "2026-10-07");
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
    expect(i.thisWeek).toBe(2);
    expect(i.byCategory).toMatchObject({ water: 1, food: 1, energy: 0 });
    expect(i.weeks.map((w) => w.count)).toEqual([0, 0, 1, 2]);
    expect(i.activeDaysThisWeek).toBe(2);
    expect(Object.keys(i.byCategory)).toHaveLength(CATEGORIES.length);
  });

  it("uses local calendar days", () => {
    expect(dayKey(new Date(2026, 9, 7, 23, 30).getTime())).toBe("2026-10-07");
  });
});

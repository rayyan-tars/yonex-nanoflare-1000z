import { describe, expect, it } from "vitest";
import { stepsCompleted } from "../model/audit";
import { SAVE_KEY, defaultSave, loadSave, type StorageLike } from "./persistence";
import {
  NO_PLAYTEST_DATA,
  PLAYTEST_KEY,
  abandonSession,
  activeSession,
  addDemoSessions,
  emptyPlaytests,
  finishSession,
  formatDuration,
  loadPlaytests,
  recordFirstResults,
  recordRound,
  startSession,
  summarize,
  summaryText,
  validatePlaytests,
  type PlaytestRound,
} from "./playtest";
import { createEcoStore, sustainabilityFlagRaised } from "./store";

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const ROUND: PlaytestRound = {
  voice: { rsvp: true, smallPlease: false, feedback: false },
  portionsPrepared: 125,
  smallServings: false,
  everyoneFed: true,
  studentsFed: 118,
  attendance: 118,
  wastePortionsPerMeal: 0.06,
  stars: 2,
};
const ANSWERS = { goal: "Feed everyone, waste less", change: "Ask who is coming", clarity: 4 as const, playAgain: "yes" as const };

/** A fake clock that the test moves forward. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function freshStore(storage = new MemoryStorage(), c = clock()) {
  const store = createEcoStore({
    initialSave: defaultSave(),
    loadStatus: "fresh",
    storage,
    systemReducedMotion: false,
    initialPlaytest: loadPlaytests(storage),
    now: c.now,
  });
  return { store, storage, c };
}

describe("playtest sessions (pure)", () => {
  it("creates numbered anonymous sessions", () => {
    let d = startSession(emptyPlaytests(), 100);
    expect(activeSession(d)!.id).toBe(1);
    expect(activeSession(d)!.kind).toBe("recorded");
    d = startSession(d, 200);
    // Starting again closes the previous session without counting it.
    expect(d.sessions[0].status).toBe("abandoned");
    expect(activeSession(d)!.id).toBe(2);
    // Nothing identifying is stored.
    const keys = Object.keys(d.sessions[0]).sort();
    expect(keys).toEqual(
      ["answers", "endedAt", "firstRoundMs", "id", "kind", "missionOpened", "onboardingCompleted", "planningHubBuilt", "rounds", "startedAt", "status"].sort(),
    );
  });

  it("never counts an empty session as completed", () => {
    const d = startSession(emptyPlaytests(), 0);
    expect(finishSession(d, ANSWERS, 10)).toEqual({ ok: false, reason: "no-lunch" });
    const abandoned = abandonSession(d, 10);
    expect(summarize(abandoned).sessions).toBe(0);
    expect(summarize(abandoned).notCompleted).toBe(1);
    expect(summaryText(summarize(abandoned))).toBe(NO_PLAYTEST_DATA);
  });

  it("requires a clarity rating from 1 to 5", () => {
    const d = recordRound(startSession(emptyPlaytests(), 0), ROUND);
    expect(finishSession(d, { ...ANSWERS, clarity: 7 as never }, 1)).toEqual({ ok: false, reason: "invalid-answers" });
    expect(finishSession(d, ANSWERS, 1).ok).toBe(true);
  });

  it("keeps only the first round's time", () => {
    let d = startSession(emptyPlaytests(), 1000);
    d = recordFirstResults(d, 2000); // no round yet: ignored
    expect(activeSession(d)!.firstRoundMs).toBeNull();
    d = recordRound(d, ROUND);
    d = recordFirstResults(d, 139_000);
    d = recordRound(d, ROUND);
    d = recordFirstResults(d, 500_000);
    expect(activeSession(d)!.firstRoundMs).toBe(138_000);
  });

  it("formats the summary as plain text with no invented content", () => {
    let d = startSession(emptyPlaytests(), 0);
    d = recordRound(d, ROUND);
    d = recordFirstResults(d, 138_000);
    const done = finishSession(d, ANSWERS, 200_000);
    if (!done.ok) throw new Error(done.reason);
    const text = summaryText(summarize(done.data));
    expect(text).toContain("Players tested: 1");
    expect(text).toContain("Average first round: 2m 18s");
    expect(text).toContain("Average clarity: 4.0/5");
    expect(text).toContain("Planning Hub built: 0/1");
    expect(text).toContain("Mission Board opened: 0/1");
    expect(text).toContain("Goal: Feed everyone, waste less");
    expect(text).toContain("RECORDED PLAYTEST");
    expect(formatDuration(45_000)).toBe("45s");
    expect(summaryText(summarize(emptyPlaytests()))).toBe(NO_PLAYTEST_DATA);
  });

  it("demo playtest data never appears as recorded evidence", () => {
    const d = addDemoSessions(emptyPlaytests(), 1_000_000);
    expect(d.sessions.length).toBeGreaterThan(0);
    expect(d.sessions.every((s) => s.kind === "demo")).toBe(true);
    // The recorded summary and its copied text ignore demo sessions.
    expect(summarize(d, "recorded").sessions).toBe(0);
    expect(summaryText(summarize(d, "recorded"))).toBe(NO_PLAYTEST_DATA);
    expect(summarize(d, "demo").sessions).toBe(d.sessions.length);
    // Demo summaries can't be turned into copyable evidence.
    expect(() => summaryText(summarize(d, "demo"))).toThrow();
    // Demo answers are visibly marked.
    expect(summarize(d, "demo").responses.every((r) => r.goal.startsWith("[Demo]"))).toBe(true);
  });

  it("rejects stored sessions that claim completion without a lunch or answers", () => {
    const d = startSession(emptyPlaytests(), 0);
    const forged = { ...d, activeId: null, sessions: [{ ...d.sessions[0], status: "completed" }] };
    expect(validatePlaytests(forged)!.sessions).toHaveLength(0);
  });
});

describe("playtests in the store", () => {
  function playFirstLunch(store: ReturnType<typeof freshStore>["store"], c: ReturnType<typeof clock>) {
    store.actions.enterCity();
    store.actions.toggleVoice("rsvp");
    store.actions.setPortions(125);
    c.advance(90_000);
    store.actions.serveLunch();
    c.advance(30_000);
    store.actions.finishService();
  }

  it("records a full session: start, choices, results, hub, mission, answers", () => {
    const { store, c } = freshStore();
    store.actions.startPlaytest();
    const s0 = activeSession(store.getState().playtest)!;
    expect(s0.status).toBe("active");
    expect(store.getState().introOpen).toBe(true);
    playFirstLunch(store, c);
    store.actions.improveCampus();
    store.actions.buildPlanningHub();
    store.actions.finishConstruction();
    store.actions.tryAgain();
    store.actions.openMission();
    store.actions.serveLunch();
    store.actions.finishService();
    const s = activeSession(store.getState().playtest)!;
    expect(s.onboardingCompleted).toBe(true);
    expect(s.rounds).toHaveLength(2);
    expect(s.rounds[0].voice.rsvp).toBe(true);
    expect(s.rounds[0].portionsPrepared).toBe(125);
    expect(s.rounds[0].everyoneFed).toBe(true);
    expect(s.firstRoundMs).toBe(120_000);
    expect(s.planningHubBuilt).toBe(true);
    expect(s.missionOpened).toBe(true);
    expect(store.actions.submitPlaytest(ANSWERS)).toBe(true);
    const sum = summarize(store.getState().playtest);
    expect(sum.sessions).toBe(1);
    expect(sum.retried).toBe(1);
    expect(sum.responses[0]).toMatchObject({ goal: ANSWERS.goal, change: ANSWERS.change, clarity: 4, playAgain: "yes" });
    expect(activeSession(store.getState().playtest)).toBeNull();
  });

  it("records nothing when no playtest is running", () => {
    const { store, c } = freshStore();
    playFirstLunch(store, c);
    expect(store.getState().playtest.sessions).toHaveLength(0);
  });

  it("playtest records and answers survive a reload", () => {
    const { store, storage, c } = freshStore();
    store.actions.startPlaytest();
    playFirstLunch(store, c);
    store.actions.submitPlaytest(ANSWERS);
    const reloaded = loadPlaytests(storage);
    expect(reloaded).toEqual(store.getState().playtest);
    expect(summarize(reloaded).responses[0].goal).toBe(ANSWERS.goal);
    // An active session also survives a reload mid-game.
    store.actions.startPlaytest();
    expect(activeSession(loadPlaytests(storage))!.status).toBe("active");
  });

  it("clearing playtests leaves game progress alone", () => {
    const { store, storage, c } = freshStore();
    store.actions.startPlaytest();
    playFirstLunch(store, c);
    store.actions.submitPlaytest(ANSWERS);
    store.flush();
    const progress = store.getState().save.progress;
    store.actions.clearPlaytests();
    expect(store.getState().playtest.sessions).toHaveLength(0);
    expect(storage.getItem(PLAYTEST_KEY)).toBeNull();
    expect(store.getState().save.progress).toEqual(progress);
    expect(loadSave(storage).data.progress).toEqual(progress);
  });

  it("demo reset produces the clean filming state and keeps playtests and settings", () => {
    const { store, storage, c } = freshStore();
    store.actions.setMotion("reduce");
    store.actions.startPlaytest();
    playFirstLunch(store, c);
    store.actions.submitPlaytest(ANSWERS);
    store.actions.tryAgain();
    store.actions.improveCampus();
    store.actions.buildPlanningHub();
    store.actions.finishConstruction();
    store.actions.tryAgain();
    store.actions.startAudit("school");
    store.actions.auditBaseline({ mealsServed: 100, plateWasteG: 3000, surplusG: 1000, date: null, menu: null });
    store.actions.startAudit("demo");

    store.actions.resetDemo();
    const s = store.getState();
    expect(s.phase).toBe("planning");
    expect(s.round).toBeNull();
    expect(s.introOpen).toBe(true);
    expect(s.save.onboardingDone).toBe(false);
    expect(s.save.progress).toEqual(defaultSave().progress);
    expect(s.save.progress.campus.planningHubBuilt).toBe(false);
    expect(s.upgrades.planningOffice).toBe(false);
    expect(s.save.mission).toEqual({ school: null, demo: null });
    expect(stepsCompleted(s.save.mission.school)).toBe(0);
    expect(sustainabilityFlagRaised(s.save)).toBe(false);
    expect(s.save.draft).toEqual(defaultSave().draft);
    expect(s.save.settings.motion).toBe("reduce");
    expect(summarize(s.playtest).sessions).toBe(1);
    // Written straight away.
    const saved = loadSave(storage).data;
    expect(saved.progress).toEqual(defaultSave().progress);
    expect(saved.mission).toEqual({ school: null, demo: null });
    expect(loadPlaytests(storage).sessions).toHaveLength(1);
  });

  it("demo reset ends a running playtest without counting it", () => {
    const { store, c } = freshStore();
    store.actions.startPlaytest();
    playFirstLunch(store, c);
    store.actions.resetDemo();
    expect(activeSession(store.getState().playtest)).toBeNull();
    expect(summarize(store.getState().playtest).sessions).toBe(0);
  });

  it("the full game reset clears playtests too", () => {
    const { store, storage, c } = freshStore();
    store.actions.startPlaytest();
    playFirstLunch(store, c);
    store.actions.submitPlaytest(ANSWERS);
    store.actions.resetAll();
    expect(store.getState().playtest.sessions).toHaveLength(0);
    expect(storage.getItem(PLAYTEST_KEY)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  CORRUPT_BACKUP_KEY,
  SAVE_KEY,
  clearEcoRiseData,
  defaultSave,
  loadSave,
  writeSave,
  type StorageLike,
} from "./persistence";
import { PLANNING_HUB_COST, createEcoStore, planningHubRefusal } from "./store";
import { NO_VOICE, forecastRange, planningView } from "../model/planning";
import { MONDAY_STEW, getScenario } from "../model/scenarios";

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  failWrites = false;
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
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("loadSave", () => {
  it("round-trips a valid save", () => {
    const s = new MemoryStorage();
    const data = defaultSave();
    data.settings.motion = "reduce";
    data.onboardingDone = true;
    data.draft.voice = { rsvp: true, smallPlease: false, feedback: true };
    data.draft.policy = { portionsPrepared: 111, offerSmallServings: true };
    expect(writeSave(s, data)).toBe(true);
    const loaded = loadSave(s);
    expect(loaded.status).toBe("loaded");
    expect(loaded.data).toEqual(data);
  });

  it("starts fresh when nothing is stored", () => {
    expect(loadSave(new MemoryStorage()).status).toBe("fresh");
  });

  it("recovers from malformed JSON and keeps a backup", () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, "{not json");
    const r = loadSave(s);
    expect(r.status).toBe("unreadable");
    expect(r.data).toEqual(defaultSave());
    expect(s.getItem(CORRUPT_BACKUP_KEY)).toBe("{not json");
  });

  it("still recovers when the backup itself cannot be written", () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, "garbage");
    s.failWrites = true;
    const r = loadSave(s);
    expect(r.status).toBe("unreadable");
    expect(r.data).toEqual(defaultSave());
  });

  it("treats an unknown schema version as obsolete", () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, JSON.stringify({ ...defaultSave(), schemaVersion: 99 }));
    expect(loadSave(s).status).toBe("obsolete");
  });

  it("repairs out-of-range fields without discarding valid ones", () => {
    const s = new MemoryStorage();
    const data = defaultSave() as unknown as Record<string, unknown>;
    s.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...data,
        onboardingDone: true,
        settings: { motion: "warp-speed", quality: "sharp" },
        draft: {
          voice: { rsvp: true, smallPlease: true, feedback: true }, // three tokens: invalid
          policy: { portionsPrepared: -40, offerSmallServings: true },
        },
        progress: { credits: -5, ledger: { scenarios: { x: { bestCreditedValue: "lots" } } } },
      }),
    );
    const r = loadSave(s);
    const d = defaultSave();
    expect(r.status).toBe("repaired");
    expect(r.data.onboardingDone).toBe(true);
    expect(r.data.settings.motion).toBe(d.settings.motion);
    expect(r.data.draft.voice).toEqual(d.draft.voice);
    expect(r.data.draft.policy).toEqual(d.draft.policy);
    expect(r.data.progress.credits).toBe(d.progress.credits);
    expect(r.data.progress.ledger).toEqual({ scenarios: {} });
  });

  it("works without storage", () => {
    const r = loadSave(null);
    expect(r.status).toBe("unavailable");
    expect(r.storageAvailable).toBe(false);
  });
});

describe("clearEcoRiseData", () => {
  it("removes only EcoRise keys", () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, "{}");
    s.setItem(CORRUPT_BACKUP_KEY, "x");
    s.setItem("someone-else", "keep me");
    expect(clearEcoRiseData(s)).toBe(true);
    expect([...s.map.keys()]).toEqual(["someone-else"]);
  });
});

describe("store", () => {
  it("persists draft choices and survives a reload", async () => {
    const storage = new MemoryStorage();
    const store = createEcoStore({
      initialSave: defaultSave(),
      loadStatus: "fresh",
      storage,
      systemReducedMotion: false,
    });
    store.actions.enterCity();
    store.actions.toggleVoice("rsvp");
    store.actions.toggleVoice("feedback");
    store.actions.toggleVoice("smallPlease"); // rejected: limit
    store.actions.setPortions(117);
    store.flush();
    const reloaded = loadSave(storage);
    expect(reloaded.data.onboardingDone).toBe(true);
    expect(reloaded.data.draft.voice).toEqual({ rsvp: true, smallPlease: false, feedback: true });
    expect(reloaded.data.draft.policy.portionsPrepared).toBe(117);
    expect(store.getState().notice?.text).toMatch(/tokens/);
  });

  it("keeps running when writes fail and reports it", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const store = createEcoStore({
      initialSave: defaultSave(),
      loadStatus: "fresh",
      storage,
      systemReducedMotion: false,
    });
    store.actions.setPortions(90);
    store.flush();
    expect(store.getState().save.draft.policy.portionsPrepared).toBe(90);
    expect(store.getState().storage.lastWriteFailed).toBe(true);
  });

  it("reset restores defaults and clears only EcoRise storage", () => {
    const storage = new MemoryStorage();
    storage.setItem("other-app", "1");
    const store = createEcoStore({
      initialSave: defaultSave(),
      loadStatus: "fresh",
      storage,
      systemReducedMotion: false,
    });
    store.actions.enterCity();
    store.actions.setPortions(140);
    store.flush();
    store.actions.resetAll();
    expect(store.getState().save).toEqual(defaultSave());
    expect(store.getState().introOpen).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(storage.getItem("other-app")).toBe("1");
  });
});

describe("lunch rounds in the store", () => {
  function freshStore(storage = new MemoryStorage()) {
    const store = createEcoStore({ initialSave: defaultSave(), loadStatus: "fresh", storage, systemReducedMotion: false });
    store.actions.enterCity();
    return { store, storage };
  }

  it("serving computes the round once, locks the plan and credits it", () => {
    const { store } = freshStore();
    store.actions.setPortions(140);
    store.actions.serveLunch();
    const s = store.getState();
    expect(s.phase).toBe("serving");
    expect(s.round?.report.player.plan.policy.portionsPrepared).toBe(140);
    expect(s.save.progress.credits).toBe(defaultSave().progress.credits + s.round!.credited);
    // Plan is locked during service; a second press does nothing.
    const round = s.round;
    store.actions.setPortions(100);
    store.actions.toggleVoice("rsvp");
    store.actions.serveLunch();
    expect(store.getState().round).toBe(round);
    expect(store.getState().save.draft.policy.portionsPrepared).toBe(140);
    store.actions.finishService();
    expect(store.getState().phase).toBe("results");
  });

  it("replaying the same day only pays for improvement", () => {
    const { store } = freshStore();
    const start = store.getState().save.progress.credits;
    store.actions.setPortions(140); // wasteful but feeds everyone
    store.actions.serveLunch();
    const first = store.getState().round!.credited;
    store.actions.finishService();
    store.actions.tryAgain();
    store.actions.serveLunch(); // identical plan
    expect(store.getState().round!.credited).toBe(0);
    store.actions.finishService();
    store.actions.tryAgain();
    store.actions.toggleVoice("rsvp");
    store.actions.toggleVoice("smallPlease");
    store.actions.setOfferSmall(true);
    store.actions.setPortions(110);
    store.actions.serveLunch();
    const r = store.getState().round!;
    expect(r.report.stars.count).toBe(3);
    expect(store.getState().save.progress.credits).toBe(start + first + r.credited);
    expect(start + first + r.credited).toBe(start + r.report.evaluation.value);
  });

  it("a saved round survives a reload without paying again", () => {
    const { store, storage } = freshStore();
    store.actions.setPortions(118);
    store.actions.serveLunch();
    const credits = store.getState().save.progress.credits;
    const reloaded = loadSave(storage);
    expect(reloaded.data.progress.credits).toBe(credits);
    expect(reloaded.data.progress.last?.hotMeals).toBe(store.getState().round!.report.player.result.hotMeals);
    const again = createEcoStore({ initialSave: reloaded.data, loadStatus: reloaded.status, storage, systemReducedMotion: false });
    again.actions.enterCity();
    again.actions.serveLunch();
    expect(again.getState().round!.credited).toBe(0);
  });

  it("an underfed round is recorded but never counts as a waste success", () => {
    const { store } = freshStore();
    store.actions.setPortions(80);
    store.actions.serveLunch();
    const r = store.getState().round!;
    expect(r.report.stars.count).toBe(0);
    expect(store.getState().save.progress.best[r.report.scenarioId].wastePerMeal).toBeNull();
  });
});

describe("Planning Hub progression", () => {
  function fresh(storage = new MemoryStorage()) {
    const store = createEcoStore({ initialSave: defaultSave(), loadStatus: "fresh", storage, systemReducedMotion: false });
    store.actions.enterCity();
    return { store, storage };
  }
  function playRound(store: ReturnType<typeof fresh>["store"], portions: number) {
    store.actions.setPortions(portions);
    store.actions.serveLunch();
    store.actions.finishService();
  }

  it("stays locked until a round feeds everyone, then unlocks once", () => {
    const { store } = fresh();
    playRound(store, 90); // students go hungry
    expect(store.getState().save.progress.campus.planningHubUnlocked).toBe(false);
    expect(store.getState().round!.unlockedPlanningHub).toBe(false);
    store.actions.tryAgain();
    playRound(store, 130);
    expect(store.getState().save.progress.campus.planningHubUnlocked).toBe(true);
    expect(store.getState().round!.unlockedPlanningHub).toBe(true);
    store.actions.tryAgain();
    playRound(store, 130);
    expect(store.getState().round!.unlockedPlanningHub).toBe(false);
  });

  it("cannot be bought while locked or without enough credits", () => {
    const { store } = fresh();
    store.actions.buildPlanningHub();
    expect(store.getState().save.progress.campus.planningHubBuilt).toBe(false);
    // Unlock with a fed round, then drain credits below the cost.
    playRound(store, 140);
    const s = store.getState();
    expect(planningHubRefusal(s)).toBeNull();
    (s.save.progress as { credits: number }).credits = PLANNING_HUB_COST - 1;
    store.actions.buildPlanningHub();
    expect(store.getState().save.progress.campus.planningHubBuilt).toBe(false);
    expect(planningHubRefusal(store.getState())).toBe("not-enough-credits");
  });

  it("deducts the cost exactly once and never builds twice", () => {
    const { store, storage } = fresh();
    playRound(store, 140);
    const before = store.getState().save.progress.credits;
    store.actions.improveCampus();
    expect(store.getState().phase).toBe("building");
    store.actions.buildPlanningHub();
    store.actions.buildPlanningHub();
    expect(store.getState().phase).toBe("constructing");
    expect(store.getState().save.progress.credits).toBe(before - PLANNING_HUB_COST);
    store.actions.finishConstruction();
    store.actions.buildPlanningHub();
    expect(store.getState().save.progress.credits).toBe(before - PLANNING_HUB_COST);
    // Written immediately: a reload mid-construction keeps the hub and the payment.
    const reloaded = loadSave(storage).data;
    expect(reloaded.progress.campus.planningHubBuilt).toBe(true);
    expect(reloaded.progress.credits).toBe(before - PLANNING_HUB_COST);
  });

  it("persists after reload and changes the forecast without revealing attendance", () => {
    const { store, storage } = fresh();
    playRound(store, 140);
    store.actions.improveCampus();
    store.actions.buildPlanningHub();
    store.actions.finishConstruction();
    store.flush();
    const again = createEcoStore({ initialSave: loadSave(storage).data, loadStatus: "loaded", storage, systemReducedMotion: false });
    expect(again.getState().upgrades.planningOffice).toBe(true);
    const scenario = getScenario(MONDAY_STEW.id);
    const without = forecastRange(scenario, { rsvp: false, planningOffice: false });
    const withHub = planningView(scenario, NO_VOICE, again.getState().save.draft.policy, again.getState().upgrades).forecast;
    expect(withHub.high - withHub.low).toBeLessThan(without.high - without.low);
    expect(withHub.high - withHub.low).toBeGreaterThan(0);
    expect(withHub.low).toBeLessThanOrEqual(scenario.actualAttendance);
    expect(withHub.high).toBeGreaterThanOrEqual(scenario.actualAttendance);
  });

  it("the hub's forecast is used by the next lunch, and simulation outcomes stay deterministic", () => {
    const { store } = fresh();
    playRound(store, 140);
    const firstReport = store.getState().round!.report;
    store.actions.improveCampus();
    store.actions.buildPlanningHub();
    store.actions.finishConstruction();
    store.actions.tryAgain();
    store.actions.setPortions(140);
    store.actions.serveLunch();
    const r = store.getState().round!;
    expect(r.report.forecast.planningOffice).toBe(true);
    // Information changes; what happens with the same cooking plan does not.
    expect(r.report.player.result).toEqual(firstReport.player.result);
    expect(r.credited).toBe(0);
  });

  it("replays never re-award construction or unlock rewards", () => {
    const { store } = fresh();
    playRound(store, 140);
    store.actions.improveCampus();
    store.actions.buildPlanningHub();
    store.actions.finishConstruction();
    const credits = store.getState().save.progress.credits;
    for (let i = 0; i < 3; i++) {
      store.actions.tryAgain();
      playRound(store, 140);
      expect(store.getState().round!.unlockedPlanningHub).toBe(false);
    }
    expect(store.getState().save.progress.credits).toBe(credits);
  });

  it("reset removes the building and refunds nothing extra", () => {
    const { store, storage } = fresh();
    playRound(store, 140);
    store.actions.improveCampus();
    store.actions.buildPlanningHub();
    store.actions.finishConstruction();
    store.actions.resetAll();
    expect(store.getState().save.progress.campus).toEqual({ planningHubUnlocked: false, planningHubBuilt: false });
    expect(store.getState().save.progress.credits).toBe(defaultSave().progress.credits);
    expect(store.getState().upgrades.planningOffice).toBe(false);
    expect(loadSave(storage).status).toBe("fresh");
  });

  it("rejects a save that claims a hub was built without being unlocked", () => {
    const storage = new MemoryStorage();
    const bad = defaultSave();
    bad.progress.campus = { planningHubUnlocked: false, planningHubBuilt: true };
    storage.setItem(SAVE_KEY, JSON.stringify(bad));
    const r = loadSave(storage);
    expect(r.status).toBe("repaired");
    expect(r.data.progress.campus.planningHubBuilt).toBe(false);
  });
});

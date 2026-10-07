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
import { PLANNING_HUB_COST, createEcoStore, planningHubRefusal, sustainabilityFlagRaised } from "./store";
import { DEMO_BASELINE, auditOutcome, stepsCompleted } from "../model/audit";
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

describe("Cafeteria Waste Audit in the store", () => {
  function fresh(storage = new MemoryStorage()) {
    const store = createEcoStore({ initialSave: defaultSave(), loadStatus: "fresh", storage, systemReducedMotion: false });
    store.actions.enterCity();
    return { store, storage };
  }
  const BASE = { mealsServed: 120, plateWasteG: 4800, surplusG: 1200, date: "2026-10-05", menu: "Vegetable stew" };
  const AFTER = { mealsServed: 118, plateWasteG: 3600, surplusG: 1120, date: null, menu: null };
  function throughStep3(store: ReturnType<typeof fresh>["store"]) {
    store.actions.openMission();
    store.actions.startAudit("school");
    expect(store.actions.auditBaseline(BASE)).toBe(true);
    store.actions.auditCauses(["portions-large", "attendance-lower"]);
    store.actions.auditFeedback({ portion: 5, disliked: 1, full: 2, time: 0, other: 0 });
    store.actions.auditDiscussed(true);
    store.actions.auditChange("rsvp");
  }

  it("runs the full mission; the flag rises only when a school audit is verified", () => {
    const { store } = fresh();
    throughStep3(store);
    store.actions.submitAudit();
    expect(store.getState().save.mission.school!.status).toBe("submitted");
    expect(sustainabilityFlagRaised(store.getState().save)).toBe(false);
    store.actions.verifyAuditDemo();
    expect(sustainabilityFlagRaised(store.getState().save)).toBe(true);
    expect(auditOutcome(store.getState().save.mission.school!).kind).toBe("follow-up-not-measured");
    expect(store.actions.auditFollowUp(AFTER, true)).toBe(false); // not tested yet
    store.actions.markChangeTested();
    expect(store.actions.auditFollowUp(AFTER, true)).toBe(true);
    expect(store.getState().save.mission.school!.status).toBe("measured");
    expect(stepsCompleted(store.getState().save.mission.school)).toBe(5);
  });

  it("entering numbers earns no Eco Credits", () => {
    const { store } = fresh();
    const credits = store.getState().save.progress.credits;
    throughStep3(store);
    store.actions.submitAudit();
    store.actions.verifyAuditDemo();
    store.actions.markChangeTested();
    store.actions.auditFollowUp(AFTER, true);
    expect(store.getState().save.progress.credits).toBe(credits);
  });

  it("refuses out-of-order steps and leaves the record unchanged", () => {
    const { store } = fresh();
    store.actions.startAudit("school");
    const before = store.getState().save.mission.school;
    store.actions.verifyAuditDemo();
    store.actions.submitAudit();
    store.actions.markChangeTested();
    expect(store.actions.auditFollowUp(AFTER, true)).toBe(false);
    expect(store.getState().save.mission.school).toEqual(before);
    expect(store.getState().notice).not.toBeNull();
  });

  it("keeps demo and school records apart; demo data earns no reward", () => {
    const { store } = fresh();
    throughStep3(store);
    store.actions.startAudit("demo");
    expect(store.getState().missionView).toBe("demo");
    store.actions.submitAudit();
    store.actions.verifyAuditDemo();
    const m = store.getState().save.mission;
    expect(m.demo!.status).toBe("verified");
    expect(m.demo!.source).toBe("demo");
    expect(m.demo!.baseline).toEqual(DEMO_BASELINE);
    expect(m.school!.status).toBe("proposed");
    expect(m.school!.baseline).toEqual(BASE);
    expect(sustainabilityFlagRaised(store.getState().save)).toBe(false);
    // Edits while viewing the demo never reach the school record.
    expect(store.actions.auditBaseline(AFTER)).toBe(false);
    expect(store.getState().save.mission.school!.baseline).toEqual(BASE);
    store.actions.discardAudit("demo");
    expect(store.getState().save.mission.demo).toBeNull();
    expect(store.getState().missionView).toBe("school");
  });

  it("a submitted school audit cannot be discarded", () => {
    const { store } = fresh();
    throughStep3(store);
    store.actions.submitAudit();
    store.actions.discardAudit("school");
    expect(store.getState().save.mission.school!.status).toBe("submitted");
  });

  it("reload restores every part of the mission, including verification", () => {
    const { store, storage } = fresh();
    throughStep3(store);
    store.actions.submitAudit();
    store.actions.verifyAuditDemo();
    store.actions.markChangeTested();
    store.actions.startAudit("demo");
    // No flush: status changes are written immediately.
    const loaded = loadSave(storage);
    expect(loaded.status).toBe("loaded");
    const school = loaded.data.mission.school!;
    expect(school.status).toBe("verified");
    expect(school.baseline).toEqual(BASE);
    expect(school.causes).toEqual(["attendance-lower", "portions-large"]);
    expect(school.feedback).toEqual({ portion: 5, disliked: 1, full: 2, time: 0, other: 0 });
    expect(school.change).toBe("rsvp");
    expect(school.changeTested).toBe(true);
    expect(loaded.data.mission.demo!.source).toBe("demo");
    const again = createEcoStore({ initialSave: loaded.data, loadStatus: "loaded", storage, systemReducedMotion: false });
    expect(sustainabilityFlagRaised(again.getState().save)).toBe(true);
  });

  it("the lunch game stays playable while a mission is incomplete", () => {
    const { store } = fresh();
    throughStep3(store);
    const credits = store.getState().save.progress.credits;
    store.actions.tryAgain();
    store.actions.setPortions(130);
    store.actions.serveLunch();
    expect(store.getState().phase).toBe("serving");
    store.actions.finishService();
    expect(store.getState().round!.report.player.fed).toBe(true);
    expect(store.getState().save.progress.credits).toBeGreaterThan(credits);
    // The simulated round never touches the school measurements.
    expect(store.getState().save.mission.school!.baseline).toEqual(BASE);
    expect(store.getState().save.mission.school!.status).toBe("proposed");
  });

  it("reset clears mission records", () => {
    const { store, storage } = fresh();
    throughStep3(store);
    store.actions.submitAudit();
    store.actions.verifyAuditDemo();
    store.actions.startAudit("demo");
    store.actions.resetAll();
    expect(store.getState().save.mission).toEqual({ school: null, demo: null });
    expect(sustainabilityFlagRaised(store.getState().save)).toBe(false);
    expect(loadSave(storage).data.mission).toEqual({ school: null, demo: null });
  });

  it("older saves without mission data load normally; tampered records are dropped", () => {
    const storage = new MemoryStorage();
    const old = defaultSave() as Partial<ReturnType<typeof defaultSave>>;
    delete old.mission;
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    const r = loadSave(storage);
    expect(r.status).toBe("loaded");
    expect(r.data.mission).toEqual({ school: null, demo: null });

    const bad = defaultSave();
    const blank = { causes: [], feedback: null, discussed: false, change: null, changeTested: false, followUp: null };
    // Demo numbers relabelled as a school record, and a "verified" demo with no measurements.
    bad.mission = {
      school: { source: "demo", status: "proposed", baseline: DEMO_BASELINE, ...blank },
      demo: { source: "demo", status: "verified", baseline: null, ...blank },
    };
    storage.setItem(SAVE_KEY, JSON.stringify(bad));
    const r2 = loadSave(storage);
    expect(r2.status).toBe("repaired");
    expect(r2.data.mission).toEqual({ school: null, demo: null });
  });
});

describe("campus growth toward 2050", () => {
  function store() {
    const s = createEcoStore({ initialSave: defaultSave(), loadStatus: "fresh", storage: new MemoryStorage(), systemReducedMotion: false });
    s.actions.enterCity();
    return s;
  }
  function strongLunch(s: ReturnType<typeof store>) {
    if (!s.getState().save.draft.voice.rsvp) s.actions.toggleVoice("rsvp");
    if (!s.getState().save.draft.voice.feedback) s.actions.toggleVoice("feedback");
    s.actions.setOfferSmall(true);
    s.actions.setPortions(115);
    s.actions.serveLunch();
    s.actions.finishService();
  }

  it("grows one stage per strong lunch, capped, and never from a weak one", () => {
    const s = store();
    s.actions.setPortions(90); // food runs out
    s.actions.serveLunch();
    s.actions.finishService();
    expect(s.getState().round!.report.stars.fed).toBe(false);
    expect(s.getState().save.story.growth).toBe(0);
    for (let i = 1; i <= 6; i++) {
      s.actions.tryAgain();
      strongLunch(s);
      expect(s.getState().round!.report.stars.fed && s.getState().round!.report.stars.lowWaste).toBe(true);
      expect(s.getState().save.story.growth).toBe(Math.min(4, i));
    }
    expect(s.getState().save.story.futuresUnlocked).toBe(true);
  });

  it("growth is cosmetic: replays of a strong lunch still pay no credits", () => {
    const s = store();
    strongLunch(s);
    const credits = s.getState().save.progress.credits;
    s.actions.tryAgain();
    strongLunch(s);
    expect(s.getState().round!.credited).toBe(0);
    expect(s.getState().save.progress.credits).toBe(credits);
    expect(s.getState().save.story.growth).toBe(2);
  });
});

describe("saves from before campus growth and sound", () => {
  it("load cleanly with growth 0 and sound on", () => {
    const st = new MemoryStorage();
    const old = defaultSave() as unknown as Record<string, unknown>;
    const settings = { ...(old.settings as Record<string, unknown>) };
    delete settings.sound;
    const story = { messageSeen: true, futuresUnlocked: true };
    st.setItem(SAVE_KEY, JSON.stringify({ ...old, settings, story }));
    const r = loadSave(st);
    expect(r.status).toBe("loaded");
    expect(r.data.story).toEqual({ messageSeen: true, futuresUnlocked: true, growth: 0, auditPrompted: false });
    expect(r.data.settings.sound).toBe(true);
  });

  it("repair an impossible growth stage", () => {
    const st = new MemoryStorage();
    const bad = defaultSave();
    st.setItem(SAVE_KEY, JSON.stringify({ ...bad, story: { ...bad.story, growth: 99 } }));
    const r = loadSave(st);
    expect(r.status).toBe("repaired");
    expect(r.data.story.growth).toBe(0);
  });
});

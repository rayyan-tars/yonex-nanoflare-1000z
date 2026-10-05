import type { StudentVoice } from "../model/types";
import { STORAGE_PREFIX, type StorageLike } from "./persistence";

/**
 * Optional playtest recording for the team running EcoRise with students.
 *
 * Anonymous and local: no names, no accounts, no pointer tracking. Only the
 * decisions and outcomes listed below are kept, in their own storage key so
 * they can be cleared without touching game progress (and kept when the game
 * is reset for the next player).
 */
export const PLAYTEST_KEY = `${STORAGE_PREFIX}playtests`;
export const PLAYTEST_VERSION = 1;

/** "recorded" = a real person played; "demo" = developer sample data, never evidence. */
export type PlaytestKind = "recorded" | "demo";
export type PlaytestStatus = "active" | "completed" | "abandoned";
export type PlayAgain = "yes" | "maybe" | "no";

/** One served (simulated) lunch during a session. */
export interface PlaytestRound {
  voice: StudentVoice;
  portionsPrepared: number;
  smallServings: boolean;
  /** Simulated outcome: everyone got a hot meal (at the success threshold). */
  everyoneFed: boolean;
  studentsFed: number;
  attendance: number;
  /** Simulated avoidable waste, in portions per meal served (not grams). */
  wastePortionsPerMeal: number | null;
  stars: number;
}

export interface PlaytestAnswers {
  /** Q1: What was the goal of the game? */
  goal: string;
  /** Q2: What would you change to reduce food waste without leaving students hungry? */
  change: string;
  /** Q3: How easy was EcoRise to understand? 1–5. */
  clarity: 1 | 2 | 3 | 4 | 5;
  /** Optional: Would you play another EcoRise challenge? */
  playAgain: PlayAgain | null;
}

export interface PlaytestSession {
  /** Session number, counting up from 1 in this browser. */
  id: number;
  kind: PlaytestKind;
  status: PlaytestStatus;
  startedAt: number;
  endedAt: number | null;
  onboardingCompleted: boolean;
  rounds: PlaytestRound[];
  /** From session start until the first lunch results appeared. */
  firstRoundMs: number | null;
  planningHubBuilt: boolean;
  missionOpened: boolean;
  answers: PlaytestAnswers | null;
}

export interface PlaytestData {
  version: typeof PLAYTEST_VERSION;
  nextId: number;
  activeId: number | null;
  sessions: PlaytestSession[];
}

export const MAX_ANSWER_LENGTH = 400;
const MAX_SESSIONS = 500;
const MAX_ROUNDS = 100;

export function emptyPlaytests(): PlaytestData {
  return { version: PLAYTEST_VERSION, nextId: 1, activeId: null, sessions: [] };
}

export function activeSession(data: PlaytestData): PlaytestSession | null {
  return data.activeId === null ? null : (data.sessions.find((s) => s.id === data.activeId) ?? null);
}

function updateActive(data: PlaytestData, fn: (s: PlaytestSession) => PlaytestSession): PlaytestData {
  const active = activeSession(data);
  if (!active || active.status !== "active") return data;
  return { ...data, sessions: data.sessions.map((s) => (s.id === active.id ? fn(s) : s)) };
}

/** Starts a new anonymous session. Any session still running is closed as abandoned. */
export function startSession(data: PlaytestData, now: number, kind: PlaytestKind = "recorded"): PlaytestData {
  const closed = abandonSession(data, now);
  const session: PlaytestSession = {
    id: closed.nextId,
    kind,
    status: "active",
    startedAt: now,
    endedAt: null,
    onboardingCompleted: false,
    rounds: [],
    firstRoundMs: null,
    planningHubBuilt: false,
    missionOpened: false,
    answers: null,
  };
  return {
    ...closed,
    nextId: closed.nextId + 1,
    activeId: session.id,
    sessions: [...closed.sessions, session].slice(-MAX_SESSIONS),
  };
}

export const recordOnboarding = (d: PlaytestData) => updateActive(d, (s) => ({ ...s, onboardingCompleted: true }));
export const recordHubBuilt = (d: PlaytestData) => updateActive(d, (s) => ({ ...s, planningHubBuilt: true }));
export const recordMissionOpened = (d: PlaytestData) => updateActive(d, (s) => ({ ...s, missionOpened: true }));

export function recordRound(d: PlaytestData, round: PlaytestRound): PlaytestData {
  return updateActive(d, (s) => (s.rounds.length >= MAX_ROUNDS ? s : { ...s, rounds: [...s.rounds, round] }));
}

/** Called when lunch results appear; only the first round's time is kept. */
export function recordFirstResults(d: PlaytestData, now: number): PlaytestData {
  return updateActive(d, (s) =>
    s.firstRoundMs !== null || s.rounds.length === 0 ? s : { ...s, firstRoundMs: Math.max(0, now - s.startedAt) },
  );
}

export function cleanAnswers(a: PlaytestAnswers): PlaytestAnswers | null {
  if (![1, 2, 3, 4, 5].includes(a.clarity)) return null;
  if (a.playAgain !== null && !["yes", "maybe", "no"].includes(a.playAgain)) return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_ANSWER_LENGTH) : null);
  const goal = text(a.goal);
  const change = text(a.change);
  if (goal === null || change === null) return null;
  return { goal, change, clarity: a.clarity, playAgain: a.playAgain };
}

export type FinishResult = { ok: true; data: PlaytestData } | { ok: false; reason: "no-session" | "no-lunch" | "invalid-answers" };

/**
 * Ends the active session with the three answers. A session counts as
 * completed only if at least one lunch was served and the answers are valid.
 */
export function finishSession(d: PlaytestData, answers: PlaytestAnswers, now: number): FinishResult {
  const active = activeSession(d);
  if (!active || active.status !== "active") return { ok: false, reason: "no-session" };
  if (active.rounds.length === 0) return { ok: false, reason: "no-lunch" };
  const clean = cleanAnswers(answers);
  if (!clean) return { ok: false, reason: "invalid-answers" };
  const data = updateActive(d, (s) => ({ ...s, status: "completed", endedAt: now, answers: clean }));
  return { ok: true, data: { ...data, activeId: null } };
}

/** Closes the active session without counting it. */
export function abandonSession(d: PlaytestData, now: number): PlaytestData {
  if (d.activeId === null) return d;
  const data = updateActive(d, (s) => ({ ...s, status: "abandoned", endedAt: now }));
  return { ...data, activeId: null };
}

/** Removes demo (developer sample) sessions only. */
export function clearDemoSessions(d: PlaytestData): PlaytestData {
  const sessions = d.sessions.filter((s) => s.kind !== "demo");
  return { ...d, sessions, activeId: sessions.some((s) => s.id === d.activeId) ? d.activeId : null };
}

/**
 * Developer sample sessions for checking the summary screen. Always kind
 * "demo": shown only under DEMO PLAYTEST DATA and never in the copied summary.
 */
export function addDemoSessions(d: PlaytestData, now: number): PlaytestData {
  let data = abandonSession(d, now);
  const samples: [number, PlaytestAnswers, boolean, boolean][] = [
    [131_000, { goal: "[Demo] Example answer", change: "[Demo] Example answer", clarity: 4, playAgain: "yes" }, true, true],
    [176_000, { goal: "[Demo] Example answer", change: "[Demo] Example answer", clarity: 3, playAgain: "maybe" }, false, true],
  ];
  for (const [ms, answers, hub, mission] of samples) {
    data = startSession(data, now - ms - 60_000, "demo");
    data = recordOnboarding(data);
    data = recordRound(data, {
      voice: { rsvp: true, smallPlease: false, feedback: true },
      portionsPrepared: 125,
      smallServings: false,
      everyoneFed: true,
      studentsFed: 118,
      attendance: 118,
      wastePortionsPerMeal: 0.06,
      stars: 2,
    });
    data = recordFirstResults(data, now - 60_000);
    if (hub) data = recordHubBuilt(data);
    if (mission) data = recordMissionOpened(data);
    const done = finishSession(data, answers, now);
    if (done.ok) data = done.data;
  }
  return data;
}

// ------------------------------------------------------------- summary

export interface PlaytestSummary {
  kind: PlaytestKind;
  /** Completed sessions only. */
  sessions: number;
  /** Started but not completed (not counted anywhere else). */
  notCompleted: number;
  avgFirstRoundMs: number | null;
  avgClarity: number | null;
  /** Sessions whose first lunch used each Student Voice token. */
  voiceFirstRound: Record<keyof StudentVoice, number>;
  retried: number;
  everyoneFedFirstRound: number;
  hubBuilt: number;
  missionOpened: number;
  playAgain: Record<PlayAgain, number>;
  responses: { id: number; goal: string; change: string; clarity: number; playAgain: PlayAgain | null }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Summary of one kind of session. Demo and recorded data are never combined. */
export function summarize(d: PlaytestData, kind: PlaytestKind = "recorded"): PlaytestSummary {
  const ofKind = d.sessions.filter((s) => s.kind === kind);
  const done = ofKind.filter((s) => s.status === "completed" && s.answers && s.rounds.length > 0);
  const firsts = done.map((s) => s.rounds[0]);
  const count = (pred: (s: PlaytestSession) => boolean) => done.filter(pred).length;
  return {
    kind,
    sessions: done.length,
    notCompleted: ofKind.length - done.length,
    avgFirstRoundMs: mean(done.flatMap((s) => (s.firstRoundMs === null ? [] : [s.firstRoundMs]))),
    avgClarity: mean(done.map((s) => s.answers!.clarity)),
    voiceFirstRound: {
      rsvp: firsts.filter((r) => r.voice.rsvp).length,
      smallPlease: firsts.filter((r) => r.voice.smallPlease).length,
      feedback: firsts.filter((r) => r.voice.feedback).length,
    },
    retried: count((s) => s.rounds.length > 1),
    everyoneFedFirstRound: firsts.filter((r) => r.everyoneFed).length,
    hubBuilt: count((s) => s.planningHubBuilt),
    missionOpened: count((s) => s.missionOpened),
    playAgain: {
      yes: count((s) => s.answers!.playAgain === "yes"),
      maybe: count((s) => s.answers!.playAgain === "maybe"),
      no: count((s) => s.answers!.playAgain === "no"),
    },
    responses: done.map((s) => ({
      id: s.id,
      goal: s.answers!.goal,
      change: s.answers!.change,
      clarity: s.answers!.clarity,
      playAgain: s.answers!.playAgain,
    })),
  };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export const NO_PLAYTEST_DATA = "No playtest data recorded yet.";

/** Plain text for an evidence log. Only recorded sessions; nothing is inferred. */
export function summaryText(sum: PlaytestSummary): string {
  if (sum.kind !== "recorded") throw new Error("Only recorded playtests can be copied as evidence.");
  if (sum.sessions === 0) return NO_PLAYTEST_DATA;
  const n = sum.sessions;
  const answeredAgain = sum.playAgain.yes + sum.playAgain.maybe + sum.playAgain.no;
  const lines = [
    "EcoRise Playtest (RECORDED PLAYTEST, anonymous, local)",
    `Players tested: ${n}`,
    `Average first round: ${sum.avgFirstRoundMs === null ? "not recorded" : formatDuration(sum.avgFirstRoundMs)}`,
    `Average clarity: ${sum.avgClarity === null ? "n/a" : sum.avgClarity.toFixed(1)}/5`,
    `Planning Hub built: ${sum.hubBuilt}/${n}`,
    `Mission Board opened: ${sum.missionOpened}/${n}`,
    `Retried a lunch: ${sum.retried}/${n}`,
    `Everyone fed in first (simulated) lunch: ${sum.everyoneFedFirstRound}/${n}`,
    `First-lunch Student Voice: RSVP ${sum.voiceFirstRound.rsvp}/${n} · Small, please ${sum.voiceFirstRound.smallPlease}/${n} · Feedback ${sum.voiceFirstRound.feedback}/${n}`,
  ];
  if (answeredAgain > 0) {
    lines.push(`Would play another challenge: Yes ${sum.playAgain.yes} · Maybe ${sum.playAgain.maybe} · No ${sum.playAgain.no} (${answeredAgain} answered)`);
  }
  if (sum.notCompleted > 0) lines.push(`Sessions started but not completed (not counted): ${sum.notCompleted}`);
  lines.push("", "Responses (anonymous, unedited):");
  for (const r of sum.responses) {
    lines.push(
      `#${r.id} · Clarity ${r.clarity}/5${r.playAgain ? ` · Play again: ${r.playAgain}` : ""}`,
      `  Goal: ${r.goal || "(no answer)"}`,
      `  Change: ${r.change || "(no answer)"}`,
    );
  }
  return lines.join("\n");
}

// --------------------------------------------------------- persistence

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const isNum = (v: unknown, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min;
const isBool = (v: unknown) => typeof v === "boolean";

function validRound(r: unknown): r is PlaytestRound {
  if (!isRecord(r) || !isRecord(r.voice)) return false;
  const v = r.voice;
  return (
    isBool(v.rsvp) &&
    isBool(v.smallPlease) &&
    isBool(v.feedback) &&
    isNum(r.portionsPrepared) &&
    isBool(r.smallServings) &&
    isBool(r.everyoneFed) &&
    isNum(r.studentsFed) &&
    isNum(r.attendance) &&
    (r.wastePortionsPerMeal === null || isNum(r.wastePortionsPerMeal)) &&
    isNum(r.stars) &&
    (r.stars as number) <= 3
  );
}

function validSession(s: unknown): s is PlaytestSession {
  if (!isRecord(s)) return false;
  if (!Number.isInteger(s.id) || (s.id as number) < 1) return false;
  if (s.kind !== "recorded" && s.kind !== "demo") return false;
  if (s.status !== "active" && s.status !== "completed" && s.status !== "abandoned") return false;
  if (!isNum(s.startedAt) || !(s.endedAt === null || isNum(s.endedAt))) return false;
  if (!isBool(s.onboardingCompleted) || !isBool(s.planningHubBuilt) || !isBool(s.missionOpened)) return false;
  if (!(s.firstRoundMs === null || isNum(s.firstRoundMs))) return false;
  if (!Array.isArray(s.rounds) || !s.rounds.every(validRound)) return false;
  if (s.answers !== null) {
    if (!isRecord(s.answers) || cleanAnswers(s.answers as unknown as PlaytestAnswers) === null) return false;
  }
  // Completed means answered with at least one lunch served.
  if (s.status === "completed" && (s.answers === null || s.rounds.length === 0)) return false;
  return true;
}

export function validatePlaytests(raw: unknown): PlaytestData | null {
  if (!isRecord(raw) || raw.version !== PLAYTEST_VERSION || !Array.isArray(raw.sessions)) return null;
  if (!Number.isInteger(raw.nextId) || (raw.nextId as number) < 1) return null;
  const sessions = raw.sessions.filter(validSession);
  const ids = new Set(sessions.map((s) => s.id));
  const activeId = raw.activeId;
  const active = typeof activeId === "number" && ids.has(activeId) ? sessions.find((s) => s.id === activeId) : undefined;
  return {
    version: PLAYTEST_VERSION,
    nextId: Math.max(raw.nextId as number, ...sessions.map((s) => s.id + 1)),
    activeId: active && active.status === "active" ? active.id : null,
    sessions,
  };
}

export function loadPlaytests(storage: StorageLike | null): PlaytestData {
  if (!storage) return emptyPlaytests();
  try {
    const text = storage.getItem(PLAYTEST_KEY);
    if (text === null) return emptyPlaytests();
    return validatePlaytests(JSON.parse(text)) ?? emptyPlaytests();
  } catch {
    return emptyPlaytests();
  }
}

export function writePlaytests(storage: StorageLike | null, data: PlaytestData): boolean {
  if (!storage) return false;
  try {
    if (data.sessions.length === 0 && data.activeId === null) storage.removeItem(PLAYTEST_KEY);
    else storage.setItem(PLAYTEST_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * Second Life: 2050 missions: small real-life actions in five categories.
 * Small missions are on trust (tap Done); a bigger mission needs one photo.
 * Everything here counts actions; nothing is converted into CO₂ or litres.
 */

export type Category = "water" | "energy" | "waste" | "food" | "transport";

export interface CategoryDef {
  id: Category;
  name: string;
  /** The 2050 alert this category sends. */
  alert: string;
  /** What the shared school campus gains when the school challenge is met. */
  cityChange: string;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { id: "water", name: "Water", alert: "Our water supply is falling.", cityChange: "Water refill station" },
  { id: "energy", name: "Energy", alert: "Our power still comes from dirty energy.", cityChange: "Solar panels on the school" },
  { id: "waste", name: "Waste", alert: "Our landfill is overflowing.", cityChange: "Recycling station" },
  { id: "food", name: "Food", alert: "Too much good food is thrown away.", cityChange: "Community garden" },
  { id: "transport", name: "Transport", alert: "Our streets are full of traffic.", cityChange: "Bike rack at the gate" },
];

export const categoryDef = (id: Category) => CATEGORIES.find((c) => c.id === id)!;

export interface MissionDef {
  id: string;
  category: Category;
  text: string;
  /** Small: done on trust. Big: needs one photo as proof. */
  size: "small" | "big";
}

export const MISSIONS: readonly MissionDef[] = [
  { id: "water-tap", category: "water", text: "Turn off the tap while brushing your teeth", size: "small" },
  { id: "water-refill", category: "water", text: "Refill your water bottle instead of buying one", size: "small" },
  { id: "water-shower", category: "water", text: "Take a shower one minute shorter", size: "small" },
  { id: "water-leak", category: "water", text: "Report a dripping tap at school", size: "small" },
  { id: "energy-light", category: "energy", text: "Switch off one unused light", size: "small" },
  { id: "energy-charger", category: "energy", text: "Unplug an unused charger", size: "small" },
  { id: "energy-screen", category: "energy", text: "Turn off a screen nobody is using", size: "small" },
  { id: "energy-daylight", category: "energy", text: "Use daylight instead of a lamp for an hour", size: "small" },
  { id: "waste-recycle", category: "waste", text: "Recycle one item correctly", size: "small" },
  { id: "waste-bag", category: "waste", text: "Reuse a bag", size: "small" },
  { id: "waste-paper", category: "waste", text: "Reuse a sheet of paper", size: "small" },
  { id: "waste-container", category: "waste", text: "Bring a reusable container", size: "small" },
  { id: "food-finish", category: "food", text: "Finish your meal, or ask for a smaller portion", size: "small" },
  { id: "food-leftovers", category: "food", text: "Save leftovers for later", size: "small" },
  { id: "food-snack", category: "food", text: "Pack a snack in a reusable box", size: "small" },
  { id: "food-fruit", category: "food", text: "Eat a piece of fruit before it goes off", size: "small" },
  { id: "transport-walk", category: "transport", text: "Walk a short journey instead of being driven", size: "small" },
  { id: "transport-stairs", category: "transport", text: "Take the stairs instead of the lift", size: "small" },
  { id: "transport-share", category: "transport", text: "Share a ride or take the bus", size: "small" },
  { id: "transport-bike", category: "transport", text: "Cycle or scoot to a nearby place", size: "small" },
  { id: "big-cleanup", category: "waste", text: "Join a school or street clean-up", size: "big" },
  { id: "big-donate", category: "waste", text: "Donate an item you no longer use", size: "big" },
  { id: "big-cycle-week", category: "transport", text: "Walk or cycle to school three days this week", size: "big" },
  { id: "big-garden", category: "food", text: "Help plant or care for a school garden", size: "big" },
  { id: "big-water-audit", category: "water", text: "Find and report every dripping tap in one school building", size: "big" },
  { id: "big-energy-hunt", category: "energy", text: "Lead a lights-off check of your classrooms after school", size: "big" },
];

export const missionDef = (id: string) => MISSIONS.find((m) => m.id === id) ?? null;

export interface Completion {
  missionId: string;
  category: Category;
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  big: boolean;
  /** Small photo proof (a downscaled image data URL), kept only on this device. */
  photo?: string;
}

export interface MissionsSave {
  completions: Completion[];
  /** Categories whose school challenge has been met (the campus has changed for them). */
  cityChanged: Category[];
}

export const DEFAULT_MISSIONS_SAVE: MissionsSave = { completions: [], cityChanged: [] };

/** Local calendar day for a timestamp. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_MS = 86_400_000;
const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};
/** Whole days from a to b (local days). */
const daysBetween = (a: string, b: string) => Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
const addDays = (day: string, n: number) => dayKey(parseDay(day) + n * DAY_MS + 12 * 3_600_000);

/** Monday of the week containing the day. */
export function weekStart(day: string): string {
  const d = new Date(parseDay(day));
  const offset = (d.getDay() + 6) % 7;
  return addDays(day, -offset);
}

/** Stable small hash of a day, for deterministic daily picks. */
function dayIndex(day: string): number {
  return Math.floor(parseDay(day) / DAY_MS);
}

export interface DailyMissions {
  /** Today's 2050 alert. */
  alert: Category;
  small: MissionDef[];
  big: MissionDef;
}

/**
 * Today's missions: an alert category that rotates daily, three small
 * missions (the alert's and two other categories) and one bigger mission.
 * The same day always gives the same missions.
 */
export function dailyMissions(day: string): DailyMissions {
  const i = dayIndex(day);
  const alert = CATEGORIES[((i % 5) + 5) % 5].id;
  const order = [0, 2, 4].map((k) => CATEGORIES[(((i + k) % 5) + 5) % 5].id);
  const small = order.map((cat, k) => {
    const pool = MISSIONS.filter((m) => m.category === cat && m.size === "small");
    return pool[(((Math.floor(i / 5) + k) % pool.length) + pool.length) % pool.length];
  });
  const bigs = MISSIONS.filter((m) => m.size === "big");
  const big = bigs.find((m) => m.category === alert) ?? bigs[((i % bigs.length) + bigs.length) % bigs.length];
  return { alert, small, big };
}

export const doneToday = (save: MissionsSave, missionId: string, day: string) =>
  save.completions.some((c) => c.missionId === missionId && c.day === day);

export type CompleteRefusal = "unknown" | "already" | "photo-needed";

/** Records a completion, or says why it can't. Each mission counts once per day. */
export function completeMission(
  save: MissionsSave,
  missionId: string,
  day: string,
  photo?: string,
): { save: MissionsSave; refused: CompleteRefusal | null } {
  const m = missionDef(missionId);
  if (!m) return { save, refused: "unknown" };
  if (doneToday(save, missionId, day)) return { save, refused: "already" };
  if (m.size === "big" && !photo) return { save, refused: "photo-needed" };
  const c: Completion = { missionId, category: m.category, day, big: m.size === "big", ...(photo ? { photo } : {}) };
  return { save: { ...save, completions: [...save.completions, c] }, refused: null };
}

/** Days in a row with at least one action, ending today (or yesterday, if today has none yet). */
export function streak(save: MissionsSave, today: string): number {
  const days = new Set(save.completions.map((c) => c.day));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export const countIn = (save: MissionsSave, cat: Category) => save.completions.filter((c) => c.category === cat).length;

/** Timeline years instead of levels: your actions move you toward 2050. */
export const YEARS: readonly { year: number; actions: number; note: string }[] = [
  { year: 2026, actions: 0, note: "You begin changing habits." },
  { year: 2030, actions: 3, note: "The first improvements appear." },
  { year: 2035, actions: 8, note: "The city becomes cleaner." },
  { year: 2040, actions: 15, note: "Better energy and transport systems appear." },
  { year: 2045, actions: 25, note: "Major challenges remain." },
  { year: 2050, actions: 40, note: "You see the future your school created." },
];

export function timelineYear(total: number): { year: number; note: string; next: { year: number; actions: number } | null } {
  let at = YEARS[0];
  for (const y of YEARS) if (total >= y.actions) at = y;
  const next = YEARS.find((y) => y.actions > total) ?? null;
  return { year: at.year, note: at.note, next: next ? { year: next.year, actions: next.actions } : null };
}

/**
 * School challenges, one per category. Other students' actions are DEMO
 * DATA (this prototype has no shared server): the baseline sits two
 * actions short of the target so your own real actions finish it.
 */
export const SCHOOL_TARGET = 500;
// Two short: today's alert-area missions (one small, one with a photo) can finish it in one day.
export const SCHOOL_DEMO_BASELINE = SCHOOL_TARGET - 2;

export function schoolChallenge(save: MissionsSave, cat: Category) {
  const yours = countIn(save, cat);
  const total = SCHOOL_DEMO_BASELINE + yours;
  return { demo: SCHOOL_DEMO_BASELINE, yours, total: Math.min(total, SCHOOL_TARGET), target: SCHOOL_TARGET, met: total >= SCHOOL_TARGET };
}

/** Categories whose school challenge is met but whose campus change hasn't been shown yet. */
export function newlyMet(save: MissionsSave): Category[] {
  return CATEGORIES.map((c) => c.id).filter((cat) => schoolChallenge(save, cat).met && !save.cityChanged.includes(cat));
}

export interface Badge {
  id: string;
  name: string;
  earned: boolean;
}

export function badges(save: MissionsSave, today: string): Badge[] {
  const total = save.completions.length;
  const s = streak(save, today);
  const cats = new Set(save.completions.map((c) => c.category));
  const best = Math.max(0, ...CATEGORIES.map((c) => countIn(save, c.id)));
  return [
    { id: "first", name: "First action", earned: total >= 1 },
    { id: "streak-3", name: "3-day streak", earned: s >= 3 },
    { id: "streak-7", name: "7-day streak", earned: s >= 7 },
    { id: "all-five", name: "All five areas", earned: cats.size === 5 },
    { id: "photo", name: "Proof in a photo", earned: save.completions.some((c) => c.big) },
    { id: "champion", name: "Area champion (5 in one area)", earned: best >= 5 },
    { id: "ten", name: "10 actions", earned: total >= 10 },
    { id: "year-2050", name: "Reached 2050", earned: total >= YEARS[YEARS.length - 1].actions },
  ];
}

/** Your measurable impact: counts of real actions, never converted into CO₂. */
export function impact(save: MissionsSave, today: string) {
  const ws = weekStart(today);
  const thisWeek = save.completions.filter((c) => c.day >= ws && c.day <= today);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, thisWeek.filter((x) => x.category === c.id).length])) as Record<Category, number>;
  const weeks = [3, 2, 1, 0].map((k) => {
    const from = addDays(ws, -7 * k);
    const to = addDays(from, 6);
    return { from, count: save.completions.filter((c) => c.day >= from && c.day <= to).length };
  });
  return {
    total: save.completions.length,
    thisWeek: thisWeek.length,
    byCategory,
    activeDaysThisWeek: new Set(thisWeek.map((c) => c.day)).size,
    daysIntoWeek: daysBetween(ws, today) + 1,
    streak: streak(save, today),
    weeks,
    photos: save.completions.filter((c) => c.big).length,
  };
}

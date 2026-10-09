// FutureShift rules. Pure and deterministic: no DOM, no randomness.

export type InterventionId = "trees" | "solar" | "bike" | "rain" | "roof";

export type HotspotId =
  | "trees-courtyard"
  | "trees-street"
  | "solar-roof"
  | "solar-canopy"
  | "bike-gate"
  | "rain-lowpoint"
  | "roof-academic"
  | "roof-cafeteria";

export type Placement = { id: InterventionId; spot: HotspotId };

export type Phase = "choose" | "ready" | "reveal" | "heatwave" | "result";

export const MAX_CHOICES = 3;

export type Intervention = {
  id: InterventionId;
  name: string;
  blurb: string;
  spots: HotspotId[];
};

export const INTERVENTIONS: Intervention[] = [
  { id: "trees", name: "Shade Trees", blurb: "Shade where students gather", spots: ["trees-courtyard", "trees-street"] },
  { id: "solar", name: "Solar Power", blurb: "Clean energy from the roof", spots: ["solar-roof", "solar-canopy"] },
  { id: "bike", name: "Bike Access", blurb: "Safe lanes, fewer cars", spots: ["bike-gate"] },
  { id: "rain", name: "Rain Garden", blurb: "Soaks up heavy rain", spots: ["rain-lowpoint"] },
  { id: "roof", name: "Cool Roof", blurb: "Green roof beats the heat", spots: ["roof-academic", "roof-cafeteria"] },
];

export const INTERVENTION_BY_ID = Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i])) as Record<
  InterventionId,
  Intervention
>;

export const SPOT_LABEL: Record<HotspotId, string> = {
  "trees-courtyard": "Courtyard",
  "trees-street": "School gate street",
  "solar-roof": "Classroom roof",
  "solar-canopy": "Car park canopy",
  "bike-gate": "Gate road",
  "rain-lowpoint": "Runoff corner",
  "roof-academic": "Classroom roof",
  "roof-cafeteria": "Cafeteria roof",
};

/** Physical surface a spot uses; two choices cannot share one. */
const SURFACE: Partial<Record<HotspotId, string>> = {
  "solar-roof": "academic-roof",
  "roof-academic": "academic-roof",
};

export const spotIntervention = (spot: HotspotId): InterventionId =>
  INTERVENTIONS.find((i) => i.spots.includes(spot))!.id;

export function isUsed(placements: Placement[], id: InterventionId) {
  return placements.some((p) => p.id === id);
}

export function spotBlocked(placements: Placement[], spot: HotspotId) {
  const s = SURFACE[spot];
  return !!s && placements.some((p) => SURFACE[p.spot] === s);
}

export function canPlace(placements: Placement[], phase: Phase, spot: HotspotId) {
  if (phase !== "choose") return false;
  if (placements.length >= MAX_CHOICES) return false;
  if (isUsed(placements, spotIntervention(spot))) return false;
  return !spotBlocked(placements, spot);
}

export function validSpots(placements: Placement[], phase: Phase, id: InterventionId) {
  return INTERVENTION_BY_ID[id].spots.filter((s) => canPlace(placements, phase, s));
}

export const has = (placements: Placement[], spot: HotspotId) => placements.some((p) => p.spot === spot);
export const hasId = (placements: Placement[], id: InterventionId) => placements.some((p) => p.id === id);

// ---------------------------------------------------------------- signals

export type Signals = { cooler: number; cleaner: number; safer: number };

/** Qualitative contribution of each change (FutureShift indicators, not measurements). */
const WEIGHTS: Record<InterventionId, Signals> = {
  trees: { cooler: 2, cleaner: 0, safer: 1 },
  solar: { cooler: 0, cleaner: 2, safer: 0 },
  bike: { cooler: 0, cleaner: 2, safer: 0 },
  rain: { cooler: 0, cleaner: 0, safer: 2 },
  roof: { cooler: 2, cleaner: 0, safer: 1 },
};

export function signals(placements: Placement[]): Signals {
  const s = { cooler: 0, cleaner: 0, safer: 0 };
  for (const p of placements) {
    const w = WEIGHTS[p.id];
    s.cooler += w.cooler;
    s.cleaner += w.cleaner;
    s.safer += w.safer;
  }
  return { cooler: Math.min(3, s.cooler), cleaner: Math.min(3, s.cleaner), safer: Math.min(3, s.safer) };
}

// ---------------------------------------------------------------- heatwave

export type ZoneId =
  | "court-seats"
  | "court-paths"
  | "terrace"
  | "gate"
  | "footpath"
  | "classrooms"
  | "top-floor"
  | "cafeteria";

export type Zone = { id: ZoneId; label: string; indoor: boolean; at: [number, number, number] };

/** The eight campus zones the 2050 heatwave checks. `at` is a tile position + height for markers. */
export const ZONES: Zone[] = [
  { id: "court-seats", label: "Courtyard seats", indoor: false, at: [7.3, 7.3, 0] },
  { id: "court-paths", label: "Courtyard paths", indoor: false, at: [9.3, 9.0, 0] },
  { id: "terrace", label: "Shaded terrace", indoor: false, at: [4.4, 5.4, 0] },
  { id: "gate", label: "School gate", indoor: false, at: [7.4, 10.9, 0] },
  { id: "footpath", label: "Drop-off footpath", indoor: false, at: [3.2, 11.9, 0] },
  { id: "classrooms", label: "Classrooms", indoor: true, at: [5.0, 3.3, 22] },
  { id: "top-floor", label: "Top-floor rooms", indoor: true, at: [9.3, 3.3, 46] },
  { id: "cafeteria", label: "Cafeteria", indoor: true, at: [3.3, 7.6, 18] },
];

export type ZoneResult = { id: ZoneId; comfortable: boolean; by: "shade" | "clean-power" | "roof" | "existing" | null };

export function zoneOutcome(placements: Placement[]): ZoneResult[] {
  const courtTrees = has(placements, "trees-courtyard");
  const streetTrees = has(placements, "trees-street");
  const solar = hasId(placements, "solar");
  const roofA = has(placements, "roof-academic");
  const roofC = has(placements, "roof-cafeteria");
  const r = (id: ZoneId, by: ZoneResult["by"]): ZoneResult => ({ id, comfortable: by !== null, by });
  return [
    r("court-seats", courtTrees ? "shade" : null),
    r("court-paths", courtTrees ? "shade" : null),
    r("terrace", "existing"),
    r("gate", streetTrees ? "shade" : null),
    r("footpath", streetTrees ? "shade" : null),
    r("classrooms", roofA ? "roof" : solar ? "clean-power" : null),
    r("top-floor", roofA ? "roof" : null),
    r("cafeteria", roofC ? "roof" : solar ? "clean-power" : null),
  ];
}

export type Resilience = "STRONG" | "MIXED" | "VULNERABLE";

export type HeatResult = {
  comfortable: number;
  total: number;
  cleanPower: boolean;
  resilience: Resilience;
  lines: [string, string, string];
  zones: ZoneResult[];
};

export function heatwaveResult(placements: Placement[]): HeatResult {
  const zones = zoneOutcome(placements);
  const comfortable = zones.filter((z) => z.comfortable).length;
  const cleanPower = hasId(placements, "solar");
  const resilience: Resilience = comfortable >= 6 ? "STRONG" : comfortable >= 4 ? "MIXED" : "VULNERABLE";
  const hot = (id: ZoneId) => !zones.find((z) => z.id === id)!.comfortable;
  let third: string;
  if (cleanPower) third = "Clean power covered cooling demand";
  else if (hot("court-seats") && hot("gate")) third = "More shade would protect the courtyard";
  else if (hot("classrooms")) third = "Solar could have powered the cooling";
  else third = "Cooling relied on grid power";
  return {
    comfortable,
    total: zones.length,
    cleanPower,
    resilience,
    lines: ["2050 HEATWAVE PASSED", `${comfortable}/${zones.length} campus zones stayed comfortable`, third],
    zones,
  };
}

// ---------------------------------------------------------------- real-world bridge

export type Bridge = { dimension: keyof Signals; question: string };

export function bridgePrompt(placements: Placement[]): Bridge {
  const s = signals(placements);
  const order: (keyof Signals)[] = ["cooler", "cleaner", "safer"];
  const weakest = order.reduce((a, b) => (s[b] < s[a] ? b : a), order[0]);
  const question = {
    cooler: "Where around your school needs more shade?",
    cleaner: "Where could students safely walk or cycle instead?",
    safer: "Where does rainwater collect around your school?",
  }[weakest];
  return { dimension: weakest, question };
}

// ---------------------------------------------------------------- state machine

export type GameState = {
  phase: Phase;
  placements: Placement[];
  /** The one undoable placement (the most recent), or null once used. */
  undoable: Placement | null;
  futuresCompleted: number;
};

export const initialState = (futuresCompleted = 0): GameState => ({
  phase: "choose",
  placements: [],
  undoable: null,
  futuresCompleted,
});

export function place(s: GameState, spot: HotspotId): GameState {
  if (!canPlace(s.placements, s.phase, spot)) return s;
  const p: Placement = { id: spotIntervention(spot), spot };
  const placements = [...s.placements, p];
  return { ...s, placements, undoable: p, phase: placements.length >= MAX_CHOICES ? "ready" : "choose" };
}

export function undo(s: GameState): GameState {
  if (!s.undoable || (s.phase !== "choose" && s.phase !== "ready")) return s;
  const target = s.undoable;
  return { ...s, placements: s.placements.filter((p) => p !== target), undoable: null, phase: "choose" };
}

export function reveal(s: GameState): GameState {
  return s.phase === "ready" ? { ...s, phase: "reveal", undoable: null } : s;
}

export function startHeatwave(s: GameState): GameState {
  return s.phase === "reveal" ? { ...s, phase: "heatwave" } : s;
}

export function finishHeatwave(s: GameState): GameState {
  return s.phase === "heatwave" ? { ...s, phase: "result", futuresCompleted: s.futuresCompleted + 1 } : s;
}

export function replay(s: GameState): GameState {
  return initialState(s.futuresCompleted);
}

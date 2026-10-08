import type { PieceDef } from "../model/pieces";

export function fmt(n: number) {
  const a = Math.abs(n);
  if (a >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/**
 * A rough eco grade for each piece (A best, E worst), from its footprint in
 * this game. It is a guide for players, not a certified rating.
 */
export const ECO_GRADE: Record<string, "A" | "B" | "C" | "D" | "E"> = {
  timber: "A",
  brick: "A",
  solarroof: "A",
  greenroof: "A",
  solar: "A",
  wind: "A",
  path: "A",
  bike: "A",
  bus: "A",
  oak: "A",
  pine: "A",
  flowers: "A",
  grass: "A",
  roof: "B",
  glass: "C",
  road: "C",
  concrete: "D",
  coal: "E",
  sunny: "B",
  rose: "B",
  sky: "B",
  shopfront: "A",
  slate: "A",
  terrace: "A",
  school: "A",
  cafe: "B",
  shop: "A",
  market: "A",
  park: "A",
  playground: "A",
  fountain: "B",
  library: "A",
  clinic: "B",
  plaza: "B",
  bikedock: "A",
  lamp: "B",
  bench: "A",
};

/** Up to two short footprint chips for a piece. */
export function chips(p: PieceDef): { text: string; tone: "good" | "bad" | "info" }[] {
  const out: { text: string; tone: "good" | "bad" | "info" }[] = [];
  if (p.housing) out.push({ text: `🏠 ${p.housing}`, tone: "info" });
  if (p.income) out.push({ text: `🪙 +${p.income}/min`, tone: "good" });
  if (p.solar || p.wind) out.push({ text: `⚡ +${p.solar ?? p.wind} clean`, tone: "good" });
  if (p.energy && p.energy > 0) out.push({ text: `⚡ +${p.energy}`, tone: "info" });
  if (p.emit) out.push({ text: "Smoke", tone: "bad" });
  if (p.cover) out.push({ text: "Fewer car trips", tone: "good" });
  if (p.nice && p.nice >= 3) out.push({ text: "Happier nearby", tone: "good" });
  if (p.absorb && p.absorb >= 0.2) out.push({ text: "Cleans air", tone: "good" });
  if (p.carbon < 0) out.push({ text: "Stores carbon", tone: "good" });
  else if (p.carbon >= 5 && !p.emit && p.cat !== "town") out.push({ text: "High carbon", tone: "bad" });
  if (p.insul && p.insul > 1.1) out.push({ text: "Leaks heat", tone: "bad" });
  return out.slice(0, 2);
}

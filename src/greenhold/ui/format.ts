import type { PieceDef } from "../model/pieces";

export function fmt(n: number) {
  const a = Math.abs(n);
  if (a >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function dur(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/**
 * A rough eco grade for each piece (A best, E worst), from its footprint in
 * this game: carbon to make it, carbon and smoke while it runs, and what it
 * saves. It is a guide for players, not a certified rating.
 */
export const ECO_GRADE: Record<string, "A" | "B" | "C" | "D" | "E"> = {
  path: "A",
  bike: "A",
  grass: "A",
  garden: "A",
  pond: "A",
  oak: "A",
  pine: "A",
  flowers: "A",
  timber: "A",
  brick: "A",
  greenroof: "A",
  solarroof: "A",
  solar: "A",
  wind: "A",
  raintank: "A",
  compost: "A",
  bus: "A",
  tram: "A",
  recycling: "B",
  battery: "B",
  farmblock: "B",
  roof: "B",
  well: "B",
  glass: "C",
  road: "C",
  concrete: "D",
  landfill: "D",
  coal: "E",
};

/** Short footprint chips for a piece card. */
export function chips(p: PieceDef): { text: string; tone: "good" | "bad" | "info" }[] {
  const out: { text: string; tone: "good" | "bad" | "info" }[] = [];
  if (p.housing) out.push({ text: `🏠 ${p.housing}`, tone: "info" });
  if (p.energy && p.energy > 0) out.push({ text: `⚡ +${p.energy}`, tone: "info" });
  if (p.solar) out.push({ text: `☀️ +${p.solar}`, tone: "good" });
  if (p.wind) out.push({ text: `🌬️ +${p.wind}`, tone: "good" });
  if (p.energy && p.energy < 0) out.push({ text: `⚡ ${p.energy}`, tone: "info" });
  if (p.water && p.water > 0) out.push({ text: `💧 +${p.water}`, tone: "info" });
  if (p.rain) out.push({ text: `🌧️ +${p.rain}`, tone: "good" });
  if (p.food) out.push({ text: `🥕 +${p.food}`, tone: "good" });
  if (p.compost) out.push({ text: `♻️ ${p.compost}`, tone: "good" });
  if (p.recycle) out.push({ text: `♻️ ${p.recycle}`, tone: "good" });
  if (p.landfill) out.push({ text: `🗑️ ${p.landfill}`, tone: "bad" });
  if (p.cover) out.push({ text: `🚲 ${p.cover} tiles`, tone: "good" });
  if (p.co2) out.push({ text: `CO₂ ${p.co2}/min`, tone: "bad" });
  if (p.emit) out.push({ text: "Smoke", tone: "bad" });
  if (p.upkeep) out.push({ text: `🪙 −${p.upkeep}/min`, tone: "bad" });
  if (p.absorb && p.absorb >= 0.2) out.push({ text: "Cleans air", tone: "good" });
  if (p.carbon < 0) out.push({ text: "Stores carbon", tone: "good" });
  else if (p.carbon >= 5) out.push({ text: `CO₂ ${p.carbon} to make`, tone: "bad" });
  if (p.insul && p.insul < 1) out.push({ text: "Well insulated", tone: "good" });
  if (p.insul && p.insul > 1.1) out.push({ text: "Leaks heat", tone: "bad" });
  return out.slice(0, 4);
}

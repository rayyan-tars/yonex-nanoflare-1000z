/**
 * Eco Vision: what the town's power, air and traffic look like as flows.
 * The simulation pools power town-wide; to draw it, power is routed the
 * way a simple grid dispatches it: clean sources first (sun and wind cost
 * nothing to run), each serving its nearest homes, with coal filling the
 * gap. Simplified Greenhold simulation indicators, not real engineering.
 */
import { piece } from "./pieces";
import { AIR_OK, WEATHER, type Stats } from "./sim";
import { xy, type Town } from "./world";

export type PowerKind = "clean" | "coal";

export interface PowerSource {
  i: number;
  kind: PowerKind;
  /** Today's output, with the weather. */
  out: number;
  /** How many homes and power users it supplies. */
  served: number;
}

export interface PowerLink {
  a: number;
  b: number;
  kind: PowerKind;
  /** Steps from the source along the network (for drawing it outward). */
  depth: number;
}

export interface PowerNetwork {
  sources: PowerSource[];
  links: PowerLink[];
  /** Where each home and power user gets its power ("none" = not enough to go round). */
  fed: Map<number, PowerKind | "none">;
}

const dist = (a: number, b: number) => {
  const p = xy(a);
  const q = xy(b);
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
};

/** The power each column draws: homes by residents and insulation, plus machines that use power. */
function loads(t: Town, s: Stats) {
  const occ = s.housing ? Math.min(t.residents, s.housing) / s.housing : 0;
  const homes = new Set(s.homes);
  const out = new Map<number, number>();
  t.cols.forEach((c, i) => {
    if (!c.s.length) return;
    const ps = c.s.map(piece);
    let n = 0;
    if (homes.has(i)) {
      const tp = ps[ps.length - 1];
      n += ps.filter((p) => p.kind === "block").reduce((m, p) => m + (p.housing ?? 0) * (p.insul ?? 1), 0) * (tp.insul ?? 1) * occ;
    }
    for (const p of ps) if (p.energy && p.energy < 0) n -= p.energy;
    if (n > 0) out.set(i, n);
  });
  return out;
}

export function powerNetwork(t: Town, s: Stats): PowerNetwork {
  const w = WEATHER[s.weather];
  const wet = s.weather === "rain" || s.weather === "storm";
  const sources: PowerSource[] = [];
  t.cols.forEach((c, i) => {
    let clean = 0;
    let dirty = 0;
    for (const id of c.s) {
      const p = piece(id);
      if (p.energy && p.energy > 0) dirty += p.energy;
      if (p.solar) clean += p.solar * w.solar;
      if (p.wind) clean += p.wind * w.wind;
      if (p.hydro) clean += p.hydro * (wet ? 1.1 : 1);
    }
    if (clean > 0) sources.push({ i, kind: "clean", out: clean, served: 0 });
    if (dirty > 0) sources.push({ i, kind: "coal", out: dirty, served: 0 });
  });
  const need = loads(t, s);
  const fed = new Map<number, PowerKind | "none">();
  const served = new Map<PowerSource, number[]>();
  for (const kind of ["clean", "coal"] as const) {
    const left = new Map<PowerSource, number>();
    const pairs: { src: PowerSource; sink: number; d: number }[] = [];
    for (const src of sources) {
      if (src.kind !== kind) continue;
      left.set(src, src.out);
      served.set(src, []);
      for (const sink of need.keys()) if (!fed.has(sink)) pairs.push({ src, sink, d: dist(src.i, sink) });
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const { src, sink } of pairs) {
      if (fed.has(sink) || left.get(src)! <= 0) continue;
      left.set(src, left.get(src)! - need.get(sink)!);
      fed.set(sink, kind);
      served.get(src)!.push(sink);
      src.served++;
    }
  }
  for (const sink of need.keys()) if (!fed.has(sink)) fed.set(sink, "none");

  // Each source's homes joined up the shortest way (a minimum spanning tree from the source).
  const links: PowerLink[] = [];
  for (const [src, sinks] of served) {
    const inTree = [src.i];
    const depth = new Map([[src.i, 0]]);
    const rest = sinks.filter((k) => k !== src.i);
    while (rest.length) {
      let best = 0;
      let from = src.i;
      let bd = Infinity;
      rest.forEach((r, k) => {
        for (const n of inTree) {
          const d = dist(n, r);
          if (d < bd) {
            bd = d;
            best = k;
            from = n;
          }
        }
      });
      const to = rest.splice(best, 1)[0];
      depth.set(to, depth.get(from)! + 1);
      inTree.push(to);
      links.push({ a: from, b: to, kind: src.kind, depth: depth.get(to)! });
    }
  }
  return { sources, links, fed };
}

export interface EcoSummary {
  /** Homes breathing air above the "OK" line. */
  smoggyHomes: number;
  cleanHomes: number;
  coalHomes: number;
  unpoweredHomes: number;
  homes: number;
}

export function ecoSummary(s: Stats, air: Float32Array, net: PowerNetwork): EcoSummary {
  let smoggy = 0;
  let clean = 0;
  let coal = 0;
  let none = 0;
  for (const h of s.homes) {
    if (air[h] >= AIR_OK) smoggy++;
    const f = net.fed.get(h);
    if (f === "clean") clean++;
    else if (f === "coal") coal++;
    else if (f === "none") none++;
  }
  return { smoggyHomes: smoggy, cleanHomes: clean, coalHomes: coal, unpoweredHomes: none, homes: s.homes.length };
}

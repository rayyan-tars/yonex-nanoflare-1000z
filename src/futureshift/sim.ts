// People and traffic for one era. Deterministic seeds, pooled agents, no
// allocation per frame. Each era (Today / 2050) owns one World.

import { AREAS, DOORS, DROP_X, GX, LANES, type AreaId, type Rect } from "./campus";
import { has, hasId, type Placement } from "./model";
import { CARS, LOOKS, type Era } from "./art";
import { rng } from "./iso";

export type Student = {
  look: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  area: AreaId;
  state: "walk" | "idle" | "gone";
  t: number;
  alpha: number;
  speed: number;
  phase: number;
  flip: boolean;
  sit: boolean;
};

export type Walker = { look: number; x: number; y: number; dir: 1 | -1; speed: number; phase: number; active: boolean; wait: number };

export type Car = {
  spec: number;
  lane: "east" | "west";
  x: number;
  y: number;
  speed: number;
  active: boolean;
  wait: number;
  drop: boolean;
  stopT: number;
  dropped: boolean;
};

export type Cyclist = {
  look: number;
  path: [number, number][];
  i: number;
  x: number;
  y: number;
  active: boolean;
  wait: number;
  phase: number;
  flip: boolean;
  alpha: number;
};

export type Puff = { x: number; y: number; age: number; life: number; active: boolean };

const N_STUDENTS = 30;
const N_WALKERS = 6;
const N_CARS = 6;
const N_CYCLISTS = 4;
const N_PUFFS = 18;

export type Plan = {
  areas: Partial<Record<AreaId, number>>;
  walkers: number;
  carsEast: number;
  carsWest: number;
  dropRate: number;
  cyclists: number;
  cyclistGap: number;
  hurry: boolean;
};

/** Who is where, given an era, the player's changes and heatwave intensity (0..1). */
export function planFor(era: Era, pl: Placement[], heat: number): Plan {
  if (era === "today") {
    return {
      areas: { terrace: 7, "court-open": 3, "court-seats": 2, gate: 4, sports: 4 },
      walkers: 3,
      carsEast: 3,
      carsWest: 2,
      dropRate: 0.7,
      cyclists: has(pl, "bike-gate") ? 1 : 0,
      cyclistGap: 7,
      hurry: false,
    };
  }
  const courtTrees = has(pl, "trees-courtyard");
  const streetTrees = has(pl, "trees-street");
  const bike = hasId(pl, "bike");
  const rain = hasId(pl, "rain");
  const cool = courtTrees || has(pl, "roof-academic") || has(pl, "roof-cafeteria");
  const a: Partial<Record<AreaId, number>> = {};
  if (heat < 0.35) {
    if (courtTrees) Object.assign(a, { "court-shade": 8, "court-seats": 5, "court-open": 4, terrace: 4 });
    else Object.assign(a, { terrace: 8, "court-open": 1 });
    a.gate = streetTrees ? 6 : 4;
    a.sports = cool ? 5 : 3;
    if (rain) a.garden = 2;
    if (bike) a.racks = 2;
  } else {
    if (courtTrees) Object.assign(a, { "court-shade": 12, terrace: 5 });
    else Object.assign(a, { terrace: 9 });
    a[streetTrees ? "gate-shade" : "gate"] = streetTrees ? 5 : 1;
    if (bike) a.racks = 1;
  }
  return {
    areas: a,
    walkers: heat < 0.35 ? (streetTrees ? 5 : 3) : streetTrees ? 4 : 1,
    carsEast: bike ? 1 : 5,
    carsWest: bike ? 1 : 3,
    dropRate: bike ? 0.4 : 0.9,
    cyclists: bike ? 4 : 0,
    cyclistGap: 2.6,
    hurry: heat >= 0.35 && !streetTrees,
  };
}

const OUTDOOR = (a: AreaId) => a !== "indoor-academic" && a !== "indoor-cafeteria";
const SIT_AREAS = new Set<AreaId>(["court-seats"]);

function pick(r: Rect[], R: () => number): [number, number] {
  const q = r[Math.floor(R() * r.length) % r.length];
  return [q.x0 + R() * (q.x1 - q.x0), q.y0 + R() * (q.y1 - q.y0)];
}

function nearestDoor(x: number, y: number) {
  const a = DOORS.academic;
  const c = DOORS.cafeteria;
  return (x - a.x) ** 2 + (y - a.y) ** 2 < (x - c.x) ** 2 + (y - c.y) ** 2 ? a : c;
}

export class World {
  students: Student[] = [];
  walkers: Walker[] = [];
  cars: Car[] = [];
  cyclists: Cyclist[] = [];
  puffs: Puff[] = [];
  plan: Plan;
  private R: () => number;
  private cycTimer = 0;
  private puffTimer = 0;
  /** Set when a cyclist starts riding; the scene uses it for the bike bell. */
  cyclistStarted = 0;

  constructor(
    public era: Era,
    seed: number,
    pl: Placement[],
  ) {
    this.R = rng(seed);
    const R = this.R;
    this.plan = planFor(era, pl, 0);
    for (let i = 0; i < N_STUDENTS; i++) {
      this.students.push({
        look: i % (LOOKS.length - 1),
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        area: "indoor-academic",
        state: "gone",
        t: R() * 3,
        alpha: 0,
        speed: 0.45 + R() * 0.2,
        phase: R() * 10,
        flip: false,
        sit: false,
      });
    }
    // one teacher on duty
    this.students[N_STUDENTS - 1].look = LOOKS.length - 1;
    for (let i = 0; i < N_WALKERS; i++)
      this.walkers.push({ look: (i * 3) % LOOKS.length, x: R() * GX, y: 11.9 + R() * 0.3, dir: i % 2 ? 1 : -1, speed: 0.38 + R() * 0.15, phase: R() * 10, active: false, wait: R() * 4 });
    for (let i = 0; i < N_CARS * 2; i++)
      this.cars.push({ spec: i % CARS.length, lane: i < N_CARS ? "east" : "west", x: 0, y: 0, speed: 0, active: false, wait: R() * 6, drop: false, stopT: 0, dropped: false });
    for (let i = 0; i < N_CYCLISTS; i++)
      this.cyclists.push({ look: (i * 5 + 2) % (LOOKS.length - 1), path: [], i: 0, x: 0, y: 0, active: false, wait: 0, phase: R() * 10, flip: false, alpha: 0 });
    for (let i = 0; i < N_PUFFS; i++) this.puffs.push({ x: 0, y: 0, age: 0, life: 1, active: false });
    this.applyPlan(this.plan, true);
    this.seedTraffic();
  }

  setPlan(p: Plan) {
    this.plan = p;
    this.applyPlan(p, false);
  }

  /** Reassign students to areas, keeping anyone already where they're needed. */
  private applyPlan(p: Plan, instant: boolean) {
    const R = this.R;
    const want = new Map<AreaId, number>();
    for (const [k, v] of Object.entries(p.areas)) want.set(k as AreaId, v ?? 0);
    const free: Student[] = [];
    for (const s of this.students) {
      const n = want.get(s.area) ?? 0;
      if (OUTDOOR(s.area) && n > 0) want.set(s.area, n - 1);
      else if (!OUTDOOR(s.area)) free.push(s);
      else free.push(s);
    }
    // reuse students that are already outside first, so people visibly walk to shade
    free.sort((a, b) => Number(OUTDOOR(b.area)) - Number(OUTDOOR(a.area)));
    for (const s of free) {
      let target: AreaId | null = null;
      // prefer the nearest wanted area
      let best = Infinity;
      for (const [area, n] of want) {
        if (n <= 0) continue;
        const r = AREAS[area][0];
        const d = (s.x - (r.x0 + r.x1) / 2) ** 2 + (s.y - (r.y0 + r.y1) / 2) ** 2;
        const score = s.state === "gone" ? R() : d;
        if (score < best) {
          best = score;
          target = area;
        }
      }
      if (target) {
        want.set(target, want.get(target)! - 1);
        this.sendTo(s, target, instant);
      } else if (OUTDOOR(s.area)) {
        const door = nearestDoor(s.x, s.y);
        this.sendTo(s, door === DOORS.academic ? "indoor-academic" : "indoor-cafeteria", instant);
      }
    }
  }

  private sendTo(s: Student, area: AreaId, instant: boolean) {
    const R = this.R;
    const wasOut = OUTDOOR(s.area) && s.state !== "gone";
    s.area = area;
    s.sit = false;
    if (!OUTDOOR(area)) {
      const d = area === "indoor-academic" ? DOORS.academic : DOORS.cafeteria;
      if (instant || !wasOut) {
        s.state = "gone";
        s.alpha = 0;
        s.x = d.x;
        s.y = d.y;
        return;
      }
      s.tx = d.x;
      s.ty = d.y;
      s.state = "walk";
      return;
    }
    const [tx, ty] = pick(AREAS[area], R);
    if (instant) {
      s.x = tx;
      s.y = ty;
      s.tx = tx;
      s.ty = ty;
      s.state = "idle";
      s.alpha = 1;
      s.t = 1 + R() * 4;
      s.sit = SIT_AREAS.has(area);
      return;
    }
    if (!wasOut) {
      const d = nearestDoor(tx, ty);
      s.x = d.x;
      s.y = d.y;
      s.alpha = 0;
    }
    s.tx = tx;
    s.ty = ty;
    s.state = "walk";
  }

  private seedTraffic() {
    const p = this.plan;
    let e = 0;
    let w = 0;
    for (const c of this.cars) {
      if (c.lane === "east" && e < p.carsEast) {
        this.spawnCar(c, 1 + e * (GX / Math.max(1, p.carsEast)));
        e++;
      } else if (c.lane === "west" && w < p.carsWest) {
        this.spawnCar(c, GX - 1 - w * (GX / Math.max(1, p.carsWest)));
        w++;
      }
    }
  }

  private spawnCar(c: Car, x?: number) {
    c.active = true;
    c.x = x ?? (c.lane === "east" ? -1.4 : GX + 1.4);
    c.y = c.lane === "east" ? (this.plan.cyclists > 0 ? LANES.eastBike : LANES.east) : LANES.west;
    c.speed = 1.5;
    c.drop = c.lane === "east" && this.R() < this.plan.dropRate;
    c.dropped = x !== undefined && x > DROP_X;
    c.stopT = 0;
  }

  private spawnCyclist(c: Cyclist) {
    const R = this.R;
    const through = R() < 0.35;
    const y = LANES.bike;
    c.path = through
      ? [
          [-1.2, y],
          [GX + 1.2, y],
        ]
      : [
          [-1.2, y],
          [7.55, y],
          [7.75, 11.0],
          [8.7, 10.62],
          [9.0 + R() * 1.1, 10.55],
        ];
    c.i = 1;
    c.x = c.path[0][0];
    c.y = c.path[0][1];
    c.active = true;
    c.alpha = 1;
    this.cyclistStarted++;
  }

  /** Launch a cyclist right now (used for "first cyclist passes"). */
  kickCyclist() {
    const c = this.cyclists.find((k) => !k.active);
    if (c) {
      this.spawnCyclist(c);
      this.cycTimer = this.plan.cyclistGap;
    }
  }

  update(dt: number) {
    const R = this.R;
    const p = this.plan;
    for (const s of this.students) {
      s.phase += dt;
      if (s.state === "gone") continue;
      if (s.state === "walk") {
        if (s.alpha < 1) s.alpha = Math.min(1, s.alpha + dt * 2.5);
        const dx = s.tx - s.x;
        const dy = s.ty - s.y;
        const d = Math.hypot(dx, dy);
        const sp = s.speed * (p.hurry ? 1.6 : 1);
        if (d < 0.05) {
          if (!OUTDOOR(s.area)) {
            s.state = "gone";
            s.alpha = 0;
          } else {
            s.state = "idle";
            s.t = 1.5 + R() * 4.5;
            s.sit = SIT_AREAS.has(s.area);
          }
        } else {
          const k = Math.min(1, (sp * dt) / d);
          s.x += dx * k;
          s.y += dy * k;
          s.flip = dx - dy < 0;
          // fade out as they step through a door
          if (!OUTDOOR(s.area) && d < 0.3) s.alpha = Math.max(0, d / 0.3);
        }
      } else {
        s.t -= dt;
        if (s.t <= 0) {
          if (s.sit && R() < 0.6) {
            s.t = 3 + R() * 5;
            continue;
          }
          const [tx, ty] = pick(AREAS[s.area], R);
          // short wander inside the same area
          s.tx = s.x + (tx - s.x) * 0.6;
          s.ty = s.y + (ty - s.y) * 0.6;
          s.state = "walk";
          s.sit = false;
        }
      }
    }

    // footpath walkers
    let activeWalkers = this.walkers.filter((w) => w.active).length;
    for (const w of this.walkers) {
      w.phase += dt;
      if (!w.active) {
        w.wait -= dt;
        if (w.wait <= 0 && activeWalkers < p.walkers) {
          w.active = true;
          w.x = w.dir === 1 ? -0.4 : GX + 0.4;
          activeWalkers++;
        }
        continue;
      }
      w.x += w.dir * w.speed * (p.hurry ? 1.7 : 1) * dt;
      if (w.x < -0.6 || w.x > GX + 0.6) {
        w.active = false;
        w.wait = 1 + R() * 4;
        activeWalkers--;
      }
    }

    // cars
    const eastActive = this.cars.filter((c) => c.active && c.lane === "east").length;
    const westActive = this.cars.filter((c) => c.active && c.lane === "west").length;
    let eCount = eastActive;
    let wCount = westActive;
    for (const c of this.cars) {
      if (!c.active) {
        c.wait -= dt;
        const quota = c.lane === "east" ? p.carsEast - eCount : p.carsWest - wCount;
        if (c.wait <= 0 && quota > 0 && this.laneClear(c.lane)) {
          this.spawnCar(c);
          if (c.lane === "east") eCount++;
          else wCount++;
        }
        continue;
      }
      const dir = c.lane === "east" ? 1 : -1;
      let target = 1.6;
      // keep distance to the car ahead
      let gap = Infinity;
      for (const o of this.cars) {
        if (o === c || !o.active || o.lane !== c.lane) continue;
        const d = (o.x - c.x) * dir;
        if (d > 0 && d < gap) gap = d;
      }
      if (gap < 0.62) target = 0;
      else if (gap < 1.1) target = Math.min(target, (gap - 0.62) * 3);
      if (c.drop && !c.dropped) {
        const d = (DROP_X - c.x) * dir;
        if (d < 0.05) {
          c.stopT += dt;
          target = 0;
          if (c.stopT > 2.4) c.dropped = true;
          this.emitPuff(c, dt);
        } else if (d < 1.2) target = Math.min(target, 0.3 + d * 1.1);
      }
      c.speed += (target - c.speed) * Math.min(1, dt * 4);
      c.x += dir * c.speed * dt;
      if (c.speed < 0.25) this.emitPuff(c, dt * 0.5);
      if ((dir === 1 && c.x > GX + 1.5) || (dir === -1 && c.x < -1.5)) {
        c.active = false;
        c.wait = 0.6 + R() * 2.5;
        if (c.lane === "east") eCount--;
        else wCount--;
      }
      // the excess car leaves when the plan shrinks (fewer cars in 2050 with bikes)
    }

    // cyclists
    this.cycTimer -= dt;
    const activeCyc = this.cyclists.filter((c) => c.active).length;
    if (p.cyclists > 0 && this.cycTimer <= 0 && activeCyc < p.cyclists) {
      const c = this.cyclists.find((k) => !k.active);
      if (c) this.spawnCyclist(c);
      this.cycTimer = p.cyclistGap * (0.7 + R() * 0.6);
    }
    for (const c of this.cyclists) {
      if (!c.active) continue;
      c.phase += dt;
      const [tx, ty] = c.path[c.i];
      const dx = tx - c.x;
      const dy = ty - c.y;
      const d = Math.hypot(dx, dy);
      const sp = c.i >= 3 ? 0.7 : 1.35;
      if (d < 0.06) {
        c.i++;
        if (c.i >= c.path.length) {
          c.active = false;
        }
        continue;
      }
      const k = Math.min(1, (sp * dt) / d);
      c.x += dx * k;
      c.y += dy * k;
      c.flip = dx - dy < 0;
      if (c.i === c.path.length - 1 && d < 0.4) c.alpha = d / 0.4;
    }

    // exhaust puffs
    for (const f of this.puffs) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= f.life) f.active = false;
    }
  }

  private laneClear(lane: "east" | "west") {
    const edge = lane === "east" ? -1.4 : GX + 1.4;
    return !this.cars.some((c) => c.active && c.lane === lane && Math.abs(c.x - edge) < 1.3);
  }

  private emitPuff(c: Car, dt: number) {
    this.puffTimer -= dt;
    if (this.puffTimer > 0) return;
    this.puffTimer = 0.55;
    const f = this.puffs.find((q) => !q.active);
    if (!f) return;
    const dir = c.lane === "east" ? 1 : -1;
    f.x = c.x - dir * 0.24;
    f.y = c.y;
    f.age = 0;
    f.life = 2.4;
    f.active = true;
  }

  /** Number of visible students in an area (used by tests and the result). */
  countIn(area: AreaId) {
    return this.students.filter((s) => s.area === area && s.state !== "gone").length;
  }

  outdoorCount() {
    return this.students.filter((s) => OUTDOOR(s.area)).length;
  }
}

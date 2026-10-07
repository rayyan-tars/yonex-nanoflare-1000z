import Phaser from "phaser";
import type { RoundReport } from "../model/report";
import { UNITS_PER_PORTION } from "../model/config";
import { iso, type BakedTexture } from "./art/iso";
import type { ArtCatalog, PersonFrames } from "./art/textures";
import {
  DESTINATIONS,
  HOMES,
  KITCHEN,
  QUEUE_SLOTS,
  SERVE_POINT,
  TRAY_RETURN,
  TRAY_RETURN_APPROACH,
  doorTile,
  findPath,
} from "./layout";

type Pt = { x: number; y: number };
type FigOutcome = "regular" | "small" | "missed-food" | "missed-time";

/** Game minutes per real second at 1× (a 20-minute lunch plays in about 16 s). */
const MIN_PER_SEC = 1.25;
/** Walking speed in tiles per real second at 1×. */
const WALK = 1.7;
const INITIAL_QUEUE = 8;
const QUEUE_LEAD = 7;
/** Real seconds of anticipation before the first student is served. */
const OPENING = 0.85;

const SPAWNS: Pt[] = [
  ...HOMES.map(doorTile),
  { x: 6, y: 12 },
  { x: 2, y: 7 },
  { x: 3, y: 11 },
  { x: 11, y: 11 },
];

interface Fig {
  look: PersonFrames;
  sprite: Phaser.GameObjects.Image;
  tray: Phaser.GameObjects.Image | null;
  bubble: Phaser.GameObjects.Image | null;
  outcome: FigOutcome;
  /** Diners represented: [start, end). */
  start: number;
  end: number;
  eventMinute: number;
  spawnMinute: number;
  spawn: Pt;
  state: "waiting" | "toQueue" | "queued" | "after" | "done";
  px: number;
  py: number;
  route: Pt[];
  onArrive: (() => void) | null;
  pause: number;
  afterPause: (() => void) | null;
  frame: 0 | 1;
  stride: number;
  facing: "front" | "back";
  seatJitter: Pt;
  /** Walking speed multiplier (students sent away walk slowly). */
  pace: number;
}

export type ServiceMoment = "open" | "food-out" | "finale";

export interface ServiceHooks {
  onProgress(processed: number): void;
  onDone(): void;
  makeLabel(text: string, at: Pt & { z: number }, tone: "neutral" | "warn" | "bad"): Phaser.GameObjects.Text;
  isReduced(): boolean;
  /** Signature moments, for camera and lighting in the scene. */
  onMoment(moment: ServiceMoment, report: RoundReport): void;
}

export interface ServiceProps {
  pans: Record<"full" | "half" | "empty", Phaser.GameObjects.Image>;
  shutter: Phaser.GameObjects.Image;
  scraps: Phaser.GameObjects.Image;
  sparkles: Phaser.GameObjects.Image[];
  /** Ground highlight over the service yard, for leftover food. */
  yardRing: Phaser.GameObjects.Image;
}

const centre = (t: Pt): Pt => ({ x: t.x + 0.5, y: t.y + 0.5 });
const tileOf = (p: Pt): Pt => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/**
 * Plays back an already computed lunch service. Every count it reports
 * comes from the report's timeline; the figures only illustrate it
 * (1 figure ≈ several diners).
 */
export class ServiceDirector {
  private figs: Fig[] = [];
  private queue: Fig[] = [];
  private report: RoundReport | null = null;
  private clock = 0;
  private speed = 1;
  private next = 0;
  private finishedAt: number | null = null;
  private realTime = 0;
  private done = false;
  private finalized = false;
  private extras: Phaser.GameObjects.GameObject[] = [];
  private scrapsLevel = 0;
  private seatCounter = 0;
  private time = 0;
  private opening = 0;
  private foodOutShown = false;
  private missedCount = 0;
  readonly perFigure: number = 1;

  constructor(
    private scene: Phaser.Scene,
    private art: ArtCatalog,
    private props: ServiceProps,
    private hooks: ServiceHooks,
    private maxFigures: number,
  ) {}

  get active() {
    return this.report !== null && !this.done;
  }

  static figuresFor(attendance: number, maxFigures: number) {
    return Math.max(1, Math.ceil(attendance / maxFigures));
  }

  start(report: RoundReport) {
    this.reset();
    this.report = report;
    const steps = report.timeline.steps;
    const n = steps.length;
    const per = ServiceDirector.figuresFor(n, this.maxFigures);
    (this as { perFigure: number }).perFigure = per;
    this.setPans();

    const count = Math.ceil(n / per);
    let lastSpawn = 0;
    for (let k = 0; k < count; k++) {
      const start = k * per;
      const end = Math.min(n, start + per);
      const outcomes = report.player.result.outcomes.slice(start, end);
      const served = outcomes.filter((o) => o === "regular" || o === "small").length;
      const small = outcomes.filter((o) => o === "small").length;
      const missedTime = outcomes.filter((o) => o === "missed-time").length;
      const outcome: FigOutcome =
        served * 2 >= outcomes.length
          ? small * 2 > served
            ? "small"
            : "regular"
          : missedTime * 2 >= outcomes.length - served
            ? "missed-time"
            : "missed-food";
      const eventMinute = steps[end - 1].minute;
      const spawn = SPAWNS[(k * 7) % SPAWNS.length];
      const look = this.art.people[(k * 5 + 3) % this.art.people.length];
      // Join the queue roughly when the figure several places ahead is served.
      const enqueueAt = k < INITIAL_QUEUE ? 0 : steps[Math.max(0, (k - QUEUE_LEAD) * per + per - 1)].minute;
      const travel = (this.routeLength(spawn, this.slotFor(QUEUE_LEAD)) / WALK) * MIN_PER_SEC;
      const spawnMinute = k < INITIAL_QUEUE ? -1 : Math.max(lastSpawn, enqueueAt - travel, 0);
      lastSpawn = Math.max(lastSpawn, spawnMinute);
      const f0 = look.front[0];
      const sprite = this.scene.add
        .image(0, 0, f0.key, f0.frame)
        .setOrigin(f0.originX, f0.originY)
        .setScale(1 / f0.scale)
        .setVisible(false);
      this.figs.push({
        look,
        sprite,
        tray: null,
        bubble: null,
        outcome,
        start,
        end,
        eventMinute,
        spawnMinute,
        spawn,
        state: "waiting",
        px: 0,
        py: 0,
        route: [],
        onArrive: null,
        pause: 0,
        afterPause: null,
        frame: 0,
        stride: 0,
        facing: "front",
        seatJitter: { x: (((k * 37) % 10) / 10 - 0.5) * 0.5, y: (((k * 53) % 10) / 10 - 0.5) * 0.4 },
        pace: 1,
      });
    }
    // Students already waiting when the hatch opens; they shuffle forward
    // during a short opening beat before the first meal is served.
    this.opening = this.hooks.isReduced() ? 0 : OPENING;
    this.figs.slice(0, INITIAL_QUEUE).forEach((f, i) => this.spawnFig(f, true, i));
    this.hooks.onProgress(0);
    this.hooks.onMoment("open", report);
    if (n === 0) this.finalize(true);
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  /** Jumps straight to the final state. Counts are identical to normal playback. */
  skip() {
    if (!this.report || this.done) return;
    this.next = this.figs.length;
    for (const f of this.figs) this.removeFig(f);
    this.figs = [];
    this.queue = [];
    this.hooks.onProgress(this.report.timeline.steps.length);
    this.setPans();
    this.finalize(true);
  }

  /** Hides or shows the end-of-lunch props (used while drawing the 2050 views). */
  setExtrasVisible(visible: boolean) {
    for (const e of this.extras) (e as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
  }

  reset() {
    for (const f of this.figs) this.removeFig(f);
    this.figs = [];
    this.queue = [];
    this.extras.forEach((e) => e.destroy());
    this.extras = [];
    this.report = null;
    this.clock = 0;
    this.next = 0;
    this.finishedAt = null;
    this.realTime = 0;
    this.done = false;
    this.finalized = false;
    this.scrapsLevel = 0;
    this.seatCounter = 0;
    this.speed = 1;
    this.opening = 0;
    this.foodOutShown = false;
    this.missedCount = 0;
    this.scene.tweens.killTweensOf([this.props.shutter, this.props.scraps, this.props.yardRing]);
    this.props.yardRing.setVisible(false);
    this.props.shutter.setVisible(false).setAlpha(0).setY(this.shutterY());
    this.props.scraps.setVisible(false).setScale(0.3 / this.art.scraps.scale);
    this.props.pans.full.setVisible(true);
    this.props.pans.half.setVisible(false);
    this.props.pans.empty.setVisible(false);
  }

  // ------------------------------------------------------------ helpers

  private slotFor(index: number): Pt {
    return QUEUE_SLOTS[Math.min(index, QUEUE_SLOTS.length - 1)];
  }

  private routeLength(from: Pt, to: Pt) {
    const p = findPath(from, tileOf(to));
    return p ? p.length : 8;
  }

  /** Tile-centre route to `goal`, ending exactly on the goal point. */
  private routeTo(fromPt: Pt, goal: Pt): Pt[] {
    const p = findPath(tileOf(fromPt), tileOf(goal));
    const pts = p ? p.slice(1).map(centre) : [];
    if (pts.length) pts.pop();
    pts.push(goal);
    return pts;
  }

  private shutterBaseY: number | null = null;
  private shutterY() {
    if (this.shutterBaseY === null) this.shutterBaseY = this.props.shutter.y;
    return this.shutterBaseY;
  }

  private spawnFig(f: Fig, inQueue: boolean, order = 0) {
    this.queue.push(f);
    const slot = this.slotFor(this.queue.length - 1);
    f.sprite.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: f.sprite, alpha: 1, duration: 260, delay: inQueue ? order * 55 : 0 });
    if (inQueue) {
      // Start a step back so the opening queue visibly moves up to the hatch.
      const back = this.opening > 0 ? 0.55 + order * 0.06 : 0;
      f.px = slot.x - back;
      f.py = slot.y;
      f.state = "queued";
    } else {
      const c = centre(f.spawn);
      f.px = c.x;
      f.py = c.y;
      f.state = "toQueue";
      f.route = this.routeTo(c, slot);
      f.onArrive = () => {
        f.state = "queued";
      };
    }
    this.place(f, 0);
  }

  private removeFig(f: Fig) {
    this.scene.tweens.killTweensOf(f.sprite);
    f.sprite.destroy();
    f.tray?.destroy();
    f.bubble?.destroy();
    f.tray = null;
    f.bubble = null;
    f.state = "done";
  }

  private place(f: Fig, bob: number) {
    const p = iso(f.px, f.py);
    f.sprite.setPosition(p.x, p.y - bob).setDepth(p.y + 0.5);
    const tex = f.look[f.facing][f.frame];
    f.sprite.setTexture(tex.key, tex.frame);
    if (f.tray) {
      f.tray.setPosition(p.x + (f.sprite.flipX ? -1 : 1), p.y - 13 - bob);
      f.tray.setDepth(p.y + (f.facing === "front" ? 0.7 : 0.3));
    }
    if (f.bubble) f.bubble.setPosition(p.x, p.y - 33 - bob).setDepth(p.y + 2000);
  }

  private image(tex: BakedTexture) {
    return this.scene.add.image(0, 0, tex.key, tex.frame).setOrigin(tex.originX, tex.originY).setScale(1 / tex.scale);
  }

  private setPans() {
    const r = this.report;
    if (!r) return;
    const steps = r.timeline.steps;
    const prepared = r.player.result.food.prepared;
    const processed = this.next === 0 ? 0 : this.figs.length === 0 ? steps.length : this.figs[this.next - 1].end;
    const left = processed === 0 ? prepared : steps[processed - 1].foodLeft;
    const frac = prepared === 0 ? 0 : left / prepared;
    const level = frac > 0.45 ? "full" : frac > 0.08 ? "half" : "empty";
    this.props.pans.full.setVisible(level === "full");
    this.props.pans.half.setVisible(level === "half");
    this.props.pans.empty.setVisible(level === "empty");
  }

  private setScraps(units: number, animate: boolean) {
    if (units <= this.scrapsLevel && this.props.scraps.visible) return;
    this.scrapsLevel = Math.max(this.scrapsLevel, units);
    const portions = this.scrapsLevel / UNITS_PER_PORTION;
    if (portions <= 0) return;
    // Heap grows with plate waste (full size at about 16 portions).
    const target = (0.55 + Math.min(1, portions / 16) * 1.15) / this.art.scraps.scale;
    const s = this.props.scraps.setVisible(true);
    this.scene.tweens.killTweensOf(s);
    if (animate && !this.hooks.isReduced()) {
      this.scene.tweens.add({ targets: s, scale: target, duration: 220, ease: "Back.easeOut" });
    } else {
      s.setScale(target);
    }
  }

  // ------------------------------------------------------------ update

  update(deltaMs: number) {
    if (!this.report || this.done) return;
    const dt = (Math.min(deltaMs, 50) / 1000) * this.speed;
    this.time += dt;
    this.realTime += dt;
    // Opening beat: the hatch lights up and the queue shuffles forward; the clock waits.
    if (this.opening > 0) this.opening = Math.max(0, this.opening - dt);
    else this.clock += dt * MIN_PER_SEC;

    // Spawn figures on schedule.
    for (const f of this.figs) {
      if (f.state === "waiting" && this.clock >= f.spawnMinute) this.spawnFig(f, false);
    }

    // Handle due events strictly in queue order.
    while (this.next < this.figs.length) {
      const f = this.figs[this.next];
      if (this.clock < f.eventMinute) break;
      const served = f.outcome === "regular" || f.outcome === "small";
      if (f.state === "waiting") this.spawnFig(f, true);
      if (served) {
        const head = this.queue[0] === f;
        const atCounter = Math.hypot(f.px - SERVE_POINT.x, f.py - SERVE_POINT.y) < 0.06;
        if (!head || !atCounter || f.state !== "queued") break;
      }
      this.process(f);
    }

    // Move everyone.
    const reduced = this.hooks.isReduced();
    for (const f of this.figs) {
      if (f.state === "waiting" || f.state === "done") continue;
      if (f.pause > 0) {
        f.pause -= dt;
        if (f.pause <= 0 && f.afterPause) {
          const cb = f.afterPause;
          f.afterPause = null;
          cb();
        }
        this.place(f, 0);
        continue;
      }
      if (f.state === "queued") {
        const qi = this.queue.indexOf(f);
        const slot = this.slotFor(Math.max(0, qi));
        this.stepToward(f, slot, dt, reduced);
        continue;
      }
      if (f.route.length) {
        this.stepToward(f, f.route[0], dt, reduced);
        if (f.px === f.route[0].x && f.py === f.route[0].y) {
          f.route.shift();
          if (!f.route.length && f.onArrive) {
            const cb = f.onArrive;
            f.onArrive = null;
            cb();
          }
        }
      } else {
        this.place(f, 0);
      }
    }

    // End of service: close up, show what is left, then hand over to results.
    if (this.next >= this.figs.length && this.finishedAt === null) this.finishedAt = this.realTime;
    if (this.finishedAt !== null) {
      const since = this.realTime - this.finishedAt;
      if (since > 0.6 && !this.finalized) this.finalize(false);
      if (since > 2.8) this.complete();
    }
  }

  private stepToward(f: Fig, to: Pt, dt: number, reduced: boolean) {
    const dx = to.x - f.px;
    const dy = to.y - f.py;
    const dist = Math.hypot(dx, dy);
    const move = WALK * f.pace * dt;
    if (dist <= move || dist < 0.001) {
      f.px = to.x;
      f.py = to.y;
      if (dist > 0.001) this.face(f, dx, dy);
      this.place(f, 0);
      return;
    }
    f.px += (dx / dist) * move;
    f.py += (dy / dist) * move;
    this.face(f, dx, dy);
    f.stride += dt;
    if (f.stride > 0.15) {
      f.stride = 0;
      f.frame = f.frame ? 0 : 1;
    }
    const bob = reduced ? 0 : Math.abs(Math.sin(this.time * 11 + f.start)) * 1.2;
    this.place(f, bob);
  }

  private face(f: Fig, dx: number, dy: number) {
    const sdx = dx - dy;
    if (Math.abs(sdx) > 0.01) f.sprite.setFlipX(sdx < 0);
    f.facing = dx + dy >= -0.01 ? "front" : "back";
  }

  private process(f: Fig) {
    const r = this.report!;
    this.next++;
    const qi = this.queue.indexOf(f);
    if (qi >= 0) this.queue.splice(qi, 1);
    this.hooks.onProgress(f.end);
    this.setPans();

    const tl = r.timeline;
    if (tl.windowClosedAt !== null && f.end - 1 >= tl.windowClosedAt) this.closeShutter();
    // Signature moment: the last portion has gone.
    if (!this.foodOutShown && tl.foodRanOutAt !== null && f.end > tl.foodRanOutAt) {
      this.foodOutShown = true;
      this.closeShutter(true);
      this.hooks.onMoment("food-out", r);
    }

    const home = centre(f.spawn);
    const goHome = () => {
      f.state = "after";
      f.route = this.routeTo({ x: f.px, y: f.py }, home);
      f.onArrive = () => {
        this.scene.tweens.add({
          targets: [f.sprite, f.bubble].filter(Boolean),
          alpha: 0,
          duration: 280,
          onComplete: () => this.removeFig(f),
        });
      };
    };

    if (f.outcome === "regular" || f.outcome === "small") {
      f.tray = this.image(this.art.trays[f.outcome === "small" ? "small" : "regular"]);
      f.tray.setScale(0);
      this.scene.tweens.add({ targets: f.tray, scale: 1 / this.art.trays.regular.scale, duration: 200, ease: "Back.easeOut" });
      f.state = "after";
      f.pause = 0.3;
      f.afterPause = () => {
        const seats = DESTINATIONS.terrace;
        const seat = seats[this.seatCounter++ % seats.length];
        const goal = { x: seat.x + 0.5 + f.seatJitter.x, y: seat.y + 0.5 + f.seatJitter.y };
        f.route = this.routeTo({ x: f.px, y: f.py }, goal);
        f.onArrive = () => {
          f.facing = "front";
          f.pause = 1.4;
          f.afterPause = () => {
            const ret = { x: TRAY_RETURN_APPROACH.x + 0.5, y: TRAY_RETURN_APPROACH.y + 0.62 };
            f.route = this.routeTo({ x: f.px, y: f.py }, ret);
            f.onArrive = () => {
              f.tray?.destroy();
              f.tray = null;
              // The bin shows plate waste from everyone who has handed back a tray.
              this.setScraps(r.timeline.steps[f.end - 1].plateWaste, true);
              f.pause = 0.25;
              f.afterPause = goHome;
            };
          };
        };
      };
    } else {
      // Sent away: an empty-plate bubble, a look around, then a slow walk off.
      const order = this.missedCount++;
      const reduced = this.hooks.isReduced();
      f.bubble = this.image(this.art.bubbles[f.outcome === "missed-time" ? "time" : "empty"]);
      const bs = f.bubble.scale;
      f.bubble.setAlpha(0).setScale(reduced ? bs : bs * 0.5);
      this.scene.tweens.add({ targets: f.bubble, alpha: 1, scale: bs, duration: 220, delay: Math.min(order, 8) * 70, ease: "Back.easeOut" });
      f.state = "after";
      f.facing = "front";
      f.pace = 0.7;
      f.pause = 0.75 + Math.min(order, 10) * 0.14;
      if (!reduced) {
        this.scene.time.delayedCall(260 + order * 60, () => f.state !== "done" && f.sprite.setFlipX(!f.sprite.flipX));
        this.scene.time.delayedCall(560 + order * 60, () => f.state !== "done" && f.sprite.setFlipX(!f.sprite.flipX));
      }
      f.afterPause = goHome;
    }
    this.place(f, 0);
  }

  /** Closes the hatch; when food runs out it comes down firmly. */
  private closeShutter(firm = false) {
    const sh = this.props.shutter;
    if (sh.visible) return;
    const y = this.shutterY();
    if (this.hooks.isReduced()) {
      sh.setVisible(true).setAlpha(1).setY(y);
      return;
    }
    if (firm) {
      sh.setVisible(true).setAlpha(1).setY(y - 12);
      this.scene.tweens.add({ targets: sh, y, duration: 170, ease: "Quad.easeIn" });
      return;
    }
    sh.setVisible(true).setAlpha(0).setY(y);
    this.scene.tweens.add({ targets: sh, alpha: 1, duration: 350 });
  }

  /** Final, deterministic end state: everything shown matches the report. */
  private finalize(instant: boolean) {
    if (this.finalized || !this.report) return;
    this.finalized = true;
    const r = this.report;
    const reduced = instant || this.hooks.isReduced();
    this.closeShutter();
    this.setScraps(r.player.result.food.plateWaste, !reduced);

    const surplus = r.player.waste.surplus;
    const pots = surplus > 0 ? Math.min(10, Math.ceil(surplus / 4)) : 0;
    const spots: Pt[] = [];
    for (const y of [4.95, 5.4, 5.85, 6.3, 6.75]) for (const x of [11.3, 11.72]) spots.push({ x, y });
    spots.sort((a, b) => b.x + b.y - (a.x + a.y));
    for (let i = 0; i < pots; i++) {
      const s = spots[i];
      const p = iso(s.x, s.y);
      const img = this.image(this.art.leftoverPot).setPosition(p.x, p.y).setDepth(p.y + 0.4);
      this.extras.push(img);
      if (!reduced) {
        img.setScale(0);
        this.scene.tweens.add({
          targets: img,
          scale: 1 / this.art.leftoverPot.scale,
          duration: 260,
          delay: i * 90,
          ease: "Back.easeOut",
        });
      }
    }

    // Signature moment: obvious leftovers. The yard lights up and the pots steam.
    if (surplus >= 10) {
      const ring = this.props.yardRing.setVisible(true).setAlpha(reduced ? 0.55 : 0);
      if (!reduced) {
        this.scene.tweens.add({ targets: ring, alpha: { from: 0, to: 0.9 }, duration: 420, yoyo: true, repeat: 1, delay: 300, onComplete: () => ring.setAlpha(0.55) });
        const steamFrom = spots.slice(0, Math.min(pots, 3));
        steamFrom.forEach((sp, i) => {
          const p = iso(sp.x, sp.y, 16);
          const puff = this.image(this.art.puff).setPosition(p.x, p.y).setDepth(p.y + 50).setAlpha(0).setScale(0.25);
          this.extras.push(puff);
          this.scene.tweens.add({
            targets: puff,
            y: p.y - 22,
            scale: 0.75,
            alpha: { from: 0.7, to: 0 },
            duration: 2200,
            delay: 500 + i * 650,
            repeat: -1,
            ease: "Sine.easeOut",
          });
        });
      }
    }

    const res = r.player.result;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    if (surplus > 0) {
      this.extras.push(this.hooks.makeLabel(`Never served · ${fmt(surplus)} portions`, { x: 11.5, y: 6.0, z: 28 }, surplus >= 10 ? "warn" : "neutral"));
    }
    if (r.player.waste.plateWaste > 0) {
      this.extras.push(
        this.hooks.makeLabel(
          `Left on plates · ${fmt(r.player.waste.plateWaste)} portions`,
          { x: TRAY_RETURN.x + 0.2, y: TRAY_RETURN.y + 1.3, z: 30 },
          r.player.waste.plateWaste >= 10 ? "warn" : "neutral",
        ),
      );
    }
    const missed = res.missedBecauseFoodRanOut + res.missedBecauseServiceTimeEnded;
    if (missed > 0) {
      this.extras.push(
        this.hooks.makeLabel(`${missed} ${missed === 1 ? "student" : "students"} without lunch`, { x: 5.2, y: 7.6, z: 40 }, "bad"),
      );
    }
    if (r.stars.count === 3 && !reduced) {
      const c = iso(KITCHEN.x + 1.1, KITCHEN.y + KITCHEN.d + 0.4, 34);
      this.props.sparkles.forEach((s, i) => {
        const a = (i / this.props.sparkles.length) * Math.PI * 2;
        s.setPosition(c.x, c.y).setVisible(true).setAlpha(1).setScale(0.2);
        this.scene.tweens.add({
          targets: s,
          x: c.x + Math.cos(a) * 30,
          y: c.y + Math.sin(a) * 16 - 10,
          scale: 0.6,
          alpha: 0,
          duration: 800,
          ease: "Cubic.easeOut",
          onComplete: () => s.setVisible(false),
        });
      });
    }
    this.hooks.onMoment("finale", r);
    if (instant) this.scene.time.delayedCall(350, () => this.complete());
  }

  private complete() {
    if (this.done) return;
    this.done = true;
    this.hooks.onDone();
  }

  /** Called every frame after service so leftover walkers can finish leaving. */
  updateAfter(deltaMs: number) {
    if (!this.done) return;
    const dt = (Math.min(deltaMs, 50) / 1000) * this.speed;
    this.time += dt;
    for (const f of this.figs) {
      if (f.state === "done" || f.state === "waiting") continue;
      if (f.pause > 0) {
        f.pause -= dt;
        if (f.pause <= 0 && f.afterPause) {
          const cb = f.afterPause;
          f.afterPause = null;
          cb();
        }
        continue;
      }
      if (f.route.length) {
        this.stepToward(f, f.route[0], dt, this.hooks.isReduced());
        if (f.px === f.route[0].x && f.py === f.route[0].y) {
          f.route.shift();
          if (!f.route.length && f.onArrive) {
            const cb = f.onArrive;
            f.onArrive = null;
            cb();
          }
        }
      }
    }
  }
}

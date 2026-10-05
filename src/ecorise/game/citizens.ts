import type Phaser from "phaser";
import { iso } from "./art/iso";
import type { ArtCatalog } from "./art/textures";
import { DESTINATIONS, HOMES, doorTile, findPath, type HomeSpec } from "./layout";

type Tile = { x: number; y: number };
type Errand = "queue" | "council" | "terrace" | "lookout" | "home";

const ERRAND_WEIGHTS: [Errand, number][] = [
  ["queue", 3],
  ["terrace", 3],
  ["council", 2],
  ["lookout", 1],
  ["home", 2],
];

const IDLE_SECONDS: Record<Errand, [number, number]> = {
  queue: [1.5, 3.5],
  council: [2.5, 5],
  terrace: [3, 7],
  lookout: [2, 4],
  home: [3, 8],
};

interface Citizen {
  sprite: Phaser.GameObjects.Image;
  frames: [string, string];
  home: HomeSpec;
  tile: Tile;
  path: Tile[];
  step: number;
  /** Fractional grid position of the feet. */
  px: number;
  py: number;
  ox: number;
  oy: number;
  speed: number;
  errand: Errand;
  state: "walk" | "idle" | "inside";
  timer: number;
  stride: number;
  frame: 0 | 1;
  phase: number;
}

function pick<T>(items: readonly T[], rnd: () => number): T {
  return items[Math.floor(rnd() * items.length)];
}

function pickErrand(rnd: () => number): Errand {
  const total = ERRAND_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [e, w] of ERRAND_WEIGHTS) {
    r -= w;
    if (r <= 0) return e;
  }
  return "queue";
}

/**
 * Representative townsfolk who wander between homes, the kitchen queue,
 * the terrace, the council plaza and the meadow lookout. They are ambient
 * figures, not the simulated diners.
 */
export class CitizenCrowd {
  private citizens: Citizen[] = [];
  private reducedMotion = false;
  private time = 0;

  constructor(
    private scene: Phaser.Scene,
    art: ArtCatalog,
    count: number,
    private rnd: () => number = Math.random,
  ) {
    for (let i = 0; i < count; i++) {
      const look = art.citizens[i % art.citizens.length];
      const home = HOMES[i % HOMES.length];
      const start = this.destinationFor(i % 3 === 0 ? "home" : pickErrand(rnd), home);
      const sprite = scene.add
        .image(0, 0, look[0].key)
        .setOrigin(look[0].originX, look[0].originY)
        .setScale(0.5);
      const c: Citizen = {
        sprite,
        frames: [look[0].key, look[1].key],
        home,
        tile: start,
        path: [],
        step: 0,
        px: start.x + 0.5,
        py: start.y + 0.5,
        ox: (rnd() - 0.5) * 0.36,
        oy: (rnd() - 0.5) * 0.36,
        speed: 0.85 + rnd() * 0.45,
        errand: "home",
        state: "idle",
        timer: rnd() * 2.5,
        stride: 0,
        frame: 0,
        phase: rnd() * Math.PI * 2,
      };
      c.px += c.ox;
      c.py += c.oy;
      this.citizens.push(c);
      this.place(c, 0);
    }
  }

  get count() {
    return this.citizens.length;
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }

  private destinationFor(errand: Errand, home: HomeSpec): Tile {
    if (errand === "home") return doorTile(home);
    return pick(DESTINATIONS[errand], this.rnd);
  }

  private startErrand(c: Citizen) {
    let errand = pickErrand(this.rnd);
    // Do not walk "home" if already standing there.
    const door = doorTile(c.home);
    if (errand === "home" && c.tile.x === door.x && c.tile.y === door.y) errand = "terrace";
    const goal = this.destinationFor(errand, c.home);
    const path = findPath(c.tile, goal);
    if (!path || path.length < 2) {
      c.state = "idle";
      c.timer = 1 + this.rnd() * 2;
      return;
    }
    c.errand = errand;
    c.path = path;
    c.step = 1;
    c.state = "walk";
  }

  private place(c: Citizen, bob: number) {
    const p = iso(c.px, c.py);
    c.sprite.setPosition(p.x, p.y - bob);
    // Feet position sorts the figure among buildings and props.
    c.sprite.setDepth(p.y + 0.5);
  }

  update(deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.time += dt;
    for (const c of this.citizens) {
      if (c.state === "inside") {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = "idle";
          c.timer = 0.3;
          c.sprite.setVisible(true).setAlpha(1);
        }
        continue;
      }
      if (c.state === "idle") {
        c.timer -= dt;
        if (c.timer <= 0) this.startErrand(c);
        if (c.state === "idle" && c.frame !== 0) {
          c.frame = 0;
          c.sprite.setTexture(c.frames[0]);
        }
        this.place(c, 0);
        continue;
      }

      const target = c.path[c.step];
      const tx = target.x + 0.5 + c.ox;
      const ty = target.y + 0.5 + c.oy;
      const dx = tx - c.px;
      const dy = ty - c.py;
      const dist = Math.hypot(dx, dy);
      const move = c.speed * dt;
      if (dist <= move) {
        c.px = tx;
        c.py = ty;
        c.tile = target;
        c.step++;
        if (c.step >= c.path.length) this.arrive(c);
      } else {
        c.px += (dx / dist) * move;
        c.py += (dy / dist) * move;
      }
      // Screen-space direction decides which way the figure faces.
      const screenDx = dx - dy;
      if (Math.abs(screenDx) > 0.01) c.sprite.setFlipX(screenDx < 0);

      c.stride += dt;
      if (c.stride > 0.16) {
        c.stride = 0;
        c.frame = c.frame ? 0 : 1;
        c.sprite.setTexture(c.frames[c.frame]);
      }
      const bob = this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * 11 + c.phase)) * 1.3;
      this.place(c, bob);
    }
  }

  private arrive(c: Citizen) {
    const [lo, hi] = IDLE_SECONDS[c.errand];
    c.timer = lo + this.rnd() * (hi - lo);
    if (c.errand === "home") {
      c.state = "inside";
      if (this.reducedMotion) {
        c.sprite.setVisible(false);
      } else {
        this.scene.tweens.add({
          targets: c.sprite,
          alpha: 0,
          duration: 300,
          onComplete: () => c.sprite.setVisible(false),
        });
      }
    } else {
      c.state = "idle";
    }
  }

  destroy() {
    this.citizens.forEach((c) => c.sprite.destroy());
    this.citizens = [];
  }
}

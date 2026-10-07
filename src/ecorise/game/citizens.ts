import type Phaser from "phaser";
import { iso } from "./art/iso";
import type { ArtCatalog, PersonFrames } from "./art/textures";
import { DESTINATIONS, HOMES, doorTile, findPath, type HomeSpec } from "./layout";

type Tile = { x: number; y: number };
type Errand = "queue" | "council" | "terrace" | "lookout" | "board" | "home";

const BASE_WEIGHTS: Record<Errand, number> = {
  queue: 3,
  terrace: 3,
  council: 2,
  lookout: 1,
  board: 1,
  home: 2,
};

const IDLE_SECONDS: Record<Errand, [number, number]> = {
  queue: [1.5, 3.5],
  council: [2.5, 5],
  terrace: [3, 7],
  lookout: [2, 4.5],
  board: [2.5, 4.5],
  home: [3, 8],
};

/** Pairs of citizens (by index) who sometimes walk together. */
const PAIRS: [number, number][] = [
  [1, 2],
  [5, 6],
  [9, 10],
];

interface Citizen {
  sprite: Phaser.GameObjects.Image;
  chat: Phaser.GameObjects.Image | null;
  chatTimer: number;
  look: PersonFrames;
  facing: "front" | "back";
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
  /** Seconds per walking frame: everyone has their own pace. */
  strideTime: number;
  errand: Errand;
  state: "walk" | "idle" | "inside";
  timer: number;
  /** Seconds until an idle figure glances around. */
  glance: number;
  stride: number;
  frame: 0 | 1;
  phase: number;
  buddy: Citizen | null;
  follower: boolean;
}

function pick<T>(items: readonly T[], rnd: () => number): T {
  return items[Math.floor(rnd() * items.length)];
}

/**
 * Representative townsfolk who wander between homes, the kitchen queue,
 * the terrace, the council plaza, the Sustainability Board and the meadow
 * lookout. They are ambient figures, not the simulated diners.
 */
export class CitizenCrowd {
  private citizens: Citizen[] = [];
  private reducedMotion = false;
  private time = 0;
  private active = true;
  private weights: Record<Errand, number> = { ...BASE_WEIGHTS };

  constructor(
    private scene: Phaser.Scene,
    private art: ArtCatalog,
    count: number,
    private rnd: () => number = Math.random,
  ) {
    for (let i = 0; i < count; i++) {
      const look = art.people[(i * 3) % art.people.length];
      const home = HOMES[i % HOMES.length];
      const start = this.destinationFor(i % 3 === 0 ? "home" : this.pickErrand(), home);
      const f0 = look.front[0];
      const sprite = scene.add
        .image(0, 0, f0.key, f0.frame)
        .setOrigin(f0.originX, f0.originY)
        .setScale(1 / f0.scale);
      const c: Citizen = {
        sprite,
        chat: null,
        chatTimer: 0,
        look,
        facing: "front",
        home,
        tile: start,
        path: [],
        step: 0,
        px: start.x + 0.5,
        py: start.y + 0.5,
        ox: (rnd() - 0.5) * 0.36,
        oy: (rnd() - 0.5) * 0.36,
        speed: 0.8 + rnd() * 0.5,
        strideTime: 0.13 + rnd() * 0.07,
        errand: "home",
        state: "idle",
        timer: rnd() * 2.5,
        glance: 1 + rnd() * 3,
        stride: 0,
        frame: 0,
        phase: rnd() * Math.PI * 2,
        buddy: null,
        follower: false,
      };
      c.px += c.ox;
      c.py += c.oy;
      this.citizens.push(c);
      this.place(c, 0);
    }
    for (const [a, b] of PAIRS) {
      const lead = this.citizens[a];
      const follow = this.citizens[b];
      if (!lead || !follow) continue;
      lead.buddy = follow;
      follow.buddy = lead;
      follow.follower = true;
      // Start together, side by side.
      follow.tile = lead.tile;
      follow.px = lead.px + 0.22;
      follow.py = lead.py - 0.12;
      follow.ox = lead.ox + 0.22;
      follow.oy = lead.oy - 0.12;
      follow.speed = lead.speed;
      this.place(follow, 0);
    }
  }

  get isActive() {
    return this.active;
  }

  get count() {
    return this.citizens.length;
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
    if (value) this.citizens.forEach((c) => this.hideChat(c));
  }

  /** Once the Planning Hub stands, students visit it more often. */
  setHubBuilt(built: boolean) {
    this.weights.lookout = built ? 3 : BASE_WEIGHTS.lookout;
  }

  private pickErrand(): Errand {
    const entries = Object.entries(this.weights) as [Errand, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.rnd() * total;
    for (const [e, w] of entries) {
      r -= w;
      if (r <= 0) return e;
    }
    return "queue";
  }

  private destinationFor(errand: Errand, home: HomeSpec): Tile {
    if (errand === "home") return doorTile(home);
    return pick(DESTINATIONS[errand], this.rnd);
  }

  private startErrand(c: Citizen) {
    const b0 = c.buddy;
    if (c.follower && b0) {
      // Waiting beside a friend: leave together when they do.
      if (b0.state === "idle" && b0.tile.x === c.tile.x && b0.tile.y === c.tile.y) {
        c.state = "idle";
        c.timer = 0.8;
        return;
      }
      // The friend is out somewhere: go and meet them there.
      if (b0.state === "walk" && b0.errand !== "home") {
        const goal = b0.path[b0.path.length - 1];
        const path = findPath(c.tile, goal);
        if (path && path.length >= 2) {
          this.beginWalk(c, b0.errand, path);
          return;
        }
      }
    }
    let errand = this.pickErrand();
    const door = doorTile(c.home);
    if (errand === "home" && c.tile.x === door.x && c.tile.y === door.y) errand = "terrace";
    const goal = this.destinationFor(errand, c.home);
    const path = findPath(c.tile, goal);
    if (!path || path.length < 2) {
      c.state = "idle";
      c.timer = 1 + this.rnd() * 2;
      return;
    }
    this.beginWalk(c, errand, path);
    // A friend standing nearby comes along (never into someone else's home).
    const b = c.buddy;
    if (b && !c.follower && b.state === "idle" && errand !== "home" && b.tile.x === c.tile.x && b.tile.y === c.tile.y) {
      this.beginWalk(b, errand, path);
    }
  }

  private beginWalk(c: Citizen, errand: Errand, path: Tile[]) {
    this.hideChat(c);
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
    if (c.chat) c.chat.setPosition(p.x + (c.sprite.flipX ? -4 : 4), p.y - 33).setDepth(p.y + 2000);
  }

  private setFrame(c: Citizen) {
    const tex = c.look[c.facing][c.frame];
    c.sprite.setTexture(tex.key, tex.frame);
  }

  private showChat(c: Citizen) {
    if (this.reducedMotion || c.chat) return;
    const t = this.art.chat;
    c.chat = this.scene.add.image(0, 0, t.key, t.frame).setOrigin(t.originX, t.originY).setScale(1 / t.scale).setAlpha(0);
    this.scene.tweens.add({ targets: c.chat, alpha: 1, duration: 180 });
    c.chatTimer = 1.8;
    this.place(c, 0);
  }

  private hideChat(c: Citizen) {
    if (!c.chat) return;
    const chat = c.chat;
    c.chat = null;
    this.scene.tweens.add({ targets: chat, alpha: 0, duration: 160, onComplete: () => chat.destroy() });
  }

  update(deltaMs: number) {
    if (!this.active) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.time += dt;
    for (const c of this.citizens) {
      if (c.chat) {
        c.chatTimer -= dt;
        if (c.chatTimer <= 0) this.hideChat(c);
      }
      if (c.state === "inside") {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = "idle";
          c.timer = 0.3;
          c.sprite.setVisible(this.active).setAlpha(1);
        }
        continue;
      }
      if (c.state === "idle") {
        c.timer -= dt;
        if (c.timer <= 0) this.startErrand(c);
        if (c.state === "idle") this.idle(c, dt);
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
      c.facing = dx + dy >= 0 ? "front" : "back";

      c.stride += dt;
      if (c.stride > c.strideTime) {
        c.stride = 0;
        c.frame = c.frame ? 0 : 1;
      }
      this.setFrame(c);
      const bob = this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * 11 + c.phase)) * 1.3;
      this.place(c, bob);
    }
  }

  /** Standing still, but not frozen: people glance around and chat. */
  private idle(c: Citizen, dt: number) {
    if (c.frame !== 0) {
      c.frame = 0;
      this.setFrame(c);
    }
    if (!this.reducedMotion) {
      c.glance -= dt;
      if (c.glance <= 0) {
        c.glance = 1.6 + this.rnd() * 3.5;
        const r = this.rnd();
        if (r < 0.45) c.sprite.setFlipX(!c.sprite.flipX);
        else if (r < 0.6 && c.errand !== "board") c.facing = c.facing === "front" ? "back" : "front";
        this.setFrame(c);
        // Two people standing together sometimes talk.
        if (!c.chat && this.rnd() < 0.35) {
          const near = this.citizens.find((o) => o !== c && o.state === "idle" && !o.chat && Math.hypot(o.px - c.px, o.py - c.py) < 0.9);
          if (near) {
            c.sprite.setFlipX(near.px - near.py < c.px - c.py);
            this.showChat(c);
          }
        }
      }
    }
    this.place(c, 0);
  }

  private arrive(c: Citizen) {
    const [lo, hi] = IDLE_SECONDS[c.errand];
    c.timer = lo + this.rnd() * (hi - lo);
    if (c.errand === "home") {
      c.state = "inside";
      this.hideChat(c);
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
      return;
    }
    c.state = "idle";
    if (c.errand === "board") {
      // Read the board: it is one tile toward +y (screen lower left).
      c.facing = "front";
      c.sprite.setFlipX(true);
      this.setFrame(c);
    }
  }

  /** Hides the townsfolk while lunch service figures take the stage. */
  setActive(active: boolean) {
    this.active = active;
    for (const c of this.citizens) {
      c.sprite.setVisible(active && c.state !== "inside");
      if (!active) this.hideChat(c);
    }
  }

  destroy() {
    this.citizens.forEach((c) => {
      c.sprite.destroy();
      c.chat?.destroy();
    });
    this.citizens = [];
  }
}

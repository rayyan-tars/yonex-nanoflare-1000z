/**
 * Soft, synthesized game sounds: no audio files. Nothing plays until the
 * player has interacted with the page (browsers require a gesture).
 */

type Tone = { f: number; t: number; d: number; type?: OscillatorType; g?: number; slide?: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

function play(tones: Tone[]) {
  const c = ac();
  if (!c || !master || c.state !== "running") return;
  const now = c.currentTime + 0.01;
  for (const { f, t, d, type = "sine", g = 0.5, slide } of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, now + t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, now + t + d);
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(g, now + t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
    osc.connect(gain).connect(master);
    osc.start(now + t);
    osc.stop(now + t + d + 0.05);
  }
}

export const sfx = {
  /** Wakes the audio context on the first gesture. */
  unlock() {
    ac();
  },
  setMuted(value: boolean) {
    muted = value;
    if (value && ctx && ctx.state === "running") void ctx.suspend().catch(() => {});
    if (!value) ac();
  },
  /** A soft wooden tick for buttons and choices. */
  tick() {
    play([{ f: 880, t: 0, d: 0.06, type: "triangle", g: 0.22, slide: 620 }]);
  },
  /** A rounder pop for selecting a Student Voice option or a place. */
  pop() {
    play([
      { f: 520, t: 0, d: 0.09, type: "sine", g: 0.35, slide: 780 },
      { f: 1040, t: 0.02, d: 0.06, type: "sine", g: 0.08 },
    ]);
  },
  /** The serving bell. */
  serve() {
    play([
      { f: 1318, t: 0, d: 0.9, type: "sine", g: 0.28 },
      { f: 1976, t: 0, d: 0.5, type: "sine", g: 0.08 },
      { f: 1318, t: 0.18, d: 0.7, type: "sine", g: 0.16 },
    ]);
  },
  /** Results: a rising arpeggio, one note per star; a low sigh for none. */
  result(stars: number) {
    if (stars <= 0) {
      play([{ f: 330, t: 0, d: 0.5, type: "triangle", g: 0.2, slide: 247 }]);
      return;
    }
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const tones: Tone[] = [];
    for (let i = 0; i < Math.min(3, stars) + (stars >= 3 ? 1 : 0); i++) tones.push({ f: notes[i], t: i * 0.14, d: 0.55, type: "triangle", g: 0.3 });
    play(tones);
  },
  /** Coins counting up. */
  coin() {
    play([
      { f: 1568, t: 0, d: 0.08, type: "square", g: 0.05 },
      { f: 2093, t: 0.07, d: 0.16, type: "square", g: 0.05 },
    ]);
  },
  /** The campus grows: a warm, hopeful chord. */
  grow() {
    play([
      { f: 392, t: 0, d: 1.4, type: "sine", g: 0.22 },
      { f: 493.88, t: 0.12, d: 1.3, type: "sine", g: 0.18 },
      { f: 587.33, t: 0.24, d: 1.2, type: "sine", g: 0.18 },
      { f: 783.99, t: 0.36, d: 1.1, type: "triangle", g: 0.12 },
    ]);
  },
  /** A short birdsong phrase for the living campus. */
  bird() {
    const base = 2400 + Math.random() * 900;
    const n = 2 + Math.floor(Math.random() * 3);
    const tones: Tone[] = [];
    for (let i = 0; i < n; i++) tones.push({ f: base * (1 + (Math.random() - 0.5) * 0.15), t: i * 0.11, d: 0.08, type: "sine", g: 0.05, slide: base * 1.25 });
    play(tones);
  },
  /** A gentle whoosh for opening the 2050 view. */
  future() {
    play([
      { f: 220, t: 0, d: 1.1, type: "sine", g: 0.16, slide: 440 },
      { f: 659.25, t: 0.35, d: 0.9, type: "sine", g: 0.1 },
    ]);
  },
};

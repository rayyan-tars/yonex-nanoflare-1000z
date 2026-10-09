// Tiny WebAudio synth, ported from Greenhold's sound engine (tone + noise).
// Everything is optional: the game is complete with sound muted or unavailable.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined" || muted) return null;
  try {
    if (!ctx) {
      const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!A) return null;
      ctx = new A();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type ToneOpts = { type?: OscillatorType; vol?: number; delay?: number; slide?: number };

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + (o.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.1, t + 0.008);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.06, delay = 0, freq = 900) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  select: () => tone(660, 0.05, { vol: 0.05 }),
  place: () => {
    tone(320, 0.09, { type: "triangle", vol: 0.12, slide: 0.6 });
    noise(0.08, 0.05);
  },
  leaves: () => noise(0.35, 0.04, 0.15, 2600),
  solar: () => [784, 1047].forEach((f, i) => tone(f, 0.16, { type: "sine", vol: 0.06, delay: 0.35 + i * 0.07 })),
  bell: () => {
    tone(2093, 0.25, { vol: 0.05 });
    tone(2093, 0.25, { vol: 0.04, delay: 0.14 });
  },
  water: () => noise(0.5, 0.05, 0.1, 500),
  undo: () => tone(420, 0.1, { type: "triangle", vol: 0.07, slide: 0.7 }),
  lens: () => tone(1200, 0.03, { vol: 0.018 }),
  reveal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, { type: "sine", vol: 0.07, delay: i * 0.11 })),
  heat: () => {
    tone(110, 1.4, { type: "sawtooth", vol: 0.03, slide: 1.4 });
    noise(1.2, 0.03, 0, 300);
  },
  result: () => [659, 784, 988].forEach((f, i) => tone(f, 0.24, { type: "triangle", vol: 0.07, delay: i * 0.09 })),
};

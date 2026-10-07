/**
 * Small synthesised sound effects (WebAudio, no files). Created on the first
 * user gesture, as browsers require.
 */
let ctx: AudioContext | null = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.vol ?? 0.12, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.08, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

export const sfx = {
  place: () => {
    tone(320, 0.09, { type: "triangle", vol: 0.14, slide: 0.6 });
    noise(0.06, 0.05);
  },
  ground: () => tone(520, 0.06, { type: "triangle", vol: 0.07 }),
  remove: () => {
    noise(0.22, 0.12);
    tone(160, 0.18, { type: "square", vol: 0.04, slide: 0.5 });
  },
  collect: () => [880, 1175, 1568].forEach((f, k) => tone(f, 0.12, { type: "triangle", vol: 0.09, delay: k * 0.06 })),
  built: () => [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.18, { type: "triangle", vol: 0.1, delay: k * 0.08 })),
  goal: () => [659, 784, 988, 1319].forEach((f, k) => tone(f, 0.22, { type: "sine", vol: 0.12, delay: k * 0.09 })),
  error: () => tone(150, 0.16, { type: "sawtooth", vol: 0.05, slide: 0.8 }),
  click: () => tone(700, 0.04, { type: "sine", vol: 0.06 }),
  movein: () => tone(990, 0.08, { type: "sine", vol: 0.05 }),
};

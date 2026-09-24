// Tiny synthesised SFX kit — no audio files, no external assets.

type Ctx = AudioContext | null;

let ctx: Ctx = null;
let master: GainNode | null = null;
let muted = false;

export function initAudio() {
  if (ctx || typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ctx.destination);
}

export function setMuted(v: boolean) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.35;
}

export function isMuted() {
  return muted;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number,
) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, gain: number, freq = 1200, type: BiquadFilterType = "bandpass") {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  swing: (i = 0) => noise(i === 2 ? 0.26 : 0.15, 0.22, i === 2 ? 700 : 1000 + i * 250),
  hit: (i = 0) => {
    tone(i === 2 ? 120 : 190 + i * 30, i === 2 ? 0.22 : 0.13, "square", i === 2 ? 0.2 : 0.14, 70);
    noise(0.1, i === 2 ? 0.28 : 0.18, 380, "lowpass");
  },
  hurt: () => {
    tone(210, 0.24, "sawtooth", 0.13, 110);
    noise(0.08, 0.18, 300, "lowpass");
  },
  evade: () => tone(880, 0.12, "sine", 0.08, 1320),
  dodge: () => noise(0.2, 0.16, 1600, "highpass"),
  step: (sprint: boolean) => noise(0.05, sprint ? 0.1 : 0.07, 220, "lowpass"),
  gale: () => {
    noise(0.3, 0.2, 2000, "highpass");
    tone(500, 0.25, "sine", 0.06, 900);
  },
  burstCharge: () => tone(160, 0.18, "triangle", 0.1, 240),
  burst: () => {
    noise(0.35, 0.32, 180, "lowpass");
    tone(90, 0.4, "sine", 0.22, 45);
  },
  ward: () => {
    tone(330, 0.3, "triangle", 0.1, 440);
    setTimeout(() => tone(495, 0.35, "triangle", 0.08), 110);
  },
  windup: (pitch = 1) => tone(140 * pitch, 0.22, "triangle", 0.07, 190 * pitch),
  slam: () => {
    noise(0.3, 0.3, 140, "lowpass");
    tone(70, 0.3, "sine", 0.18, 40);
  },
  charge: () => noise(0.45, 0.2, 260, "lowpass"),
  roar: () => {
    tone(110, 0.9, "sawtooth", 0.14, 55);
    noise(0.8, 0.2, 200, "lowpass");
  },
  enemyDown: () => tone(320, 0.45, "triangle", 0.18, 80),
  jump: () => noise(0.08, 0.08, 500, "lowpass"),
  land: () => noise(0.1, 0.14, 200, "lowpass"),
  pickup: () => {
    tone(660, 0.12, "sine", 0.12);
    setTimeout(() => tone(990, 0.16, "sine", 0.1), 90);
  },
  heal: () => tone(520, 0.2, "sine", 0.12, 780),
  quest: () => {
    tone(523, 0.2, "triangle", 0.14);
    setTimeout(() => tone(659, 0.2, "triangle", 0.14), 140);
    setTimeout(() => tone(784, 0.35, "triangle", 0.14), 290);
  },
  levelUp: () => {
    tone(392, 0.18, "sine", 0.14);
    setTimeout(() => tone(587, 0.18, "sine", 0.14), 130);
    setTimeout(() => tone(880, 0.4, "sine", 0.14), 260);
  },
  death: () => tone(200, 0.9, "sawtooth", 0.2, 60),
  ui: () => tone(600, 0.06, "square", 0.07),
};

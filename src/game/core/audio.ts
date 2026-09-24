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

function noise(dur: number, gain: number, freq = 1200) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  swing: () => noise(0.18, 0.25, 900),
  hit: () => {
    tone(180, 0.16, "square", 0.18, 90);
    noise(0.12, 0.2, 400);
  },
  hurt: () => tone(220, 0.3, "sawtooth", 0.16, 110),
  enemyDown: () => tone(320, 0.45, "triangle", 0.2, 80),
  jump: () => tone(420, 0.16, "sine", 0.12, 700),
  land: () => noise(0.1, 0.12, 260),
  pickup: () => {
    tone(660, 0.12, "sine", 0.14);
    setTimeout(() => tone(990, 0.16, "sine", 0.12), 90);
  },
  heal: () => {
    tone(520, 0.2, "sine", 0.12, 780);
  },
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

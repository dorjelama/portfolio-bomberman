// Sound effects and one music loop, synthesised with WebAudio: no audio files to load.
// Browsers only allow audio after a user gesture, so nothing plays until unlock() runs from one.

let ac: AudioContext | null = null;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;

const pref = (k: string) => {
  try {
    return localStorage.getItem(k) !== "off";
  } catch {
    return true;
  }
};
export const settings = { sound: pref("sound"), music: pref("music") };

export function setPref(k: "sound" | "music", on: boolean) {
  settings[k] = on;
  try {
    localStorage.setItem(k, on ? "on" : "off");
  } catch {}
  if (ac) (k === "sound" ? sfxBus : musicBus).gain.value = on ? (k === "sound" ? 0.5 : 0.12) : 0;
}

export function unlock() {
  if (ac) return void ac.resume();
  ac = new AudioContext();
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  sfxBus.gain.value = settings.sound ? 0.5 : 0;
  musicBus.gain.value = settings.music ? 0.12 : 0;
  sfxBus.connect(ac.destination);
  musicBus.connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = freq, at = 0, bus = sfxBus) {
  if (!ac) return;
  const t = (at || ac.currentTime) + 0.001;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur);
}

function hiss(dur: number, vol: number, from: number, to: number) {
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = noise;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + dur);
}

const notes = (list: [number, number][], type: OscillatorType, vol: number) => {
  if (!ac) return;
  let t = ac.currentTime;
  for (const [f, d] of list) {
    tone(f, d, type, vol, f, t);
    t += d * 0.9;
  }
};

export const sfx = {
  drop: () => tone(160, 0.09, "square", 0.25, 70),
  lob: () => tone(300, 0.15, "triangle", 0.35, 700),
  boom: () => {
    hiss(0.5, 0.8, 1800, 120);
    tone(70, 0.35, "sine", 0.6, 30);
  },
  pickup: () => notes([[660, 0.06], [990, 0.1]], "square", 0.2),
  curse: () => notes([[330, 0.12], [311, 0.12], [294, 0.3]], "sawtooth", 0.15),
  ko: () => tone(700, 0.6, "sawtooth", 0.2, 60),
  ready: () => tone(440, 0.12, "square", 0.15),
  go: () => tone(880, 0.25, "square", 0.2),
  hurry: () => notes([[988, 0.1], [740, 0.1], [988, 0.1], [740, 0.1]], "square", 0.15),
  comeback: () => notes([[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.07], [1319, 0.25]], "square", 0.2),
  whoosh: () => hiss(0.3, 0.5, 300, 4000),
  win: () => notes([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.35]], "square", 0.2),
  lose: () => notes([[392, 0.15], [330, 0.15], [262, 0.4]], "triangle", 0.3),
};

// ---------- music: a 4-bar loop in A minor, 16 steps per bar ----------
const BPM = 132;
const STEP = 60 / BPM / 4;
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n: string) => 440 * 2 ** ((SEMITONE[n[0]] + (Number(n[1]) + 1) * 12 - 69) / 12); // "A4" → 440 Hz
// "-" holds nothing; a note plays for one step.
const LEAD = [
  "A4 - C5 - E5 - D5 C5 - A4 - - G4 - A4 -",
  "C5 - D5 - E5 - G5 E5 D5 - C5 - A4 - - -",
  "A4 - C5 - E5 - D5 C5 - A4 - - G4 - E4 -",
  "G4 - A4 - C5 - D5 - E5 - D5 - C5 - A4 -",
].flatMap((bar) => bar.split(" "));
const ROOTS = ["A2", "F2", "G2", "E2"];
const BASS = ROOTS.flatMap((r) => {
  const f = midi(r);
  return [f, 0, f, 0, f * 1.5, 0, f, 0, f, 0, f * 1.5, 0, f * 2, 0, f * 1.5, 0];
});

let timer = 0;
let step = 0;
let nextAt = 0;

export function music(on: boolean) {
  if (!ac || on === !!timer) return;
  if (!on) {
    clearInterval(timer);
    timer = 0;
    return;
  }
  [step, nextAt] = [0, ac.currentTime + 0.05];
  // Schedule a little ahead on the audio clock, so timer jitter never makes the beat stumble.
  timer = window.setInterval(() => {
    while (ac && nextAt < ac.currentTime + 0.12) {
      const i = step % LEAD.length;
      if (LEAD[i] !== "-") tone(midi(LEAD[i]), STEP * 1.8, "square", 0.5, midi(LEAD[i]), nextAt, musicBus);
      if (BASS[i]) tone(BASS[i], STEP * 1.6, "triangle", 1, BASS[i], nextAt, musicBus);
      step++;
      nextAt += STEP;
    }
  }, 25);
}

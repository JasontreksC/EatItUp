/**
 * 간단한 게임용 WAV 생성: BGM 루프 + 점수 상승/하락 SFX
 * 실행: node scripts/generate-sounds.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function freqFromMidi(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function square(phase) {
  return phase % 1 < 0.5 ? 1 : -1;
}

function triangle(phase) {
  const p = phase % 1;
  return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
}

function writeWav(path, samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(clamp(samples[i], -1, 1) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function renderTone({
  midi,
  start,
  duration,
  wave = "square",
  volume = 0.18,
  attack = 0.01,
  release = 0.08,
}) {
  const startI = Math.floor(start * SAMPLE_RATE);
  const len = Math.floor(duration * SAMPLE_RATE);
  const freq = freqFromMidi(midi);
  const osc = wave === "triangle" ? triangle : square;
  const samples = new Float64Array(startI + len);

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const envAttack = Math.min(1, t / attack);
    const envRelease = Math.min(1, (duration - t) / release);
    const env = Math.max(0, Math.min(envAttack, envRelease));
    samples[startI + i] = osc((freq * i) / SAMPLE_RATE) * volume * env;
  }
  return samples;
}

function mix(...parts) {
  let maxLen = 0;
  for (const p of parts) maxLen = Math.max(maxLen, p.length);
  const out = new Float64Array(maxLen);
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) out[i] += p[i];
  }
  let peak = 0.0001;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.9 ? 0.9 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

function makeBgm() {
  // 경쾌한 8마디 루프 (C 메이저, 120bpm)
  const beat = 0.5;
  const melody = [
    [72, 0, 0.45],
    [76, 0.5, 0.45],
    [79, 1, 0.45],
    [76, 1.5, 0.45],
    [77, 2, 0.45],
    [81, 2.5, 0.45],
    [79, 3, 0.95],
    [72, 4, 0.45],
    [74, 4.5, 0.45],
    [76, 5, 0.45],
    [79, 5.5, 0.45],
    [77, 6, 0.45],
    [74, 6.5, 0.45],
    [72, 7, 0.95],
  ];
  const bass = [
    [48, 0, 0.95],
    [55, 1, 0.95],
    [53, 2, 0.95],
    [55, 3, 0.95],
    [48, 4, 0.95],
    [52, 5, 0.95],
    [53, 6, 0.95],
    [47, 7, 0.95],
  ];
  const parts = [];
  for (const [midi, start, dur] of melody) {
    parts.push(
      renderTone({
        midi,
        start,
        duration: dur,
        wave: "square",
        volume: 0.14,
      }),
    );
  }
  for (const [midi, start, dur] of bass) {
    parts.push(
      renderTone({
        midi,
        start,
        duration: dur,
        wave: "triangle",
        volume: 0.16,
        attack: 0.02,
        release: 0.12,
      }),
    );
  }
  // 약한 하이햇
  const hat = new Float64Array(Math.floor(8 * beat * 2 * SAMPLE_RATE));
  for (let n = 0; n < 16; n++) {
    const start = Math.floor(n * beat * SAMPLE_RATE);
    for (let i = 0; i < SAMPLE_RATE * 0.04; i++) {
      const env = 1 - i / (SAMPLE_RATE * 0.04);
      hat[start + i] += (Math.random() * 2 - 1) * 0.04 * env;
    }
  }
  parts.push(hat);
  return mix(...parts);
}

function makeScoreUp() {
  return mix(
    renderTone({ midi: 72, start: 0, duration: 0.12, volume: 0.22 }),
    renderTone({ midi: 76, start: 0.08, duration: 0.12, volume: 0.22 }),
    renderTone({ midi: 79, start: 0.16, duration: 0.14, volume: 0.22 }),
    renderTone({ midi: 84, start: 0.26, duration: 0.22, volume: 0.2, release: 0.14 }),
  );
}

function makeScoreDown() {
  return mix(
    renderTone({
      midi: 64,
      start: 0,
      duration: 0.14,
      volume: 0.2,
      wave: "triangle",
    }),
    renderTone({
      midi: 60,
      start: 0.1,
      duration: 0.16,
      volume: 0.2,
      wave: "triangle",
    }),
    renderTone({
      midi: 55,
      start: 0.22,
      duration: 0.28,
      volume: 0.22,
      wave: "triangle",
      release: 0.18,
    }),
  );
}

writeWav(join(outDir, "bgm.wav"), makeBgm());
writeWav(join(outDir, "score_up.wav"), makeScoreUp());
writeWav(join(outDir, "score_down.wav"), makeScoreDown());
console.log("wrote bgm.wav, score_up.wav, score_down.wav");

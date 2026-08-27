/**
 * sound.ts — BGM + 게임 SFX
 *
 * howler 로 배경음/효과음을 미리 로드하고 재생한다.
 * 브라우저 자동재생 정책상 사용자 제스처(시작 버튼·볼륨 조작) 이후에 play가 허용된다.
 */

import { Howl, type HowlOptions } from "howler";

const VOLUME_STORAGE_KEY = "eatitup-bgm-volume";
const DEFAULT_BGM_VOLUME = 0.45;

let bgm: Howl | null = null;
let scoreUpSound: Howl | null = null;
let scoreDownSound: Howl | null = null;
let bgmVolume = loadStoredVolume();
let loadPromise: Promise<void> | null = null;

function loadStoredVolume(): number {
  const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
  const parsed = raw == null ? DEFAULT_BGM_VOLUME : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_BGM_VOLUME;
  return Math.min(1, Math.max(0, parsed));
}

function loadHowl(
  src: string,
  options: Omit<HowlOptions, "src" | "preload" | "onload" | "onloaderror">,
): Promise<Howl | null> {
  return new Promise((resolve) => {
    const sound = new Howl({
      ...options,
      src: [src],
      preload: true,
      onload: () => resolve(sound),
      onloaderror: (_id, err) => {
        console.warn(`사운드 로드 실패 (${src}):`, err);
        resolve(null);
      },
    });
    if (sound.state() === "loaded") resolve(sound);
  });
}

/** BGM/효과음 에셋을 미리 로드한다. */
export function loadSounds(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [loadedBgm, loadedUp, loadedDown] = await Promise.all([
      loadHowl("/sounds/bgm.mp3", {
        loop: true,
        volume: bgmVolume,
      }),
      loadHowl("/sounds/score_up.wav", { volume: 0.85 }),
      loadHowl("/sounds/score_down.wav", { volume: 0.85 }),
    ]);

    bgm = loadedBgm;
    scoreUpSound = loadedUp;
    scoreDownSound = loadedDown;
  })();

  return loadPromise;
}

export function getBgmVolume(): number {
  return bgmVolume;
}

/** 시작 화면 슬라이더에서 호출. 0~1 */
export function setBgmVolume(volume: number): void {
  bgmVolume = Math.min(1, Math.max(0, volume));
  localStorage.setItem(VOLUME_STORAGE_KEY, String(bgmVolume));
  bgm?.volume(bgmVolume);
}

/** 사용자 제스처 이후 루프 재생. 이미 재생 중이면 무시. */
export function startBgm(): void {
  if (!bgm) return;
  if (bgm.playing()) return;
  bgm.volume(bgmVolume);
  bgm.play();
}

export function stopBgm(): void {
  bgm?.stop();
}

/** 점수 상승 효과음 */
export function playScoreUpSound(): void {
  scoreUpSound?.play();
}

/** 점수 하락 효과음 */
export function playScoreDownSound(): void {
  scoreDownSound?.play();
}

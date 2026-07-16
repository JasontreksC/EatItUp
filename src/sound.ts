/**
 * sound.ts — 게임 SFX
 *
 * howler 로 짧은 효과음을 미리 로드하고 재생한다.
 * 브라우저 자동재생 정책상 사용자 제스처(시작 버튼) 이후라면 play가 허용된다.
 */

import { Howl } from "howler";

let eatSound: Howl | null = null;

/** 먹기 효과음 등 사운드 에셋을 미리 로드한다. */
export function loadSounds(): Promise<void> {
  return new Promise((resolve) => {
    const sound = new Howl({
      src: ["/sounds/eat.wav"],
      volume: 0.7,
      preload: true,
      onload: () => {
        eatSound = sound;
        resolve();
      },
      onloaderror: (_id, err) => {
        console.warn("사운드 로드 실패 (무음으로 계속):", err);
        eatSound = null;
        resolve();
      },
    });

    // 이미 캐시되어 loaded 상태면 onload가 다시 안 올 수 있다.
    if (sound.state() === "loaded") {
      eatSound = sound;
      resolve();
    }
  });
}

/** 음식을 먹었을 때 재생하는 게임풍 효과음 */
export function playEatSound(): void {
  eatSound?.play();
}

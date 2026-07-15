/**
 * main.ts — 앱 진입점
 *
 * 브라우저가 index.html을 연 뒤, 이 모듈이 로드되면:
 *  1) DOM 요소를 잡고
 *  2) "시작" 버튼 클릭을 기다렸다가
 *  3) 카메라 / MediaPipe / 에셋을 준비한 다음
 *  4) Game.start()로 게임 루프를 켠다.
 *
 * 실제 매 프레임 반복은 game.ts의 Game.frame()에 있다.
 */

import "./style.css";
import { createFaceLandmarker, startWebcam } from "./face";
import { Game } from "./game";

const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const statusMsg = document.querySelector<HTMLParagraphElement>("#status-msg")!;
const video = document.querySelector<HTMLVideoElement>("#webcam")!;
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;

// 카메라 권한은 사용자 제스처(클릭) 이후에만 요청 가능
startBtn.addEventListener("click", () => {
  void startGame();
});

async function startGame(): Promise<void> {
  startBtn.disabled = true;
  statusMsg.hidden = true;
  statusMsg.textContent = "";
  startBtn.textContent = "준비 중...";

  try {
    // 1) 웹캠 스트림을 숨겨진 <video>에 연결
    await startWebcam(video);

    // 2) Face Landmarker WASM/모델 로드 (첫 실행 시 네트워크 지연 가능)
    const landmarker = await createFaceLandmarker();

    // 3) 게임 객체 생성 + 음식 이미지 프리로드
    const game = new Game(canvas, video, landmarker);
    await game.loadAssets();

    // 4) 시작 오버레이 숨기고 루프 가동
    overlay.hidden = true;
    game.start(); // → src/game.ts 의 frame() 루프 시작
  } catch (error) {
    console.error(error);
    statusMsg.hidden = false;
    statusMsg.textContent =
      error instanceof Error
        ? error.message
        : "카메라를 시작하지 못했습니다. 권한을 확인해 주세요.";
    startBtn.disabled = false;
    startBtn.textContent = "다시 시도";
  }
}

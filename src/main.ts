/**
 * main.ts — 앱 진입점
 *
 * 1) DOM 요소를 잡고
 * 2) "시작" 버튼 클릭을 기다렸다가
 * 3) 카메라 / MediaPipe / 에셋을 준비한 다음
 * 4) Game.start()로 게임 루프를 켠다.
 */

import "./style.css";
import { createFaceLandmarker, startWebcam, stopWebcam } from "./face";
import { Game } from "./game";
import { GameUI } from "./ui";

const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const quitBtn = document.querySelector<HTMLButtonElement>("#quit-btn")!;
const statusMsg = document.querySelector<HTMLParagraphElement>("#status-msg")!;
const video = document.querySelector<HTMLVideoElement>("#webcam")!;
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const uiLayer = document.querySelector<HTMLElement>("#ui-layer")!;

let activeGame: Game | null = null;
let activeUi: GameUI | null = null;

startBtn.addEventListener("click", () => {
  void startGame();
});

quitBtn.addEventListener("click", () => {
  endGame();
});

async function startGame(): Promise<void> {
  startBtn.disabled = true;
  statusMsg.hidden = true;
  statusMsg.textContent = "";
  startBtn.textContent = "준비 중...";

  try {
    await startWebcam(video);
    const landmarker = await createFaceLandmarker();
    const ui = new GameUI(uiLayer);
    const game = new Game(canvas, video, landmarker, ui);
    await game.loadAssets();

    activeGame = game;
    activeUi = ui;
    overlay.hidden = true;
    quitBtn.hidden = false;
    game.start();
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

/** 루프 중단 + 카메라 해제 + 시작 화면 복귀 */
function endGame(): void {
  activeGame?.stop();
  activeUi?.clear();
  activeGame = null;
  activeUi = null;
  stopWebcam(video);
  quitBtn.hidden = true;
  overlay.hidden = false;
  startBtn.disabled = false;
  startBtn.textContent = "카메라 켜고 시작";
}

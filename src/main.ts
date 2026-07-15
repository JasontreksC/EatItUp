import "./style.css";
import { createFaceLandmarker, startWebcam } from "./face";
import { Game } from "./game";

const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const statusMsg = document.querySelector<HTMLParagraphElement>("#status-msg")!;
const video = document.querySelector<HTMLVideoElement>("#webcam")!;
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;

startBtn.addEventListener("click", () => {
  void startGame();
});

async function startGame(): Promise<void> {
  startBtn.disabled = true;
  statusMsg.hidden = true;
  statusMsg.textContent = "";
  startBtn.textContent = "준비 중...";

  try {
    await startWebcam(video);
    const landmarker = await createFaceLandmarker();
    const game = new Game(canvas, video, landmarker);
    await game.loadAssets();

    overlay.hidden = true;
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

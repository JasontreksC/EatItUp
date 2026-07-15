import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  CAM_HEIGHT,
  CAM_WIDTH,
  JAW_OPEN_THRESHOLD,
  getJawOpenValue,
  getMouthCenter,
  type Vec2,
} from "./face";
import { Food } from "./food";

const FOOD_FILES = [
  "g_salad.png",
  "g_tomato.png",
  "b_candy.png",
  "b_ramen.png",
] as const;

const SPAWN_INTERVAL = 4;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly landmarker: FaceLandmarker;
  private readonly foodImages = new Map<string, HTMLImageElement>();

  private foodPool: Food[] = [];
  private mouthCenter: Vec2 = { x: CAM_WIDTH / 2, y: CAM_HEIGHT / 2 };
  private score = 0;
  private spawnTimer = 0;
  private lastTimestamp = 0;
  private lastJawOpen = 0;
  private lastMouthOpen = false;
  private running = false;
  private rafId = 0;

  constructor(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    landmarker: FaceLandmarker,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context를 만들 수 없습니다.");

    this.canvas = canvas;
    this.ctx = ctx;
    this.video = video;
    this.landmarker = landmarker;
    this.canvas.width = CAM_WIDTH;
    this.canvas.height = CAM_HEIGHT;
  }

  async loadAssets(): Promise<void> {
    await Promise.all(
      FOOD_FILES.map(async (name) => {
        const image = await loadImage(`/foods/${name}`);
        this.foodImages.set(name, image);
      }),
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame(timestamp: number): void {
    if (!this.running) return;

    const deltaTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;
    this.spawnTimer += deltaTime;

    this.updateVision(timestamp);
    this.updateFoods(deltaTime);
    this.draw();

    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  private updateVision(timestamp: number): void {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const result = this.landmarker.detectForVideo(this.video, timestamp);
    const jawOpen = getJawOpenValue(result);
    const mouth = getMouthCenter(result, CAM_WIDTH, CAM_HEIGHT);

    // 캔버스에 거울 모드로 그리므로 X를 뒤집어 좌표를 맞춤
    if (mouth) {
      this.mouthCenter = { x: CAM_WIDTH - mouth.x, y: mouth.y };
    }

    this.lastJawOpen = jawOpen;
    this.lastMouthOpen = jawOpen > JAW_OPEN_THRESHOLD;
  }

  private updateFoods(deltaTime: number): void {
    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnFood();
      this.spawnTimer = 0;
    }

    const remaining: Food[] = [];
    for (const food of this.foodPool) {
      food.update(deltaTime, this.mouthCenter, this.lastMouthOpen);
      const event = food.consumeEvent();
      if (event?.type === "eaten") {
        this.score = Math.max(this.score + food.healthy, 0);
        continue;
      }
      if (event?.type === "waste") continue;
      remaining.push(food);
    }
    this.foodPool = remaining;
  }

  private spawnFood(): void {
    const name = FOOD_FILES[Math.floor(Math.random() * FOOD_FILES.length)];
    const image = this.foodImages.get(name);
    if (!image) return;

    const healthy = name.startsWith("g") ? 1 : -1;
    this.foodPool.push(
      new Food(
        image,
        name,
        100,
        healthy,
        50,
        CAM_WIDTH + 10,
        [Math.floor(CAM_HEIGHT * 0.2), Math.floor(CAM_HEIGHT * 0.8)],
      ),
    );
  }

  private draw(): void {
    const { ctx, canvas, video } = this;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    for (const food of this.foodPool) {
      food.draw(ctx);
    }

    ctx.beginPath();
    ctx.fillStyle = this.lastMouthOpen ? "#00ff00" : "#ff0000";
    ctx.arc(this.mouthCenter.x, this.mouthCenter.y, 8, 0, Math.PI * 2);
    ctx.fill();

    const statusColor = this.lastMouthOpen ? "#50dc64" : "#dc5050";
    ctx.font = "20px sans-serif";
    ctx.fillStyle = statusColor;
    ctx.fillText(
      `jawOpen: ${this.lastJawOpen.toFixed(3)}  (${this.lastMouthOpen ? "OPEN" : "CLOSED"})`,
      10,
      28,
    );
    ctx.fillStyle = "#c8c8c8";
    ctx.fillText(`threshold = ${JAW_OPEN_THRESHOLD}`, 10, 54);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`Score: ${this.score}`, 10, 80);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}

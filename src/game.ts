/**
 * game.ts — 게임 본체
 *
 * 역할:
 * - requestAnimationFrame 기반 게임 루프 구동
 * - 매 프레임: 얼굴 인식 → 음식 갱신 → 화면 그리기
 * - 점수 / 스폰 타이머 / 음식 풀 관리
 *
 * 진입 흐름:
 *   main.ts → Game.start() → frame() → (자기 자신을 다시 예약) → ...
 */

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

/** public/foods/ 아래 스프라이트. 파일명이 g_면 건강(+1), b_면 정크(-1). */
const FOOD_FILES = [
  "g_salad.png",
  "g_tomato.png",
  "b_candy.png",
  "b_ramen.png",
] as const;

/** 음식 스폰 간격 (초). 예전 Python 버전의 timer >= 4.0 과 동일. */
const SPAWN_INTERVAL = 4;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** 숨겨진 <video> — MediaPipe 입력 + 배경으로 사용 */
  private readonly video: HTMLVideoElement;
  private readonly landmarker: FaceLandmarker;
  /** 파일명 → 미리 로드된 Image (스폰 시마다 새로 로드하지 않음) */
  private readonly foodImages = new Map<string, HTMLImageElement>();

  /** 화면에 살아있는 음식들 */
  private foodPool: Food[] = [];
  /** 거울 모드 캔버스 좌표 기준 입 중심 */
  private mouthCenter: Vec2 = { x: CAM_WIDTH / 2, y: CAM_HEIGHT / 2 };
  private score = 0;
  /** 다음 스폰까지 누적된 시간 (초) */
  private spawnTimer = 0;
  /** 직전 프레임의 performance.now() — 델타타임 계산용 */
  private lastTimestamp = 0;
  /** HUD에 보여줄 최근 jawOpen 값 */
  private lastJawOpen = 0;
  /** jawOpen이 임계값을 넘었는지 (입 벌림 여부) */
  private lastMouthOpen = false;
  private running = false;
  /** requestAnimationFrame 핸들 — stop()에서 취소할 때 사용 */
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
    // CSS 크기와 별개로, 실제 픽셀 버퍼를 게임 해상도에 맞춤
    this.canvas.width = CAM_WIDTH;
    this.canvas.height = CAM_HEIGHT;
  }

  /** 음식 이미지를 전부 로드. 게임 시작 전에 await 해야 함. */
  async loadAssets(): Promise<void> {
    await Promise.all(
      FOOD_FILES.map(async (name) => {
        const image = await loadImage(`/foods/${name}`);
        this.foodImages.set(name, image);
      }),
    );
  }

  /**
   * 게임 루프 시작점.
   * 여기서 frame()을 한 번 예약하면, frame() 끝이 다음 frame()을 다시 예약하는
   * 식으로 매 프레임 반복된다. (예전 Python의 while running: 에 해당)
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    // ★ 게임 루프 최초 예약
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  /** 루프 중단. running=false로 다음 frame 진입을 막고, 예약된 raf도 취소. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * ★★★ 게임 루프 본체 (매 프레임 1회 호출) ★★★
   *
   * 위치: src/game.ts → Game.frame()
   * 호출: start() 또는 직전 frame() 끝의 requestAnimationFrame
   *
   * 한 프레임에서 하는 일:
   *  1) 델타타임 계산
   *  2) 얼굴/입 인식 (updateVision)
   *  3) 음식 이동·충돌·스폰 (updateFoods)
   *  4) 화면 그리기 (draw)
   *  5) 다음 프레임 예약
   */
  private frame(timestamp: number): void {
    if (!this.running) return;

    // 초 단위 경과 시간. 탭 전환 등으로 한 프레임이 너무 길면 물리 튐을 막기 위해 상한(0.05s)
    const deltaTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;
    this.spawnTimer += deltaTime;

    // --- 업데이트 단계 ---
    this.updateVision(timestamp);
    this.updateFoods(deltaTime);

    // --- 렌더 단계 ---
    this.draw();

    // ★ 다음 프레임을 브라우저에 다시 요청 → 사실상의 "반복문"
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * 웹캠 프레임에서 입 벌림/입 위치를 읽어 상태에 저장.
   * MediaPipe VIDEO 모드는 단조 증가하는 timestamp가 필요하다.
   */
  private updateVision(timestamp: number): void {
    // 아직 재생할 프레임이 없으면 스킵 (카메라 워밍업 구간)
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const result = this.landmarker.detectForVideo(this.video, timestamp);
    const jawOpen = getJawOpenValue(result);
    const mouth = getMouthCenter(result, CAM_WIDTH, CAM_HEIGHT);

    // MediaPipe 좌표는 "원본 video" 기준인데, draw()에서 화면을 좌우 반전하므로
    // 게임 오브젝트/입 표시도 같은 거울 좌표계로 맞춰 둔다.
    if (mouth) {
      this.mouthCenter = { x: CAM_WIDTH - mouth.x, y: mouth.y };
    }

    this.lastJawOpen = jawOpen;
    this.lastMouthOpen = jawOpen > JAW_OPEN_THRESHOLD;
  }

  /**
   * 스폰 타이머 처리 + 모든 음식 update + eaten/waste 이벤트 반영.
   * 제거된 음식은 remaining에 넣지 않아 foodPool에서 빠진다.
   */
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
        // 건강 음식 +1, 정크 -1. 점수는 0 아래로 내려가지 않음.
        this.score = Math.max(this.score + food.healthy, 0);
        continue; // pool에서 제거
      }
      if (event?.type === "waste") {
        continue; // 화면 밖으로 나감 → 제거, 점수 변화 없음
      }
      remaining.push(food);
    }
    this.foodPool = remaining;
  }

  /** 화면 오른쪽 밖에서 랜덤 음식을 하나 생성해 풀에 넣는다. */
  private spawnFood(): void {
    const name = FOOD_FILES[Math.floor(Math.random() * FOOD_FILES.length)];
    const image = this.foodImages.get(name);
    if (!image) return;

    const healthy = name.startsWith("g") ? 1 : -1;
    this.foodPool.push(
      new Food(
        image,
        name,
        100, // 표시 크기(px)
        healthy,
        50, // 왼쪽 이동 속도(px/s)
        CAM_WIDTH + 10, // 스폰 X: 화면 바로 오른쪽
        [Math.floor(CAM_HEIGHT * 0.2), Math.floor(CAM_HEIGHT * 0.8)], // 스폰 Y 범위
      ),
    );
  }

  /**
   * 한 프레임 그리기 순서:
   *  1) 거울 모드 웹캠 배경
   *  2) 음식 스프라이트
   *  3) 입 위치 점
   *  4) HUD 텍스트 (좌우 반전하지 않음 — 읽기 쉽게)
   */
  private draw(): void {
    const { ctx, canvas, video } = this;

    // 1) 배경: 좌우 반전된 웹캠
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2) 음식 (이미 mouthCenter와 같은 거울 좌표계)
    for (const food of this.foodPool) {
      food.draw(ctx);
    }

    // 3) 입 추적 점 — 열림=초록, 닫힘=빨강
    ctx.beginPath();
    ctx.fillStyle = this.lastMouthOpen ? "#00ff00" : "#ff0000";
    ctx.arc(this.mouthCenter.x, this.mouthCenter.y, 8, 0, Math.PI * 2);
    ctx.fill();

    // 4) HUD
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

/** 이미지 한 장을 Promise로 로드. 실패 시 reject. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}

/**
 * game.ts — 게임 본체
 *
 * 역할:
 * - requestAnimationFrame 기반 게임 루프 구동
 * - face.ts 스냅샷 ↔ Eater 매칭/생성/소멸
 * - 음식 스폰·충돌·점수
 * - GameUI 로 시작/점수 연출 트리거
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Eater, pickUnusedEaterColor } from "./eater";
import {
  CAM_HEIGHT,
  CAM_WIDTH,
  MAX_FACES,
  extractFaceSnapshots,
  toMirrorBounds,
  toMirrorCoords,
  type FaceSnapshot,
} from "./face";
import { Food } from "./food";
import { clamp, distance, randomPick } from "./math";
import type { GameUI } from "./ui";

/** public/foods/ 아래 스프라이트. 파일명이 g_면 건강(+1), b_면 정크(-1). */
const FOOD_FILES = [
  "g_salad.png",
  "g_tomato.png",
  "b_candy.png",
  "b_ramen.png",
] as const;

/** 음식 스폰 간격 (초) */
const SPAWN_INTERVAL = 4;

/**
 * 기존 Eater 와 새 스냅샷을 같은 사람으로 볼 최대 입 거리(px).
 * MediaPipe가 얼굴 ID를 안 주므로 위치 근접으로 프레임 간 매칭한다.
 */
const EATER_MATCH_MAX_DIST = 140;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly landmarker: FaceLandmarker;
  private readonly ui: GameUI;
  private readonly foodImages = new Map<string, HTMLImageElement>();

  private foodPool: Food[] = [];
  /** 카메라에 잡힌 얼굴마다 하나씩. 최대 MAX_FACES */
  private eaterPool: Eater[] = [];
  private spawnTimer = 0;
  private lastTimestamp = 0;
  private running = false;
  private rafId = 0;

  constructor(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    landmarker: FaceLandmarker,
    ui: GameUI,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context를 만들 수 없습니다.");

    this.canvas = canvas;
    this.ctx = ctx;
    this.video = video;
    this.landmarker = landmarker;
    this.ui = ui;
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

  /**
   * ★★★ 게임 루프 본체 ★★★
   * 1) 인식 → Eater 동기화
   * 2) 음식 갱신
   * 3) 그리기
   * 4) 다음 프레임 예약
   */
  private frame(timestamp: number): void {
    if (!this.running) return;

    const deltaTime = clamp((timestamp - this.lastTimestamp) / 1000, 0, 0.05);
    this.lastTimestamp = timestamp;
    this.spawnTimer += deltaTime;

    this.syncEatersFromVision(timestamp, deltaTime);
    this.updateFoods(deltaTime);
    this.ui.syncEaters(this.eaterPool);
    this.draw();

    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  private syncEatersFromVision(timestamp: number, deltaTime: number): void {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.markAllEatersMissed(deltaTime);
      this.pruneLostEaters();
      return;
    }

    const result = this.landmarker.detectForVideo(this.video, timestamp);
    const rawSnapshots = extractFaceSnapshots(result, CAM_WIDTH, CAM_HEIGHT);

    const snapshots = rawSnapshots.map((snap) => ({
      mouthCenter: toMirrorCoords(snap.mouthCenter),
      bounds: toMirrorBounds(snap.bounds),
      jawOpen: snap.jawOpen,
    }));

    this.matchAndSpawnEaters(snapshots, deltaTime);
    this.pruneLostEaters();
  }

  private matchAndSpawnEaters(
    snapshots: FaceSnapshot[],
    deltaTime: number,
  ): void {
    const usedEaters = new Set<Eater>();
    const usedSnapshots = new Set<number>();

    type Pair = { eater: Eater; snapIndex: number; dist: number };
    const pairs: Pair[] = [];

    for (const eater of this.eaterPool) {
      for (let i = 0; i < snapshots.length; i++) {
        pairs.push({
          eater,
          snapIndex: i,
          dist: distance(eater.mouthCenter, snapshots[i]!.mouthCenter),
        });
      }
    }

    pairs.sort((a, b) => a.dist - b.dist);

    for (const pair of pairs) {
      if (pair.dist > EATER_MATCH_MAX_DIST) break;
      if (usedEaters.has(pair.eater) || usedSnapshots.has(pair.snapIndex)) {
        continue;
      }
      pair.eater.applySnapshot(snapshots[pair.snapIndex]!, deltaTime);
      usedEaters.add(pair.eater);
      usedSnapshots.add(pair.snapIndex);
    }

    for (const eater of this.eaterPool) {
      if (!usedEaters.has(eater)) {
        eater.markMissed(deltaTime);
      }
    }

    // 새 얼굴 → Eater 생성 + "게임 시작!" UI
    for (let i = 0; i < snapshots.length; i++) {
      if (usedSnapshots.has(i)) continue;
      if (this.eaterPool.length >= MAX_FACES) break;

      const color = pickUnusedEaterColor(this.eaterPool.map((e) => e.color));
      const eater = new Eater(snapshots[i]!, color);
      this.eaterPool.push(eater);
      this.ui.onEaterJoined(eater);
    }
  }

  private markAllEatersMissed(deltaTime: number): void {
    for (const eater of this.eaterPool) {
      eater.markMissed(deltaTime);
    }
  }

  private pruneLostEaters(): void {
    const remaining: Eater[] = [];
    for (const eater of this.eaterPool) {
      if (eater.isLost()) {
        this.ui.onEaterLeft(eater);
        continue;
      }
      remaining.push(eater);
    }
    this.eaterPool = remaining;
  }

  private updateFoods(deltaTime: number): void {
    if (this.eaterPool.length > 0 && this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnFood();
      this.spawnTimer = 0;
    }

    const remaining: Food[] = [];
    for (const food of this.foodPool) {
      food.update(deltaTime, this.eaterPool);
      const event = food.consumeEvent();

      if (event?.type === "eaten") {
        if (event.eater) {
          event.eater.addScore(food.healthy);
          this.ui.onScoreGain(event.eater, food.healthy);
        }
        continue;
      }
      if (event?.type === "waste") {
        continue;
      }
      remaining.push(food);
    }
    this.foodPool = remaining;
  }

  private spawnFood(): void {
    const name = randomPick(FOOD_FILES);
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

    // 1) 거울 모드 웹캠 배경
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2) 음식
    for (const food of this.foodPool) {
      food.draw(ctx);
    }

    // 3) 얼굴 인식 바운더리 프레임 (텍스트 HUD는 DOM/GSAP 담당)
    for (const eater of this.eaterPool) {
      eater.draw(ctx);
    }
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

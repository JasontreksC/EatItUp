/**
 * food.ts — 개별 음식 엔티티
 *
 * 상태 머신에 가깝게 동작한다:
 *  1) floating  : 오른쪽으로 스폰 → 왼쪽으로 흘러감
 *  2) eatingUp  : 입 근처 + 입 벌림 → 입으로 빨려가며 축소
 *  3) eaten/waste 이벤트 → Game이 풀에서 제거
 *
 * update()는 이벤트를 "예약"만 하고, Game이 consumeEvent()로 꺼낸다.
 * (예전 pygame.event.post 패턴을 웹에 맞게 단순화한 것)
 */

import type { Vec2 } from "./face";

export type FoodEvent = { type: "eaten" | "waste"; food: Food };

export class Food {
  readonly foodName: string;
  /** +1 건강 / -1 정크. 먹혔을 때 점수에 더해짐 */
  readonly healthy: number;
  /** 왼쪽으로 흘러가는 속도 (px/초) */
  readonly floatingSpeed: number;
  /** 원래 크기 (px). 먹는 연출에서 currentSize의 기준 */
  readonly size: number;
  readonly image: HTMLImageElement;

  /** 중심 좌표 (거울 모드 캔버스 좌표계) */
  centerPos: Vec2;
  /** true면 흡입 연출 중 — 더 이상 흘러가지 않음 */
  isEatingUp = false;
  /** 흡입 연출 남은 시간 (초). tweenSizeTime에서 0으로 감소 */
  tweenTimer = 0;
  /** 현재 그릴 크기. 먹을 때 점점 작아짐 */
  currentSize: number;

  /** 흡입 연출 총 길이 (초) */
  private readonly tweenSizeTime = 0.5;
  /** update()에서 세팅 → Game.updateFoods()가 consumeEvent()로 수거 */
  private pendingEvent: FoodEvent | null = null;

  constructor(
    image: HTMLImageElement,
    foodName: string,
    size: number,
    healthy: number,
    floatingSpeed: number,
    spawnX: number,
    spawnYRange: [number, number],
  ) {
    this.image = image;
    this.foodName = foodName;
    this.size = size;
    this.currentSize = size;
    this.healthy = healthy;
    this.floatingSpeed = floatingSpeed;
    this.centerPos = {
      x: spawnX,
      y: randomInt(spawnYRange[0], spawnYRange[1]),
    };
  }

  /**
   * 매 프레임 호출되는 음식 로직.
   * @param deltaTime 경과 초
   * @param mouthCenter 현재 입 중심 (거울 좌표)
   * @param isMouthOpen jawOpen이 임계값 초과인지
   */
  update(deltaTime: number, mouthCenter: Vec2, isMouthOpen: boolean): void {
    // 매 프레임 이벤트를 새로 판정 (지난 프레임 잔여 이벤트 제거)
    this.pendingEvent = null;

    // --- 흡입 중: 입 쪽으로 끌어당기며 축소 ---
    if (this.isEatingUp) {
      this.tweenTimer = Math.max(this.tweenTimer - deltaTime, 0);

      // 입 방향으로 보간 이동 (원본 Python: center += (mouth - center) * dt)
      this.centerPos.x += (mouthCenter.x - this.centerPos.x) * deltaTime;
      this.centerPos.y += (mouthCenter.y - this.centerPos.y) * deltaTime;

      // 남은 시간에 비례해 크기 감소 (1 → 0)
      this.currentSize = this.size * (this.tweenTimer / this.tweenSizeTime);

      if (this.tweenTimer <= 0.01) {
        this.pendingEvent = { type: "eaten", food: this };
      }
      return;
    }

    // --- 평소: 왼쪽으로 표류 ---
    this.centerPos.x -= this.floatingSpeed * deltaTime;

    // 화면 왼쪽 밖으로 완전히 나가면 낭비 처리
    if (this.centerPos.x < this.size / 2 * -1) {
      this.pendingEvent = { type: "waste", food: this };
      return;
    }

    // 입과의 거리가 50px 이내이고 입을 벌리고 있으면 흡입 시작
    if (distance(this.centerPos, mouthCenter) <= 50 && isMouthOpen) {
      this.tweenTimer = this.tweenSizeTime;
      this.isEatingUp = true;
    }
  }

  /** Game이 호출. pendingEvent를 꺼내고 비운다. */
  consumeEvent(): FoodEvent | null {
    const event = this.pendingEvent;
    this.pendingEvent = null;
    return event;
  }

  /** 중심 기준으로 정사각 스프라이트 그리기 */
  draw(ctx: CanvasRenderingContext2D): void {
    const size = Math.max(this.currentSize, 0.1); // 0이면 drawImage 오류 방지
    ctx.drawImage(
      this.image,
      this.centerPos.x - size / 2,
      this.centerPos.y - size / 2,
      size,
      size,
    );
  }
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** min~max 포함 정수 난수 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

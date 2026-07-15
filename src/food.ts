/**
 * food.ts — 개별 음식 엔티티
 *
 * 상태 머신에 가깝게 동작한다:
 *  1) floating  : 오른쪽으로 스폰 → 왼쪽으로 흘러감
 *  2) eatingUp  : 어떤 Eater 의 열린 입 근처 → 그 입으로 빨려가며 축소
 *  3) eaten/waste 이벤트 → Game이 풀에서 제거
 *
 * update()는 이벤트를 "예약"만 하고, Game이 consumeEvent()로 꺼낸다.
 */

import type { Eater } from "./eater";
import { distance, lerp, randomInt, vec2, type Vec2 } from "./math";

export type FoodEvent =
  | { type: "eaten"; food: Food; eater: Eater | null }
  | { type: "waste"; food: Food };

export class Food {
  readonly foodName: string;
  /** +1 건강 / -1 정크. 먹혔을 때 해당 Eater 점수에 더해짐 */
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

  /** 흡입을 시작한 Eater. 연출 동안 이 입을 따라간다. */
  private targetEater: Eater | null = null;
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
    this.centerPos = vec2(spawnX, randomInt(spawnYRange[0], spawnYRange[1]));
  }

  /**
   * 매 프레임 호출되는 음식 로직.
   * @param deltaTime 경과 초
   * @param eaters 현재 살아있는 플레이어들
   */
  update(deltaTime: number, eaters: readonly Eater[]): void {
    this.pendingEvent = null;

    // --- 흡입 중: 대상 Eater 입 쪽으로 끌어당기며 축소 ---
    if (this.isEatingUp) {
      this.tweenTimer = Math.max(this.tweenTimer - deltaTime, 0);

      const mouth = this.resolveTargetMouth(eaters);
      if (mouth) {
        this.centerPos = lerp(this.centerPos, mouth, deltaTime);
      }

      this.currentSize = this.size * (this.tweenTimer / this.tweenSizeTime);

      if (this.tweenTimer <= 0.01) {
        this.pendingEvent = {
          type: "eaten",
          food: this,
          eater: this.targetEater,
        };
      }
      return;
    }

    // --- 평소: 왼쪽으로 표류 ---
    this.centerPos.x -= this.floatingSpeed * deltaTime;

    if (this.centerPos.x < (this.size / 2) * -1) {
      this.pendingEvent = { type: "waste", food: this };
      return;
    }

    // 입을 벌린 Eater 중 가까운 사람이 있으면 흡입 시작
    const eater = this.findEatingEater(eaters);
    if (eater) {
      this.targetEater = eater;
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
    const size = Math.max(this.currentSize, 0.1);
    ctx.drawImage(
      this.image,
      this.centerPos.x - size / 2,
      this.centerPos.y - size / 2,
      size,
      size,
    );
  }

  private resolveTargetMouth(eaters: readonly Eater[]): Vec2 | null {
    if (this.targetEater && eaters.includes(this.targetEater)) {
      return this.targetEater.mouthCenter;
    }
    // 대상이 카메라에서 사라졌으면 마지막 위치로 연출만 마무리
    return this.targetEater?.mouthCenter ?? null;
  }

  private findEatingEater(eaters: readonly Eater[]): Eater | null {
    let best: Eater | null = null;
    let bestDist = 50; // 이 거리 이내만 후보

    for (const eater of eaters) {
      if (!eater.isMouthOpen) continue;
      const d = distance(this.centerPos, eater.mouthCenter);
      if (d <= bestDist) {
        bestDist = d;
        best = eater;
      }
    }
    return best;
  }
}

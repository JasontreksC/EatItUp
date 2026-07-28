/**
 * eater.ts — 플레이어 엔티티 (인식된 얼굴 1명 = Eater 1개)
 *
 * face.ts 가 "지금 프레임에 얼굴이 어디 있는지"만 알려주면,
 * Game 이 그 스냅샷을 기존 Eater 에 매칭하거나 새 Eater 를 만든다.
 *
 * 수명:
 *  - 얼굴이 새로 잡히면 생성 → 플레이 시작
 *  - 여러 프레임 동안 매칭이 안 되면 소멸 → 플레이 종료
 */

import {
  JAW_OPEN_THRESHOLD,
  type FaceBounds,
  type FaceSnapshot,
} from "./face";
import { lerp, lerpNumber, smoothAlpha, vec2, type Vec2 } from "./math";

/**
 * UI/프레임 구분용 색 (최대 3명 = 3색).
 * 동시에 살아있는 Eater 끼리는 겹치지 않게 부여한다.
 */
export const EATER_COLORS = ["#8ef0a4", "#7ec8ff", "#ffd27a"] as const;

/** 이 시간(초) 동안 얼굴이 안 잡히면 소멸. 1프레임 깜빡임 방지용 짧은 유예. */
export const EATER_LOST_GRACE_SEC = 0.3;

/** 바운더리/점수 앵커 위치 스무딩 반감기(초). 작을수록 더 민첩. */
const TRACK_SMOOTH_HALF_LIFE = 0.07;

let nextEaterId = 1;

/**
 * 현재 사용 중이 아닌 색 하나를 고른다.
 * 세 자리 모두 찼다면(이론상 발생 X) 첫 색으로 폴백.
 */
export function pickUnusedEaterColor(usedColors: Iterable<string>): string {
  const used = new Set(usedColors);
  for (const color of EATER_COLORS) {
    if (!used.has(color)) return color;
  }
  return EATER_COLORS[0];
}

export class Eater {
  /** 내부 식별용. UI에는 번호를 표시하지 않는다. */
  readonly id: number;
  /** 프레임/점수 UI 색 — 동시 생존 Eater 간 중복 없음 */
  readonly color: string;

  /** 거울 모드 캔버스 좌표의 입 중심 (먹기 판정) */
  mouthCenter: Vec2;
  /** 거울 모드 얼굴 바운더리 */
  bounds: FaceBounds;
  /** 점수 UI를 올릴 머리 위 앵커 */
  headAnchor: Vec2;
  jawOpen = 0;
  isMouthOpen = false;
  /** 이 Eater 가 먹은 점수 (0 미만으로 내려가지 않음) */
  score = 0;

  /** 연속으로 매칭에 실패한 누적 시간(초) */
  private missedSec = 0;
  private lost = false;

  constructor(snapshot: FaceSnapshot, color: string) {
    this.id = nextEaterId++;
    this.color = color;
    this.mouthCenter = vec2(snapshot.mouthCenter.x, snapshot.mouthCenter.y);
    this.bounds = { ...snapshot.bounds };
    this.headAnchor = headAnchorFromBounds(this.bounds);
    // 생성 직후는 스냅(보간 없이) — 첫 프레임부터 올바른 위치에
    this.jawOpen = snapshot.jawOpen;
    this.isMouthOpen = snapshot.jawOpen > JAW_OPEN_THRESHOLD;
  }

  /**
   * 이번 프레임에 같은 얼굴로 매칭됐을 때 호출.
   * 바운더리·입·머리 앵커는 이전 값과 보간해 부드럽게 따라간다.
   */
  applySnapshot(snapshot: FaceSnapshot, deltaTime: number): void {
    const t = smoothAlpha(deltaTime, TRACK_SMOOTH_HALF_LIFE);

    this.mouthCenter = lerp(this.mouthCenter, snapshot.mouthCenter, t);
    this.bounds = lerpBounds(this.bounds, snapshot.bounds, t);
    // 점수는 스무딩된 바운더리 바로 위에 붙여 박스와 어긋나지 않게 함
    this.headAnchor = headAnchorFromBounds(this.bounds);

    // 표정 판정은 반응성을 위해 즉시 반영
    this.jawOpen = snapshot.jawOpen;
    this.isMouthOpen = snapshot.jawOpen > JAW_OPEN_THRESHOLD;
    this.missedSec = 0;
  }

  /** 이번 프레임에 매칭되는 얼굴이 없을 때 호출 */
  markMissed(deltaTime: number): void {
    this.missedSec += deltaTime;
    if (this.missedSec >= EATER_LOST_GRACE_SEC) {
      this.lost = true;
    }
  }

  /** true면 Game 이 풀에서 제거해야 함 (플레이 종료) */
  isLost(): boolean {
    return this.lost;
  }

  /** 음식 섭취 점수 반영 */
  addScore(delta: number): void {
    this.score = Math.max(this.score + delta, 0);
  }

  /**
   * 얼굴 인식 프레임 + (입 벌림 시) 흡입 스트림 UI.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    this.drawFaceFrame(ctx);
    if (this.isMouthOpen) {
      this.drawSuctionStreams(ctx);
    }
  }

  /** 코너 브래킷 + 얇은 외곽. 입을 벌리면 더 밝고 두껍게. */
  private drawFaceFrame(ctx: CanvasRenderingContext2D): void {
    const { x, y, w, h } = this.bounds;
    const corner = Math.min(w, h) * 0.22;
    const lineW = this.isMouthOpen ? 3.5 : 2.2;
    const alpha = this.isMouthOpen ? 1 : 0.72;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = lineW;
    ctx.lineCap = "square";
    ctx.globalAlpha = alpha;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.isMouthOpen ? 16 : 8;

    drawCorner(ctx, x, y, corner, 1, 1);
    drawCorner(ctx, x + w, y, corner, -1, 1);
    drawCorner(ctx, x, y + h, corner, 1, -1);
    drawCorner(ctx, x + w, y + h, corner, -1, -1);

    ctx.globalAlpha = alpha * 0.28;
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * 입 주변 링(둘레)에서만 짧은 직선이 안쪽으로 살짝 빨려 들어가는 UI.
   * - 각도는 스트릭마다 무작위 (균등 분할 X)
   * - 중앙 dead zone 안으로는 그리지 않음
   */
  private drawSuctionStreams(ctx: CanvasRenderingContext2D): void {
    const { x: mx, y: my } = this.mouthCenter;
    const t = performance.now() / 1000;
    const outerR = 30;
    const innerR = 16; // 이 안쪽에는 선을 그리지 않음
    const streakCount = 9;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineCap = "round";
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 3;

    for (let i = 0; i < streakCount; i++) {
      // 한 생애(0→1)가 끝날 때마다 각도를 다시 뽑아 기계적인 고정 배치를 피함
      const cycle = t * 2.6 + i * 0.91;
      const life = cycle % 1;
      const generation = Math.floor(cycle);
      const angle = hash01(this.id, i, generation) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // 링 대역(outer → inner)만 이동
      const midR = outerR + (innerR - outerR) * life;
      const halfLen = 3.5 + hash01(i, generation, this.id) * 3.5;
      const r0 = Math.min(outerR, midR + halfLen);
      const r1 = Math.max(innerR, midR - halfLen);
      if (r0 - r1 < 1.5) continue;

      // 등장/소멸만 살짝 페이드, 중앙으로 갈수록 더 옅게
      const edgeFade = Math.sin(life * Math.PI);
      ctx.globalAlpha = edgeFade * 0.4;
      ctx.lineWidth = 1.3;

      ctx.beginPath();
      ctx.moveTo(mx + cos * r0, my + sin * r0);
      ctx.lineTo(mx + cos * r1, my + sin * r1);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function headAnchorFromBounds(bounds: FaceBounds): Vec2 {
  return vec2(bounds.x + bounds.w / 2, bounds.y - 8);
}

function lerpBounds(a: FaceBounds, b: FaceBounds, t: number): FaceBounds {
  return {
    x: lerpNumber(a.x, b.x, t),
    y: lerpNumber(a.y, b.y, t),
    w: lerpNumber(a.w, b.w, t),
    h: lerpNumber(a.h, b.h, t),
  };
}

/** 결정적 의사난수 0~1. 같은 인자면 같은 값 (프레임마다 깜빡이지 않음). */
function hash01(a: number, b: number, c: number): number {
  let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** (cx,cy) 모서리에서 dirX/dirY 방향으로 L자 브래킷 */
function drawCorner(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  dirX: number,
  dirY: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx + dirX * len, cy);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx, cy + dirY * len);
  ctx.stroke();
}

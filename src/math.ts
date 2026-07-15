/**
 * math.ts — 게임에서 자주 쓰는 2D/난수 유틸
 *
 * face / food / game 등 어디서든 여기서 import 해서 쓴다.
 */

/** 2D 좌표/벡터 */
export type Vec2 = { x: number; y: number };

/** Vec2 생성 헬퍼 */
export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

/** 두 점 사이 유클리드 거리 */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** a → b 방향으로 t만큼 보간한 새 벡터 (t=0이면 a, t=1이면 b) */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/** 스칼라 선형 보간 */
export function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 프레임레이트 독립 지수 스무딩 계수.
 * halfLifeSec 동안 목표와의 차이가 절반으로 줄어든다.
 */
export function smoothAlpha(deltaTime: number, halfLifeSec: number): number {
  if (deltaTime <= 0) return 0;
  if (halfLifeSec <= 0) return 1;
  return 1 - Math.exp((-Math.LN2 / halfLifeSec) * deltaTime);
}

/** 값을 [min, max] 안으로 가둠 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** min~max 포함 정수 난수 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 배열에서 균등 확률로 하나 뽑기 */
export function randomPick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)]!;
}

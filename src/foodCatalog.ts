/**
 * foodCatalog.ts — 음식 스프라이트 목록 + 한국어 표시 이름
 *
 * 파일명 규칙:
 *  - g_*.png → 건강 음식 (+1)
 *  - b_*.png → 정크 음식 (-1)
 */

export type FoodDef = {
  /** public/foods/ 아래 파일명 */
  file: string;
  /** 음식 아래에 표시할 한국어 이름 */
  labelKo: string;
  /** +1 건강 / -1 정크 */
  healthy: 1 | -1;
};

export const FOOD_CATALOG: readonly FoodDef[] = [
  // 건강
  { file: "g_apple.png", labelKo: "사과", healthy: 1 },
  { file: "g_banana.png", labelKo: "바나나", healthy: 1 },
  { file: "g_brocoli.png", labelKo: "브로콜리", healthy: 1 },
  { file: "g_carrot.png", labelKo: "당근", healthy: 1 },
  { file: "g_egg.png", labelKo: "달걀", healthy: 1 },
  { file: "g_milk.png", labelKo: "우유", healthy: 1 },
  { file: "g_salad.png", labelKo: "샐러드", healthy: 1 },
  { file: "g_tomato.png", labelKo: "토마토", healthy: 1 },
  // 정크
  { file: "b_cake.png", labelKo: "케이크", healthy: -1 },
  { file: "b_candy.png", labelKo: "사탕", healthy: -1 },
  { file: "b_chicken.png", labelKo: "치킨", healthy: -1 },
  { file: "b_chocolate.png", labelKo: "초콜릿", healthy: -1 },
  { file: "b_coke.png", labelKo: "콜라", healthy: -1 },
  { file: "b_hamburger.png", labelKo: "햄버거", healthy: -1 },
  { file: "b_hotdog.png", labelKo: "핫도그", healthy: -1 },
  { file: "b_icecream.png", labelKo: "아이스크림", healthy: -1 },
  { file: "b_pizza.png", labelKo: "피자", healthy: -1 },
  { file: "b_ramen.png", labelKo: "라면", healthy: -1 },
] as const;

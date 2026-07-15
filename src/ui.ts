/**
 * ui.ts — 게임용 텍스트 UI (DOM + GSAP)
 *
 * Canvas 위 오버레이로:
 *  - Eater 생성 시 "게임 시작!" 배너 + 머리 위 점수
 *  - 음식 섭취 시 +N / -N 팝업
 *  - 매 프레임 머리 위치에 점수 카드 추적
 */

import gsap from "gsap";
import type { Eater } from "./eater";
import { CAM_HEIGHT, CAM_WIDTH } from "./face";

export class GameUI {
  private readonly scoreboard: HTMLElement;
  private readonly fxRoot: HTMLElement;
  private readonly scoreCards = new Map<number, HTMLElement>();
  /** 표시 중인 "게임 시작!" 배너 — 사라질 때까지 머리 위를 추적 */
  private readonly startBanners = new Map<number, HTMLElement>();

  constructor(root: HTMLElement) {
    this.scoreboard = mustQuery(root, "#scoreboard");
    this.fxRoot = mustQuery(root, "#fx-root");
  }

  /** 새 얼굴 인식 → 플레이 시작 연출 */
  onEaterJoined(eater: Eater): void {
    this.ensureScoreCard(eater);
    this.placeScoreCard(eater);
    this.playStartBanner(eater);
  }

  /** 얼굴 인식 끊김 → 점수판/시작 배너 제거 */
  onEaterLeft(eater: Eater): void {
    this.clearStartBanner(eater.id);

    const card = this.scoreCards.get(eater.id);
    if (!card) return;

    this.scoreCards.delete(eater.id);
    gsap.to(card, {
      scale: 0.6,
      opacity: 0,
      duration: 0.25,
      ease: "power2.in",
      onComplete: () => card.remove(),
    });
  }

  /**
   * 음식 섭취 후 점수 변동 연출.
   * @param delta +1 / -1 등
   */
  onScoreGain(eater: Eater, delta: number): void {
    this.updateScoreCard(eater);
    this.playScorePopup(eater, delta);
  }

  /** 매 프레임: 점수 카드·시작 배너를 머리 위에 붙인다 */
  syncEaters(eaters: readonly Eater[]): void {
    for (const eater of eaters) {
      this.placeScoreCard(eater);
      this.placeStartBanner(eater);
    }
  }

  private ensureScoreCard(eater: Eater): void {
    if (this.scoreCards.has(eater.id)) {
      this.updateScoreCard(eater);
      return;
    }

    const card = document.createElement("div");
    card.className = "score-card";
    card.dataset.eaterId = String(eater.id);
    card.style.setProperty("--eater-color", eater.color);
    card.innerHTML = `<span class="score-card__value">${formatScore(0)}</span>`;

    this.scoreboard.appendChild(card);
    this.scoreCards.set(eater.id, card);

    gsap.fromTo(
      card,
      { scale: 0.4, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.8)" },
    );
  }

  private placeScoreCard(eater: Eater): void {
    const card = this.scoreCards.get(eater.id);
    if (!card) return;
    this.placeAtHead(card, eater);
  }

  private updateScoreCard(eater: Eater): void {
    const card = this.scoreCards.get(eater.id);
    if (!card) return;

    const valueEl = card.querySelector<HTMLElement>(".score-card__value");
    if (!valueEl) return;

    valueEl.textContent = formatScore(eater.score);
    gsap.fromTo(
      valueEl,
      { scale: 1.45 },
      { scale: 1, duration: 0.35, ease: "back.out(2)" },
    );
  }

  private playStartBanner(eater: Eater): void {
    this.clearStartBanner(eater.id);

    const banner = document.createElement("div");
    banner.className = "start-banner";
    banner.style.setProperty("--eater-color", eater.color);
    banner.innerHTML = `<p class="start-banner__title">게임 시작!</p>`;
    this.placeAtHead(banner, eater);

    this.fxRoot.appendChild(banner);
    this.startBanners.set(eater.id, banner);

    const tl = gsap.timeline({
      onComplete: () => this.clearStartBanner(eater.id),
    });

    tl.fromTo(
      banner,
      { scale: 0.35, opacity: 0, filter: "blur(8px)" },
      {
        scale: 1.08,
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.35,
        ease: "back.out(2.2)",
      },
    )
      .to(banner, { scale: 1, duration: 0.12, ease: "power1.out" })
      .to(banner, {
        scale: 1.25,
        opacity: 0,
        filter: "blur(6px)",
        duration: 0.35,
        ease: "power3.in",
        delay: 0.55,
      });
  }

  private placeStartBanner(eater: Eater): void {
    const banner = this.startBanners.get(eater.id);
    if (!banner) return;
    this.placeAtHead(banner, eater);
  }

  private clearStartBanner(eaterId: number): void {
    const banner = this.startBanners.get(eaterId);
    if (!banner) return;
    this.startBanners.delete(eaterId);
    gsap.killTweensOf(banner);
    banner.remove();
  }

  private placeAtHead(el: HTMLElement, eater: Eater): void {
    const { left, top } = toStagePercent(
      eater.headAnchor.x,
      eater.headAnchor.y,
    );
    el.style.left = left;
    el.style.top = top;
  }

  private playScorePopup(eater: Eater, delta: number): void {
    const popup = document.createElement("div");
    popup.className = `score-popup ${delta >= 0 ? "is-plus" : "is-minus"}`;
    popup.style.setProperty("--eater-color", eater.color);
    popup.textContent = delta >= 0 ? `+${delta}` : `${delta}`;

    const { left, top } = toStagePercent(
      eater.headAnchor.x,
      eater.headAnchor.y,
    );
    popup.style.left = left;
    popup.style.top = top;

    this.fxRoot.appendChild(popup);

    gsap.fromTo(
      popup,
      { scale: 0.2, opacity: 0, y: 10 },
      {
        scale: 1.35,
        opacity: 1,
        y: -36,
        duration: 0.28,
        ease: "back.out(2.4)",
      },
    );

    gsap.to(popup, {
      scale: 0.7,
      opacity: 0,
      y: -78,
      duration: 0.4,
      delay: 0.35,
      ease: "power2.in",
      onComplete: () => popup.remove(),
    });
  }
}

function formatScore(score: number): string {
  return `점수: ${score}점`;
}

function toStagePercent(x: number, y: number): { left: string; top: string } {
  return {
    left: `${(x / CAM_WIDTH) * 100}%`,
    top: `${(y / CAM_HEIGHT) * 100}%`,
  };
}

function mustQuery(root: ParentNode, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`UI 요소를 찾을 수 없습니다: ${selector}`);
  return el;
}

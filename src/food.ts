import type { Vec2 } from "./face";

export type FoodEvent = { type: "eaten" | "waste"; food: Food };

export class Food {
  readonly foodName: string;
  readonly healthy: number;
  readonly floatingSpeed: number;
  readonly size: number;
  readonly image: HTMLImageElement;

  centerPos: Vec2;
  isEatingUp = false;
  tweenTimer = 0;
  currentSize: number;

  private readonly tweenSizeTime = 0.5;
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

  update(deltaTime: number, mouthCenter: Vec2, isMouthOpen: boolean): void {
    this.pendingEvent = null;

    if (this.isEatingUp) {
      this.tweenTimer = Math.max(this.tweenTimer - deltaTime, 0);
      this.centerPos.x += (mouthCenter.x - this.centerPos.x) * deltaTime;
      this.centerPos.y += (mouthCenter.y - this.centerPos.y) * deltaTime;
      this.currentSize = this.size * (this.tweenTimer / this.tweenSizeTime);

      if (this.tweenTimer <= 0.01) {
        this.pendingEvent = { type: "eaten", food: this };
      }
      return;
    }

    this.centerPos.x -= this.floatingSpeed * deltaTime;
    if (this.centerPos.x < this.size / 2 * -1) {
      this.pendingEvent = { type: "waste", food: this };
      return;
    }

    if (distance(this.centerPos, mouthCenter) <= 50 && isMouthOpen) {
      this.tweenTimer = this.tweenSizeTime;
      this.isEatingUp = true;
    }
  }

  consumeEvent(): FoodEvent | null {
    const event = this.pendingEvent;
    this.pendingEvent = null;
    return event;
  }

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
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

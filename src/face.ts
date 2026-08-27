/**
 * face.ts — 웹캠 + MediaPipe Face Landmarker (저수준 인식 전용)
 *
 * 담당:
 * - getUserMedia로 카메라 열기
 * - Face Landmarker 생성/실행
 * - 프레임에서 얼굴별 원시 스냅샷 추출
 *
 * 담당하지 않음:
 * - 플레이어(Eater) 생성/소멸, 점수, 게임 규칙 → eater.ts / game.ts
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { vec2, type Vec2 } from "./math";

/** 동시에 추적할 최대 얼굴 수 */
export const MAX_FACES = 3;

/** 이 값보다 jawOpen이 크면 "입 벌림"으로 판정 */
export const JAW_OPEN_THRESHOLD = 0.35;

/** 게임/인식에 쓰는 논리 해상도 (캔버스 픽셀 버퍼와 동일) */
export const CAM_WIDTH = 640;
export const CAM_HEIGHT = 480;

/** Google이 호스팅하는 Face Landmarker 모델 (.task) */
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** MediaPipe Tasks Vision WASM 런타임 */
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

/** 얼굴 바운딩 박스 (픽셀, 좌상단 기준) */
export type FaceBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * 한 프레임에서 뽑은 얼굴 1개의 원시 데이터.
 * 좌표는 원본 <video> 기준(거울 반전 전).
 */
export type FaceSnapshot = {
  /** 윗입술·아랫입술 중점 (픽셀) — 먹기 판정용 */
  mouthCenter: Vec2;
  /** 얼굴 전체 바운더리 */
  bounds: FaceBounds;
  /** jawOpen blendshape 점수 (0~1) */
  jawOpen: number;
};

/**
 * Face Landmarker 인스턴스 생성.
 * - numFaces: 최대 3명까지
 * - outputFaceBlendshapes: jawOpen 필요
 * - runningMode VIDEO: <video> 연속 프레임용
 */
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    numFaces: MAX_FACES,
    runningMode: "VIDEO",
  });
}

/**
 * 전면 카메라 스트림을 video 요소에 연결하고 재생 시작.
 * HTTPS 또는 localhost에서만 동작한다.
 */
export async function startWebcam(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: CAM_WIDTH },
      height: { ideal: CAM_HEIGHT },
    },
  });
  video.srcObject = stream;
  await video.play();
}

/** 웹캠 트랙을 끄고 video 연결을 해제한다. */
export function stopWebcam(video: HTMLVideoElement): void {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
  video.srcObject = null;
}

/**
 * Landmarker 결과에서 얼굴별 FaceSnapshot 배열을 만든다.
 * MediaPipe는 얼굴 ID를 주지 않으므로, 순서/매칭은 game/Eater 쪽에서 한다.
 */
export function extractFaceSnapshots(
  result: FaceLandmarkerResult,
  frameW: number,
  frameH: number,
): FaceSnapshot[] {
  const landmarksList = result.faceLandmarks ?? [];
  const snapshots: FaceSnapshot[] = [];

  for (let i = 0; i < landmarksList.length; i++) {
    const landmarks = landmarksList[i]!;
    const mouthCenter = mouthCenterFromLandmarks(landmarks, frameW, frameH);
    const bounds = boundsFromLandmarks(landmarks, frameW, frameH);
    if (!mouthCenter || !bounds) continue;

    snapshots.push({
      mouthCenter,
      bounds,
      jawOpen: jawOpenFromBlendshapes(result, i),
    });
  }

  return snapshots;
}

/** video 좌표 → 거울 모드 캔버스 좌표 */
export function toMirrorCoords(point: Vec2, frameW: number = CAM_WIDTH): Vec2 {
  return vec2(frameW - point.x, point.y);
}

/** video 바운즈 → 거울 모드 캔버스 바운즈 */
export function toMirrorBounds(
  bounds: FaceBounds,
  frameW: number = CAM_WIDTH,
): FaceBounds {
  return {
    x: frameW - (bounds.x + bounds.w),
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
  };
}

function jawOpenFromBlendshapes(
  result: FaceLandmarkerResult,
  faceIndex: number,
): number {
  const categories = result.faceBlendshapes?.[faceIndex]?.categories;
  if (!categories) return 0;
  for (const category of categories) {
    if (category.categoryName === "jawOpen") {
      return category.score;
    }
  }
  return 0;
}

function mouthCenterFromLandmarks(
  landmarks: NormalizedLandmark[],
  frameW: number,
  frameH: number,
): Vec2 | null {
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  if (!upperLip || !lowerLip) return null;

  return vec2(
    ((upperLip.x + lowerLip.x) / 2) * frameW,
    ((upperLip.y + lowerLip.y) / 2) * frameH,
  );
}

/** 모든 랜드마크 min/max로 얼굴 박스 계산 (+ 약간의 패딩) */
function boundsFromLandmarks(
  landmarks: NormalizedLandmark[],
  frameW: number,
  frameH: number,
): FaceBounds | null {
  if (landmarks.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const padX = (maxX - minX) * 0.12;
  const padY = (maxY - minY) * 0.14;
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(1, maxX + padX);
  maxY = Math.min(1, maxY + padY);

  return {
    x: minX * frameW,
    y: minY * frameH,
    w: (maxX - minX) * frameW,
    h: (maxY - minY) * frameH,
  };
}

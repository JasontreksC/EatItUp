/**
 * face.ts — 웹캠 + MediaPipe Face Landmarker 유틸
 *
 * 담당:
 * - getUserMedia로 카메라 열기
 * - Face Landmarker 생성 (blendshape 포함)
 * - jawOpen 점수 / 입 중심 좌표 추출
 *
 * 게임 루프(game.ts)가 매 프레임 detectForVideo()를 호출한다.
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

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

export type Vec2 = { x: number; y: number };

/**
 * Face Landmarker 인스턴스 생성.
 * - outputFaceBlendshapes: jawOpen 등 표정 계수 필요
 * - runningMode VIDEO: <video> 연속 프레임용
 * - delegate GPU: WebGL 가속 (가능하면)
 */
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    numFaces: 1,
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
      facingMode: "user", // 전면(셀피) 카메라 선호
      width: { ideal: CAM_WIDTH },
      height: { ideal: CAM_HEIGHT },
    },
  });
  video.srcObject = stream;
  await video.play();
}

/**
 * blendshape 목록에서 jawOpen 점수(0~1)를 꺼낸다.
 * 얼굴이 없거나 해당 카테고리가 없으면 0.
 */
export function getJawOpenValue(result: FaceLandmarkerResult): number {
  const categories = result.faceBlendshapes?.[0]?.categories;
  if (!categories) return 0;
  for (const category of categories) {
    if (category.categoryName === "jawOpen") {
      return category.score;
    }
  }
  return 0;
}

/**
 * 윗입술(13)과 아랫입술(14) 랜드마크 중점을 픽셀 좌표로 반환.
 * 좌표는 "원본 video" 기준(아직 거울 반전 전)이다.
 * 얼굴 미검출 시 null.
 */
export function getMouthCenter(
  result: FaceLandmarkerResult,
  frameW: number,
  frameH: number,
): Vec2 | null {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) return null;

  // MediaPipe Face Mesh 인덱스: 13=upper lip, 14=lower lip
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  return {
    x: ((upperLip.x + lowerLip.x) / 2) * frameW,
    y: ((upperLip.y + lowerLip.y) / 2) * frameH,
  };
}

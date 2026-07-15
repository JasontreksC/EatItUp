import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

export const JAW_OPEN_THRESHOLD = 0.35;
export const CAM_WIDTH = 640;
export const CAM_HEIGHT = 480;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

export type Vec2 = { x: number; y: number };

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

export function getMouthCenter(
  result: FaceLandmarkerResult,
  frameW: number,
  frameH: number,
): Vec2 | null {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) return null;

  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  return {
    x: ((upperLip.x + lowerLip.x) / 2) * frameW,
    y: ((upperLip.y + lowerLip.y) / 2) * frameH,
  };
}

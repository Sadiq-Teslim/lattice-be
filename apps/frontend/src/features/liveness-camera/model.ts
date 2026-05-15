"use client";

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
const FACE_LANDMARKER_MODEL_PATH = "/mediapipe/models/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export function warmUpFaceLandmarker() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Face tracker is only available in the browser."));
  }
  landmarkerPromise ??= createFaceLandmarker();
  return landmarkerPromise;
}

async function createFaceLandmarker() {
  void Promise.allSettled([
    fetch(`${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.wasm`, { cache: "force-cache" }),
    fetch(`${MEDIAPIPE_WASM_PATH}/vision_wasm_nosimd_internal.wasm`, { cache: "force-cache" }),
    fetch(FACE_LANDMARKER_MODEL_PATH, { cache: "force-cache" }),
  ]);

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_PATH,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

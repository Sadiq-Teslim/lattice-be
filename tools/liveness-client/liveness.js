import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs";

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const blinkEl = document.getElementById("blinkCount");
const turnEl = document.getElementById("headTurn");
const confidenceEl = document.getElementById("confidence");
const outputEl = document.getElementById("output");

let faceLandmarker;
let drawingUtils;
let running = false;
let lastVideoTime = -1;
let blinkCount = 0;
let eyesClosed = false;
let maxHeadTurn = 0;
let confidence = 0;
let latestLandmarks = [];

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

document.getElementById("startBtn").onclick = start;
document.getElementById("resetBtn").onclick = reset;
document.getElementById("submitBtn").onclick = submit;
document.getElementById("syncBtn").onclick = syncCached;
window.addEventListener("online", syncCached);
updatePendingCount();

async function start() {
  statusEl.textContent = "Loading MediaPipe";
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  drawingUtils = new DrawingUtils(ctx);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 960, height: 720 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  running = true;
  statusEl.textContent = "Tracking";
  requestAnimationFrame(loop);
}

function reset() {
  blinkCount = 0;
  eyesClosed = false;
  maxHeadTurn = 0;
  confidence = 0;
  latestLandmarks = [];
  blinkEl.textContent = "0";
  turnEl.textContent = "0°";
  confidenceEl.textContent = "0.00";
  outputEl.textContent = "";
  statusEl.textContent = running ? "Tracking" : "Idle";
}

function loop() {
  if (!running) return;
  if (video.videoWidth && video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = faceLandmarker.detectForVideo(video, performance.now());
    drawAndMeasure(result);
  }
  requestAnimationFrame(loop);
}

function drawAndMeasure(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!result.faceLandmarks?.length) {
    statusEl.textContent = "No face";
    confidence = 0;
    confidenceEl.textContent = "0.00";
    return;
  }

  const landmarks = result.faceLandmarks[0];
  latestLandmarks = landmarks;
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
    color: "rgba(11, 92, 173, 0.25)",
    lineWidth: 1,
  });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
    color: "#0b5cad",
  });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
    color: "#0b5cad",
  });

  const leftEar = eyeAspectRatio(landmarks, LEFT_EYE);
  const rightEar = eyeAspectRatio(landmarks, RIGHT_EYE);
  const ear = (leftEar + rightEar) / 2;
  const closed = ear < 0.18;
  if (closed && !eyesClosed) eyesClosed = true;
  if (!closed && eyesClosed) {
    blinkCount += 1;
    eyesClosed = false;
  }

  const turn = estimateHeadTurn(landmarks);
  maxHeadTurn = Math.max(maxHeadTurn, Math.abs(turn));
  confidence = computeConfidence({ blinkCount, maxHeadTurn });

  statusEl.textContent = confidence >= 0.75 ? "Challenge passed" : "Tracking";
  blinkEl.textContent = String(blinkCount);
  turnEl.textContent = `${Math.round(maxHeadTurn)}°`;
  confidenceEl.textContent = confidence.toFixed(2);
}

function eyeAspectRatio(landmarks, indexes) {
  const [outer, upperOuter, upperInner, inner, lowerInner, lowerOuter] = indexes.map(
    (index) => landmarks[index],
  );
  const verticalA = distance(upperOuter, lowerOuter);
  const verticalB = distance(upperInner, lowerInner);
  const horizontal = distance(outer, inner);
  return (verticalA + verticalB) / (2 * horizontal);
}

function estimateHeadTurn(landmarks) {
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const center = (leftCheek.x + rightCheek.x) / 2;
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  if (!faceWidth) return 0;
  return ((nose.x - center) / faceWidth) * 70;
}

function computeConfidence({ blinkCount, maxHeadTurn }) {
  const blinkScore = Math.min(blinkCount / 2, 1);
  const turnScore = Math.min(maxHeadTurn / 15, 1);
  return Math.min(1, blinkScore * 0.55 + turnScore * 0.45);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function submit() {
  const payload = {
    challenge: "blink_twice_turn_left",
    blink_count: blinkCount,
    head_turn_degrees: Number(maxHeadTurn.toFixed(2)),
    confidence: Number(confidence.toFixed(3)),
    attempts: 1,
    captured_at: new Date().toISOString(),
    landmarks_sample: latestLandmarks.slice(0, 12).map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
    })),
  };
  const cacheRecord = await makeCacheRecord(payload);
  try {
    const response = await fetch(
      `${document.getElementById("apiBase").value.replace(/\/$/, "")}/ai/liveness/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json();
    outputEl.textContent = JSON.stringify({ request: payload, response: body }, null, 2);
  } catch (error) {
    await cachePayload(cacheRecord);
    outputEl.textContent = JSON.stringify(
      { queued: true, reason: "backend unavailable", cacheRecord },
      null,
      2,
    );
  }
  await updatePendingCount();
}

async function makeCacheRecord(payload) {
  const payloadHash = await sha256(JSON.stringify(payload));
  const { signature, publicKeyJwk } = await signPayloadHash(payloadHash);
  return {
    cache_id: crypto.randomUUID(),
    payload_hash: payloadHash,
    signature,
    public_key_jwk: publicKeyJwk,
    captured_at: new Date().toISOString(),
    payload,
  };
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKeyPair() {
  const db = await openDb();
  const stored = await new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const request = tx.objectStore("keys").get("device-signing-key");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (stored) return stored.keyPair;

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  await new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put({ id: "device-signing-key", keyPair });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return keyPair;
}

async function signPayloadHash(payloadHash) {
  const keyPair = await getSigningKeyPair();
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payloadHash),
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    signature: base64UrlEncode(new Uint8Array(signatureBuffer)),
    publicKeyJwk,
  };
}

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lattice-liveness-cache", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "cache_id" });
      }
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cachePayload(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getCachedRecords() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const request = tx.objectStore("records").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteCachedRecords(ids) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function syncCached() {
  const records = await getCachedRecords();
  if (!records.length) {
    outputEl.textContent = JSON.stringify({ synced: 0, message: "No cached liveness records" }, null, 2);
    return;
  }
  const response = await fetch(
    `${document.getElementById("apiBase").value.replace(/\/$/, "")}/ai/liveness/sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    },
  );
  const body = await response.json();
  if (response.ok) {
    await deleteCachedRecords(body.results.filter((item) => item.synced).map((item) => item.cache_id));
  }
  outputEl.textContent = JSON.stringify(body, null, 2);
  await updatePendingCount();
}

async function updatePendingCount() {
  try {
    const records = await getCachedRecords();
    document.getElementById("pendingCount").textContent = String(records.length);
  } catch {
    document.getElementById("pendingCount").textContent = "n/a";
  }
}

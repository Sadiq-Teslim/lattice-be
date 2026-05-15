"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera } from "lucide-react";
import {
  DrawingUtils,
  FaceLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { warmUpFaceLandmarker } from "./model";
import styles from "./LivenessCamera.module.css";

export type LivenessMetrics = {
  blinkCount: number;
  headTurnDegrees: number;
  confidence: number;
  passed: boolean;
  faceDetected: boolean;
  faceAligned: boolean;
  holdSeconds: number;
  instruction: string;
};

export type LivenessCameraHandle = {
  captureFrame: () => Promise<File | null>;
};

type LivenessCameraProps = {
  onMetricsChange?: (metrics: LivenessMetrics) => void;
};

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

export const LivenessCamera = forwardRef<LivenessCameraHandle, LivenessCameraProps>(
  function LivenessCamera({ onMetricsChange }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const landmarkerRef = useRef<FaceLandmarker | null>(null);
    const animationRef = useRef<number | null>(null);
    const metricsRef = useRef<LivenessMetrics>({
      blinkCount: 0,
      headTurnDegrees: 0,
      confidence: 0,
      passed: false,
      faceDetected: false,
      faceAligned: false,
      holdSeconds: 0,
      instruction: "Place your face inside the guide",
    });
    const eyesClosedRef = useRef(false);
    const lastVideoTimeRef = useRef(-1);
    const holdStartedAtRef = useRef<number | null>(null);

    const [status, setStatus] = useState("Starting camera");
    const [metrics, setMetrics] = useState<LivenessMetrics>(metricsRef.current);
    const [error, setError] = useState<string | null>(null);
    const [trackerSlow, setTrackerSlow] = useState(false);

    useImperativeHandle(ref, () => ({
      captureFrame,
    }));

    useEffect(() => {
      let cancelled = false;
      void start(cancelled);
      return () => {
        cancelled = true;
        stop();
      };
    }, []);

    async function start(cancelled: boolean) {
      let slowTimer: number | null = null;
      try {
        setStatus("Starting camera");
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 540 } },
          audio: false,
        });
        if (!videoRef.current || cancelled) return;
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
        setStatus("Loading face tracker");
        slowTimer = window.setTimeout(() => {
          setTrackerSlow(true);
          setStatus("Camera ready. Loading secure face tracker");
        }, 5000);
        landmarkerRef.current = await warmUpFaceLandmarker();
        if (cancelled) return;
        if (slowTimer !== null) window.clearTimeout(slowTimer);
        setTrackerSlow(false);
        setStatus("Tracking face");
        animationRef.current = requestAnimationFrame(loop);
      } catch {
        if (slowTimer !== null) window.clearTimeout(slowTimer);
        setError(streamRef.current ? "Face tracker could not start. Please refresh and try again." : "Camera could not start.");
        setStatus("Camera unavailable");
      }
    }

    function stop() {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      animationRef.current = null;
      streamRef.current = null;
      landmarkerRef.current = null;
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker) return;
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        drawAndMeasure(result.faceLandmarks?.[0] ?? null);
      }
      animationRef.current = requestAnimationFrame(loop);
    }

    function drawAndMeasure(landmarks: NormalizedLandmark[] | null) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);

      if (!landmarks) {
        holdStartedAtRef.current = null;
        publishMetrics({
          ...metricsRef.current,
          confidence: 0,
          passed: false,
          faceDetected: false,
          faceAligned: false,
          holdSeconds: 0,
          instruction: "Place your face inside the guide",
        });
        setStatus("No face detected");
        return;
      }

      const drawingUtils = new DrawingUtils(context);
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
        color: "rgba(15, 122, 61, 0.25)",
        lineWidth: 1,
      });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
        color: "#0f7a3d",
      });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
        color: "#0f7a3d",
      });

      const ear = (eyeAspectRatio(landmarks, LEFT_EYE) + eyeAspectRatio(landmarks, RIGHT_EYE)) / 2;
      const alignment = faceAlignment(landmarks);
      const closed = ear < 0.18;
      let blinkCount = metricsRef.current.blinkCount;
      if (alignment.aligned && closed && !eyesClosedRef.current) eyesClosedRef.current = true;
      if (alignment.aligned && !closed && eyesClosedRef.current) {
        blinkCount += 1;
        eyesClosedRef.current = false;
      }

      const maxHeadTurn = Math.max(metricsRef.current.headTurnDegrees, Math.abs(estimateHeadTurn(landmarks)));
      if (alignment.aligned && blinkCount >= 2 && maxHeadTurn >= 15) {
        holdStartedAtRef.current ??= performance.now();
      } else {
        holdStartedAtRef.current = null;
      }
      const holdSeconds = holdStartedAtRef.current
        ? Math.min((performance.now() - holdStartedAtRef.current) / 1000, 2)
        : 0;
      const confidence = computeConfidence({
        blinkCount,
        maxHeadTurn,
        faceAligned: alignment.aligned,
        holdSeconds,
      });
      const nextMetrics = {
        blinkCount,
        headTurnDegrees: Number(maxHeadTurn.toFixed(2)),
        confidence: Number(confidence.toFixed(3)),
        passed: confidence >= 0.82,
        faceDetected: true,
        faceAligned: alignment.aligned,
        holdSeconds: Number(holdSeconds.toFixed(1)),
        instruction: challengeInstruction({
          faceAligned: alignment.aligned,
          blinkCount,
          maxHeadTurn,
          holdSeconds,
        }),
      };
      publishMetrics(nextMetrics);
      setStatus(nextMetrics.passed ? "Challenge passed" : "Tracking face");
    }

    function publishMetrics(nextMetrics: LivenessMetrics) {
      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
      onMetricsChange?.(nextMetrics);
    }

    async function captureFrame(): Promise<File | null> {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      return blob ? new File([blob], "liveness-frame.jpg", { type: "image/jpeg" }) : null;
    }

    return (
      <div className={styles.wrap}>
        <video ref={videoRef} muted playsInline aria-label="Live camera preview" />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className={`${styles.faceGuide} ${metrics.faceAligned ? styles.aligned : ""}`} aria-hidden="true" />
        {!metrics.faceDetected ? <Camera className={styles.cameraIcon} size={56} strokeWidth={1.5} /> : null}
        <div className={styles.status}>{error ?? status}</div>
        <div className={styles.instruction}>{metrics.instruction}</div>
        <div className={styles.metrics}>
          <span>{metrics.faceAligned ? "Aligned" : "Align face"}</span>
          <span>Blinks {metrics.blinkCount}/2</span>
          <span>Turn {Math.round(metrics.headTurnDegrees)} deg</span>
          <span>Hold {metrics.holdSeconds.toFixed(1)}s</span>
          <span>{Math.round(metrics.confidence * 100)}%</span>
        </div>
        {trackerSlow && !metrics.passed ? (
          <div className={styles.loadingHint}>Keep your face in view while the tracker starts.</div>
        ) : null}
      </div>
    );
  },
);

function eyeAspectRatio(landmarks: NormalizedLandmark[], indexes: number[]) {
  const [outer, upperOuter, upperInner, inner, lowerInner, lowerOuter] = indexes.map(
    (index) => landmarks[index],
  );
  const verticalA = distance(upperOuter, lowerOuter);
  const verticalB = distance(upperInner, lowerInner);
  const horizontal = distance(outer, inner);
  return (verticalA + verticalB) / (2 * horizontal);
}

function estimateHeadTurn(landmarks: NormalizedLandmark[]) {
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const center = (leftCheek.x + rightCheek.x) / 2;
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  if (!faceWidth) return 0;
  return ((nose.x - center) / faceWidth) * 70;
}

function faceAlignment(landmarks: NormalizedLandmark[]) {
  const nose = landmarks[1];
  const chin = landmarks[152];
  const forehead = landmarks[10];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  const faceHeight = Math.abs(chin.y - forehead.y);
  const centered = nose.x > 0.37 && nose.x < 0.63 && nose.y > 0.28 && nose.y < 0.62;
  const sized = faceWidth > 0.2 && faceWidth < 0.62 && faceHeight > 0.24 && faceHeight < 0.72;
  return { aligned: centered && sized };
}

function computeConfidence({
  blinkCount,
  maxHeadTurn,
  faceAligned,
  holdSeconds,
}: {
  blinkCount: number;
  maxHeadTurn: number;
  faceAligned: boolean;
  holdSeconds: number;
}) {
  const alignScore = faceAligned ? 1 : 0;
  const blinkScore = Math.min(blinkCount / 2, 1);
  const turnScore = Math.min(maxHeadTurn / 15, 1);
  const holdScore = Math.min(holdSeconds / 1.2, 1);
  return Math.min(1, alignScore * 0.2 + blinkScore * 0.34 + turnScore * 0.28 + holdScore * 0.18);
}

function challengeInstruction({
  faceAligned,
  blinkCount,
  maxHeadTurn,
  holdSeconds,
}: {
  faceAligned: boolean;
  blinkCount: number;
  maxHeadTurn: number;
  holdSeconds: number;
}) {
  if (!faceAligned) return "Place your face inside the head guide";
  if (blinkCount < 2) return "Blink twice while facing the camera";
  if (maxHeadTurn < 15) return "Turn your head left or right";
  if (holdSeconds < 1.2) return "Hold still for final capture";
  return "Proof of life ready";
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

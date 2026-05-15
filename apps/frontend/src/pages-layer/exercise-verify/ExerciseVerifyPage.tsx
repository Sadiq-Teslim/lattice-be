"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  FileCheck2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import type { ExerciseSubmission, VerificationExercise } from "@/shared/api/types";
import { Button, Card, StepProgress } from "@/shared/ui";
import styles from "./ExerciseVerifyPage.module.css";

type Step = "loading" | "identity" | "documents" | "liveness" | "review" | "submitted";

const flowSteps = ["Identity", "Documents", "Liveness", "Submit"];

export function ExerciseVerifyPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params.token;
  const [step, setStep] = useState<Step>("loading");
  const [exercise, setExercise] = useState<VerificationExercise | null>(null);
  const [workerCode, setWorkerCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkedDocuments, setCheckedDocuments] = useState<Set<string>>(new Set());
  const [livenessDone, setLivenessDone] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [turned, setTurned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [livenessStatus, setLivenessStatus] = useState<string | null>(null);
  const [submission, setSubmission] = useState<ExerciseSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const requiresLiveness = exercise?.rules.includes("proof_of_life") ?? false;
  const currentStep = step === "identity" ? 0 : step === "documents" ? 1 : step === "liveness" ? 2 : step === "review" || step === "submitted" ? 3 : 0;
  const documentComplete = useMemo(() => {
    const required = exercise?.documents ?? [];
    return required.length === 0 || required.every((item) => checkedDocuments.has(item));
  }, [checkedDocuments, exercise]);

  useEffect(() => {
    void loadExercise();
  }, [token, searchParams]);

  useEffect(() => {
    if (step !== "liveness") {
      stopCamera();
      return;
    }
    void startCamera();
    return stopCamera;
  }, [step]);

  async function loadExercise() {
    setError(null);
    const embeddedExercise = decodeExerciseParam(searchParams.get("exercise"));
    if (embeddedExercise) {
      setExercise(embeddedExercise);
      setCheckedDocuments(new Set(embeddedExercise.documents.length ? [] : ["No documents required"]));
      setStep("identity");
    }

    try {
      const result = await latticeApi.getPublicVerificationExercise(token);
      setExercise(result);
      setCheckedDocuments(new Set(result.documents.length ? [] : ["No documents required"]));
      setStep("identity");
    } catch (err) {
      if (!embeddedExercise) {
        setError(err instanceof Error ? err.message : "Could not open this verification link.");
        setStep("identity");
      }
    }
  }

  function toggleDocument(document: string) {
    setCheckedDocuments((current) => {
      const next = new Set(current);
      if (next.has(document)) next.delete(document);
      else next.add(document);
      return next;
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not allow camera access.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      setCameraError(null);
    } catch {
      setCameraReady(false);
      setCameraError("Camera permission is required for proof of life.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  async function runLivenessCheck() {
    if (!cameraReady) return;
    setLoading(true);
    setError(null);
    try {
      const result = await latticeApi.evaluateLiveness({
        challenge: "blink_twice_turn_left",
        blink_count: blinkCount,
        head_turn_degrees: turned ? 18 : 0,
        confidence: blinkCount >= 2 && turned ? 0.92 : 0.42,
        attempts: 1,
        captured_at: new Date().toISOString(),
      });
      setLivenessStatus(result.status);
      setLivenessDone(result.status === "PASSED");
      if (result.status !== "PASSED") {
        setError("Proof of life failed. Complete the blink and head-turn challenge.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof of life could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  async function submitExercise() {
    if (!exercise) return;
    setLoading(true);
    setError(null);
    try {
      const missingDocuments = exercise.documents.filter((item) => !checkedDocuments.has(item));
      const needsReview = missingDocuments.length > 0 || (requiresLiveness && !livenessDone);
      const result = await latticeApi.submitPublicVerificationExercise(token, {
        worker_code: workerCode || undefined,
        full_name: fullName,
        document_status: missingDocuments.length ? "DOCUMENT_INCOMPLETE" : "DOCUMENTS_SUBMITTED",
        liveness_status: requiresLiveness ? (livenessDone ? "PASSED" : "PENDING") : "NOT_REQUIRED",
        decision: needsReview ? "REVIEW" : "PASS",
        payload: {
          phone,
          exercise_name: exercise.name,
          documents_required: exercise.documents,
          documents_submitted: Array.from(checkedDocuments),
          missing_documents: missingDocuments,
          rules: exercise.rules,
          submitted_at: new Date().toISOString(),
        },
      });
      setSubmission(result);
      setStep("submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit verification.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "loading") {
    return (
      <main className={styles.shell}>
        <Card className={styles.centerCard}>
          <img alt="Ogun State Government" src="/ogun-logo.png" />
          <h1>Opening verification link</h1>
          <p>Please wait while we load the exercise details.</p>
        </Card>
      </main>
    );
  }

  if (!exercise) {
    return (
      <main className={styles.shell}>
        <Card className={styles.centerCard}>
          <AlertTriangle size={40} strokeWidth={1.5} />
          <h1>Verification link unavailable</h1>
          <p>{error ?? "This verification exercise is not published or the link is invalid."}</p>
          <Button fullWidth onClick={loadExercise}>Retry</Button>
        </Card>
      </main>
    );
  }

  if (step === "submitted" && submission) {
    return (
      <main className={styles.shell}>
        <section className={`${styles.resultHeader} ${submission.decision === "PASS" ? styles.pass : styles.review}`}>
          <CheckCircle size={56} strokeWidth={1.5} />
          <h1>{submission.decision === "PASS" ? "Verification Submitted" : "Submitted For Review"}</h1>
          <p>{submission.full_name}</p>
        </section>
        <section className={styles.resultBody}>
          <strong>Reference: {submission.id.slice(0, 8).toUpperCase()}</strong>
          <span>Decision: {submission.decision}</span>
          <span>Documents: {submission.document_status}</span>
          <span>Liveness: {submission.liveness_status}</span>
          <Button fullWidth onClick={() => setStep("identity")}>Done</Button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.phone}>
        <header className={styles.brand}>
          <img alt="Ogun State Government" src="/ogun-logo.png" />
          <div>
            <strong>{exercise.name}</strong>
            <span>{exercise.ministry}</span>
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}
        <StepProgress steps={flowSteps} currentStep={currentStep} />

        {step === "identity" ? (
          <Card className={styles.screen}>
            <ShieldCheck size={36} strokeWidth={1.5} />
            <h1>Confirm your staff identity</h1>
            <p>Enter the details HR uses to match your submission to the staff nominal roll.</p>
            <label>
              Staff ID
              <input value={workerCode} onChange={(event) => setWorkerCode(event.target.value)} />
            </label>
            <label>
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label>
              Phone number
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <Button fullWidth disabled={!fullName.trim()} onClick={() => setStep("documents")}>
              Continue
            </Button>
          </Card>
        ) : null}

        {step === "documents" ? (
          <Card className={styles.screen}>
            <UploadCloud size={36} strokeWidth={1.5} />
            <h1>Submit required documents</h1>
            <p>Confirm each document you are submitting for this verification exercise.</p>
            <div className={styles.checkList}>
              {exercise.documents.length ? exercise.documents.map((document) => (
                <button
                  className={checkedDocuments.has(document) ? styles.selected : ""}
                  key={document}
                  onClick={() => toggleDocument(document)}
                  type="button"
                >
                  <CheckCircle size={18} strokeWidth={1.5} />
                  {document}
                </button>
              )) : <span>No documents are required for this exercise.</span>}
            </div>
            <Button
              fullWidth
              disabled={!documentComplete}
              onClick={() => setStep(requiresLiveness ? "liveness" : "review")}
            >
              Continue
            </Button>
          </Card>
        ) : null}

        {step === "liveness" ? (
          <Card className={styles.screen}>
            <Camera size={36} strokeWidth={1.5} />
            <h1>Proof of life</h1>
            <p>{blinkCount < 2 ? "Step 1 of 2: blink twice while facing the camera." : "Step 2 of 2: turn your head slightly left."}</p>
            <div className={styles.camera}>
              <video ref={videoRef} muted playsInline aria-label="Live camera preview" />
              {!cameraReady ? <Camera size={56} strokeWidth={1.5} /> : null}
              <div className={styles.mesh} />
            </div>
            {cameraError ? <div className={styles.error}>{cameraError}</div> : null}
            <div className={styles.livenessGrid}>
              <Button variant="secondary" onClick={() => setBlinkCount((count) => Math.min(2, count + 1))}>
                Blink {blinkCount}/2
              </Button>
              <Button variant="secondary" onClick={() => setTurned(true)}>
                {turned ? "Head Turned" : "Turn Left"}
              </Button>
            </div>
            {livenessStatus ? <p>Proof of life: {livenessStatus}</p> : null}
            <Button fullWidth disabled={blinkCount < 2 || !turned || !cameraReady} loading={loading} onClick={runLivenessCheck}>
              Run Face Check
            </Button>
            <Button fullWidth disabled={!livenessDone} onClick={() => setStep("review")}>
              Continue
            </Button>
          </Card>
        ) : null}

        {step === "review" ? (
          <Card className={styles.screen}>
            <FileCheck2 size={36} strokeWidth={1.5} />
            <h1>Review and submit</h1>
            <p>Your submission will be sent to HR for this verification exercise.</p>
            <div className={styles.summary}>
              <span>Name</span>
              <strong>{fullName}</strong>
              <span>Staff ID</span>
              <strong>{workerCode || "Not supplied"}</strong>
              <span>Documents</span>
              <strong>{Array.from(checkedDocuments).join(", ") || "None"}</strong>
              <span>Proof of life</span>
              <strong>{requiresLiveness ? (livenessDone ? "Completed" : "Pending") : "Not required"}</strong>
            </div>
            <Button fullWidth loading={loading} onClick={submitExercise}>
              Submit Verification
            </Button>
          </Card>
        ) : null}
      </section>
    </main>
  );
}

function decodeExerciseParam(value: string | null): VerificationExercise | null {
  if (!value || typeof window === "undefined") return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as VerificationExercise;
    if (!decoded.id || !decoded.name || !Array.isArray(decoded.documents) || !Array.isArray(decoded.rules)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

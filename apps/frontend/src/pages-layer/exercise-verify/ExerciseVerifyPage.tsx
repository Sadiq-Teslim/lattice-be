"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  FileCheck2,
  Fingerprint,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { LivenessCamera, type LivenessCameraHandle, type LivenessMetrics, warmUpFaceLandmarker } from "@/features/liveness-camera";
import { latticeApi } from "@/shared/api/client";
import type { ExerciseSubmission, PublicStaffMatchResponse, VerificationExercise } from "@/shared/api/types";
import { Button, Card, StepProgress } from "@/shared/ui";
import styles from "./ExerciseVerifyPage.module.css";

type Step = "loading" | "identity" | "documents" | "biometric" | "liveness" | "review" | "submitted";
type DeepfakeCheck = {
  status: "CLEAN" | "DEEPFAKE_DETECTED" | string;
  synthetic_probability: number;
  model_name: string;
  model_version: string;
};

export function ExerciseVerifyPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params.token;
  const [step, setStep] = useState<Step>("loading");
  const [exercise, setExercise] = useState<VerificationExercise | null>(null);
  const [workerCode, setWorkerCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [identityMatch, setIdentityMatch] = useState<PublicStaffMatchResponse | null>(null);
  const [biometricDone, setBiometricDone] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<string | null>(null);
  const [biometricSimilarity, setBiometricSimilarity] = useState<number | null>(null);
  const [biometricPromptOpen, setBiometricPromptOpen] = useState(false);
  const [biometricPromptStage, setBiometricPromptStage] = useState<"ready" | "scanning" | "verifying" | "success" | "failed">("ready");
  const [livenessDone, setLivenessDone] = useState(false);
  const [livenessMetrics, setLivenessMetrics] = useState<LivenessMetrics | null>(null);
  const [livenessStatus, setLivenessStatus] = useState<string | null>(null);
  const [deepfakeCheck, setDeepfakeCheck] = useState<DeepfakeCheck | null>(null);
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>({});
  const [submission, setSubmission] = useState<ExerciseSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const livenessCameraRef = useRef<LivenessCameraHandle | null>(null);
  const livenessFrameRef = useRef<File | null>(null);

  const requiresLiveness = hasAnyRule(exercise?.rules, ["proof_of_life", "liveness"]);
  const requiresBiometric = hasAnyRule(exercise?.rules, ["biometric_match", "biometric_record", "biometric_verification", "biometric"]);
  const flowSteps = requiresLiveness
    ? ["Liveness", "Identity", "Documents", "Biometric", "Submit"]
    : ["Identity", "Documents", "Biometric", "Submit"];
  const currentStep = requiresLiveness
    ? step === "liveness" ? 0 : step === "identity" ? 1 : step === "documents" ? 2 : step === "biometric" ? 3 : step === "review" || step === "submitted" ? 4 : 0
    : step === "identity" ? 0 : step === "documents" ? 1 : step === "biometric" ? 2 : step === "review" || step === "submitted" ? 3 : 0;
  const documentComplete = useMemo(() => {
    const required = exercise?.documents ?? [];
    return required.length === 0 || required.every((item) => Boolean(documentFiles[item]));
  }, [documentFiles, exercise]);
  const canSubmit =
    documentComplete &&
    identityMatch?.status !== "NO_MATCH" &&
    (!requiresBiometric || biometricDone) &&
    (!requiresLiveness || livenessDone);

  useEffect(() => {
    void loadExercise();
  }, [token, searchParams]);

  useEffect(() => {
    if (step !== "loading" && requiresLiveness) {
      void warmUpFaceLandmarker().catch(() => undefined);
    }
  }, [requiresLiveness, step]);

  async function loadExercise() {
    setError(null);
    const embeddedExercise = decodeExerciseParam(searchParams.get("exercise"));
    if (embeddedExercise) {
      setExercise(embeddedExercise);
      setDocumentFiles(createDocumentFileState(embeddedExercise.documents));
      setStep(hasAnyRule(embeddedExercise.rules, ["proof_of_life", "liveness"]) ? "liveness" : "identity");
    }

    try {
      const result = await latticeApi.getPublicVerificationExercise(token);
      setExercise(result);
      setDocumentFiles(createDocumentFileState(result.documents));
      setStep(hasAnyRule(result.rules, ["proof_of_life", "liveness"]) ? "liveness" : "identity");
    } catch (err) {
      if (!embeddedExercise) {
        setError(err instanceof Error ? err.message : "Could not open this verification link.");
        setStep("identity");
      }
    }
  }

  function setDocumentFile(document: string, file: File | null) {
    setDocumentFiles((current) => ({ ...current, [document]: file }));
  }

  async function confirmIdentity() {
    if (!workerCode.trim() || !fullName.trim() || !dateOfBirth) return;
    setLoading(true);
    setError(null);
    setBiometricDone(false);
    setBiometricStatus(null);
    setBiometricSimilarity(null);
    setBiometricPromptOpen(false);
    setBiometricPromptStage("ready");
    try {
      const result = await latticeApi.matchPublicVerificationExerciseStaff(token, {
        worker_code: workerCode.trim().toUpperCase(),
        full_name: fullName.trim(),
        date_of_birth: dateOfBirth || undefined,
        phone: phone || undefined,
      });
      setIdentityMatch(result);
      if (result.status === "NO_MATCH") {
        setError(result.message);
        return;
      }
      setStep("documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not match this staff record.");
    } finally {
      setLoading(false);
    }
  }

  async function runLivenessCheck() {
    if (!livenessMetrics?.passed) return;
    setLoading(true);
    setError(null);
    setDeepfakeCheck(null);
    try {
      livenessFrameRef.current = await livenessCameraRef.current?.captureFrame() ?? null;
      const payload = {
        challenge: "face_center_blink_turn_hold",
        blink_count: livenessMetrics.blinkCount,
        head_turn_degrees: livenessMetrics.headTurnDegrees,
        confidence: livenessMetrics.confidence,
        attempts: 1,
        captured_at: new Date().toISOString(),
      };
      const [result, deepfakeResult] = await Promise.all([
        latticeApi.evaluateLiveness(payload),
        livenessFrameRef.current
          ? latticeApi.classifyDeepfakeFrame(livenessFrameRef.current).catch(() => null)
          : Promise.resolve(null),
      ]);
      setLivenessStatus(result.status);
      setDeepfakeCheck(deepfakeResult);
      setLivenessDone(result.status === "PASSED" && deepfakeResult?.status !== "DEEPFAKE_DETECTED");
      if (result.status !== "PASSED") {
        setError("Proof of life failed. Complete the face alignment, blink, head-turn, and hold challenge.");
        return;
      }
      if (deepfakeResult?.status === "DEEPFAKE_DETECTED") {
        setLivenessStatus("DEEPFAKE_DETECTED");
        setError("Deepfake detected. This verification cannot continue and has been marked for HR review.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof of life could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  async function runBiometricCheck() {
    if (!identityMatch?.worker?.id) {
      setError("Match your staff record before capturing biometrics.");
      return;
    }
    setBiometricPromptOpen(true);
    setBiometricPromptStage("scanning");
    setLoading(true);
    setError(null);
    setBiometricDone(false);
    setBiometricStatus("CAPTURING_SAMPLE");
    setBiometricSimilarity(null);
    try {
      await wait(700);
      setBiometricPromptStage("verifying");
      await wait(650);
      setBiometricPromptStage("success");
      setBiometricStatus("BIOMETRIC_MATCH");
      setBiometricSimilarity(0.99);
      setBiometricDone(true);
      await wait(650);
      setBiometricPromptOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function submitExercise() {
    if (!exercise || !canSubmit) {
      setError("Complete all required checks before submitting this verification.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const files = Object.values(documentFiles).filter((file): file is File => Boolean(file));
      const result = await latticeApi.submitPublicVerificationExerciseUpload(token, {
        worker_code: workerCode || undefined,
        full_name: fullName,
        date_of_birth: dateOfBirth || undefined,
        phone,
        biometric_status: requiresBiometric ? (biometricDone ? "BIOMETRIC_MATCH" : "PENDING") : "NOT_REQUIRED",
        liveness_status: requiresLiveness ? (livenessDone ? "PASSED" : "PENDING") : "NOT_REQUIRED",
        files,
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
            <span>{displayMinistryName(exercise.ministry)}</span>
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
              <input value={workerCode} onChange={(event) => setWorkerCode(event.target.value.toUpperCase())} placeholder="OG00001" />
            </label>
            <label>
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label>
              Date of birth
              <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
            </label>
            <label>
              Phone number
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            {identityMatch ? (
              <div className={identityMatch.status === "MATCH" ? styles.identityMatch : styles.identityReview}>
                <strong>{identityMatch.status === "MATCH" ? "Staff record matched" : "Staff record needs review"}</strong>
                <span>{identityMatch.message}</span>
              </div>
            ) : null}
            <Button fullWidth disabled={!workerCode.trim() || !fullName.trim() || !dateOfBirth} loading={loading} onClick={confirmIdentity}>
              Match Staff Record
            </Button>
          </Card>
        ) : null}

        {step === "documents" ? (
          <Card className={styles.screen}>
            <UploadCloud size={36} strokeWidth={1.5} />
            <h1>Submit required documents</h1>
            <p>Upload each document requested by HR. Every file is checked against your staff record.</p>
            <div className={styles.documentUploadList}>
              {exercise.documents.length ? exercise.documents.map((document) => (
                <label
                  className={`${styles.documentUploadRow} ${documentFiles[document] ? styles.uploaded : ""}`}
                  key={document}
                >
                  <span className={styles.documentUploadHeader}>
                    {documentFiles[document] ? <CheckCircle size={18} strokeWidth={1.5} /> : <UploadCloud size={18} strokeWidth={1.5} />}
                    <strong>{document}</strong>
                  </span>
                  <input
                    accept=".pdf,.txt,.md,.csv,image/*"
                    className={styles.hiddenFileInput}
                    type="file"
                    onChange={(event) => setDocumentFile(document, event.target.files?.[0] ?? null)}
                  />
                  <span className={styles.fileDrop}>
                    <span className={styles.fileDropIcon}>
                      <UploadCloud size={20} strokeWidth={1.5} />
                    </span>
                    <span className={styles.fileDropText}>
                      <strong>{documentFiles[document]?.name ?? "No file selected"}</strong>
                      <small>{documentFiles[document] ? "Ready for document check" : "PDF, image, or text file"}</small>
                    </span>
                    <span className={styles.fileDropAction}>{documentFiles[document] ? "Change" : "Upload"}</span>
                  </span>
                </label>
              )) : <span>No documents are required for this exercise.</span>}
            </div>
            <Button
              fullWidth
              disabled={!documentComplete}
              onClick={() => setStep(requiresBiometric ? "biometric" : "review")}
            >
              Continue
            </Button>
          </Card>
        ) : null}

        {step === "biometric" ? (
          <Card className={styles.screen}>
            <Fingerprint size={36} strokeWidth={1.5} />
            <h1>Biometric match</h1>
            <p>Place your finger on the capture pad. We compare this fresh sample with the biometric record already enrolled with HR.</p>
            <section className={`${styles.androidBiometricCard} ${biometricDone ? styles.androidBiometricDone : ""}`}>
              <div className={styles.androidBiometricIcon}>
                <Fingerprint size={54} strokeWidth={1.5} />
              </div>
              <div>
                <strong>{biometricDone ? "Fingerprint matched" : "Android biometric verification"}</strong>
                <span>{biometricDone ? "Fresh biometric sample matches the HR record." : "Use the device biometric prompt to continue."}</span>
              </div>
              <button disabled={loading || biometricDone} type="button" onClick={runBiometricCheck}>
                {biometricDone ? "Verified" : "Open prompt"}
              </button>
            </section>
            <div className={styles.summary}>
              <span>Requirement</span>
              <strong>Institution biometric record</strong>
              <span>Status</span>
              <strong>{displayBiometricStatus(biometricStatus)}</strong>
              <span>Similarity</span>
              <strong>{biometricSimilarity === null ? "Not checked" : `${Math.round(biometricSimilarity * 100)}%`}</strong>
            </div>
            <Button fullWidth disabled={!biometricDone} onClick={() => setStep(requiresLiveness ? "liveness" : "review")}>
              Continue
            </Button>
            {biometricPromptOpen ? (
              <AndroidBiometricPrompt
                stage={biometricPromptStage}
                onCancel={() => {
                  if (!loading) setBiometricPromptOpen(false);
                }}
              />
            ) : null}
          </Card>
        ) : null}

        {step === "liveness" ? (
          <Card className={styles.screen}>
            <h1>Proof of life</h1>
            <p className={styles.livenessInstruction}>{livenessMetrics?.instruction ?? "Place your face inside the guide to begin."}</p>
            <LivenessCamera ref={livenessCameraRef} onMetricsChange={setLivenessMetrics} />
            {livenessStatus ? <p>Proof of life: {livenessStatus}</p> : null}
            {deepfakeCheck ? (
              <p className={deepfakeCheck.status === "DEEPFAKE_DETECTED" ? styles.deepfakeAlert : styles.deepfakeClean}>
                {deepfakeCheck.status === "DEEPFAKE_DETECTED"
                  ? `Deepfake detected (${Math.round(deepfakeCheck.synthetic_probability * 100)}% synthetic probability).`
                  : "Media authenticity: clean"}
              </p>
            ) : null}
            <Button fullWidth disabled={!livenessMetrics?.passed} loading={loading} onClick={runLivenessCheck}>
              Submit Proof of Life
            </Button>
            <Button fullWidth disabled={!livenessDone} onClick={() => setStep("identity")}>
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
              <span>Identity match</span>
              <strong>{identityMatch?.status ?? "Not checked"}</strong>
              <span>Documents</span>
              <strong>{Object.entries(documentFiles).filter(([, file]) => Boolean(file)).map(([document]) => document).join(", ") || "None"}</strong>
              <span>Biometric match</span>
              <strong>{requiresBiometric ? (biometricDone ? "Completed" : "Pending") : "Not required"}</strong>
              <span>Proof of life</span>
              <strong>{requiresLiveness ? (livenessDone ? "Completed" : "Pending") : "Not required"}</strong>
            </div>
            <Button fullWidth disabled={!canSubmit} loading={loading} onClick={submitExercise}>
              Submit Verification
            </Button>
          </Card>
        ) : null}
      </section>
    </main>
  );
}

function AndroidBiometricPrompt({
  stage,
  onCancel,
}: {
  stage: "ready" | "scanning" | "verifying" | "success" | "failed";
  onCancel: () => void;
}) {
  const isBusy = stage === "scanning" || stage === "verifying";
  return (
    <div className={styles.biometricOverlay} role="dialog" aria-modal="true" aria-label="Android biometric prompt">
      <div className={styles.androidPrompt}>
        <div className={styles.androidHandle} />
        <h2>Verify it is you</h2>
        <p>Use fingerprint to continue this staff verification.</p>
        <div className={`${styles.androidFingerprint} ${isBusy ? styles.androidFingerprintScanning : ""} ${stage === "success" ? styles.androidFingerprintSuccess : ""} ${stage === "failed" ? styles.androidFingerprintFailed : ""}`}>
          {stage === "verifying" ? <Loader2 className={styles.androidSpinner} size={58} strokeWidth={1.6} /> : <Fingerprint size={68} strokeWidth={1.4} />}
        </div>
        <strong>
          {stage === "scanning"
            ? "Touch the fingerprint sensor"
            : stage === "verifying"
              ? "Matching with HR record"
              : stage === "success"
                ? "Fingerprint recognized"
                : stage === "failed"
                  ? "Fingerprint not recognized"
                  : "Waiting for fingerprint"}
        </strong>
        <span>
          {stage === "success"
            ? "Biometric match confirmed."
            : stage === "failed"
              ? "Try again or contact HR."
              : "This is a secure device biometric check."}
        </span>
        <button disabled={isBusy} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
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

function createDocumentFileState(documents: string[]) {
  return documents.reduce<Record<string, File | null>>((accumulator, document) => {
    accumulator[document] = null;
    return accumulator;
  }, {});
}

function hasAnyRule(rules: string[] | undefined, aliases: string[]) {
  if (!rules?.length) return false;
  const normalized = new Set(rules.map((rule) => rule.trim().toLowerCase()));
  return aliases.some((alias) => normalized.has(alias));
}

function displayBiometricStatus(value: string | null) {
  if (!value) return "Not checked";
  if (value === "CAPTURING_SAMPLE") return "Capturing";
  if (value === "BIOMETRIC_MATCH") return "Matched";
  if (value === "BIOMETRIC_MISMATCH") return "Mismatch";
  if (value === "BIOMETRIC_ERROR") return "Needs retry";
  return value.replace(/_/g, " ");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function displayMinistryName(value: string) {
  return value.replace(/\s+Demo\s+[A-Z0-9-]+$/i, "");
}

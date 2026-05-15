"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, FileCheck2, Smartphone, UploadCloud, WifiOff } from "lucide-react";
import { LivenessCamera, type LivenessCameraHandle, type LivenessMetrics } from "@/features/liveness-camera";
import { latticeApi } from "@/shared/api/client";
import type {
  DocumentConsistencyResponse,
  LivenessEvaluationResponse,
  PublicDocumentUploadResponse,
  PublicOtpSendResponse,
  PublicVerificationPayCycle,
  PublicVerificationWorker,
  VerificationSession,
  Viq,
} from "@/shared/api/types";
import { Button, Card, FlagPill, StepProgress, TrustScoreGauge } from "@/shared/ui";
import styles from "./WorkerVerifyPage.module.css";

type FlowStep = "loading" | "welcome" | "otp" | "liveness" | "documents" | "processing" | "result";

const steps = ["OTP", "Liveness", "Documents", "Done"];

type Props = {
  sessionToken?: string;
};

export function WorkerVerifyPage({ sessionToken }: Props) {
  const [activeToken, setActiveToken] = useState(sessionToken ?? "");
  const [step, setStep] = useState<FlowStep>("loading");
  const [worker, setWorker] = useState<PublicVerificationWorker | null>(null);
  const [payCycle, setPayCycle] = useState<PublicVerificationPayCycle | null>(null);
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [otpChallenge, setOtpChallenge] = useState<PublicOtpSendResponse | null>(null);
  const [otp, setOtp] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [livenessMetrics, setLivenessMetrics] = useState<LivenessMetrics | null>(null);
  const [liveness, setLiveness] = useState<LivenessEvaluationResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentConsistencyResponse | PublicDocumentUploadResponse | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [verificationNotes, setVerificationNotes] = useState<string[]>([]);
  const [viq, setViq] = useState<Viq | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const livenessCameraRef = useRef<LivenessCameraHandle | null>(null);
  const livenessFrameRef = useRef<File | null>(null);

  const currentProgress =
    step === "otp" ? 0 : step === "liveness" ? 1 : step === "documents" || step === "processing" ? 2 : step === "result" ? 4 : 0;
  const otpComplete = otp.every(Boolean);
  const workerAmount = useMemo(() => formatMoney(worker?.salary_amount), [worker]);
  const resultStatus = viq?.verdict === "PASS" ? "pass" : viq?.verdict === "FAIL" ? "fail" : "review";

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    setOffline(!window.navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (sessionToken) {
      void loadSession(sessionToken);
      return;
    }
    void prepareDemoSession();
  }, [sessionToken]);

  async function loadSession(token: string) {
    setError(null);
    setStep("loading");
    try {
      const response = await latticeApi.getPublicVerificationSession(token);
      setActiveToken(token);
      setWorker(response.worker);
      setPayCycle(response.pay_cycle);
      setSession(response.session);
      if (response.viq) {
        setViq(response.viq);
        setStep("result");
        return;
      }
      setStep("welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this verification link.");
    }
  }

  async function prepareDemoSession() {
    setError(null);
    setStep("loading");
    try {
      const seed = await latticeApi.seedPayroll();
      const workers = await latticeApi.listWorkers(seed.ministry);
      const selected =
        workers.find((item) => item.risk_metadata?.demo_verifiable === true) ??
        workers.find((item) => item.risk_metadata?.is_injected_ghost !== true) ??
        workers[0];
      if (!selected) throw new Error("No staff record is available for verification.");
      const createdSession = await latticeApi.createVerificationSession(
        selected.id,
        seed.pay_cycle_id,
      );
      await loadSession(createdSession.session_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare verification.");
    }
  }

  async function beginVerification() {
    if (!activeToken) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await latticeApi.sendPublicVerificationOtp(activeToken);
      setOtpChallenge(challenge);
      setOtp(Array.from({ length: 6 }, () => ""));
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the verification code.");
    } finally {
      setBusy(false);
    }
  }

  function updateOtp(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    if (digit) {
      const next = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null;
      next?.focus();
    }
  }

  async function confirmOtp() {
    if (!activeToken || !otpChallenge || !otpComplete) return;
    setBusy(true);
    setError(null);
    try {
      const response = await latticeApi.verifyPublicVerificationOtp(activeToken, {
        challenge_id: otpChallenge.challenge_id,
        otp: otp.join(""),
      });
      if (!response.verified) {
        setError(response.status === "LOCKED" ? "Too many wrong attempts. Contact HR." : "The code is not correct yet.");
        return;
      }
      setStep("liveness");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this code.");
    } finally {
      setBusy(false);
    }
  }

  async function runLivenessCheck() {
    if (!activeToken || !livenessMetrics?.passed) return;
    setBusy(true);
    setError(null);
    try {
      livenessFrameRef.current = await livenessCameraRef.current?.captureFrame() ?? null;
      const payload = {
        challenge: "blink_twice_turn_left",
        blink_count: livenessMetrics.blinkCount,
        head_turn_degrees: livenessMetrics.headTurnDegrees,
        confidence: livenessMetrics.confidence,
        attempts: 1,
        captured_at: new Date().toISOString(),
      };
      const evaluated = await latticeApi.evaluateLiveness(payload);
      setLiveness(evaluated);
      if (evaluated.status !== "PASSED") {
        setError("Proof of life failed. Complete the blink and head-turn challenge.");
        return;
      }
      setStep("documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof of life could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function runDocumentCheck() {
    if (!activeToken || !session || !liveness) return;
    setBusy(true);
    setError(null);
    try {
      const [documentResult, identityEvidence] = await Promise.all([
        documentFiles.length
          ? latticeApi.uploadPublicVerificationDocuments(activeToken, documentFiles)
          : latticeApi.evaluatePublicVerificationDocuments(activeToken),
        latticeApi.verifyPublicVerificationIdentity(activeToken).catch(() => null),
      ]);
      const frame = livenessFrameRef.current;
      const deepfakeResult = frame
        ? await latticeApi.classifyDeepfakeFrame(frame).catch(() => null)
        : null;
      const faceResult = frame
        ? await latticeApi.verifyPublicVerificationFace(activeToken, frame).catch(() => null)
        : null;
      setVerificationNotes([
        ...(frame && !deepfakeResult ? ["Media authenticity model unavailable; HR review will keep that signal pending."] : []),
        ...(frame && !faceResult ? ["Face-match model unavailable; HR review will keep that signal pending."] : []),
      ]);
      const capturedAt = new Date().toISOString();
      setDocuments(documentResult);
      await latticeApi.submitPublicVerificationEvidence(activeToken, {
        liveness: {
          status: "PASSED",
          confidence: liveness.confidence,
          attempts: liveness.attempts,
          challenge: liveness.challenge,
          captured_at: capturedAt,
        },
        ...(deepfakeResult
          ? {
              deepfake: {
                status: deepfakeResult.status === "DEEPFAKE_DETECTED" ? "DEEPFAKE_DETECTED" : "CLEAN",
                synthetic_probability: deepfakeResult.synthetic_probability,
                model_name: deepfakeResult.model_name,
                model_version: deepfakeResult.model_version,
                captured_at: capturedAt,
              },
            }
          : {}),
        ...(faceResult
          ? {
              face_match: {
                status: faceResult.status === "FACE_MISMATCH" ? "FACE_MISMATCH" : "MATCH",
                similarity: faceResult.similarity,
                captured_at: capturedAt,
              },
            }
          : {}),
        ...(identityEvidence ? { bvn: identityEvidence } : {}),
        documents: {
          status: documentResult.status,
          severity: documentResult.severity,
          flags: documentResult.flags,
          summary: documentResult.summary,
        },
      });
      setStep("processing");
      void finalizeSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Documents could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeSession() {
    if (!activeToken) return;
    setError(null);
    setProcessingIndex(0);
    const timer = window.setInterval(() => {
      setProcessingIndex((current) => Math.min(current + 1, 3));
    }, 900);
    try {
      const result = await latticeApi.finalizePublicVerificationSession(activeToken);
      window.clearInterval(timer);
      setProcessingIndex(4);
      setViq(result.viq);
      setSession(result.session);
      window.setTimeout(() => setStep("result"), 500);
    } catch (err) {
      window.clearInterval(timer);
      setError(err instanceof Error ? err.message : "Verification could not be finalized.");
      setStep("documents");
    }
  }

  if (step === "loading") {
    return (
      <main className={styles.shell}>
        <Card className={styles.centerCard}>
          <img alt="Ogun State Government" className={styles.centerLogo} src="/ogun-logo.png" />
          <h1>Opening verification link</h1>
          <p>Connecting to Ogun State Ministry payroll records.</p>
          {error ? (
            <>
              <div className={styles.error}>{error}</div>
              <Button fullWidth onClick={() => (sessionToken ? loadSession(sessionToken) : prepareDemoSession())}>
                Retry
              </Button>
            </>
          ) : null}
        </Card>
      </main>
    );
  }

  if (step === "result" && worker && viq) {
    return (
      <main className={styles.shell}>
        <section className={`${styles.resultHeader} ${styles[resultStatus]}`}>
          <CheckCircle size={56} strokeWidth={1.5} />
          <h1>{viq.verdict === "PASS" ? "Verification Passed" : viq.verdict === "FAIL" ? "Verification Blocked" : "Sent For Review"}</h1>
          <p>{worker.full_name}</p>
        </section>
        <section className={styles.resultBody}>
          <TrustScoreGauge score={viq.trust_score} size="large" verdict={viq.verdict} />
          <strong>{workerAmount}</strong>
          <span>Reference: {viq.id}</span>
          <span>Payment status: {viq.payment_status}</span>
          <div className={styles.flagList}>
            {viq.flags.length ? viq.flags.map((flag) => <FlagPill flag={flag} key={flag} />) : "No active flags"}
          </div>
          <Button fullWidth onClick={() => setStep("welcome")}>Done</Button>
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
            <strong>Ogun Staff Verification</strong>
            <span>Secure payroll release</span>
          </div>
        </header>

        {offline ? (
          <div className={styles.offline}>
            <WifiOff size={18} strokeWidth={1.5} />
            Offline mode. Reconnect before final submission.
          </div>
        ) : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <StepProgress steps={steps} currentStep={currentProgress} />

        {step === "welcome" && worker ? (
          <Card className={styles.screen}>
            <Smartphone size={36} strokeWidth={1.5} />
            <h1>Annual staff verification</h1>
            <div className={styles.workerBlock}>
              <span>{worker.full_name}</span>
              <strong>{worker.worker_code}</strong>
              <small>Pay cycle: {payCycle?.name ?? session?.pay_cycle_id ?? "Assigned cycle"}</small>
              <small>Expected: {workerAmount}</small>
            </div>
            <p>Complete this check from your phone so payroll can confirm your identity and staff file.</p>
            <Button fullWidth loading={busy} onClick={beginVerification}>Begin Verification</Button>
          </Card>
        ) : null}

        {step === "otp" && worker ? (
          <Card className={styles.screen}>
            <h1>Enter your code</h1>
            <p>Code sent to the number ending in {otpChallenge?.phone_last4 ?? worker.phone_last4}.</p>
            <div className={styles.otpGrid}>
              {otp.map((digit, index) => (
                <input
                  aria-label={`Digit ${index + 1}`}
                  id={`otp-${index}`}
                  inputMode="numeric"
                  key={index}
                  maxLength={1}
                  value={digit}
                  onChange={(event) => updateOtp(index, event.target.value)}
                />
              ))}
            </div>
            <Button fullWidth disabled={!otpComplete} loading={busy} onClick={confirmOtp}>
              Confirm Code
            </Button>
            <Button fullWidth variant="secondary" loading={busy} onClick={beginVerification}>
              Resend Code
            </Button>
          </Card>
        ) : null}

        {step === "liveness" ? (
          <Card className={styles.screen}>
            <h1>Face check</h1>
            <p>{(livenessMetrics?.blinkCount ?? 0) < 2 ? "Step 1 of 2: blink twice while facing the camera." : "Step 2 of 2: turn your head slightly left."}</p>
            <LivenessCamera ref={livenessCameraRef} onMetricsChange={setLivenessMetrics} />
            {liveness ? <p className={styles.meta}>Proof of life: {liveness.status}</p> : null}
            <Button fullWidth disabled={!livenessMetrics?.passed} loading={busy} onClick={runLivenessCheck}>
              Submit Face Check
            </Button>
          </Card>
        ) : null}

        {step === "documents" && worker ? (
          <Card className={styles.screen}>
            <UploadCloud size={36} strokeWidth={1.5} />
            <h1>Document consistency</h1>
            <p>Upload your staff documents so HR can compare dates, identity records, and personnel-file evidence.</p>
            <div className={styles.documentGrid}>
              <div>
                <span>Staff ID</span>
                <strong>{worker.worker_code}</strong>
              </div>
              <div>
                <span>Date of birth</span>
                <strong>{formatDisplayDate(worker.date_of_birth)}</strong>
              </div>
              <div>
                <span>Department</span>
                <strong>{worker.department ?? "Not provided"}</strong>
              </div>
              <div>
                <span>Payroll amount</span>
                <strong>{workerAmount}</strong>
              </div>
            </div>
            <label className={styles.fileInput}>
              Required documents
              <input
                accept=".pdf,.txt,.md,.csv,image/*"
                multiple
                type="file"
                onChange={(event) => setDocumentFiles(Array.from(event.target.files ?? []))}
              />
              <span>{documentFiles.length ? `${documentFiles.length} file(s) selected` : "PDF or text files work best for extraction"}</span>
            </label>
            {documents ? <p className={styles.meta}>Documents: {documents.status}</p> : null}
            {verificationNotes.length ? (
              <div className={styles.noteList}>
                {verificationNotes.map((note) => <span key={note}>{note}</span>)}
              </div>
            ) : null}
            <Button fullWidth disabled={!documentFiles.length} loading={busy} onClick={runDocumentCheck}>Submit Documents</Button>
          </Card>
        ) : null}

        {step === "processing" ? (
          <Card className={styles.screen}>
            <h1>Verifying your identity</h1>
            <ul className={styles.checks}>
              {["Proof of life confirmed", "Identity checked", "Documents checked", "Salary decision generated"].map(
                (item, index) => (
                  <li className={index <= processingIndex ? styles.done : ""} key={item}>
                    <CheckCircle size={20} strokeWidth={1.5} />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </Card>
        ) : null}

        <footer className={styles.footer}>
          <FileCheck2 size={18} strokeWidth={1.5} />
          Ogun State Ministry of Education
        </footer>
      </section>
    </main>
  );
}

function formatMoney(value?: string) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

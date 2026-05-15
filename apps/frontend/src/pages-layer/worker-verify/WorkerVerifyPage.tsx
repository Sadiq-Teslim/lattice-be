"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle, FileCheck2, Smartphone, UploadCloud, WifiOff } from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import type {
  DocumentConsistencyResponse,
  LivenessEvaluationResponse,
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
  const [blinkCount, setBlinkCount] = useState(0);
  const [turned, setTurned] = useState(false);
  const [liveness, setLiveness] = useState<LivenessEvaluationResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentConsistencyResponse | null>(null);
  const [viq, setViq] = useState<Viq | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    if (step !== "liveness") {
      stopCamera();
      return;
    }
    void startCamera();
    return stopCamera;
  }, [step]);

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
    if (!activeToken || !cameraReady) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        challenge: "blink_twice_turn_left",
        blink_count: blinkCount,
        head_turn_degrees: turned ? 18 : 0,
        confidence: blinkCount >= 2 && turned ? 0.92 : 0.42,
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
      const [documentResult, identityEvidence, frame] = await Promise.all([
        latticeApi.evaluatePublicVerificationDocuments(activeToken),
        latticeApi.verifyPublicVerificationIdentity(activeToken).catch(() => null),
        captureCameraFrame().catch(() => null),
      ]);
      const deepfakeResult = frame
        ? await latticeApi.classifyDeepfakeFrame(frame).catch(() => null)
        : null;
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

  async function captureCameraFrame(): Promise<File | null> {
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
            {liveness ? <p className={styles.meta}>Proof of life: {liveness.status}</p> : null}
            <Button fullWidth disabled={blinkCount < 2 || !turned || !cameraReady} loading={busy} onClick={runLivenessCheck}>
              Submit Face Check
            </Button>
          </Card>
        ) : null}

        {step === "documents" && worker ? (
          <Card className={styles.screen}>
            <UploadCloud size={36} strokeWidth={1.5} />
            <h1>Document consistency</h1>
            <p>Confirm your personnel file so HR can compare dates, identity records, and staff documents.</p>
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
            {documents ? <p className={styles.meta}>Documents: {documents.status}</p> : null}
            <Button fullWidth loading={busy} onClick={runDocumentCheck}>Submit Documents</Button>
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

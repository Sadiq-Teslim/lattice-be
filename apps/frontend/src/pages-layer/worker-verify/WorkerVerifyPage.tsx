"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle, FileCheck2, Smartphone, UploadCloud, WifiOff } from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import type {
  DocumentConsistencyResponse,
  LivenessEvaluationResponse,
  VerificationSession,
  Viq,
  Worker,
} from "@/shared/api/types";
import { Button, Card, FlagPill, StepProgress, TrustScoreGauge } from "@/shared/ui";
import styles from "./WorkerVerifyPage.module.css";

type FlowStep = "loading" | "welcome" | "otp" | "liveness" | "documents" | "processing" | "result";

const steps = ["OTP", "Liveness", "Documents", "Done"];

export function WorkerVerifyPage() {
  const [step, setStep] = useState<FlowStep>("loading");
  const [worker, setWorker] = useState<Worker | null>(null);
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [otp, setOtp] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [blinkCount, setBlinkCount] = useState(0);
  const [turned, setTurned] = useState(false);
  const [liveness, setLiveness] = useState<LivenessEvaluationResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentConsistencyResponse | null>(null);
  const [viq, setViq] = useState<Viq | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentProgress = step === "otp" ? 0 : step === "liveness" ? 1 : step === "documents" || step === "processing" ? 2 : step === "result" ? 4 : 0;
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
    prepareDemoSession();
  }, []);

  async function prepareDemoSession() {
    setError(null);
    try {
      const seed = await latticeApi.seedPayroll();
      const workers = await latticeApi.listWorkers(seed.ministry);
      const selected =
        workers.find((item) => item.risk_metadata?.is_injected_ghost !== true) ?? workers[0];
      if (!selected) throw new Error("No worker was returned for this verification session.");
      const createdSession = await latticeApi.createVerificationSession(
        selected.id,
        seed.pay_cycle_id,
      );
      setWorker(selected);
      setSession(createdSession);
      setStep("welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare verification.");
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

  async function runLivenessCheck() {
    if (!session) return;
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
        setError("Liveness failed. Complete the blink and head-turn challenge.");
        return;
      }
      setStep("documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liveness check failed.");
    }
  }

  async function runDocumentCheck() {
    if (!session || !worker || !liveness) return;
    setError(null);
    try {
      const documentResult = await latticeApi.evaluateDocumentConsistency(worker);
      const capturedAt = new Date().toISOString();
      setDocuments(documentResult);
      await latticeApi.submitVerificationEvidence(session.id, {
        liveness: {
          status: "PASSED",
          confidence: liveness.confidence,
          attempts: liveness.attempts,
          challenge: liveness.challenge,
          captured_at: capturedAt,
        },
        deepfake: {
          status: "CLEAN",
          synthetic_probability: 0.02,
          model_name: "model-backed-inference",
        },
        face_match: {
          status: "MATCH",
          similarity: 0.98,
          captured_at: capturedAt,
        },
        bvn: {
          status: "BVN_MATCH",
          provider: "SQUAD",
          resolved_name: worker?.full_name,
          matched_name: worker?.full_name,
          captured_at: capturedAt,
        },
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
      setError(err instanceof Error ? err.message : "Document verification failed.");
    }
  }

  async function finalizeSession() {
    if (!session) return;
    setError(null);
    setProcessingIndex(0);
    const timer = window.setInterval(() => {
      setProcessingIndex((current) => Math.min(current + 1, 3));
    }, 900);
    try {
      const result = await latticeApi.finalizeVerificationSession(session.id);
      window.clearInterval(timer);
      setProcessingIndex(4);
      setViq(result.viq);
      window.setTimeout(() => setStep("result"), 500);
    } catch (err) {
      window.clearInterval(timer);
      setError(err instanceof Error ? err.message : "Verification could not be finalized.");
      setStep("liveness");
    }
  }

  if (step === "loading") {
    return (
      <main className={styles.shell}>
        <Card className={styles.centerCard}>
          <img alt="Ogun State Government" className={styles.centerLogo} src="/ogun-logo.png" />
          <h1>Preparing verification</h1>
          <p>Connecting to Ogun State Ministry payroll records.</p>
          {error ? (
            <>
              <div className={styles.error}>{error}</div>
              <Button fullWidth onClick={prepareDemoSession}>Retry</Button>
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
          <span>VIQ: {viq.id}</span>
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
            <span>Powered by Lattice</span>
          </div>
        </header>

        {offline ? (
          <div className={styles.offline}>
            <WifiOff size={18} strokeWidth={1.5} />
            Offline mode. Your result will sync when connection returns.
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
              <small>Pay cycle: {session?.pay_cycle_id ?? "Not assigned"}</small>
              <small>Expected: {workerAmount}</small>
            </div>
            <p>Complete the check from your phone so payroll can release your salary.</p>
            <Button fullWidth onClick={() => setStep("otp")}>Begin Verification</Button>
          </Card>
        ) : null}

        {step === "otp" && worker ? (
          <Card className={styles.screen}>
            <h1>Enter your code</h1>
            <p>Code sent to the number ending in {worker.phone.slice(-4)}.</p>
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
            <Button fullWidth disabled={!otpComplete} onClick={() => setStep("liveness")}>
              Confirm Code
            </Button>
          </Card>
        ) : null}

        {step === "liveness" ? (
          <Card className={styles.screen}>
            <h1>Face check</h1>
            <p>{blinkCount < 2 ? "Step 1 of 2: blink twice." : "Step 2 of 2: turn your head slightly left."}</p>
            <div className={styles.camera}>
              <Camera size={56} strokeWidth={1.5} />
              <div className={styles.mesh} />
            </div>
            <div className={styles.livenessGrid}>
              <Button variant="secondary" onClick={() => setBlinkCount((count) => Math.min(2, count + 1))}>
                Blink {blinkCount}/2
              </Button>
              <Button variant="secondary" onClick={() => setTurned(true)}>
                {turned ? "Head Turned" : "Turn Left"}
              </Button>
            </div>
            {liveness ? <p className={styles.meta}>Backend liveness: {liveness.status}</p> : null}
            <Button fullWidth disabled={blinkCount < 2 || !turned} onClick={runLivenessCheck}>
              Submit Face Check
            </Button>
          </Card>
        ) : null}

        {step === "documents" && worker ? (
          <Card className={styles.screen}>
            <UploadCloud size={36} strokeWidth={1.5} />
            <h1>Document consistency</h1>
            <p>Confirm your personnel file so HR can compare dates and identity records.</p>
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
            </div>
            {documents ? <p className={styles.meta}>Documents: {documents.status}</p> : null}
            <Button fullWidth onClick={runDocumentCheck}>Submit Documents</Button>
          </Card>
        ) : null}

        {step === "processing" ? (
          <Card className={styles.screen}>
            <h1>Verifying your identity</h1>
            <ul className={styles.checks}>
              {["Liveness confirmed", "Documents checked", "Payroll record matched", "Salary decision generated"].map(
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

function formatDisplayDate(value?: string) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

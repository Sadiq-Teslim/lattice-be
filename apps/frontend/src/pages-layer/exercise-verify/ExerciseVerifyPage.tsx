"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  const token = params.token;
  const [step, setStep] = useState<Step>("loading");
  const [exercise, setExercise] = useState<VerificationExercise | null>(null);
  const [workerCode, setWorkerCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkedDocuments, setCheckedDocuments] = useState<Set<string>>(new Set());
  const [livenessDone, setLivenessDone] = useState(false);
  const [submission, setSubmission] = useState<ExerciseSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requiresLiveness = exercise?.rules.includes("proof_of_life") ?? false;
  const currentStep = step === "identity" ? 0 : step === "documents" ? 1 : step === "liveness" ? 2 : step === "review" || step === "submitted" ? 3 : 0;
  const documentComplete = useMemo(() => {
    const required = exercise?.documents ?? [];
    return required.length === 0 || required.every((item) => checkedDocuments.has(item));
  }, [checkedDocuments, exercise]);

  useEffect(() => {
    void loadExercise();
  }, [token]);

  async function loadExercise() {
    setError(null);
    try {
      const result = await latticeApi.getPublicVerificationExercise(token);
      setExercise(result);
      setCheckedDocuments(new Set(result.documents.length ? [] : ["No documents required"]));
      setStep("identity");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this verification link.");
      setStep("identity");
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
            <p>Complete the live face check required by this verification exercise.</p>
            <div className={styles.camera}>
              <Camera size={56} strokeWidth={1.5} />
              <div className={styles.mesh} />
            </div>
            <Button fullWidth variant="secondary" onClick={() => setLivenessDone(true)}>
              {livenessDone ? "Live Check Complete" : "Run Live Check"}
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

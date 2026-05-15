"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CalendarCheck,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  IdCard,
  Link2,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Settings2,
  Smartphone,
  UploadCloud,
} from "lucide-react";
import { Avatar, Drawer, Group, Modal, Paper, SegmentedControl, Select, Text, TextInput } from "@mantine/core";
import { latticeApi } from "@/shared/api/client";
import { env } from "@/shared/config/env";
import type {
  AnomalyResult,
  AnomalyScanResponse,
  AdminSummary,
  BillingAccount,
  CreditLedgerEntry,
  CreditPurchase,
  DemoBootstrapResponse,
  DemoSeedResponse,
  DocumentConsistencyResponse,
  ExerciseSubmission,
  IntegrationReadinessResponse,
  StaffAction,
  VerificationExercise,
  Viq,
  Worker,
  WorkerVerificationLinkResponse,
} from "@/shared/api/types";
import { Button, Card } from "@/shared/ui";
import { Sidebar, type ConsolePage } from "@/widgets/sidebar/Sidebar";
import { StatsGrid } from "@/widgets/stats/StatsGrid";
import { WorkerDetailDrawer } from "@/widgets/worker-detail/WorkerDetailDrawer";
import { WorkerTable } from "@/widgets/worker-table/WorkerTable";
import styles from "./DashboardPage.module.css";

type Filter = "ALL" | "PASS" | "REVIEW" | "FAIL";
type PayrollStage = "EMPTY" | "IMPORTED" | "LATTICE_READY" | "DISBURSED";
type PaginationState = {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};
type ExerciseRule =
  | "identity_bvn"
  | "biometric_match"
  | "proof_of_life"
  | "document_consistency"
  | "payroll_anomaly"
  | "media_authenticity";

const PAGE_SIZE = 12;
const verificationRules: Array<{ key: ExerciseRule; label: string; detail: string; badge: string }> = [
  {
    key: "identity_bvn",
    label: "Identity and BVN",
    detail: "Worker identity evidence is checked against payroll and BVN/account records.",
    badge: "Identity",
  },
  {
    key: "biometric_match",
    label: "Biometric match",
    detail: "Fresh biometric evidence is compared with the institution's enrolled biometric record.",
    badge: "Biometric",
  },
  {
    key: "proof_of_life",
    label: "Proof of life",
    detail: "Worker completes a camera liveness challenge before HR accepts the submission.",
    badge: "Camera",
  },
  {
    key: "document_consistency",
    label: "Document consistency",
    detail: "Dates and personnel file fields are compared for contradictions.",
    badge: "Documents",
  },
  {
    key: "payroll_anomaly",
    label: "Payroll anomaly",
    detail: "Shared devices, BVNs, IPs, and location clusters are scanned across the cohort.",
    badge: "Payroll",
  },
  {
    key: "media_authenticity",
    label: "Media authenticity",
    detail: "Captured face evidence is checked for synthetic-media risk when provided.",
    badge: "Media",
  },
];
const exerciseDocuments = [
  {
    label: "Appointment letter",
    fields: "Appointment date, document number",
    types: "PDF, image, text",
  },
  {
    label: "Birth certificate / declaration of age",
    fields: "Date of birth, age declaration",
    types: "PDF, image",
  },
  {
    label: "Last promotion letter",
    fields: "Promotion date, grade level",
    types: "PDF, image",
  },
  {
    label: "Posting letter",
    fields: "School/LGA posting, effective date",
    types: "PDF, image",
  },
  {
    label: "Staff ID card",
    fields: "Staff ID, name, photo",
    types: "Image, PDF",
  },
  {
    label: "BVN identity record",
    fields: "BVN name, DOB, phone",
    types: "PDF, text",
  },
];

export function DashboardPage() {
  const autoSeedStarted = useRef(false);
  const [activePage, setActivePage] = useState<ConsolePage>("dashboard");
  const [seed, setSeed] = useState<DemoSeedResponse | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [anomalyScan, setAnomalyScan] = useState<AnomalyScanResponse | null>(null);
  const [viqs, setViqs] = useState<Record<string, Viq>>({});
  const [documentResults, setDocumentResults] = useState<Record<string, DocumentConsistencyResponse>>({});
  const [staffActions, setStaffActions] = useState<StaffAction[]>([]);
  const [exercises, setExercises] = useState<VerificationExercise[]>([]);
  const [exerciseSubmissions, setExerciseSubmissions] = useState<ExerciseSubmission[]>([]);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [workerLinks, setWorkerLinks] = useState<Record<string, WorkerVerificationLinkResponse>>({});
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [payrollStage, setPayrollStage] = useState<PayrollStage>("EMPTY");
  const [disbursedIds, setDisbursedIds] = useState<Set<string>>(new Set());
  const [investigationIds, setInvestigationIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState("Annual Staff Verification Exercise");
  const [exerciseScope, setExerciseScope] = useState("All ministry staff");
  const [exerciseDeadline, setExerciseDeadline] = useState("2026-06-30");
  const [exerciseContact, setExerciseContact] = useState("HR Verification Desk");
  const [exerciseDrawerOpen, setExerciseDrawerOpen] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [exercisePendingDelete, setExercisePendingDelete] = useState<VerificationExercise | null>(null);
  const [selectedExerciseRules, setSelectedExerciseRules] = useState<Set<ExerciseRule>>(
    new Set(["identity_bvn", "biometric_match", "proof_of_life", "document_consistency", "payroll_anomaly"]),
  );
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(
    new Set(["Appointment letter", "Birth certificate / declaration of age", "Staff ID card"]),
  );

  const anomalies = anomalyScan?.results ?? [];
  const anomalyByCode = useMemo(
    () => new Map(anomalies.map((item) => [item.worker_code, item])),
    [anomalies],
  );

  const filteredWorkers = workers.filter((worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const status = viq?.verdict ?? (anomaly?.flagged ? "REVIEW" : "NOT_VERIFIED");
    const matchesFilter = filter === "ALL" || status === filter;
    const text = `${worker.worker_code} ${worker.full_name} ${worker.department ?? ""}`.toLowerCase();
    return matchesFilter && text.includes(query.toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(filteredWorkers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedWorkers = filteredWorkers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const pagination: PaginationState = {
    page: currentPage,
    total: filteredWorkers.length,
    pageSize: PAGE_SIZE,
    onPageChange: setPage,
  };

  const blocked = workers.filter((worker) => viqs[worker.id]?.verdict === "FAIL").length;
  const held = workers.filter((worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    return viq?.verdict === "REVIEW" || viq?.verdict === "FAIL" || anomaly?.flagged || investigationIds.has(worker.id);
  }).length;
  const cleared = workers.filter((worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    return viq?.verdict === "PASS" && !anomaly?.flagged && !investigationIds.has(worker.id);
  }).length;
  const grossPayroll = workers.reduce((sum, worker) => sum + Number(worker.salary_amount || 0), 0);
  const heldPayroll = workers.reduce((sum, worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const shouldHold =
      viq?.verdict === "REVIEW" || viq?.verdict === "FAIL" || anomaly?.flagged || investigationIds.has(worker.id);
    return shouldHold ? sum + Number(worker.salary_amount || 0) : sum;
  }, 0);
  const netEligible = workers.reduce((sum, worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const eligible = viq?.verdict === "PASS" && !anomaly?.flagged && !investigationIds.has(worker.id);
    return eligible ? sum + Number(worker.salary_amount || 0) : sum;
  }, 0);
  useEffect(() => {
    if (autoSeedStarted.current || workers.length > 0) return;
    autoSeedStarted.current = true;
    void loadInitialBatch();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, query, activePage]);

  useEffect(() => {
    const currentExercise = exercises[0];
    if (!currentExercise || exerciseDrawerOpen) return;
    setExerciseName(currentExercise.name);
    setExerciseScope(currentExercise.scope);
    setSelectedExerciseRules(new Set(currentExercise.rules as ExerciseRule[]));
    setSelectedDocuments(new Set(currentExercise.documents));
    setEditingExerciseId(currentExercise.id);
  }, [exerciseDrawerOpen, exercises]);

  async function runAction<T>(name: string, action: () => Promise<T>) {
    setLoading(name);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setLoading(null);
    }
  }

  async function importNominalRoll(options: { navigate?: boolean } = {}) {
    const result = await runAction("seed", latticeApi.bootstrapOgunDemo);
    if (!result) return;
    applyBootstrap(result);
    setSelectedWorker(null);
    if (options.navigate ?? true) {
      setActivePage("staff");
    }
  }

  function applyBootstrap(result: DemoBootstrapResponse) {
    setSeed(result.seed);
    setAnomalyScan(null);
    setViqs(latestViqsByWorker(result.viqs));
    setDocumentResults({});
    applyStaffActions(result.staff_actions);
    setExercises(result.exercises);
    setWorkerLinks({});
    setExerciseSubmissions([]);
    setAdminSummary(result.summary);
    setPayrollStage("IMPORTED");
    setWorkers(sortWorkers(result.workers));
    void loadSubmissionsForExercises(result.exercises);
  }

  async function loadInitialBatch() {
    const result = await runAction("bootstrap", latticeApi.bootstrapOgunDemo);
    if (result) applyBootstrap(result);
  }

  async function hydrateBackendState(
    ministry: string,
    payCycleId: string,
    options: { skipWorkers?: boolean } = {},
  ) {
    const [listedWorkers, listedViqs, listedActions, listedExercises, summary] = await Promise.all([
      options.skipWorkers ? Promise.resolve(null) : latticeApi.listWorkers(ministry),
      latticeApi.listViqs(payCycleId),
      latticeApi.listStaffActions(ministry, payCycleId),
      latticeApi.listVerificationExercises(ministry),
      latticeApi.adminSummary({ ministry, pay_cycle_id: payCycleId }),
    ]);
    if (listedWorkers) {
      setWorkers(listedWorkers);
    }
    setViqs(latestViqsByWorker(listedViqs));
    applyStaffActions(listedActions);
    setExercises(listedExercises);
    setAdminSummary(summary);
    await loadSubmissionsForExercises(listedExercises);
  }

  async function loadSubmissionsForExercises(nextExercises: VerificationExercise[]) {
    if (!nextExercises.length) {
      setExerciseSubmissions([]);
      return;
    }
    const groupedSubmissions = await Promise.all(
      nextExercises.map(async (exercise) => {
        const submissions = await latticeApi.listExerciseSubmissions(exercise.id).catch(() => []);
        return submissions.map((submission) => ({
          ...submission,
          payload: {
            ...submission.payload,
            exercise_name: submission.payload.exercise_name ?? exercise.name,
          },
        }));
      }),
    );
    setExerciseSubmissions(
      groupedSubmissions
        .flat()
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    );
  }

  function applyStaffActions(actions: StaffAction[]) {
    setStaffActions(actions);
    setDisbursedIds(new Set(actions.filter((item) => item.action_type === "APPROVE_PAYMENT").map((item) => item.worker_id)));
    setInvestigationIds(new Set(actions.filter((item) => item.action_type === "FLAG_INVESTIGATION").map((item) => item.worker_id)));
    setDocumentResults(documentResultsFromActions(actions));
  }

  async function runLatticeGate() {
    if (!seed) return;
    const result = await runAction("anomaly", () => latticeApi.scanAnomalies(seed.pay_cycle_id));
    if (result) {
      setAnomalyScan(result);
      setPayrollStage("LATTICE_READY");
    }
  }

  async function verifyWorker(worker: Worker) {
    if (!seed) return;
    const result = await runAction(`verify-${worker.id}`, async () => {
      const documents = await latticeApi.evaluateDocumentConsistency(worker);
      const evidence = await buildVerificationEvidence(worker, documents);
      const viqResult = await latticeApi.verifyAndDisburse(worker.id, seed.pay_cycle_id, {
        ...evidence,
        documents: documentEvidence(documents),
      });
      const documentAction = await latticeApi.recordDocumentCheck({
        worker_id: worker.id,
        pay_cycle_id: seed.pay_cycle_id,
        viq_id: viqResult.viq.id,
        payload: documents,
      });
      return { documents, viqResult, documentAction };
    });
    if (result) {
      setDocumentResults((current) => ({ ...current, [worker.id]: result.documents }));
      setViqs((current) => ({ ...current, [worker.id]: result.viqResult.viq }));
      setStaffActions((current) => [result.documentAction, ...current]);
      setSelectedWorker(worker);
      void hydrateBackendState(seed.ministry, seed.pay_cycle_id, { skipWorkers: true });
    }
  }

  async function buildVerificationEvidence(worker: Worker, documents: DocumentConsistencyResponse) {
    const metadata = worker.risk_metadata ?? {};
    const preverified = objectValue(metadata.preverified_evidence);
    const evidence: Record<string, Record<string, unknown>> = {
      ...(preverified ?? {}),
    };

    if (worker.bank_code && worker.bank_account_number) {
      const lookup = await latticeApi.accountLookup({
        bank_code: worker.bank_code,
        account_number: worker.bank_account_number,
      });
      const accountName = String(lookup.response.data?.account_name ?? "");
      const nameMatches = namesLookRelated(accountName, worker.full_name);
      evidence.financial_account = {
        status: nameMatches ? "ACCOUNT_MATCH" : "ACCOUNT_MISMATCH",
        provider: "SQUAD",
        bank_code: worker.bank_code,
        account_number: maskAccount(worker.bank_account_number),
        resolved_name: accountName,
      };
    }

    if (documents.status === "DOCUMENT_INCONSISTENCY") {
      evidence.documents = documentEvidence(documents);
    }

    return evidence;
  }

  async function verifyAllEligible() {
    const candidates = paginatedWorkers;
    for (const worker of candidates) {
      await verifyWorker(worker);
    }
  }

  async function disburseEligible() {
    if (!seed) return;
    const result = await runAction("release", () =>
      latticeApi.releaseEligible({ pay_cycle_id: seed.pay_cycle_id, initiate_transfers: true }),
    );
    if (result) {
      setStaffActions((current) => [...result.released, ...current]);
      const successfulTransferIds = result.transfer_results
        .filter((item) => item.status !== "TRANSFER_FAILED")
        .map((item) => item.worker_id);
      const releasedIds = result.transfer_results.length
        ? successfulTransferIds
        : result.released.map((item) => item.worker_id);
      setDisbursedIds((current) => {
        const next = new Set(current);
        releasedIds.forEach((workerId) => next.add(workerId));
        return next;
      });
      if (releasedIds.length) {
        setPayrollStage("DISBURSED");
        setSelectedWorker(null);
      }
      await hydrateBackendState(seed.ministry, seed.pay_cycle_id, { skipWorkers: true });
    }
  }

  async function generateWorkerLink(worker: Worker, sendSms = false) {
    if (!seed) return;
    const result = await runAction(`${sendSms ? "send-link" : "worker-link"}-${worker.id}`, () =>
      latticeApi.createWorkerVerificationLink({
        worker_id: worker.id,
        pay_cycle_id: seed.pay_cycle_id,
        send_sms: sendSms,
      }),
    );
    if (result) {
      setWorkerLinks((current) => ({ ...current, [worker.id]: result }));
      if (!sendSms && navigator.clipboard) {
        await navigator.clipboard.writeText(result.public_url).catch(() => undefined);
      }
    }
  }

  async function approveWorker(worker: Worker) {
    if (!seed) return;
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    if (viq?.verdict !== "PASS" || anomaly?.flagged || investigationIds.has(worker.id)) return;
    const action = await runAction(`approve-${worker.id}`, () =>
      latticeApi.approvePayment({
        worker_id: worker.id,
        pay_cycle_id: seed.pay_cycle_id,
        viq_id: viq.id,
      }),
    );
    if (action) {
      setStaffActions((current) => [action, ...current]);
      setDisbursedIds((current) => new Set(current).add(worker.id));
      setPayrollStage("DISBURSED");
      setSelectedWorker(null);
      await hydrateBackendState(seed.ministry, seed.pay_cycle_id, { skipWorkers: true });
    }
  }

  async function flagWorker(worker: Worker) {
    if (!seed) return;
    const action = await runAction(`flag-${worker.id}`, () =>
      latticeApi.flagInvestigation({
        worker_id: worker.id,
        pay_cycle_id: seed.pay_cycle_id,
        viq_id: viqs[worker.id]?.id,
      }),
    );
    if (action) {
      setStaffActions((current) => [action, ...current]);
      setInvestigationIds((current) => new Set(current).add(worker.id));
      setDisbursedIds((current) => {
        const next = new Set(current);
        next.delete(worker.id);
        return next;
      });
      await hydrateBackendState(seed.ministry, seed.pay_cycle_id, { skipWorkers: true });
    }
  }

  async function saveExercise() {
    if (!seed) return;
    const payload = {
      ministry: seed.ministry,
      name: exerciseName,
      scope: exerciseScope,
      rules: Array.from(selectedExerciseRules),
      documents: Array.from(selectedDocuments),
    };
    const existing = editingExerciseId
      ? exercises.find((item) => item.id === editingExerciseId)
      : null;
    const exercise = await runAction("exercise-save", () =>
      existing
        ? latticeApi.updateVerificationExercise(existing.id, payload)
        : latticeApi.createVerificationExercise(payload),
    );
    if (exercise) {
      const nextExercises = [exercise, ...exercises.filter((item) => item.id !== exercise.id)];
      setExercises(nextExercises);
      setEditingExerciseId(exercise.id);
      await loadSubmissionsForExercises(nextExercises);
    }
  }

  async function publishExercise() {
    if (!seed) return;
    const payload = {
      ministry: seed.ministry,
      name: exerciseName,
      scope: exerciseScope,
      rules: Array.from(selectedExerciseRules),
      documents: Array.from(selectedDocuments),
    };
    const saved = await runAction("exercise-publish", async () => {
      const existing = editingExerciseId
        ? exercises.find((item) => item.id === editingExerciseId)
        : null;
      const draft = existing
        ? await latticeApi.updateVerificationExercise(existing.id, payload)
        : await latticeApi.createVerificationExercise(payload);
      return latticeApi.publishVerificationExercise(draft.id);
    });
    if (saved) {
      const nextExercises = [saved, ...exercises.filter((item) => item.id !== saved.id)];
      setExercises(nextExercises);
      setEditingExerciseId(saved.id);
      await loadSubmissionsForExercises(nextExercises);
    }
  }

  async function deleteExercise(exercise: VerificationExercise) {
    const result = await runAction(`exercise-delete-${exercise.id}`, () =>
      latticeApi.deleteVerificationExercise(exercise.id),
    );
    if (result !== null) {
      const nextExercises = exercises.filter((item) => item.id !== exercise.id);
      setExercises(nextExercises);
      if (editingExerciseId === exercise.id) {
        setEditingExerciseId(null);
        setExerciseDrawerOpen(false);
      }
      await loadSubmissionsForExercises(nextExercises);
      setExercisePendingDelete(null);
    }
  }

  function requestDeleteExercise(exercise: VerificationExercise) {
    setExercisePendingDelete(exercise);
  }

  function openNewExercise() {
    setEditingExerciseId(null);
    setExerciseName("June 2026 Verification Exercise");
    setExerciseScope("Teaching staff only");
    setSelectedExerciseRules(new Set(["identity_bvn", "biometric_match", "proof_of_life", "document_consistency"]));
    setSelectedDocuments(new Set(["Appointment letter", "Birth certificate / declaration of age", "Staff ID card"]));
    setExerciseDrawerOpen(true);
  }

  function editExercise(exercise: VerificationExercise) {
    setEditingExerciseId(exercise.id);
    setExerciseName(exercise.name);
    setExerciseScope(exercise.scope);
    setSelectedExerciseRules(new Set(exercise.rules as ExerciseRule[]));
    setSelectedDocuments(new Set(exercise.documents));
    setExerciseDrawerOpen(true);
  }

  function toggleExerciseRule(rule: ExerciseRule) {
    setSelectedExerciseRules((current) => {
      const next = new Set(current);
      if (next.has(rule)) next.delete(rule);
      else next.add(rule);
      return next;
    });
  }

  function toggleExerciseDocument(document: string) {
    setSelectedDocuments((current) => {
      const next = new Set(current);
      if (next.has(document)) next.delete(document);
      else next.add(document);
      return next;
    });
  }

  const selectedAnomaly = selectedWorker
    ? anomalyByCode.get(selectedWorker.worker_code)
    : undefined;
  const selectedViq = selectedWorker ? viqs[selectedWorker.id] : undefined;

  return (
    <div className={styles.shell}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.main}>
        <TopBar
          query={query}
          onQuery={(value) => {
            setQuery(value);
            if (value.trim()) setActivePage("staff");
          }}
        />
        {["dashboard", "staff", "payroll"].includes(activePage) ? (
          <PageHeader
            activePage={activePage}
            onImport={importNominalRoll}
            onRunGate={runLatticeGate}
            onDisburse={disburseEligible}
            importLoading={loading === "seed" || loading === "workers"}
            gateLoading={loading === "anomaly"}
            canRunGate={Boolean(seed) && workers.length > 0}
            canDisburse={cleared > 0 && payrollStage === "LATTICE_READY"}
          />
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}

        {activePage === "dashboard" ? (
          <DashboardView
            exercises={exercises}
            workers={workers}
            held={held}
            cleared={cleared}
            grossPayroll={grossPayroll}
            heldPayroll={heldPayroll}
            netEligible={netEligible}
            onNavigate={setActivePage}
          />
        ) : null}

        {activePage === "staff" ? (
          <StaffRecordsView
            workers={paginatedWorkers}
            anomalies={anomalies}
            viqs={viqs}
            documentResults={documentResults}
            disbursedIds={disbursedIds}
            investigationIds={investigationIds}
            selectedId={selectedWorker?.id}
            filter={filter}
            query={query}
            loading={loading}
            pagination={pagination}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={setSelectedWorker}
            onVerify={verifyWorker}
            onBulkVerify={verifyAllEligible}
          />
        ) : null}

        {activePage === "payroll" ? (
          <PayrollView
            workers={paginatedWorkers}
            anomalies={anomalies}
            viqs={viqs}
            disbursedIds={disbursedIds}
            investigationIds={investigationIds}
            documentResults={documentResults}
            selectedId={selectedWorker?.id}
            grossPayroll={grossPayroll}
            heldPayroll={heldPayroll}
            netEligible={netEligible}
            payrollStage={payrollStage}
            pagination={pagination}
            onSelect={setSelectedWorker}
            onVerify={verifyWorker}
            onRunGate={runLatticeGate}
            onDisburse={disburseEligible}
          />
        ) : null}

        {activePage === "exercises" ? (
          <ExercisesView
            exercises={exercises}
            exerciseName={exerciseName}
            exerciseScope={exerciseScope}
            exerciseDeadline={exerciseDeadline}
            exerciseContact={exerciseContact}
            isDrawerOpen={exerciseDrawerOpen}
            publishLoading={loading === "exercise-publish"}
            saveLoading={loading === "exercise-save"}
            selectedDocuments={selectedDocuments}
            selectedRules={selectedExerciseRules}
            editingExerciseId={editingExerciseId}
            onCloseDrawer={() => setExerciseDrawerOpen(false)}
            onDocumentToggle={toggleExerciseDocument}
            onEdit={editExercise}
            onDelete={requestDeleteExercise}
            onNameChange={setExerciseName}
            onNew={openNewExercise}
            onPublish={publishExercise}
            onRuleToggle={toggleExerciseRule}
            onSave={saveExercise}
            onDeadlineChange={setExerciseDeadline}
            onContactChange={setExerciseContact}
            onScopeChange={setExerciseScope}
          />
        ) : null}

        {activePage === "submissions" ? (
          <SubmissionsView
            documentResults={documentResults}
            exerciseSubmissions={exerciseSubmissions}
            workers={workers}
            viqs={viqs}
          />
        ) : null}

        {activePage === "disbursements" ? (
          <DisbursementsView
            workers={workers}
            viqs={viqs}
            disbursedIds={disbursedIds}
            investigationIds={investigationIds}
          />
        ) : null}

        {activePage === "documents" ? (
          <DocumentsView workers={workers} documentResults={documentResults} />
        ) : null}

        {activePage === "reports" ? (
          <ReportsView
            adminSummary={adminSummary}
            workers={workers}
            held={held}
            netEligible={netEligible}
          />
        ) : null}

        {activePage === "settings" ? <SettingsView /> : null}
      </main>

      <WorkerDetailDrawer
        anomaly={selectedAnomaly}
        isFlagged={selectedWorker ? investigationIds.has(selectedWorker.id) : false}
        isReleased={selectedWorker ? disbursedIds.has(selectedWorker.id) : false}
        viq={selectedViq}
        verificationLink={selectedWorker ? workerLinks[selectedWorker.id] : undefined}
        worker={selectedWorker}
        onApprove={approveWorker}
        onClose={() => setSelectedWorker(null)}
        onFlag={flagWorker}
        onGenerateLink={(worker) => generateWorkerLink(worker, false)}
        onSendLink={(worker) => generateWorkerLink(worker, true)}
      />

      <Modal
        centered
        opened={Boolean(exercisePendingDelete)}
        onClose={() => setExercisePendingDelete(null)}
        radius={18}
        size="lg"
        title={(
          <div className={styles.modalTitle}>
            <span>Delete verification exercise</span>
            <h2>{exercisePendingDelete?.name ?? "Verification exercise"}</h2>
          </div>
        )}
        classNames={{
          body: styles.modalBody,
          content: styles.modalContent,
          header: styles.modalHeader,
          title: styles.modalHeading,
        }}
        overlayProps={{ backgroundOpacity: 0.42, blur: 2 }}
      >
        <div className={styles.confirmDelete}>
          <p>
            This will remove the exercise, its worker link, and all submissions attached to it.
            Staff records and payroll verification history will remain untouched.
          </p>
          <div className={styles.confirmMeta}>
            <Metric label="Scope" value={exercisePendingDelete?.scope ?? "-"} />
            <Metric label="Documents" value={String(exercisePendingDelete?.documents.length ?? 0)} />
            <Metric label="Status" value={exercisePendingDelete?.status ?? "-"} />
          </div>
          <div className={styles.confirmActions}>
            <Button fullWidth variant="secondary" onClick={() => setExercisePendingDelete(null)}>
              Cancel
            </Button>
            <Button
              fullWidth
              loading={Boolean(exercisePendingDelete && loading === `exercise-delete-${exercisePendingDelete.id}`)}
              onClick={() => {
                if (exercisePendingDelete) void deleteExercise(exercisePendingDelete);
              }}
              variant="destructive"
            >
              Delete Exercise
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TopBar({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  return (
    <Paper className={styles.topbar} radius={18} shadow="xs" withBorder={false}>
      <TextInput
        className={styles.searchBox}
        leftSection={<Search size={20} strokeWidth={1.5} />}
        onChange={(event) => onQuery(event.currentTarget.value)}
        placeholder="Search staff, payroll batch, document, or VIQ"
        radius="xl"
        size="md"
        value={query}
      />
      <Group className={styles.operator} gap="sm" wrap="nowrap">
        <Avatar alt="Ogun State" radius="xl" size={42} src="/ogun-logo.png" />
        <div>
          <Text fw={900} size="sm">HR Payroll Desk</Text>
          <Text c="dimmed" size="sm">Ogun State Ministry of Education</Text>
        </div>
      </Group>
    </Paper>
  );
}

function PageHeader({
  activePage,
  onImport,
  onRunGate,
  onDisburse,
  importLoading,
  gateLoading,
  canRunGate,
  canDisburse,
}: {
  activePage: ConsolePage;
  onImport: () => void;
  onRunGate: () => void;
  onDisburse: () => void;
  importLoading: boolean;
  gateLoading: boolean;
  canRunGate: boolean;
  canDisburse: boolean;
}) {
  return (
    <Paper className={styles.header} component="header" radius={18} shadow="xs" withBorder={false}>
      <div className={styles.titleBlock}>
        <img alt="Ogun State Government" src="/ogun-logo.png" />
        <div>
          <p>Ogun State Ministry of Education</p>
          <h1>{pageTitle(activePage)}</h1>
        </div>
      </div>
      <div className={styles.actions}>
        <Button loading={importLoading} onClick={() => onImport()} variant="secondary">
          <FileSpreadsheet size={18} strokeWidth={1.5} />
          Refresh Staff Records
        </Button>
        <Button disabled={!canRunGate} loading={gateLoading} onClick={() => onRunGate()}>
          <Shield size={18} strokeWidth={1.5} />
          Run Verification
        </Button>
        <Button disabled={!canDisburse} onClick={() => onDisburse()} variant="secondary">
          <Banknote size={18} strokeWidth={1.5} />
          Release Eligible
        </Button>
      </div>
    </Paper>
  );
}

function DashboardView({
  exercises,
  workers,
  held,
  cleared,
  grossPayroll,
  heldPayroll,
  netEligible,
  onNavigate,
}: {
  exercises: VerificationExercise[];
  workers: Worker[];
  held: number;
  cleared: number;
  grossPayroll: number;
  heldPayroll: number;
  netEligible: number;
  onNavigate: (page: ConsolePage) => void;
}) {
  const publishedExercises = exercises.filter((exercise) => exercise.status === "PUBLISHED").length;
  const latestExercise = exercises[0];
  return (
    <>
      <section className={styles.heroGrid}>
        <Card className={styles.greenHero}>
          <span>Current payroll batch</span>
          <strong>{formatMoney(grossPayroll)}</strong>
          <p>{workers.length} records loaded, {cleared} eligible, {held} held for HR review.</p>
          <Button onClick={() => onNavigate("payroll")} variant="secondary">Open Payroll</Button>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Verification exercises</span>
          <strong>{exercises.length ? `${exercises.length} configured` : "Ready to create"}</strong>
          <p>
            {latestExercise
              ? `${publishedExercises} published. Latest: ${latestExercise.name}.`
              : "Create an annual staff verification exercise and publish the worker link."}
          </p>
          <Button onClick={() => onNavigate("exercises")}>Open Exercises</Button>
        </Card>
      </section>

      <StatsGrid
        total={workers.length}
        completeRecords={workers.length}
        verified={cleared}
        held={held}
        netPayable={formatMoney(netEligible)}
      />

      <section className={styles.commandStrip}>
        <Card className={styles.batchCard}>
          <Metric label="Gross payroll" value={formatMoney(grossPayroll)} />
          <Metric label="Held for review" value={formatMoney(heldPayroll)} />
          <Metric label="Eligible release" value={formatMoney(netEligible)} />
          <Metric label="Records loaded" value={String(workers.length)} />
        </Card>
      </section>
    </>
  );
}

function StaffRecordsView(props: {
  workers: Worker[];
  anomalies: AnomalyResult[];
  viqs: Record<string, Viq>;
  documentResults: Record<string, DocumentConsistencyResponse>;
  disbursedIds: Set<string>;
  investigationIds: Set<string>;
  selectedId?: string;
  filter: Filter;
  query: string;
  loading: string | null;
  pagination: PaginationState;
  onFilter: (filter: Filter) => void;
  onQuery: (value: string) => void;
  onSelect: (worker: Worker) => void;
  onVerify: (worker: Worker) => void;
  onBulkVerify: () => void;
}) {
  return (
    <section className={styles.pageStack}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Staff records and nominal roll</h2>
          <p>Each staff file contains salary, posting, bank, employment, documents, and verification status.</p>
        </div>
        <Button disabled={!props.workers.length} loading={props.loading?.startsWith("verify")} onClick={props.onBulkVerify}>
          <ClipboardCheck size={18} strokeWidth={1.5} />
          Verify Visible Staff
        </Button>
      </div>
      <Toolbar filter={props.filter} query={props.query} onFilter={props.onFilter} onQuery={props.onQuery} />
      <WorkerTable
        anomalies={props.anomalies}
        documentResults={props.documentResults}
        disbursedIds={props.disbursedIds}
        investigationIds={props.investigationIds}
        selectedId={props.selectedId}
        viqs={props.viqs}
        workers={props.workers}
        onSelect={props.onSelect}
        onVerify={props.onVerify}
      />
      <PaginationControls pagination={props.pagination} />
    </section>
  );
}

function PayrollView(props: {
  workers: Worker[];
  anomalies: AnomalyResult[];
  viqs: Record<string, Viq>;
  disbursedIds: Set<string>;
  investigationIds: Set<string>;
  documentResults: Record<string, DocumentConsistencyResponse>;
  selectedId?: string;
  grossPayroll: number;
  heldPayroll: number;
  netEligible: number;
  payrollStage: PayrollStage;
  pagination: PaginationState;
  onSelect: (worker: Worker) => void;
  onVerify: (worker: Worker) => void;
  onRunGate: () => void;
  onDisburse: () => void;
}) {
  return (
    <section className={styles.pageStack}>
      <div className={styles.payrollHeader}>
        <Metric label="Batch" value="Seeded payroll" />
        <Metric label="Gross payroll" value={formatMoney(props.grossPayroll)} />
        <Metric label="Held" value={formatMoney(props.heldPayroll)} />
        <Metric label="Eligible" value={formatMoney(props.netEligible)} />
        <Metric label="Status" value={props.payrollStage.replace("_", " ")} />
      </div>
      <div className={styles.sectionHead}>
        <div>
          <h2>Monthly payroll verification</h2>
          <p>Verify staff records individually or in bulk before disbursement.</p>
        </div>
        <div className={styles.actions}>
          <Button disabled={!props.workers.length} onClick={props.onRunGate}>Run Batch Verification</Button>
          <Button disabled={props.netEligible <= 0} onClick={props.onDisburse} variant="secondary">
            Disburse Eligible
          </Button>
        </div>
      </div>
      <WorkerTable
        anomalies={props.anomalies}
        documentResults={props.documentResults}
        disbursedIds={props.disbursedIds}
        investigationIds={props.investigationIds}
        selectedId={props.selectedId}
        viqs={props.viqs}
        workers={props.workers}
        onSelect={props.onSelect}
        onVerify={props.onVerify}
      />
      <PaginationControls pagination={props.pagination} />
    </section>
  );
}

function ExercisesView({
  exercises,
  editingExerciseId,
  exerciseName,
  exerciseScope,
  exerciseDeadline,
  exerciseContact,
  isDrawerOpen,
  publishLoading,
  saveLoading,
  selectedDocuments,
  selectedRules,
  onCloseDrawer,
  onDocumentToggle,
  onEdit,
  onDelete,
  onNameChange,
  onNew,
  onPublish,
  onRuleToggle,
  onSave,
  onDeadlineChange,
  onContactChange,
  onScopeChange,
}: {
  exercises: VerificationExercise[];
  editingExerciseId: string | null;
  exerciseName: string;
  exerciseScope: string;
  exerciseDeadline: string;
  exerciseContact: string;
  isDrawerOpen: boolean;
  publishLoading: boolean;
  saveLoading: boolean;
  selectedDocuments: Set<string>;
  selectedRules: Set<ExerciseRule>;
  onCloseDrawer: () => void;
  onDocumentToggle: (document: string) => void;
  onEdit: (exercise: VerificationExercise) => void;
  onDelete: (exercise: VerificationExercise) => void;
  onNameChange: (value: string) => void;
  onNew: () => void;
  onPublish: () => void;
  onRuleToggle: (rule: ExerciseRule) => void;
  onSave: () => void;
  onDeadlineChange: (value: string) => void;
  onContactChange: (value: string) => void;
  onScopeChange: (value: string) => void;
}) {
  const editingExercise = editingExerciseId
    ? exercises.find((exercise) => exercise.id === editingExerciseId) ?? null
    : null;

  async function copyLink(exercise: VerificationExercise) {
    if (!exercise.public_url) return;
    await navigator.clipboard?.writeText(exercisePublicUrl(exercise));
  }

  return (
    <section className={styles.pageStack}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Verification exercises</h2>
          <p>Create staff verification programmes, publish worker links, and track submissions.</p>
        </div>
        <Button onClick={onNew}>
          <Plus size={18} strokeWidth={1.5} />
          New Exercise
        </Button>
      </div>

      {exercises.length ? (
        <div className={styles.exerciseCards}>
          {exercises.map((exercise) => {
            const link = exercise.public_url ? exercisePublicUrl(exercise) : "";
            return (
              <Card className={styles.exerciseCard} key={exercise.id}>
                <div className={styles.exerciseCardHeader}>
                  <div>
                    <span className={styles.statusPill}>{exercise.status}</span>
                    <h2>{exercise.name}</h2>
                    <p>{exercise.scope}</p>
                  </div>
                  <Button size="small" variant="secondary" onClick={() => onEdit(exercise)}>
                    <Settings2 size={16} strokeWidth={1.5} />
                    Edit
                  </Button>
                </div>

                <div className={styles.exerciseStats}>
                  <Metric label="Documents" value={String(exercise.documents.length)} />
                  <Metric label="Rules" value={String(exercise.rules.length)} />
                  <Metric
                    label="Published"
                    value={exercise.published_at ? new Date(exercise.published_at).toLocaleDateString("en-NG") : "Not yet"}
                  />
                </div>

                <div className={styles.docList}>
                  {exercise.documents.slice(0, 4).map((document) => (
                    <span key={document}>
                      <FileText size={16} strokeWidth={1.5} />
                      {document}
                    </span>
                  ))}
                  {exercise.documents.length > 4 ? <span>+{exercise.documents.length - 4} more documents</span> : null}
                </div>

                <div className={styles.generatedLink}>
                  <span>Worker link</span>
                  {link ? (
                    <a className={styles.urlText} href={link} target="_blank" title={link}>
                      {link}
                    </a>
                  ) : (
                    <p>Publish this exercise to generate a worker-facing link.</p>
                  )}
                </div>

                <div className={styles.exerciseCardActions}>
                  {link ? (
                    <>
                      <Button size="small" variant="secondary" onClick={() => copyLink(exercise)}>
                        <Copy size={16} strokeWidth={1.5} />
                        Copy
                      </Button>
                      <a className={styles.linkButton} href={link} target="_blank">
                        <ExternalLink size={16} strokeWidth={1.5} />
                        Open link
                      </a>
                    </>
                  ) : null}
                  <Button size="small" variant="destructive" onClick={() => onDelete(exercise)}>
                    Delete
                  </Button>
                  <Button
                    size="small"
                    loading={publishLoading && editingExerciseId === exercise.id}
                    onClick={() => {
                      onEdit(exercise);
                      window.setTimeout(onPublish, 0);
                    }}
                  >
                    <Link2 size={16} strokeWidth={1.5} />
                    {exercise.public_url ? "Republish" : "Publish"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className={styles.emptyState}>
          <CalendarCheck size={40} strokeWidth={1.5} />
          <h2>No verification exercise yet</h2>
          <p>
            Start by creating the June 2026 staff verification exercise, choosing the documents HR needs,
            and publishing a worker link.
          </p>
          <Button onClick={onNew}>Create Exercise</Button>
        </Card>
      )}

      <Drawer
        opened={isDrawerOpen}
        onClose={onCloseDrawer}
        position="right"
        size="min(1040px, 100vw)"
        title={(
          <div className={styles.drawerTitle}>
            <span>{editingExercise ? "Edit verification exercise" : "New verification exercise"}</span>
            <h2>{exerciseName || "Verification exercise"}</h2>
          </div>
        )}
        classNames={{
          body: styles.mantineDrawerBody,
          close: styles.mantineDrawerClose,
          content: styles.mantineDrawerContent,
          header: styles.mantineDrawerHeader,
          title: styles.mantineDrawerTitle,
        }}
        overlayProps={{ backgroundOpacity: 0.28, blur: 1 }}
        radius={0}
        trapFocus
        withinPortal
      >
        <div className={styles.exerciseDrawerBody}>
          <section className={styles.builderHero}>
            <div>
              <span>Programme builder</span>
              <h2>Configure the staff verification exercise HR will publish</h2>
              <p>
                Choose the staff scope, required documents, and checks. The worker link will guide staff
                through identity, documents, proof of life, and final submission.
              </p>
            </div>
            <div className={styles.builderSummary}>
              <Metric label="Checks" value={String(selectedRules.size)} />
              <Metric label="Documents" value={String(selectedDocuments.size)} />
              <Metric label="Status" value={editingExercise?.status ?? "Draft"} />
            </div>
          </section>

          <div className={styles.builderLayout}>
            <div className={styles.builderMain}>
              <Card className={styles.builderStep}>
                <div className={styles.stepMarker}>
                  <span>1</span>
                  <div>
                    <h2>Programme details</h2>
                    <p>Define who this exercise applies to and when HR expects completion.</p>
                  </div>
                </div>
                <div className={styles.formGrid}>
                  <TextInput
                    label="Exercise name"
                    onChange={(event) => onNameChange(event.currentTarget.value)}
                    radius={8}
                    size="md"
                    value={exerciseName}
                  />
                  <Select
                    allowDeselect={false}
                    data={["All ministry staff", "Teaching staff only", "Non-teaching staff only", "Selected departments"]}
                    label="Staff scope"
                    onChange={(value) => onScopeChange(value ?? "All ministry staff")}
                    radius={8}
                    size="md"
                    value={exerciseScope}
                  />
                  <TextInput
                    label="Deadline"
                    onChange={(event) => onDeadlineChange(event.currentTarget.value)}
                    radius={8}
                    size="md"
                    type="date"
                    value={exerciseDeadline}
                  />
                  <TextInput
                    label="HR contact"
                    onChange={(event) => onContactChange(event.currentTarget.value)}
                    radius={8}
                    size="md"
                    value={exerciseContact}
                  />
                </div>
              </Card>

              <Card className={styles.builderStep}>
                <div className={styles.stepMarker}>
                  <span>2</span>
                  <div>
                    <h2>Verification checks</h2>
                    <p>Select the checks that decide whether a staff submission passes or needs review.</p>
                  </div>
                </div>
                <div className={styles.ruleGrid}>
                  {verificationRules.map((rule) => (
                    <button
                      className={selectedRules.has(rule.key) ? styles.ruleActive : ""}
                      key={rule.key}
                      onClick={() => onRuleToggle(rule.key)}
                      type="button"
                    >
                      <span className={styles.ruleBadge}>{rule.badge}</span>
                      <strong>{rule.label}</strong>
                      <span>{rule.detail}</span>
                    </button>
                  ))}
                </div>
              </Card>

              <Card className={styles.builderStep}>
                <div className={styles.stepMarker}>
                  <span>3</span>
                  <div>
                    <h2>Documents to collect</h2>
                    <p>Pick the documents staff must upload and the fields HR expects Lattice to compare.</p>
                  </div>
                </div>
                <div className={styles.documentBuilderList}>
                  {exerciseDocuments.map((document) => {
                    const active = selectedDocuments.has(document.label);
                    return (
                      <button
                        className={active ? styles.documentActive : ""}
                        key={document.label}
                        onClick={() => onDocumentToggle(document.label)}
                        type="button"
                      >
                        <span className={styles.documentIcon}>
                          {active ? <ShieldCheck size={20} strokeWidth={1.7} /> : <UploadCloud size={20} strokeWidth={1.7} />}
                        </span>
                        <span>
                          <strong>{document.label}</strong>
                          <small>{document.fields}</small>
                        </span>
                        <em>{document.types}</em>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            <aside className={styles.builderAside}>
              <Card className={styles.phonePreview}>
                <div className={styles.previewTop}>
                  <Smartphone size={22} strokeWidth={1.7} />
                  <span>Worker link preview</span>
                </div>
                <h3>{exerciseName || "Verification exercise"}</h3>
                <p>{exerciseScope}</p>
                <div className={styles.previewSteps}>
                  <span><IdCard size={16} /> Identity match</span>
                  <span><FileText size={16} /> {selectedDocuments.size} documents</span>
                  <span><Fingerprint size={16} /> {selectedRules.has("biometric_match") ? "Biometric match" : "No biometric"}</span>
                  <span><Eye size={16} /> {selectedRules.has("proof_of_life") ? "Proof of life" : "No liveness"}</span>
                  <span><ClipboardCheck size={16} /> Submit to HR</span>
                </div>
              </Card>

              <div className={styles.generatedLink}>
                <span>Publish status</span>
                <strong>{editingExercise?.status ?? "Draft ready"}</strong>
                {editingExercise?.public_url ? (
                <a
                  className={styles.urlText}
                  href={exercisePublicUrl(editingExercise)}
                  target="_blank"
                  title={exercisePublicUrl(editingExercise)}
                >
                  {exercisePublicUrl(editingExercise)}
                </a>
                ) : (
                  <p>Save and publish to generate the worker-facing link.</p>
                )}
              </div>
            </aside>
          </div>

          <div className={styles.drawerFooter}>
              <Button loading={saveLoading} onClick={onSave} variant="secondary">
                Save Draft
              </Button>
              <Button loading={publishLoading} onClick={onPublish}>
                Publish Link
              </Button>
          </div>
        </div>
      </Drawer>

    </section>
  );
}

function SubmissionsView({
  exerciseSubmissions,
  workers,
  viqs,
  documentResults,
}: {
  exerciseSubmissions: ExerciseSubmission[];
  workers: Worker[];
  viqs: Record<string, Viq>;
  documentResults: Record<string, DocumentConsistencyResponse>;
}) {
  if (exerciseSubmissions.length) {
    return (
      <DataTable
        columns={["Staff", "Documents", "Liveness", "Decision"]}
        rows={exerciseSubmissions.map((submission) => [
          `${submission.worker_code ?? "Unmatched"} - ${submission.full_name}`,
          humanizeStatus(submission.document_status ?? "NOT_CHECKED"),
          humanizeStatus(submission.liveness_status ?? "NOT_CHECKED"),
          submission.decision,
        ])}
      />
    );
  }

  const submittedWorkers = workers.filter((worker) => viqs[worker.id] || documentResults[worker.id]);
  if (!submittedWorkers.length) {
    return (
      <EmptyState
        title="No staff submissions yet"
        body="Worker verification submissions and completed staff checks will be listed here."
      />
    );
  }

  return (
    <DataTable
      columns={["Staff", "Documents", "Decision", "Verification ID"]}
      rows={submittedWorkers.map((worker) => [
        `${worker.worker_code} - ${worker.full_name}`,
        humanizeStatus(documentResults[worker.id]?.status ?? "NOT_CHECKED"),
        viqs[worker.id]?.verdict ?? "Not finalized",
        viqs[worker.id]?.id ?? "Not generated",
      ])}
    />
  );
}

function DisbursementsView({
  workers,
  viqs,
  disbursedIds,
  investigationIds,
}: {
  workers: Worker[];
  viqs: Record<string, Viq>;
  disbursedIds: Set<string>;
  investigationIds: Set<string>;
}) {
  return (
    <DataTable
      columns={["Staff", "Amount", "Bank details", "Verification decision", "Payment status", "Squad reference"]}
      rows={workers.map((worker) => [
        `${worker.worker_code} - ${worker.full_name}`,
        formatMoney(Number(worker.salary_amount)),
        worker.bank_account_number ?? "Pending account resolution",
        viqs[worker.id]?.verdict ?? "Awaiting verification",
        investigationIds.has(worker.id)
          ? "Flagged for investigation"
          : disbursedIds.has(worker.id)
            ? "Released"
            : "Not released",
        viqs[worker.id]?.squad_transaction_reference ?? "Not generated",
      ])}
    />
  );
}

function DocumentsView({
  workers,
  documentResults,
}: {
  workers: Worker[];
  documentResults: Record<string, DocumentConsistencyResponse>;
}) {
  const checkedWorkers = workers.filter((worker) => documentResults[worker.id]);
  if (!checkedWorkers.length) {
    return (
      <EmptyState
        title="No document checks yet"
        body="Run Verify on a staff record to store document consistency results here."
      />
    );
  }

  return (
    <DataTable
      columns={["Staff", "Document status", "Severity", "Flags"]}
      rows={checkedWorkers.map((worker) => [
        `${worker.worker_code} - ${worker.full_name}`,
        humanizeStatus(documentResults[worker.id].status),
        documentResults[worker.id].severity,
        String(documentResults[worker.id].flags.length),
      ])}
    />
  );
}

function ReportsView({
  adminSummary,
  workers,
  held,
  netEligible,
}: {
  adminSummary: AdminSummary | null;
  workers: Worker[];
  held: number;
  netEligible: number;
}) {
  if (adminSummary) {
    return (
      <DataTable
        columns={["Metric", "Value"]}
        rows={[
          ["Workers", String(adminSummary.workers)],
          ["VIQs generated", String(adminSummary.viqs)],
          ["Passed", String(adminSummary.pass_count)],
          ["Under review", String(adminSummary.review_count)],
          ["Failed", String(adminSummary.fail_count)],
          ["Approved releases", String(adminSummary.approved_count)],
          ["Flagged investigations", String(adminSummary.flagged_count)],
          ["Gross payroll", formatMoney(Number(adminSummary.gross_payroll))],
          ["Eligible payroll", formatMoney(Number(adminSummary.eligible_payroll))],
          ["Held payroll", formatMoney(Number(adminSummary.held_payroll))],
        ]}
      />
    );
  }

  return (
    <EmptyState
      title="Reports loading"
      body={`Current loaded state: ${workers.length} staff records, ${held} held, ${formatMoney(netEligible)} eligible.`}
    />
  );
}

function SettingsView() {
  const [readiness, setReadiness] = useState<IntegrationReadinessResponse | null>(null);
  const [billingAccount, setBillingAccount] = useState<BillingAccount | null>(null);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      latticeApi.integrationReadiness(),
      latticeApi.billingAccount(),
      latticeApi.listCreditPurchases(),
      latticeApi.listCreditLedger(),
    ])
      .then(([readinessResult, accountResult, purchaseResult, ledgerResult]) => {
        if (!alive) return;
        setReadiness(readinessResult);
        setBillingAccount(accountResult);
        setPurchases(purchaseResult);
        setLedger(ledgerResult);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Settings check failed");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className={styles.pageStack}>
      <Card className={styles.billingHero}>
        <div>
          <span>Lattice account</span>
          <h2>Verification credit wallet</h2>
          <p>
            This HR workspace consumes Lattice verification credits through its API key. Purchases are
            managed on the Lattice SDK page so payroll stays focused on staff operations.
          </p>
        </div>
        <div className={styles.creditBalance}>
          <span>Available balance</span>
          <strong>{billingAccount?.credit_balance ?? "..."}</strong>
          <small>API key ending {billingAccount?.api_key_last4 ?? "...."}</small>
        </div>
      </Card>
      <Card className={styles.formCard}>
        <h2>Credit purchase</h2>
        <p>Buy credits from the Lattice SDK page beside the API key and developer setup.</p>
        {error ? <p className={styles.inlineError}>{error}</p> : null}
        <Button onClick={() => window.open("https://lattice-peach.vercel.app/get-started", "_blank", "noopener,noreferrer")}>
          Open Lattice credits
        </Button>
      </Card>
      <Card className={styles.formCard}>
        <h2>Ministry profile</h2>
        <p>Ogun State Ministry of Education payroll verification workspace.</p>
        <div className={styles.profileGrid}>
          <Metric label="Payroll mode" value="Verification gated" />
          <Metric label="Worker channel" value="Published exercise links" />
          <Metric label="Review path" value="HR investigation queue" />
        </div>
      </Card>
      <Card className={styles.formCard}>
        <h2>Verification policy</h2>
        <p>Current release rule: only staff with PASS decisions and no investigation flag can be approved for salary release.</p>
        <div className={styles.profileGrid}>
          <Metric label="Pass threshold" value="80+" />
          <Metric label="Review range" value="50-79" />
          <Metric label="Hard block" value="Failed life/media checks" />
        </div>
      </Card>
      <div className={styles.billingGrid}>
        <Card className={styles.formCard}>
          <h2>Recent purchases</h2>
          {purchases.length ? (
            <DataTable
              columns={["Credits", "Amount", "Status", "Reference"]}
              rows={purchases.slice(0, 5).map((purchase) => [
                String(purchase.credits),
                formatMoney(Number(purchase.amount_naira)),
                purchase.status,
                purchase.transaction_reference,
              ])}
            />
          ) : (
            <p>No credit purchase yet.</p>
          )}
        </Card>
        <Card className={styles.formCard}>
          <h2>Credit ledger</h2>
          {ledger.length ? (
            <DataTable
              columns={["Change", "Balance", "Reason", "When"]}
              rows={ledger.slice(0, 5).map((entry) => [
                entry.delta > 0 ? `+${entry.delta}` : String(entry.delta),
                String(entry.balance_after),
                entry.reason.replaceAll("_", " "),
                new Date(entry.created_at).toLocaleString(),
              ])}
            />
          ) : (
            <p>No credit usage yet.</p>
          )}
        </Card>
      </div>
      <Card className={styles.formCard}>
        <h2>Integration readiness</h2>
        <p>Production endpoints and payment rails required for the demo flow.</p>
        <div className={styles.profileGrid}>
          <Metric label="Backend" value={readiness?.public_backend_url ?? "Checking..."} />
          <Metric label="Worker app" value={readiness?.worker_verification_base_url ?? "Checking..."} />
          <Metric label="Webhook" value={readiness?.squad_webhook_url ?? "Checking..."} />
          <Metric label="Squad" value={readiness?.status ?? "Checking..."} />
        </div>
      </Card>
    </section>
  );
}

function Toolbar({
  filter,
  query,
  onFilter,
  onQuery,
}: {
  filter: Filter;
  query: string;
  onFilter: (filter: Filter) => void;
  onQuery: (value: string) => void;
}) {
  return (
    <div className={styles.tableHeader}>
      <SegmentedControl
        color="green"
        data={["ALL", "PASS", "REVIEW", "FAIL"]}
        onChange={(value) => onFilter(value as Filter)}
        radius="xl"
        size="md"
        value={filter}
      />
      <TextInput
        className={styles.search}
        leftSection={<Search size={18} strokeWidth={1.5} />}
        onChange={(event) => onQuery(event.currentTarget.value)}
        placeholder="Search staff record"
        radius="xl"
        size="md"
        value={query}
      />
    </div>
  );
}

function PaginationControls({ pagination }: { pagination: PaginationState }) {
  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.total, pagination.page * pagination.pageSize);
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <div className={styles.pagination}>
      <span>
        Showing {start}-{end} of {pagination.total} staff
      </span>
      <div>
        <Button
          disabled={pagination.page <= 1}
          onClick={() => pagination.onPageChange(pagination.page - 1)}
          size="small"
          variant="secondary"
        >
          Previous
        </Button>
        <strong>
          Page {pagination.page} of {pageCount}
        </strong>
        <Button
          disabled={pagination.page >= pageCount}
          onClick={() => pagination.onPageChange(pagination.page + 1)}
          size="small"
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className={styles.emptyState}>
      <h2>{title}</h2>
      <p>{body}</p>
    </Card>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.simpleTable}>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${row[0]}-${cellIndex}`}>{cell}</td>)}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length}>No records loaded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function pageTitle(page: ConsolePage) {
  const titles: Record<ConsolePage, string> = {
    dashboard: "Dashboard",
    staff: "Staff Records",
    payroll: "Payroll",
    exercises: "Verification Exercises",
    submissions: "Submissions",
    disbursements: "Disbursements",
    documents: "Documents",
    reports: "Reports & Audit",
    settings: "Settings",
  };
  return titles[page];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function humanizeStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function documentEvidence(documents: DocumentConsistencyResponse) {
  return {
    status: documents.status,
    severity: documents.severity,
    flags: documents.flags,
    summary: documents.summary,
  };
}

function absoluteExerciseUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${env.publicAppUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function exercisePublicUrl(exercise: VerificationExercise) {
  const path = exercise.public_url ?? `/verify/exercise/${exercise.public_token ?? exercise.id}`;
  const url = new URL(absoluteExerciseUrl(path));
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    url.searchParams.set("api", "local");
  }
  return url.toString();
}

function documentResultsFromActions(actions: StaffAction[]) {
  const results: Record<string, DocumentConsistencyResponse> = {};
  const ordered = [...actions].reverse();
  for (const action of ordered) {
    if (action.action_type !== "DOCUMENT_CHECK") continue;
    const payload = action.payload;
    if (
      payload.status === "DOCUMENTS_CLEAN" ||
      payload.status === "DOCUMENT_INCONSISTENCY"
    ) {
      results[action.worker_id] = {
        status: payload.status,
        severity: payload.severity === "NONE" || payload.severity === "LOW" || payload.severity === "MEDIUM" || payload.severity === "HIGH"
          ? payload.severity
          : "NONE",
        flags: Array.isArray(payload.flags) ? payload.flags as DocumentConsistencyResponse["flags"] : [],
        summary: typeof payload.summary === "string" ? payload.summary : "",
      };
    }
  }
  return results;
}

function objectValue(value: unknown): Record<string, Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Record<string, unknown>>;
}

function sortWorkers(records: Worker[]) {
  return [...records].sort((left, right) => {
    const leftRank = left.risk_metadata?.demo_verifiable ? 0 : 1;
    const rightRank = right.risk_metadata?.demo_verifiable ? 0 : 1;
    return leftRank - rightRank || left.worker_code.localeCompare(right.worker_code);
  });
}

function latestViqsByWorker(records: Viq[]) {
  const byWorker: Record<string, Viq> = {};
  for (const viq of records) {
    const current = byWorker[viq.worker_id];
    const nextCreatedAt = typeof viq.signed_payload.created_at === "string" ? viq.signed_payload.created_at : "";
    const currentCreatedAt =
      current && typeof current.signed_payload.created_at === "string"
        ? current.signed_payload.created_at
        : "";
    if (!current || new Date(nextCreatedAt).getTime() >= new Date(currentCreatedAt).getTime()) {
      byWorker[viq.worker_id] = viq;
    }
  }
  return byWorker;
}

function namesLookRelated(left: string, right: string) {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  const overlap = rightTokens.filter((token) => leftTokens.includes(token)).length;
  return overlap >= Math.min(2, rightTokens.length);
}

function nameTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function maskAccount(value: string) {
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

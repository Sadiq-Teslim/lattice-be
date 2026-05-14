"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  ClipboardCheck,
  FileSpreadsheet,
  Search,
  Shield,
} from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import { env } from "@/shared/config/env";
import type {
  AnomalyResult,
  AnomalyScanResponse,
  AdminSummary,
  DemoSeedResponse,
  DocumentConsistencyResponse,
  ExerciseSubmission,
  StaffAction,
  VerificationExercise,
  Viq,
  Worker,
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
  | "proof_of_life"
  | "identity_bvn"
  | "document_consistency"
  | "payroll_anomaly"
  | "media_authenticity";

const PAGE_SIZE = 12;
const verificationRules: Array<{ key: ExerciseRule; label: string; detail: string }> = [
  {
    key: "proof_of_life",
    label: "Proof of life",
    detail: "Worker completes a camera liveness challenge before HR accepts the submission.",
  },
  {
    key: "identity_bvn",
    label: "Identity and BVN",
    detail: "Worker identity evidence is checked against payroll and BVN/account records.",
  },
  {
    key: "document_consistency",
    label: "Document consistency",
    detail: "Dates and personnel file fields are compared for contradictions.",
  },
  {
    key: "payroll_anomaly",
    label: "Payroll anomaly",
    detail: "Shared devices, BVNs, IPs, and location clusters are scanned across the cohort.",
  },
  {
    key: "media_authenticity",
    label: "Media authenticity",
    detail: "Captured face evidence is checked for synthetic-media risk when provided.",
  },
];
const exerciseDocuments = [
  "Appointment letter",
  "Birth certificate / declaration of age",
  "Last promotion letter",
  "Posting letter",
  "Staff ID card",
  "BVN identity record",
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
  const [selectedExerciseRules, setSelectedExerciseRules] = useState<Set<ExerciseRule>>(
    new Set(["proof_of_life", "identity_bvn", "document_consistency", "payroll_anomaly"]),
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
  const batchStatus =
    payrollStage === "DISBURSED"
      ? "Eligible salaries released"
      : payrollStage === "LATTICE_READY"
        ? "Verification completed"
        : payrollStage === "IMPORTED"
          ? "Staff records loaded"
          : "Loading staff records";

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
    if (!currentExercise) return;
    setExerciseName(currentExercise.name);
    setExerciseScope(currentExercise.scope);
    setSelectedExerciseRules(new Set(currentExercise.rules as ExerciseRule[]));
    setSelectedDocuments(new Set(currentExercise.documents));
  }, [exercises]);

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
    const result = await runAction("seed", latticeApi.seedPayroll);
    if (!result) return;
    setSeed(result);
    setAnomalyScan(null);
    setViqs({});
    setDocumentResults({});
    setStaffActions([]);
    setExercises([]);
    setExerciseSubmissions([]);
    setAdminSummary(null);
    setDisbursedIds(new Set());
    setInvestigationIds(new Set());
    setPayrollStage("IMPORTED");
    const listedWorkers = await runAction("workers", () => latticeApi.listWorkers(result.ministry));
    if (listedWorkers) {
      setWorkers(listedWorkers);
      setSelectedWorker(null);
      await hydrateBackendState(result.ministry, result.pay_cycle_id, { skipWorkers: true });
      if (options.navigate ?? true) {
        setActivePage("staff");
      }
    }
  }

  async function loadInitialBatch() {
    const cycles = await runAction("pay-cycles", latticeApi.listPayCycles);
    const existing = cycles?.find((cycle) =>
      cycle.ministry.startsWith("Ogun State Ministry of Education Demo"),
    );
    if (existing) {
      const batch = {
        pay_cycle_id: existing.id,
        ministry: existing.ministry,
        workers_inserted: 0,
        injected_ghost_workers: 0,
      };
      setSeed(batch);
      setPayrollStage("IMPORTED");
      await hydrateBackendState(existing.ministry, existing.id);
      return;
    }
    await importNominalRoll({ navigate: false });
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
    setViqs(Object.fromEntries(listedViqs.map((viq) => [viq.worker_id, viq])));
    applyStaffActions(listedActions);
    setExercises(listedExercises);
    setAdminSummary(summary);
    if (listedExercises[0]) {
      const submissions = await latticeApi.listExerciseSubmissions(listedExercises[0].id);
      setExerciseSubmissions(submissions);
    }
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
      latticeApi.releaseEligible({ pay_cycle_id: seed.pay_cycle_id }),
    );
    if (result) {
      setStaffActions((current) => [...result.released, ...current]);
      setDisbursedIds((current) => {
        const next = new Set(current);
        result.released.forEach((item) => next.add(item.worker_id));
        return next;
      });
      setPayrollStage("DISBURSED");
      await hydrateBackendState(seed.ministry, seed.pay_cycle_id, { skipWorkers: true });
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
    const existing = exercises[0];
    const exercise = await runAction("exercise-save", () =>
      existing
        ? latticeApi.updateVerificationExercise(existing.id, payload)
        : latticeApi.createVerificationExercise(payload),
    );
    if (exercise) {
      setExercises((current) => [exercise, ...current.filter((item) => item.id !== exercise.id)]);
      const submissions = await latticeApi.listExerciseSubmissions(exercise.id);
      setExerciseSubmissions(submissions);
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
      const existing = exercises[0];
      const draft = existing
        ? await latticeApi.updateVerificationExercise(existing.id, payload)
        : await latticeApi.createVerificationExercise(payload);
      return latticeApi.publishVerificationExercise(draft.id);
    });
    if (saved) {
      setExercises((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    }
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
        <PageHeader
          activePage={activePage}
          batchStatus={batchStatus}
          onImport={importNominalRoll}
          onRunGate={runLatticeGate}
          onDisburse={disburseEligible}
          importLoading={loading === "seed" || loading === "workers"}
          gateLoading={loading === "anomaly"}
          canRunGate={Boolean(seed) && workers.length > 0}
          canDisburse={cleared > 0 && payrollStage === "LATTICE_READY"}
        />

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
            publishLoading={loading === "exercise-publish"}
            saveLoading={loading === "exercise-save"}
            selectedDocuments={selectedDocuments}
            selectedRules={selectedExerciseRules}
            onDocumentToggle={toggleExerciseDocument}
            onNameChange={setExerciseName}
            onPublish={publishExercise}
            onRuleToggle={toggleExerciseRule}
            onSave={saveExercise}
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
        worker={selectedWorker}
        onApprove={approveWorker}
        onClose={() => setSelectedWorker(null)}
        onFlag={flagWorker}
      />
    </div>
  );
}

function TopBar({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  return (
    <div className={styles.topbar}>
      <label className={styles.searchBox}>
        <Search size={20} strokeWidth={1.5} />
        <input
          placeholder="Search staff, payroll batch, document, or VIQ"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className={styles.operator}>
        <img alt="Ogun State" src="/ogun-logo.png" />
        <div>
          <strong>HR Payroll Desk</strong>
          <span>Ogun State Ministry of Education</span>
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  activePage,
  batchStatus,
  onImport,
  onRunGate,
  onDisburse,
  importLoading,
  gateLoading,
  canRunGate,
  canDisburse,
}: {
  activePage: ConsolePage;
  batchStatus: string;
  onImport: () => void;
  onRunGate: () => void;
  onDisburse: () => void;
  importLoading: boolean;
  gateLoading: boolean;
  canRunGate: boolean;
  canDisburse: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <img alt="Ogun State Government" src="/ogun-logo.png" />
        <div>
          <p>Ogun State Ministry of Education</p>
          <h1>{pageTitle(activePage)}</h1>
          <span>{batchStatus}</span>
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
    </header>
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
  exerciseName,
  exerciseScope,
  publishLoading,
  saveLoading,
  selectedDocuments,
  selectedRules,
  onDocumentToggle,
  onNameChange,
  onPublish,
  onRuleToggle,
  onSave,
  onScopeChange,
}: {
  exercises: VerificationExercise[];
  exerciseName: string;
  exerciseScope: string;
  publishLoading: boolean;
  saveLoading: boolean;
  selectedDocuments: Set<string>;
  selectedRules: Set<ExerciseRule>;
  onDocumentToggle: (document: string) => void;
  onNameChange: (value: string) => void;
  onPublish: () => void;
  onRuleToggle: (rule: ExerciseRule) => void;
  onSave: () => void;
  onScopeChange: (value: string) => void;
}) {
  const currentExercise = exercises[0];
  return (
    <section className={styles.pageStack}>
      <div className={styles.exerciseGrid}>
        <Card className={styles.formCard}>
          <h2>Create verification exercise</h2>
          <p>
            Configure the exercise HR wants to publish to staff, then generate the worker link.
          </p>
          <label>
            Exercise name
            <input value={exerciseName} onChange={(event) => onNameChange(event.target.value)} />
          </label>
          <label>
            Staff scope
            <select value={exerciseScope} onChange={(event) => onScopeChange(event.target.value)}>
              <option>All ministry staff</option>
              <option>Teaching staff only</option>
              <option>Non-teaching staff only</option>
              <option>Selected departments</option>
            </select>
          </label>
          <div className={styles.generatedLink}>
            <span>Publish status</span>
            <strong>{currentExercise?.status ?? "Draft ready"}</strong>
            {currentExercise?.public_url ? (
              <a href={absoluteExerciseUrl(currentExercise.public_url)} target="_blank">
                {absoluteExerciseUrl(currentExercise.public_url)}
              </a>
            ) : (
              <p>Save and publish to generate a worker-facing link.</p>
            )}
          </div>
          <div className={styles.actions}>
            <Button loading={saveLoading} onClick={onSave} variant="secondary">
              Save Exercise
            </Button>
            <Button loading={publishLoading} onClick={onPublish}>
              Publish Link
            </Button>
          </div>
        </Card>

        <Card className={styles.formCard}>
          <h2>Documents to collect</h2>
          <div className={styles.checkGrid}>
            {exerciseDocuments.map((document) => (
              <button
                className={selectedDocuments.has(document) ? styles.checkActive : ""}
                key={document}
                onClick={() => onDocumentToggle(document)}
                type="button"
              >
                {document}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className={styles.formCard}>
        <h2>Verification rules</h2>
        <p>These rules define what the exercise checks when the worker submits evidence.</p>
        <div className={styles.ruleGrid}>
          {verificationRules.map((rule) => (
            <button
              className={selectedRules.has(rule.key) ? styles.ruleActive : ""}
              key={rule.key}
              onClick={() => onRuleToggle(rule.key)}
              type="button"
            >
              <strong>{rule.label}</strong>
              <span>{rule.detail}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className={styles.capabilityCard}>
        <h2>Existing exercises</h2>
        {exercises.length ? (
          <DataTable
            columns={["Exercise", "Scope", "Status", "Worker link"]}
            rows={exercises.map((exercise) => [
              exercise.name,
              exercise.scope,
              exercise.status,
              exercise.public_url ? absoluteExerciseUrl(exercise.public_url) : "Draft",
            ])}
          />
        ) : (
          <p>No exercise has been saved yet.</p>
        )}
      </Card>

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
  return (
    <section className={styles.pageStack}>
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
      <div className={styles.tabs}>
        {(["ALL", "PASS", "REVIEW", "FAIL"] as const).map((item) => (
          <button
            className={filter === item ? styles.activeTab : ""}
            key={item}
            onClick={() => onFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <label className={styles.search}>
        <Search size={18} strokeWidth={1.5} />
        <input
          placeholder="Search staff record"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
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

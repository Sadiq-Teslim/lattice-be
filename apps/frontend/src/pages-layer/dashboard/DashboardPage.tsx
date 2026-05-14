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
import type {
  AnomalyResult,
  AnomalyScanResponse,
  BiasAuditResponse,
  DemoSeedResponse,
  DocumentConsistencyResponse,
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

const PAGE_SIZE = 12;

export function DashboardPage() {
  const autoSeedStarted = useRef(false);
  const [activePage, setActivePage] = useState<ConsolePage>("dashboard");
  const [seed, setSeed] = useState<DemoSeedResponse | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [anomalyScan, setAnomalyScan] = useState<AnomalyScanResponse | null>(null);
  const [viqs, setViqs] = useState<Record<string, Viq>>({});
  const [documentResults, setDocumentResults] = useState<Record<string, DocumentConsistencyResponse>>({});
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [biasAudit, setBiasAudit] = useState<BiasAuditResponse | null>(null);
  const [payrollStage, setPayrollStage] = useState<PayrollStage>("EMPTY");
  const [disbursedIds, setDisbursedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const review = workers.filter((worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    return viq?.verdict === "REVIEW" || anomaly?.flagged;
  }).length;
  const held = review + blocked;
  const cleared = workers.filter((worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    return viq?.verdict === "PASS" && !anomaly?.flagged;
  }).length;
  const grossPayroll = workers.reduce((sum, worker) => sum + Number(worker.salary_amount || 0), 0);
  const heldPayroll = workers.reduce((sum, worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const shouldHold = viq?.verdict === "REVIEW" || viq?.verdict === "FAIL" || anomaly?.flagged;
    return shouldHold ? sum + Number(worker.salary_amount || 0) : sum;
  }, 0);
  const netEligible = workers.reduce((sum, worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const eligible = viq?.verdict === "PASS" && !anomaly?.flagged;
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
    void importNominalRoll({ navigate: false });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, query, activePage]);

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
    setDisbursedIds(new Set());
    setPayrollStage("IMPORTED");
    const listedWorkers = await runAction("workers", () => latticeApi.listWorkers(result.ministry));
    if (listedWorkers) {
      setWorkers(listedWorkers);
      setSelectedWorker(null);
      if (options.navigate ?? true) {
        setActivePage("staff");
      }
    }
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
      const viqResult = await latticeApi.verifyAndDisburse(worker.id, seed.pay_cycle_id, {
        documents: {
          status: documents.status,
          severity: documents.severity,
          flags: documents.flags,
          summary: documents.summary,
        },
      });
      return { documents, viqResult };
    });
    if (result) {
      setDocumentResults((current) => ({ ...current, [worker.id]: result.documents }));
      setViqs((current) => ({ ...current, [worker.id]: result.viqResult.viq }));
      setSelectedWorker(worker);
    }
  }

  async function verifyAllEligible() {
    const candidates = paginatedWorkers;
    for (const worker of candidates) {
      await verifyWorker(worker);
    }
  }

  async function runBiasAudit() {
    const result = await runAction("bias", latticeApi.runBiasAudit);
    if (result) setBiasAudit(result);
  }

  function disburseEligible() {
    const eligibleIds = workers
      .filter((worker) => {
        const viq = viqs[worker.id];
        const anomaly = anomalyByCode.get(worker.worker_code);
        return !anomaly?.flagged && viq?.verdict === "PASS";
      })
      .map((worker) => worker.id);
    setDisbursedIds(new Set(eligibleIds));
    setPayrollStage("DISBURSED");
  }

  const selectedAnomaly = selectedWorker
    ? anomalyByCode.get(selectedWorker.worker_code)
    : undefined;
  const selectedViq = selectedWorker ? viqs[selectedWorker.id] : undefined;

  return (
    <div className={styles.shell}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.main}>
        <TopBar />
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
          <ExercisesView />
        ) : null}

        {activePage === "checks" ? (
          <VerificationRulesView
            biasAudit={biasAudit}
            loading={loading === "bias"}
            onBiasAudit={runBiasAudit}
          />
        ) : null}

        {activePage === "submissions" ? (
          <SubmissionsView workers={workers} viqs={viqs} documentResults={documentResults} />
        ) : null}

        {activePage === "disbursements" ? (
          <DisbursementsView workers={workers} viqs={viqs} disbursedIds={disbursedIds} />
        ) : null}

        {activePage === "documents" ? (
          <DocumentsView workers={workers} documentResults={documentResults} />
        ) : null}

        {activePage === "reports" ? (
          <ReportsView workers={workers} held={held} netEligible={netEligible} />
        ) : null}

        {activePage === "settings" ? <SettingsView /> : null}
      </main>

      <WorkerDetailDrawer
        anomaly={selectedAnomaly}
        viq={selectedViq}
        worker={selectedWorker}
        onClose={() => setSelectedWorker(null)}
      />
    </div>
  );
}

function TopBar() {
  return (
    <div className={styles.topbar}>
      <label className={styles.searchBox}>
        <Search size={20} strokeWidth={1.5} />
        <input placeholder="Search staff, payroll batch, document, or VIQ" />
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
  workers,
  held,
  cleared,
  grossPayroll,
  heldPayroll,
  netEligible,
  onNavigate,
}: {
  workers: Worker[];
  held: number;
  cleared: number;
  grossPayroll: number;
  heldPayroll: number;
  netEligible: number;
  onNavigate: (page: ConsolePage) => void;
}) {
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
          <strong>Not connected</strong>
          <p>Exercise creation will appear here after the verification-exercise endpoint is connected.</p>
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
          <Button onClick={props.onRunGate}>Run Batch Verification</Button>
          <Button onClick={props.onDisburse} variant="secondary">Disburse Eligible</Button>
        </div>
      </div>
      <WorkerTable
        anomalies={props.anomalies}
        documentResults={props.documentResults}
        disbursedIds={props.disbursedIds}
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

function ExercisesView() {
  return (
    <section className={styles.pageStack}>
      <EmptyState
        title="No verification exercises yet"
        body="Exercise creation is not connected to a backend endpoint yet. Once it is connected, created exercises, required documents, and worker links will appear here."
      />
    </section>
  );
}

function VerificationRulesView({
  biasAudit,
  loading,
  onBiasAudit,
}: {
  biasAudit: BiasAuditResponse | null;
  loading: boolean;
  onBiasAudit: () => void;
}) {
  return (
    <section className={styles.pageStack}>
      <EmptyState
        title="No configurable verification rules yet"
        body="This page is waiting for rule-management endpoints. Current verification still runs from the backend services when HR clicks Run Verification or Verify on a staff record."
      />
      <Card className={styles.capabilityCard}>
        <h2>Fairness evidence</h2>
        <p>Runs the available backend liveness fairness audit endpoint.</p>
        <Button loading={loading} onClick={onBiasAudit} variant="secondary">Run Bias Audit</Button>
        {biasAudit ? <span>Groups {biasAudit.groups.length} | FPR gap {biasAudit.max_fpr_gap}</span> : null}
      </Card>
    </section>
  );
}

function SubmissionsView({
  workers,
  viqs,
  documentResults,
}: {
  workers: Worker[];
  viqs: Record<string, Viq>;
  documentResults: Record<string, DocumentConsistencyResponse>;
}) {
  const submittedWorkers = workers.filter((worker) => viqs[worker.id] || documentResults[worker.id]);
  if (!submittedWorkers.length) {
    return (
      <EmptyState
        title="No staff submissions yet"
        body="Submissions will appear here after a staff verification session or document check has been completed."
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
}: {
  workers: Worker[];
  viqs: Record<string, Viq>;
  disbursedIds: Set<string>;
}) {
  return (
    <DataTable
      columns={["Staff", "Amount", "Bank details", "Verification decision", "Payment status", "Squad reference"]}
      rows={workers.map((worker) => [
        `${worker.worker_code} - ${worker.full_name}`,
        formatMoney(Number(worker.salary_amount)),
        worker.bank_account_number ?? "Pending account resolution",
        viqs[worker.id]?.verdict ?? "Awaiting verification",
        disbursedIds.has(worker.id) ? "Released" : "Not released",
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
        body="Document consistency results will appear here after HR verifies staff records individually or in bulk."
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

function ReportsView({ workers, held, netEligible }: { workers: Worker[]; held: number; netEligible: number }) {
  return (
    <EmptyState
      title="Reports are not connected yet"
      body={`Current loaded state: ${workers.length} staff records, ${held} held, ${formatMoney(netEligible)} eligible. Report export will appear here after a reports endpoint is connected.`}
    />
  );
}

function SettingsView() {
  return (
    <EmptyState
      title="Settings are not connected yet"
      body="Ministry profile, thresholds, payment settings, notifications, and admin roles will appear here only after their endpoints exist."
    />
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
    checks: "Verification Rules",
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

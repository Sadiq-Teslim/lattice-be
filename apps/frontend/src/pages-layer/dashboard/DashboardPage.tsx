"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle,
  ClipboardCheck,
  Copy,
  FileSpreadsheet,
  LockKeyhole,
  Search,
  Send,
  Shield,
  UploadCloud,
} from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import type {
  AnomalyResult,
  AnomalyScanResponse,
  BiasAuditResponse,
  DemoSeedResponse,
  DocumentConsistencyResponse,
  JobResponse,
  Viq,
  Worker,
} from "@/shared/api/types";
import { verdictVariant } from "@/entities/viq/model";
import { Badge, Button, Card, FlagPill, TrustScoreGauge } from "@/shared/ui";
import { Sidebar, type ConsolePage } from "@/widgets/sidebar/Sidebar";
import { StatsGrid } from "@/widgets/stats/StatsGrid";
import { WorkerDetailDrawer } from "@/widgets/worker-detail/WorkerDetailDrawer";
import { WorkerTable } from "@/widgets/worker-table/WorkerTable";
import styles from "./DashboardPage.module.css";

type Filter = "ALL" | "PASS" | "REVIEW" | "FAIL";
type PayrollStage = "EMPTY" | "IMPORTED" | "LATTICE_READY" | "DISBURSED";

const latticeCheckOptions = [
  "Proof of life",
  "Face match",
  "Deepfake detection",
  "BVN/name match",
  "DOB consistency",
  "Appointment date consistency",
  "First salary vs appointment date",
  "Retirement age check",
  "Duplicate BVN detection",
  "Shared device/IP detection",
  "GPS/location cluster anomaly",
  "Missing document check",
];

const requiredDocuments = [
  "Appointment letter",
  "Birth certificate / declaration of age",
  "Last promotion letter",
  "Posting letter",
  "Staff ID card",
  "BVN identity record",
];

export function DashboardPage() {
  const [activePage, setActivePage] = useState<ConsolePage>("dashboard");
  const [seed, setSeed] = useState<DemoSeedResponse | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [anomalyScan, setAnomalyScan] = useState<AnomalyScanResponse | null>(null);
  const [viqs, setViqs] = useState<Record<string, Viq>>({});
  const [documentResults, setDocumentResults] = useState<Record<string, DocumentConsistencyResponse>>({});
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [biasAudit, setBiasAudit] = useState<BiasAuditResponse | null>(null);
  const [lastJob, setLastJob] = useState<JobResponse | null>(null);
  const [payrollStage, setPayrollStage] = useState<PayrollStage>("EMPTY");
  const [disbursedIds, setDisbursedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exerciseCreated, setExerciseCreated] = useState(false);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([
    "Proof of life",
    "BVN/name match",
    "DOB consistency",
    "Appointment date consistency",
    "Missing document check",
  ]);

  const anomalies = anomalyScan?.results ?? [];
  const anomalyByCode = useMemo(
    () => new Map(anomalies.map((item) => [item.worker_code, item])),
    [anomalies],
  );

  const filteredWorkers = workers.filter((worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const status = viq?.verdict ?? (anomaly?.flagged ? "REVIEW" : "PASS");
    const matchesFilter = filter === "ALL" || status === filter;
    const text = `${worker.worker_code} ${worker.full_name} ${worker.department ?? ""}`.toLowerCase();
    return matchesFilter && text.includes(query.toLowerCase());
  });

  const blocked = Object.values(viqs).filter((viq) => viq.verdict === "FAIL").length;
  const review =
    workers.filter((worker) => anomalyByCode.get(worker.worker_code)?.flagged).length +
    Object.values(viqs).filter((viq) => viq.verdict === "REVIEW").length;
  const held = review + blocked;
  const cleared = workers.length ? Math.max(0, workers.length - held) : 0;
  const grossPayroll = workers.reduce((sum, worker) => sum + Number(worker.salary_amount || 0), 0);
  const heldPayroll = workers.reduce((sum, worker) => {
    const viq = viqs[worker.id];
    const anomaly = anomalyByCode.get(worker.worker_code);
    const shouldHold = viq?.verdict === "REVIEW" || viq?.verdict === "FAIL" || anomaly?.flagged;
    return shouldHold ? sum + Number(worker.salary_amount || 0) : sum;
  }, 0);
  const netEligible = Math.max(0, grossPayroll - heldPayroll);
  const batchStatus =
    payrollStage === "DISBURSED"
      ? "Eligible salaries released"
      : payrollStage === "LATTICE_READY"
        ? "Lattice gate completed"
        : payrollStage === "IMPORTED"
          ? "Nominal roll imported"
          : "Awaiting nominal roll";

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

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function importNominalRoll() {
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
      setActivePage("staff");
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
      const viqResult = await latticeApi.verifyAndDisburse(worker.id, seed.pay_cycle_id);
      return { documents, viqResult };
    });
    if (result) {
      setDocumentResults((current) => ({ ...current, [worker.id]: result.documents }));
      setViqs((current) => ({ ...current, [worker.id]: result.viqResult.viq }));
      setSelectedWorker(worker);
    }
  }

  async function verifyAllEligible() {
    const candidates = filteredWorkers.slice(0, 10);
    for (const worker of candidates) {
      await verifyWorker(worker);
    }
  }

  async function queueWorker(worker: Worker) {
    if (!seed) return;
    const queued = await runAction("queue", () =>
      latticeApi.enqueueVerification(worker.id, seed.pay_cycle_id),
    );
    if (!queued) return;
    const job = await runAction("job", async () => {
      let latest = await latticeApi.getJob(queued.job_id);
      for (let attempt = 0; attempt < 10 && ["PENDING", "RUNNING"].includes(latest.status); attempt += 1) {
        await wait(800);
        latest = await latticeApi.getJob(queued.job_id);
      }
      return latest;
    });
    if (job) {
      setLastJob(job);
      if (job.result?.viq) {
        setViqs((current) => ({ ...current, [worker.id]: job.result!.viq }));
        setSelectedWorker(worker);
      }
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
        return !anomaly?.flagged && viq?.verdict !== "FAIL" && viq?.verdict !== "REVIEW";
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
          canRunGate={Boolean(seed)}
          canDisburse={workers.length > 0 && payrollStage === "LATTICE_READY"}
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
            exerciseCreated={exerciseCreated}
            onNavigate={setActivePage}
          />
        ) : null}

        {activePage === "staff" ? (
          <StaffRecordsView
            workers={filteredWorkers}
            anomalies={anomalies}
            viqs={viqs}
            documentResults={documentResults}
            disbursedIds={disbursedIds}
            selectedId={selectedWorker?.id}
            filter={filter}
            query={query}
            loading={loading}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={setSelectedWorker}
            onVerify={verifyWorker}
            onBulkVerify={verifyAllEligible}
          />
        ) : null}

        {activePage === "payroll" ? (
          <PayrollView
            workers={filteredWorkers}
            anomalies={anomalies}
            viqs={viqs}
            disbursedIds={disbursedIds}
            selectedId={selectedWorker?.id}
            grossPayroll={grossPayroll}
            heldPayroll={heldPayroll}
            netEligible={netEligible}
            payrollStage={payrollStage}
            onSelect={setSelectedWorker}
            onVerify={verifyWorker}
            onRunGate={runLatticeGate}
            onDisburse={disburseEligible}
          />
        ) : null}

        {activePage === "exercises" ? (
          <ExercisesView
            exerciseCreated={exerciseCreated}
            selectedChecks={selectedChecks}
            onToggleCheck={(check) =>
              setSelectedChecks((current) =>
                current.includes(check)
                  ? current.filter((item) => item !== check)
                  : [...current, check],
              )
            }
            onCreate={() => setExerciseCreated(true)}
          />
        ) : null}

        {activePage === "checks" ? (
          <LatticeChecksView
            biasAudit={biasAudit}
            loading={loading === "bias"}
            lastJob={lastJob}
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
        <Button loading={importLoading} onClick={onImport} variant="secondary">
          <FileSpreadsheet size={18} strokeWidth={1.5} />
          Import Nominal Roll
        </Button>
        <Button disabled={!canRunGate} loading={gateLoading} onClick={onRunGate}>
          <Shield size={18} strokeWidth={1.5} />
          Run Lattice Gate
        </Button>
        <Button disabled={!canDisburse} onClick={onDisburse} variant="secondary">
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
  exerciseCreated,
  onNavigate,
}: {
  workers: Worker[];
  held: number;
  cleared: number;
  grossPayroll: number;
  heldPayroll: number;
  netEligible: number;
  exerciseCreated: boolean;
  onNavigate: (page: ConsolePage) => void;
}) {
  return (
    <>
      <section className={styles.heroGrid}>
        <Card className={styles.greenHero}>
          <span>May 2026 payroll batch</span>
          <strong>{formatMoney(grossPayroll)}</strong>
          <p>{cleared} staff eligible, {held} held for HR review.</p>
          <Button onClick={() => onNavigate("payroll")} variant="secondary">Open Payroll</Button>
        </Card>
        <Card className={styles.summaryCard}>
          <span>Active service</span>
          <strong>{exerciseCreated ? "June 2026 Verification Exercise" : "No active exercise"}</strong>
          <p>{exerciseCreated ? "Worker link generated and ready for the ministry portal." : "Create a staff verification exercise and collect documents digitally."}</p>
          <Button onClick={() => onNavigate("exercises")}>Manage Exercise</Button>
        </Card>
      </section>

      <StatsGrid
        total={workers.length}
        completeRecords={workers.length ? workers.length - Math.min(held, workers.length) : 0}
        latticeCleared={cleared}
        held={held}
        netPayable={formatMoney(netEligible)}
      />

      <section className={styles.commandStrip}>
        <Card className={styles.batchCard}>
          <Metric label="Gross payroll" value={formatMoney(grossPayroll)} />
          <Metric label="Held by Lattice" value={formatMoney(heldPayroll)} />
          <Metric label="Eligible release" value={formatMoney(netEligible)} />
          <Metric label="Records loaded" value={String(workers.length)} />
        </Card>
        <Card className={styles.latticeGate}>
          <div className={styles.gateIcon}>
            <LockKeyhole size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h2>Lattice sits between records and payment</h2>
            <p>Staff records, documents, proof-of-life, anomaly risk, and disbursement status are checked before salaries move.</p>
          </div>
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
          <p>Each staff file contains salary, posting, bank, employment, documents, and Lattice verification status.</p>
        </div>
        <Button disabled={!props.workers.length} loading={props.loading?.startsWith("verify")} onClick={props.onBulkVerify}>
          <ClipboardCheck size={18} strokeWidth={1.5} />
          Bulk Verify Visible
        </Button>
      </div>
      <Toolbar filter={props.filter} query={props.query} onFilter={props.onFilter} onQuery={props.onQuery} />
      <WorkerTable
        anomalies={props.anomalies}
        disbursedIds={props.disbursedIds}
        selectedId={props.selectedId}
        viqs={props.viqs}
        workers={props.workers}
        onSelect={props.onSelect}
        onVerify={props.onVerify}
      />
    </section>
  );
}

function PayrollView(props: {
  workers: Worker[];
  anomalies: AnomalyResult[];
  viqs: Record<string, Viq>;
  disbursedIds: Set<string>;
  selectedId?: string;
  grossPayroll: number;
  heldPayroll: number;
  netEligible: number;
  payrollStage: PayrollStage;
  onSelect: (worker: Worker) => void;
  onVerify: (worker: Worker) => void;
  onRunGate: () => void;
  onDisburse: () => void;
}) {
  return (
    <section className={styles.pageStack}>
      <div className={styles.payrollHeader}>
        <Metric label="Batch" value="OG-MOE-MAY-2026" />
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
          <Button onClick={props.onRunGate}>Run Lattice For Batch</Button>
          <Button onClick={props.onDisburse} variant="secondary">Disburse Eligible</Button>
        </div>
      </div>
      <WorkerTable
        anomalies={props.anomalies}
        disbursedIds={props.disbursedIds}
        selectedId={props.selectedId}
        viqs={props.viqs}
        workers={props.workers}
        onSelect={props.onSelect}
        onVerify={props.onVerify}
      />
    </section>
  );
}

function ExercisesView({
  exerciseCreated,
  selectedChecks,
  onToggleCheck,
  onCreate,
}: {
  exerciseCreated: boolean;
  selectedChecks: string[];
  onToggleCheck: (check: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className={styles.exerciseGrid}>
      <Card className={styles.formCard}>
        <h2>Create verification exercise</h2>
        <label>
          Exercise name
          <input defaultValue="June 2026 Verification Exercise" />
        </label>
        <label>
          Staff scope
          <select defaultValue="all-teachers">
            <option value="all-teachers">All teaching and non-teaching staff</option>
            <option value="selected-lgas">Selected LGAs</option>
            <option value="selected-schools">Selected schools</option>
            <option value="grade-levels">Selected grade levels</option>
          </select>
        </label>
        <div className={styles.checkGrid}>
          {latticeCheckOptions.map((check) => (
            <button
              className={selectedChecks.includes(check) ? styles.checkActive : ""}
              key={check}
              onClick={() => onToggleCheck(check)}
            >
              {check}
            </button>
          ))}
        </div>
        <Button onClick={onCreate} fullWidth>
          Generate Worker Link
        </Button>
      </Card>
      <Card className={styles.formCard}>
        <h2>Documents to collect</h2>
        <div className={styles.docList}>
          {requiredDocuments.map((document) => (
            <span key={document}>
              <CheckCircle size={18} strokeWidth={1.5} />
              {document}
            </span>
          ))}
        </div>
        {exerciseCreated ? (
          <div className={styles.generatedLink}>
            <span>Worker link</span>
            <strong>https://ogunstate.gov.ng/staff-verify/june-2026</strong>
            <p>Powered by Lattice. Workers submit documents, complete liveness if required, and receive a decision reference.</p>
            <Button variant="secondary">
              <Copy size={18} strokeWidth={1.5} />
              Copy Link
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function LatticeChecksView({
  biasAudit,
  loading,
  lastJob,
  onBiasAudit,
}: {
  biasAudit: BiasAuditResponse | null;
  loading: boolean;
  lastJob: JobResponse | null;
  onBiasAudit: () => void;
}) {
  return (
    <section className={styles.cardGrid}>
      {["Identity", "Proof of life", "Document consistency", "Payroll anomaly", "Risk scoring"].map((title) => (
        <Card className={styles.capabilityCard} key={title}>
          <Shield size={24} strokeWidth={1.5} />
          <h2>{title}</h2>
          <p>{checkDescription(title)}</p>
        </Card>
      ))}
      <Card className={styles.capabilityCard}>
        <h2>Fairness evidence</h2>
        <p>Run the demo liveness bias audit for Fitzpatrick IV-VI cases.</p>
        <Button loading={loading} onClick={onBiasAudit} variant="secondary">Run Bias Audit</Button>
        {biasAudit ? <span>Groups {biasAudit.groups.length} | FPR gap {biasAudit.max_fpr_gap}</span> : null}
        {lastJob ? <span>Last queued job {lastJob.status}</span> : null}
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
  return (
    <DataTable
      columns={["Staff", "Exercise", "Documents", "Liveness", "Decision", "Submitted"]}
      rows={workers.slice(0, 12).map((worker, index) => [
        `${worker.worker_code} - ${worker.full_name}`,
        "June 2026 Verification Exercise",
        documentResults[worker.id]?.status ?? (index % 4 === 0 ? "Pending" : "Submitted"),
        viqs[worker.id] ? "Completed" : index % 3 === 0 ? "Required" : "Pending",
        viqs[worker.id]?.verdict ?? "Not reviewed",
        index % 3 === 0 ? "Awaiting worker" : "May 14, 2026",
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
      columns={["Staff", "Amount", "Bank details", "Lattice decision", "Payment status", "Squad reference"]}
      rows={workers.slice(0, 12).map((worker) => [
        `${worker.worker_code} - ${worker.full_name}`,
        formatMoney(Number(worker.salary_amount)),
        worker.bank_account_number ?? "Pending account resolution",
        viqs[worker.id]?.verdict ?? "Awaiting verification",
        disbursedIds.has(worker.id) ? "Released" : "Held",
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
  return (
    <section className={styles.pageStack}>
      <div className={styles.cardGrid}>
        {requiredDocuments.map((document) => (
          <Card className={styles.capabilityCard} key={document}>
            <UploadCloud size={24} strokeWidth={1.5} />
            <h2>{document}</h2>
            <p>Required for annual verification exercises and payroll record consistency checks.</p>
          </Card>
        ))}
      </div>
      <DataTable
        columns={["Staff", "Document status", "Severity", "Flags"]}
        rows={workers.slice(0, 10).map((worker) => [
          `${worker.worker_code} - ${worker.full_name}`,
          documentResults[worker.id]?.status ?? "Not checked",
          documentResults[worker.id]?.severity ?? "Unknown",
          String(documentResults[worker.id]?.flags.length ?? 0),
        ])}
      />
    </section>
  );
}

function ReportsView({ workers, held, netEligible }: { workers: Worker[]; held: number; netEligible: number }) {
  return (
    <section className={styles.cardGrid}>
      {[
        "Payroll verification report",
        "Ghost worker risk report",
        "No-show report",
        "Document mismatch report",
        "Disbursement report",
        "Full audit trail",
      ].map((report) => (
        <Card className={styles.reportCard} key={report}>
          <FileSpreadsheet size={24} strokeWidth={1.5} />
          <h2>{report}</h2>
          <p>{workers.length} staff records | {held} held | {formatMoney(netEligible)} eligible</p>
          <Button variant="secondary">Export</Button>
        </Card>
      ))}
    </section>
  );
}

function SettingsView() {
  return (
    <section className={styles.settingsGrid}>
      {["Ministry profile", "Payroll thresholds", "Lattice rules", "Squad payment settings", "Notifications", "Admin roles"].map((item) => (
        <Card className={styles.formCard} key={item}>
          <h2>{item}</h2>
          <label>
            Status
            <select defaultValue="enabled">
              <option value="enabled">Enabled</option>
              <option value="review">Requires review</option>
            </select>
          </label>
          <Button variant="secondary">Save</Button>
        </Card>
      ))}
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
    checks: "Lattice Checks",
    submissions: "Submissions",
    disbursements: "Disbursements",
    documents: "Documents",
    reports: "Reports & Audit",
    settings: "Settings",
  };
  return titles[page];
}

function checkDescription(title: string) {
  const descriptions: Record<string, string> = {
    Identity: "BVN/name match, account lookup, OTP, and staff identity evidence.",
    "Proof of life": "Liveness challenge, face evidence, and media-risk checks.",
    "Document consistency": "DOB, appointment, first salary, retirement, and missing document checks.",
    "Payroll anomaly": "Shared BVN, device, GPS, IP, and registration burst detection.",
    "Risk scoring": "Trust score, hard flags, PASS/REVIEW/FAIL decisions, and signed VIQ output.",
  };
  return descriptions[title];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

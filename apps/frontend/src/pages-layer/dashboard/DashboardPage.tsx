"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle,
  FileSpreadsheet,
  LockKeyhole,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import type {
  AnomalyResult,
  AnomalyScanResponse,
  BiasAuditResponse,
  DemoSeedResponse,
  JobResponse,
  Viq,
  Worker,
} from "@/shared/api/types";
import { Button, Card } from "@/shared/ui";
import { Sidebar } from "@/widgets/sidebar/Sidebar";
import { StatsGrid } from "@/widgets/stats/StatsGrid";
import { WorkerDetailDrawer } from "@/widgets/worker-detail/WorkerDetailDrawer";
import { WorkerTable } from "@/widgets/worker-table/WorkerTable";
import styles from "./DashboardPage.module.css";

type Filter = "ALL" | "PASS" | "REVIEW" | "FAIL";
type PayrollStage = "EMPTY" | "IMPORTED" | "LATTICE_READY" | "DISBURSED";

export function DashboardPage() {
  const [seed, setSeed] = useState<DemoSeedResponse | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [anomalyScan, setAnomalyScan] = useState<AnomalyScanResponse | null>(null);
  const [viqs, setViqs] = useState<Record<string, Viq>>({});
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [biasAudit, setBiasAudit] = useState<BiasAuditResponse | null>(null);
  const [lastJob, setLastJob] = useState<JobResponse | null>(null);
  const [payrollStage, setPayrollStage] = useState<PayrollStage>("EMPTY");
  const [disbursedIds, setDisbursedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
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
    const status = viq?.verdict ?? (anomaly?.flagged ? "REVIEW" : "PASS");
    const matchesFilter = filter === "ALL" || status === filter;
    const text = `${worker.worker_code} ${worker.full_name}`.toLowerCase();
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

  async function seedPayroll() {
    const result = await runAction("seed", latticeApi.seedPayroll);
    if (!result) return;
    setSeed(result);
    setAnomalyScan(null);
    setViqs({});
    setDisbursedIds(new Set());
    setPayrollStage("IMPORTED");
    const listedWorkers = await runAction("workers", () => latticeApi.listWorkers(result.ministry));
    if (listedWorkers) {
      setWorkers(listedWorkers);
      setSelectedWorker(null);
    }
  }

  async function scanAnomalies() {
    if (!seed) return;
    const result = await runAction("anomaly", () => latticeApi.scanAnomalies(seed.pay_cycle_id));
    if (result) {
      setAnomalyScan(result);
      setPayrollStage("LATTICE_READY");
    }
  }

  async function verifyWorker(worker: Worker) {
    if (!seed) return;
    const result = await runAction("verify", () =>
      latticeApi.verifyAndDisburse(worker.id, seed.pay_cycle_id),
    );
    if (result) {
      setViqs((current) => ({ ...current, [worker.id]: result.viq }));
      setSelectedWorker(worker);
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
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.seal}>OG</div>
            <div>
              <p>Ogun State Ministry of Education</p>
              <h1>May 2026 Payroll Command Centre</h1>
              <span>{batchStatus}</span>
            </div>
          </div>
          <div className={styles.actions}>
            <Button
              loading={loading === "seed" || loading === "workers"}
              onClick={seedPayroll}
              variant="secondary"
            >
              <FileSpreadsheet size={18} strokeWidth={1.5} />
              Import Nominal Roll
            </Button>
            <Button disabled={!seed} loading={loading === "anomaly"} onClick={scanAnomalies}>
              <Shield size={18} strokeWidth={1.5} />
              Run Lattice Gate
            </Button>
            <Button
              disabled={!workers.length || payrollStage !== "LATTICE_READY"}
              onClick={disburseEligible}
              variant="secondary"
            >
              <Banknote size={18} strokeWidth={1.5} />
              Release Eligible
            </Button>
          </div>
        </header>

        <section className={styles.commandStrip}>
          <Card className={styles.batchCard}>
            <div>
              <span>Payroll Batch</span>
              <strong>OG-MOE-MAY-2026</strong>
            </div>
            <div>
              <span>Gross Payroll</span>
              <strong>{formatMoney(grossPayroll)}</strong>
            </div>
            <div>
              <span>Held by Lattice</span>
              <strong>{formatMoney(heldPayroll)}</strong>
            </div>
            <div>
              <span>Eligible Release</span>
              <strong>{formatMoney(netEligible)}</strong>
            </div>
          </Card>

          <Card className={styles.latticeGate}>
            <div className={styles.gateIcon}>
              <LockKeyhole size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h2>Lattice verification gate</h2>
              <p>
                Payroll can only release salaries after proof-of-life, document consistency,
                BVN/name match, and anomaly screening produce a VIQ decision.
              </p>
            </div>
          </Card>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}

        <StatsGrid
          total={workers.length}
          completeRecords={workers.length ? workers.length - Math.min(held, workers.length) : 0}
          latticeCleared={cleared}
          held={held}
          netPayable={formatMoney(netEligible)}
        />

        <section className={styles.controlGrid}>
          <Card className={styles.panel}>
            <h2>Verification orchestration</h2>
            <p>
              Select any worker to generate a signed VIQ through the deployed Lattice SDK endpoint.
            </p>
            <div className={styles.panelActions}>
              <Button
                disabled={!selectedWorker || !seed}
                loading={loading === "verify"}
                onClick={() => selectedWorker && verifyWorker(selectedWorker)}
              >
                Run SDK Verification
              </Button>
              <Button
                disabled={!selectedWorker || !seed}
                loading={loading === "queue" || loading === "job"}
                onClick={() => selectedWorker && queueWorker(selectedWorker)}
                variant="secondary"
              >
                Queue Verification
              </Button>
            </div>
            {lastJob ? <p className={styles.meta}>Last Lattice job: {lastJob.status}</p> : null}
          </Card>

          <Card className={styles.panel}>
            <h2>Risk evidence</h2>
            <p>Run fairness evidence and inspect exception drivers before approving the batch.</p>
            <Button loading={loading === "bias"} onClick={runBiasAudit} variant="secondary">
              <Shield size={18} strokeWidth={1.5} />
              Run Bias Audit
            </Button>
            {biasAudit ? (
              <p className={styles.meta}>
                Groups: {biasAudit.groups.length} | FPR gap: {biasAudit.max_fpr_gap} | FNR gap:{" "}
                {biasAudit.max_fnr_gap}
              </p>
            ) : null}
          </Card>

          <Card className={styles.panel}>
            <h2>Payroll release rules</h2>
            <div className={styles.rules}>
              <span><CheckCircle size={18} strokeWidth={1.5} /> PASS workers are eligible.</span>
              <span><RefreshCw size={18} strokeWidth={1.5} /> REVIEW workers stay held.</span>
              <span><LockKeyhole size={18} strokeWidth={1.5} /> FAIL workers are blocked.</span>
            </div>
          </Card>
        </section>

        <section className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <div className={styles.tabs}>
              {(["ALL", "PASS", "REVIEW", "FAIL"] as const).map((item) => (
                <button
                  className={filter === item ? styles.activeTab : ""}
                  key={item}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={18} strokeWidth={1.5} />
              <input
                placeholder="Search worker or ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <WorkerTable
            anomalies={anomalies}
            disbursedIds={disbursedIds}
            selectedId={selectedWorker?.id}
            viqs={viqs}
            workers={filteredWorkers}
            onSelect={setSelectedWorker}
            onVerify={verifyWorker}
          />
        </section>
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

"use client";

import { useMemo, useState } from "react";
import { Play, RefreshCw, Search, Shield } from "lucide-react";
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

export function DashboardPage() {
  const [seed, setSeed] = useState<DemoSeedResponse | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [anomalyScan, setAnomalyScan] = useState<AnomalyScanResponse | null>(null);
  const [viqs, setViqs] = useState<Record<string, Viq>>({});
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [biasAudit, setBiasAudit] = useState<BiasAuditResponse | null>(null);
  const [lastJob, setLastJob] = useState<JobResponse | null>(null);
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

  const verified = Object.values(viqs).filter((viq) => viq.verdict === "PASS").length;
  const blocked = Object.values(viqs).filter((viq) => viq.verdict === "FAIL").length;
  const review =
    workers.filter((worker) => anomalyByCode.get(worker.worker_code)?.flagged).length +
    Object.values(viqs).filter((viq) => viq.verdict === "REVIEW").length;

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
    const listedWorkers = await runAction("workers", () => latticeApi.listWorkers(result.ministry));
    if (listedWorkers) {
      setWorkers(listedWorkers);
      setSelectedWorker(null);
    }
  }

  async function scanAnomalies() {
    if (!seed) return;
    const result = await runAction("anomaly", () => latticeApi.scanAnomalies(seed.pay_cycle_id));
    if (result) setAnomalyScan(result);
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

  const selectedAnomaly = selectedWorker
    ? anomalyByCode.get(selectedWorker.worker_code)
    : undefined;
  const selectedViq = selectedWorker ? viqs[selectedWorker.id] : undefined;

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p>Ogun State Ministry of Education</p>
            <h1>Pay Cycle - May 2026</h1>
          </div>
          <div className={styles.actions}>
            <Button
              loading={loading === "seed" || loading === "workers"}
              onClick={seedPayroll}
              variant="secondary"
            >
              <RefreshCw size={18} strokeWidth={1.5} />
              Seed Payroll
            </Button>
            <Button disabled={!seed} loading={loading === "anomaly"} onClick={scanAnomalies}>
              <Play size={18} strokeWidth={1.5} />
              Run Anomaly Scan
            </Button>
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}

        <StatsGrid
          total={workers.length}
          verified={verified}
          review={review}
          blocked={blocked}
        />

        <section className={styles.controlGrid}>
          <Card className={styles.panel}>
            <h2>Live SDK Controls</h2>
            <p>
              Use the selected worker to generate a signed VIQ through the deployed Lattice API.
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
            {lastJob ? <p className={styles.meta}>Last job: {lastJob.status}</p> : null}
          </Card>

          <Card className={styles.panel}>
            <h2>Bias Audit</h2>
            <p>Run deterministic Fitzpatrick IV-VI liveness audit metrics.</p>
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

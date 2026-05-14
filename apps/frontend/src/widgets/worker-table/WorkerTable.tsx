import { Badge, Button, FlagPill, TrustScoreGauge } from "@/shared/ui";
import type { AnomalyResult, Viq, Worker } from "@/shared/api/types";
import { verdictVariant } from "@/entities/viq/model";
import styles from "./WorkerTable.module.css";

type WorkerTableProps = {
  workers: Worker[];
  anomalies: AnomalyResult[];
  viqs: Record<string, Viq>;
  disbursedIds?: Set<string>;
  selectedId?: string;
  onSelect: (worker: Worker) => void;
  onVerify: (worker: Worker) => void;
};

export function WorkerTable({
  workers,
  anomalies,
  viqs,
  disbursedIds = new Set(),
  selectedId,
  onSelect,
  onVerify,
}: WorkerTableProps) {
  const anomalyByCode = new Map(anomalies.map((item) => [item.worker_code, item]));

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Staff Record</th>
            <th>Posting</th>
            <th>Grade / Step</th>
            <th>Gross Pay</th>
            <th>Document File</th>
            <th>Trust Score</th>
            <th>Decision</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workers.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={8}>
                No staff records match the current filter.
              </td>
            </tr>
          ) : null}
          {workers.map((worker) => {
            const viq = viqs[worker.id];
            const anomaly = anomalyByCode.get(worker.worker_code);
            const flags = viq?.flags ?? (anomaly?.flagged ? ["ANOMALY_FLAGGED"] : []);
            const verdict = viq?.verdict ?? (anomaly?.flagged ? "REVIEW" : "PENDING");
            const score = viq?.trust_score ?? (anomaly?.flagged ? 76 : 92);
            const grade = payrollGrade(worker);
            const documentStatus = anomaly?.flagged ? "Needs review" : "Complete";
            const payment = disbursedIds.has(worker.id)
              ? "Released"
              : verdict === "FAIL"
                ? "Blocked"
                : verdict === "REVIEW"
                  ? "Held"
                  : "Ready";
            return (
              <tr
                className={`${selectedId === worker.id ? styles.selected : ""} ${
                  anomaly?.flagged ? styles.flagged : ""
                }`}
                key={worker.id}
                onClick={() => onSelect(worker)}
              >
                <td data-label="Staff Record">
                  <div className={styles.primaryCell}>
                    <strong>{worker.worker_code}</strong>
                    <span>{worker.full_name}</span>
                    <small>DOB {formatDate(worker.date_of_birth)}</small>
                  </div>
                </td>
                <td data-label="Posting">
                  <div className={styles.primaryCell}>
                    <strong>{worker.department ?? "Teaching Service"}</strong>
                    <span>{schoolPosting(worker)}</span>
                    <small>{worker.status}</small>
                  </div>
                </td>
                <td data-label="Grade / Step">
                  <strong>{grade}</strong>
                </td>
                <td data-label="Gross Pay">{formatMoney(worker.salary_amount)}</td>
                <td data-label="Document File">
                  <Badge
                    label={documentStatus}
                    variant={documentStatus === "Complete" ? "success" : "warning"}
                  />
                </td>
                <td data-label="Trust Score">
                  <TrustScoreGauge score={score} />
                </td>
                <td data-label="Decision">
                  <div className={styles.decision}>
                    <Badge label={verdict} variant={verdictVariant(verdict)} />
                    <span className={styles.payment}>{payment}</span>
                    <div className={styles.flags}>
                      {flags.length ? flags.map((flag) => <FlagPill flag={flag} key={flag} />) : null}
                    </div>
                  </div>
                </td>
                <td data-label="Actions">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      onVerify(worker);
                    }}
                  >
                    Verify
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function payrollGrade(worker: Worker) {
  const amount = Number(worker.salary_amount);
  if (amount >= 145000) return "GL 13 / Step 6";
  if (amount >= 120000) return "GL 10 / Step 5";
  if (amount >= 95000) return "GL 08 / Step 4";
  return "GL 07 / Step 2";
}

function schoolPosting(worker: Worker) {
  const suffix = worker.worker_code.slice(-2);
  const zones = ["Abeokuta South", "Ijebu-Ode", "Odeda", "Sagamu", "Yewa North"];
  return `${zones[Number.parseInt(suffix, 10) % zones.length]} LGA`;
}

function formatDate(value?: string) {
  if (!value) return "not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(value: string) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

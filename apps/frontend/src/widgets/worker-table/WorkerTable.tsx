import { Badge, Button, FlagPill, TrustScoreGauge } from "@/shared/ui";
import type { AnomalyResult, DocumentConsistencyResponse, Viq, Worker } from "@/shared/api/types";
import { verdictVariant } from "@/entities/viq/model";
import styles from "./WorkerTable.module.css";

type WorkerTableProps = {
  workers: Worker[];
  anomalies: AnomalyResult[];
  viqs: Record<string, Viq>;
  documentResults?: Record<string, DocumentConsistencyResponse>;
  disbursedIds?: Set<string>;
  investigationIds?: Set<string>;
  selectedId?: string;
  onSelect: (worker: Worker) => void;
  onVerify: (worker: Worker) => void;
};

export function WorkerTable({
  workers,
  anomalies,
  viqs,
  documentResults = {},
  disbursedIds = new Set(),
  investigationIds = new Set(),
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
            <th>Department</th>
            <th>Gross Pay</th>
            <th>Documents</th>
            <th>Trust Score</th>
            <th>Decision</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workers.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={7}>
                No staff records match the current filter.
              </td>
            </tr>
          ) : null}
          {workers.map((worker) => {
            const viq = viqs[worker.id];
            const anomaly = anomalyByCode.get(worker.worker_code);
            const flags = viq?.flags ?? (anomaly?.flagged ? ["ANOMALY_FLAGGED"] : []);
            const verdict = viq?.verdict ?? (anomaly?.flagged ? "REVIEW" : "NOT_VERIFIED");
            const documentResult = documentResults[worker.id];
            const documentStatus = documentResult?.status ?? "NOT_CHECKED";
            const payment = investigationIds.has(worker.id)
              ? "Flagged"
              : disbursedIds.has(worker.id)
                ? "Released"
                : verdict === "FAIL"
                  ? "Blocked"
                  : verdict === "REVIEW"
                    ? "Held"
                    : "Not ready";
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
                    <strong>{worker.department ?? "Not provided"}</strong>
                    <span>{displayMinistry(worker.ministry)}</span>
                    <small>{worker.status}</small>
                  </div>
                </td>
                <td data-label="Gross Pay">{formatMoney(worker.salary_amount)}</td>
                <td data-label="Document File">
                  <Badge
                    label={humanizeStatus(documentStatus)}
                    variant={documentStatus === "DOCUMENTS_CLEAN" ? "success" : "warning"}
                  />
                </td>
                <td data-label="Trust Score">
                  {viq ? (
                    <TrustScoreGauge score={viq.trust_score} verdict={viq.verdict} />
                  ) : (
                    <span className={styles.muted}>Not verified</span>
                  )}
                </td>
                <td data-label="Decision">
                  <div className={styles.decision}>
                    <Badge label={humanizeStatus(verdict)} variant={verdictVariant(verdict)} />
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

function formatDate(value?: string) {
  if (!value) return "not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function humanizeStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayMinistry(value: string) {
  return value.replace(/\s+Demo\s+[A-Z0-9-]+$/i, "");
}

function formatMoney(value: string) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

import { Badge, Button, FlagPill, TrustScoreGauge } from "@/shared/ui";
import type { AnomalyResult, Viq, Worker } from "@/shared/api/types";
import { verdictVariant } from "@/entities/viq/model";
import styles from "./WorkerTable.module.css";

type WorkerTableProps = {
  workers: Worker[];
  anomalies: AnomalyResult[];
  viqs: Record<string, Viq>;
  selectedId?: string;
  onSelect: (worker: Worker) => void;
  onVerify: (worker: Worker) => void;
};

export function WorkerTable({
  workers,
  anomalies,
  viqs,
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
            <th>Worker ID</th>
            <th>Name</th>
            <th>Trust Score</th>
            <th>Verdict</th>
            <th>Flags</th>
            <th>Payment Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workers.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={7}>
                Seed payroll to load Ogun State ministry workers.
              </td>
            </tr>
          ) : null}
          {workers.map((worker) => {
            const viq = viqs[worker.id];
            const anomaly = anomalyByCode.get(worker.worker_code);
            const flags = viq?.flags ?? (anomaly?.flagged ? ["ANOMALY_FLAGGED"] : []);
            const verdict = viq?.verdict ?? (anomaly?.flagged ? "REVIEW" : "PENDING");
            const score = viq?.trust_score ?? (anomaly?.flagged ? 76 : 92);
            return (
              <tr
                className={`${selectedId === worker.id ? styles.selected : ""} ${
                  anomaly?.flagged ? styles.flagged : ""
                }`}
                key={worker.id}
                onClick={() => onSelect(worker)}
              >
                <td>{worker.worker_code}</td>
                <td>{worker.full_name}</td>
                <td>
                  <TrustScoreGauge score={score} />
                </td>
                <td>
                  <Badge label={verdict} variant={verdictVariant(verdict)} />
                </td>
                <td>
                  <div className={styles.flags}>
                    {flags.length ? flags.map((flag) => <FlagPill flag={flag} key={flag} />) : "None"}
                  </div>
                </td>
                <td className={styles.payment}>
                  {viq?.payment_status === "TRANSFER_INITIATED"
                    ? "Paid"
                    : viq?.verdict === "FAIL"
                      ? "Blocked"
                      : "Held"}
                </td>
                <td>
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

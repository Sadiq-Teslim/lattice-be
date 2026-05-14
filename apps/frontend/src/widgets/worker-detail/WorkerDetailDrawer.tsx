import { X } from "lucide-react";
import type { AnomalyResult, Viq, Worker } from "@/shared/api/types";
import { Button, Card, FlagPill, TrustScoreGauge } from "@/shared/ui";
import styles from "./WorkerDetailDrawer.module.css";

type WorkerDetailDrawerProps = {
  worker: Worker | null;
  anomaly?: AnomalyResult;
  viq?: Viq;
  onClose: () => void;
};

const featureLabels: Record<string, string> = {
  device_id_frequency: "Same device as other workers",
  gps_cluster_density: "Repeated GPS location",
  bvn_collision_count: "Repeated BVN pattern",
  ip_subnet_overlap: "Shared network cluster",
  registration_burst_count: "Registered in suspicious burst",
};

export function WorkerDetailDrawer({ worker, anomaly, viq, onClose }: WorkerDetailDrawerProps) {
  if (!worker) return null;
  const flags = viq?.flags ?? (anomaly?.flagged ? ["ANOMALY_FLAGGED"] : []);
  const score = viq?.trust_score ?? (anomaly?.flagged ? 76 : 92);

  return (
    <aside className={styles.drawer}>
      <div className={styles.topbar}>
        <div>
          <span>Worker Detail</span>
          <h2>{worker.full_name}</h2>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close drawer">
          <X size={24} strokeWidth={1.5} />
        </button>
      </div>

      <div className={styles.gauge}>
        <TrustScoreGauge score={score} size="large" />
      </div>

      <section className={styles.flags}>
        {flags.length ? flags.map((flag) => <FlagPill flag={flag} key={flag} />) : "No active flags"}
      </section>

      <Card className={styles.section}>
        <h3>Why This Matters</h3>
        {anomaly?.explanations.length ? (
          <ul>
            {anomaly.explanations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>No suspicious payroll pattern detected for this worker.</p>
        )}
      </Card>

      <Card className={styles.section}>
        <h3>Anomaly Contribution</h3>
        <div className={styles.bars}>
          {(anomaly?.feature_contributions ?? []).slice(0, 5).map((item) => (
            <div className={styles.barRow} key={item.feature}>
              <span>{featureLabels[item.feature] ?? item.feature}</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${Math.min(100, item.contribution * 20)}%` }}
                />
              </div>
            </div>
          ))}
          {!anomaly?.feature_contributions.length ? <p>No contribution data yet.</p> : null}
        </div>
      </Card>

      <Card className={styles.section}>
        <h3>VIQ JSON</h3>
        <pre>{JSON.stringify(viq ?? { status: "No VIQ generated yet" }, null, 2)}</pre>
      </Card>

      <div className={styles.actions}>
        <Button fullWidth>Approve Payment</Button>
        <Button fullWidth variant="secondary">
          Flag for Investigation
        </Button>
      </div>
    </aside>
  );
}

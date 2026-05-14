import { Card } from "@/shared/ui";
import styles from "./StatsGrid.module.css";

type StatsGridProps = {
  total: number;
  verified: number;
  review: number;
  blocked: number;
};

export function StatsGrid({ total, verified, review, blocked }: StatsGridProps) {
  return (
    <div className={styles.grid}>
      <Stat label="Total Workers" value={total} tone="neutral" />
      <Stat label="Verified (PASS)" value={verified} tone="success" />
      <Stat label="Under Review" value={review} tone="warning" />
      <Stat label="Blocked (FAIL)" value={blocked} tone="danger" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className={styles.card}>
      <span>{label}</span>
      <strong className={styles[tone]}>{value}</strong>
    </Card>
  );
}

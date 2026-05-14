import { Card } from "@/shared/ui";
import styles from "./StatsGrid.module.css";

type StatsGridProps = {
  total: number;
  completeRecords: number;
  latticeCleared: number;
  held: number;
  netPayable: string;
};

export function StatsGrid({ total, completeRecords, latticeCleared, held, netPayable }: StatsGridProps) {
  return (
    <div className={styles.grid}>
      <Stat label="Nominal Roll" value={total} tone="neutral" />
      <Stat label="Complete Records" value={completeRecords} tone="success" />
      <Stat label="Lattice Cleared" value={latticeCleared} tone="success" />
      <Stat label="Held Exceptions" value={held} tone="warning" />
      <Stat label="Net Payable" value={netPayable} tone="danger" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <Card className={styles.card}>
      <span>{label}</span>
      <strong className={styles[tone]}>{value}</strong>
    </Card>
  );
}

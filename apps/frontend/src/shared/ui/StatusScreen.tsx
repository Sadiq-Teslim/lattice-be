import { CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "./Button";
import styles from "./StatusScreen.module.css";

type StatusScreenProps = {
  status: "pass" | "review" | "fail";
  workerName: string;
  amount?: string;
  reference?: string;
  viqId?: string;
};

const statusCopy = {
  pass: {
    title: "Verification Passed",
    body: "Your verification was successful. Salary release can proceed.",
    icon: CheckCircle,
  },
  review: {
    title: "Sent For Review",
    body: "HR will review this verification and respond within 24 hours.",
    icon: Clock,
  },
  fail: {
    title: "Verification Blocked",
    body: "Please contact HR to resolve this verification issue.",
    icon: XCircle,
  },
};

export function StatusScreen({ status, workerName, amount, reference, viqId }: StatusScreenProps) {
  const copy = statusCopy[status];
  const Icon = copy.icon;
  return (
    <main className={`${styles.screen} ${styles[status]}`}>
      <section className={styles.header}>
        <Icon size={64} strokeWidth={1.5} />
        <h1>{copy.title}</h1>
        <p>{workerName}</p>
      </section>
      <section className={styles.body}>
        <p>{copy.body}</p>
        {amount ? <strong>{amount}</strong> : null}
        {reference ? <span>Squad reference: {reference}</span> : null}
        {viqId ? <span>VIQ: {viqId}</span> : null}
        <Button fullWidth>Done</Button>
      </section>
    </main>
  );
}

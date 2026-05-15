import type { CSSProperties } from "react";
import styles from "./StepProgress.module.css";

type StepProgressProps = {
  steps: string[];
  currentStep: number;
};

export function StepProgress({ steps, currentStep }: StepProgressProps) {
  return (
    <ol
      className={styles.progress}
      aria-label="Progress"
      style={{ "--step-count": steps.length } as CSSProperties}
    >
      {steps.map((step, index) => {
        const state =
          index < currentStep ? styles.complete : index === currentStep ? styles.current : "";
        return (
          <li className={styles.step} key={step}>
            <span className={`${styles.dot} ${state}`} />
            <span className={styles.label}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

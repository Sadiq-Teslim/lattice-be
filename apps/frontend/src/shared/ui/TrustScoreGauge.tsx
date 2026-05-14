import styles from "./TrustScoreGauge.module.css";

type TrustScoreGaugeProps = {
  score: number;
  size?: "large" | "small";
};

export function TrustScoreGauge({ score, size = "small" }: TrustScoreGaugeProps) {
  const normalized = Math.max(0, Math.min(100, score));
  const radius = size === "large" ? 52 : 23;
  const dimension = size === "large" ? 120 : 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  const verdict = normalized >= 80 ? "PASS" : normalized >= 50 ? "REVIEW" : "FAIL";
  const tone = normalized >= 80 ? "success" : normalized >= 50 ? "warning" : "danger";

  return (
    <div className={`${styles.wrapper} ${styles[size]} ${styles[tone]}`}>
      <svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`}>
        <circle
          className={styles.track}
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          strokeWidth="8"
        />
        <circle
          className={styles.progress}
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className={styles.score}>{normalized}</div>
      {size === "large" ? <div className={styles.verdict}>{verdict}</div> : null}
    </div>
  );
}

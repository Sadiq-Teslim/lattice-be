import type { LucideIcon } from "lucide-react";
import styles from "./Badge.module.css";

type BadgeVariant = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  icon?: LucideIcon;
};

export function Badge({ label, variant = "neutral", icon: Icon }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      {Icon ? <Icon aria-hidden size={16} strokeWidth={1.5} /> : null}
      {label}
    </span>
  );
}

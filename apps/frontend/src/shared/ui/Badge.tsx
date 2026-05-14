import type { LucideIcon } from "lucide-react";
import { Badge as MantineBadge } from "@mantine/core";
import styles from "./Badge.module.css";

type BadgeVariant = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  icon?: LucideIcon;
};

export function Badge({ label, variant = "neutral", icon: Icon }: BadgeProps) {
  const color = variant === "danger" ? "red" : variant === "warning" ? "yellow" : "green";
  return (
    <MantineBadge
      className={`${styles.badge} ${styles[variant]}`}
      color={color}
      leftSection={Icon ? <Icon aria-hidden size={14} strokeWidth={1.5} /> : null}
      radius="xl"
      size="lg"
      variant="light"
    >
      {label}
    </MantineBadge>
  );
}

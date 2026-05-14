"use client";

import { Loader2 } from "lucide-react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "destructive";
type ButtonSize = "default" | "small";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  size = "default",
  fullWidth = false,
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 aria-hidden className={styles.spinner} size={20} /> : children}
    </button>
  );
}

"use client";

import { Button as MantineButton } from "@mantine/core";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "destructive";
type ButtonSize = "default" | "small";

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
};

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
  return (
    <MantineButton
      className={`${styles.button} ${className ?? ""}`}
      color={variant === "destructive" ? "red" : "green"}
      disabled={disabled}
      fullWidth={fullWidth}
      loading={loading}
      radius={8}
      size={size === "small" ? "sm" : "md"}
      variant={variant === "secondary" ? "outline" : "filled"}
      {...props}
    >
      <span className={styles.content}>
        {Array.isArray(children)
          ? children.map((child, index) => (
              <span className={styles.contentItem} key={index}>
                {child}
              </span>
            ))
          : children}
      </span>
    </MantineButton>
  );
}

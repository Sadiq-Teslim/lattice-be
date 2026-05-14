import { Card as MantineCard, type CardProps as MantineCardProps } from "@mantine/core";
import styles from "./Card.module.css";

type CardProps = Omit<MantineCardProps, "children"> & {
  children: React.ReactNode;
  elevated?: boolean;
  className?: string;
};

export function Card({ children, elevated = false, className, ...props }: CardProps) {
  return (
    <MantineCard
      className={`${styles.card} ${elevated ? styles.elevated : ""} ${className ?? ""}`}
      component="section"
      radius={12}
      shadow={elevated ? "md" : "xs"}
      withBorder
      {...props}
    >
      {children}
    </MantineCard>
  );
}

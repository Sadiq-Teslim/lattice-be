import styles from "./Card.module.css";

type CardProps = {
  children: React.ReactNode;
  elevated?: boolean;
  className?: string;
};

export function Card({ children, elevated = false, className }: CardProps) {
  return (
    <section className={`${styles.card} ${elevated ? styles.elevated : ""} ${className ?? ""}`}>
      {children}
    </section>
  );
}

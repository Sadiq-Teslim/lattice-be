import { AlertTriangle, Banknote, FileText, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import styles from "./Sidebar.module.css";

const items = [
  { label: "Payroll Run", icon: LayoutDashboard, active: true },
  { label: "Nominal Roll", icon: Users },
  { label: "Lattice Gate", icon: ShieldCheck },
  { label: "Exceptions", icon: AlertTriangle },
  { label: "Disbursement", icon: Banknote },
  { label: "Audit Log", icon: FileText },
];

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.seal}>OG</div>
        <span>Ogun Payroll</span>
      </div>
      <nav className={styles.nav}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button className={`${styles.navItem} ${item.active ? styles.active : ""}`} key={item.label}>
              <Icon size={20} strokeWidth={1.5} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className={styles.ministry}>
        <span>Ogun State</span>
        <strong>Ministry of Education</strong>
      </div>
    </aside>
  );
}

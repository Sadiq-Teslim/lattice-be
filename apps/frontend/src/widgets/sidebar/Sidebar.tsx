import { AlertTriangle, FileText, LayoutDashboard, Shield, Users } from "lucide-react";
import styles from "./Sidebar.module.css";

const items = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Workers", icon: Users },
  { label: "Anomaly Detection", icon: AlertTriangle },
  { label: "Audit Log", icon: FileText },
];

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <Shield size={28} strokeWidth={1.5} />
        <span>Lattice</span>
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

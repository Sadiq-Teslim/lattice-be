import {
  Banknote,
  ClipboardCheck,
  FileArchive,
  FileText,
  LayoutDashboard,
  Settings,
  UploadCloud,
  Users,
} from "lucide-react";
import styles from "./Sidebar.module.css";

export type ConsolePage =
  | "dashboard"
  | "staff"
  | "payroll"
  | "exercises"
  | "submissions"
  | "disbursements"
  | "documents"
  | "reports"
  | "settings";

const items: Array<{ key: ConsolePage; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "staff", label: "Staff Records", icon: Users },
  { key: "payroll", label: "Payroll", icon: Banknote },
  { key: "exercises", label: "Verification Exercises", icon: ClipboardCheck },
  { key: "submissions", label: "Submissions", icon: UploadCloud },
  { key: "disbursements", label: "Disbursements", icon: Banknote },
  { key: "documents", label: "Documents", icon: FileArchive },
  { key: "reports", label: "Reports & Audit", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

type SidebarProps = {
  activePage: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
};

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <img alt="Ogun State Government" src="/ogun-logo.png" />
        <span>Ogun Payroll</span>
      </div>
      <nav className={styles.nav}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`${styles.navItem} ${activePage === item.key ? styles.active : ""}`}
              key={item.key}
              onClick={() => onNavigate(item.key)}
            >
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

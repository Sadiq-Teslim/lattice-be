"use client";

import { useState } from "react";
import {
  ActionIcon,
  Box,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <Group className={styles.logo} gap="sm" justify={collapsed ? "center" : "space-between"} wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <img alt="Ogun State Government" src="/ogun-logo.png" />
          {!collapsed ? <Text fw={900}>Ogun Payroll</Text> : null}
        </Group>
        <ActionIcon
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={styles.collapseButton}
          onClick={() => setCollapsed((value) => !value)}
          radius="md"
          size="lg"
          variant="subtle"
        >
          <Burger opened={!collapsed} size={18} />
        </ActionIcon>
      </Group>

      <Stack className={styles.nav} gap={6}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;
          const nav = (
            <NavLink
              active={active}
              className={styles.navItem}
              classNames={{
                body: styles.navBody,
                label: styles.navLabel,
                root: styles.navRoot,
                section: styles.navSection,
              }}
              color="green"
              label={collapsed ? "" : item.label}
              leftSection={<Icon size={20} strokeWidth={1.7} />}
              onClick={() => onNavigate(item.key)}
              variant="filled"
            />
          );
          return collapsed ? (
            <Tooltip key={item.key} label={item.label} openDelay={120} position="right" withArrow>
              <Box className={styles.tooltipTarget}>{nav}</Box>
            </Tooltip>
          ) : (
            <Box key={item.key}>{nav}</Box>
          );
        })}
      </Stack>

      {!collapsed ? (
        <Box className={styles.ministry}>
          <Text c="dimmed" size="sm">Ogun State</Text>
          <Text fw={900}>Ministry of Education</Text>
        </Box>
      ) : null}
    </aside>
  );
}

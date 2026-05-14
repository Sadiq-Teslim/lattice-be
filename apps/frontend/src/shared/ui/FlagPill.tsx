import { AlertTriangle, Lock, ShieldAlert } from "lucide-react";
import { Badge } from "./Badge";

export type RiskFlag =
  | "LIVENESS_FAIL"
  | "DEEPFAKE_DETECTED"
  | "ANOMALY_FLAGGED"
  | "BVN_MISMATCH"
  | "DOB_MISMATCH"
  | "FACE_MISMATCH"
  | "DOCUMENT_INCONSISTENCY";

const flagConfig: Record<string, { label: string; variant: "warning" | "danger"; icon?: typeof Lock }> = {
  LIVENESS_FAIL: { label: "Liveness Failed", variant: "danger", icon: ShieldAlert },
  DEEPFAKE_DETECTED: { label: "Deepfake Detected", variant: "danger", icon: Lock },
  ANOMALY_FLAGGED: { label: "Anomaly Detected", variant: "warning", icon: AlertTriangle },
  BVN_MISMATCH: { label: "Identity Mismatch", variant: "warning", icon: AlertTriangle },
  DOB_MISMATCH: { label: "Date of Birth Mismatch", variant: "warning", icon: AlertTriangle },
  FACE_MISMATCH: { label: "Face Mismatch", variant: "danger", icon: ShieldAlert },
  DOCUMENT_INCONSISTENCY: {
    label: "Document Issue",
    variant: "warning",
    icon: AlertTriangle,
  },
};

export function FlagPill({ flag }: { flag: string }) {
  const config = flagConfig[flag] ?? {
    label: flag.replaceAll("_", " "),
    variant: "warning" as const,
    icon: AlertTriangle,
  };
  return <Badge label={config.label} variant={config.variant} icon={config.icon} />;
}

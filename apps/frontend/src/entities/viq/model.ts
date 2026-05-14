export function verdictVariant(verdict?: string) {
  if (verdict === "PASS") return "success" as const;
  if (verdict === "FAIL") return "danger" as const;
  return "warning" as const;
}

export function scoreFromVerdict(verdict?: string) {
  if (verdict === "PASS") return 94;
  if (verdict === "FAIL") return 30;
  return 68;
}

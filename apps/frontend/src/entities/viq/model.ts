export function verdictVariant(verdict?: string) {
  if (verdict === "PASS") return "success" as const;
  if (verdict === "FAIL") return "danger" as const;
  return "warning" as const;
}

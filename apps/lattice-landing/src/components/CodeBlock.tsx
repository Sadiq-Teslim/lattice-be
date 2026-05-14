export function CodeBlock({ children, compact = false }: { children: string; compact?: boolean }) {
  return (
    <pre className={compact ? "code-panel compact-code" : "code-panel"}>
      <code>{children}</code>
    </pre>
  );
}

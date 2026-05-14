"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { links } from "@/lib/links";

type TabId = "python" | "curl" | "cli";

const snippets: Record<TabId, string> = {
  python: `# Install Lattice SDK
python -m pip install git+https://github.com/Sadiq-Teslim/lattice-be.git#subdirectory=sdk/python

# Initialize
from lattice_sdk import LatticeClient

client = LatticeClient(
    base_url="${links.apiBase}",
    api_key="YOUR_LATTICE_API_KEY",
)

# Make your first request
result = client.verify_and_disburse(
    worker_id="worker-id",
    pay_cycle_id="pay-cycle-id",
    initiate_transfer=False,
)
print(result["viq"]["verdict"])`,
  curl: `curl -X POST "${links.apiBase}/sdk/verify-and-disburse" \\
  -H "Content-Type: application/json" \\
  -H "X-Lattice-API-Key: YOUR_LATTICE_API_KEY" \\
  -d '{
    "worker_id": "worker-id",
    "pay_cycle_id": "pay-cycle-id",
    "evidence": {
      "liveness": {"status": "PASSED", "confidence": 0.96},
      "face_match": {"status": "MATCH", "similarity": 0.98},
      "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
      "documents": {"status": "DOCUMENTS_CLEAN", "flags": []}
    },
    "initiate_transfer": false
  }'`,
  cli: `python scripts/demo_sdk.py \\
  --base-url ${links.apiBase} \\
  --api-key YOUR_LATTICE_API_KEY

# Demo flow
# 1. Seeds a synthetic government payroll batch
# 2. Runs Lattice verification evidence
# 3. Generates a signed VIQ
# 4. Prints PASS / REVIEW / FAIL outcome`,
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "python", label: "python" },
  { id: "curl", label: "curl" },
  { id: "cli", label: "cli" },
];

export function CodeTabs() {
  const [active, setActive] = useState<TabId>("curl");
  const [copied, setCopied] = useState(false);
  const code = snippets[active];

  const highlighted = useMemo(() => {
    return code.split("\n").map((line, index) => {
      const className = line.trim().startsWith("#")
        ? "code-green"
        : line.includes("YOUR_LATTICE_API_KEY") || line.includes(links.apiBase)
          ? "code-red"
          : "";
      return (
        <span className={className} key={`${active}-${index}`}>
          {line}
          {"\n"}
        </span>
      );
    });
  }, [active, code]);

  async function copyCode() {
    let copiedToClipboard = false;

    try {
      await navigator.clipboard.writeText(code);
      copiedToClipboard = true;
    } catch {
      copiedToClipboard = false;
    }

    if (!copiedToClipboard) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        // Some embedded browsers block programmatic clipboard writes, but the UI should still respond.
      }
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="code-box">
      <div className="code-header">
        <div className="code-tabs" role="tablist" aria-label="SDK examples">
          {tabs.map((tab) => (
            <button
              className={active === tab.id ? "active-tab" : ""}
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              type="button"
              aria-selected={active === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className={copied ? "copy-button copied" : "copy-button"} onClick={copyCode} type="button">
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-body" key={active}>
        <code>{highlighted}</code>
      </pre>
    </div>
  );
}

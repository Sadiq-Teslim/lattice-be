export const stats = [
  {
    value: "23,846",
    label: "ghost workers reportedly removed in Kaduna",
    detail: "Public reports also cite NGN 36.5B in annual recovery.",
  },
  {
    value: "5,070",
    label: "ghost workers reportedly exposed by a Lagos audit",
    detail: "A reminder that stale payroll records become payment risk.",
  },
  {
    value: "BVN",
    label: "used by Ogun as a salary-verification control",
    detail: "Public reports connect staff verification to salary release.",
  },
];

export const capabilities = [
  {
    title: "Proof of life",
    points: ["Liveness challenge", "Face and identity signals", "Model-backed media-risk inference"],
  },
  {
    title: "Document consistency",
    points: ["DOB comparison", "Appointment vs first salary date", "Missing record detection"],
  },
  {
    title: "Payroll anomaly detection",
    points: ["Duplicate BVN", "Shared device clusters", "GPS/IP and registration bursts"],
  },
  {
    title: "Payment gate",
    points: ["Trust Score", "PASS / REVIEW / FAIL", "Signed VIQ and webhook trail"],
  },
];

export const workflow = [
  "Payroll system creates a pay cycle",
  "Lattice creates worker verification sessions",
  "Worker completes OTP, liveness, and document submission",
  "Lattice evaluates identity, documents, and anomaly risk",
  "Lattice returns a signed VIQ",
  "Payroll releases only PASS workers",
  "Squad webhook closes the payment audit trail",
];

export const apiGroups = [
  {
    title: "Health",
    routes: [{ method: "GET", path: "/api/v1/health", detail: "Checks service status." }],
  },
  {
    title: "Demo payroll",
    routes: [
      { method: "POST", path: "/api/v1/demo/seed", detail: "Creates synthetic ministry payroll data." },
      { method: "GET", path: "/api/v1/demo/anomalies", detail: "Runs anomaly detection for a pay cycle." },
    ],
  },
  {
    title: "Workers and pay cycles",
    routes: [
      { method: "GET", path: "/api/v1/workers", detail: "Lists worker records." },
      { method: "GET", path: "/api/v1/pay-cycles", detail: "Lists pay cycles." },
    ],
  },
  {
    title: "Verification sessions",
    routes: [
      { method: "POST", path: "/api/v1/verification/sessions", detail: "Creates a worker verification session." },
      {
        method: "POST",
        path: "/api/v1/verification/sessions/{session_id}/evidence",
        detail: "Submits liveness, face, BVN, deepfake, and document evidence.",
      },
      {
        method: "POST",
        path: "/api/v1/verification/sessions/{session_id}/finalize",
        detail: "Generates a VIQ.",
      },
    ],
  },
  {
    title: "SDK orchestration",
    routes: [
      {
        method: "POST",
        path: "/api/v1/sdk/verify-and-disburse",
        detail: "Runs verification and optional disbursement in one call. Requires X-Lattice-API-Key.",
      },
    ],
  },
  {
    title: "AI checks",
    routes: [
      { method: "POST", path: "/api/v1/ai/liveness/evaluate", detail: "Evaluates liveness challenge results." },
      {
        method: "POST",
        path: "/api/v1/ai/document-consistency/evaluate",
        detail: "Checks staff document consistency.",
      },
      {
        method: "POST",
        path: "/api/v1/ai/bias-audit/liveness/demo",
        detail: "Returns demo fairness metrics.",
      },
    ],
  },
  {
    title: "Squad bridge",
    routes: [
      { method: "POST", path: "/api/v1/squad/account-lookup", detail: "Looks up bank account identity." },
      {
        method: "POST",
        path: "/api/v1/squad/virtual-accounts/workers",
        detail: "Creates worker-linked virtual accounts when configured.",
      },
      { method: "POST", path: "/api/v1/squad/transfers/viq", detail: "Initiates VIQ-linked transfers." },
      { method: "POST", path: "/api/v1/webhooks/squad", detail: "Receives Squad payment events." },
    ],
  },
];

export const useCases = [
  {
    title: "Government payroll",
    detail: "Prevent salary release without proof-of-life and reduce ghost-worker exposure.",
  },
  {
    title: "Annual staff verification",
    detail: "Replace manual file checks with generated verification links and auditable outcomes.",
  },
  {
    title: "Schools and tertiary institutions",
    detail: "Verify teachers and staff across LGAs, then flag no-shows and inconsistent records.",
  },
  {
    title: "Payroll platforms",
    detail: "Integrate Lattice as a trust layer before disbursement without replacing the payroll core.",
  },
];

export const sources = [
  {
    title: "OAGF IPPIS overview",
    detail: "Centralized personnel database, salary monitoring, payment controls, and remittance handling.",
    href: "https://oagf.gov.ng/initiative/ippis/",
  },
  {
    title: "Civil Service IPPIS department",
    detail: "Biometric enrollment, personnel audit, recurring re-verification, and nominal roll fields.",
    href: "https://clients.rvomedia.com/ohcsf1/department/ippis/",
  },
  {
    title: "Ogun staff biometrics portal",
    detail: "Public staff biometrics registration and verification portal for Ogun State.",
    href: "https://verifystaff.ogunstate.gov.ng/",
  },
  {
    title: "Ogun BVN salary control",
    detail: "Public report on BVN-linked salary controls for Ogun workers.",
    href: "https://dailytrust.com/no-bvn-no-salary-ogun-govt-tells-workers/",
  },
  {
    title: "Ogun personnel verification",
    detail: "Public report on verification for workers in Ogun tertiary institutions.",
    href: "https://dailytrust.com/ogun-begins-verification-of-workers-in-tertiary-institutions/",
  },
  {
    title: "Squad API docs",
    detail: "Payment, virtual account, SMS, webhook, and identity infrastructure references.",
    href: "https://docs.squadco.com/",
  },
];

export const pythonSnippet = `from lattice_sdk import LatticeClient

client = LatticeClient(
    base_url="https://lattice-be.onrender.com/api/v1",
    api_key="YOUR_LATTICE_API_KEY",
)

result = client.verify_and_disburse(
    worker_id="worker-id",
    pay_cycle_id="pay-cycle-id",
    evidence={
        "liveness": {"status": "PASSED", "confidence": 0.96, "attempts": 1},
        "deepfake": {"status": "CLEAN", "synthetic_probability": 0.02},
        "face_match": {"status": "MATCH", "similarity": 0.98},
        "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
        "documents": {
            "status": "DOCUMENTS_CLEAN",
            "severity": "NONE",
            "flags": [],
            "summary": "No document contradictions found.",
        },
    },
    initiate_transfer=False,
)

print(result["viq"]["verdict"], result["viq"]["trust_score"])`;

export const viqSnippet = `{
  "worker_id": "EDU-OG-00095",
  "trust_score": 94,
  "verdict": "PASS",
  "flags": [],
  "liveness": "PASSED",
  "documents": "DOCUMENTS_CLEAN",
  "bvn_match": true,
  "payment_status": "READY",
  "timestamp": "2026-05-14T10:00:00Z"
}`;

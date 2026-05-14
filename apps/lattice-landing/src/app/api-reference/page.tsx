"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteNav } from "@/components/SiteNav";
import { links } from "@/lib/links";

type Endpoint = {
  id: string;
  group: string;
  title: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  auth?: string;
  parameters: Array<{ name: string; type: string; required: string; description: string }>;
  request?: string;
  response: string;
};

const endpoints: Endpoint[] = [
  {
    id: "verify-and-disburse",
    group: "SDK orchestration",
    title: "Verify and disburse",
    method: "POST",
    path: "/api/v1/sdk/verify-and-disburse",
    auth: "X-Lattice-API-Key",
    summary:
      "Runs proof-of-life, document, BVN, anomaly, VIQ, and optional payment orchestration in one request.",
    parameters: [
      { name: "worker_id", type: "string", required: "Yes", description: "Worker record to verify." },
      { name: "pay_cycle_id", type: "string", required: "Yes", description: "Payroll cycle being gated." },
      { name: "evidence", type: "object", required: "No", description: "Pre-collected liveness, BVN, face, and document signals." },
      { name: "initiate_transfer", type: "boolean", required: "No", description: "When true, attempts a Squad-backed release for PASS VIQs." },
    ],
    request: `curl -X POST "${links.apiBase}/sdk/verify-and-disburse" \\
  -H "Content-Type: application/json" \\
  -H "X-Lattice-API-Key: YOUR_LATTICE_API_KEY" \\
  -d '{
    "worker_id": "EDU-OG-00095",
    "pay_cycle_id": "MAY-2026",
    "evidence": {
      "liveness": { "status": "PASSED", "confidence": 0.96 },
      "face_match": { "status": "MATCH", "similarity": 0.98 },
      "bvn": { "status": "BVN_MATCH", "provider": "SQUAD" },
      "documents": { "status": "DOCUMENTS_CLEAN", "flags": [] }
    },
    "initiate_transfer": false
  }'`,
    response: `{
  "status": "success",
  "verification_session_id": "vsn_9a72",
  "viq": {
    "worker_id": "EDU-OG-00095",
    "trust_score": 94,
    "verdict": "PASS",
    "payment_status": "READY"
  }
}`,
  },
  {
    id: "create-session",
    group: "Verification sessions",
    title: "Create verification session",
    method: "POST",
    path: "/api/v1/verification/sessions",
    summary: "Creates a verification session for a worker before salary release.",
    parameters: [
      { name: "worker_id", type: "string", required: "Yes", description: "Worker to verify." },
      { name: "pay_cycle_id", type: "string", required: "Yes", description: "Pay cycle the session belongs to." },
    ],
    request: `{
  "worker_id": "EDU-OG-00095",
  "pay_cycle_id": "MAY-2026"
}`,
    response: `{
  "id": "vsn_9a72",
  "status": "PENDING",
  "worker_id": "EDU-OG-00095",
  "pay_cycle_id": "MAY-2026"
}`,
  },
  {
    id: "submit-evidence",
    group: "Verification sessions",
    title: "Submit evidence",
    method: "POST",
    path: "/api/v1/verification/sessions/{session_id}/evidence",
    summary: "Submits identity, liveness, BVN, deepfake, and document evidence for scoring.",
    parameters: [
      { name: "session_id", type: "path string", required: "Yes", description: "Verification session identifier." },
      { name: "liveness", type: "object", required: "No", description: "Liveness challenge outcome." },
      { name: "documents", type: "object", required: "No", description: "Document consistency result and flags." },
      { name: "bvn", type: "object", required: "No", description: "BVN match result, usually backed by Squad rails." },
    ],
    request: `{
  "liveness": { "status": "PASSED", "confidence": 0.96 },
  "deepfake": { "status": "CLEAN", "synthetic_probability": 0.02 },
  "documents": {
    "status": "DOCUMENTS_CLEAN",
    "summary": "No contradictions found."
  }
}`,
    response: `{
  "id": "vsn_9a72",
  "status": "EVIDENCE_RECEIVED",
  "risk_flags": []
}`,
  },
  {
    id: "finalize-session",
    group: "Verification sessions",
    title: "Finalize session",
    method: "POST",
    path: "/api/v1/verification/sessions/{session_id}/finalize",
    summary: "Finalizes evidence review and generates the signed VIQ decision.",
    parameters: [
      { name: "session_id", type: "path string", required: "Yes", description: "Verification session identifier." },
    ],
    response: `{
  "session_id": "vsn_9a72",
  "viq_id": "viq_4f1d",
  "verdict": "PASS",
  "trust_score": 94
}`,
  },
  {
    id: "document-consistency",
    group: "AI checks",
    title: "Evaluate document consistency",
    method: "POST",
    path: "/api/v1/ai/document-consistency/evaluate",
    summary: "Checks appointment dates, first salary dates, missing records, and document contradictions.",
    parameters: [
      { name: "worker_id", type: "string", required: "No", description: "Optional worker context." },
      { name: "documents", type: "array", required: "Yes", description: "Structured document facts to compare." },
    ],
    request: `{
  "documents": [
    { "type": "appointment_letter", "issued_at": "2018-04-11" },
    { "type": "first_salary_record", "issued_at": "2018-05-31" }
  ]
}`,
    response: `{
  "status": "DOCUMENTS_CLEAN",
  "severity": "NONE",
  "flags": [],
  "summary": "No document contradictions found."
}`,
  },
  {
    id: "account-lookup",
    group: "Squad bridge",
    title: "Account lookup",
    method: "POST",
    path: "/api/v1/squad/account-lookup",
    summary: "Looks up bank account identity before a VIQ-linked transfer is initiated.",
    parameters: [
      { name: "bank_code", type: "string", required: "Yes", description: "NIP bank code for the receiving bank." },
      { name: "account_number", type: "string", required: "Yes", description: "Recipient account number to validate." },
    ],
    request: `{
  "bank_code": "000013",
  "account_number": "0123456789"
}`,
    response: `{
  "success": true,
  "provider": "SQUAD",
  "data": {
    "account_name": "JENNY SQUAD",
    "account_number": "0123456789"
  }
}`,
  },
  {
    id: "squad-webhook",
    group: "Webhooks",
    title: "Receive Squad webhook",
    method: "POST",
    path: "/api/v1/webhooks/squad",
    summary: "Receives payment confirmations and attaches the event to the Lattice audit trail.",
    parameters: [
      { name: "x-squad-signature", type: "header", required: "Recommended", description: "Signature header used to verify source authenticity." },
      { name: "event", type: "object", required: "Yes", description: "Squad webhook payload." },
    ],
    request: `{
  "event": "transfer.success",
  "transaction_reference": "LAT-MAY-2026-00095",
  "amount": 24500000,
  "status": "success"
}`,
    response: `{
  "received": true,
  "status": "ACKNOWLEDGED"
}`,
  },
];

const pageLinks = [
  { href: "#introduction", label: "Introduction" },
  { href: "#authentication", label: "Authentication" },
  { href: "#verify-and-disburse", label: "Verify and disburse" },
  { href: "#create-session", label: "Create session" },
  { href: "#submit-evidence", label: "Submit evidence" },
  { href: "#finalize-session", label: "Finalize session" },
  { href: "#document-consistency", label: "Document consistency" },
  { href: "#account-lookup", label: "Account lookup" },
  { href: "#squad-webhook", label: "Squad webhook" },
];

const navGroups = [
  {
    title: "SDK orchestration",
    items: [{ href: "#verify-and-disburse", method: "POST", label: "Verify and disburse" }],
  },
  {
    title: "Verification sessions",
    items: [
      { href: "#create-session", method: "POST", label: "Create session" },
      { href: "#submit-evidence", method: "POST", label: "Submit evidence" },
      { href: "#finalize-session", method: "POST", label: "Finalize session" },
    ],
  },
  {
    title: "AI checks",
    items: [{ href: "#document-consistency", method: "POST", label: "Document consistency" }],
  },
  {
    title: "Squad bridge",
    items: [
      { href: "#account-lookup", method: "POST", label: "Account lookup" },
      { href: "#squad-webhook", method: "POST", label: "Squad webhook" },
    ],
  },
];

export default function ApiReferencePage() {
  const sectionIds = useMemo(
    () => ["introduction", "authentication", ...endpoints.map((endpoint) => endpoint.id)],
    [],
  );
  const [activeSection, setActiveSection] = useState(sectionIds[0]);

  useEffect(() => {
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible?.target.id) {
          setActiveSection(visible.target.id);
        }
      },
      {
        rootMargin: "-18% 0px -62% 0px",
        threshold: [0.08, 0.18, 0.32, 0.5, 0.72],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  return (
    <main className="page">
      <SiteNav />
      <section className="api-doc-hero" id="introduction">
        <div>
          <span>API reference</span>
          <h1>Lattice API Documentation</h1>
          <p>
            Choose a product group, inspect the endpoint contract, send a request, and confirm the
            response before connecting payroll or verification workflows.
          </p>
        </div>
        <div className="api-meta-card">
          <span>Base URL</span>
          <code>{links.apiBase}</code>
          <Link href={links.apiDocs} target="_blank">
            Open live OpenAPI <ExternalLink size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="api-doc-shell">
        <aside className="api-sidebar" aria-label="API groups">
          <div className="api-sidebar-title">API groups</div>
          {navGroups.map((group) => (
            <div className="api-menu-group" key={group.title}>
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <a
                  aria-current={activeSection === item.href.slice(1) ? "true" : undefined}
                  className={activeSection === item.href.slice(1) ? "is-active" : undefined}
                  href={item.href}
                  key={`${group.title}-${item.href}`}
                >
                  <span className={`method-pill ${item.method.toLowerCase()}`}>{item.method}</span>
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ))}
        </aside>

        <div className="api-doc-content">
          <section className="doc-block" id="authentication">
            <div className="doc-block-heading">
              <span>Before you begin</span>
              <h2>Authentication</h2>
              <p>
                Protected Lattice SDK routes use the <code>X-Lattice-API-Key</code> header. Squad
                bridge calls are server-side wrappers, so your frontend should never expose Squad
                secret keys.
              </p>
            </div>
            <pre className="api-code"><code>{`X-Lattice-API-Key: YOUR_LATTICE_API_KEY
Content-Type: application/json`}</code></pre>
          </section>

          {endpoints.map((endpoint) => (
            <article className="endpoint-block" id={endpoint.id} key={endpoint.id}>
              <div className="endpoint-heading">
                <span>{endpoint.group}</span>
                <h2>{endpoint.title}</h2>
                <p>{endpoint.summary}</p>
                <div className="endpoint-url">
                  <span className={`method-pill ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                  <code>{endpoint.path}</code>
                </div>
                {endpoint.auth ? <p className="auth-note">Requires: {endpoint.auth}</p> : null}
              </div>

              <div className="endpoint-section">
                <h3>Parameters</h3>
                <div className="param-table" role="table" aria-label={`${endpoint.title} parameters`}>
                  <div className="param-row param-head" role="row">
                    <span>Name</span>
                    <span>Type</span>
                    <span>Required</span>
                    <span>Description</span>
                  </div>
                  {endpoint.parameters.map((param) => (
                    <div className="param-row" role="row" key={`${endpoint.id}-${param.name}`}>
                      <code>{param.name}</code>
                      <span>{param.type}</span>
                      <strong>{param.required}</strong>
                      <span>{param.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {endpoint.request ? (
                <div className="endpoint-section">
                  <h3>Sample Request</h3>
                  <pre className="api-code"><code>{endpoint.request}</code></pre>
                </div>
              ) : null}

              <div className="endpoint-section">
                <h3>Responses</h3>
                <pre className="api-code"><code>{endpoint.response}</code></pre>
              </div>
            </article>
          ))}
        </div>

        <aside className="api-on-page" aria-label="On this page">
          <div className="api-sidebar-title">On this page</div>
          {pageLinks.map((item) => (
            <a
              aria-current={activeSection === item.href.slice(1) ? "true" : undefined}
              className={activeSection === item.href.slice(1) ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </aside>
      </section>
      <Footer />
    </main>
  );
}

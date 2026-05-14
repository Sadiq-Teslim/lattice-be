import { env } from "@/shared/config/env";
import type {
  AnomalyScanResponse,
  BiasAuditResponse,
  DemoSeedResponse,
  DocumentConsistencyResponse,
  JobResponse,
  LivenessEvaluationResponse,
  VerificationFinalizeResponse,
  VerificationSession,
  VerifyAndDisburseResponse,
  Worker,
} from "./types";

type RequestOptions = RequestInit & {
  protected?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.protected && env.latticeApiKey) {
    headers.set("X-Lattice-API-Key", env.latticeApiKey);
  }

  try {
    const response = await fetch(`${env.apiUrl}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      signal: options.signal ?? controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(
        typeof payload?.detail === "string"
          ? payload.detail
          : payload?.detail?.message || `Request failed with ${response.status}`,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The Lattice API is taking too long to respond. Please retry.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const latticeApi = {
  health: () => request<{ status: string; service: string; environment: string }>("/health"),

  seedPayroll: () =>
    request<DemoSeedResponse>("/demo/seed", {
      method: "POST",
      body: JSON.stringify({
        count: 100,
        ghost_count: 5,
        seed: 42,
        ministry: "Ogun State Ministry of Education",
      }),
    }),

  listWorkers: (ministry: string) =>
    request<Worker[]>(`/workers?ministry=${encodeURIComponent(ministry)}&limit=100`),

  scanAnomalies: (payCycleId: string) =>
    request<AnomalyScanResponse>(`/demo/anomalies?pay_cycle_id=${encodeURIComponent(payCycleId)}`),

  evaluateDocumentConsistency: (worker: Worker, overrides: Partial<{
    payroll_dob: string;
    bvn_dob: string;
    file_dob: string;
    appointment_date: string;
    first_salary_date: string;
    confirmation_date: string;
    last_promotion_date: string;
    retirement_date: string;
    required_documents: string[];
    submitted_documents: string[];
  }> = {}) =>
    request<DocumentConsistencyResponse>("/ai/document-consistency/evaluate", {
      method: "POST",
      body: JSON.stringify({
        worker_record: {
          worker_id: worker.worker_code,
          full_name: worker.full_name,
          payroll_dob: isoDate(worker.date_of_birth) ?? "1986-03-14",
          bvn_dob: isoDate(worker.date_of_birth) ?? "1986-03-14",
          file_dob: isoDate(worker.date_of_birth) ?? "1986-03-14",
          appointment_date: "2014-09-15",
          first_salary_date: "2014-10-25",
          confirmation_date: "2016-09-15",
          last_promotion_date: "2023-01-01",
          retirement_date: "2046-03-14",
          document_numbers: {
            appointment_letter: `OG-MOE-${worker.worker_code.slice(-5)}`,
            bvn: worker.bvn,
          },
          required_documents: ["appointment_letter", "birth_certificate", "promotion_letter"],
          submitted_documents: ["appointment_letter", "birth_certificate", "promotion_letter"],
          ...overrides,
        },
        cohort_records: [],
      }),
    }),

  evaluateLiveness: (payload: {
    challenge: string;
    blink_count: number;
    head_turn_degrees: number;
    confidence: number;
    attempts: number;
    captured_at: string;
  }) =>
    request<LivenessEvaluationResponse>("/ai/liveness/evaluate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createVerificationSession: (workerId: string, payCycleId: string) =>
    request<VerificationSession>("/verification/sessions", {
      method: "POST",
      body: JSON.stringify({ worker_id: workerId, pay_cycle_id: payCycleId }),
    }),

  submitVerificationEvidence: (
    sessionId: string,
    evidence: {
      liveness?: Record<string, unknown>;
      deepfake?: Record<string, unknown>;
      face_match?: Record<string, unknown>;
      bvn?: Record<string, unknown>;
      documents?: Record<string, unknown>;
    },
  ) =>
    request<VerificationSession>(`/verification/sessions/${encodeURIComponent(sessionId)}/evidence`, {
      method: "POST",
      body: JSON.stringify(evidence),
    }),

  finalizeVerificationSession: (sessionId: string) =>
    request<VerificationFinalizeResponse>(
      `/verification/sessions/${encodeURIComponent(sessionId)}/finalize`,
      { method: "POST" },
    ),

  verifyAndDisburse: (workerId: string, payCycleId: string) =>
    request<VerifyAndDisburseResponse>("/sdk/verify-and-disburse", {
      method: "POST",
      protected: true,
      body: JSON.stringify({
        worker_id: workerId,
        pay_cycle_id: payCycleId,
        evidence: {
          liveness: { status: "PASSED", confidence: 0.96, attempts: 1 },
          deepfake: { status: "CLEAN", synthetic_probability: 0.02 },
          face_match: { status: "MATCH", similarity: 0.98 },
          bvn: { status: "BVN_MATCH", provider: "SQUAD" },
          documents: {
            status: "DOCUMENTS_CLEAN",
            severity: "NONE",
            flags: [],
            summary: "No document contradictions found.",
          },
        },
        initiate_transfer: false,
      }),
    }),

  enqueueVerification: (workerId: string, payCycleId: string) =>
    request<{ job_id: string; status: string }>("/jobs/sdk-verification", {
      method: "POST",
      protected: true,
      body: JSON.stringify({
        request: {
          worker_id: workerId,
          pay_cycle_id: payCycleId,
          evidence: {
            liveness: { status: "PASSED", confidence: 0.96, attempts: 1 },
            deepfake: { status: "CLEAN", synthetic_probability: 0.02 },
            face_match: { status: "MATCH", similarity: 0.98 },
            bvn: { status: "BVN_MATCH", provider: "SQUAD" },
          },
          initiate_transfer: false,
        },
      }),
    }),

  getJob: (jobId: string) =>
    request<JobResponse>(`/jobs/${encodeURIComponent(jobId)}`, {
      protected: true,
    }),

  runBiasAudit: () =>
    request<BiasAuditResponse>("/ai/bias-audit/liveness/demo", {
      method: "POST",
      body: JSON.stringify({ live_cases_per_group: 40, spoof_cases_per_group: 40, seed: 42 }),
    }),
};

function isoDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

import { env } from "@/shared/config/env";
import type {
  AnomalyScanResponse,
  BiasAuditResponse,
  DemoSeedResponse,
  JobResponse,
  VerifyAndDisburseResponse,
  Worker,
} from "./types";

type RequestOptions = RequestInit & {
  protected?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.protected && env.latticeApiKey) {
    headers.set("X-Lattice-API-Key", env.latticeApiKey);
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    ...options,
    headers,
    cache: "no-store",
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

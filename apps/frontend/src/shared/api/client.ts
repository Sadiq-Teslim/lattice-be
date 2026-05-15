import { env } from "@/shared/config/env";
import type {
  AnomalyScanResponse,
  AdminSummary,
  BiasAuditResponse,
  DemoSeedResponse,
  DocumentConsistencyResponse,
  ExerciseSubmission,
  LivenessEvaluationResponse,
  PayCycle,
  PublicOtpSendResponse,
  PublicOtpVerifyResponse,
  PublicDocumentUploadResponse,
  PublicFaceVerificationResponse,
  PublicVerificationSessionResponse,
  ReleaseEligibleResponse,
  SquadAccountLookupResponse,
  StaffAction,
  VerificationFinalizeResponse,
  VerificationExercise,
  VerificationSession,
  Viq,
  VerifyAndDisburseResponse,
  Worker,
} from "./types";

type RequestOptions = RequestInit & {
  protected?: boolean;
};

function apiBaseUrl() {
  if (typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("api");
    if (override === "local") {
      return "http://127.0.0.1:8010/api/v1";
    }
    if (override && /^https?:\/\//.test(override)) {
      return override.replace(/\/$/, "");
    }
  }
  return env.apiUrl.replace(/\/$/, "");
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.protected && env.latticeApiKey) {
    headers.set("X-Lattice-API-Key", env.latticeApiKey);
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
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
      throw new Error("The verification service is taking too long to respond. Please retry.");
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

  listPayCycles: () => request<PayCycle[]>("/pay-cycles?limit=100"),

  listWorkers: async (ministry: string) => {
    const workers = await request<Worker[]>(`/workers?ministry=${encodeURIComponent(ministry)}&limit=100`);
    return workers.sort((left, right) => {
      const leftRank = left.risk_metadata?.demo_verifiable ? 0 : 1;
      const rightRank = right.risk_metadata?.demo_verifiable ? 0 : 1;
      return leftRank - rightRank || left.worker_code.localeCompare(right.worker_code);
    });
  },

  scanAnomalies: (payCycleId: string) =>
    request<AnomalyScanResponse>(`/demo/anomalies?pay_cycle_id=${encodeURIComponent(payCycleId)}`),

  listViqs: (payCycleId: string) =>
    request<Viq[]>(`/viq?pay_cycle_id=${encodeURIComponent(payCycleId)}&limit=1000`),

  listStaffActions: (ministry: string, payCycleId?: string) => {
    const params = new URLSearchParams({ ministry, limit: "1000" });
    if (payCycleId) params.set("pay_cycle_id", payCycleId);
    return request<StaffAction[]>(`/admin/staff-actions?${params.toString()}`);
  },

  approvePayment: (payload: { worker_id: string; pay_cycle_id?: string; viq_id?: string; note?: string }) =>
    request<StaffAction>("/admin/staff-actions/approve-payment", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  flagInvestigation: (payload: { worker_id: string; pay_cycle_id?: string; viq_id?: string; note?: string }) =>
    request<StaffAction>("/admin/staff-actions/flag-investigation", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  recordDocumentCheck: (payload: {
    worker_id: string;
    pay_cycle_id?: string;
    viq_id?: string;
    payload: DocumentConsistencyResponse;
  }) =>
    request<StaffAction>("/admin/staff-actions/document-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  releaseEligible: (payload: { pay_cycle_id: string; worker_ids?: string[] }) =>
    request<ReleaseEligibleResponse>("/admin/disbursements/release-eligible", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listVerificationExercises: (ministry: string) =>
    request<VerificationExercise[]>(
      `/admin/verification-exercises?ministry=${encodeURIComponent(ministry)}&limit=100`,
    ),

  createVerificationExercise: (payload: {
    ministry: string;
    name: string;
    scope: string;
    rules: string[];
    documents: string[];
  }) =>
    request<VerificationExercise>("/admin/verification-exercises", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateVerificationExercise: (
    exerciseId: string,
    payload: Partial<{ name: string; scope: string; rules: string[]; documents: string[] }>,
  ) =>
    request<VerificationExercise>(`/admin/verification-exercises/${encodeURIComponent(exerciseId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  publishVerificationExercise: (exerciseId: string) =>
    request<VerificationExercise>(
      `/admin/verification-exercises/${encodeURIComponent(exerciseId)}/publish`,
      { method: "POST" },
    ),

  deleteVerificationExercise: (exerciseId: string) =>
    request<{ status: string }>(`/admin/verification-exercises/${encodeURIComponent(exerciseId)}`, {
      method: "DELETE",
    }),

  getPublicVerificationExercise: (token: string) =>
    request<VerificationExercise>(
      `/admin/public/verification-exercises/${encodeURIComponent(token)}`,
    ),

  submitPublicVerificationExercise: (
    token: string,
    payload: {
      worker_code?: string;
      full_name: string;
      document_status?: string;
      liveness_status?: string;
      decision: "PASS" | "REVIEW" | "FAIL";
      payload: Record<string, unknown>;
    },
  ) =>
    request<ExerciseSubmission>(
      `/admin/public/verification-exercises/${encodeURIComponent(token)}/submissions`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  submitPublicVerificationExerciseUpload: (
    token: string,
    payload: {
      worker_code?: string;
      full_name: string;
      phone?: string;
      liveness_status?: string;
      files: File[];
    },
  ) => {
    const body = new FormData();
    body.set("full_name", payload.full_name);
    if (payload.worker_code) body.set("worker_code", payload.worker_code);
    if (payload.phone) body.set("phone", payload.phone);
    if (payload.liveness_status) body.set("liveness_status", payload.liveness_status);
    payload.files.forEach((file) => body.append("files", file));
    return request<ExerciseSubmission>(
      `/admin/public/verification-exercises/${encodeURIComponent(token)}/submissions/upload`,
      {
        method: "POST",
        body,
      },
    );
  },

  listExerciseSubmissions: (exerciseId: string) =>
    request<ExerciseSubmission[]>(
      `/admin/verification-exercises/${encodeURIComponent(exerciseId)}/submissions`,
    ),

  adminSummary: (params: { ministry?: string; pay_cycle_id?: string }) => {
    const query = new URLSearchParams();
    if (params.ministry) query.set("ministry", params.ministry);
    if (params.pay_cycle_id) query.set("pay_cycle_id", params.pay_cycle_id);
    return request<AdminSummary>(`/admin/reports/summary?${query.toString()}`);
  },

  accountLookup: (payload: { bank_code: string; account_number: string }) =>
    request<SquadAccountLookupResponse>("/squad/account-lookup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  evaluateDocumentConsistency: (worker: Worker, overrides: Partial<{
    payroll_dob: string;
    bvn_dob: string;
    file_dob: string;
    appointment_date: string;
    first_salary_date: string;
    confirmation_date: string;
    last_promotion_date: string;
    retirement_date: string;
    document_numbers: Record<string, string>;
    required_documents: string[];
    submitted_documents: string[];
  }> = {}) =>
    request<DocumentConsistencyResponse>("/ai/document-consistency/evaluate", {
      method: "POST",
      body: JSON.stringify({
        worker_record: {
          worker_id: worker.worker_code,
          full_name: worker.full_name,
          payroll_dob: isoDate(worker.date_of_birth),
          bvn_dob: isoDate(worker.date_of_birth),
          file_dob: isoDate(worker.date_of_birth),
          document_numbers: {
            bvn: worker.bvn,
          },
          required_documents: [],
          submitted_documents: [],
          ...documentProfile(worker),
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

  classifyDeepfakeFrame: (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return request<{
      status: "CLEAN" | "DEEPFAKE_DETECTED" | string;
      synthetic_probability: number;
      model_name: string;
      model_version: string;
    }>("/ai/deepfake/classify-frame", {
      method: "POST",
      body,
    });
  },

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

  getPublicVerificationSession: (sessionToken: string) =>
    request<PublicVerificationSessionResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}`,
    ),

  sendPublicVerificationOtp: (sessionToken: string) =>
    request<PublicOtpSendResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/otp/send`,
      { method: "POST" },
    ),

  verifyPublicVerificationOtp: (
    sessionToken: string,
    payload: { challenge_id: string; otp: string },
  ) =>
    request<PublicOtpVerifyResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/otp/verify`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  submitPublicVerificationEvidence: (
    sessionToken: string,
    evidence: {
      liveness?: Record<string, unknown>;
      deepfake?: Record<string, unknown>;
      face_match?: Record<string, unknown>;
      bvn?: Record<string, unknown>;
      documents?: Record<string, unknown>;
    },
  ) =>
    request<PublicVerificationSessionResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/evidence`,
      {
        method: "POST",
        body: JSON.stringify(evidence),
      },
    ),

  evaluatePublicVerificationDocuments: (sessionToken: string) =>
    request<DocumentConsistencyResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/documents/evaluate`,
      { method: "POST" },
    ),

  uploadPublicVerificationDocuments: (sessionToken: string, files: File[]) => {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    return request<PublicDocumentUploadResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/documents/upload`,
      { method: "POST", body },
    );
  },

  verifyPublicVerificationIdentity: (sessionToken: string) =>
    request<Record<string, unknown> | null>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/identity/verify`,
      { method: "POST" },
    ),

  verifyPublicVerificationFace: (sessionToken: string, file: File) => {
    const body = new FormData();
    body.set("file", file);
    return request<PublicFaceVerificationResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/face/verify`,
      { method: "POST", body },
    );
  },

  finalizePublicVerificationSession: (sessionToken: string) =>
    request<VerificationFinalizeResponse>(
      `/verification/public/sessions/${encodeURIComponent(sessionToken)}/finalize`,
      { method: "POST" },
    ),

  verifyAndDisburse: (
    workerId: string,
    payCycleId: string,
    evidence: {
      liveness?: Record<string, unknown>;
      deepfake?: Record<string, unknown>;
      face_match?: Record<string, unknown>;
      bvn?: Record<string, unknown>;
      documents?: Record<string, unknown>;
    } = {},
  ) =>
    request<VerifyAndDisburseResponse>("/sdk/verify-and-disburse", {
      method: "POST",
      protected: true,
      body: JSON.stringify({
        worker_id: workerId,
        pay_cycle_id: payCycleId,
        evidence,
        initiate_transfer: false,
      }),
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

function documentProfile(worker: Worker) {
  const profile = worker.risk_metadata?.document_profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  return profile as Record<string, unknown>;
}

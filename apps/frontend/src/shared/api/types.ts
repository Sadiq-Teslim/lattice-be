export type Worker = {
  id: string;
  worker_code: string;
  full_name: string;
  bvn: string;
  phone: string;
  email: string;
  date_of_birth: string;
  gender: string;
  ministry: string;
  department: string | null;
  salary_amount: string;
  device_id: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
  registration_ip: string | null;
  virtual_account_number: string | null;
  bank_code: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  status: string;
  risk_metadata: Record<string, unknown>;
};

export type DemoSeedResponse = {
  pay_cycle_id: string;
  ministry: string;
  workers_inserted: number;
  injected_ghost_workers: number;
};

export type AnomalyResult = {
  worker_code: string;
  anomaly_score: number;
  flagged: boolean;
  explanations: string[];
  feature_contributions: Array<{
    feature: string;
    value: number;
    baseline: number;
    contribution: number;
    direction: string;
  }>;
  explanation_method: string;
  is_injected_ghost: boolean | null;
};

export type AnomalyScanResponse = {
  pay_cycle_id: string;
  summary: {
    scanned_workers: number;
    flagged_workers: number;
    injected_ghost_workers: number;
    injected_ghosts_flagged: number;
    recall: number;
    precision: number;
    f1_score: number;
  };
  results: AnomalyResult[];
};

export type Viq = {
  id: string;
  worker_id: string;
  pay_cycle_id: string;
  session_id: string;
  trust_score: number;
  verdict: "PASS" | "REVIEW" | "FAIL";
  flags: string[];
  signed_payload: Record<string, unknown>;
  signature: string;
  squad_transaction_reference: string | null;
  payment_status: string;
};

export type DocumentConsistencyFlag = {
  code: string;
  severity: string;
  message: string;
  fields: string[];
};

export type DocumentConsistencyResponse = {
  status: "DOCUMENTS_CLEAN" | "DOCUMENT_INCONSISTENCY";
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  flags: DocumentConsistencyFlag[];
  summary: string;
};

export type VerificationSession = {
  id: string;
  worker_id: string;
  pay_cycle_id: string;
  session_token: string;
  status: string;
  liveness_status: string | null;
  deepfake_status: string | null;
  anomaly_status: string | null;
  bvn_status: string | null;
  attempts: number;
  evidence: Record<string, unknown> | null;
};

export type VerificationFinalizeResponse = {
  session: VerificationSession;
  viq: Viq;
};

export type LivenessEvaluationResponse = {
  status: "PASSED" | "FAILED";
  confidence: number;
  attempts: number;
  challenge: string;
  reasons: string[];
};

export type VerifyAndDisburseResponse = {
  worker: Worker;
  viq: Viq;
  payment_attempted: boolean;
  payment_blocked_reason: string | null;
};

export type JobResponse = {
  id: string;
  kind: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  result: VerifyAndDisburseResponse | null;
  error: Record<string, unknown> | null;
};

export type BiasAuditResponse = {
  component: string;
  groups: Array<{
    group: string;
    cases: number;
    false_positive_rate: number;
    false_negative_rate: number;
  }>;
  max_fpr_gap: number;
  max_fnr_gap: number;
  threshold_met: boolean;
};

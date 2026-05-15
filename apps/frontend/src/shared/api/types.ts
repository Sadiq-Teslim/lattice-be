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

export type PayCycle = {
  id: string;
  name: string;
  ministry: string;
  status: string;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
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

export type PublicDocumentUploadResponse = DocumentConsistencyResponse & {
  submitted_documents: string[];
  extracted_documents: Array<Record<string, unknown>>;
  extracted_dates: string[];
  text_excerpt: string | null;
};

export type PublicFaceVerificationResponse = {
  status: "MATCH" | "FACE_MISMATCH" | string;
  similarity: number;
  threshold: number;
  model_name: string;
  model_version: string;
  reference_source: string;
  candidate_preprocessing: Record<string, unknown>;
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

export type PublicVerificationWorker = {
  id: string;
  worker_code: string;
  full_name: string;
  phone_last4: string;
  ministry: string;
  department: string | null;
  date_of_birth: string | null;
  salary_amount: string;
  status: string;
};

export type PublicVerificationPayCycle = {
  id: string;
  name: string;
  ministry: string;
  status: string;
};

export type PublicVerificationSessionResponse = {
  session: VerificationSession;
  worker: PublicVerificationWorker;
  pay_cycle: PublicVerificationPayCycle;
  viq: Viq | null;
};

export type PublicOtpSendResponse = {
  challenge_id: string;
  phone_last4: string;
  status: string;
  expires_at: string;
};

export type PublicOtpVerifyResponse = {
  challenge_id: string;
  status: string;
  attempts: number;
  verified: boolean;
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

export type StaffAction = {
  id: string;
  worker_id: string;
  pay_cycle_id: string | null;
  viq_id: string | null;
  action_type: "APPROVE_PAYMENT" | "FLAG_INVESTIGATION" | "DOCUMENT_CHECK" | string;
  status: string;
  note: string | null;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type ReleaseEligibleResponse = {
  released: StaffAction[];
  skipped: Array<{ worker_id: string; reason: string }>;
};

export type VerificationExercise = {
  id: string;
  ministry: string;
  name: string;
  scope: string;
  rules: string[];
  documents: string[];
  status: "DRAFT" | "PUBLISHED" | string;
  public_token: string | null;
  public_url: string | null;
  created_at: string;
  published_at: string | null;
  updated_at: string;
};

export type ExerciseSubmission = {
  id: string;
  exercise_id: string;
  worker_id: string | null;
  worker_code: string | null;
  full_name: string;
  status: string;
  decision: "PASS" | "REVIEW" | "FAIL" | string;
  document_status: string | null;
  liveness_status: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type AdminSummary = {
  ministry: string | null;
  pay_cycle_id: string | null;
  workers: number;
  viqs: number;
  pass_count: number;
  review_count: number;
  fail_count: number;
  approved_count: number;
  flagged_count: number;
  held_count: number;
  gross_payroll: string;
  eligible_payroll: string;
  held_payroll: string;
};

export type SquadAccountLookupResponse = {
  response: {
    success?: boolean;
    message?: string;
    data?: {
      account_name?: string;
      account_number?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
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

import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  Copy,
  FileText,
  Link2,
  Send,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import type { AnomalyResult, Viq, Worker, WorkerVerificationLinkResponse } from "@/shared/api/types";
import { Badge, Button, Card, FlagPill, TrustScoreGauge } from "@/shared/ui";
import styles from "./WorkerDetailDrawer.module.css";

type WorkerDetailDrawerProps = {
  worker: Worker | null;
  anomaly?: AnomalyResult;
  viq?: Viq;
  verificationLink?: WorkerVerificationLinkResponse;
  isReleased?: boolean;
  isFlagged?: boolean;
  onClose: () => void;
  onApprove?: (worker: Worker) => void;
  onFlag?: (worker: Worker) => void;
  onGenerateLink?: (worker: Worker) => void;
  onSendLink?: (worker: Worker) => void;
  generateLinkLoading?: boolean;
  sendLinkLoading?: boolean;
};

const featureLabels: Record<string, string> = {
  device_id_frequency: "Same device as other workers",
  gps_cluster_density: "Repeated GPS location",
  bvn_collision_count: "Repeated BVN pattern",
  ip_subnet_overlap: "Shared network cluster",
  registration_burst_count: "Registered in suspicious burst",
};

export function WorkerDetailDrawer({
  worker,
  anomaly,
  viq,
  verificationLink,
  isReleased = false,
  isFlagged = false,
  onClose,
  onApprove,
  onFlag,
  onGenerateLink,
  onSendLink,
  generateLinkLoading = false,
  sendLinkLoading = false,
}: WorkerDetailDrawerProps) {
  if (!worker) return null;
  const flags = viq?.flags ?? (anomaly?.flagged ? ["ANOMALY_FLAGGED"] : []);
  const score = viq?.trust_score;
  const anomalyFlagged = Boolean(anomaly?.flagged || flags.includes("ANOMALY_FLAGGED"));
  const bvnUnverified = flags.includes("BVN_UNVERIFIED");
  const livenessUnverified = flags.includes("LIVENESS_UNVERIFIED");
  const deepfakeUnverified = flags.includes("DEEPFAKE_UNVERIFIED");
  const bvnMismatch = flags.includes("BVN_MISMATCH");
  const documentIssue = flags.includes("DOB_MISMATCH") || flags.includes("DOCUMENT_INCONSISTENCY");
  const livenessFail = flags.includes("LIVENESS_FAIL");
  const rawVerdict = viq?.verdict ?? (anomalyFlagged ? "REVIEW" : "PENDING");
  const verdict = rawVerdict === "PASS" && flags.length ? "REVIEW" : rawVerdict;
  const paymentStatus =
    isFlagged
      ? "Flagged for investigation"
      : isReleased
        ? "Released"
        : verdict === "PASS"
          ? "Ready for release"
          : verdict === "FAIL"
            ? "Blocked"
            : verdict === "REVIEW"
              ? "Held for HR review"
              : "Awaiting verification";
  const verdictVariant = verdict === "PASS" ? "success" : verdict === "FAIL" ? "danger" : "warning";
  const canSendSms = Boolean(verificationLink?.public_url);

  return (
    <>
      <button className={styles.backdrop} onClick={onClose} aria-label="Close staff details" />
      <aside className={styles.drawer} aria-label="Staff verification details">
        <div className={styles.topbar}>
          <div>
            <span>Staff verification</span>
            <h2>{worker.full_name}</h2>
            <p>{worker.worker_code}</p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close staff details">
            <X size={18} strokeWidth={1.8} />
            Close
          </button>
        </div>

        <Card className={styles.decisionCard}>
          {typeof score === "number" ? (
            <div className={styles.gauge}>
              <TrustScoreGauge score={score} size="large" verdict={viq?.verdict} />
            </div>
          ) : (
            <div className={styles.pendingScore}>Not verified</div>
          )}
          <div className={styles.decisionCopy}>
            <span>Payroll decision</span>
            <h3>{paymentStatus}</h3>
            <Badge label={verdict} variant={verdictVariant} />
          </div>
        </Card>

        <section className={styles.flags}>
          {flags.length ? flags.map((flag) => <FlagPill flag={flag} key={flag} />) : <span>No active flags</span>}
        </section>

        <Card className={styles.section}>
          <h3>
            <User size={18} strokeWidth={1.6} />
            Staff profile
          </h3>
          <div className={styles.profileGrid}>
            <Detail label="Department" value={worker.department ?? "Not provided"} />
            <Detail label="DOB" value={formatDate(worker.date_of_birth)} />
            <Detail label="Salary" value={formatMoney(worker.salary_amount)} />
            <Detail label="Phone" value={worker.phone} />
            <Detail label="Bank account" value={worker.bank_account_number ?? "Pending"} />
            <Detail label="Account name" value={worker.bank_account_name ?? worker.full_name} />
          </div>
        </Card>

        <Card className={styles.section}>
          <h3>
            <ShieldCheck size={18} strokeWidth={1.6} />
            Verification checks
          </h3>
          <div className={styles.checks}>
            <CheckRow label="Identity and BVN" status={viq ? (bvnUnverified ? "Pending" : bvnMismatch ? "Review" : "Checked") : "Pending"} ok={Boolean(viq && !bvnUnverified && !bvnMismatch)} />
            <CheckRow label="Document consistency" status={viq ? (documentIssue ? "Review" : "Checked") : "Pending"} ok={Boolean(viq && !documentIssue)} />
            <CheckRow label="Proof of life" status={viq ? (livenessUnverified ? "Pending" : livenessFail ? "Failed" : "Checked") : "Pending"} ok={Boolean(viq && !livenessUnverified && !livenessFail)} />
            <CheckRow label="Media authenticity" status={viq ? (deepfakeUnverified ? "Pending" : flags.includes("DEEPFAKE_DETECTED") ? "Failed" : "Checked") : "Pending"} ok={Boolean(viq && !deepfakeUnverified && !flags.includes("DEEPFAKE_DETECTED"))} />
            <CheckRow label="Payroll anomaly" status={anomalyFlagged ? "Review" : "Clear"} ok={!anomalyFlagged} />
          </div>
        </Card>

        <Card className={styles.section}>
          <h3>
            <AlertTriangle size={18} strokeWidth={1.6} />
            Review notes
          </h3>
          {anomaly?.explanations.length ? (
            <ul className={styles.notes}>
              {anomaly.explanations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : anomalyFlagged ? (
            <p>This staff record has a payroll pattern that needs HR review before salary release.</p>
          ) : (
            <p>No suspicious payroll pattern detected for this worker.</p>
          )}
        </Card>

        <Card className={styles.section}>
          <h3>
            <FileText size={18} strokeWidth={1.6} />
            Audit reference
          </h3>
          <div className={styles.profileGrid}>
            <Detail label="Verification ID" value={viq?.id ?? "Not generated yet"} />
            <Detail label="Payment reference" value={viq?.squad_transaction_reference ?? "Not released"} />
            <Detail label="Payment status" value={viq?.payment_status ?? paymentStatus} />
          </div>
        </Card>

        <Card className={styles.section}>
          <h3>
            <Link2 size={18} strokeWidth={1.6} />
            Worker verification link
          </h3>
          {verificationLink ? (
            <div className={styles.linkBox}>
              <strong>{verificationLink.public_url}</strong>
              <span>{verificationLink.sms_sent ? "SMS sent to worker phone." : "Copied for HR sharing."}</span>
            </div>
          ) : (
            <p>Create a private verification link for this staff member to complete OTP, documents, and liveness checks.</p>
          )}
          <div className={styles.inlineActions}>
            <Button loading={generateLinkLoading} onClick={() => onGenerateLink?.(worker)} variant="secondary">
              <Copy size={17} strokeWidth={1.7} />
              Generate Link
            </Button>
            <Button
              disabled={!canSendSms}
              loading={sendLinkLoading}
              onClick={() => {
                if (canSendSms) onSendLink?.(worker);
              }}
              title={canSendSms ? "Send the generated link by SMS" : "Generate a link before sending SMS"}
            >
              <Send size={17} strokeWidth={1.7} />
              Send SMS
            </Button>
          </div>
        </Card>

        <Card className={styles.section}>
          <h3>
            <Banknote size={18} strokeWidth={1.6} />
            HR action
          </h3>
          <p>
            {verdict === "PASS"
              ? "This staff member can be included in the salary release batch."
              : verdict === "FAIL"
                ? "Keep this payment blocked and escalate the staff file for investigation."
                : "Keep salary held until HR reviews the highlighted evidence."}
          </p>
        </Card>

        <div className={styles.actions}>
          <Button
            fullWidth
            disabled={verdict !== "PASS" || isReleased || isFlagged}
            onClick={() => onApprove?.(worker)}
          >
            {isReleased ? "Payment Approved" : "Approve Payment"}
          </Button>
          <Button fullWidth disabled={isFlagged} onClick={() => onFlag?.(worker)} variant="secondary">
            {isFlagged ? "Flagged for Investigation" : "Flag for Investigation"}
          </Button>
        </div>
      </aside>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detail}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CheckRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <div className={styles.checkRow}>
      {ok ? <CheckCircle size={18} strokeWidth={1.6} /> : <AlertTriangle size={18} strokeWidth={1.6} />}
      <span>{label}</span>
      <strong className={ok ? styles.ok : styles.review}>{status}</strong>
    </div>
  );
}

function formatMoney(value: string) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value?: string) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

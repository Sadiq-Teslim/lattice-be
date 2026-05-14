from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

json_type = JSON().with_variant(JSONB, "postgresql")


def new_id() -> str:
    return str(uuid4())


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    worker_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), index=True)
    bvn: Mapped[str] = mapped_column(String(32), index=True)
    phone: Mapped[str] = mapped_column(String(32), index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(16), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(1), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    ministry: Mapped[str] = mapped_column(String(255), index=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    bank_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    bank_account_number: Mapped[str | None] = mapped_column(String(16), nullable=True)
    bank_account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    gps_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    gps_lng: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    registration_ip: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    registration_timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    virtual_account_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    biometric_template: Mapped[dict | None] = mapped_column(json_type, nullable=True)
    risk_metadata: Mapped[dict] = mapped_column(json_type, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    verification_sessions: Mapped[list["VerificationSession"]] = relationship(
        back_populates="worker",
        cascade="all, delete-orphan",
    )
    viqs: Mapped[list["VIQ"]] = relationship(back_populates="worker", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        back_populates="worker",
        cascade="all, delete-orphan",
    )


class PayCycle(Base):
    __tablename__ = "pay_cycles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), index=True)
    ministry: Mapped[str] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    verification_sessions: Mapped[list["VerificationSession"]] = relationship(
        back_populates="pay_cycle",
        cascade="all, delete-orphan",
    )
    viqs: Mapped[list["VIQ"]] = relationship(
        back_populates="pay_cycle",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        back_populates="pay_cycle",
        cascade="all, delete-orphan",
    )


class VerificationSession(Base):
    __tablename__ = "verification_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)
    pay_cycle_id: Mapped[str] = mapped_column(ForeignKey("pay_cycles.id"), index=True)
    session_token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    liveness_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    deepfake_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    anomaly_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    bvn_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attempts: Mapped[int] = mapped_column(default=0)
    evidence: Mapped[dict | None] = mapped_column(json_type, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    worker: Mapped[Worker] = relationship(back_populates="verification_sessions")
    pay_cycle: Mapped[PayCycle] = relationship(back_populates="verification_sessions")
    viq: Mapped["VIQ | None"] = relationship(back_populates="session")


class VIQ(Base):
    __tablename__ = "viqs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)
    pay_cycle_id: Mapped[str] = mapped_column(ForeignKey("pay_cycles.id"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("verification_sessions.id"), unique=True)
    trust_score: Mapped[int] = mapped_column(index=True)
    verdict: Mapped[str] = mapped_column(String(32), index=True)
    flags: Mapped[list] = mapped_column(json_type, default=list)
    signed_payload: Mapped[dict] = mapped_column(json_type)
    signature: Mapped[str] = mapped_column(Text)
    squad_transaction_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="NOT_INITIATED", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    worker: Mapped[Worker] = relationship(back_populates="viqs")
    pay_cycle: Mapped[PayCycle] = relationship(back_populates="viqs")
    session: Mapped[VerificationSession] = relationship(back_populates="viq")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    worker_id: Mapped[str | None] = mapped_column(
        ForeignKey("workers.id"),
        nullable=True,
        index=True,
    )
    pay_cycle_id: Mapped[str | None] = mapped_column(
        ForeignKey("pay_cycles.id"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict] = mapped_column(json_type)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    worker: Mapped[Worker | None] = relationship(back_populates="audit_logs")
    pay_cycle: Mapped[PayCycle | None] = relationship(back_populates="audit_logs")


class StaffAction(Base):
    __tablename__ = "staff_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)
    pay_cycle_id: Mapped[str | None] = mapped_column(
        ForeignKey("pay_cycles.id"),
        nullable=True,
        index=True,
    )
    viq_id: Mapped[str | None] = mapped_column(ForeignKey("viqs.id"), nullable=True, index=True)
    action_type: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String(128), default="HR Payroll Desk")
    payload: Mapped[dict] = mapped_column(json_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class VerificationExercise(Base):
    __tablename__ = "verification_exercises"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    ministry: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    scope: Mapped[str] = mapped_column(String(255))
    rules: Mapped[list] = mapped_column(json_type, default=list)
    documents: Mapped[list] = mapped_column(json_type, default=list)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", index=True)
    public_token: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    public_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class ExerciseSubmission(Base):
    __tablename__ = "exercise_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    exercise_id: Mapped[str] = mapped_column(
        ForeignKey("verification_exercises.id"),
        index=True,
    )
    worker_id: Mapped[str | None] = mapped_column(
        ForeignKey("workers.id"),
        nullable=True,
        index=True,
    )
    worker_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="SUBMITTED", index=True)
    decision: Mapped[str] = mapped_column(String(32), default="REVIEW", index=True)
    document_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    liveness_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict] = mapped_column(json_type, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)
    pay_cycle_id: Mapped[str | None] = mapped_column(
        ForeignKey("pay_cycles.id"),
        nullable=True,
        index=True,
    )
    phone: Mapped[str] = mapped_column(String(32), index=True)
    purpose: Mapped[str] = mapped_column(String(64), default="PAYROLL_VERIFICATION")
    otp_hash: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    max_attempts: Mapped[int] = mapped_column(default=3)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    provider_response: Mapped[dict | None] = mapped_column(json_type, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    payload: Mapped[dict] = mapped_column(json_type)
    result: Mapped[dict | None] = mapped_column(json_type, nullable=True)
    error: Mapped[dict | None] = mapped_column(json_type, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


Index("ix_viqs_worker_cycle", VIQ.worker_id, VIQ.pay_cycle_id)
Index("ix_sessions_worker_cycle", VerificationSession.worker_id, VerificationSession.pay_cycle_id)

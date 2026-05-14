from app.db.base import Base
from app.db.models import (
    VIQ,
    AuditLog,
    ExerciseSubmission,
    Job,
    OtpChallenge,
    PayCycle,
    StaffAction,
    VerificationExercise,
    VerificationSession,
    Worker,
)
from app.db.session import engine


def init_db() -> None:
    # Importing the model classes above registers them with SQLAlchemy metadata.
    _ = (
        AuditLog,
        ExerciseSubmission,
        Job,
        OtpChallenge,
        PayCycle,
        StaffAction,
        VerificationExercise,
        VIQ,
        VerificationSession,
        Worker,
    )
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()

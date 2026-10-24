from sqlalchemy.orm import Session

NAME = "campaigns"
DESCRIPTION = "Sends scheduled campaigns and resumes ones whose sender stopped (the API's own sender does the same)."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.campaigns import runner

    done = runner.run_due()
    return ", ".join(f"campaign {i}: {status}" for i, status in done) if done else "no campaigns due"

from sqlalchemy.orm import Session

NAME = "journeys"
DESCRIPTION = "Sends journey messages that are due: after an order, reorder reminders and birthday wishes."
CADENCE = "every 15 minutes"
SCHEDULE = "*/15 * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.journeys.service import run_due

    sent = run_due(db)
    return f"{sent} journey message(s) sent" if sent else "no journey messages due"

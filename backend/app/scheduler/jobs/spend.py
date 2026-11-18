from sqlalchemy.orm import Session

NAME = "spend"
DESCRIPTION = "Tells owners and admins when WhatsApp spend reaches 80% and 100% of the monthly budget."
CADENCE = "hourly"
SCHEDULE = "5 * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.spend.service import alert_due

    sent = alert_due(db)
    return f"{sent} spend alert(s)" if sent else "no spend alerts"

from sqlalchemy.orm import Session

NAME = "notifications"
DESCRIPTION = "Tells the team about customers waiting too long for a reply (each person sets their own limit)."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.account import notify

    sent = notify.waiting_alerts(db)
    return f"{sent} waiting-customer alert(s)" if sent else "nobody waiting too long"

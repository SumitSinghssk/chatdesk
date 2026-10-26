from sqlalchemy.orm import Session

NAME = "payments"
DESCRIPTION = "Reminds customers about unpaid payment links, closes expired ones, and checks links with the gateway."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.commerce import payments

    reminded, expired, paid = payments.run_due(db)
    if not (reminded or expired or paid):
        return "no payment reminders or expiries due"
    return f"{reminded} reminder(s) sent, {expired} link(s) expired, {paid} found paid"

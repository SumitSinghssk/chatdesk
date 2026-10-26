from sqlalchemy.orm import Session

NAME = "carts"
DESCRIPTION = "Sends abandoned-cart reminders to customers who stopped during checkout on WhatsApp."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.commerce import carts

    sent, failed = carts.run_due(db)
    if not (sent or failed):
        return "no cart reminders due"
    return f"{sent} cart reminder(s) sent" + (f", {failed} not sent" if failed else "")

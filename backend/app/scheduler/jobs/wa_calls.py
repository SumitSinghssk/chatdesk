from sqlalchemy.orm import Session

NAME = "wa_calls"
DESCRIPTION = ("Ends WhatsApp calls nobody answered (missed, with the follow-up message) and outgoing calls the "
               "customer didn't pick up, and lets go of answers that never connected.")
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.wa_calls.service import expire_due

    done = expire_due(db)
    return f"{done} call(s) ended" if done else "no calls to end"

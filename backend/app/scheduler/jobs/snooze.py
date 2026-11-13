from sqlalchemy.orm import Session

NAME = "snooze"
DESCRIPTION = "Brings snoozed chats back to the inbox when their time comes, with a reminder."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.inbox.snooze import wake_due

    woke = wake_due(db)
    return f"{woke} snoozed chat(s) back" if woke else "no snoozed chats due"

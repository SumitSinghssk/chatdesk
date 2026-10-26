from sqlalchemy.orm import Session

NAME = "webhooks"
DESCRIPTION = "Retries webhook calls that failed, and removes delivery logs older than 30 days."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.integrations import webhooks

    done, failing = webhooks.run_due(db)
    gone = webhooks.purge(db)
    if not (done or failing or gone):
        return "no webhook retries due"
    return f"{done} delivered, {failing} still failing, {gone} old log(s) removed"

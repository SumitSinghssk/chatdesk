from sqlalchemy.orm import Session

NAME = "notifications"
DESCRIPTION = ("Tells the team about customers waiting too long for a reply (each person sets their own limit), "
               "and people about their diagram tasks when they're due.")
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.account import notify
    from app.modules.customer.diagrams.service import task_reminders

    sent = notify.waiting_alerts(db)
    tasks = task_reminders(db)
    done = f"{sent} waiting-customer alert(s)" if sent else "nobody waiting too long"
    return f"{done}, {tasks} task reminder(s)" if tasks else done

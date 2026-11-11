from sqlalchemy.orm import Session

NAME = "calls"
DESCRIPTION = ("Re-checks phone calls whose provider callback never arrived, sends their WhatsApp follow-up, "
               "and saves call recordings that weren't ready yet.")
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.calls import service

    checked, saved, given_up = service.run_due(db)
    if not (checked or saved or given_up):
        return "no calls to check"
    return f"{checked} call(s) re-checked, {saved} recording(s) saved, {given_up} given up"

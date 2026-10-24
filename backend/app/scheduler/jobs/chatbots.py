from sqlalchemy.orm import Session

NAME = "chatbots"
DESCRIPTION = "Carries chatbots on after a delay block and closes chats customers left (timeouts)."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.chatbots import engine

    touched = engine.run_due(db)
    return f"{touched} chatbot chat(s) moved on" if touched else "no chatbot delays or timeouts due"

from sqlalchemy.orm import Session

from app.shared.utils.datetime import now

NAME = "ai_replies"
DESCRIPTION = "Answers WhatsApp messages still waiting for the AI agent (the API's own worker normally does it at once)."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.modules.customer.ai_agent import engine
    from app.modules.customer.ai_agent.models import AiThread

    waiting = [i for (i,) in db.query(AiThread.id).filter(AiThread.pending_at.is_not(None),
                                                         AiThread.pending_at <= now() - engine.DEBOUNCE)
               .limit(50).all()]
    if not waiting:
        return "no chats waiting for the AI agent"
    answered = sum(1 for thread_id in waiting if engine.run_thread(db, thread_id))
    return f"answered {answered} of {len(waiting)} waiting chat(s)"

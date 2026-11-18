"""WhatsApp spend meter: what this month's messages are costing, against a budget.

Meta says in each status webhook whether a message is billable and its pricing category (marketing, utility,
authentication; service replies are free). We keep that on the message (`billable_category`) and multiply by the
business's per-category rates. Rates differ by country and change: they're editable, and the defaults are rough
Indian rates, so the result is an estimate (Meta's invoice is the real number).
"""
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.inbox.models import WaMessage
from app.modules.customer.spend.models import WaSpendSettings
from app.shared.utils.datetime import now

CATEGORIES = ("marketing", "utility", "authentication", "service")
DEFAULT_RATES = {"marketing": 0.88, "utility": 0.13, "authentication": 0.13, "service": 0.0}  # INR, estimates
ALERT_LEVELS = (80, 100)


def _settings(db: Session, customer_id: int) -> WaSpendSettings | None:
    return db.query(WaSpendSettings).filter(WaSpendSettings.customer_id == customer_id).first()


def _rates(st: WaSpendSettings | None) -> dict[str, float]:
    return {**DEFAULT_RATES, **{k: float(v) for k, v in ((st.rates if st else None) or {}).items() if k in CATEGORIES}}


def _month_start(moment=None):
    return (moment or now()).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_counts(db: Session, customer_id: int, start, end) -> dict[str, int]:
    rows = (db.query(WaMessage.billable_category, func.count(WaMessage.id))
            .filter(WaMessage.customer_id == customer_id, WaMessage.billable_category.isnot(None),
                    WaMessage.created_at >= start, WaMessage.created_at < end)
            .group_by(WaMessage.billable_category).all())
    return {k: int(n) for k, n in rows}


def summary(db: Session, customer_id: int) -> dict:
    st = _settings(db, customer_id)
    rates = _rates(st)
    start = _month_start()
    end = (start + timedelta(days=32)).replace(day=1)
    prev_start = (start - timedelta(days=1)).replace(day=1)

    def total(counts: dict[str, int]) -> float:
        return round(sum(n * rates.get(k, 0.0) for k, n in counts.items()), 2)

    counts, previous = month_counts(db, customer_id, start, end), month_counts(db, customer_id, prev_start, start)
    spent = total(counts)
    budget = st.monthly_budget if st else None
    return {
        "currency": (st.currency if st else None) or "INR", "rates": rates, "monthly_budget": budget,
        "month": {"spent": spent, "by_category": {k: {"messages": counts.get(k, 0),
                                                       "cost": round(counts.get(k, 0) * rates.get(k, 0.0), 2)}
                                                   for k in CATEGORIES},
                  "used_percent": round(100 * spent / budget) if budget else None},
        "previous_month": {"spent": total(previous)},
    }


def get(db: Session, ws: Customer) -> dict:
    return {"status": True, "data": summary(db, ws.id)}


def save(db: Session, ws: Customer, payload) -> dict:
    st = _settings(db, ws.id)
    if st is None:
        st = WaSpendSettings(customer_id=ws.id)
        db.add(st)
    st.currency = (payload.currency or "INR").strip().upper()[:3]
    st.rates = {k: max(0.0, float(v)) for k, v in (payload.rates or {}).items() if k in CATEGORIES}
    st.monthly_budget = payload.monthly_budget or None
    db.commit()
    return {"status": True, "message": "Spend settings saved", "data": summary(db, ws.id)}


def record(message: WaMessage, raw: dict) -> None:
    """From a status webhook: remember the message's pricing category when Meta bills it."""
    pricing = raw.get("pricing") or {}
    category = str(pricing.get("category") or "").lower()
    if pricing and pricing.get("billable") is not False and category in CATEGORIES and category != "service":
        message.billable_category = category


def alert_due(db: Session) -> int:
    """Scheduler: tells owners and admins once at 80% and once at 100% of the monthly budget."""
    from app.modules.customer.account import notify
    from app.shared.constants import customer_urls

    sent = 0
    month = now().strftime("%Y-%m")
    for st in db.query(WaSpendSettings).filter(WaSpendSettings.monthly_budget.isnot(None)).all():
        used = summary(db, st.customer_id)["month"]
        level = max((lvl for lvl in ALERT_LEVELS if (used["used_percent"] or 0) >= lvl), default=0)
        if not level:
            continue
        people = notify.managers(db, st.customer_id)
        money = f"{used['spent']:.2f} {st.currency or 'INR'}"
        sent += notify.notify(db, people, "spend_alert", f"WhatsApp spend reached {level}% of the budget",
                              f"About {money} this month (estimated).", customer_urls.DASHBOARD + "/analytics",
                              {"level": level}, once_key=f"spend:{month}:{level}", number_id=st.customer_id)
        db.commit()
    return sent

"""Commerce insights: how much the business sells through ChatDesk, and what brings the sales in.

Revenue counts confirmed orders that weren't cancelled, by the day they were confirmed (in the business's
time zone), compared with the period before. An order is credited to a campaign when the customer got that
campaign's message in the 7 days before ordering (the latest one wins), and to a chatbot when the customer
talked to it in the 24 hours before.
"""
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import carts, orders, service
from app.modules.customer.commerce.models import Order, OrderItem, OrderRefund
from app.shared.utils.datetime import days_ago_start, site_now, to_site

PERIODS = (7, 30, 90)
CAMPAIGN_WINDOW = timedelta(days=7)
CHATBOT_WINDOW = timedelta(hours=24)
SOURCE_LABELS = {"whatsapp_cart": "WhatsApp cart", "buy_button": "Buy now button", "manual": "Made by the team",
                 "chatbot": "Chatbot", "shopify": "Shopify", "woocommerce": "WooCommerce"}
MAX_ORDERS = 20000  # attribution looks at at most this many orders in a period


def _pct(now_value: float, before: float) -> int | None:
    if not before:
        return None
    return round((now_value - before) * 100 / before)


def _sold(db: Session, owner_id: int, start, end=None):
    q = db.query(Order).filter(Order.customer_id == owner_id, Order.confirmed_at.isnot(None),
                               Order.status != "cancelled", Order.confirmed_at >= start)
    return q.filter(Order.confirmed_at < end) if end is not None else q


def _totals(q) -> tuple[int, int]:
    row = q.with_entities(func.coalesce(func.sum(Order.total), 0), func.count(Order.id)).first()
    return int(row[0] or 0), int(row[1] or 0)


def insights(db: Session, owner: Customer, days: int = 30) -> dict:
    from app.modules.customer.campaigns.models import WaCampaign, WaCampaignRecipient
    from app.modules.customer.chatbots.models import WaChatbot, WaChatbotSession

    days = days if days in PERIODS else 30
    store = service.settings_of(db, owner)
    m = lambda v: service.money(int(v), store.currency)  # noqa: E731
    since = days_ago_start(days - 1)
    before = since - timedelta(days=days)

    current = _sold(db, owner.id, since)
    revenue, count = _totals(current)
    prev_revenue, prev_count = _totals(_sold(db, owner.id, before, since))
    aov = revenue // count if count else 0
    prev_aov = prev_revenue // prev_count if prev_count else 0

    rows = (current.with_entities(Order.id, Order.total, Order.confirmed_at, Order.placed_at, Order.contact_id,
                                  Order.source, Order.payment_method, Order.payment_status)
            .order_by(Order.confirmed_at).limit(MAX_ORDERS).all())

    # by day
    by_day: dict = defaultdict(lambda: [0, 0])
    for r in rows:
        day = to_site(r.confirmed_at).date()
        by_day[day][0] += r.total
        by_day[day][1] += 1
    today = site_now().date()
    series = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        total, n = by_day.get(day, (0, 0))
        series.append({"date": day.isoformat(), "revenue": service.to_major(total), "orders": n})

    # customers: new or returning
    contacts = {r.contact_id for r in rows if r.contact_id}
    returning = 0
    if contacts:
        returning = (db.query(func.count(func.distinct(Order.contact_id)))
                     .filter(Order.customer_id == owner.id, Order.contact_id.in_(contacts),
                             Order.confirmed_at.isnot(None), Order.status != "cancelled",
                             Order.confirmed_at < since).scalar() or 0)

    # where the sales come from, and how they're paid
    sources: dict = defaultdict(lambda: [0, 0])
    methods: dict = defaultdict(lambda: [0, 0])
    for r in rows:
        sources[r.source][0] += r.total
        sources[r.source][1] += 1
        method = r.payment_method if r.payment_method in ("online", "cod") else "other"
        methods[method][0] += r.total
        methods[method][1] += 1
    by_source = sorted(({"source": k, "label": SOURCE_LABELS.get(k, k), "revenue": service.to_major(v[0]),
                         "revenue_text": m(v[0]), "orders": v[1]} for k, v in sources.items()),
                       key=lambda x: -x["revenue"])
    pay_labels = {"online": "Paid online", "cod": "Cash on delivery", "other": "Other / marked paid"}
    by_payment = [{"method": k, "label": pay_labels[k], "revenue": service.to_major(methods[k][0]),
                   "revenue_text": m(methods[k][0]), "orders": methods[k][1]}
                  for k in ("online", "cod", "other") if methods[k][1]]

    # top products
    ids = [r.id for r in rows]
    top = []
    if ids:
        top_rows = (db.query(OrderItem.product_id, OrderItem.name, func.sum(OrderItem.quantity),
                             func.sum(OrderItem.unit_price * OrderItem.quantity))
                    .filter(OrderItem.order_id.in_(ids))
                    .group_by(OrderItem.product_id, OrderItem.name)
                    .order_by(func.sum(OrderItem.unit_price * OrderItem.quantity).desc()).limit(8).all())
        top = [{"product_id": pid, "name": name, "quantity": int(qty or 0), "revenue": service.to_major(int(amt or 0)),
                "revenue_text": m(amt or 0)} for pid, name, qty, amt in top_rows]
    items_sold = (db.query(func.coalesce(func.sum(OrderItem.quantity), 0)).filter(OrderItem.order_id.in_(ids))
                  .scalar() or 0) if ids else 0

    # campaigns: the latest campaign message in the 7 days before the order
    with_contact = [r for r in rows if r.contact_id]
    campaign_stats: dict = defaultdict(lambda: [0, 0])
    if with_contact:
        sends = (db.query(WaCampaignRecipient.contact_id, WaCampaignRecipient.campaign_id, WaCampaignRecipient.sent_at)
                 .join(WaCampaign, WaCampaign.id == WaCampaignRecipient.campaign_id)
                 .filter(WaCampaign.customer_id == owner.id, WaCampaignRecipient.status == "sent",
                         WaCampaignRecipient.contact_id.in_({r.contact_id for r in with_contact}),
                         WaCampaignRecipient.sent_at >= since - CAMPAIGN_WINDOW)
                 .order_by(WaCampaignRecipient.sent_at).all())
        by_contact: dict = defaultdict(list)
        for s in sends:
            by_contact[s.contact_id].append(s)
        for r in with_contact:
            at = r.placed_at or r.confirmed_at
            hit = [s for s in by_contact.get(r.contact_id, []) if at - CAMPAIGN_WINDOW <= s.sent_at <= at]
            if hit:
                campaign_stats[hit[-1].campaign_id][0] += r.total
                campaign_stats[hit[-1].campaign_id][1] += 1
    campaigns = []
    if campaign_stats:
        names = dict(db.query(WaCampaign.id, WaCampaign.name).filter(WaCampaign.id.in_(campaign_stats)).all())
        reached = dict(db.query(WaCampaignRecipient.campaign_id, func.count(WaCampaignRecipient.id))
                       .filter(WaCampaignRecipient.campaign_id.in_(campaign_stats),
                               WaCampaignRecipient.status == "sent")
                       .group_by(WaCampaignRecipient.campaign_id).all())
        campaigns = sorted(({"id": cid, "name": names.get(cid, "Deleted campaign"), "orders": v[1],
                             "revenue": service.to_major(v[0]), "revenue_text": m(v[0]),
                             "sent": int(reached.get(cid, 0)),
                             "conversion": round(v[1] * 100 / reached[cid], 1) if reached.get(cid) else None}
                            for cid, v in campaign_stats.items()), key=lambda x: -x["revenue"])[:10]

    # chatbots: talked to it in the 24 hours before ordering
    bot_stats: dict = defaultdict(lambda: [0, 0])
    if with_contact:
        sessions = (db.query(WaChatbotSession.contact_id, WaChatbotSession.chatbot_id, WaChatbotSession.started_at)
                    .filter(WaChatbotSession.customer_id == owner.id,
                            WaChatbotSession.contact_id.in_({r.contact_id for r in with_contact}),
                            WaChatbotSession.started_at >= since - CHATBOT_WINDOW)
                    .order_by(WaChatbotSession.started_at).all())
        by_contact = defaultdict(list)
        for s in sessions:
            by_contact[s.contact_id].append(s)
        for r in with_contact:
            at = r.placed_at or r.confirmed_at
            hit = [s for s in by_contact.get(r.contact_id, []) if at - CHATBOT_WINDOW <= s.started_at <= at]
            if hit:
                bot_stats[hit[-1].chatbot_id][0] += r.total
                bot_stats[hit[-1].chatbot_id][1] += 1
    chatbots = []
    if bot_stats:
        names = dict(db.query(WaChatbot.id, WaChatbot.name).filter(WaChatbot.id.in_(bot_stats)).all())
        chatbots = sorted(({"id": bid, "name": names.get(bid, "Deleted chatbot"), "orders": v[1],
                            "revenue": service.to_major(v[0]), "revenue_text": m(v[0])}
                           for bid, v in bot_stats.items()), key=lambda x: -x["revenue"])[:10]

    # checkout funnel: carts started in the period, and how far they got
    started_q = db.query(Order).filter(Order.customer_id == owner.id, carts.is_cart(), Order.placed_at >= since)
    started = started_q.count()
    gave_address = started_q.filter((Order.address.isnot(None)) | (Order.status != "awaiting_address")).count()
    confirmed = started_q.filter(Order.confirmed_at.isnot(None)).count()
    paid = started_q.filter(Order.payment_status.in_(orders.PAID)).count()
    funnel = [{"step": "started", "label": "Carts started", "count": started},
              {"step": "address", "label": "Gave the address", "count": gave_address},
              {"step": "confirmed", "label": "Confirmed", "count": confirmed},
              {"step": "paid", "label": "Paid", "count": paid}]

    recovered = int(db.query(func.coalesce(func.sum(Order.total), 0))
                    .filter(Order.customer_id == owner.id, Order.recovered_at >= since,
                            Order.status != "cancelled").scalar() or 0)
    refunded = int(db.query(func.coalesce(func.sum(OrderRefund.amount), 0))
                   .filter(OrderRefund.customer_id == owner.id, OrderRefund.status != "failed",
                           OrderRefund.created_at >= since).scalar() or 0)
    attributed = sum(v[0] for v in campaign_stats.values())
    db.commit()
    return {"status": True, "data": {
        "days": days, "currency": store.currency,
        "kpis": {
            "revenue": service.to_major(revenue), "revenue_text": m(revenue), "revenue_change": _pct(revenue, prev_revenue),
            "orders": count, "orders_change": _pct(count, prev_count),
            "aov_text": m(aov) if count else None, "aov_change": _pct(aov, prev_aov),
            "items_sold": int(items_sold), "customers": len(contacts), "returning": int(returning),
            "recovered_text": m(recovered), "refunded_text": m(refunded),
            "campaign_revenue_text": m(attributed),
        },
        "series": series, "by_source": by_source, "by_payment": by_payment, "top_products": top,
        "campaigns": campaigns, "chatbots": chatbots, "funnel": funnel,
    }}

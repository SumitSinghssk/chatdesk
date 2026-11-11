"""Customer workspace page paths on the frontend (links in notifications, diagram cards, emails).

Keep in sync with frontend/src/config/routes/customer.ts. Prefix with settings.FRONTEND_URL for an absolute link.
"""

from app.shared.constants.admin_urls import admin_url as with_query

DASHBOARD = "/dashboard"
INBOX = f"{DASHBOARD}/inbox"
CONTACTS = f"{DASHBOARD}/contacts"
CAMPAIGNS = f"{DASHBOARD}/campaigns"
CHATBOTS = f"{DASHBOARD}/chatbots"
DIAGRAMS = f"{DASHBOARD}/diagrams"
COMMERCE_ORDERS = f"{DASHBOARD}/commerce/orders"
WHATSAPP = f"{DASHBOARD}/whatsapp"
ACCOUNT = f"{DASHBOARD}/account"


def conversation(conversation_id: int) -> str:
    return with_query(INBOX, c=conversation_id)


def campaign(campaign_id: int) -> str:
    return f"{CAMPAIGNS}/{campaign_id}"


def chatbot(chatbot_id: int) -> str:
    return f"{CHATBOTS}/{chatbot_id}"


def order(order_id: int) -> str:
    return f"{COMMERCE_ORDERS}/{order_id}"


def diagram(diagram_id: int, comment: int | None = None) -> str:
    return with_query(f"{DIAGRAMS}/{diagram_id}", comment=comment)

"""Ready-made chatbots to start from (the "New chatbot" dialog). Each one works as it is."""

X = 380  # gap between columns on the canvas


def _n(node_id, node_type, x, y, **data):
    return {"id": node_id, "type": node_type, "position": {"x": x, "y": y}, "data": data}


def _e(source, target, handle="out"):
    return {"id": f"e-{source}-{handle}-{target}", "source": source, "sourceHandle": handle, "target": target}


def _text(text):
    return {"type": "text", "text": text}


def main_menu():
    nodes = [
        _n("start", "start", 0, 120),
        _n("menu", "buttons", X, 60, text="Hi {{first_name}} 👋 Welcome! How can we help you today?",
           footer="Tap an option", header_type="none",
           buttons=[{"id": "b1", "title": "Browse products"}, {"id": "b2", "title": "Track my order"},
                    {"id": "b3", "title": "Talk to us"}]),
        _n("catalog", "list", 2 * X, -260, text="Here's what we offer. Pick a category to see more.",
           button="Categories", variable="category",
           sections=[{"title": None, "rows": [
               {"id": "r1", "title": "New arrivals", "description": "Fresh this week"},
               {"id": "r2", "title": "Best sellers", "description": "What everyone loves"},
               {"id": "r3", "title": "Offers", "description": "Up to 40% off"}]}]),
        _n("catalog_link", "message", 3 * X, -240, reply=_text(
            "Great choice! Here are our *{{category}}*: https://example.com/shop\n\nReply *menu* anytime to see "
            "the options again.")),
        _n("order", "question", 2 * X, 80, text="Please send your order number (it's in your confirmation "
           "message).", kind="text", variable="order_number", save_to="none"),
        _n("order_thanks", "message", 3 * X, 80, reply=_text(
            "Thanks! We're checking order *{{order_number}}*. Our team will update you here shortly.")),
        _n("order_team", "handover", 4 * X, 80, assign="auto", text=None),
        _n("talk", "handover", 2 * X, 380, assign="auto",
           text="Sure! Connecting you to our team. Someone will reply shortly."),
    ]
    edges = [_e("start", "menu"), _e("menu", "catalog", "b:b1"), _e("menu", "order", "b:b2"),
             _e("menu", "talk", "b:b3"), *[_e("catalog", "catalog_link", f"r:r{i}") for i in (1, 2, 3)],
             _e("order", "order_thanks"), _e("order_thanks", "order_team")]
    return {"nodes": nodes, "edges": edges}


def lead_capture():
    nodes = [
        _n("start", "start", 0, 100),
        _n("hello", "message", X, 80, reply=_text("Hi {{first_name}}! 👋 Thanks for reaching out to us.")),
        _n("ask_name", "question", 2 * X, 80, text="May I have your full name?", kind="text", variable="full_name",
           save_to="name"),
        _n("ask_email", "question", 3 * X, 80, text="Thanks {{full_name}}! What's your email address?",
           kind="email", variable="email", save_to="email"),
        _n("interest", "buttons", 4 * X, 60, text="And what are you interested in?", header_type="none",
           variable="interest", buttons=[{"id": "b1", "title": "Pricing"}, {"id": "b2", "title": "Product demo"},
                                         {"id": "b3", "title": "Something else"}]),
        _n("tag", "action", 5 * X, 80, actions=[{"type": "add_tags", "tags": ["lead"]},
                                                 {"type": "set_attribute", "key": "interest", "value": "{{interest}}"}]),
        _n("thanks", "message", 6 * X, 80, reply=_text(
            "Thank you, {{full_name}}! Our team will contact you at {{email}} within 24 hours.")),
        _n("team", "handover", 7 * X, 80, assign="auto", text=None),
    ]
    edges = [_e("start", "hello"), _e("hello", "ask_name"), _e("ask_name", "ask_email"), _e("ask_email", "interest"),
             *[_e("interest", "tag", f"b:b{i}") for i in (1, 2, 3)], _e("tag", "thanks"), _e("thanks", "team")]
    return {"nodes": nodes, "edges": edges}


def appointment():
    nodes = [
        _n("start", "start", 0, 120),
        _n("service", "list", X, 40, text="Hi {{first_name}}! Which service would you like to book?",
           button="Services", variable="service", sections=[
               {"title": "Hair", "rows": [{"id": "r1", "title": "Haircut", "description": "30 min · ₹400"},
                                          {"id": "r2", "title": "Hair colour", "description": "90 min · ₹1,800"}]},
               {"title": "Skin", "rows": [{"id": "r3", "title": "Facial", "description": "60 min · ₹1,200"},
                                          {"id": "r4", "title": "Clean-up", "description": "45 min · ₹700"}]}]),
        _n("date", "question", 2 * X, 80, text="Which date works for you? (for example 25/12/2026)", kind="date",
           variable="date"),
        _n("slot", "buttons", 3 * X, 60, text="And what time of day?", header_type="none", variable="slot",
           buttons=[{"id": "b1", "title": "Morning"}, {"id": "b2", "title": "Afternoon"},
                    {"id": "b3", "title": "Evening"}]),
        _n("save", "action", 4 * X, 80, actions=[{"type": "add_tags", "tags": ["appointment"]},
                                                  {"type": "set_attribute", "key": "last_booking",
                                                   "value": "{{service}} on {{date}} ({{slot}})"}]),
        _n("done", "end", 5 * X, 80, resolve=False, text=(
            "You're booked: *{{service}}* on *{{date}}*, {{slot}} 🎉\nWe'll send you a reminder. Reply *book* "
            "to make another booking.")),
    ]
    edges = [_e("start", "service"), *[_e("service", "date", f"r:r{i}") for i in (1, 2, 3, 4)],
             _e("date", "slot"), *[_e("slot", "save", f"b:b{i}") for i in (1, 2, 3)], _e("save", "done")]
    return {"nodes": nodes, "edges": edges}


def feedback():
    nodes = [
        _n("start", "start", 0, 120),
        _n("rate", "buttons", X, 60, text="How was your experience with us today?", header_type="none",
           variable="rating", buttons=[{"id": "b1", "title": "😀 Great"}, {"id": "b2", "title": "😐 Okay"},
                                       {"id": "b3", "title": "😞 Not good"}]),
        _n("great", "end", 2 * X, -160, text="Thank you! 💚 That made our day.", resolve=True),
        _n("better", "question", 2 * X, 80, text="Thanks for telling us. What could we do better?", kind="text",
           variable="suggestion"),
        _n("noted", "end", 3 * X, 80, text="Noted, thank you! We'll work on it.", resolve=True),
        _n("sorry", "handover", 2 * X, 340, assign="auto",
           text="We're really sorry about that. Someone from our team will talk to you right away."),
    ]
    edges = [_e("start", "rate"), _e("rate", "great", "b:b1"), _e("rate", "better", "b:b2"),
             _e("rate", "sorry", "b:b3"), _e("better", "noted")]
    return {"nodes": nodes, "edges": edges}


def order_status():
    nodes = [
        _n("start", "start", 0, 120),
        _n("ask", "question", X, 80, text="Please send your order number.", kind="number", variable="order_id"),
        _n("lookup", "webhook", 2 * X, 60, method="GET", url="https://api.example.com/orders/{{order_id}}",
           headers=[{"key": "Authorization", "value": "Bearer YOUR_API_KEY"}], body=None,
           save=[{"path": "status", "variable": "order_status"}, {"path": "eta", "variable": "eta"}]),
        _n("found", "end", 3 * X, -40, text="Order *{{order_id}}*: {{order_status}}\nExpected by {{eta}}."),
        _n("missing", "handover", 3 * X, 220, assign="auto",
           text="We couldn't find that order right now. Someone from our team will check and reply here."),
    ]
    edges = [_e("start", "ask"), _e("ask", "lookup"), _e("lookup", "found", "ok"), _e("lookup", "missing", "fail")]
    return {"nodes": nodes, "edges": edges}


def blank():
    return {"nodes": [_n("start", "start", 0, 120)], "edges": []}


STARTERS = {
    "main_menu": {"name": "Main menu", "trigger": "keyword", "keywords": ["menu", "hi", "hello"], "build": main_menu,
                  "description": "Buttons for products, order tracking and talking to your team."},
    "lead_capture": {"name": "Lead capture", "trigger": "new_chat", "keywords": [], "build": lead_capture,
                     "description": "Greets new customers, asks name, email and interest, tags them as leads."},
    "appointment": {"name": "Appointment booking", "trigger": "keyword", "keywords": ["book", "appointment"],
                    "build": appointment, "description": "A list of services, a date and a time slot, saved on the "
                                                         "contact."},
    "feedback": {"name": "Feedback", "trigger": "keyword", "keywords": ["feedback"], "build": feedback,
                 "description": "Rate us in one tap; unhappy customers go straight to your team."},
    "order_status": {"name": "Order status (API)", "trigger": "keyword", "keywords": ["order status", "track"],
                     "build": order_status, "description": "Asks the order number and looks it up in your system."},
}


def starter_list() -> list[dict]:
    return [{"key": k, "name": v["name"], "description": v["description"], "trigger": v["trigger"],
             "keywords": v["keywords"]} for k, v in STARTERS.items()]

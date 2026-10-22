from app.core.config import DEFAULT_APP_NAME
from app.core.database import SessionLocal
from app.modules.admin.menus.models import Menu, MenuItem
from app.modules.admin.seo.models import DEFAULT_SEO_PATH, SeoPage
from app.modules.admin.settings.models import Setting

MENUS = {
    "header": ("Header menu", [("Home", "/"), ("Features", "/#features"), ("Pricing", "/#pricing"),
                               ("Blog", "/blog"), ("Contact", "/contact")]),
    "footer": ("Footer menu", [("Privacy policy", "/privacy-policy"), ("Terms", "/terms"),
                               ("Contact", "/contact")]),
}

SEO = [
    (DEFAULT_SEO_PATH, "Default (all pages)", f"{DEFAULT_APP_NAME} | Welcome",
     "Team inbox, broadcasts, chatbots and AI for WhatsApp Business."),
    ("/", "Home", f"{DEFAULT_APP_NAME} | WhatsApp Business platform", "Talk to every customer on WhatsApp: shared inbox, broadcasts, chatbots and AI agents."),
    ("/blog", "Blog", f"Blog | {DEFAULT_APP_NAME}", "News, guides and updates."),
    ("/contact", "Contact", f"Contact us | {DEFAULT_APP_NAME}", "Get in touch with our team."),
]


def run() -> None:
    db = SessionLocal()
    try:
        if not db.query(Setting).filter(Setting.key == "general").first():
            db.add(Setting(key="general", value={
                "app_name": DEFAULT_APP_NAME,
                "tagline": "WhatsApp marketing, support and automation in one place",
                "phones": ["+91 98765 43210"],
                "emails": ["hello@example.com"],
                "addresses": [{"label": "Head office", "text": "123 Main Street, New Delhi, India", "map_iframe": ""}],
                "social_links": [{"platform": "facebook", "url": "https://facebook.com"},
                                 {"platform": "instagram", "url": "https://instagram.com"}],
                "footer_text": "All rights reserved.",
            }))
            print("  settings: general")

        for key, (name, items) in MENUS.items():
            if db.query(Menu).filter(Menu.key == key).first():
                continue
            menu = Menu(key=key, name=name)
            db.add(menu)
            db.flush()
            for i, (label, url) in enumerate(items):
                db.add(MenuItem(menu_id=menu.id, label=label, url=url, sort_order=i))
            print(f"  menu: {key}")

        for path, page, title, description in SEO:
            if not db.query(SeoPage).filter(SeoPage.path == path).first():
                db.add(SeoPage(path=path, page=page, meta_title=title, meta_description=description))
                print(f"  seo: {path}")
        db.commit()
    finally:
        db.close()

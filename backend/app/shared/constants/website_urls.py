"""Public website page paths on the frontend (sitemap, default menus and SEO).

Keep in sync with frontend/src/config/routes/website.ts.
"""

HOME = "/"
BLOG = "/blog"
GALLERY = "/gallery"
CONTACT = "/contact"
TEAM = "/team"
PRIVACY_POLICY = "/privacy-policy"
TERMS = "/terms"


def blog_post(slug: str) -> str:
    return f"{BLOG}/{slug}"


def gallery_item(slug: str) -> str:
    return f"{GALLERY}/{slug}"


def page(slug: str) -> str:
    return f"/{slug}"

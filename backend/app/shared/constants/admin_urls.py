"""Admin panel page paths on the frontend.

Keep in sync with frontend/src/config/routes/admin.ts and frontend/src/config/modules.ts.
"""

from urllib.parse import urlencode

ROOT = "/admin"
LOGIN = f"{ROOT}/login"
FORGOT_PASSWORD = f"{ROOT}/forgot-password"
RESET_PASSWORD = f"{ROOT}/reset-password"

ENQUIRIES = f"{ROOT}/enquiries"
USERS = f"{ROOT}/users"
CUSTOMERS = f"{ROOT}/customers"
BLOGS = f"{ROOT}/blogs"
BLOG_CATEGORIES = f"{ROOT}/blog-categories"
COMMENTS = f"{ROOT}/comments"
PAGES = f"{ROOT}/pages"
TESTIMONIALS = f"{ROOT}/testimonials"
TEAM = f"{ROOT}/team"
GALLERIES = f"{ROOT}/galleries"
REDIRECTS = f"{ROOT}/redirects"
SEO = f"{ROOT}/seo"
SETTINGS = f"{ROOT}/settings"
BACKUPS = f"{ROOT}/backups"


def admin_url(path: str, **params) -> str:
    query = urlencode({k: v for k, v in params.items() if v not in (None, "")})
    return f"{path}?{query}" if query else path

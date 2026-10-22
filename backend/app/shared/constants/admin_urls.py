from urllib.parse import urlencode

ENQUIRIES = "/admin/enquiries"
USERS = "/admin/users"
CUSTOMERS = "/admin/customers"
BLOGS = "/admin/blogs"
BLOG_CATEGORIES = "/admin/blog-categories"
COMMENTS = "/admin/comments"
PAGES = "/admin/pages"
TESTIMONIALS = "/admin/testimonials"
TEAM = "/admin/team"
GALLERIES = "/admin/galleries"
REDIRECTS = "/admin/redirects"
SEO = "/admin/seo"
SETTINGS = "/admin/settings"
BACKUPS = "/admin/backups"


def admin_url(path: str, **params) -> str:
    query = urlencode({k: v for k, v in params.items() if v not in (None, "")})
    return f"{path}?{query}" if query else path

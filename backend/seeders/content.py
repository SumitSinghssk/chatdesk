import random
from datetime import timedelta

from app.core.database import SessionLocal
from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blogs.models import Blog
from app.modules.admin.enquiries.models import Enquiry, EnquiryActivity
from app.modules.admin.pages.models import Page
from app.modules.admin.testimonials.models import Testimonial
from app.modules.admin.users.models import User
from app.shared.enums import EnquiryStatus, PublishStatus
from app.shared.utils.datetime import now
from app.shared.utils.slug import normalize_slug

LOREM = (
    "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante "
    "venenatis dapibus posuere velit aliquet.</p><h2>Why it matters</h2><p>Donec ullamcorper nulla "
    "non metus auctor fringilla. Vestibulum id ligula porta felis euismod semper.</p>"
    "<ul><li>Fast to set up</li><li>Easy to extend</li><li>Secure by default</li></ul>"
)

CATEGORIES = ["News", "Guides", "Product updates"]
BLOGS = [
    "Getting started with the starter kit",
    "How we structure FastAPI modules",
    "SEO checklist for Next.js websites",
    "Managing roles and permissions",
    "Writing great blog posts",
]
PAGES = [("About us", "about"), ("Privacy policy", "privacy-policy"), ("Terms of service", "terms")]
TESTIMONIALS = [
    ("Aarav Sharma", "Founder", "Pixel Labs", "The admin panel saved us weeks of work. Clean and easy to extend.", 5),
    ("Priya Mehta", "Marketing Lead", "Brightside", "SEO controls are exactly what our team needed.", 5),
    ("Rohan Verma", "CTO", "Stackwise", "Solid architecture — our developers were productive on day one.", 4),
]
NAMES = ["Neha Gupta", "Vikram Singh", "Ananya Iyer", "Kabir Khan", "Isha Patel", "Arjun Nair",
         "Meera Joshi", "Dev Malhotra", "Sara Thomas", "Rahul Das"]


def run() -> None:
    db = SessionLocal()
    try:
        author = db.query(User).order_by(User.id).first()
        if db.query(BlogCategory).count() == 0:
            cats = []
            for name in CATEGORIES:
                cat = BlogCategory(name=name, slug=normalize_slug(name), description=f"{name} articles")
                db.add(cat)
                cats.append(cat)
            db.flush()
            for i, title in enumerate(BLOGS):
                blog = Blog(
                    title=title,
                    slug=normalize_slug(title),
                    excerpt="A short summary of the article that appears on listing pages and in search results.",
                    content=LOREM,
                    status=PublishStatus.PUBLISHED.value,
                    published_at=now() - timedelta(days=i * 3),
                    author_id=author.id if author else None,
                )
                blog.categories = [cats[i % len(cats)]]
                db.add(blog)
            print(f"  blogs: {len(BLOGS)}")

        if db.query(Page).count() == 0:
            for title, slug in PAGES:
                db.add(Page(title=title, slug=slug, content=LOREM, status=PublishStatus.PUBLISHED.value,
                            published_at=now(), author_id=author.id if author else None))
            print(f"  pages: {len(PAGES)}")

        if db.query(Testimonial).count() == 0:
            for i, (name, role, company, quote, rating) in enumerate(TESTIMONIALS):
                db.add(Testimonial(name=name, designation=role, company=company, quote=quote,
                                   rating=rating, is_featured=i == 0, sort_order=i))
            print(f"  testimonials: {len(TESTIMONIALS)}")

        if db.query(Enquiry).count() == 0:
            statuses = EnquiryStatus.values()
            for i, name in enumerate(NAMES):
                created = now() - timedelta(days=random.randint(0, 13), hours=random.randint(0, 23))
                enquiry = Enquiry(
                    name=name,
                    email=f"{name.split()[0].lower()}@example.com",
                    phone=f"98{random.randint(10000000, 99999999)}",
                    subject=random.choice(["Pricing", "Partnership", "Support", "General question"]),
                    message="Hi, I'd like to know more about your services. Please get in touch.",
                    source=random.choice(["website", "phone-call", "email", "whatsapp"]),
                    status=statuses[i % 4],
                    created_at=created,
                    updated_at=created,
                )
                db.add(enquiry)
                db.flush()
                db.add(EnquiryActivity(enquiry_id=enquiry.id, type="created", body="Enquiry received", created_at=created))
            print(f"  enquiries: {len(NAMES)}")
        db.commit()
    finally:
        db.close()

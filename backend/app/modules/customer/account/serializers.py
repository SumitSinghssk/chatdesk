from app.modules.customer.account.models import Customer
from app.modules.customer.account.settings import preferences
from app.shared.utils.datetime import iso


def serialize_customer(customer: Customer) -> dict:
    return {
        "id": customer.id,
        "name": customer.name,
        "business_name": customer.business_name,
        "email": customer.email,
        "phone": customer.phone,
        "avatar": customer.avatar,
        "job_title": customer.job_title,
        "pending_email": customer.pending_email,
        "two_factor_enabled": customer.two_factor_enabled,
        "preferences": preferences(customer),
        "has_password": bool(customer.password),
        "google_linked": bool(customer.google_id),
        "email_verified": bool(customer.email_verified_at),
        "phone_verified": bool(customer.phone_verified_at),
        "signup_method": customer.signup_method,
        "last_login_at": iso(customer.last_login_at),
        "created_at": iso(customer.created_at),
        # team: the workspace this person works in and their role there
        "role": customer.role if customer.workspace_id else "owner",
        "availability": customer.availability,
        "workspace": {
            "id": customer.workspace_id or customer.id,
            "name": (owner.business_name or owner.name) if (owner := customer.workspace or customer) else None,
        },
    }

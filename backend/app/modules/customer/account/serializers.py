from app.modules.customer.account.models import Customer
from app.shared.utils.datetime import iso


def serialize_customer(customer: Customer) -> dict:
    return {
        "id": customer.id,
        "name": customer.name,
        "business_name": customer.business_name,
        "email": customer.email,
        "phone": customer.phone,
        "avatar": customer.avatar,
        "has_password": bool(customer.password),
        "google_linked": bool(customer.google_id),
        "email_verified": bool(customer.email_verified_at),
        "phone_verified": bool(customer.phone_verified_at),
        "signup_method": customer.signup_method,
        "last_login_at": iso(customer.last_login_at),
        "created_at": iso(customer.created_at),
    }

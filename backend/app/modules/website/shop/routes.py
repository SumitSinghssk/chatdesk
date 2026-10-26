"""Public shop pages. A page for each product: Meta's catalog needs a link for every item, and customers who
tap "View website" in WhatsApp land here. The invoice. And payments: the link customers tap (it forwards to
the business's gateway), the page they come back to after paying, and the gateways' webhooks."""
import html
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import service
from app.modules.customer.commerce.models import CommerceSettings, Product
from app.modules.customer.whatsapp.models import WhatsAppAccount

router = APIRouter(prefix="/shop")

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
<meta property="og:title" content="{title}"><meta property="og:description" content="{summary}">
{og_image}
<style>
:root{{--bg:#f6f7f9;--card:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--brand:#0f766e}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0b1120;--card:#111827;--fg:#e5e7eb;--muted:#94a3b8;--line:#1f2937}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:960px;margin:0 auto;padding:24px 16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;
display:grid;grid-template-columns:1fr}}@media(min-width:760px){{.card{{grid-template-columns:1fr 1fr}}}}
.gallery img{{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--bg)}}
.thumbs{{display:flex;gap:8px;padding:8px;overflow-x:auto}}.thumbs img{{width:64px;height:64px;object-fit:cover;
border-radius:10px;border:1px solid var(--line)}}
.info{{padding:24px}}.store{{color:var(--muted);font-size:14px;margin:0}}h1{{font-size:26px;line-height:1.2;
margin:6px 0 10px}}.price{{font-size:24px;font-weight:700}}.was{{color:var(--muted);text-decoration:line-through;
font-size:16px;margin-left:8px;font-weight:400}}.stock{{display:inline-block;margin-top:8px;font-size:13px;
padding:2px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c}}
.desc{{white-space:pre-line;color:var(--muted);margin:16px 0}}
.opts{{margin:12px 0;font-size:14px}}.opts b{{display:block;margin-bottom:4px}}.chip{{display:inline-block;
border:1px solid var(--line);border-radius:999px;padding:3px 12px;margin:0 6px 6px 0}}
.btn{{display:inline-flex;gap:8px;align-items:center;justify-content:center;background:#16a34a;color:#fff;
text-decoration:none;font-weight:600;padding:14px 20px;border-radius:14px;width:100%;margin-top:8px}}
</style></head><body><main><div class="card"><div class="gallery">{main_image}{thumbs}</div>
<div class="info"><p class="store">{store}</p><h1>{name}</h1><div class="price">{price}{was}</div>{stock}
{options}<p class="desc">{description}</p>{button}</div></div></main></body></html>"""


@router.get("/{customer_id}/products/{product_id}", response_class=HTMLResponse,
            dependencies=[Depends(RateLimit(120, 60))])
def product_page(customer_id: int, product_id: int, db: Session = Depends(get_db)):
    product = (db.query(Product).options(selectinload(Product.variants))
               .filter(Product.id == product_id, Product.customer_id == customer_id, Product.not_deleted(),
                       Product.status != "draft").first())
    owner = db.get(Customer, customer_id)
    if product is None or owner is None:
        raise HTTPException(404, detail="Product not found")
    store = db.query(CommerceSettings).filter(CommerceSettings.customer_id == customer_id).first()
    currency = store.currency if store else "INR"
    store_name = (store.store_name if store else None) or owner.business_name or owner.name or ""
    variant = min(product.variants, key=lambda v: v.sale_price if v.sale_price is not None else v.price)
    images = [service.image_url(i, absolute=True) for i in product.images or []]
    e = html.escape
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer_id).first()
    phone = re.sub(r"\D", "", account.display_phone_number or "") if account else ""
    button = ""
    if phone:
        text = quote(f"Hi! I'd like to order: {product.name}")
        button = f'<a class="btn" href="https://wa.me/{phone}?text={text}">Order on WhatsApp</a>'
    options = "".join(
        f"<div class='opts'><b>{e(o['name'])}</b>{''.join(f'<span class=chip>{e(v)}</span>' for v in o['values'])}"
        "</div>" for o in product.options or [])
    page = PAGE.format(
        title=e(f"{product.name} · {store_name}"),
        summary=e((product.description or product.name)[:200]),
        og_image=f'<meta property="og:image" content="{e(images[0])}">' if images else "",
        main_image=f'<img src="{e(images[0])}" alt="{e(product.name)}">' if images else "",
        thumbs=("<div class='thumbs'>" + "".join(f'<img src="{e(i)}" alt="">' for i in images[1:]) + "</div>")
        if len(images) > 1 else "",
        store=e(store_name),
        name=e(product.name),
        price=e(service.money(variant.sale_price if variant.sale_price is not None else variant.price, currency)),
        was=f"<span class='was'>{e(service.money(variant.price, currency))}</span>"
        if variant.sale_price is not None else "",
        stock="<span class='stock'>Out of stock</span>" if all(v.stock == 0 for v in product.variants) else "",
        options=options,
        description=e(product.description or ""),
        button=button,
    )
    return HTMLResponse(page)


@router.get("/invoice/{key}", response_class=HTMLResponse, dependencies=[Depends(RateLimit(60, 60))])
def invoice_page(key: str, db: Session = Depends(get_db)):
    from app.modules.customer.commerce import manage

    return manage.invoice(db, key)


# payments ------------------------------------------------------------------------------------------

PAY_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{title}</title><style>
:root{{--bg:#f6f7f9;--card:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0b1120;--card:#111827;--fg:#e5e7eb;--muted:#94a3b8;--line:#1f2937}}}}
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);
color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:32px 24px;max-width:420px;
width:100%;text-align:center}}.icon{{font-size:44px;line-height:1}}h1{{font-size:22px;margin:14px 0 6px}}
p{{color:var(--muted);margin:0 0 6px}}.amount{{font-size:28px;font-weight:700;color:var(--fg);margin:14px 0 2px}}
.btn{{display:flex;align-items:center;justify-content:center;background:#16a34a;color:#fff;text-decoration:none;
font-weight:600;padding:14px 20px;border-radius:14px;margin-top:22px}}.store{{font-size:14px}}
</style>{refresh}</head><body><main class="card"><div class="icon">{icon}</div><h1>{heading}</h1>
<p>{text}</p>{amount}<p class="store">{store}</p>{button}</main></body></html>"""


def _pay_page(db: Session, reference: str, after_paying: bool) -> HTMLResponse:
    from app.modules.customer.commerce import orders, payments
    from app.modules.customer.commerce.models import Order, OrderPayment

    p = db.query(OrderPayment).filter(OrderPayment.reference == reference).first() if 10 <= len(reference) <= 40 else None
    if p is None:
        raise HTTPException(404, detail="Payment not found")
    if after_paying and p.status == "created":
        event = payments.check(db, p)  # the webhook may not have arrived yet
        if event is not None:
            payments.apply(db, db.get(Customer, p.customer_id), p, event)
        db.commit()
    order = db.get(Order, p.order_id)
    owner = db.get(Customer, p.customer_id)
    store = db.query(CommerceSettings).filter(CommerceSettings.customer_id == p.customer_id).first()
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == p.customer_id).first()
    phone = re.sub(r"\D", "", account.display_phone_number or "") if account else ""
    e = html.escape
    ref = orders.order_ref(order, store)
    if p.status == "paid" or order.payment_status in orders.PAID:
        icon, heading, text = "✅", "Payment received", f"Thank you! Order {ref} is paid. We've sent the details on WhatsApp."
    elif p.status == "created" and after_paying:
        icon, heading, text = "⏳", "Confirming your payment", "This takes a moment. You'll get a WhatsApp message soon."
    elif p.status == "created":
        icon, heading, text = "💳", "Opening the payment page…", "If nothing happens, go back to WhatsApp and tap Pay."
    elif p.status == "failed":
        icon, heading, text = "⚠️", "The payment didn't go through", "Go back to WhatsApp and ask us for a new link."
    else:
        icon, heading, text = "⌛", "This payment link has expired", "Go back to WhatsApp and ask us for a new one."
    button = f'<a class="btn" href="https://wa.me/{phone}">Back to WhatsApp</a>' if phone else ""
    page = PAY_PAGE.format(
        title=e(heading), icon=icon, heading=e(heading), text=e(text),
        amount=f'<p class="amount">{e(service.money(p.amount, p.currency))}</p>',
        store=e((store.store_name if store else None) or owner.business_name or ""), button=button,
        refresh='<meta http-equiv="refresh" content="6">' if p.status == "created" and after_paying else "",
    )
    return HTMLResponse(page, headers={"X-Robots-Tag": "noindex", "Cache-Control": "no-store"})


@router.get("/pay/go/{reference}", response_class=HTMLResponse, dependencies=[Depends(RateLimit(60, 60))])
def pay_go(reference: str, db: Session = Depends(get_db)):
    """The link customers get: straight to the gateway while it's open, else a page saying why not."""
    from fastapi.responses import RedirectResponse

    from app.modules.customer.commerce.models import OrderPayment
    from app.shared.utils.datetime import now

    p = db.query(OrderPayment).filter(OrderPayment.reference == reference).first() if 10 <= len(reference) <= 40 else None
    if p is not None and p.status == "created" and p.url and (p.expires_at is None or p.expires_at > now()):
        return RedirectResponse(p.url, status_code=302)
    return _pay_page(db, reference, after_paying=False)


@router.api_route("/pay/r/{reference}", methods=["GET", "POST"], response_class=HTMLResponse, include_in_schema=False,
                  dependencies=[Depends(RateLimit(60, 60))])
def pay_return(reference: str, db: Session = Depends(get_db)):
    """Where the gateway sends the customer after paying."""
    return _pay_page(db, reference, after_paying=True)


@router.post("/pay/{provider}/{webhook_key}", include_in_schema=False)
async def pay_webhook(provider: str, webhook_key: str, request: Request, db: Session = Depends(get_db)):
    from app.modules.customer.commerce import payments

    body = await request.body()
    code, message = payments.webhook(db, provider, webhook_key, body, dict(request.headers))
    return JSONResponse(status_code=code, content={"status": code == 200, "message": message})


@router.post("/store/{platform}/{webhook_key}", include_in_schema=False)
async def store_webhook(platform: str, webhook_key: str, request: Request, db: Session = Depends(get_db)):
    """Orders, abandoned checkouts and product changes from a connected Shopify or WooCommerce store."""
    from app.modules.customer.commerce import stores

    body = await request.body()
    code, message = stores.webhook(db, platform, webhook_key, body, dict(request.headers))
    return JSONResponse(status_code=code, content={"status": code == 200, "message": message})

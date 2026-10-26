import io

import pytest

from app.modules.customer.automation import engine as automation_engine
from app.modules.customer.inbox import service as inbox_service
from app.modules.customer.templates import service as templates_service
from app.modules.customer.whatsapp import service as wa_service
from app.services.whatsapp import WhatsAppError
from tests.test_inbox import BASE, WEB, FakeMeta, business, first_conversation, inbound  # noqa: F401

C = f"{BASE}/commerce"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class FakeShop(FakeMeta):
    """FakeMeta plus Meta's catalog API."""

    batches: list[list[dict]] = []
    batch_errors: list[dict] = []
    catalog_items: list[dict] = []
    commerce: dict = {}
    refuse_batch = False

    def product_catalogs(self, waba_id):
        return [{"id": "778899001", "name": "Sweets Catalog", "product_count": 3}]

    def connect_catalog(self, waba_id, catalog_id):
        if catalog_id == "111111":
            raise WhatsAppError("Invalid parameter", 400, 100, "Catalog not found or no access")
        return {"success": True}

    def disconnect_catalog(self, waba_id, catalog_id):
        return {"success": True}

    def catalog_info(self, catalog_id):
        return {"id": catalog_id, "name": "Sweets Catalog"}

    def commerce_settings(self):
        return {"is_cart_enabled": FakeShop.commerce.get("cart"), "is_catalog_visible": FakeShop.commerce.get("vis")}

    def set_commerce_settings(self, cart, catalog_visible):
        FakeShop.commerce = {"cart": cart, "vis": catalog_visible}
        return {"success": True}

    def catalog_batch(self, catalog_id, requests):
        if FakeShop.refuse_batch:
            raise WhatsAppError("(#200) Permissions error", 403, 200, None)
        FakeShop.batches.append(requests)
        return [f"handle-{len(FakeShop.batches)}"]

    def catalog_batch_status(self, catalog_id, handle):
        return {"status": "finished", "errors": FakeShop.batch_errors}

    def catalog_products(self, catalog_id, limit=100, max_pages=50):
        return FakeShop.catalog_items


@pytest.fixture()
def shop(business, monkeypatch):  # noqa: F811
    for module in (wa_service, inbox_service, templates_service, automation_engine):
        monkeypatch.setattr(module, "WhatsAppClient", FakeShop)
    FakeShop.batches, FakeShop.batch_errors, FakeShop.catalog_items = [], [], []
    FakeShop.commerce, FakeShop.refuse_batch = {}, False
    return business


def _product(**over):
    body = {"name": "Kaju Katli", "description": "Fresh cashew fudge", "images": [], "status": "active",
            "variants": [{"price": 499, "stock": 20}]}
    body.update(over)
    return body


def test_products_variants_collections_and_listing(shop):
    up = shop.post(f"{C}/products/images", headers=WEB, files={"file": ("k.png", io.BytesIO(PNG), "image/png")})
    assert up.status_code == 200, up.text
    image = up.json()["data"]["path"]
    assert image.startswith("uploads/products/")

    col = shop.post(f"{C}/collections", headers=WEB, json={"name": "Sweets"}).json()["data"]
    dup = shop.post(f"{C}/collections", headers=WEB, json={"name": "sweets"})
    assert dup.status_code == 422

    res = shop.post(f"{C}/products", headers=WEB, json=_product(
        images=[image], collection_id=col["id"], options=[{"name": "Size", "values": ["250 g", "500 g", "250 g"]}],
        variants=[{"option_values": {"Size": "250 g"}, "price": 249.5, "sale_price": 199, "stock": 4,
                   "retailer_id": "KK-250"},
                  {"option_values": {"Size": "500 g"}, "price": 499, "stock": 0}]))
    assert res.status_code == 200, res.text
    p = res.json()["data"]
    assert p["options"] == [{"name": "Size", "values": ["250 g", "500 g"]}]
    assert [v["label"] for v in p["variants"]] == ["250 g", "500 g"]
    assert p["variants"][0]["price"] == 249.5 and p["variants"][0]["sale_price"] == 199.0
    assert p["variants"][1]["retailer_id"].startswith("KAJU-KATLI-")  # SKU made up
    assert p["price_text"] == "₹199 – ₹499" and p["stock"] == 4 and p["sync_state"] is None
    assert p["collection"]["name"] == "Sweets" and p["images"][0]["url"].endswith(".png")

    # validation: same SKU, bad sale price, variant without option value, missing variants
    bad = shop.post(f"{C}/products", headers=WEB, json=_product(variants=[{"price": 10, "retailer_id": "kk-250"}]))
    assert bad.status_code == 422 and "SKU" in bad.text
    assert shop.post(f"{C}/products", headers=WEB, json=_product(
        variants=[{"price": 10, "sale_price": 12}])).status_code == 422
    assert shop.post(f"{C}/products", headers=WEB, json=_product(
        options=[{"name": "Size", "values": ["S"]}], variants=[{"price": 1}])).status_code == 422
    assert shop.post(f"{C}/products", headers=WEB, json=_product(variants=[])).status_code == 422
    assert shop.post(f"{C}/products", headers=WEB, json=_product(
        variants=[{"price": 1}, {"price": 2}])).status_code == 422

    # editing keeps existing variants (by id) and drops removed ones
    edit = shop.put(f"{C}/products/{p['id']}", headers=WEB, json=_product(
        name="Kaju Katli Premium", images=[image], collection_id=col["id"], options=[{"name": "Size", "values": ["250 g"]}],
        variants=[{"id": p["variants"][0]["id"], "option_values": {"Size": "250 g"}, "price": 260,
                   "retailer_id": "KK-250", "stock": 3}]))
    assert edit.status_code == 200, edit.text
    edited = edit.json()["data"]
    assert len(edited["variants"]) == 1 and edited["variants"][0]["id"] == p["variants"][0]["id"]

    shop.post(f"{C}/products", headers=WEB, json=_product(name="Soan Papdi", status="hidden",
                                                         variants=[{"price": 150, "stock": 0}]))
    shop.post(f"{C}/products", headers=WEB, json=_product(name="Draft Ladoo", status="draft"))

    page = shop.get(f"{C}/products", params={"page": 1, "search": "kaju"}).json()
    assert [r["name"] for r in page["data"]] == ["Kaju Katli Premium"] and page["meta"]["total"] == 1
    assert shop.get(f"{C}/products", params={"page": 1, "search": "KK-250"}).json()["meta"]["total"] == 1
    assert [r["name"] for r in shop.get(f"{C}/products", params={"page": 1, "stock": "out"}).json()["data"]] == [
        "Soan Papdi"]
    assert shop.get(f"{C}/products", params={"page": 1, "collection_id": 0}).json()["meta"]["total"] == 2
    stats = shop.get(f"{C}/products/stats").json()["data"]
    assert (stats["total"], stats["active"], stats["hidden"], stats["draft"]) == (3, 1, 1, 1)
    assert stats["out_of_stock"] == 1 and stats["low_stock"] == 1 and stats["catalog_connected"] is False

    cols = shop.get(f"{C}/collections").json()["data"]
    assert cols[0]["products"] == 1
    copy = shop.post(f"{C}/products/{p['id']}/duplicate", headers=WEB).json()["data"]
    assert copy["status"] == "draft" and copy["variants"][0]["retailer_id"] != "KK-250"

    # deleting frees the SKU
    assert shop.delete(f"{C}/products/{p['id']}", headers=WEB).status_code == 200
    again = shop.post(f"{C}/products", headers=WEB, json=_product(variants=[{"price": 10, "retailer_id": "KK-250"}]))
    assert again.status_code == 200, again.text

    # public product page
    page = shop.get(f"/api/v1/website/shop/{again.json()['data']['id'] and _owner(shop)}/products/"
                    f"{again.json()['data']['id']}")
    assert page.status_code == 200 and "Kaju Katli" in page.text and "₹10" in page.text


def _owner(web) -> int:
    return web.get(f"{BASE}/account/me").json()["data"]["id"]


def test_meta_catalog_connect_sync_errors_and_import(shop):
    p = shop.post(f"{C}/products", headers=WEB, json=_product(
        options=[{"name": "Colour", "values": ["Red", "Blue"]}],
        variants=[{"option_values": {"Colour": "Red"}, "price": 100, "retailer_id": "TEE-R"},
                  {"option_values": {"Colour": "Blue"}, "price": 100, "retailer_id": "TEE-B", "stock": 0}])).json()
    assert FakeShop.batches == []  # nothing goes to Meta before a catalog is connected

    listed = shop.get(f"{C}/catalog").json()["data"]
    assert listed["catalogs"][0]["id"] == "778899001"
    wrong = shop.post(f"{C}/catalog/connect", headers=WEB, json={"catalog_id": "111111"})
    assert wrong.status_code == 422 and "Catalog not found" in wrong.text

    ok = shop.post(f"{C}/catalog/connect", headers=WEB, json={"catalog_id": "778899001"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["catalog"]["name"] == "Sweets Catalog"
    assert FakeShop.commerce == {"cart": True, "vis": True}
    items = {r["data"]["id"]: r["data"] for r in FakeShop.batches[-1]}
    red, blue = items["TEE-R"], items["TEE-B"]
    assert red["price"] == "100.00 INR" and red["availability"] == "in stock" and red["color"] == "Red"
    assert blue["availability"] == "out of stock" and red["item_group_id"] == blue["item_group_id"]
    assert red["link"].endswith(f"/products/{p['data']['id']}") and red["visibility"] == "published"

    # Meta rejects one item: it's marked, the other is synced
    FakeShop.batch_errors = [{"id": "TEE-B", "message": "Image link is missing"}]
    stats = shop.get(f"{C}/products/stats").json()["data"]
    assert stats["synced"] == 1 and stats["sync_errors"] == 1
    product = shop.get(f"{C}/products/{p['data']['id']}").json()["data"]
    assert product["sync_state"] == "error" and "Image link is missing" in product["sync_errors"][0]

    # hiding sends it as staging; a draft is removed from Meta
    shop.post(f"{C}/products/bulk", headers=WEB, json={"ids": [p["data"]["id"]], "action": "hide"})
    assert FakeShop.batches[-1][0]["data"]["visibility"] == "staging"
    body = _product(status="draft", options=[{"name": "Colour", "values": ["Red"]}],
                    variants=[{"id": product["variants"][0]["id"], "option_values": {"Colour": "Red"}, "price": 100,
                               "retailer_id": "TEE-R"}])
    shop.put(f"{C}/products/{p['data']['id']}", headers=WEB, json=body)
    assert {(r["method"], r["data"]["id"]) for r in FakeShop.batches[-1]} == {("DELETE", "TEE-R"),
                                                                                ("DELETE", "TEE-B")}

    # a token without catalog permission: the error is shown, nothing breaks
    FakeShop.refuse_batch = True
    shop.post(f"{C}/products", headers=WEB, json=_product(name="Barfi", variants=[{"price": 5}]))
    settings = shop.get(f"{C}/settings").json()["data"]
    assert "catalog_management" in settings["sync_error"]
    FakeShop.refuse_batch = False

    # importing products already in the Meta catalog
    FakeShop.catalog_items = [
        {"retailer_id": "M-1", "name": "Rasgulla", "price": "₹1,299.00", "availability": "in stock",
         "image_url": "https://cdn.example.com/r.jpg", "retailer_product_group_id": "G1", "size": "1 kg"},
        {"retailer_id": "M-2", "name": "Rasgulla", "price": "₹699.00", "sale_price": "₹599.00",
         "availability": "out of stock", "retailer_product_group_id": "G1", "size": "500 g"},
        {"retailer_id": "TEE-R", "name": "Already here", "price": "1.00 INR"},
    ]
    imported = shop.post(f"{C}/catalog/import", headers=WEB).json()
    assert imported["data"] == {"created": 1, "found": 3}
    rasgulla = shop.get(f"{C}/products", params={"page": 1, "search": "Rasgulla"}).json()["data"][0]
    assert rasgulla["options"] == [{"name": "Size", "values": ["1 kg", "500 g"]}]
    assert [v["price"] for v in rasgulla["variants"]] == [1299.0, 699.0]
    assert rasgulla["variants"][1]["sale_price"] == 599.0 and rasgulla["variants"][1]["stock"] == 0

    # currency change re-sends prices
    before = len(FakeShop.batches)
    shop.put(f"{C}/settings", headers=WEB, json={"currency": "USD", "auto_sync": True, "cart_enabled": False,
                                                  "catalog_visible": True})
    updates = [r for r in FakeShop.batches[-1] if r["method"] == "UPDATE"]
    assert len(FakeShop.batches) == before + 1 and all("USD" in r["data"]["price"] for r in updates) and updates
    assert FakeShop.commerce == {"cart": False, "vis": True}

    assert shop.delete(f"{C}/catalog", headers=WEB).json()["data"]["catalog"] is None


def test_sending_products_in_a_chat(shop):
    inbound(shop, text="Show me your sweets")
    conv = first_conversation(shop)
    up = shop.post(f"{C}/products/images", headers=WEB, files={"file": ("k.png", io.BytesIO(PNG), "image/png")})
    col = shop.post(f"{C}/collections", headers=WEB, json={"name": "Gift boxes"}).json()["data"]
    a = shop.post(f"{C}/products", headers=WEB, json=_product(
        images=[up.json()["data"]["path"]], variants=[{"price": 499, "sale_price": 399, "retailer_id": "KK"}],
        collection_id=col["id"])).json()["data"]
    b = shop.post(f"{C}/products", headers=WEB, json=_product(name="Barfi", variants=[{"price": 299}])).json()["data"]
    send = f"{C}/conversations/{conv['id']}/products"

    # a photo card works without a catalog
    res = shop.post(send, headers=WEB, json={"kind": "card", "product_ids": [a["id"]], "body": "Our best seller"})
    assert res.status_code == 200, res.text
    sent = FakeShop.sent[-1]
    assert sent["interactive"]["type"] == "button"
    assert sent["interactive"]["header"]["image"]["link"].startswith("http")
    assert "*₹399*  ~₹499~" in sent["interactive"]["body"]["text"]
    assert [b["reply"]["id"] for b in sent["interactive"]["action"]["buttons"]] == [f"shop:buy:{a['id']}",
                                                                                   f"shop:info:{a['id']}"]
    msg = res.json()["data"]
    assert msg["type"] == "interactive" and msg["commerce"]["products"][0]["name"] == "Kaju Katli"
    assert first_conversation(shop)["last_message_preview"] == "🛍️ Kaju Katli"

    # catalog messages need a catalog
    assert shop.post(send, headers=WEB, json={"kind": "product", "product_ids": [a["id"]]}).status_code == 422
    assert shop.post(send, headers=WEB, json={"kind": "catalog"}).status_code == 422
    shop.post(f"{C}/catalog/connect", headers=WEB, json={"catalog_id": "778899001"})
    not_yet = shop.post(send, headers=WEB, json={"kind": "product", "product_ids": [a["id"]]})
    assert not_yet.status_code == 422 and "isn't in your Meta catalog yet" in not_yet.text
    shop.get(f"{C}/products/stats")  # Meta finished the batch

    one = shop.post(send, headers=WEB, json={"kind": "product", "product_ids": [a["id"]], "body": "Try this"})
    assert one.status_code == 200, one.text
    assert FakeShop.sent[-1]["interactive"]["action"] == {"catalog_id": "778899001", "product_retailer_id": "KK"}

    many = shop.post(send, headers=WEB, json={"kind": "products", "product_ids": [a["id"], b["id"]],
                                              "header": "Diwali picks"})
    assert many.status_code == 200, many.text
    plist = FakeShop.sent[-1]["interactive"]
    assert plist["type"] == "product_list" and plist["header"]["text"] == "Diwali picks"
    assert [s["title"] for s in plist["action"]["sections"]] == ["Gift boxes", "More"]

    whole = shop.post(send, headers=WEB, json={"kind": "catalog"})
    assert whole.status_code == 200 and FakeShop.sent[-1]["interactive"]["type"] == "catalog_message"

    # hidden products can't go out as catalog messages
    shop.post(f"{C}/products/bulk", headers=WEB, json={"ids": [b["id"]], "action": "hide"})
    shop.get(f"{C}/products/stats")
    hidden = shop.post(send, headers=WEB, json={"kind": "product", "product_ids": [b["id"]]})
    assert hidden.status_code == 422 and "hidden" in hidden.text

    # sending again from the chat uses the stored request (retry works)
    msgs = shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"]
    assert sum(1 for m in msgs if m["commerce"]) == 4

# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
from fastapi.testclient import TestClient

from app.main import app
from tests.test_inbox import BASE, WEB, FakeMeta, business, post_webhook  # noqa: F401  (fixture)

T = f"{BASE}/templates"
PNG = b"\x89PNG\r\n\x1a\n sample"


def _form(**overrides) -> dict:
    form = {
        "name": "Diwali Offer", "language": "en", "category": "marketing",
        "header": {"format": "text", "text": "Hi {{1}}", "example": "Asha"},
        "body": "Get {{1}} off everything until {{2}}. Shop now!",
        "examples": {"1": "20%", "2": "Sunday"},
        "footer": "Reply STOP to opt out",
        "buttons": [
            {"type": "quick_reply", "text": "Show offers"},
            {"type": "url", "text": "Shop", "url": "https://shop.example.com/{{1}}", "example": "diwali"},
            {"type": "phone_number", "text": "Call us", "phone_number": "+91 98765 43210"},
            {"type": "copy_code", "example": "DIWALI20"},
        ],
    }
    form.update(overrides)
    return form


def _sent(key: str) -> dict:
    return next(s for s in reversed(FakeMeta.sent) if key in s)


def test_sync_lists_meta_templates_with_stats(business):
    res = business.post(f"{T}/sync", headers=WEB)
    assert res.status_code == 200 and res.json()["data"]["added"] == 3
    rows = {t["name"]: t for t in business.get(T, params={"page": 1}).json()["data"]}
    assert rows["order_update"]["status"] == "approved" and rows["draft_one"]["status"] == "pending"
    promo = rows["promo_pic"]
    assert promo["source"] == "meta" and promo["form"]["header"]["format"] == "image"
    assert promo["form"]["buttons"][0] == {"type": "url", "text": "Shop", "url": "https://shop.example.com/{{1}}",
                                           "phone_number": None, "example": "summer"}
    assert promo["sample"]["path"].endswith("/sample")
    sample = business.get(f"/api/v1{promo['sample']['path']}")
    assert sample.status_code == 200 and sample.content.startswith(b"\x89PNG")  # fetched once from Meta

    stats = business.get(f"{T}/stats").json()["data"]
    assert (stats["total"], stats["approved"], stats["pending"]) == (3, 2, 1) and stats["connected"]
    assert business.get(T, params={"status": "approved", "page": 1}).json()["meta"]["total"] == 2
    assert business.get(T, params={"search": "shipped", "page": 1}).json()["data"][0]["name"] == "order_update"

    # automatic sync is skipped while the copy is fresh; deleted-on-Meta templates disappear on the next sync
    assert business.post(f"{T}/sync", params={"auto": "true"}, headers=WEB).json()["data"]["synced"] is False
    FakeMeta.templates_data = FakeMeta.templates_data[:1]
    assert business.post(f"{T}/sync", headers=WEB).json()["data"]["removed"] == 2


def test_validation_catches_meta_rules(business):
    bad = business.post(T, headers=WEB, json=_form(
        body="{{1}} off everything", examples={},
        buttons=[{"type": "url", "text": "Shop", "url": "shop.example.com"},
                 {"type": "phone_number", "text": "Call", "phone_number": "12345"},
                 {"type": "otp", "text": "Copy"}]))
    assert bad.status_code == 422
    errors = bad.json()["errors"]
    assert "start or end" in errors["body"][0] and "examples.1" in errors
    assert {"buttons.0.url", "buttons.1.phone_number", "buttons.2.text"} <= set(errors)
    gap = business.post(T, headers=WEB, json=_form(body="Get {{1}} and {{3}} today please", examples={"1": "a", "3": "b"}))
    assert "in order" in gap.json()["errors"]["body"][0]
    named = business.post(T, headers=WEB, json=_form(parameter_format="named"))
    assert "Named variables" in named.json()["errors"]["body"][0]
    no_sample = business.post(T, headers=WEB, json=_form(header={"format": "image"}))
    assert "sample" in no_sample.json()["errors"]
    assert not any("create_template" in s for s in FakeMeta.sent)


def test_draft_then_submit_builds_meta_components(business):
    draft = business.post(T, headers=WEB, json=_form(submit=False, body="Unfinished {{1}}"))
    assert draft.status_code == 200, draft.text
    tpl = draft.json()["data"]
    assert tpl["name"] == "diwali_offer" and tpl["status"] == "draft" and tpl["meta_id"] is None
    assert not any("create_template" in s for s in FakeMeta.sent)

    res = business.put(f"{T}/{tpl['id']}", headers=WEB, json=_form())
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["status"] == "pending" and data["meta_id"] and res.json()["message"] == "Submitted to Meta for review"
    body = _sent("create_template")["create_template"]
    assert body["name"] == "diwali_offer" and body["category"] == "MARKETING" and "parameter_format" not in body
    header, main, footer, buttons = body["components"]
    assert header == {"type": "HEADER", "format": "TEXT", "text": "Hi {{1}}", "example": {"header_text": ["Asha"]}}
    assert main["example"] == {"body_text": [["20%", "Sunday"]]}
    assert footer == {"type": "FOOTER", "text": "Reply STOP to opt out"}
    assert buttons["buttons"] == [
        {"type": "QUICK_REPLY", "text": "Show offers"},
        {"type": "URL", "text": "Shop", "url": "https://shop.example.com/{{1}}",
         "example": ["https://shop.example.com/diwali"]},
        {"type": "PHONE_NUMBER", "text": "Call us", "phone_number": "+919876543210"},
        {"type": "COPY_CODE", "example": "DIWALI20"},
    ]
    # the stored copy reads back into the same form
    assert data["form"]["examples"] == {"1": "20%", "2": "Sunday"}
    assert data["form"]["buttons"][1]["example"] == "diwali" and data["editable"] is False  # in review

    again = business.post(T, headers=WEB, json=_form())
    assert again.status_code == 409 and "name" in again.json()["errors"]
    in_review = business.put(f"{T}/{tpl['id']}", headers=WEB, json=_form())
    assert in_review.status_code == 422 and "reviewing" in in_review.json()["message"]


def test_media_header_sample_upload(business):
    wrong = business.post(f"{T}/media", headers=WEB, data={"kind": "image"},
                          files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")})
    assert wrong.status_code == 422
    up = business.post(f"{T}/media", headers=WEB, data={"kind": "image"},
                       files={"file": ("banner.png", PNG, "image/png")})
    assert up.status_code == 200, up.text
    key = up.json()["data"]["key"]
    assert business.get(f"/api/v1{up.json()['data']['path']}").content == PNG

    res = business.post(T, headers=WEB, json=_form(name="new_banner", header={"format": "image"}, sample_key=key,
                                                   sample_filename="banner.png"))
    assert res.status_code == 200, res.text
    assert _sent("upload_sample")["upload_sample"] == "banner.png"
    assert _sent("create_template")["create_template"]["components"][0] == {
        "type": "HEADER", "format": "IMAGE", "example": {"header_handle": ["4::aGFuZGxl"]}}
    tpl = res.json()["data"]
    assert tpl["sample"]["filename"] == "banner.png"
    assert business.get(f"/api/v1{tpl['sample']['path']}").content == PNG

    # duplicating copies the sample to its own file
    copy = business.post(T, headers=WEB, json=_form(name="new_banner_copy", header={"format": "image"},
                                                    sample_key=f"template:{tpl['id']}", submit=False))
    assert copy.status_code == 200, copy.text
    assert business.get(f"/api/v1{copy.json()['data']['sample']['path']}").content == PNG
    business.delete(f"{T}/{tpl['id']}", headers=WEB)
    assert business.get(f"/api/v1{copy.json()['data']['sample']['path']}").content == PNG


def test_webhook_status_edit_and_delete(business):
    tpl = business.post(T, headers=WEB, json=_form()).json()["data"]
    meta_value = {"message_template_id": tpl["meta_id"],
                  "message_template_name": "diwali_offer", "message_template_language": "en"}
    post_webhook(business, {**meta_value, "event": "REJECTED", "reason": "INVALID_FORMAT"},
                 field="message_template_status_update")
    got = business.get(f"{T}/{tpl['id']}").json()["data"]
    assert got["status"] == "rejected" and got["rejected_reason"] == "INVALID_FORMAT" and got["editable"]

    # a rejected template can be fixed, even its category, and goes back into review
    fixed = business.put(f"{T}/{tpl['id']}", headers=WEB, json=_form(category="utility"))
    assert fixed.status_code == 200, fixed.text
    edit = _sent("edit_template")
    assert edit["edit_template"] == tpl["meta_id"] and edit["category"] == "UTILITY"
    assert fixed.json()["data"]["status"] == "pending" and fixed.json()["data"]["rejected_reason"] is None

    post_webhook(business, {**meta_value, "event": "APPROVED", "reason": "NONE"},
                 field="message_template_status_update")
    post_webhook(business, {**meta_value, "previous_quality_score": "UNKNOWN", "new_quality_score": "GREEN"},
                 field="message_template_quality_update")
    got = business.get(f"{T}/{tpl['id']}").json()["data"]
    assert got["status"] == "approved" and got["quality"] == "GREEN"
    renamed = business.put(f"{T}/{tpl['id']}", headers=WEB, json=_form(name="other_name"))
    assert renamed.status_code == 422 and "name" in renamed.json()["errors"]

    assert business.delete(f"{T}/{tpl['id']}", headers=WEB).status_code == 200
    assert _sent("delete_template") == {"delete_template": "diwali_offer", "hsm_id": tpl["meta_id"]}
    assert business.get(f"{T}/{tpl['id']}").status_code == 404


def test_authentication_named_and_meta_errors(business):
    auth = business.post(T, headers=WEB, json={"name": "login_code", "language": "en_US", "category": "authentication",
                                               "add_security_recommendation": True, "code_expiration_minutes": 10})
    assert auth.status_code == 200, auth.text
    assert _sent("create_template")["create_template"]["components"] == [
        {"type": "BODY", "add_security_recommendation": True},
        {"type": "FOOTER", "code_expiration_minutes": 10},
        {"type": "BUTTONS", "buttons": [{"type": "OTP", "otp_type": "COPY_CODE", "text": "Copy code"}]},
    ]
    form = auth.json()["data"]["form"]
    assert form["body"].startswith("*{{1}}* is your verification code.") and "10 minutes" in form["footer"]

    named = business.post(T, headers=WEB, json=_form(
        name="named_one", parameter_format="named", header={"format": "none"},
        body="Hello {{first_name}}, your order {{order_id}} is ready for pickup.",
        examples={"first_name": "Asha", "order_id": "1042"}, buttons=[]))
    assert named.status_code == 200, named.text
    body = _sent("create_template")["create_template"]
    assert body["parameter_format"] == "NAMED"
    assert body["components"][0]["example"] == {"body_text_named_params": [
        {"param_name": "first_name", "example": "Asha"}, {"param_name": "order_id", "example": "1042"}]}

    FakeMeta.fail_next = True
    refused = business.post(T, headers=WEB, json=_form(name="exists_on_meta"))
    assert refused.status_code == 422 and "already exists" in refused.json()["errors"]["name"][0]
    assert business.get(T, params={"search": "exists_on_meta", "page": 1}).json()["meta"]["total"] == 0


def test_templates_are_private(business):
    tpl = business.post(T, headers=WEB, json=_form(submit=False)).json()["data"]
    with TestClient(app, base_url="http://testserver") as other:
        other.post(f"{BASE}/auth/register", headers=WEB, json={
            "name": "Other", "business_name": "Other Co", "email": f"tpl-other-{tpl['id']}@example.com",
            "password": "Secret@123", "password_confirmation": "Secret@123"})
        assert other.get(T, params={"page": 1}).json()["meta"]["total"] == 0
        assert other.get(f"{T}/{tpl['id']}").status_code == 404
        assert other.delete(f"{T}/{tpl['id']}", headers=WEB).status_code == 404
    with TestClient(app, base_url="http://testserver") as anon:
        assert anon.get(T).status_code == 401

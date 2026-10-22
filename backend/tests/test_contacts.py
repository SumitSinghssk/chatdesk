import csv
import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core import rate_limiter
from app.main import app

WEB = {"X-Requested-With": "sk-web"}
BASE = "/api/v1/customer/contacts"


def _register(web, client, admin_headers):
    original = client.get("/api/v1/admin/settings/customer_auth", headers=admin_headers).json()["data"]
    client.put("/api/v1/admin/settings/customer_auth", headers=admin_headers,
               json={**original, "password_enabled": True, "allow_registration": True})
    res = web.post("/api/v1/customer/auth/register", headers=WEB, json={
        "name": "Contacts Owner", "business_name": "Contacts Co", "email": f"ct-{uuid.uuid4().hex[:8]}@example.com",
        "password": "Secret@123", "password_confirmation": "Secret@123"})
    assert res.status_code == 200, res.text
    return original


@pytest.fixture()
def biz(client, admin_headers):
    rate_limiter._history.clear()
    with TestClient(app, base_url="http://testserver") as web:
        original = _register(web, client, admin_headers)
        yield web
    client.put("/api/v1/admin/settings/customer_auth", json=original, headers=admin_headers)


def test_create_update_filter_and_delete(biz):
    created = biz.post(BASE, headers=WEB, json={
        "phone": "98765 43210", "name": "Asha", "email": "ASHA@Example.com", "tags": ["VIP", " vip ", "Lead"],
        "attributes": {"City": "Delhi", "orders": 3, "empty": ""}})
    assert created.status_code == 200, created.text
    c = created.json()["data"]
    assert c["wa_id"] == "919876543210"  # default country code added
    assert c["email"] == "asha@example.com" and c["tags"] == ["VIP", "vip", "Lead"]
    assert c["attributes"] == {"city": "Delhi", "orders": "3"} and c["source"] == "manual"

    dup = biz.post(BASE, headers=WEB, json={"phone": "+91 98765 43210"})
    assert dup.status_code == 409 and "phone" in dup.json()["errors"]
    assert biz.post(BASE, headers=WEB, json={"phone": "12"}).status_code == 422

    biz.post(BASE, headers=WEB, json={"phone": "+44 7700 900123", "name": "Tom", "opted_out": True})
    rows = biz.get(BASE, params={"page": 1, "per_page": 10}).json()
    assert rows["meta"]["total"] == 2
    vip = biz.get(BASE, params={"tag": "VIP", "page": 1}).json()["data"]
    assert [r["name"] for r in vip] == ["Asha"]
    flt = json.dumps([{"field": "opted_out", "op": "is_true"}])
    opted = biz.get(BASE, params={"filters": flt, "page": 1}).json()["data"]
    assert [r["name"] for r in opted] == ["Tom"]
    assert biz.get(BASE, params={"search": "asha@exa", "page": 1}).json()["meta"]["total"] == 1

    upd = biz.put(f"{BASE}/{c['id']}", headers=WEB, json={"phone": "919876543210", "name": "Asha Verma",
                                                          "tags": ["VIP"], "attributes": {"city": "Mumbai"}})
    assert upd.status_code == 200 and upd.json()["data"]["attributes"] == {"city": "Mumbai"}

    stats = biz.get(f"{BASE}/stats").json()["data"]
    assert stats["total"] == 2 and stats["opted_out"] == 1 and stats["new_7d"] == 2
    assert {"tag": "VIP", "count": 1} in stats["tags"]
    assert biz.get(f"{BASE}/attributes").json()["data"] == ["city"]

    assert biz.delete(f"{BASE}/{c['id']}", headers=WEB).status_code == 200
    assert biz.get(f"{BASE}/{c['id']}").status_code == 404


def test_bulk_actions(biz):
    ids = [biz.post(BASE, headers=WEB, json={"phone": f"9876500{i:03d}"}).json()["data"]["id"] for i in range(3)]
    assert biz.post(f"{BASE}/bulk", headers=WEB, json={"ids": ids, "action": "add_tag"}).status_code == 422
    res = biz.post(f"{BASE}/bulk", headers=WEB, json={"ids": ids, "action": "add_tag", "tag": "Diwali"})
    assert res.json()["message"] == "3 contacts tagged"
    biz.post(f"{BASE}/bulk", headers=WEB, json={"ids": ids[:1], "action": "opt_out"})
    biz.post(f"{BASE}/bulk", headers=WEB, json={"ids": ids[1:2], "action": "remove_tag", "tag": "Diwali"})
    rows = {r["id"]: r for r in biz.get(BASE, params={"page": 1}).json()["data"]}
    assert rows[ids[0]]["opted_out"] and rows[ids[1]]["tags"] == [] and rows[ids[2]]["tags"] == ["Diwali"]
    biz.post(f"{BASE}/bulk", headers=WEB, json={"ids": ids, "action": "delete"})
    assert biz.get(BASE, params={"page": 1}).json()["meta"]["total"] == 0


def test_csv_import_and_export(biz):
    content = ("Mobile Number,Name,Email,Tags,City,Plan\n"
               "9876543210,Asha,asha@example.com,VIP;Lead,Delhi,Gold\n"
               "+44 7700 900123,Tom,,,London,\n"
               "abc,Bad Row,,,,\n"
               "98765 43210,Asha Duplicate,,,,\n")
    res = biz.post(f"{BASE}/import", headers=WEB, data={"tag": "Imported", "update_existing": "true"},
                   files={"file": ("contacts.csv", content.encode(), "text/csv")})
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert (data["created"], data["updated"], data["skipped"]) == (2, 0, 2)
    assert data["errors"][0]["row"] == 4 and data["columns"]["phone"] == "Mobile Number"
    assert data["columns"]["custom"] == ["City", "Plan"]

    rows = {r["wa_id"]: r for r in biz.get(BASE, params={"page": 1}).json()["data"]}
    asha = rows["919876543210"]
    assert asha["tags"] == ["VIP", "Lead", "Imported"] and asha["attributes"] == {"city": "Delhi", "plan": "Gold"}
    assert asha["source"] == "import"

    again = biz.post(f"{BASE}/import", headers=WEB, data={"update_existing": "true"},
                     files={"file": ("c.csv", b"phone,city\n9876543210,Pune\n", "text/csv")})
    assert again.json()["data"]["updated"] == 1
    assert biz.get(BASE, params={"search": "asha", "page": 1}).json()["data"][0]["attributes"]["city"] == "Pune"

    no_phone = biz.post(f"{BASE}/import", headers=WEB, files={"file": ("c.csv", b"name\nX\n", "text/csv")})
    assert no_phone.status_code == 422

    export = biz.get(f"{BASE}/export", params={"tag": "VIP"})
    assert export.status_code == 200 and "attachment" in export.headers["content-disposition"]
    lines = list(csv.reader(io.StringIO(export.content.decode("utf-8-sig"))))
    assert lines[0][:5] == ["phone", "name", "whatsapp_name", "email", "tags"] and "city" in lines[0]
    assert len(lines) == 2 and lines[1][0] == '="+919876543210"'  # stays text in Excel
    assert len(lines[1][9]) == 16 and lines[1][9][10] == " "  # "YYYY-MM-DD HH:MM"

    # an exported file can be imported back (phone cells are ="+91...")
    back = biz.post(f"{BASE}/import", headers=WEB, data={"update_existing": "true"},
                    files={"file": ("export.csv", export.content, "text/csv")}).json()["data"]
    assert back["created"] == 0 and back["updated"] == 1 and back["skipped"] == 0


def test_contacts_are_private(biz, client, admin_headers):
    cid = biz.post(BASE, headers=WEB, json={"phone": "9876543299"}).json()["data"]["id"]
    with TestClient(app, base_url="http://testserver") as other:
        _register(other, client, admin_headers)
        assert other.get(BASE, params={"page": 1}).json()["meta"]["total"] == 0
        assert other.get(f"{BASE}/{cid}").status_code == 404
        assert other.delete(f"{BASE}/{cid}", headers=WEB).status_code == 404
        other.post(f"{BASE}/bulk", headers=WEB, json={"ids": [cid], "action": "delete"})
    assert biz.get(f"{BASE}/{cid}").status_code == 200
    with TestClient(app, base_url="http://testserver") as anon:
        assert anon.get(BASE).status_code == 401

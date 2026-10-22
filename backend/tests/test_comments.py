import time
import uuid

import pytest

from .conftest import CSRF


def _published_slug(client) -> str:
    res = client.get("/api/v1/website/blogs", params={"page": 1, "per_page": 1})
    assert res.status_code == 200, res.text
    items = res.json()["data"]
    if not items:
        pytest.skip("No published blog to comment on")
    return items[0]["slug"]


def _payload(**extra):
    return {
        "author_name": "Test Visitor",
        "author_email": "visitor@example.com",
        "body": f"Great post {uuid.uuid4().hex[:8]}",
        "started_at": int((time.time() - 10) * 1000),
        **extra,
    }


def _admin_find(client, admin_headers, body: str) -> dict:
    res = client.get("/api/v1/admin/comments/", params={"page": 1, "per_page": 5, "search": body},
                     headers=admin_headers)
    assert res.status_code == 200, res.text
    items = res.json()["data"]
    assert items, f"comment '{body}' not found in admin list"
    return items[0]


def _settings(client, admin_headers, **values):
    current = client.get("/api/v1/admin/settings/comments", headers=admin_headers).json()["data"]
    res = client.put("/api/v1/admin/settings/comments", json={**current, **values}, headers=admin_headers)
    assert res.status_code == 200, res.text
    return current


def test_comment_moderation_flow(client, admin_headers):
    slug = _published_slug(client)
    original = _settings(client, admin_headers, enabled=True, allow_replies=True, max_depth=3, close_after_days=0)
    try:
        payload = _payload()
        res = client.post(f"/api/v1/website/blogs/{slug}/comments", json=payload)
        assert res.status_code == 200, res.text

        public = client.get(f"/api/v1/website/blogs/{slug}/comments").json()["data"]
        assert public["enabled"] and public["open"]
        assert payload["body"] not in str(public["items"])

        comment = _admin_find(client, admin_headers, payload["body"])
        assert comment["status"] == "pending"
        assert comment["author_email"] == "visitor@example.com"

        res = client.patch(f"/api/v1/admin/comments/{comment['id']}/status", json={"status": "approved"},
                           headers=admin_headers)
        assert res.status_code == 200, res.text
        public = client.get(f"/api/v1/website/blogs/{slug}/comments").json()["data"]
        assert payload["body"] in str(public["items"])
        assert "visitor@example.com" not in str(public["items"])

        reply = _payload(body=f"Visitor reply {uuid.uuid4().hex[:8]}", parent_id=comment["id"])
        assert client.post(f"/api/v1/website/blogs/{slug}/comments", json=reply).status_code == 200
        pending_reply = _admin_find(client, admin_headers, reply["body"])
        assert pending_reply["parent_id"] == comment["id"] and pending_reply["status"] == "pending"

        res = client.post(f"/api/v1/admin/comments/{comment['id']}/reply", json={"body": "Thanks for reading!"},
                          headers=admin_headers)
        assert res.status_code == 200, res.text
        admin_reply = res.json()["data"]
        assert admin_reply["is_admin"] and admin_reply["status"] == "approved"

        res = client.put(f"/api/v1/admin/comments/{comment['id']}",
                         json={"author_name": "Edited Name", "author_email": "visitor@example.com",
                               "body": payload["body"] + " (edited)"},
                         headers=admin_headers)
        assert res.status_code == 200, res.text

        detail = client.get(f"/api/v1/admin/comments/{comment['id']}", headers=admin_headers).json()["data"]
        assert len(detail["thread"]) >= 3

        history = client.get("/api/v1/admin/activity-logs/",
                             params={"subject_type": "blog_comment", "subject_id": comment["id"], "page": 1},
                             headers=admin_headers).json()
        actions = {row["action"] for row in history["data"]}
        assert {"status_changed", "updated"} <= actions

        res = client.post("/api/v1/admin/comments/bulk", json={"ids": [pending_reply["id"]], "action": "spam"},
                          headers=admin_headers)
        assert res.status_code == 200, res.text

        assert client.delete(f"/api/v1/admin/comments/{comment['id']}", headers=admin_headers).status_code == 200
        public = client.get(f"/api/v1/website/blogs/{slug}/comments").json()["data"]
        assert payload["body"] not in str(public["items"])
    finally:
        _settings(client, admin_headers, **original)


def test_comments_respect_global_and_post_switches(client, admin_headers):
    slug = _published_slug(client)
    original = _settings(client, admin_headers, enabled=False)
    try:
        public = client.get(f"/api/v1/website/blogs/{slug}/comments").json()["data"]
        assert public["enabled"] is False and public["items"] == []
        res = client.post(f"/api/v1/website/blogs/{slug}/comments", json=_payload())
        assert res.status_code == 403

        _settings(client, admin_headers, enabled=True)
        blog_id = client.get(f"/api/v1/website/blogs/{slug}").json()["data"]["id"]
        blog = client.get(f"/api/v1/admin/blogs/{blog_id}", headers=admin_headers).json()["data"]
        body = {k: blog[k] for k in ("title", "slug", "excerpt", "content", "featured_image", "status",
                                     "published_at", "category_ids")}
        res = client.put(f"/api/v1/admin/blogs/{blog_id}", json={**body, "comments_enabled": False},
                         headers=admin_headers)
        assert res.status_code == 200, res.text
        try:
            public = client.get(f"/api/v1/website/blogs/{slug}/comments").json()["data"]
            assert public["enabled"] is True and public["open"] is False
            assert client.post(f"/api/v1/website/blogs/{slug}/comments", json=_payload()).status_code == 403
        finally:
            client.put(f"/api/v1/admin/blogs/{blog_id}", json={**body, "comments_enabled": True},
                       headers=admin_headers)
    finally:
        _settings(client, admin_headers, **original)


def test_bot_submissions_are_dropped(client, admin_headers):
    slug = _published_slug(client)
    original = _settings(client, admin_headers, enabled=True)
    try:
        body = f"Bot text {uuid.uuid4().hex[:8]}"
        res = client.post(f"/api/v1/website/blogs/{slug}/comments", json=_payload(body=body, website="spam.example"))
        assert res.status_code == 200
        res = client.get("/api/v1/admin/comments/", params={"page": 1, "search": body}, headers=admin_headers)
        assert res.json()["data"] == []
    finally:
        _settings(client, admin_headers, **original)


def test_comment_admin_requires_permission(client):
    assert client.get("/api/v1/admin/comments/", headers=CSRF).status_code == 401

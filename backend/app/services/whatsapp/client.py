import json
import os
import urllib.error
import urllib.request
import uuid
from urllib.parse import quote, urlencode

GRAPH_API_VERSION = os.getenv("WHATSAPP_GRAPH_API_VERSION", "v23.0")
# WHATSAPP_GRAPH_URL points at a stand-in for Meta (end-to-end tests); leave unset in real use
GRAPH_URL = os.getenv("WHATSAPP_GRAPH_URL") or f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# WhatsApp media types and the limits Meta enforces on uploads (bytes)
MEDIA_LIMITS = {
    "image": 5 * 1024 * 1024,
    "video": 16 * 1024 * 1024,
    "audio": 16 * 1024 * 1024,
    "document": 100 * 1024 * 1024,
}


class WhatsAppError(Exception):
    def __init__(self, message: str, status: int = 0, code: int | None = None, details: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details


def media_kind(mime: str) -> str:
    """Maps a MIME type to the WhatsApp message type used to send it."""
    major = (mime or "").split("/", 1)[0]
    if major in ("image", "video", "audio"):
        return major
    return "document"


class WhatsAppClient:
    def __init__(self, phone_number_id: str, access_token: str, timeout: int = 20):
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.timeout = timeout

    def _open(self, request: urllib.request.Request):
        try:
            return urllib.request.urlopen(request, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            try:
                error = json.loads(exc.read() or b"{}").get("error", {})
            except ValueError:
                error = {}
            # error_user_msg is Meta's human-readable reason (e.g. why a template was refused)
            details = (error.get("error_data") or {}).get("details") or error.get("error_user_msg")
            raise WhatsAppError(error.get("message") or f"Meta API error ({exc.code})", exc.code,
                                error.get("code"), details) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise WhatsAppError("Can't reach Meta's API. Check the server's internet connection.") from exc

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            f"{GRAPH_URL}/{path.lstrip('/')}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        with self._open(request) as response:
            return json.loads(response.read() or b"{}")

    # Phone number -----------------------------------------------------------------

    def phone_number(self) -> dict:
        fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier"
        return self._request("GET", f"{self.phone_number_id}?fields={fields}")

    # Sending ----------------------------------------------------------------------

    def send(self, payload: dict) -> dict:
        return self._request("POST", f"{self.phone_number_id}/messages",
                             {"messaging_product": "whatsapp", **payload})

    def send_text(self, to: str, text: str, reply_to: str | None = None) -> dict:
        payload = {"to": to, "type": "text", "text": {"body": text, "preview_url": True}}
        if reply_to:
            payload["context"] = {"message_id": reply_to}
        return self.send(payload)

    def send_media(self, to: str, kind: str, media_id: str, caption: str | None = None,
                   filename: str | None = None) -> dict:
        body: dict = {"id": media_id}
        if caption and kind in ("image", "video", "document"):
            body["caption"] = caption
        if filename and kind == "document":
            body["filename"] = filename
        return self.send({"to": to, "type": kind, kind: body})

    def send_template(self, to: str, name: str, language: str, components: list | None = None) -> dict:
        template = {"name": name, "language": {"code": language}}
        if components:
            template["components"] = components
        return self.send({"to": to, "type": "template", "template": template})

    def mark_read(self, message_id: str) -> dict:
        return self.send({"status": "read", "message_id": message_id})

    def typing(self, message_id: str) -> dict:
        """Shows "typing..." to the customer (up to 25 s) and marks their message read."""
        return self.send({"status": "read", "message_id": message_id, "typing_indicator": {"type": "text"}})

    # Media ------------------------------------------------------------------------

    def upload_media(self, content: bytes, mime: str, filename: str) -> str:
        boundary = uuid.uuid4().hex
        safe_name = filename.replace('"', "").replace("\r", "").replace("\n", "") or "file"
        parts = [
            f'--{boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n'.encode(),
            f'--{boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n{mime}\r\n'.encode(),
            (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
             f"Content-Type: {mime}\r\n\r\n").encode() + content + b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
        request = urllib.request.Request(
            f"{GRAPH_URL}/{self.phone_number_id}/media",
            data=b"".join(parts),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
        with self._open(request) as response:
            return json.loads(response.read() or b"{}")["id"]

    def download_media(self, media_id: str) -> tuple[bytes, str]:
        """Returns (bytes, mime type) of media a customer sent. Meta's URLs need the token too."""
        info = self._request("GET", media_id)
        request = urllib.request.Request(info["url"], headers={"Authorization": f"Bearer {self.access_token}"})
        with self._open(request) as response:
            return response.read(), info.get("mime_type") or response.headers.get_content_type()

    # Templates --------------------------------------------------------------------

    TEMPLATE_FIELDS = "id,name,language,status,category,components,quality_score,rejected_reason,parameter_format"

    def templates(self, waba_id: str, limit: int = 100, max_pages: int = 20) -> list[dict]:
        """Every template on the WhatsApp Business Account (follows Meta's paging)."""
        items: list[dict] = []
        after = None
        for _ in range(max_pages):
            query = {"fields": self.TEMPLATE_FIELDS, "limit": limit}
            if after:
                query["after"] = after
            page = self._request("GET", f"{waba_id}/message_templates?{urlencode(query)}")
            items.extend(page.get("data", []))
            paging = page.get("paging") or {}
            after = (paging.get("cursors") or {}).get("after")
            if not paging.get("next") or not after:
                break
        return items

    def create_template(self, waba_id: str, body: dict) -> dict:
        """Submits a new template for review. Returns {"id", "status", "category"}."""
        return self._request("POST", f"{waba_id}/message_templates", body)

    def edit_template(self, template_id: str, body: dict) -> dict:
        """Edits a submitted template (it goes back into review)."""
        return self._request("POST", template_id, body)

    def delete_template(self, waba_id: str, name: str, template_id: str | None = None) -> dict:
        query = {"name": name}
        if template_id:
            query["hsm_id"] = template_id  # only this language; without it every language is deleted
        return self._request("DELETE", f"{waba_id}/message_templates?{urlencode(query)}")

    def app_id(self) -> str:
        """The Meta app the access token belongs to (needed for sample-media uploads)."""
        return str(self._request("GET", "app?fields=id")["id"])

    def upload_sample(self, content: bytes, mime: str, filename: str) -> str:
        """Uploads a template header sample with Meta's Resumable Upload API; returns the handle."""
        query = urlencode({"file_name": filename or "sample", "file_length": len(content), "file_type": mime})
        session = self._request("POST", f"{self.app_id()}/uploads?{query}")["id"]
        request = urllib.request.Request(
            f"{GRAPH_URL}/{session}",
            data=content,
            method="POST",
            headers={"Authorization": f"OAuth {self.access_token}", "file_offset": "0",
                     "Content-Type": "application/octet-stream"},
        )
        with self._open(request) as response:
            return json.loads(response.read() or b"{}")["h"]

    # Commerce catalog -------------------------------------------------------------

    PRODUCT_FIELDS = ("id,retailer_id,name,description,price,sale_price,currency,image_url,additional_image_urls,"
                      "availability,url,brand,retailer_product_group_id,color,size,visibility,inventory")

    def product_catalogs(self, waba_id: str) -> list[dict]:
        """Catalogs connected to the WhatsApp Business Account."""
        return self._request("GET", f"{waba_id}/product_catalogs?fields=id,name,product_count").get("data", [])

    def connect_catalog(self, waba_id: str, catalog_id: str) -> dict:
        return self._request("POST", f"{waba_id}/product_catalogs", {"catalog_id": catalog_id})

    def disconnect_catalog(self, waba_id: str, catalog_id: str) -> dict:
        return self._request("DELETE", f"{waba_id}/product_catalogs?{urlencode({'catalog_id': catalog_id})}")

    def catalog_info(self, catalog_id: str) -> dict:
        return self._request("GET", f"{catalog_id}?fields=id,name,product_count")

    def commerce_settings(self) -> dict:
        """{"is_cart_enabled", "is_catalog_visible"} for this phone number."""
        data = self._request("GET", f"{self.phone_number_id}/whatsapp_commerce_settings").get("data") or [{}]
        return data[0]

    def set_commerce_settings(self, cart: bool, catalog_visible: bool) -> dict:
        query = urlencode({"is_cart_enabled": str(cart).lower(), "is_catalog_visible": str(catalog_visible).lower()})
        return self._request("POST", f"{self.phone_number_id}/whatsapp_commerce_settings?{query}")

    def catalog_batch(self, catalog_id: str, requests: list[dict]) -> list[str]:
        """Creates, updates or deletes catalog items (max 5,000 per call). Returns Meta's batch handles."""
        body = {"item_type": "PRODUCT_ITEM", "allow_upsert": True, "requests": requests}
        return self._request("POST", f"{catalog_id}/items_batch", body).get("handles", [])

    def catalog_batch_status(self, catalog_id: str, handle: str) -> dict:
        """{"status": "finished"|"in_progress"|..., "errors": [{"id": retailer_id, "message"}], ...}"""
        query = urlencode({"handle": handle, "load_ids_of_invalid_requests": "true"})
        data = self._request("GET", f"{catalog_id}/check_batch_request_status?{query}").get("data") or [{}]
        return data[0]

    def catalog_products(self, catalog_id: str, limit: int = 100, max_pages: int = 50) -> list[dict]:
        """Every product in a catalog (follows Meta's paging)."""
        items: list[dict] = []
        after = None
        for _ in range(max_pages):
            query = {"fields": self.PRODUCT_FIELDS, "limit": limit}
            if after:
                query["after"] = after
            page = self._request("GET", f"{catalog_id}/products?{urlencode(query)}")
            items.extend(page.get("data", []))
            paging = page.get("paging") or {}
            after = (paging.get("cursors") or {}).get("after")
            if not paging.get("next") or not after:
                break
        return items

    # WhatsApp Pay (India) ------------------------------------------------------------

    def payment_lookup(self, configuration: str, reference_id: str) -> dict:
        """What happened to a Review and pay order: {"payments": [{"status", "transactions": [...]}]}."""
        return self._request("GET", f"{self.phone_number_id}/payments/{quote(configuration, safe='')}/"
                                    f"{quote(reference_id, safe='')}")

    def payment_refund(self, configuration: str, reference_id: str, amount: int, currency: str = "INR") -> dict:
        return self._request("POST", f"{self.phone_number_id}/payments_refund", {
            "reference_id": reference_id, "speed": "normal", "payment_config_id": configuration,
            "amount": {"currency": currency, "value": amount, "offset": 100}})

    def fetch_url(self, url: str, max_bytes: int = MEDIA_LIMITS["video"]) -> tuple[bytes, str]:
        """Downloads a sample file Meta hosts (the header example of a template made elsewhere)."""
        with self._open(urllib.request.Request(url)) as response:
            return response.read(max_bytes), response.headers.get_content_type()

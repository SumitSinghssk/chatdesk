import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

logger = logging.getLogger(__name__)

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleAuthError(Exception):
    pass


@dataclass
class GoogleProfile:
    sub: str
    email: str | None
    email_verified: bool
    name: str | None
    picture: str | None


def verify_id_token(credential: str, client_id: str) -> GoogleProfile:
    if not credential or not client_id:
        raise GoogleAuthError("Google sign-in isn't set up")
    url = f"{TOKENINFO_URL}?{urllib.parse.urlencode({'id_token': credential})}"
    try:
        with urllib.request.urlopen(url, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError:
        raise GoogleAuthError("Google couldn't confirm this sign-in. Please try again.")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        logger.warning("Google token check failed: %s", exc)
        raise GoogleAuthError("Couldn't reach Google. Please try again.")
    if data.get("aud") != client_id or data.get("iss") not in ISSUERS:
        raise GoogleAuthError("This Google sign-in was issued for a different site")
    try:
        expired = int(data.get("exp") or 0) < time.time()
    except (TypeError, ValueError):
        expired = True
    if expired or not data.get("sub"):
        raise GoogleAuthError("This Google sign-in has expired. Please try again.")
    return GoogleProfile(
        sub=str(data["sub"]),
        email=(data.get("email") or "").lower() or None,
        email_verified=str(data.get("email_verified")).lower() == "true",
        name=data.get("name") or None,
        picture=data.get("picture") or None,
    )

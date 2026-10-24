from fastapi.staticfiles import StaticFiles

UPLOAD_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
_INLINE_PREFIXES = ("image/", "video/", "audio/")


class UploadStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if response.status_code == 200:
            # Media can be replaced in place while retaining its URL, so clients must revalidate it.
            response.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
        response.headers["Content-Security-Policy"] = UPLOAD_CSP
        media_type = (response.media_type or response.headers.get("content-type") or "").lower()
        if response.status_code < 400 and (
            not media_type.startswith(_INLINE_PREFIXES) or media_type.startswith("image/svg")
        ):
            response.headers["Content-Disposition"] = "attachment"
        return response

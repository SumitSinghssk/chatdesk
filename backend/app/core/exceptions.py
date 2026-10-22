import logging
import re

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError, IntegrityError, OperationalError

from app.core.monitoring import capture_exception

logger = logging.getLogger(__name__)

_DEFAULT_MESSAGES = {
    400: "Bad request",
    401: "Unauthorized",
    403: "You do not have permission to perform this action",
    404: "Resource not found",
    405: "Method not allowed",
    413: "Request is too large",
    429: "Too many requests. Please slow down.",
}


def _error(status_code: int, message: str, errors: dict | None = None, **extra) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"status": False, "message": message, "errors": errors or {}, **extra},
    )


def _label(field) -> str:
    return str(field).replace("_", " ").capitalize()


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors: dict[str, list[str]] = {}
    for error in exc.errors():
        loc = [p for p in error.get("loc", []) if p not in ("body", "query", "path")]
        field = ".".join(str(p) for p in loc) or "body"
        error_type = error.get("type", "")
        ctx = error.get("ctx") or {}
        msg = error.get("msg", "Invalid value")

        if error_type == "json_invalid":
            return _error(422, "Invalid JSON format", {"json": ["Request body contains invalid JSON"]})
        if error_type == "missing":
            msg = f"{_label(loc[-1] if loc else field)} is required"
        elif error_type == "string_too_short":
            msg = f"{_label(loc[-1])} must be at least {ctx.get('min_length', '')} characters"
        elif error_type == "string_too_long":
            msg = f"{_label(loc[-1])} must not exceed {ctx.get('max_length', '')} characters"
        elif error_type == "value_error" and "email" in field:
            msg = "Please enter a valid email address"
        elif error_type in ("enum", "literal_error"):
            msg = f"Invalid value. Allowed values: {ctx.get('expected', '')}"
        elif error_type in ("int_parsing", "int_type"):
            msg = f"{_label(loc[-1] if loc else field)} must be a valid number"
        elif error_type == "value_error":
            msg = str(ctx.get("error", msg)).replace("Value error, ", "")

        errors.setdefault(field, []).append(msg)

    first = next(iter(errors.values()))[0] if errors else "Validation failed"
    return _error(422, first, errors)


async def integrity_error_handler(request: Request, exc: IntegrityError):
    message = str(exc.orig).lower()
    if "unique constraint" in message or "duplicate key" in message:
        field = "value"
        match = re.search(r"key \(([^)]+)\)", message)
        if match:
            field = match.group(1).split(",")[0].strip()
        return _error(409, f"This {field.replace('_', ' ')} already exists",
                      {field: [f"This {field.replace('_', ' ')} already exists"]})

    referenced = re.search(r'is (?:still )?referenced from table "?([\w.]+)', message)
    if referenced:
        used_by = referenced.group(1).split(".")[-1].replace("_", " ")
        return _error(400, f"Can't delete this — it is still used by {used_by}.")

    if "foreign key" in message:
        return _error(422, "Invalid reference", {"database": ["A referenced record does not exist"]})
    if "not null" in message or "null value in column" in message:
        match = re.search(r'column "(\w+)"', message)
        field = match.group(1) if match else "field"
        return _error(422, f"{_label(field)} is required", {field: [f"{_label(field)} is required"]})

    logger.error("Unhandled IntegrityError: %s", exc)
    return _error(400, "Database constraint error")


async def data_error_handler(request: Request, exc: DataError):
    message = str(exc.orig)
    match = re.search(r"value too long for type character varying\((\d+)\)", message)
    if match:
        return _error(422, f"A value is too long (max {match.group(1)} characters)")
    logger.warning("DataError: %s", exc)
    return _error(422, "Invalid data supplied")


async def operational_error_handler(request: Request, exc: OperationalError):
    logger.critical("OperationalError: %s", exc)
    capture_exception(exc)
    return _error(503, "Service unavailable", {"server": ["Database connection failed. Please try again later."]})


def _first_error(errors) -> str | None:
    if not isinstance(errors, dict):
        return None
    for value in errors.values():
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def http_exception_handler(request: Request, exc):
    fallback = _DEFAULT_MESSAGES.get(exc.status_code, "Something went wrong.")
    headers = getattr(exc, "headers", None)
    if isinstance(exc.detail, dict):
        errors = exc.detail.get("errors", {})
        content = {
            "status": False,
            "message": exc.detail.get("message") or _first_error(errors) or fallback,
            "errors": errors,
        }
        for key, value in exc.detail.items():
            content.setdefault(key, value)
        return JSONResponse(status_code=exc.status_code, content=content, headers=headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": False, "message": exc.detail or fallback, "errors": {}},
        headers=headers,
    )


async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url, exc)
    capture_exception(exc)
    return _error(500, "Internal server error", {"server": ["An unexpected error occurred. Please try again later."]})

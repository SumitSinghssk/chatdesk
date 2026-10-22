from typing import Annotated, Any

from fastapi import HTTPException
from pydantic import BeforeValidator
from sqlalchemy.orm import Query, lazyload

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 200
MAX_UNPAGINATED_ROWS = 500
MAX_PAGE = 1_000_000

OptionalId = Annotated[
    int | None,
    BeforeValidator(lambda v: None if isinstance(v, str) and not v.strip() else v),
]


def _bad_param(field: str, msg: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": msg, "errors": {field: [msg]}})


def normalize(page: int | None, per_page: int | None) -> tuple[int, int]:
    if per_page is not None and per_page < 1:
        raise _bad_param("per_page", "Rows per page must be at least 1.")
    if page is not None and page > MAX_PAGE:
        raise _bad_param("page", "That page number is too large.")
    p = max(1, page or 1)
    pp = max(1, min(MAX_PER_PAGE, per_page or DEFAULT_PER_PAGE))
    return p, pp


def paginate(query: Query, page: int | None, per_page: int | None) -> tuple[list[Any], dict[str, int]]:
    p, pp = normalize(page, per_page)
    total = query.options(lazyload("*")).order_by(None).count()
    total_pages = (total + pp - 1) // pp if total else 0
    items = query.offset((p - 1) * pp).limit(pp).all()
    return items, {"page": p, "per_page": pp, "total": total, "total_pages": total_pages}


def is_paginated(page: int | None, per_page: int | None, search: str | None = None) -> bool:
    return any(v is not None and v != "" for v in (page, per_page, search))


def capped_all(query: Query, limit: int = MAX_UNPAGINATED_ROWS) -> list[Any]:
    return query.limit(limit).all()


def list_response(query: Query, serialize, page=None, per_page=None, search=None) -> dict:
    if not is_paginated(page, per_page, search):
        return {"status": True, "data": [serialize(r) for r in capped_all(query)]}
    items, meta = paginate(query, page, per_page)
    return {"status": True, "data": [serialize(r) for r in items], "meta": meta}

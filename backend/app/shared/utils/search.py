from __future__ import annotations

import re
from typing import Sequence

from sqlalchemy import String, and_, cast, func, literal
from sqlalchemy.sql.elements import ColumnElement

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def clean_search_text(value: str | None) -> str:
    return _CONTROL_CHARS.sub(" ", value or "").strip()


def _like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _haystack(columns: Sequence[ColumnElement]) -> ColumnElement:
    parts: list = []
    for col in columns:
        parts.append(func.coalesce(cast(col, String), ""))
        parts.append(literal(" "))
    if parts:
        parts.pop()
    return func.concat(*parts)


def search_clause(columns: Sequence[ColumnElement], query: str | None) -> ColumnElement | None:
    q = clean_search_text(query)
    if not q:
        return None
    hay = _haystack(columns)
    clauses = [hay.ilike(f"%{_like_escape(t)}%", escape="\\") for t in q.split()]
    return clauses[0] if len(clauses) == 1 else and_(*clauses)

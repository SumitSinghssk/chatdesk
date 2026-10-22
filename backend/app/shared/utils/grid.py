import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Query
from sqlalchemy.sql.elements import ColumnElement

from app.shared.utils.datetime import day_start
from app.shared.utils.search import _like_escape, clean_search_text

FieldType = Literal["text", "number", "date", "enum", "bool"]

MAX_RULES = 20
MAX_SORT = 3
MAX_IN_VALUES = 100

OPS: dict[str, set[str]] = {
    "text": {"contains", "not_contains", "equals", "starts_with", "ends_with", "is_empty", "is_not_empty"},
    "number": {"eq", "ne", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"},
    "date": {"on", "before", "after", "between", "is_empty", "is_not_empty"},
    "enum": {"in", "not_in", "is_empty", "is_not_empty"},
    "bool": {"is_true", "is_false"},
}
NO_VALUE = {"is_empty", "is_not_empty", "is_true", "is_false"}


@dataclass(frozen=True)
class GridField:
    column: Any
    type: FieldType
    sortable: bool = True
    filterable: bool = True
    cast: Any = None


def _error(msg: str, field: str = "filters") -> HTTPException:
    return HTTPException(status_code=422, detail={"message": msg, "errors": {field: [msg]}})


def _number(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise _error("Enter a number")
    try:
        return float(value)
    except ValueError:
        raise _error("Enter a number") from None


def _day(value: Any) -> date:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise _error("Dates must look like 2026-09-30") from None


def _text(value: Any) -> str:
    if not isinstance(value, (str, int, float)):
        raise _error("Enter some text")
    text = clean_search_text(str(value))[:200]
    if not text:
        raise _error("Enter some text")
    return text


def _pair(value: Any) -> tuple[Any, Any]:
    if not isinstance(value, list) or len(value) != 2:
        raise _error("'between' needs two values")
    return value[0], value[1]


def _clause(f: GridField, op: str, value: Any) -> ColumnElement:
    col = f.column
    if op == "is_empty":
        return or_(col.is_(None), func.trim(col) == "") if f.type == "text" else col.is_(None)
    if op == "is_not_empty":
        return and_(col.isnot(None), func.trim(col) != "") if f.type == "text" else col.isnot(None)
    if op == "is_true":
        return col.is_(True)
    if op == "is_false":
        return col.is_(False)

    if f.type == "text":
        v = _like_escape(_text(value))
        return {
            "contains": lambda: col.ilike(f"%{v}%", escape="\\"),
            "not_contains": lambda: or_(col.is_(None), ~col.ilike(f"%{v}%", escape="\\")),
            "equals": lambda: func.lower(col) == _text(value).lower(),
            "starts_with": lambda: col.ilike(f"{v}%", escape="\\"),
            "ends_with": lambda: col.ilike(f"%{v}", escape="\\"),
        }[op]()

    if f.type == "number":
        if op == "between":
            lo, hi = _pair(value)
            return col.between(_number(lo), _number(hi))
        n = _number(value)
        return {"eq": col == n, "ne": col != n, "gt": col > n, "gte": col >= n, "lt": col < n, "lte": col <= n}[op]

    if f.type == "date":
        if op == "between":
            lo, hi = _pair(value)
            start, end = sorted((_day(lo), _day(hi)))
            return and_(col >= day_start(start), col < day_start(end + timedelta(days=1)))
        d = _day(value)
        return {
            "on": lambda: and_(col >= day_start(d), col < day_start(d + timedelta(days=1))),
            "before": lambda: col < day_start(d),
            "after": lambda: col >= day_start(d + timedelta(days=1)),
        }[op]()

    values = value if isinstance(value, list) else [value]
    values = [str(v)[:100] for v in values if v not in (None, "")][:MAX_IN_VALUES]
    if f.cast:
        try:
            values = [f.cast(v) for v in values]
        except (TypeError, ValueError):
            raise _error("Pick a valid value") from None
    if not values:
        raise _error("Pick at least one value")
    return col.in_(values) if op == "in" else or_(col.is_(None), col.notin_(values))


def apply_filters(query: Query, fields: dict[str, GridField], raw: str | None, match: str | None = "and") -> Query:
    if not raw:
        return query
    try:
        rules = json.loads(raw)
    except ValueError:
        raise _error("Filters must be valid JSON") from None
    if not isinstance(rules, list):
        raise _error("Filters must be a list")
    if len(rules) > MAX_RULES:
        raise _error(f"Use at most {MAX_RULES} filters")

    clauses = []
    for rule in rules:
        if not isinstance(rule, dict):
            raise _error("Each filter needs field, op and value")
        name, op = rule.get("field"), rule.get("op")
        f = fields.get(name) if isinstance(name, str) else None
        if not f or not f.filterable:
            raise _error(f"You can't filter by '{name}'")
        if op not in OPS[f.type]:
            raise _error(f"'{op}' isn't a valid filter for {name}")
        if op not in NO_VALUE and rule.get("value") in (None, "", []):
            continue
        clauses.append(_clause(f, op, rule.get("value")))

    if not clauses:
        return query
    return query.filter(or_(*clauses) if match == "or" else and_(*clauses))


def apply_sort(query: Query, fields: dict[str, GridField], raw: str | None, default: list) -> Query:
    order = []
    for part in [p.strip() for p in (raw or "").split(",") if p.strip()][:MAX_SORT]:
        desc = part.startswith("-")
        name = part.lstrip("-")
        f = fields.get(name)
        if not f or not f.sortable:
            raise _error(f"You can't sort by '{name}'", "sort")
        order.append(f.column.desc().nulls_last() if desc else f.column.asc().nulls_last())
    return query.order_by(*order, *default)

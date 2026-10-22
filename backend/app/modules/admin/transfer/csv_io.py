import csv
import io
import json
from datetime import date, datetime
from typing import Iterable, Iterator

from fastapi import HTTPException

from app.shared.utils.datetime import to_site

BOM = "﻿"
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _file_error(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": message, "errors": {"file": [message]}})


def cell(value) -> str:
    if value is None:
        text = ""
    elif isinstance(value, bool):
        text = "yes" if value else "no"
    elif isinstance(value, datetime):
        text = to_site(value).strftime("%Y-%m-%d %H:%M")
    elif isinstance(value, date):
        text = value.isoformat()
    elif isinstance(value, (list, dict)):
        text = json.dumps(value, ensure_ascii=False)
    else:
        text = str(value)
    return "'" + text if text.startswith(_FORMULA_START) else text


def uncell(value: str | None) -> str:
    value = (value or "").strip()
    if len(value) > 1 and value[0] == "'" and value[1] in _FORMULA_START:
        return value[1:]
    return value


def stream(headers: list[str], rows: Iterable[list]) -> Iterator[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(headers)
    yield BOM + buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    for i, row in enumerate(rows, 1):
        writer.writerow([cell(v) for v in row])
        if i % 200 == 0:
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
    if buffer.tell():
        yield buffer.getvalue()


def to_text(headers: list[str], rows: Iterable[list]) -> str:
    return "".join(stream(headers, rows))


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _header(name: str) -> str:
    return "_".join((name or "").strip().lower().split())


def read(raw: bytes, max_rows: int) -> tuple[list[str], list[tuple[int, dict[str, str]]]]:
    text = _decode(raw)
    first = text.split("\n", 1)[0]
    delimiter = ";" if first.count(";") > first.count(",") else ","

    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    try:
        headers = [_header(h) for h in next(reader)]
    except StopIteration:
        raise _file_error("The file is empty.")
    except csv.Error:
        raise _file_error("This doesn't look like a valid CSV file.")
    if not any(headers):
        raise _file_error("The first line of the file must be the column names.")

    rows: list[tuple[int, dict[str, str]]] = []
    try:
        for cells in reader:
            if not any((c or "").strip() for c in cells):
                continue
            if len(rows) >= max_rows:
                raise _file_error(f"The file has more than {max_rows} rows. Split it into smaller files.")
            values = {h: uncell(cells[i] if i < len(cells) else "") for i, h in enumerate(headers) if h}
            rows.append((reader.line_num, values))
    except csv.Error as exc:
        raise _file_error(f"Couldn't read the file near line {reader.line_num}: {exc}.")
    return [h for h in headers if h], rows

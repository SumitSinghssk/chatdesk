"""Five-field cron expressions ("*/5 * * * *", "0 6 * * 1-5", "30 2 1 * *"), to say when a job is due."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


def _parse_field(spec: str, lo: int, hi: int) -> set[int]:
    result: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        step = 1
        base = part
        if "/" in part:
            base, step_s = part.split("/", 1)
            step = int(step_s)
            if step < 1:
                raise ValueError(f"bad step in {part!r}")
        if base == "*":
            start, end = lo, hi
        elif "-" in base:
            a, b = base.split("-", 1)
            start, end = int(a), int(b)
        else:
            start = int(base)
            end = hi if "/" in part else start
        result.update(v for v in range(start, end + 1) if (v - start) % step == 0)
    return {v for v in result if lo <= v <= hi}


@dataclass(frozen=True)
class CronSchedule:
    minutes: frozenset[int]
    hours: frozenset[int]
    doms: frozenset[int]
    months: frozenset[int]
    dows: frozenset[int]
    dom_restricted: bool
    dow_restricted: bool
    raw: str

    @classmethod
    def parse(cls, expr: str) -> CronSchedule:
        parts = expr.strip().split()
        if len(parts) != 5:
            raise ValueError(f"cron expression must have 5 fields, got {len(parts)}: {expr!r}")
        minute_s, hour_s, dom_s, mon_s, dow_s = parts
        dows = _parse_field(dow_s, 0, 7)
        if 7 in dows:  # 0 and 7 are both Sunday
            dows.discard(7)
            dows.add(0)
        return cls(
            minutes=frozenset(_parse_field(minute_s, 0, 59)),
            hours=frozenset(_parse_field(hour_s, 0, 23)),
            doms=frozenset(_parse_field(dom_s, 1, 31)),
            months=frozenset(_parse_field(mon_s, 1, 12)),
            dows=frozenset(dows),
            dom_restricted=dom_s.strip() != "*",
            dow_restricted=dow_s.strip() != "*",
            raw=expr.strip(),
        )

    def matches(self, at: datetime) -> bool:
        if at.minute not in self.minutes or at.hour not in self.hours or at.month not in self.months:
            return False
        dom_ok = at.day in self.doms
        dow_ok = (at.weekday() + 1) % 7 in self.dows  # cron: 0 = Sunday
        if self.dom_restricted and self.dow_restricted:  # cron's rule: either day field may match
            return dom_ok or dow_ok
        return dom_ok and dow_ok

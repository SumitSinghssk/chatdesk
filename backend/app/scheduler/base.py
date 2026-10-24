from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from sqlalchemy.orm import Session

from app.scheduler.cron import CronSchedule

# run(db, force) -> one line saying what it did. `force` is set by `run <name>`: do it even if not due.
JobRun = Callable[[Session, bool], str]


@dataclass(frozen=True)
class Job:
    name: str
    description: str
    cadence: str
    schedule: CronSchedule
    run: JobRun

    def due_at(self, at: datetime) -> bool:
        return self.schedule.matches(at)

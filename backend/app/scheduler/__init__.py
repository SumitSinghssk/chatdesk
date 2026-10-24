"""Scheduled jobs, run by one cron entry every minute (`python scheduler.py`).

Each job is a file in jobs/ with NAME, DESCRIPTION, CADENCE, SCHEDULE (a cron expression) and
run(db, force); registry.py lists them. On every tick only the jobs whose schedule matches the
current minute run.
"""

from app.scheduler.base import Job
from app.scheduler.registry import JOBS, by_name

__all__ = ["JOBS", "Job", "by_name"]

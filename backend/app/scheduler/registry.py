from __future__ import annotations

from app.scheduler.base import Job
from app.scheduler.cron import CronSchedule
from app.scheduler.jobs import (
    ai_replies,
    backup,
    campaigns,
    carts,
    chatbots,
    customers,
    not_found,
    notifications,
    payments,
    publish,
    security,
    trash,
)


def _build(mod) -> Job:
    return Job(name=mod.NAME, description=mod.DESCRIPTION, cadence=mod.CADENCE,
               schedule=CronSchedule.parse(mod.SCHEDULE), run=mod.run)


# Run in this order on a tick. Adding a job: a file in jobs/ + one line here. No cron change needed.
JOBS: list[Job] = [
    _build(publish),
    _build(campaigns),
    _build(chatbots),
    _build(payments),
    _build(carts),
    _build(ai_replies),
    _build(notifications),
    _build(backup),
    _build(trash),
    _build(not_found),
    _build(security),
    _build(customers),
]


def by_name(name: str) -> Job | None:
    return next((j for j in JOBS if j.name == name), None)

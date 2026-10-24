"""python -m app.scheduler list | schedule | run <name> | run-all   (or the same through `python scheduler.py`)"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from sqlalchemy import text

from app import models  # noqa: F401  (registers every model)
from app.core.database import SessionLocal, engine
from app.scheduler import JOBS, Job, by_name
from app.shared.utils.datetime import now

TICK_LOCK = 7_204_113_905_221  # one tick at a time, however many servers / cron entries call it


def say(job: str, message: str) -> None:
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {job:<10} {message}"  # server time, like the cron schedules
    print(line.encode("ascii", "replace").decode("ascii"), flush=True)


def _print_list() -> int:
    name_w = max(len(j.name) for j in JOBS)
    sched_w = max(len(j.schedule.raw) for j in JOBS)
    cad_w = max(len(j.cadence) for j in JOBS)
    print(f"{'NAME'.ljust(name_w)}  {'SCHEDULE'.ljust(sched_w)}  {'CADENCE'.ljust(cad_w)}  DESCRIPTION")
    print(f"{'-' * name_w}  {'-' * sched_w}  {'-' * cad_w}  {'-' * 40}")
    for j in JOBS:
        print(f"{j.name.ljust(name_w)}  {j.schedule.raw.ljust(sched_w)}  {j.cadence.ljust(cad_w)}  {j.description}")
    return 0


def _run(jobs: list[Job], force: bool) -> int:
    """Runs jobs one after another; one failing never stops the others. Returns 1 if any failed."""
    from app.core.cache import flush_pending
    from app.core.monitoring import capture_exception
    from app.modules.admin.backups import schedule

    db = SessionLocal()
    failures = 0
    try:
        schedule.record_heartbeat(db)  # the admin Backups / System health pages show the scheduler is alive
        db.commit()
        last_runs = dict(schedule.heartbeat_value(db).get("tasks") or {})
        for job in jobs:
            try:
                message = job.run(db, force)
                if "FAILED" in message:
                    failures += 1
                say(job.name, message)
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                failures += 1
                capture_exception(exc)
                say(job.name, f"error: {exc.__class__.__name__}: {str(exc)[:200]}")
            last_runs[job.name] = now().isoformat()
        schedule.record_heartbeat(db, tasks=last_runs)
        db.commit()
    finally:
        db.close()
    flush_pending()
    return 1 if failures else 0


def _tick() -> int:
    """What cron calls every minute: the jobs whose schedule matches this minute."""
    lock = engine.connect()
    try:
        if not lock.execute(text("select pg_try_advisory_lock(:k)"), {"k": TICK_LOCK}).scalar():
            say("schedule", "previous tick still running - skipping")
            return 0
        try:
            at = datetime.now()
            due = [j for j in JOBS if j.due_at(at)]
            if not due:
                say("schedule", "0 jobs due")
                return 0
            return _run(due, force=False)
        finally:
            lock.execute(text("select pg_advisory_unlock(:k)"), {"k": TICK_LOCK})
    finally:
        lock.close()


def main(argv: list[str] | None = None) -> int:
    from app.core.logging_config import configure_logging
    from app.core.monitoring import init_sentry

    parser = argparse.ArgumentParser(prog="python -m app.scheduler", description="List and run the scheduled jobs.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="List every job and when it runs.")
    sub.add_parser("schedule", help="Run the jobs due this minute (wire to cron as * * * * *).")
    run_p = sub.add_parser("run", help="Run one job now, even if it isn't due.")
    run_p.add_argument("name", choices=[j.name for j in JOBS])
    sub.add_parser("run-all", help="Run every job now (a backup is still made only when one is due).")
    args = parser.parse_args(argv)

    if args.command == "list":
        return _print_list()
    configure_logging()
    init_sentry("scheduler")
    if args.command == "schedule":
        return _tick()
    if args.command == "run":
        return _run([by_name(args.name)], force=True)
    return _run(JOBS, force=False)


if __name__ == "__main__":
    sys.exit(main())

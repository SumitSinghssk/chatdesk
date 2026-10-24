from datetime import datetime

import pytest

import scheduler
from app.scheduler import JOBS, by_name
from app.scheduler import __main__ as cli
from app.scheduler.base import Job
from app.scheduler.cron import CronSchedule


@pytest.mark.parametrize("expr, at, due", [
    ("* * * * *", datetime(2026, 10, 24, 9, 37), True),
    ("0 * * * *", datetime(2026, 10, 24, 9, 0), True),
    ("0 * * * *", datetime(2026, 10, 24, 9, 1), False),
    ("*/15 * * * *", datetime(2026, 10, 24, 9, 45), True),
    ("*/15 * * * *", datetime(2026, 10, 24, 9, 40), False),
    ("30 6 * * 1-5", datetime(2026, 10, 23, 6, 30), True),  # Friday
    ("30 6 * * 1-5", datetime(2026, 10, 25, 6, 30), False),  # Sunday
    ("0 0 * * 7", datetime(2026, 10, 25, 0, 0), True),  # 7 is Sunday too
    ("0 9 1 * 1", datetime(2026, 10, 26, 9, 0), True),  # day-of-month OR day-of-week (Monday)
    ("0 9 1,15 * *", datetime(2026, 10, 15, 9, 0), True),
    ("5-10/5 * * * *", datetime(2026, 10, 24, 1, 10), True),
])
def test_cron_expressions(expr, at, due):
    assert CronSchedule.parse(expr).matches(at) is due


def test_bad_cron_expression():
    with pytest.raises(ValueError):
        CronSchedule.parse("* * * *")


def test_every_job_is_registered_once_with_a_valid_schedule():
    names = [j.name for j in JOBS]
    assert len(names) == len(set(names))
    assert {"campaigns", "chatbots", "ai_replies", "backup", "trash"} <= set(names)
    assert by_name("ai_replies").due_at(datetime(2026, 1, 1, 3, 7))
    assert not by_name("trash").due_at(datetime(2026, 1, 1, 3, 7))


def test_one_failing_job_does_not_stop_the_others(monkeypatch, capsys):
    ran = []

    def boom(db, force):
        raise RuntimeError("broken")

    def fine(db, force):
        ran.append(force)
        return "all good"

    jobs = [Job("boom", "", "", CronSchedule.parse("* * * * *"), boom),
            Job("fine", "", "", CronSchedule.parse("* * * * *"), fine)]
    assert cli._run(jobs, force=True) == 1
    out = capsys.readouterr().out
    assert "boom" in out and "error: RuntimeError: broken" in out and "all good" in out
    assert ran == [True]


def test_old_scheduler_flags_still_work():
    assert scheduler._translate([]) == [["schedule"]]
    assert scheduler._translate(["--task", "trash"]) == [["run", "trash"]]
    assert scheduler._translate(["--task", "all"]) == [["run-all"]]
    assert scheduler._translate(["--force-backup"]) == [["run", "backup"], ["schedule"]]
    assert scheduler._translate(["list"]) == [["list"]]

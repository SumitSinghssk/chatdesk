"""Scheduled jobs. Call it every minute (cron / Task Scheduler / the Docker scheduler service):

    python scheduler.py                 run the jobs due this minute
    python scheduler.py list            every job, its cron schedule and what it does
    python scheduler.py run <name>      run one job now, even if it isn't due
    python scheduler.py run-all         run every job now

The jobs live in app/scheduler/jobs/ (one file each, with its own cron expression) and are listed in
app/scheduler/registry.py. Older forms still work: `--task <name|all>` and `--force-backup`.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))


def _translate(argv: list[str]) -> list[list[str]]:
    """Old flags -> new commands (each inner list is one run)."""
    if argv and not argv[0].startswith("-"):
        return [argv]
    task = argv[argv.index("--task") + 1] if "--task" in argv and argv.index("--task") + 1 < len(argv) else None
    force_backup = "--force-backup" in argv
    if task == "all":
        return [["run", "backup"], ["run-all"]] if force_backup else [["run-all"]]
    if task:
        return [["run", "backup"], ["run", task]] if force_backup and task != "backup" else [["run", task]]
    return [["run", "backup"], ["schedule"]] if force_backup else [["schedule"]]


def main(argv: list[str] | None = None) -> int:
    from app.scheduler.__main__ import main as run

    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    return max(run(args) for args in _translate(argv))


if __name__ == "__main__":
    sys.exit(main())

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402


def say(message: str) -> None:
    print(f"[bootstrap] {message}", flush=True)


def wait_for_database(timeout: int = 90) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text("select 1"))
            return
        except Exception as exc:  # noqa: BLE001
            if time.monotonic() > deadline:
                say(f"database is not reachable: {exc}")
                sys.exit(1)
            time.sleep(2)


def run(*args: str) -> None:
    say("running: " + " ".join(args))
    subprocess.run([sys.executable, *args], check=True)


def table_empty(table: str) -> bool:
    with engine.connect() as conn:
        return not conn.execute(text(f"select exists (select 1 from {table})")).scalar()


def main() -> None:
    wait_for_database()
    run("-m", "alembic", "upgrade", "head")
    run("seed.py", "rbac")

    mode = os.getenv("AUTO_SEED", "basic").strip().lower()
    if mode in ("", "none", "false", "0"):
        return
    if table_empty("settings"):
        run("seed.py", "settings")
    if mode == "demo" and table_empty("users"):
        run("seed.py", "users", "content", "--force")
        say("demo data created: sign in with superadmin@gmail.com / Password@123 and change it")
    elif table_empty("users"):
        say("no admin account yet: docker compose exec api python manage.py create-admin you@example.com --generate")


if __name__ == "__main__":
    main()

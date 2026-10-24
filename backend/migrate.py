"""Brings the database schema up to date, whatever state it is in.

    python migrate.py               alembic upgrade; then adds any model table/column no migration covers
    python migrate.py --dry-run     show what is missing, change nothing
    python migrate.py --diff-only   skip alembic and sync tables/columns straight from the models
    python migrate.py --auto-revision   alembic upgrade -> autogenerate a revision -> upgrade
    python migrate.py --test        the same, on TEST_DATABASE_URL (the pytest database)

When the database records a revision this code doesn't have (another branch, a restored dump),
alembic can't run; it then falls back to the schema diff and stamps the database at the current
head, so the next run goes through alembic normally. The diff only ever adds: it never drops or
changes a table, a column or data.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Environment-resilient schema migrator.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without touching the DB.")
    parser.add_argument("--diff-only", action="store_true",
                        help="Skip alembic; run the schema diff directly against the models.")
    parser.add_argument("--auto-revision", action="store_true",
                        help="alembic upgrade -> autogenerate a revision -> upgrade (creates a normal migration).")
    parser.add_argument("--no-stamp", action="store_true",
                        help="After a schema-diff sync, don't update alembic_version (default is to stamp).")
    parser.add_argument("--test", action="store_true", help="Run against TEST_DATABASE_URL instead of DATABASE_URL.")
    return parser.parse_args()


ARGS = _args() if __name__ == "__main__" else argparse.Namespace(test=False)
os.chdir(ROOT)  # alembic.ini and the app package are found from here, wherever it's run from
sys.path.insert(0, str(ROOT))

if ARGS.test:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
    if not os.getenv("TEST_DATABASE_URL"):
        sys.exit("TEST_DATABASE_URL is not set in .env")
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]  # also reaches the alembic subprocess

from sqlalchemy import inspect, text  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.schema import Table  # noqa: E402

from app import models  # noqa: E402,F401  (registers every model on Base.metadata)
from app.core.database import Base, engine  # noqa: E402


# Alembic ----------------------------------------------------------------------------------

def _run_alembic(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run([sys.executable, "-m", "alembic", *args], text=True, capture_output=True)
    return result.returncode, result.stdout, result.stderr


def _alembic_upgrade(target: str) -> tuple[bool, str]:
    code, out, err = _run_alembic(["upgrade", target])
    return code == 0, (out or "") + (err or "")


def _script():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(Config("alembic.ini"))


def _resolve_upgrade_target(eng: Engine) -> tuple[str | None, str]:
    """The revision to upgrade to: "head", or this database's own head when there are several."""
    from alembic.runtime.migration import MigrationContext

    script = _script()
    heads = script.get_heads()
    with eng.connect() as conn:
        current = set(MigrationContext.configure(conn).get_current_heads())
    if not current:
        if _existing_tables(eng) - {"alembic_version"}:
            return None, "the database has tables but no alembic revision recorded"
        return "head", ""  # a brand-new database: alembic builds everything
    if len(heads) <= 1:
        return "head", ""
    on_branch = [h for h in heads if current & {rev.revision for rev in script.iterate_revisions(h, "base")}]
    if len(on_branch) == 1:
        others = [h for h in heads if h != on_branch[0]]
        return on_branch[0], (f"{len(heads)} migration heads exist; upgrading this DB's branch to {on_branch[0]} "
                              f"and leaving the other head(s) alone ({', '.join(others)}).")
    return None, ("multiple heads all branch off the current revision: resolve them (e.g. `alembic merge`) "
                  "or upgrade to a specific revision by hand.")


def _looks_like_missing_revision(output: str) -> bool:
    return any(needle in output for needle in ("is not present", "Can't locate revision", "KeyError"))


def _alembic_head() -> str | None:
    heads = _script().get_heads()
    return heads[0] if len(heads) == 1 else None


def _stamp_alembic_to_head(eng: Engine) -> str | None:
    head = _alembic_head()
    if head is None:
        return None
    with eng.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL, "
                             "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))")
        conn.exec_driver_sql("DELETE FROM alembic_version")
        conn.execute(text("INSERT INTO alembic_version (version_num) VALUES (:v)"), {"v": head})
    return head


# Schema diff --------------------------------------------------------------------------------

def _model_tables() -> dict[str, Table]:
    return dict(Base.metadata.tables)


def _existing_tables(eng: Engine) -> set[str]:
    return set(inspect(eng).get_table_names())


def _existing_columns(eng: Engine, table_name: str) -> set[str]:
    return {c["name"] for c in inspect(eng).get_columns(table_name)}


def _existing_enums(eng: Engine) -> set[str]:
    if eng.dialect.name != "postgresql":
        return set()
    with eng.connect() as conn:
        rows = conn.execute(text("SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
                                 "WHERE t.typtype = 'e' AND n.nspname = 'public'")).fetchall()
    return {r[0] for r in rows}


def _enums_used_by_metadata() -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for table in Base.metadata.tables.values():
        for col in table.columns:
            t = col.type
            if hasattr(t, "enums") and getattr(t, "name", None) and list(t.enums):
                found.setdefault(t.name, list(t.enums))
    return found


def _plan(eng: Engine) -> dict:
    db_tables = _existing_tables(eng)
    db_enums = _existing_enums(eng)
    missing_columns: dict[str, list[str]] = {}
    for name, table in _model_tables().items():
        if name in db_tables:
            db_cols = _existing_columns(eng, name)
            added = [c.name for c in table.columns if c.name not in db_cols]
            if added:
                missing_columns[name] = added
    return {
        "enums": {n: v for n, v in _enums_used_by_metadata().items() if n not in db_enums},
        "tables": sorted(n for n in _model_tables() if n not in db_tables),
        "columns": missing_columns,
    }


def _empty(plan: dict) -> bool:
    return not (plan["enums"] or plan["tables"] or plan["columns"])


def _print_plan(plan: dict, *, dry_run: bool) -> None:
    print(f"\n{'DRY RUN - no changes' if dry_run else 'Schema diff'}")
    print("=" * 50)
    if plan["enums"]:
        print(f"\nMissing ENUM types ({len(plan['enums'])}):")
        for name, vals in plan["enums"].items():
            print(f"  + {name}: {vals}")
    else:
        print("\nMissing ENUM types: none")
    if plan["tables"]:
        print(f"\nMissing tables ({len(plan['tables'])}):")
        for name in plan["tables"]:
            print(f"  + {name}")
    else:
        print("\nMissing tables: none")
    if plan["columns"]:
        total = sum(len(v) for v in plan["columns"].values())
        print(f"\nMissing columns ({total} across {len(plan['columns'])} tables):")
        for table_name, cols in plan["columns"].items():
            for col in cols:
                print(f"  + {table_name}.{col}")
    else:
        print("\nMissing columns: none")


def _create_enum(eng: Engine, name: str, values: Iterable[str]) -> None:
    quoted = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
    with eng.begin() as conn:
        conn.exec_driver_sql(f'CREATE TYPE "{name}" AS ENUM ({quoted})')


def _add_column_sql(eng: Engine, table_name: str, column) -> str:
    col_type = column.type.compile(dialect=eng.dialect)
    parts = [f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "{column.name}" {col_type}']
    default = column.server_default.arg if column.server_default is not None else None
    if default is not None:  # server_default="{}" or text("now()")
        parts.append("DEFAULT " + (getattr(default, "text", None) or "'" + str(default).replace("'", "''") + "'"))
    elif column.default is not None and getattr(column.default, "is_scalar", False):
        v = column.default.arg
        if isinstance(v, bool):
            parts.append(f"DEFAULT {'true' if v else 'false'}")
        elif isinstance(v, int | float):
            parts.append(f"DEFAULT {v}")
        elif isinstance(v, str):
            parts.append("DEFAULT '" + v.replace("'", "''") + "'")
    return " ".join(parts)


def _add_columns(eng: Engine, missing: dict[str, list[str]]) -> None:
    model_tables = _model_tables()
    for table_name, col_names in missing.items():
        table = model_tables.get(table_name)
        if table is None:
            continue
        cols_by_name = {c.name: c for c in table.columns}
        with eng.begin() as conn:
            for col_name in col_names:
                col = cols_by_name.get(col_name)
                if col is None:
                    continue
                conn.exec_driver_sql(_add_column_sql(eng, table_name, col))
                for fk in col.foreign_keys:
                    target = fk.column
                    cname = f"fk_{table_name}_{col_name}_{target.table.name}"[:60]
                    on_delete = f" ON DELETE {fk.ondelete.upper()}" if fk.ondelete else ""
                    try:
                        with conn.begin_nested():
                            conn.exec_driver_sql(f'ALTER TABLE "{table_name}" ADD CONSTRAINT "{cname}" FOREIGN KEY '
                                                 f'("{col_name}") REFERENCES "{target.table.name}" ("{target.name}")'
                                                 f"{on_delete}")
                    except Exception as exc:  # noqa: BLE001 - report and carry on with the other columns
                        print(f"  ! could not add FK {cname}: {exc}")
                if col.index or col.unique:
                    iname = f"{'uq' if col.unique else 'ix'}_{table_name}_{col_name}"[:60]
                    unique = "UNIQUE " if col.unique else ""
                    try:
                        with conn.begin_nested():
                            conn.exec_driver_sql(f'CREATE {unique}INDEX IF NOT EXISTS "{iname}" '
                                                 f'ON "{table_name}" ("{col_name}")')
                    except Exception as exc:  # noqa: BLE001
                        print(f"  ! could not add index {iname}: {exc}")


def _apply_diff(eng: Engine, plan: dict) -> None:
    for name, values in plan["enums"].items():
        _create_enum(eng, name, values)
        print(f"  [ok] created enum {name}")
    if plan["tables"]:
        missing = set(plan["tables"])
        for table in [t for t in Base.metadata.sorted_tables if t.name in missing]:
            with eng.begin() as conn:
                table.create(conn, checkfirst=True)
            print(f"  [ok] created table {table.name}")
    if plan["columns"]:
        _add_columns(eng, plan["columns"])
        for table_name, cols in plan["columns"].items():
            for col in cols:
                print(f"  [ok] added {table_name}.{col}")


# Modes -----------------------------------------------------------------------------------------

def _diff_mode(*, dry_run: bool, stamp_after: bool) -> int:
    plan = _plan(engine)
    _print_plan(plan, dry_run=dry_run)
    if _empty(plan):
        print("\nNo schema changes needed.")
    elif dry_run:
        print("\n(dry run - nothing applied)")
    else:
        print("\nApplying...")
        _apply_diff(engine, plan)
        print("\nSchema sync complete.")
    if stamp_after and not dry_run:
        head = _stamp_alembic_to_head(engine)
        print(f"\n  [ok] stamped alembic_version -> {head}" if head
              else "\n  ! couldn't stamp (no single alembic head)")
    return 0


def _pending(eng: Engine) -> list[str]:
    """Migrations the database hasn't run yet (for --dry-run)."""
    from alembic.runtime.migration import MigrationContext

    script = _script()
    with eng.connect() as conn:
        current = set(MigrationContext.configure(conn).get_current_heads())
    try:
        known = {rev.revision for head in current for rev in script.iterate_revisions(head, "base")}
    except Exception:  # noqa: BLE001 - a revision this code doesn't have
        return ["(the database is on a revision this code doesn't know)"]
    return [f"{rev.revision}  {rev.doc}" for rev in script.walk_revisions() if rev.revision not in known]


def _alembic_then_diff(*, dry_run: bool) -> int:
    if dry_run:
        pending = _pending(engine)
        print("\nMigrations not applied yet:" if pending else "\nMigrations: up to date")
        for line in reversed(pending):
            print(f"  + {line}")
        return _diff_mode(dry_run=True, stamp_after=False)

    target, note = _resolve_upgrade_target(engine)
    if note:
        print(f"  note: {note}")
    if target is None:
        print("\n  ! Can't pick a single upgrade target for this DB.\n  Falling back to schema-diff sync...\n")
        return _diff_mode(dry_run=False, stamp_after=True)

    print(f"Running `alembic upgrade {target}`...")
    ok, output = _alembic_upgrade(target)
    if ok:
        print(output.strip() or "  (no migrations to apply)")
        print("\nDone via alembic.")
        plan = _plan(engine)
        if not _empty(plan):
            print("\nSyncing model tables/columns not covered by a migration...")
            _print_plan(plan, dry_run=False)
            print("\nApplying...")
            _apply_diff(engine, plan)
            print("\nSchema sync complete.")
        return 0

    print(output.strip())
    if not _looks_like_missing_revision(output):
        print("\n[x] alembic failed for a reason unrelated to revision drift. Investigate the error above first.")
        return 1
    print("\n  ! Alembic can't apply because the DB's recorded revision isn't in the local migration tree.")
    print("  Falling back to schema-diff sync...\n")
    rc = _diff_mode(dry_run=False, stamp_after=True)
    if rc == 0:
        print("\nFuture `python migrate.py` runs will go through alembic normally.")
    return rc


def _auto_revision() -> int:
    for cmd in (["upgrade", "head"], ["revision", "--autogenerate", "-m", "auto migration"], ["upgrade", "head"]):
        print(f"$ alembic {' '.join(cmd)}")
        code, out, err = _run_alembic(cmd)
        print((out or "").strip())
        if code != 0:
            print((err or "").strip())
            return code
    return 0


def main() -> int:
    db = engine.url
    print(f"Database: {db.database} on {db.host or 'localhost'}{' (test)' if ARGS.test else ''}")
    if ARGS.auto_revision:
        return _auto_revision()
    if ARGS.diff_only:
        return _diff_mode(dry_run=ARGS.dry_run, stamp_after=not ARGS.no_stamp)
    return _alembic_then_diff(dry_run=ARGS.dry_run)


if __name__ == "__main__":
    sys.exit(main())

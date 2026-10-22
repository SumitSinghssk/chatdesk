import sys
from typing import Callable

from app import models  # noqa: F401
from app.core.config import settings as app_settings
from seeders import content, rbac, settings, users

SEEDERS: list[tuple[str, str, Callable[[], None]]] = [
    ("rbac", "Roles & permissions (additive - safe to re-run)", rbac.run),
    ("users", "Admin users (superadmin@gmail.com / admin@gmail.com / editor@gmail.com)", users.run),
    ("settings", "Default settings, menus and home SEO record", settings.run),
    ("content", "Demo content: categories, blogs, pages, testimonials, enquiries", content.run),
]
KEYS = [key for key, _, _ in SEEDERS]
UNSAFE_IN_PRODUCTION = {"users", "content"}


def _run(selected: list[str]) -> None:
    for key, label, fn in SEEDERS:
        if key not in selected:
            continue
        print(f">> Running: {label}")
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            print(f"[x] Failed: {key}: {exc}")
            sys.exit(1)
        print(f"[ok] Done: {key}")


def main() -> None:
    force = "--force" in sys.argv[1:]
    args = [a.lower() for a in sys.argv[1:] if a != "--force"]
    if not args:
        for i, (key, label, _) in enumerate(SEEDERS, start=1):
            print(f"  {i}. {key:<10} {label}")
        print("  a. all")
        choice = input("Select seeders (e.g. 1 2 or a): ").strip().lower().split()
        args = KEYS if "a" in choice else [KEYS[int(c) - 1] for c in choice if c.isdigit() and 0 < int(c) <= len(KEYS)]
    if "all" in args:
        args = KEYS
    unknown = [a for a in args if a not in KEYS]
    if unknown:
        print(f"Unknown seeder(s): {', '.join(unknown)}. Available: {', '.join(KEYS)}, all")
        sys.exit(1)
    blocked = sorted(UNSAFE_IN_PRODUCTION.intersection(args))
    if blocked and app_settings.is_production and not force:
        print(f"Refusing to run {', '.join(blocked)} with APP_ENV=production: they create demo users with "
              "known passwords and demo content. Re-run with --force if you really mean it.")
        sys.exit(1)
    _run(args)


if __name__ == "__main__":
    main()

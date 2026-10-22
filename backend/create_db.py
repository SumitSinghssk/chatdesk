from urllib.parse import unquote, urlparse

import psycopg2
from psycopg2 import sql

from app.core.config import settings


def main() -> None:
    url = urlparse(settings.DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://"))
    db_name = url.path.lstrip("/")
    conn = psycopg2.connect(
        dbname="postgres",
        user=unquote(url.username or ""),
        password=unquote(url.password or ""),
        host=url.hostname or "localhost",
        port=url.port or 5432,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
            if cur.fetchone():
                print(f"[ok] Database '{db_name}' already exists")
                return
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
            print(f"[ok] Created database '{db_name}'")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

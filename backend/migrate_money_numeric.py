"""One-off: store money columns as NUMERIC(14,2) instead of double precision.

    python migrate_money_numeric.py            # report only, changes nothing
    python migrate_money_numeric.py --apply    # convert, in one transaction

Values are rounded to the paisa; the report lists every value that changes.
"""
import os
import sys
from urllib.parse import urlparse

import pg8000.dbapi as pg
from dotenv import load_dotenv

COLUMNS = [
    ("accounts", "balance"),
    ("accounts", "real_balance"),
    ("transactions", "amount"),
    ("splits", "total_amount"),
    ("budgets", "monthly_limit"),
]


def connect():
    load_dotenv(".env.local")
    load_dotenv(".env")
    url = urlparse(os.environ["DATABASE_URL"].replace("postgresql+psycopg2://", "postgresql://"))
    return pg.connect(user=url.username, password=url.password, host=url.hostname,
                      port=url.port or 5432, database=url.path.lstrip("/"), ssl_context=True)


def main(apply):
    conn = connect()
    cur = conn.cursor()

    pending = []
    for table, col in COLUMNS:
        cur.execute("SELECT data_type FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
                    (table, col))
        row = cur.fetchone()
        if row is None:
            print(f"{table}.{col}: missing, skipped")
            continue
        if row[0] == "numeric":
            print(f"{table}.{col}: already numeric")
            continue
        cur.execute(f"SELECT {col}, round({col}::numeric, 2) FROM {table} "
                    f"WHERE {col} IS NOT NULL AND {col}::numeric <> round({col}::numeric, 2)")
        changed = cur.fetchall()
        print(f"{table}.{col}: {len(changed)} value(s) change when rounded")
        for old, new in changed[:20]:
            print(f"    {old!r} -> {new}")
        pending.append((table, col))

    if not pending:
        print("\nNothing to do.")
        return 0
    if not apply:
        print("\nReport only. Re-run with --apply to convert.")
        return 0

    for table, col in pending:
        cur.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE NUMERIC(14,2) USING round({col}::numeric, 2)")
    conn.commit()
    print(f"\nConverted {len(pending)} column(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main("--apply" in sys.argv))

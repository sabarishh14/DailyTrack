"""
Add the 'language' column to movies and tv_shows (ISO 639-1 original
language, fetched from TMDB). Safe to re-run — skips a table that already
has the column.

Run from the repo root:  python utils/add_language_column.py
"""
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)  # .env and firebase-credentials.json are resolved from here

from sqlalchemy import text  # noqa: E402
from app import app  # noqa: E402
from extensions import db  # noqa: E402


def add_language_column():
    with app.app_context():
        for table in ("movies", "tv_shows"):
            try:
                db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN language VARCHAR(10);"))
                db.session.commit()
                print(f"Added 'language' to {table}")
            except Exception as e:
                db.session.rollback()
                print(f"{table} skip: {e}")


if __name__ == "__main__":
    add_language_column()

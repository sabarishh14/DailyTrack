"""
Backfill the TMDB details older movie rows are missing: release_date, runtime,
director and top cast.

Films imported from Letterboxd or created from Cinema transactions before the
shared TMDB helper existed only stored runtime and release year. Stats such as
"Newest Release" compare full release dates, so fill them in once.

Only empty fields are written; anything already set is left alone. Safe to
re-run — a second run just finds nothing to do.

Run from the repo root:  python utils/backfill_movie_details.py
Add --dry-run to see what would change without writing.
"""
import os
import sys
import time

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)  # .env and firebase-credentials.json are resolved from here

from app import app  # noqa: E402
from extensions import db  # noqa: E402
from models import Movie  # noqa: E402
from blueprints.media import fetch_tmdb_movie_details  # noqa: E402

FIELDS = ("release_date", "runtime", "director", "top_cast", "release_year")


def backfill(dry_run=False):
    with app.app_context():
        movies = Movie.query.filter(
            Movie.tmdb_id.isnot(None),
            db.or_(
                Movie.release_date.is_(None),
                Movie.release_date == "",
                Movie.runtime.is_(None),
                Movie.director.is_(None),
                Movie.top_cast.is_(None),
            ),
        ).order_by(Movie.id).all()

        print(f"{len(movies)} movies are missing at least one detail." + (" (dry run)" if dry_run else ""))
        updated, unchanged, failed = 0, 0, 0

        for i, movie in enumerate(movies, start=1):
            time.sleep(0.15)  # stay well inside TMDB's rate limit
            details = fetch_tmdb_movie_details(movie.tmdb_id, timeout=10)
            if not details["fetched"]:
                print(f"  ✗ {movie.name} (TMDB {movie.tmdb_id}): request failed")
                failed += 1
                continue

            filled = []
            for field in FIELDS:
                if getattr(movie, field) in (None, "") and details[field] not in (None, ""):
                    if not dry_run:
                        setattr(movie, field, details[field])
                    filled.append(field)

            if filled:
                updated += 1
                print(f"  ✓ {movie.name}: {', '.join(filled)}")
            else:
                unchanged += 1  # TMDB doesn't have the missing fields either

            if not dry_run and i % 20 == 0:
                db.session.commit()
                print(f"  … {i}/{len(movies)} processed")

        if not dry_run:
            db.session.commit()
        print(f"\nDone. Filled: {updated}, nothing new on TMDB: {unchanged}, failed: {failed}.")


if __name__ == "__main__":
    backfill(dry_run="--dry-run" in sys.argv)

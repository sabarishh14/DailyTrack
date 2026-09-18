"""
Backfill the 'language' field (ISO 639-1 original language, from TMDB) for
movies and TV shows that don't have it yet — needed for the "by language"
stats chart to cover rows added before the field existed.

Only empty fields are written; anything already set is left alone. Safe to
re-run — a second run just finds nothing to do.

Run from the repo root:  python utils/backfill_language.py
Add --dry-run to see what would change without writing.
"""
import os
import sys
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)  # .env and firebase-credentials.json are resolved from here

from app import app  # noqa: E402
from extensions import db, TMDB_API_KEY  # noqa: E402
from models import Movie, TvShow  # noqa: E402
from blueprints.media import fetch_tmdb_movie_details, fetch_tmdb_tv_language  # noqa: E402


def _tmdb_session():
    """A session that retries the connection resets TMDB occasionally sends."""
    session = requests.Session()
    retry = Retry(total=5, connect=5, read=5, backoff_factor=0.8, status_forcelist=[429, 500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update({
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
    })
    return session


def backfill(dry_run=False):
    session = _tmdb_session()
    with app.app_context():
        movies = Movie.query.filter(
            Movie.tmdb_id.isnot(None),
            Movie.language.is_(None),
        ).order_by(Movie.id).all()
        print(f"{len(movies)} movies missing language." + (" (dry run)" if dry_run else ""))
        updated, failed = 0, 0
        for i, movie in enumerate(movies, start=1):
            time.sleep(0.15)  # stay well inside TMDB's rate limit
            details = fetch_tmdb_movie_details(movie.tmdb_id, session=session, timeout=10)
            if not details["fetched"] or not details["language"]:
                failed += 1
                continue
            if not dry_run:
                movie.language = details["language"]
            updated += 1
            print(f"  ✓ {movie.name}: {details['language']}")
            if not dry_run and i % 20 == 0:
                db.session.commit()
                print(f"  … {i}/{len(movies)} processed")
        if not dry_run:
            db.session.commit()
        print(f"Movies done. Filled: {updated}, no language on TMDB / failed: {failed}.\n")

        shows = TvShow.query.filter(
            TvShow.tmdb_id.isnot(None),
            TvShow.language.is_(None),
        ).order_by(TvShow.id).all()
        print(f"{len(shows)} TV shows missing language." + (" (dry run)" if dry_run else ""))
        updated, failed = 0, 0
        for i, show in enumerate(shows, start=1):
            time.sleep(0.15)
            language = fetch_tmdb_tv_language(show.tmdb_id, session=session, timeout=10)
            if not language:
                failed += 1
                continue
            if not dry_run:
                show.language = language
            updated += 1
            print(f"  ✓ {show.name}: {language}")
            if not dry_run and i % 20 == 0:
                db.session.commit()
                print(f"  … {i}/{len(shows)} processed")
        if not dry_run:
            db.session.commit()
        print(f"TV shows done. Filled: {updated}, no language on TMDB / failed: {failed}.")


if __name__ == "__main__":
    backfill(dry_run="--dry-run" in sys.argv)

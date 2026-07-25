"""
Backfill runtime for all movies missing it by fetching from TMDB /movie/{id} details.
Run once: python backfill_runtime.py
"""
import os
import time
import requests
from app import app, db, Movie

# Load env
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
    load_dotenv('.env')
except ImportError:
    pass

TMDB_API_KEY = os.getenv("TMDB_API_KEY")

def backfill():
    if not TMDB_API_KEY:
        print("❌ TMDB_API_KEY not set!")
        return

    session = requests.Session()
    session.headers.update({
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    })

    with app.app_context():
        movies = Movie.query.filter(Movie.runtime.is_(None), Movie.tmdb_id.isnot(None)).all()
        print(f"Found {len(movies)} movies missing runtime. Fetching from TMDB...")
        
        updated = 0
        failed = 0
        
        for i, movie in enumerate(movies):
            try:
                time.sleep(0.15)  # Rate limiting
                r = session.get(f"https://api.themoviedb.org/3/movie/{movie.tmdb_id}", timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    runtime = data.get('runtime')
                    if runtime:
                        movie.runtime = runtime
                        updated += 1
                        if updated % 10 == 0:
                            db.session.commit()
                            print(f"  Progress: {updated} updated, {failed} failed ({i+1}/{len(movies)})")
                    else:
                        print(f"  ⚠️ No runtime for {movie.name} (TMDB ID: {movie.tmdb_id})")
                        failed += 1
                else:
                    print(f"  ❌ HTTP {r.status_code} for {movie.name}")
                    failed += 1
            except Exception as e:
                print(f"  ❌ Error for {movie.name}: {e}")
                failed += 1
        
        db.session.commit()
        print(f"\n✅ Done! Updated: {updated}, Failed: {failed}, Total: {len(movies)}")

if __name__ == "__main__":
    backfill()

import requests
from app import db, app, Movie, TMDB_API_KEY
import time

from sqlalchemy import text

def backfill():
    with app.app_context():
        # Step 1: Add column if it doesn't exist
        try:
            db.session.execute(text('ALTER TABLE movies ADD COLUMN release_date VARCHAR(20)'))
            db.session.commit()
            print("Added release_date column to movies table.", flush=True)
        except Exception as e:
            db.session.rollback()
            print("Error executing ALTER TABLE:", e, flush=True)

        if not TMDB_API_KEY:
            print("TMDB_API_KEY is not set. Cannot backfill.", flush=True)
            return

        # Step 2: Fetch and update movies
        movies = Movie.query.all()
        total = len(movies)
        print(f"Starting backfill for {total} movies...", flush=True)
        
        headers = {"accept": "application/json", "Authorization": f"Bearer {TMDB_API_KEY}"}
        
        updated = 0
        for i, m in enumerate(movies):
            if m.release_date:
                continue # Already has it
                
            try:
                url = f"https://api.themoviedb.org/3/movie/{m.tmdb_id}?language=en-US"
                resp = requests.get(url, headers=headers, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    rd = data.get('release_date')
                    if rd:
                        m.release_date = rd
                        updated += 1
            except Exception as e:
                print(f"Error fetching for TMDB ID {m.tmdb_id}: {e}")
                
            # Sleep slightly to avoid hitting rate limits too hard (50 requests/sec allowed usually, but safe)
            time.sleep(0.05)
            
            if (i+1) % 10 == 0:
                print(f"Processed {i+1}/{total} movies...", flush=True)
                db.session.commit()
                
        db.session.commit()
        print(f"Backfill complete! Updated {updated} movies with exact release dates.", flush=True)

if __name__ == '__main__':
    backfill()

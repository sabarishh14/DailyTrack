import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from app import db, app, Movie, TMDB_API_KEY

def fetch_release_date(tmdb_id):
    try:
        url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?language=en-US"
        headers = {"accept": "application/json", "Authorization": f"Bearer {TMDB_API_KEY}"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            return tmdb_id, resp.json().get('release_date')
    except Exception as e:
        pass
    return tmdb_id, None

def fast_backfill():
    with app.app_context():
        movies = Movie.query.filter(Movie.release_date.is_(None)).all()
        total = len(movies)
        print(f"Starting fast backfill for {total} movies without release_date...", flush=True)
        
        if total == 0:
            return
            
        updated = 0
        movie_dict = {m.tmdb_id: m for m in movies}
        
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(fetch_release_date, tmdb_id) for tmdb_id in movie_dict.keys()]
            
            for i, future in enumerate(as_completed(futures)):
                tmdb_id, rd = future.result()
                if rd:
                    movie_dict[tmdb_id].release_date = rd
                    updated += 1
                
                if (i + 1) % 50 == 0:
                    print(f"Processed {i+1}/{total} movies...", flush=True)
                    db.session.commit()
                    
        db.session.commit()
        print(f"Fast backfill complete! Updated {updated} movies.", flush=True)

if __name__ == '__main__':
    fast_backfill()

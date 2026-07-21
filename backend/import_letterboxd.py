import csv
import os
import time
import requests
from app import app, db, Movie, MovieDiaryLog
from datetime import datetime

# Configure your extracted folder path here
CSV_FOLDER = r"D:\Downloads\letterboxd-sabarishh14-2026-07-19-17-19-utc"

# Attempt to load from .env.local if dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

TMDB_API_KEY = os.getenv("TMDB_API_KEY")

def get_or_create_movie(name, year, tmdb_session, local_movies_by_name, local_movies_by_tmdb, default_status="WATCHED"):
    movie = local_movies_by_name.get(name)
    if movie:
        return movie, False
    
    # Need to fetch from TMDB
    time.sleep(0.2) # Rate limiting
    search_url = f"https://api.themoviedb.org/3/search/movie?query={requests.utils.quote(name)}"
    if year:
        search_url += f"&year={year}"
    
    tmdb_r = None
    try:
        for attempt in range(3):
            try:
                tmdb_r = tmdb_session.get(search_url, timeout=10).json()
                break
            except requests.exceptions.ConnectionError:
                time.sleep(1)
    except Exception as e:
        print(f"ERROR: {e}")
        return None, False
    
    if tmdb_r and tmdb_r.get("results"):
        first_result = tmdb_r["results"][0]
        tmdb_id = first_result["id"]
        
        # Check if another movie with this tmdb_id already exists
        if str(tmdb_id) in local_movies_by_tmdb:
            movie = local_movies_by_tmdb[str(tmdb_id)]
            local_movies_by_name[name] = movie # update cache
            return movie, False
        else:
            movie = Movie(
                tmdb_id=tmdb_id,
                name=name,
                poster_path=first_result.get("poster_path"),
                status=default_status
            )
            try:
                db.session.add(movie)
                db.session.commit() # Get ID immediately and persist
                local_movies_by_name[name] = movie
                local_movies_by_tmdb[str(tmdb_id)] = movie
                return movie, True
            except Exception as e:
                db.session.rollback()
                print(f"Failed to add movie {name}: {e}")
                # Maybe another process added it, or unique constraint violation
                movie = Movie.query.filter_by(tmdb_id=tmdb_id).first()
                if movie:
                    local_movies_by_name[name] = movie
                    local_movies_by_tmdb[str(tmdb_id)] = movie
                    return movie, False
                return None, False
    return None, False

def import_letterboxd():
    if not TMDB_API_KEY:
        print("ERROR: TMDB_API_KEY is not set in environment.")
        return

    print("Loading reviews...")
    reviews_map = {}
    reviews_path = os.path.join(CSV_FOLDER, "reviews.csv")
    if os.path.exists(reviews_path):
        with open(reviews_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                uri = row.get("Letterboxd URI")
                if uri:
                    reviews_map[uri] = row.get("Review", "").strip()
    
    print(f"Loaded {len(reviews_map)} reviews.")

    print("Loading likes...")
    likes_set = set()
    likes_path = os.path.join(CSV_FOLDER, "likes", "films.csv")
    if os.path.exists(likes_path):
        with open(likes_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("Name")
                year = row.get("Year")
                if name:
                    likes_set.add((name, year))
    print(f"Loaded {len(likes_set)} liked films.")
                    
    print("Loading diary logs...")
    diary_path = os.path.join(CSV_FOLDER, "diary.csv")
    logs = []
    if os.path.exists(diary_path):
        with open(diary_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                logs.append(row)
    print(f"Found {len(logs)} diary logs to process.")

    print("Loading watchlist...")
    watchlist_path = os.path.join(CSV_FOLDER, "watchlist.csv")
    watchlist = []
    if os.path.exists(watchlist_path):
        with open(watchlist_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                watchlist.append(row)
    print(f"Found {len(watchlist)} watchlist items.")

    tmdb_session = requests.Session()
    tmdb_session.headers.update({
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    })

    with app.app_context():
        # Build local movie caches
        all_movies = Movie.query.all()
        local_movies_by_name = {m.name: m for m in all_movies}
        local_movies_by_tmdb = {str(m.tmdb_id): m for m in all_movies if m.tmdb_id}
        
        added_movies = 0
        added_logs = 0

        # Process Diary
        print("\n--- Processing Diary ---")
        for i, row in enumerate(logs):
            name = row.get("Name")
            year = row.get("Year")
            uri = row.get("Letterboxd URI")
            
            watched_date_str = row.get("Watched Date") or row.get("Date") or datetime.today().strftime("%Y-%m-%d")
            rating_str = row.get("Rating")
            rating = float(rating_str) if rating_str else 0.0
            rewatch = row.get("Rewatch") == "Yes"
            tags = row.get("Tags", "")
            review = reviews_map.get(uri, "")
            liked = (name, year) in likes_set

            print(f"[{i+1}/{len(logs)}] Diary: {name} ({year})...", end=" ")

            movie, is_new = get_or_create_movie(name, year, tmdb_session, local_movies_by_name, local_movies_by_tmdb, default_status="WATCHED")
            if not movie:
                print("Not found on TMDB.")
                continue
                
            if is_new:
                added_movies += 1
                print("Added new movie.", end=" ")
            else:
                print("Movie exists.", end=" ")

            if movie.status != 'WATCHED':
                movie.status = 'WATCHED'
                try:
                    db.session.commit()
                except Exception:
                    db.session.rollback()

            log_date = datetime.strptime(watched_date_str, "%Y-%m-%d").date()
            existing_log = MovieDiaryLog.query.filter_by(movie_id=movie.id, date=log_date).first()
            
            if not existing_log:
                new_log = MovieDiaryLog(
                    movie_id=movie.id,
                    date=log_date,
                    rating=rating,
                    review=review,
                    liked=liked,
                    rewatch=rewatch,
                    tags=tags
                )
                try:
                    db.session.add(new_log)
                    db.session.commit()
                    added_logs += 1
                    print("Added log.")
                except Exception as e:
                    db.session.rollback()
                    print(f"Failed to add log: {e}")
            else:
                updated = False
                if review and not existing_log.review:
                    existing_log.review = review
                    updated = True
                if rating and not existing_log.rating:
                    existing_log.rating = rating
                    updated = True
                if tags and not existing_log.tags:
                    existing_log.tags = tags
                    updated = True
                if liked and not existing_log.liked:
                    existing_log.liked = True
                    updated = True
                
                if updated:
                    try:
                        db.session.commit()
                        added_logs += 1
                        print("Updated existing log.")
                    except Exception as e:
                        db.session.rollback()
                        print(f"Failed to update log: {e}")
                else:
                    print("Log exists.")

        # Process Watchlist
        print("\n--- Processing Watchlist ---")
        for i, row in enumerate(watchlist):
            name = row.get("Name")
            year = row.get("Year")
            
            print(f"[{i+1}/{len(watchlist)}] Watchlist: {name} ({year})...", end=" ")
            
            movie, is_new = get_or_create_movie(name, year, tmdb_session, local_movies_by_name, local_movies_by_tmdb, default_status="TO WATCH")
            
            if not movie:
                print("Not found on TMDB.")
                continue
            
            if is_new:
                added_movies += 1
                print("Added to Watchlist.")
            else:
                print("Already exists.")

        print(f"\n✅ Import Complete! Added {added_movies} movies and {added_logs} logs.")

if __name__ == "__main__":
    import_letterboxd()

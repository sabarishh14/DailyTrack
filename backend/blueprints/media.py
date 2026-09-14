from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta, timezone
import os
import re
import json
import pytz
import requests
from extensions import (
    db, require_api_key, require_admin,
    SHEETS_URL, JWT_SECRET, ALLOWED_EMAILS, ADMIN_USER, ADMIN_PASS,
    KITE_API_KEY, KITE_API_SECRET, TMDB_API_KEY,
)
from models import *

from sqlalchemy.orm import joinedload
import xml.etree.ElementTree as ET
from flask import stream_with_context, Response

media_bp = Blueprint("media", __name__)

# ==========================================
# 📺 TV TRACKER ENDPOINTS
# ==========================================

@media_bp.route('/api/media/search', methods=['GET'])
@require_api_key
def search_media():
    query = request.args.get('q', '')
    if not query:
        return jsonify({"success": False, "message": "Query required"}), 400
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
    media_type = request.args.get('type', '')
    
    # Extract year from query like "Prince 2022" -> query="Prince", year=2022
    search_year = None
    search_query = query
    year_match = re.search(r'\b(19\d{2}|20\d{2})\s*$', query.strip())
    if year_match:
        search_year = year_match.group(1)
        search_query = query[:year_match.start()].strip()
        if not search_query:
            search_query = query  # fallback if query was just a year
            search_year = None
    
    year_param = f"&year={search_year}" if search_year and media_type == 'movie' else ""
    year_param_tv = f"&first_air_date_year={search_year}" if search_year and media_type == 'tv' else ""
    
    if media_type == 'movie':
        url = f"https://api.themoviedb.org/3/search/movie?query={search_query}&include_adult=false&language=en-US&page=1{year_param}"
    elif media_type == 'tv':
        url = f"https://api.themoviedb.org/3/search/tv?query={search_query}&include_adult=false&language=en-US&page=1{year_param_tv}"
    else:
        url = f"https://api.themoviedb.org/3/search/multi?query={query}&include_adult=false&language=en-US&page=1"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
        "Connection": "close"
    }
    
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=3, backoff_factor=0.5))
    session.mount('https://', adapter)
    
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return jsonify({"success": True, "data": response.json()})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@media_bp.route('/api/tv/details/<int:tmdb_id>', methods=['GET'])
@require_api_key
def get_tv_details(tmdb_id):
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
        
    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?append_to_response=aggregate_credits,videos&language=en-US"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
        "Connection": "close"
    }
    
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=3, backoff_factor=0.5))
    session.mount('https://', adapter)
    
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return jsonify({"success": True, "data": response.json()})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@media_bp.route('/api/tv/shows', methods=['GET'])
@require_api_key
def get_tv_shows():
    shows = TvShow.query.order_by(TvShow.added_on.desc()).all()
    result = []
    for s in shows:
        result.append({
            "id": s.id,
            "tmdb_id": s.tmdb_id,
            "name": s.name,
            "poster_path": s.poster_path,
            "status": s.status,
            "watched_episodes": s.watched_episodes,
            "added_on": s.added_on.isoformat() if s.added_on else None
        })
    return jsonify({"success": True, "shows": result})

@media_bp.route('/api/tv/shows', methods=['POST'])
@require_api_key
def add_tv_show():
    data = request.json
    tmdb_id = data.get('tmdb_id')
    name = data.get('name')
    poster_path = data.get('poster_path')
    status = data.get('status', 'TO WATCH')
    
    if not tmdb_id or not name:
        return jsonify({"success": False, "message": "tmdb_id and name are required"}), 400
        
    existing = TvShow.query.filter_by(tmdb_id=tmdb_id).first()
    if existing:
        if existing.status == 'NONE' and status != 'NONE':
            existing.status = status
            db.session.commit()
            
        return jsonify({
            "success": True, 
            "message": "Show already tracked", 
            "id": existing.id,
            "show": {
                "id": existing.id, "tmdb_id": existing.tmdb_id, "name": existing.name, 
                "poster_path": existing.poster_path, "status": existing.status, "type": "tv"
            }
        })
        
    new_show = TvShow(
        tmdb_id=tmdb_id,
        name=name,
        poster_path=poster_path,
        status=status,
        watched_episodes={}
    )
    db.session.add(new_show)
    db.session.flush() # to get new_show.id
    
    if status != 'NONE':
        activity = TvActivityLog(tv_show_id=new_show.id, action=f"Added to library as {status}")
        db.session.add(activity)
    
    db.session.commit()
    
    return jsonify({
        "success": True, 
        "message": "Show added", 
        "id": new_show.id,
        "show": {
            "id": new_show.id, "tmdb_id": new_show.tmdb_id, "name": new_show.name, 
            "poster_path": new_show.poster_path, "status": new_show.status, "type": "tv"
        }
    })

@media_bp.route('/api/tv/shows/<int:show_id>', methods=['PUT', 'DELETE'])
@require_api_key
def update_tv_show(show_id):
    show = TvShow.query.get(show_id)
    if not show:
        return jsonify({"success": False, "message": "Show not found"}), 404
        
    if request.method == 'DELETE':
        db.session.delete(show)
        db.session.commit()
        return jsonify({"success": True, "message": "Show deleted"})
        
    # PUT
    data = request.json
    if 'status' in data and show.status != data['status']:
        show.status = data['status']
        activity = TvActivityLog(tv_show_id=show.id, action=f"Status changed to {data['status']}")
        db.session.add(activity)
        
    if 'watched_episodes' in data:
        show.watched_episodes = data['watched_episodes']
        
    db.session.commit()
    return jsonify({"success": True, "message": "Show updated"})

@media_bp.route('/api/tv/diary', methods=['GET'])
@require_api_key
def get_tv_diary():
    logs = TvDiaryLog.query.order_by(TvDiaryLog.date.desc(), TvDiaryLog.created_at.desc()).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "show_id": log.tv_show_id,
            "show_name": log.tv_show.name if log.tv_show else "Unknown",
            "poster_path": log.tv_show.poster_path if log.tv_show else None,
            "season_number": log.season_number,
            "episode_number": log.episode_number,
            "date": log.date.isoformat(),
            "rating": log.rating,
            "review": log.review,
            "liked": log.liked,
            "rewatch": log.rewatch,
            "tags": log.tags,
            "created_at": log.created_at.isoformat()
        })
    return jsonify({"success": True, "logs": result})

@media_bp.route('/api/tv/diary', methods=['POST'])
@require_api_key
def add_tv_diary():
    data = request.json
    tv_show_id = data.get('tv_show_id')
    
    if not tv_show_id:
        return jsonify({"success": False, "message": "tv_show_id is required"}), 400
        
    log_date_str = data.get('date')
    log_date = datetime.strptime(log_date_str, "%Y-%m-%d").date() if log_date_str else date.today()
        
    new_log = TvDiaryLog(
        tv_show_id=tv_show_id,
        season_number=data.get('season_number'),
        episode_number=data.get('episode_number'),
        date=log_date,
        rating=data.get('rating'),
        review=data.get('review'),
        liked=data.get('liked', False),
        rewatch=data.get('rewatch', False),
        tags=data.get('tags')
    )
    
    db.session.add(new_log)
    db.session.commit()
    return jsonify({"success": True, "message": "Logged successfully", "id": new_log.id})

@media_bp.route('/api/tv/diary', methods=['PUT'])
@require_api_key
def update_tv_diary():
    data = request.json
    log_ids = data.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
    
    update_data = {}
    if 'rating' in data: update_data['rating'] = data['rating'] or None
    if 'review' in data: update_data['review'] = data['review'] or None
    if 'liked' in data: update_data['liked'] = data['liked']
    if 'rewatch' in data: update_data['rewatch'] = data['rewatch']
    if 'tags' in data: update_data['tags'] = data['tags'] or None
    
    TvDiaryLog.query.filter(TvDiaryLog.id.in_(log_ids)).update(update_data, synchronize_session=False)
    db.session.commit()
    return jsonify({"success": True})

@media_bp.route('/api/tv/diary', methods=['DELETE'])
@require_api_key
def delete_tv_diary():
    log_ids = request.json.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
        
    TvDiaryLog.query.filter(TvDiaryLog.id.in_(log_ids)).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"success": True})

# ==========================================
# 🎬 MOVIE TRACKER ENDPOINTS
# ==========================================

@media_bp.route('/api/movies/search', methods=['GET'])
@require_api_key
def search_tmdb_movies():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"success": True, "results": []})
        
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
        
    search_url = f"https://api.themoviedb.org/3/search/movie?query={requests.utils.quote(query)}"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0"
    }
    
    try:
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=2, backoff_factor=0.5))
        session.mount('https://', adapter)
        r = session.get(search_url, headers=headers, timeout=5)
        if r.status_code == 200:
            data = r.json()
            results = data.get('results', [])[:5] # Top 5
            return jsonify({
                "success": True, 
                "results": [{
                    "tmdb_id": m.get('id'),
                    "title": m.get('title'),
                    "year": m.get('release_date', '')[:4] if m.get('release_date') else '',
                    "poster_path": m.get('poster_path')
                } for m in results]
            })
        return jsonify({"success": False, "message": "TMDB API Error"}), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@media_bp.route('/api/movies/tags', methods=['GET'])
@require_api_key
def get_movie_tags():
    try:
        logs = MovieDiaryLog.query.filter(MovieDiaryLog.tags.isnot(None)).all()
        tags_set = set()
        for log in logs:
            if log.tags:
                for tag in log.tags.split(','):
                    t = tag.strip()
                    if t:
                        tags_set.add(t)
        return jsonify({"success": True, "tags": sorted(list(tags_set))})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# --- MOVIE STATS CACHE ---
_stats_cache = {}
def invalidate_stats_cache():
    """Call this whenever diary logs change (add/delete/RSS sync)."""
    global _stats_cache
    _stats_cache.clear()

@media_bp.route('/api/movies/stats', methods=['GET'])
@require_api_key
def get_movie_stats():
    from sqlalchemy.sql import func, extract
    
    year_param = request.args.get('year', str(datetime.now().year))
    
    # Check cache
    if year_param in _stats_cache:
        return jsonify(_stats_cache[year_param])
    
    try:
        # Get available years
        year_rows = db.session.query(
            extract('year', MovieDiaryLog.date).label('yr')
        ).distinct().all()
        available_years = sorted([int(r.yr) for r in year_rows if r.yr], reverse=True)
        
        # Base query
        query = db.session.query(MovieDiaryLog).options(joinedload(MovieDiaryLog.movie))
        
        if year_param != 'all':
            try:
                yr = int(year_param)
                query = query.filter(extract('year', MovieDiaryLog.date) == yr)
            except ValueError:
                pass
        
        logs = query.all()
        
        # --- Compute stats ---
        total_entries = len(logs)
        total_reviews = sum(1 for l in logs if l.review and l.review.strip())
        total_likes = sum(1 for l in logs if l.liked)
        
        # Total hours from runtime
        total_minutes = 0
        for l in logs:
            if l.movie and l.movie.runtime:
                total_minutes += l.movie.runtime
        total_hours = round(total_minutes / 60, 1)
        
        # Unique films
        unique_movie_ids = set(l.movie_id for l in logs)
        films_logged = len(unique_movie_ids)
        
        # Averages
        if year_param == 'all' and available_years:
            num_months = max(1, (datetime.now().year - min(available_years)) * 12 + datetime.now().month)
            num_weeks = max(1, num_months * 4.33)
        elif year_param != 'all':
            try:
                yr = int(year_param)
                if yr == datetime.now().year:
                    from datetime import date as dt_date
                    jan1 = dt_date(yr, 1, 1)
                    today = dt_date.today()
                    days_elapsed = max(1, (today - jan1).days)
                    num_months = max(1, days_elapsed / 30.44)
                    num_weeks = max(1, days_elapsed / 7)
                else:
                    num_months = 12
                    num_weeks = 52
            except ValueError:
                num_months = 12
                num_weeks = 52
        else:
            num_months = 12
            num_weeks = 52
        
        avg_per_month = round(films_logged / num_months, 1)
        avg_per_week = round(films_logged / num_weeks, 1)
        
        # Highest rated films (top 14, unique movies, highest rating first)
        # To include rewatches that might not have been rated this year, we get the all-time max rating for all movies logged this year.
        unique_movie_ids = list(set(l.movie_id for l in logs))
        movie_best_rating = {}
        
        if unique_movie_ids:
            all_time_ratings = db.session.query(
                MovieDiaryLog.movie_id, func.max(MovieDiaryLog.rating)
            ).filter(
                MovieDiaryLog.movie_id.in_(unique_movie_ids),
                MovieDiaryLog.rating > 0
            ).group_by(MovieDiaryLog.movie_id).all()
            
            best_rating_map = {r[0]: r[1] for r in all_time_ratings if r[1]}
            
            for l in logs:
                mid = l.movie_id
                if mid in best_rating_map and mid not in movie_best_rating:
                    movie_best_rating[mid] = {
                        'movie_id': mid,
                        'tmdb_id': l.movie.tmdb_id if l.movie else None,
                        'name': l.movie.name if l.movie else 'Unknown',
                        'poster_path': l.movie.poster_path if l.movie else None,
                        'rating': best_rating_map[mid],
                        'release_year': l.movie.release_year if l.movie else None
                    }
        
        all_rated = sorted(movie_best_rating.values(), key=lambda x: -x['rating'])
        highest_rated = all_rated[:20]
        highest_rated_current = []
        highest_rated_older = []
        
        if year_param != 'all':
            yr = int(year_param)
            current = [m for m in all_rated if m['release_year'] == yr][:20]
            older = [m for m in all_rated if m['release_year'] is not None and m['release_year'] < yr][:20]
            # Fallback if release_year is missing: treat as older
            older += [m for m in all_rated if m['release_year'] is None][:20 - len(older)]
            highest_rated_current = sorted(current, key=lambda x: -x['rating'])
            highest_rated_older = sorted(older, key=lambda x: -x['rating'])
        else:
            highest_rated_current = highest_rated
            highest_rated_older = []
        
        # Films by week (ISO week number -> count)
        by_week = [0] * 54  # weeks 0-53
        for l in logs:
            if l.date:
                iso_yr, iso_wk, _ = l.date.isocalendar()
                wk = iso_wk
                
                # If early Jan falls in previous year's week 52/53, bundle into week 1
                if l.date.month == 1 and wk >= 52:
                    wk = 1
                # If late Dec falls in next year's week 1, bundle into week 53
                elif l.date.month == 12 and wk == 1:
                    wk = 53
                    
                if 1 <= wk <= 53:
                    by_week[wk] += 1
                    
        # Bundle week 53 into 52 so chart has exactly 52 bars
        by_week[52] += by_week[53]
        by_week = by_week[1:53]  # weeks 1-52
        
        # By day of week (Monday=0 ... Sunday=6)
        by_day = [0] * 7
        for l in logs:
            if l.date:
                dow = l.date.weekday()  # Monday=0, Sunday=6
                by_day[dow] += 1
        
        # By month (Jan=0 ... Dec=11)
        by_month = [0] * 12
        for l in logs:
            if l.date:
                by_month[l.date.month - 1] += 1
        
        # Films by year (for all-time bar chart and year context)
        films_by_year_dict = {}
        for l in logs:
            if l.date:
                y = l.date.year
                if y not in films_by_year_dict:
                    films_by_year_dict[y] = set()
                films_by_year_dict[y].add(l.movie_id)
        films_by_year = [{"year": y, "count": len(ids)} for y, ids in sorted(films_by_year_dict.items())]
        
        # Most rewatched (movies with the most diary entries, minimum 2)
        rewatch_count = {}
        for l in logs:
            if l.movie_id:
                rewatch_count[l.movie_id] = rewatch_count.get(l.movie_id, 0) + 1
        rewatched_ids = [(mid, cnt) for mid, cnt in rewatch_count.items() if cnt >= 2]
        rewatched_ids.sort(key=lambda x: -x[1])
        most_rewatched = []
        for mid, cnt in rewatched_ids[:10]:
            m = Movie.query.get(mid)
            if m:
                most_rewatched.append({
                    "movie_id": m.id, "tmdb_id": m.tmdb_id, "name": m.name,
                    "poster_path": m.poster_path, "watch_count": cnt
                })
        
        # Longest streak (consecutive days with at least one film logged)
        log_dates = sorted(set(l.date for l in logs if l.date))
        longest_streak_len = 0
        longest_streak_start = None
        longest_streak_end = None
        
        if log_dates:
            current_streak = 1
            current_start = log_dates[0]
            current_end = log_dates[0]
            
            longest_streak_len = 1
            longest_streak_start = log_dates[0]
            longest_streak_end = log_dates[0]
            
            for i in range(1, len(log_dates)):
                if (log_dates[i] - log_dates[i - 1]).days == 1:
                    current_streak += 1
                    current_end = log_dates[i]
                else:
                    if current_streak > longest_streak_len:
                        longest_streak_len = current_streak
                        longest_streak_start = current_start
                        longest_streak_end = current_end
                    current_streak = 1
                    current_start = log_dates[i]
                    current_end = log_dates[i]
                    
            if current_streak > longest_streak_len:
                longest_streak_len = current_streak
                longest_streak_start = current_start
                longest_streak_end = current_end
                
        longest_streak = {
            "length": longest_streak_len,
            "start": longest_streak_start.strftime("%b %d, %Y") if longest_streak_start else None,
            "end": longest_streak_end.strftime("%b %d, %Y") if longest_streak_end else None
        }
        
        # Rating distribution (0.5, 1, 1.5, ..., 5)
        rating_dist = {}
        for l in logs:
            if l.rating and l.rating > 0:
                r_key = str(l.rating)
                rating_dist[r_key] = rating_dist.get(r_key, 0) + 1
        
        # --- Theatre Stats ---
        theatre_movies = []
        supplementary_tags = {}
        total_visits = 0
        
        for l in logs:
            if not l.tags:
                continue
            tags = [t.strip().lower() for t in l.tags.split(',') if t.strip()]
            is_theatre = any(t == 'overall-theatres' or t.startswith('theatres-') for t in tags)
            
            if is_theatre:
                total_visits += 1
                movie_tags = [t for t in tags if t != 'overall-theatres' and not t.startswith('theatres-')]
                for mt in movie_tags:
                    supplementary_tags[mt] = supplementary_tags.get(mt, 0) + 1
                
                if l.movie:
                    theatre_movies.append({
                        'log_id': l.id,
                        'movie_id': l.movie_id,
                        'tmdb_id': l.movie.tmdb_id,
                        'name': l.movie.name,
                        'poster_path': l.movie.poster_path,
                        'rating': l.rating,
                        'release_year': l.movie.release_year,
                        'tags': movie_tags
                    })
                    
        theatre_stats = {
            "total_visits": total_visits,
            "supplementary_tags": supplementary_tags,
            "movies": theatre_movies
        }
        
        # --- Extremes ---
        longest_film = None
        shortest_film = None
        oldest_film = None
        newest_film = None
        
        for l in logs:
            if not l.movie:
                continue
                
            m = l.movie
            m_year = m.release_year
            if not m_year and m.release_date and len(m.release_date) >= 4:
                try:
                    m_year = int(m.release_date[:4])
                except ValueError:
                    pass

            movie_obj = {
                "id": m.id, "tmdb_id": m.tmdb_id, "name": m.name, 
                "poster_path": m.poster_path, "runtime": m.runtime, 
                "release_year": m_year, "release_date": m.release_date
            }
            
            if m.runtime:
                if not longest_film or m.runtime > longest_film["runtime"]:
                    longest_film = movie_obj
                if not shortest_film or m.runtime < shortest_film["runtime"]:
                    shortest_film = movie_obj
            
            if m_year:
                if not oldest_film or m_year < oldest_film["release_year"]:
                    oldest_film = movie_obj
                elif m_year == oldest_film["release_year"]:
                    if m.release_date and oldest_film["release_date"] and m.release_date < oldest_film["release_date"]:
                        oldest_film = movie_obj
                    elif (not m.release_date or not oldest_film["release_date"]) and m.tmdb_id < oldest_film["tmdb_id"]:
                        oldest_film = movie_obj
                        
                if not newest_film or m_year > newest_film["release_year"]:
                    newest_film = movie_obj
                elif m_year == newest_film["release_year"]:
                    if m.release_date and newest_film["release_date"] and m.release_date > newest_film["release_date"]:
                        newest_film = movie_obj
                    elif (not m.release_date or not newest_film["release_date"]) and m.tmdb_id > newest_film["tmdb_id"]:
                        newest_film = movie_obj
        
        extremes = {
            "longest": longest_film,
            "shortest": shortest_film,
            "oldest": oldest_film,
            "newest": newest_film
        }
        
        result = {
            "success": True,
            "year": year_param,
            "available_years": available_years,
            "total_entries": total_entries,
            "total_reviews": total_reviews,
            "total_likes": total_likes,
            "total_hours": total_hours,
            "films_logged": films_logged,
            "avg_per_month": avg_per_month,
            "avg_per_week": avg_per_week,
            "highest_rated": highest_rated,
            "highest_rated_current": highest_rated_current,
            "highest_rated_older": highest_rated_older,
            "by_week": by_week,
            "by_month": by_month,
            "by_day": by_day,
            "rating_distribution": rating_dist,
            "theatre_stats": theatre_stats,
            "extremes": extremes,
            "films_by_year": films_by_year,
            "most_rewatched": most_rewatched,
            "longest_streak": longest_streak
        }
        
        # Cache the result
        _stats_cache[year_param] = result
        
        return jsonify(result)
    except Exception as e:
        print(f"Stats error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500

@media_bp.route('/api/movies/details/<int:tmdb_id>', methods=['GET'])
@require_api_key
def get_movie_details(tmdb_id):
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
        
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?append_to_response=credits,videos&language=en-US"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
        "Connection": "close"
    }
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=3, backoff_factor=0.5))
    session.mount('https://', adapter)
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        if 'credits' in data:
            data['aggregate_credits'] = data['credits']
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@media_bp.route('/api/movies', methods=['GET'])
@require_api_key
def get_movies():
    movies = Movie.query.filter(Movie.status != 'NONE').order_by(Movie.added_on.desc()).all()
    result = []
    for m in movies:
        result.append({
            "id": m.id,
            "tmdb_id": m.tmdb_id,
            "name": m.name,
            "poster_path": m.poster_path,
            "status": m.status,
            "added_on": m.added_on.isoformat() if m.added_on else None
        })
    return jsonify({"success": True, "movies": result})

@media_bp.route('/api/movies', methods=['POST'])
@require_api_key
def add_movie():
    data = request.json
    tmdb_id = data.get('tmdb_id')
    name = data.get('name')
    poster_path = data.get('poster_path')
    status = data.get('status', 'TO WATCH')
    if not tmdb_id or not name:
        return jsonify({"success": False, "message": "tmdb_id and name are required"}), 400
    
    existing = Movie.query.filter_by(tmdb_id=tmdb_id).first()
    if existing:
        if existing.status == 'NONE' and status != 'NONE':
            existing.status = status
            db.session.commit()
            
        return jsonify({
            "success": True, 
            "message": "Movie already tracked", 
            "id": existing.id,
            "show": {
                "id": existing.id, "tmdb_id": existing.tmdb_id, "name": existing.name, 
                "poster_path": existing.poster_path, "status": existing.status, "type": "movie"
            }
        })

    rel_year = None
    try:
        if 'year' in data and data['year']:
            rel_year = int(str(data['year'])[:4])
    except:
        pass
        
    director = None
    top_cast = None
    runtime = None
    
    if TMDB_API_KEY:
        try:
            url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?append_to_response=credits&language=en-US"
            headers = {"accept": "application/json", "Authorization": f"Bearer {TMDB_API_KEY}"}
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                d = resp.json()
                runtime = d.get('runtime')
                rel_date = d.get('release_date')
                if rel_date:
                    if not rel_year:
                        rel_year = int(rel_date[:4])
                credits = d.get('credits', {})
                crew = credits.get('crew', [])
                director = next((c['name'] for c in crew if c['job'] == 'Director'), None)
                cast = credits.get('cast', [])
                top_cast = [{"id": c["id"], "name": c["name"], "character": c["character"], "profile_path": c.get("profile_path")} for c in cast[:3]]
        except Exception as e:
            print("Error fetching TMDB credits on add:", e)
            
    new_movie = Movie(tmdb_id=tmdb_id, name=name, poster_path=poster_path, status=status, release_year=rel_year, release_date=rel_date if 'rel_date' in locals() else None, director=director, top_cast=top_cast, runtime=runtime)

    db.session.add(new_movie)
    db.session.commit()
    return jsonify({
        "success": True, 
        "message": "Movie added", 
        "id": new_movie.id,
        "show": {
            "id": new_movie.id, "tmdb_id": new_movie.tmdb_id, "name": new_movie.name, 
            "poster_path": new_movie.poster_path, "status": new_movie.status, "type": "movie"
        }
    })

@media_bp.route('/api/movies/<int:movie_id>', methods=['PUT', 'DELETE'])
@require_api_key
def update_movie(movie_id):
    movie = Movie.query.get(movie_id)
    if not movie:
        return jsonify({"success": False, "message": "Movie not found"}), 404
    if request.method == 'DELETE':
        db.session.delete(movie)
        db.session.commit()
        return jsonify({"success": True, "message": "Movie deleted"})
    data = request.json
    if 'status' in data and movie.status != data['status']:
        movie.status = data['status']
    db.session.commit()
    return jsonify({"success": True, "message": "Movie updated"})

@media_bp.route('/api/movies/<int:movie_id>/rematch', methods=['POST'])
@require_api_key
def rematch_movie(movie_id):
    movie = Movie.query.get(movie_id)
    if not movie:
        return jsonify({"success": False, "message": "Movie not found"}), 404
        
    data = request.json
    tmdb_id = data.get('tmdb_id')
    name = data.get('name')
    poster_path = data.get('poster_path')
    
    if not tmdb_id or not name:
        return jsonify({"success": False, "message": "tmdb_id and name required"}), 400
        
    existing = Movie.query.filter_by(tmdb_id=tmdb_id).first()
    if existing and existing.id != movie_id:
        return jsonify({"success": False, "message": "This TMDB movie is already in your library."}), 400

    movie.tmdb_id = tmdb_id
    movie.name = name
    movie.poster_path = poster_path
    
    rel_year = None
    try:
        if 'year' in data and data['year']:
            rel_year = int(str(data['year'])[:4])
    except:
        pass
    movie.release_year = rel_year

    if TMDB_API_KEY:
        try:
            url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?append_to_response=credits&language=en-US"
            headers = {"accept": "application/json", "Authorization": f"Bearer {TMDB_API_KEY}"}
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                d = resp.json()
                movie.runtime = d.get('runtime')
                if d.get('release_date'):
                    movie.release_date = d['release_date']
                    if not rel_year:
                        movie.release_year = int(d['release_date'][:4])
                credits = d.get('credits', {})
                crew = credits.get('crew', [])
                movie.director = next((c['name'] for c in crew if c['job'] == 'Director'), None)
                cast = credits.get('cast', [])
                movie.top_cast = [{"id": c["id"], "name": c["name"], "character": c["character"], "profile_path": c.get("profile_path")} for c in cast[:3]]
        except Exception as e:
            print("Error fetching TMDB credits on rematch:", e)
            
    db.session.commit()
    invalidate_stats_cache()
    
    return jsonify({
        "success": True, 
        "message": "Movie re-matched", 
        "show": {
            "id": movie.id, "tmdb_id": movie.tmdb_id, "name": movie.name, 
            "poster_path": movie.poster_path, "status": movie.status, "type": "movie"
        }
    })

@media_bp.route('/api/movies/diary', methods=['GET'])
@require_api_key
def get_movie_diary():
    logs = MovieDiaryLog.query.order_by(MovieDiaryLog.date.desc(), MovieDiaryLog.created_at.desc()).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "show_id": log.movie_id,
            "tmdb_id": log.movie.tmdb_id if log.movie else None,
            "show_name": log.movie.name if log.movie else "Unknown",
            "poster_path": log.movie.poster_path if log.movie else None,
            "date": log.date.isoformat(),
            "rating": log.rating,
            "review": log.review,
            "liked": log.liked,
            "rewatch": log.rewatch,
            "tags": log.tags,
            "created_at": log.created_at.isoformat()
        })
    return jsonify({"success": True, "logs": result})

@media_bp.route('/api/movies/diary', methods=['POST'])
@require_api_key
def add_movie_diary():
    data = request.json
    movie_id = data.get('movie_id') or data.get('tv_show_id') # keeping tv_show_id property name for frontend compatibility
    if not movie_id:
        return jsonify({"success": False, "message": "movie_id is required"}), 400
    log_date_str = data.get('date')
    log_date = datetime.strptime(log_date_str, "%Y-%m-%d").date() if log_date_str else date.today()
    new_log = MovieDiaryLog(
        movie_id=movie_id,
        date=log_date,
        rating=data.get('rating'),
        review=data.get('review'),
        liked=data.get('liked', False),
        rewatch=data.get('rewatch', False),
        tags=data.get('tags')
    )
    db.session.add(new_log)
    db.session.commit()
    invalidate_stats_cache()
    return jsonify({"success": True, "message": "Logged successfully", "id": new_log.id})

@media_bp.route('/api/movies/diary', methods=['PUT'])
@require_api_key
def update_movie_diary():
    data = request.json
    log_ids = data.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
    update_data = {}
    if 'rating' in data: update_data['rating'] = data['rating'] or None
    if 'review' in data: update_data['review'] = data['review'] or None
    if 'liked' in data: update_data['liked'] = data['liked']
    if 'rewatch' in data: update_data['rewatch'] = data['rewatch']
    if 'tags' in data: update_data['tags'] = data['tags'] or None
    MovieDiaryLog.query.filter(MovieDiaryLog.id.in_(log_ids)).update(update_data, synchronize_session=False)
    db.session.commit()
    invalidate_stats_cache()
    return jsonify({"success": True})

@media_bp.route('/api/movies/diary', methods=['DELETE'])
@require_api_key
def delete_movie_diary():
    log_ids = request.json.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
    MovieDiaryLog.query.filter(MovieDiaryLog.id.in_(log_ids)).delete(synchronize_session=False)
    db.session.commit()
    invalidate_stats_cache()
    return jsonify({"success": True})

from flask import stream_with_context, Response
def _perform_rss_sync_generator(username, fast_mode=False):
    import json
    yield json.dumps({"status": "Fetching RSS feed..."}) + "\n"
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Connection': 'close'}
        r = requests.get(f'https://letterboxd.com/{username}/rss/', headers=headers, timeout=10)
        if r.status_code != 200:
            yield json.dumps({"success": False, "message": f"Failed to fetch RSS: {r.status_code}"}) + "\n"
            return
        
        root = ET.fromstring(r.content)
        items = root.findall('.//item')
        if fast_mode:
            items = items[:5] # Only check the 5 most recent logs in fast mode
        
        yield json.dumps({"status": f"Found {len(items)} logs. Processing..."}) + "\n"
        
        added_movies = 0
        added_logs = 0

        # Namespaces in Letterboxd RSS
        ns = {'letterboxd': 'https://letterboxd.com'}
    
        tmdb_session = requests.Session()
        tmdb_session.headers.update({
            "accept": "application/json",
            "Authorization": f"Bearer {TMDB_API_KEY}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        })

        for i, item in enumerate(items):
            title = item.find('letterboxd:filmTitle', ns)
            year = item.find('letterboxd:filmYear', ns)
            if title is None:
                continue
            
            film_title = title.text
            film_year = year.text if year is not None else ""
        
            if i % 5 == 0:
                yield json.dumps({"status": f"Processing {i+1}/{len(items)}: {film_title}..."}) + "\n"
        
            watched_date_node = item.find('letterboxd:watchedDate', ns)
            watched_date_str = watched_date_node.text if watched_date_node is not None else ""
            if not watched_date_str:
                pub_date = item.find('pubDate')
                if pub_date is not None:
                    # Very simple fallback for pubdate string parsing
                    watched_date_str = datetime.strptime(pub_date.text[5:16], "%d %b %Y").strftime("%Y-%m-%d")
                else:
                    watched_date_str = date.today().strftime("%Y-%m-%d")
                
            rating_node = item.find('letterboxd:memberRating', ns)
            rating = float(rating_node.text) if rating_node is not None else 0
        
            rewatch_node = item.find('letterboxd:rewatch', ns)
            rewatch = True if rewatch_node is not None and rewatch_node.text == 'Yes' else False
        
            liked_node = item.find('letterboxd:memberLike', ns)
            liked = True if liked_node is not None and liked_node.text == 'Yes' else False

            import re
            description_node = item.find('description')
            review_text = ""
            if description_node is not None and description_node.text:
                review_html = description_node.text
                review_text = re.sub(r'<[^>]+>', '', review_html).strip()

            # Check if this movie exists in our local DB by name (basic check first)
            movie = Movie.query.filter_by(name=film_title).first()
            if not movie:
                # Query TMDB
                import time
                time.sleep(0.1) # Small delay
            
                search_url = f"https://api.themoviedb.org/3/search/movie?query={requests.utils.quote(film_title)}"
                if film_year:
                    search_url += f"&year={film_year}"
            
                try:
                    max_attempts = 1 if fast_mode else 3
                    timeout_secs = 3 if fast_mode else 10
                    for attempt in range(max_attempts):
                        try:
                            tmdb_r = tmdb_session.get(search_url, timeout=timeout_secs).json()
                            break
                        except requests.exceptions.ConnectionError:
                            if attempt == max_attempts - 1:
                                print(f"Skipping {film_title} due to ConnectionError after {max_attempts} attempts")
                                tmdb_r = None
                            else:
                                time.sleep(1) # wait longer before retry
                except Exception as e:
                    print(f"Error fetching {film_title}: {e}")
                    continue
                
                if tmdb_r and tmdb_r.get('results'):
                    first_result = tmdb_r['results'][0]
                    tmdb_id = first_result['id']
                    movie = Movie.query.filter_by(tmdb_id=tmdb_id).first()
                    if not movie:
                        # Fetch runtime and release_year from TMDB movie details
                        runtime_val = None
                        rel_year_val = None
                        try:
                            detail_r = tmdb_session.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}", timeout=timeout_secs).json()
                            runtime_val = detail_r.get('runtime')
                            rel_date = detail_r.get('release_date')
                            if rel_date and len(rel_date) >= 4:
                                rel_year_val = int(rel_date[:4])
                        except Exception:
                            pass
                        
                        # Fallback to first_result for release year if details failed
                        if not rel_year_val and first_result.get('release_date'):
                            try:
                                rel_year_val = int(first_result.get('release_date')[:4])
                            except:
                                pass

                        movie = Movie(
                            tmdb_id=tmdb_id,
                            name=first_result.get('title') or film_title,
                            poster_path=first_result.get('poster_path'),
                            status='WATCHED',
                            runtime=runtime_val,
                            release_year=rel_year_val
                        )
                        db.session.add(movie)
                        db.session.flush() # Get ID
                    elif not movie.runtime:
                        # Backfill runtime if missing
                        try:
                            detail_r = tmdb_session.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}", timeout=timeout_secs).json()
                            movie.runtime = detail_r.get('runtime')
                        except Exception:
                            pass
                    added_movies += 1
                else:
                    continue # Couldn't find in TMDB
        
            # Ensure movie status is WATCHED if we are importing a log
            if movie.status != 'WATCHED':
                movie.status = 'WATCHED'
                db.session.commit()
            
            # Create or update diary log
            log_date = datetime.strptime(watched_date_str, "%Y-%m-%d").date()
            existing_log = MovieDiaryLog.query.filter_by(movie_id=movie.id, date=log_date).first()
            if not existing_log:
                log = MovieDiaryLog(
                    movie_id=movie.id,
                    date=log_date,
                    rating=rating,
                    rewatch=rewatch,
                    liked=liked,
                    review=review_text
                )
                db.session.add(log)
                added_logs += 1
            else:
                # If log exists but review is empty and we have a review now, update it
                updated = False
                if review_text and not existing_log.review:
                    existing_log.review = review_text
                    updated = True
                if rating and not existing_log.rating:
                    existing_log.rating = rating
                    updated = True
                if liked and not existing_log.liked:
                    existing_log.liked = True
                    updated = True
            
                if updated:
                    added_logs += 1 # Count as a modified log for user feedback

        db.session.commit()
        invalidate_stats_cache()
        yield json.dumps({"status": "complete", "success": True, "added_movies": added_movies, "added_logs": added_logs}) + "\n"

    except Exception as e:
        import traceback
        traceback.print_exc()
        print("RSS SYNC ERROR", repr(e))
        yield json.dumps({"success": False, "message": str(e)}) + "\n"

@media_bp.route('/api/movies/sync/rss', methods=['POST'])
@require_api_key
def sync_letterboxd_rss():
    data = request.json
    username = data.get('username')
    if not username:
        return jsonify({"success": False, "message": "Username required"}), 400
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB API Key missing on server"}), 500

    return Response(stream_with_context(_perform_rss_sync_generator(username)), mimetype='application/x-ndjson')

@media_bp.route('/api/media/library', methods=['GET'])
@require_api_key
def get_media_library():
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    media_type = request.args.get('type', 'all')
    status_filter = request.args.get('status', 'all')
    
    combined = []
    
    if media_type in ['all', 'movie']:
        from sqlalchemy.sql import func
        movies = db.session.query(Movie, func.max(MovieDiaryLog.date).label('latest_log')).outerjoin(MovieDiaryLog, Movie.id == MovieDiaryLog.movie_id).group_by(Movie.id).all()
        for m, latest_log in movies:
            if m.status == 'NONE':
                continue
            if status_filter != 'all' and m.status != status_filter:
                continue
            
            sort_date = m.added_on
            if latest_log:
                sort_date = datetime.combine(latest_log, datetime.min.time())
                
            combined.append({
                "id": m.id,
                "tmdb_id": m.tmdb_id,
                "name": m.name,
                "poster_path": m.poster_path,
                "status": m.status,
                "added_on": sort_date,
                "type": "movie"
            })
            
    if media_type in ['all', 'tv']:
        from sqlalchemy.sql import func
        shows = db.session.query(TvShow, func.max(TvDiaryLog.date).label('latest_log')).outerjoin(TvDiaryLog, TvShow.id == TvDiaryLog.tv_show_id).group_by(TvShow.id).all()
        for s, latest_log in shows:
            if s.status == 'NONE':
                continue
            if status_filter != 'all' and s.status != status_filter:
                continue
            
            sort_date = s.added_on
            if latest_log:
                sort_date = datetime.combine(latest_log, datetime.min.time())

            combined.append({
                "id": s.id,
                "tmdb_id": s.tmdb_id,
                "name": s.name,
                "poster_path": s.poster_path,
                "status": s.status,
                "added_on": sort_date,
                "type": "tv"
            })
            
    # Sort by added_on DESC, then by id DESC
    combined.sort(key=lambda x: (x['added_on'] or datetime.min, x['id']), reverse=True)
    
    # Now convert datetime to string after sorting
    for item in combined:
        if item['added_on']:
            item['added_on'] = item['added_on'].isoformat()
    
    total_count = len(combined)
    paginated = combined[offset:offset+limit]
    
    return jsonify({
        "success": True, 
        "shows": paginated, 
        "total_count": total_count,
        "hasMore": (offset + limit) < total_count
    })

@media_bp.route('/api/media/diary', methods=['GET'])
@require_api_key
def get_media_diary():
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    media_type = request.args.get('type', 'all')
    
    show_id = request.args.get('show_id', type=int)
    
    combined = []
    
    if media_type in ['all', 'movie']:
        query = MovieDiaryLog.query.options(joinedload(MovieDiaryLog.movie))
        if show_id and media_type == 'movie':
            query = query.filter_by(movie_id=show_id)
        logs = query.all()
        for log in logs:
            combined.append({
                "id": log.id,
                "show_id": log.movie_id,
                "tmdb_id": log.movie.tmdb_id if log.movie else None,
                "show_name": log.movie.name if log.movie else "Unknown",
                "poster_path": log.movie.poster_path if log.movie else None,
                "date": log.date,
                "rating": log.rating,
                "review": log.review,
                "liked": log.liked,
                "rewatch": log.rewatch,
                "tags": log.tags,
                "created_at": log.created_at,
                "type": "movie"
            })
            
    if media_type in ['all', 'tv']:
        query = TvDiaryLog.query.options(joinedload(TvDiaryLog.tv_show))
        if show_id and media_type == 'tv':
            query = query.filter_by(tv_show_id=show_id)
        logs = query.all()
        for log in logs:
            combined.append({
                "id": log.id,
                "show_id": log.tv_show_id,
                "tmdb_id": log.tv_show.tmdb_id if log.tv_show else None,
                "show_name": log.tv_show.name if log.tv_show else "Unknown",
                "poster_path": log.tv_show.poster_path if log.tv_show else None,
                "season_number": log.season_number,
                "episode_number": log.episode_number,
                "date": log.date,
                "rating": log.rating,
                "review": log.review,
                "liked": log.liked,
                "rewatch": log.rewatch,
                "tags": log.tags,
                "created_at": log.created_at,
                "type": "tv"
            })
            
    # Sort by date DESC, then created_at DESC
    combined.sort(key=lambda x: (x['date'] or date.min, x['created_at'] or datetime.min), reverse=True)
    
    for item in combined:
        if item['date']:
            item['date'] = item['date'].isoformat() if hasattr(item['date'], 'isoformat') else str(item['date'])
        if item['created_at']:
            item['created_at'] = item['created_at'].isoformat() if hasattr(item['created_at'], 'isoformat') else str(item['created_at'])
    
    total_count = len(combined)
    paginated = combined[offset:offset+limit]
    
    return jsonify({
        "success": True, 
        "logs": paginated, 
        "total_count": total_count,
        "hasMore": (offset + limit) < total_count
    })

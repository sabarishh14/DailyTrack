import os
import sys

from backend.app import app, db, TvShow, Movie

def migrate_statuses():
    with app.app_context():
        # Update TV Shows
        tv_shows = TvShow.query.all()
        for show in tv_shows:
            if show.status == "Plan to Watch":
                show.status = "TO WATCH"
            elif show.status == "Completed":
                show.status = "WATCHED"
            elif show.status == "Watching":
                show.status = "WATCHING"
            elif show.status == "Dropped":
                show.status = "DROPPED"
                
        # Update Movies
        movies = Movie.query.all()
        for movie in movies:
            if movie.status == "Plan to Watch":
                movie.status = "TO WATCH"
            elif movie.status == "Completed" or movie.status == "Watched":
                movie.status = "WATCHED"
                
        db.session.commit()
        print("Status migration complete.")

if __name__ == "__main__":
    migrate_statuses()

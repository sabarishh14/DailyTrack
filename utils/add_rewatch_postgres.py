from backend.app import app, db
from sqlalchemy import text

def add_rewatch_column():
    with app.app_context():
        try:
            # Postgres: ADD COLUMN IF NOT EXISTS is not standard until PG 11, but we can try it or just catch exception
            db.session.execute(text("ALTER TABLE tv_diary_logs ADD COLUMN rewatch BOOLEAN DEFAULT FALSE;"))
            db.session.commit()
            print("Added rewatch to tv_diary_logs")
        except Exception as e:
            db.session.rollback()
            print("tv_diary_logs skip:", e)
            
        try:
            db.session.execute(text("ALTER TABLE movie_diary_logs ADD COLUMN rewatch BOOLEAN DEFAULT FALSE;"))
            db.session.commit()
            print("Added rewatch to movie_diary_logs")
        except Exception as e:
            db.session.rollback()
            print("movie_diary_logs skip:", e)

if __name__ == '__main__':
    add_rewatch_column()

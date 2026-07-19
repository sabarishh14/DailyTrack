import sqlite3
import os

DB_PATH = 'd:\\SB\\DEV\\LifeTrack\\tracker\\backend\\instance\\finance.db'

def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check and add for tv_diary_logs
        cursor.execute("PRAGMA table_info(tv_diary_logs)")
        columns = [info[1] for info in cursor.fetchall()]
        if 'rewatch' not in columns:
            print("Adding 'rewatch' column to tv_diary_logs...")
            cursor.execute("ALTER TABLE tv_diary_logs ADD COLUMN rewatch BOOLEAN DEFAULT 0")
        else:
            print("'rewatch' already exists in tv_diary_logs.")

        # Check and add for movie_diary_logs
        cursor.execute("PRAGMA table_info(movie_diary_logs)")
        columns = [info[1] for info in cursor.fetchall()]
        if 'rewatch' not in columns:
            print("Adding 'rewatch' column to movie_diary_logs...")
            cursor.execute("ALTER TABLE movie_diary_logs ADD COLUMN rewatch BOOLEAN DEFAULT 0")
        else:
            print("'rewatch' already exists in movie_diary_logs.")

        conn.commit()
        print("Migration complete!")
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    run_migration()

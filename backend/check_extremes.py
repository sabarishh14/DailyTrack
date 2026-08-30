from app import db, app, MovieDiaryLog
import json

app.app_context().push()
logs = MovieDiaryLog.query.all()
oldest = None
newest = None

for l in logs:
    m = l.movie
    if not m: continue
    y = m.release_year
    if y:
        if not oldest or y < oldest: oldest = y
        if not newest or y > newest: newest = y

print(f'Oldest: {oldest}, Newest: {newest}')

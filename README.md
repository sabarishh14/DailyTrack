## DailyTrack - Track Daily 😡

A full-stack personal finance and lifestyle tracking system featuring real-time bank balance monitoring, transaction management with Google Sheets sync, investment portfolio tracking via Zerodha Kite API, and physical activity logging — secured with Firebase Google Authentication and a JWT-based backend API.

Sharing with other people (roles, per-page view/edit levels, category limits): see [ACCESS_CONTROL.md](ACCESS_CONTROL.md).

git reset --hard HEAD~1
git push origin main --force

python -c "from app import app, db; app.app_context().push(); db.create_all()"

command
git checkout main
git reset --hard a91f26de2402d424c764c2e279567a601c9c3b8e
git push origin main --force
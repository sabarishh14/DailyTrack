from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta, timezone
import os
import re
import json
import pytz
import requests
from extensions import (
    db,
    SHEETS_URL, JWT_SECRET, ALLOWED_EMAILS, ADMIN_USER, ADMIN_PASS,
    KITE_API_KEY, KITE_API_SECRET, TMDB_API_KEY,
)
from models import *
from access import require_api_key, require_admin, require_access, current_access


core_bp = Blueprint("core", __name__)

# ==========================================
# HEALTH CHECK & DEPLOYMENT INFO
# ==========================================
# Capture the exact time the container starts
ist_timezone = pytz.timezone('Asia/Kolkata')
BOOT_TIME = datetime.now(ist_timezone).strftime('%B %d, %Y at %I:%M %p IST')

def get_git_commit():
    try:
        # Try to read the commit hash directly from the hidden .git folder
        if os.path.exists('.git/HEAD'):
            with open('.git/HEAD', 'r') as f:
                ref = f.read().strip().split(' ')[-1]
            with open(f'.git/{ref}', 'r') as f:
                return f.read().strip()[:7]
    except Exception:
        pass
    return "latest"

COMMIT_HASH = get_git_commit()

@core_bp.route('/', methods=['GET'])
def health_check():
    return jsonify({
        "app": "DailyTrack API",
        "status": "🟢 Online",
        "version": "2.1.0",
        "commit": COMMIT_HASH,
        "deployed_at": BOOT_TIME
    })

@core_bp.route("/test-db")
def test_db():
    return {"status": "Database connected successfully"}

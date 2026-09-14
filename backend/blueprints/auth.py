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


auth_bp = Blueprint("auth", __name__)

@auth_bp.route('/api/auth/firebase-login', methods=['POST'])
def firebase_login():
    try:
        id_token = request.json.get('id_token')
        if not id_token:
            return jsonify({"success": False, "message": "No token provided"}), 400

        # Verify the Firebase token with clock skew tolerance
        decoded = firebase_auth.verify_id_token(id_token, clock_skew_seconds=60)
        email = decoded.get('email')
        
        # 🚀 DEV MODE: Check if this is the master admin
        is_admin = (email == "sbsabarish14@gmail.com")

        # Check against database AND the fallback .env array
        db_email = AllowedEmail.query.filter_by(email=email).first()
        is_allowed = is_admin or (db_email is not None) or (email in ALLOWED_EMAILS)

        if not is_allowed:
            return jsonify({"success": False, "message": f"Access denied for {email}"}), 403

        # Issue our own JWT (Now including the email in the payload)
        token = jwt.encode({
            "sub": email,
            "email": email, 
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(days=30)
        }, JWT_SECRET, algorithm="HS256")

        return jsonify({"success": True, "token": token, "isAdmin": is_admin})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 401


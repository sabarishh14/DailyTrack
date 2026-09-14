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


admin_bp = Blueprint("admin", __name__)

# ==========================================
# 🚀 SECRET DEVELOPER MENU ENDPOINTS
# ==========================================
@admin_bp.route('/api/admin/emails', methods=['GET'])
@require_admin
def get_allowed_emails():
    emails = AllowedEmail.query.all()
    return jsonify({"success": True, "emails": [e.email for e in emails]})

@admin_bp.route('/api/admin/emails', methods=['POST'])
@require_admin
def add_allowed_email():
    new_email = request.json.get('email', '').strip()
    if not new_email:
        return jsonify({"success": False, "message": "Email is required"}), 400
    
    if not AllowedEmail.query.filter_by(email=new_email).first():
        db.session.add(AllowedEmail(email=new_email))
        db.session.commit()
    return jsonify({"success": True, "message": f"Added {new_email}"})

@admin_bp.route('/api/admin/emails/<path:email>', methods=['DELETE'])
@require_admin
def remove_allowed_email(email):
    record = AllowedEmail.query.filter_by(email=email).first()
    if record:
        db.session.delete(record)
        db.session.commit()
    return jsonify({"success": True})


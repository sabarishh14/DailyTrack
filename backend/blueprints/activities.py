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


activities_bp = Blueprint("activities", __name__)

@activities_bp.route('/api/physical', methods=['GET'])
@require_api_key  # <-- Add this line to protect the route
def get_physical():
    records = PhysicalActivity.query.order_by(PhysicalActivity.date.desc()).all()

    result = [
        {
            "id": r.id,
            "date": r.date.strftime("%Y-%m-%d"),
            "gym": r.gym,
            "badminton": r.badminton,
            "table_tennis": r.table_tennis,
            "cricket": r.cricket,
            "others": r.others,
            "description": r.description
        }
        for r in records
    ]

    return jsonify(result)
@activities_bp.route('/api/physical', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def add_physical():
    data = request.json
    date_obj = datetime.strptime(data['date'], '%Y-%m-%d')

    record = PhysicalActivity.query.filter_by(date=date_obj).first()

    if record:
        record.gym = data.get('gym', False)
        record.badminton = data.get('badminton', False)
        record.table_tennis = data.get('table_tennis', False)
        record.cricket = data.get('cricket', False)
        record.others = data.get('others', False)
        record.description = data.get('description', '')
    else:
        record = PhysicalActivity(
            id=int(datetime.now().timestamp() * 1000),
            date=date_obj,
            gym=data.get('gym', False),
            badminton=data.get('badminton', False),
            table_tennis=data.get('table_tennis', False),
            cricket=data.get('cricket', False),
            others=data.get('others', False),
            description=data.get('description', '')
        )
        db.session.add(record)

    db.session.commit()
    return jsonify({"success": True})

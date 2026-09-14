"""Shared config, secrets and cross-cutting helpers used by every blueprint."""
from flask import request, jsonify
from functools import wraps
from dotenv import load_dotenv
import os
import jwt
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Load environment variables from .env.local file (or .env as fallback)
load_dotenv('.env.local')
load_dotenv('.env')

# Initialize Firebase Admin
firebase_cred = credentials.Certificate(os.getenv("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json"))
firebase_admin.initialize_app(firebase_cred)

ALLOWED_EMAILS = [e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",")]

# Load environment variables with validation
API_SECRET_KEY = os.getenv("API_SECRET_KEY")
if not API_SECRET_KEY:
    raise ValueError("API_SECRET_KEY environment variable is required for production")

FLASK_ENV = os.getenv("FLASK_ENV", "development")
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
SHEETS_URL = os.getenv("SHEETS_URL")
if not SHEETS_URL:
    raise ValueError("SHEETS_URL environment variable is required")

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS")
if not ADMIN_PASS:
    raise ValueError("ADMIN_PASS environment variable is required")

# Kite API credentials
KITE_API_KEY = os.getenv("KITE_API_KEY")
KITE_API_SECRET = os.getenv("KITE_API_SECRET")

# TMDB API Key
TMDB_API_KEY = os.getenv("TMDB_API_KEY")


def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 1. ALWAYS bypass auth for CORS preflight OPTIONS requests
        if request.method == 'OPTIONS':
            return '', 200
            
        # 2. Check API key (existing method)
        api_key = request.headers.get('X-API-KEY')
        if api_key and api_key == API_SECRET_KEY:
            return f(*args, **kwargs)
        
        # 3. Check JWT token (new method)
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                jwt.decode(token, JWT_SECRET, algorithms=["HS256"], leeway=60)
                return f(*args, **kwargs)
            except jwt.ExpiredSignatureError:
                return jsonify({"success": False, "message": "Token expired"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"success": False, "message": "Invalid token"}), 401

        return jsonify({"success": False, "message": "Unauthorized"}), 401
    return decorated_function

# ADD THIS NEW DECORATOR BELOW:
def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return '', 200
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], leeway=60)
                if payload.get("email") != "sbsabarish14@gmail.com":
                    return jsonify({"success": False, "message": "Admin access required"}), 403
                return f(*args, **kwargs)
            except Exception:
                pass
        return jsonify({"success": False, "message": "Unauthorized"}), 401
    return decorated_function

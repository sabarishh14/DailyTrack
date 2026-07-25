from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import os
from datetime import datetime, date
import json
import re
import pytz
from sqlalchemy.orm import joinedload
import requests
import hashlib
import csv 
import io     
from functools import wraps
from dotenv import load_dotenv
import jwt
from datetime import datetime, timedelta, timezone
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from pyxirr import xirr
import socket
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

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
                jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
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
                payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                if payload.get("email") != "sbsabarish14@gmail.com":
                    return jsonify({"success": False, "message": "Admin access required"}), 403
                return f(*args, **kwargs)
            except Exception:
                pass
        return jsonify({"success": False, "message": "Unauthorized"}), 401
    return decorated_function

app = Flask(__name__)

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"success": False, "message": "Internal server error"}), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({"success": False, "message": "Not found"}), 404

# Configure CORS with specific origins only
CORS(app, resources={
    r"/api/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-API-KEY", "Authorization"],
        "supports_credentials": False,
        "max_age": 3600
    }
})

# Add security headers
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'self'"
    return response

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL

# --- IPv6 Blackhole Fix ---
# Force IPv4 connection to prevent 21s timeout hangs when Windows prefers broken IPv6 routes
connect_args = {
    "sslmode": "require",
    "connect_timeout": 30   # Gives Neon 30 seconds to wake up from cold start
}
try:
    parsed_url = urlparse(DATABASE_URL)
    if parsed_url.hostname:
        ipv4 = socket.gethostbyname(parsed_url.hostname)
        connect_args["hostaddr"] = ipv4
except Exception as e:
    print(f"Warning: Could not resolve IPv4 for DB host: {e}")

app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_pre_ping": True,      # Checks if the DB connection is alive before using it
    "pool_recycle": 300,        # Reconnects every 5 minutes to prevent stale idle connections
    "connect_args": connect_args
}

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Account(db.Model):
    __tablename__ = "accounts"
    account = db.Column(db.String(50), primary_key=True)
    balance = db.Column(db.Float, default=0)
    real_balance = db.Column(db.Float, nullable=True) # <-- ADD THIS LINE
    balance_tracked = db.Column(db.Boolean, default=True)

class Transaction(db.Model):
    __tablename__ = "transactions"
    __table_args__ = (
    db.UniqueConstraint('date', 'account', 'amount', 'heading', name='unique_tx'),
)
    id = db.Column(db.BigInteger, primary_key=True)
    account = db.Column(db.String(50), db.ForeignKey("accounts.account"))
    date = db.Column(db.Date, nullable=False, index=True) # <-- Added index for faster sorting
    month = db.Column(db.Date, nullable=False, index=True) # <-- Added index for faster filtering
    type = db.Column(db.String(10), nullable=False)
    heading = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    amount = db.Column(db.Float, nullable=False)
    synced = db.Column(db.Boolean, default=False)
    exclude_analytics = db.Column(db.Boolean, default=False)

class Split(db.Model):
    __tablename__ = "splits"
    id = db.Column(db.BigInteger, primary_key=True)
    transaction_id = db.Column(db.BigInteger, db.ForeignKey('transactions.id'), unique=True, nullable=False)
    total_amount = db.Column(db.Float, nullable=False)
    members = db.Column(db.JSON, nullable=False, default=list)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class RecurringTask(db.Model):
    __tablename__ = "recurring_tasks"
    id = db.Column(db.BigInteger, primary_key=True)
    asset_name = db.Column(db.String(100)) # e.g., 'EPF'
    amount_to_add = db.Column(db.Float)    # e.g., 2210
    interval_value = db.Column(db.Integer, default=1)
    interval_unit = db.Column(db.String(10), default='months') # 'days', 'months', 'years'
    next_run_date = db.Column(db.Date)
    is_active = db.Column(db.Boolean, default=True)

class EquityHolding(db.Model):
    __tablename__ = "equity_holdings"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    symbol = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    average_price = db.Column(db.Float, nullable=False)
    ltp = db.Column(db.Float, nullable=False)
    invested_value = db.Column(db.Float, nullable=False)
    current_value = db.Column(db.Float, nullable=False)

class PhysicalActivity(db.Model):
    __tablename__ = "physical_activity"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, unique=True, nullable=False)
    gym = db.Column(db.Boolean, default=False)
    badminton = db.Column(db.Boolean, default=False)
    table_tennis = db.Column(db.Boolean, default=False)
    cricket = db.Column(db.Boolean, default=False)
    others = db.Column(db.Boolean, default=False)
    description = db.Column(db.String(255))

class MutualFundHolding(db.Model):
    __tablename__ = "mf_holdings"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    symbol = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    average_price = db.Column(db.Float, nullable=False)
    nav = db.Column(db.Float, nullable=False)
    invested_value = db.Column(db.Float, nullable=False)
    current_value = db.Column(db.Float, nullable=False)

class ManualAsset(db.Model):
    __tablename__ = "manual_assets"

    id = db.Column(db.BigInteger, primary_key=True)
    category = db.Column(db.String(50), nullable=False) # FD, EPF, PPF, NPS, SGB, RSU, RealEstate, Cash
    name = db.Column(db.String(100), nullable=False)
    invested_value = db.Column(db.Float, default=0.0)
    current_value = db.Column(db.Float, default=0.0)
    interest_rate = db.Column(db.Float, nullable=True)
    start_date = db.Column(db.Date, nullable=True) # <-- ADD THIS LINE
    maturity_date = db.Column(db.Date, nullable=True)
    last_updated = db.Column(db.Date, nullable=False)

class PortfolioSnapshot(db.Model):
    __tablename__ = "portfolio_snapshots"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    
    total_equity_inv = db.Column(db.Float, default=0.0)
    total_equity_curr = db.Column(db.Float, default=0.0)
    
    total_mf_inv = db.Column(db.Float, default=0.0)
    total_mf_curr = db.Column(db.Float, default=0.0)
    
    total_fixed_income_inv = db.Column(db.Float, default=0.0)
    total_fixed_income_curr = db.Column(db.Float, default=0.0)
    
    total_provident_inv = db.Column(db.Float, default=0.0)
    total_provident_curr = db.Column(db.Float, default=0.0)
    
    total_gold_inv = db.Column(db.Float, default=0.0)
    total_gold_curr = db.Column(db.Float, default=0.0)
    
    grand_total_inv = db.Column(db.Float, default=0.0)
    grand_total_curr = db.Column(db.Float, default=0.0)
    
    synced = db.Column(db.Boolean, default=False)

class SyncLog(db.Model):
    __tablename__ = "sync_log"
    id = db.Column(db.BigInteger, primary_key=True)
    last_sync = db.Column(db.DateTime, nullable=False)

# ADD THIS NEW MODEL BELOW:
class AllowedEmail(db.Model):
    __tablename__ = "allowed_emails"
    email = db.Column(db.String(120), primary_key=True)
    added_on = db.Column(db.DateTime, default=datetime.utcnow)

class TvShow(db.Model):
    __tablename__ = "tv_shows"
    id = db.Column(db.BigInteger, primary_key=True)
    tmdb_id = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    poster_path = db.Column(db.String(255))
    status = db.Column(db.String(50), default="TO WATCH") # WATCHING, WATCHED, TO WATCH, DROPPED
    watched_episodes = db.Column(db.JSON, default=dict) # e.g. {"1": [1, 2, 3]} mapping season string to array of episode numbers
    added_on = db.Column(db.DateTime, default=datetime.utcnow)

class TvDiaryLog(db.Model):
    __tablename__ = "tv_diary_logs"
    id = db.Column(db.BigInteger, primary_key=True)
    tv_show_id = db.Column(db.BigInteger, db.ForeignKey("tv_shows.id"), nullable=False)
    season_number = db.Column(db.Integer, nullable=True) # Null if logging the whole show
    episode_number = db.Column(db.Integer, nullable=True) # Null if logging the whole show
    date = db.Column(db.Date, nullable=False, default=date.today)
    rating = db.Column(db.Float, nullable=True) # 1-5 stars
    review = db.Column(db.Text, nullable=True)
    liked = db.Column(db.Boolean, default=False)
    rewatch = db.Column(db.Boolean, default=False)
    tags = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to TvShow
    tv_show = db.relationship('TvShow', backref=db.backref('diary_logs', lazy=True, cascade="all, delete-orphan"))

class TvActivityLog(db.Model):
    __tablename__ = "tv_activity_logs"
    id = db.Column(db.BigInteger, primary_key=True)
    tv_show_id = db.Column(db.BigInteger, db.ForeignKey("tv_shows.id"), nullable=False)
    action = db.Column(db.String(255), nullable=False) # e.g. "Added to library", "Status changed to WATCHED"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    tv_show = db.relationship('TvShow', backref=db.backref('activity_logs', lazy=True, cascade="all, delete-orphan"))
class Movie(db.Model):
    __tablename__ = "movies"
    id = db.Column(db.BigInteger, primary_key=True)
    tmdb_id = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    poster_path = db.Column(db.String(255))
    status = db.Column(db.String(50), default="TO WATCH") # WATCHED, TO WATCH
    runtime = db.Column(db.Integer, nullable=True)  # Runtime in minutes, fetched from TMDB
    release_year = db.Column(db.Integer, nullable=True) # Release year of the movie
    added_on = db.Column(db.DateTime, default=datetime.utcnow)

class MovieDiaryLog(db.Model):
    __tablename__ = "movie_diary_logs"
    id = db.Column(db.BigInteger, primary_key=True)
    movie_id = db.Column(db.BigInteger, db.ForeignKey("movies.id"), nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today)
    rating = db.Column(db.Float, nullable=True) # 1-5 stars
    review = db.Column(db.Text, nullable=True)
    liked = db.Column(db.Boolean, default=False)
    rewatch = db.Column(db.Boolean, default=False)
    tags = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to Movie
    movie = db.relationship('Movie', backref=db.backref('diary_logs', lazy=True, cascade="all, delete-orphan"))

def get_transactions_for_sync():
    # Fetch only transactions where synced=False
    new_txs = Transaction.query.filter_by(synced=False).all()

    result = []
    for tx in new_txs:
        result.append({
            "id": tx.id,
            "date": tx.date.strftime("%Y-%m-%d"),
            "month": tx.month.strftime("%B %Y"),
            "type": tx.type.capitalize(),
            "heading": tx.heading,
            "description": tx.description or "",
            "amount": float(tx.amount),
            "account": tx.account
        })
    return result

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

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({
        "app": "DailyTrack API",
        "status": "🟢 Online",
        "version": "2.1.0",
        "commit": COMMIT_HASH,
        "deployed_at": BOOT_TIME
    })

@app.route("/test-db")
def test_db():
    return {"status": "Database connected successfully"}

@app.route('/api/sync/check-transactions', methods=['GET'])
@require_api_key  # <-- Add this line to protect the route
def check_tx_sync():
    try:
        # Just count how many are waiting
        count = Transaction.query.filter_by(synced=False).count()
        return jsonify({"success": True, "count": count})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
    
@app.route('/api/sync/db-to-sheets', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def sync_db_to_sheets():
    try:
        # 1. Fetch only transactions that haven't been synced yet
        unsynced = Transaction.query.filter_by(synced=False).order_by(Transaction.date.asc(), Transaction.id.asc()).all()
        
        if not unsynced:
            return jsonify({"success": True, "message": "No new transactions to sync to Sheets."})

        # 2. Format the payload for your updated Apps Script
        payload = {
            "type": "transactions",
            "data": [
                {
                    "id": str(t.id),
                    "date": t.date.strftime("%Y-%m-%d"),
                    "month": t.month.strftime("%Y-%m-%d"),
                    "type": t.type,
                    "heading": t.heading,
                    "description": t.description,
                    "amount": float(t.amount),
                    "account": t.account
                } for t in unsynced
            ]
        }

        print(f"📡 Sending {len(unsynced)} transactions to Google Sheets...")
        response = requests.post(SHEETS_URL, json=payload, timeout=60)
        
        if response.status_code == 200:
            # 3. Mark as synced so we don't send duplicates next time
            for t in unsynced:
                t.synced = True
            db.session.commit()
            return jsonify({"success": True, "message": f"Successfully synced {len(unsynced)} transactions!"})
        else:
            return jsonify({"success": False, "message": f"Sheets error: {response.text}"})

    except Exception as e:
        print(f"❌ Sheets Sync Error: {str(e)}")
        return jsonify({"success": False, "message": str(e)})
        
# ---- ACCOUNTS ----
@app.route('/api/accounts', methods=['GET'])
@require_api_key  
def get_accounts():
    accounts = Account.query.all()
    result = [
        {
            "account": acc.account,
            "balance": acc.balance,
            "real_balance": acc.real_balance, # <-- ADD THIS LINE
            "balance_tracked": acc.balance_tracked
        }
        for acc in accounts
    ]
    return jsonify(result)

@app.route('/api/accounts', methods=['PUT'])
@require_api_key  # <-- Add this line to protect the route
def update_account():
    data = request.json

    account = Account.query.filter_by(account=data['account']).first()

    if not account:
        return jsonify({"success": False, "message": "Account not found"}), 404

    account.balance = float(data['balance'])

    db.session.commit()

    return jsonify({'success': True})

@app.route('/api/transactions/categories', methods=['GET'])
@require_api_key
def get_categories():
    try:
        # SQL DISTINCT is O(1) payload size and extremely fast on the DB level
        cats = db.session.query(Transaction.heading).distinct().all()
        return jsonify({"success": True, "categories": sorted([c[0] for c in cats if c[0]])})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# ---- TRANSACTIONS ----
@app.route('/api/transactions', methods=['GET'])
@require_api_key  # <-- Add this line to protect the route
def get_transactions():
    # Pagination and filtering parameters
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)
    month_filter = request.args.get('month')  # Format: YYYY-MM
    year_filter = request.args.get('year', type=int)
    
    # Limit max results to prevent abuse
    limit = min(limit, 500)
    
    # Sort by date first, then by the timestamp ID (newest added at the top)
    query = Transaction.query.order_by(Transaction.date.desc(), Transaction.id.desc())
    
    # Apply month filter if provided
    if month_filter:
        try:
            month_obj = datetime.strptime(month_filter, '%Y-%m')
            month_obj = month_obj.replace(day=1)
            query = query.filter(Transaction.month == month_obj)
        except:
            pass
    
    # Total count before pagination (for frontend to know if more data exists)
    total_count = query.count()
    
    transactions = query.limit(limit).offset(offset).all()
    
    # Fetch splits for this page of transactions
    tx_ids = [tx.id for tx in transactions]
    splits = Split.query.filter(Split.transaction_id.in_(tx_ids)).all()
    split_map = {s.transaction_id: {"id": s.id, "total_amount": s.total_amount, "members": s.members} for s in splits}

    result = [
        {
            "id": tx.id,
            "account": tx.account,
            "date": tx.date.strftime("%Y-%m-%d"),
            "month": tx.month.strftime("%Y-%m-%d"),
            "type": tx.type,
            "heading": tx.heading,
            "description": tx.description,
            "amount": tx.amount,
            "exclude_analytics": getattr(tx, 'exclude_analytics', False),
            "split": split_map.get(tx.id)
        }
        for tx in transactions
    ]

    return jsonify({
        "transactions": result,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "hasMore": (offset + limit) < total_count
    })

@app.route('/api/transactions', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def add_transaction():
    try:
        data = request.json
        transactions_data = data if isinstance(data, list) else [data]
        added_count = 0
        
        # --- NEW: Perform a preemptive RSS sync if any transaction is a Cinema transaction
        # so that recent Letterboxd logs are in the DB before we append tags to them.
        lbx_username = next((item.get('lbx_username') for item in transactions_data if item.get('heading', '').strip().lower() == 'cinema' and item.get('lbx_username')), None)
        if lbx_username:
            try:
                # Silently consume the generator to execute the sync in fast mode
                for _ in _perform_rss_sync_generator(lbx_username, fast_mode=True):
                    pass
            except Exception as e:
                print(f"Failed background RSS sync: {e}")

        for item in transactions_data:
            date_obj = datetime.strptime(item['date'], '%Y-%m-%d')
            month_obj = date_obj.replace(day=1)
            
            amount = float(item['amount'])  
            tx_type = item['type']
            acc_name = item['account']
            
            new_tx = Transaction(
                id=int(datetime.now().timestamp() * 1000) + added_count,
                account=acc_name,
                date=date_obj,
                month=month_obj,
                type=tx_type,
                heading=item['heading'],
                description=item.get('description', ''),
                amount=amount,
                exclude_analytics=item.get('exclude_analytics', False)
            )
            db.session.add(new_tx)
            db.session.flush() # Force insert of transaction to satisfy foreign key constraints
            
            if item.get('split'):
                split_data = item['split']
                new_split = Split(
                    transaction_id=new_tx.id,
                    total_amount=split_data['total_amount'],
                    members=split_data['members']
                )
                db.session.add(new_split)
            
            # --- NEW: Automatically Update Account Balance ---
            account_record = Account.query.filter_by(account=acc_name).first()
            
            # Only update if the account exists and has balance tracking enabled (except CC-PINNACLE 6360)
            if account_record and account_record.balance_tracked and acc_name != "CC-PINNACLE 6360":
                if tx_type == 'Credit':
                    account_record.balance += amount
                elif tx_type in ['Debit', 'Savings']:
                    account_record.balance -= amount
                    
            # --- NEW: Link Movie Tags ---
            movie_link_errors = []
            movie_link_successes = []
            if item.get('heading', '').strip().lower() == 'cinema' and item.get('movie_tags'):
                movie_data = item.get('movie_data')
                
                if movie_data and movie_data.get('tmdb_id'):
                    tmdb_id = movie_data['tmdb_id']
                    movie_title = movie_data['title']
                    
                    movie = Movie.query.filter_by(tmdb_id=tmdb_id).first()
                    if not movie:
                        # Try to fetch runtime from TMDB
                        runtime_val = None
                        try:
                            tmdb_headers = {"accept": "application/json", "Authorization": f"Bearer {TMDB_API_KEY}"}
                            detail_r = requests.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}", headers=tmdb_headers, timeout=5).json()
                            runtime_val = detail_r.get('runtime')
                            rel_date = detail_r.get('release_date')
                            if rel_date and len(rel_date) >= 4:
                                release_year_val = int(rel_date[:4])
                        except Exception:
                            pass
                        
                        movie = Movie(
                            tmdb_id=tmdb_id,
                            name=movie_title,
                            poster_path=movie_data.get('poster_path'),
                            status='WATCHED',
                            runtime=runtime_val,
                            release_year=release_year_val if 'release_year_val' in locals() else None
                        )
                        db.session.add(movie)
                        db.session.flush()
                        
                    # Ensure we have a diary log
                    log_date = date_obj.date()
                    existing_log = MovieDiaryLog.query.filter_by(movie_id=movie.id, date=log_date).first()
                    
                    # Add automatic tags
                    current_year = datetime.now().year
                    auto_tags = ["overall-theatres", f"theatres-{current_year}"]
                    
                    # Convert incoming comma string or array to array
                    inc_tags = item.get('movie_tags')
                    if isinstance(inc_tags, str):
                        new_tags = [t.strip() for t in inc_tags.split(',') if t.strip()]
                    elif isinstance(inc_tags, list):
                        new_tags = [t.strip() for t in inc_tags if t.strip()]
                    else:
                        new_tags = []
                        
                    all_new_tags = auto_tags + new_tags
                    
                    if not existing_log:
                        existing_log = MovieDiaryLog(
                            movie_id=movie.id,
                            date=log_date,
                            tags=", ".join(all_new_tags)
                        )
                        db.session.add(existing_log)
                    else:
                        if existing_log.tags:
                            existing_tags = [t.strip() for t in existing_log.tags.split(',') if t.strip()]
                            combined = list(set(existing_tags + all_new_tags))
                            existing_log.tags = ", ".join(combined)
                        else:
                            existing_log.tags = ", ".join(all_new_tags)
                            
                    movie_link_successes.append(movie_title)
                else:
                    movie_link_errors.append(f"Movie selection missing for Cinema transaction.")

            added_count += 1
            
        db.session.commit()
        invalidate_stats_cache()
        
        msg = f"Successfully added {added_count} transactions & updated balances!"
        if 'movie_link_successes' in locals() and movie_link_successes:
            msg += f"\n\n🎬 Successfully added tags for: {', '.join(movie_link_successes)}"
        if 'movie_link_errors' in locals() and movie_link_errors:
            msg += f"\n\n⚠️ Warning: {', '.join(movie_link_errors)}"
            
        return jsonify({"success": True, "message": msg})

    except Exception as e:
        print(f"❌ Error adding transaction(s): {str(e)}")
        db.session.rollback() # Safely undo everything if there's an error
        return jsonify({"success": False, "message": str(e)})
@app.route('/api/sync/ocr-split', methods=['POST'])
@require_api_key
def sync_ocr_split():
    try:
        # No link required anymore, API.gs will fetch the latest image from the folder
        payload = {"type": "ocr_split"}
        response = requests.post(SHEETS_URL, json=payload, timeout=60)
        res_data = response.json()
        
        if res_data.get('status') == 'success':
            raw_text = res_data.get('text', '')
            print("=== RAW OCR TEXT ===")
            print(raw_text)
            print("====================")
            total_amount = 0
            members = []
            lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
            
            members = []
            current_member = None
            total_amount = 0

            for line in lines:
                lower_line = line.lower()
                
                # 1. Total
                if lower_line.startswith('total:'):
                    amt_match = re.search(r'([\d,]+(?:\.\d{1,2})?)\s*$', line)
                    if amt_match:
                        total_amount = max(total_amount, float(amt_match.group(1).replace(',', '')))
                    continue
                    
                # 2. Check if amount
                amt_match = re.search(r'^(?:€|₹|rs\.?|inr|r)?\s*([\d,]+(?:\.\d{1,2})?)$', lower_line, re.IGNORECASE)
                if amt_match:
                    if current_member and current_member.get('amount') is None:
                        current_member['amount'] = float(amt_match.group(1).replace(',', ''))
                    continue
                    
                # 3. Check if status
                if lower_line in ['paid', 'unpaid', 'sent this request']:
                    if current_member:
                        current_member['paid'] = (lower_line == 'paid' or lower_line == 'sent this request')
                    continue
                    
                # 4. Check noise
                if len(line) <= 1 or ' paid' in lower_line or 'left' in lower_line or 'send reminder' in lower_line or lower_line in ['popcorn', 'split with', 'paid by', 'google pay']:
                    continue
                    
                # 5. Must be a name!
                if current_member:
                    members.append(current_member)
                current_member = {'name': line, 'amount': None, 'paid': False}
                
            if current_member:
                members.append(current_member)
                
            # Filter out invalid members (e.g. no amount detected)
            members = [m for m in members if m['amount'] is not None]
            
            return jsonify({"success": True, "total_amount": total_amount, "members": members, "raw_text": raw_text})
        else:
            return jsonify({"success": False, "message": res_data.get('message', 'Unknown error')})
            
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/splits', methods=['POST'])
@require_api_key
def save_split():
    try:
        data = request.json
        transaction_id = data.get('transaction_id')
        total_amount = data.get('total_amount')
        members = data.get('members', [])
        new_tx_amount = data.get('transaction_amount')
        
        if not transaction_id or total_amount is None:
            return jsonify({"success": False, "message": "transaction_id and total_amount required"}), 400
            
        split = Split.query.filter_by(transaction_id=transaction_id).first()
        if split:
            split.total_amount = total_amount
            split.members = members
        else:
            split = Split(transaction_id=transaction_id, total_amount=total_amount, members=members)
            db.session.add(split)
            
        if new_tx_amount is not None:
            tx = Transaction.query.get(transaction_id)
            if tx and tx.amount != float(new_tx_amount):
                # 1. Revert old amount
                account = Account.query.filter_by(account=tx.account).first()
                if account and account.balance_tracked and tx.account != "CC-PINNACLE 6360":
                    if tx.type.lower() == 'credit':
                        account.balance -= tx.amount
                    elif tx.type.lower() in ['debit', 'savings']:
                        account.balance += tx.amount
                
                # 2. Update amount
                tx.amount = float(new_tx_amount)
                
                # 3. Apply new amount
                if account and account.balance_tracked and tx.account != "CC-PINNACLE 6360":
                    if tx.type.lower() == 'credit':
                        account.balance += tx.amount
                    elif tx.type.lower() in ['debit', 'savings']:
                        account.balance -= tx.amount
            
        db.session.commit()
        return jsonify({"success": True, "split": {"id": split.id, "total_amount": split.total_amount, "members": split.members}})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/splits/<int:transaction_id>', methods=['DELETE'])
@require_api_key
def delete_split(transaction_id):
    try:
        Split.query.filter_by(transaction_id=transaction_id).delete()
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/sync/ocr-balances', methods=['POST'])
@require_api_key
def sync_ocr_balances():
    try:
        # Trigger GAS to process images
        payload = {"type": "trigger_ocr"}
        # High timeout (120s) because OCR processing on Drive takes time
        response = requests.post(SHEETS_URL, json=payload, timeout=120)
        res_data = response.json()

        if res_data.get('status') == 'no_images':
            return jsonify({"success": True, "message": res_data.get('message')})

        if res_data.get('status') == 'success':
            parsed_balances = res_data.get('data', {})
            updated_count = 0
            
            for bank, amount in parsed_balances.items():
                if amount != "":
                    acc = Account.query.filter_by(account=bank).first()
                    if acc:
                        acc.real_balance = float(amount)
                        updated_count += 1
                        
            db.session.commit()
            return jsonify({"success": True, "message": f"✅ Processed screenshots and updated {updated_count} real balances!"})
        else:
            return jsonify({"success": False, "message": "Failed to process OCR via Sheets."})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
    
@app.route('/api/transactions/<int:tid>', methods=['DELETE'])
@require_api_key  
def delete_transaction(tid):
    tx = Transaction.query.filter_by(id=tid).first()

    if not tx:
        return jsonify({"success": False, "message": "Transaction not found"}), 404

    account = Account.query.filter_by(account=tx.account).first()

    if account and account.balance_tracked and tx.account != "CC-PINNACLE 6360":
        if tx.type.lower() == "credit":
            account.balance -= tx.amount
        elif tx.type.lower() in ["debit", "savings"]:
            account.balance += tx.amount

    # --- THIS MATCHES BLOCK 2 IN YOUR APPS SCRIPT ---
    try:
        payload = {
            "type": "delete_transaction",
            "data": {
                "id": str(tx.id),
                "account": tx.account
            }
        }
        requests.post(SHEETS_URL, json=payload, timeout=5)
    except Exception as e:
        print("Failed to sync delete to sheets:", e)
    # ------------------------------------------------

    # Delete associated split if it exists
    Split.query.filter_by(transaction_id=tx.id).delete()

    db.session.delete(tx)
    db.session.commit()

    return jsonify({"success": True})

from dateutil.relativedelta import relativedelta

@app.route('/api/cron/process-recurring', methods=['POST'])
@require_api_key
def process_recurring():
    if request.method == 'OPTIONS': 
        return '', 200
    
    """Lazy Cron: Processes auto-compounding assets and recurring additions"""
    today = datetime.now(pytz.timezone('Asia/Kolkata')).date()
    processed = 0

    # 1. AUTO-COMPOUND FDs & ASSETS (Quarterly Compounding)
    assets_to_update = ManualAsset.query.filter(ManualAsset.interest_rate.isnot(None), ManualAsset.start_date.isnot(None)).all()
    for asset in assets_to_update:
        # Stop compounding if it has passed maturity
        end_date = min(today, asset.maturity_date) if asset.maturity_date else today
        days_passed = (end_date - asset.start_date).days
        
        if days_passed > 0:
            years = days_passed / 365.25
            rate = asset.interest_rate / 100.0
            
            new_value = asset.invested_value * ((1 + (rate / 4)) ** (4 * years))
            
            # Only flag as processed if the value actually ticked up
            if round(new_value, 2) > asset.current_value:
                asset.current_value = round(new_value, 2)
                asset.last_updated = today
                processed += 1

    # 2. PROCESS RECURRING ADDITIONS (EPF, RD, etc.)
    due_tasks = RecurringTask.query.filter(RecurringTask.is_active == True, RecurringTask.next_run_date <= today).all()
    
    for task in due_tasks:
        asset = ManualAsset.query.filter_by(name=task.asset_name).first()
        if asset:
            asset.invested_value += task.amount_to_add
            # Only add to current_value if it's not being auto-compounded by the block above
            if not asset.interest_rate: 
                asset.current_value += task.amount_to_add
                
            asset.last_updated = today
            
            # Move the next run date forward based on the selected unit
            if task.interval_unit == 'days':
                task.next_run_date = task.next_run_date + relativedelta(days=task.interval_value)
            elif task.interval_unit == 'years':
                task.next_run_date = task.next_run_date + relativedelta(years=task.interval_value)
            else:
                task.next_run_date = task.next_run_date + relativedelta(months=task.interval_value)
            
            processed += 1

    if processed > 0:
        update_latest_portfolio_snapshot()
        db.session.commit()
        
    return jsonify({"success": True, "processed": processed})

@app.route('/api/transactions/<int:tid>', methods=['PUT'])
@require_api_key
def edit_transaction(tid):
    try:
        data = request.json
        tx = Transaction.query.filter_by(id=tid).first()

        if not tx:
            return jsonify({"success": False, "message": "Transaction not found"}), 404

        # 1. REVERT the old transaction's impact on the balance
        old_account = Account.query.filter_by(account=tx.account).first()
        if old_account and old_account.balance_tracked and tx.account != "CC-PINNACLE 6360":
            if tx.type == 'Credit':
                old_account.balance -= tx.amount
            elif tx.type in ['Debit', 'Savings']:
                old_account.balance += tx.amount

        # Check if actual financial data changed before triggering a sync
        date_str = data['date']
        if 'T' in date_str:
            date_str = date_str.split('T')[0]
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')

        needs_sync = (
            str(tx.date) != date_str or
            tx.type != data['type'] or
            tx.heading != data['heading'] or
            (tx.description or '') != data.get('description', '') or
            tx.amount != float(data['amount']) or
            tx.account != data['account']
        )

        # 2. UPDATE the transaction fields
        tx.date = date_obj
        tx.month = date_obj.replace(day=1)
        tx.type = data['type']
        tx.heading = data['heading']
        tx.description = data.get('description', '')
        tx.amount = float(data['amount'])
        tx.account = data['account']
        tx.exclude_analytics = data.get('exclude_analytics', False)
        
        # Mark as unsynced ONLY if core fields changed (ignore exclude toggle)
        if needs_sync:
            tx.synced = False 

        # 3. APPLY the new transaction's impact on the balance
        new_account = Account.query.filter_by(account=tx.account).first()
        if new_account and new_account.balance_tracked and tx.account != "CC-PINNACLE 6360":
            if tx.type == 'Credit':
                new_account.balance += tx.amount
            elif tx.type in ['Debit', 'Savings']:
                new_account.balance -= tx.amount

        db.session.commit()
        return jsonify({"success": True, "message": "Transaction updated successfully!"})

    except Exception as e:
        print(f"❌ Error updating transaction: {str(e)}")
        db.session.rollback() # Safely undo if something breaks
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/transactions/bulk-edit', methods=['PUT', 'OPTIONS'])
@require_api_key
def bulk_edit_transactions():
    try:
        updates = request.json  # Expecting a list of transaction dictionaries
        if not isinstance(updates, list):
            return jsonify({"success": False, "message": "Invalid payload format."}), 400

        updated_count = 0

        for data in updates:
            tx_id = data.get('id')
            tx = Transaction.query.filter_by(id=tx_id).first()

            if not tx:
                continue  # Skip if ID not found somehow

            # 1. REVERT the old transaction's impact on the balance
            old_account = Account.query.filter_by(account=tx.account).first()
            if old_account and old_account.balance_tracked and tx.account != "CC-PINNACLE 6360":
                if tx.type == 'Credit':
                    old_account.balance -= tx.amount
                elif tx.type in ['Debit', 'Savings']:
                    old_account.balance += tx.amount

            # 2. UPDATE the transaction fields
            date_str = data['date']
            if 'T' in date_str:
                date_str = date_str.split('T')[0]
                
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')

            needs_sync = (
                str(tx.date) != date_str or
                tx.type != data['type'] or
                tx.heading != data['heading'] or
                (tx.description or '') != data.get('description', '') or
                tx.amount != float(data['amount']) or
                tx.account != data['account']
            )

            tx.date = date_obj
            tx.month = date_obj.replace(day=1)
            tx.type = data['type']
            tx.heading = data['heading']
            tx.description = data.get('description', '')
            tx.amount = float(data['amount'])
            tx.account = data['account']
            tx.exclude_analytics = data.get('exclude_analytics', False)
            
            # Mark as unsynced ONLY if core fields changed
            if needs_sync:
                tx.synced = False 

            # 3. APPLY the new transaction's impact on the balance
            new_account = Account.query.filter_by(account=tx.account).first()
            if new_account and new_account.balance_tracked and tx.account != "CC-PINNACLE 6360":
                if tx.type == 'Credit':
                    new_account.balance += tx.amount
                elif tx.type in ['Debit', 'Savings']:
                    new_account.balance -= tx.amount
            
            updated_count += 1

        db.session.commit()
        return jsonify({"success": True, "message": f"Successfully updated {updated_count} transactions!"})

    except Exception as e:
        print(f"❌ Error in bulk edit: {str(e)}")
        db.session.rollback() # Safely undo everything if one breaks
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/transactions/bulk-delete', methods=['POST', 'OPTIONS'])
@require_api_key
def bulk_delete_transactions():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        ids = request.json
        if not isinstance(ids, list):
            return jsonify({"success": False, "message": "Invalid payload format."}), 400

        deleted_data = []

        for tid in ids:
            tx = Transaction.query.filter_by(id=tid).first()
            if not tx:
                continue

            # Revert the balance
            account = Account.query.filter_by(account=tx.account).first()
            if account and account.balance_tracked and tx.account != "CC-PINNACLE 6360":
                if tx.type.lower() == "credit":
                    account.balance -= tx.amount
                elif tx.type.lower() in ["debit", "savings"]:
                    account.balance += tx.amount

            # Delete split first if it exists
            Split.query.filter_by(transaction_id=tx.id).delete()

            # Track it and delete from DB
            deleted_data.append({"id": str(tx.id), "account": tx.account})
            db.session.delete(tx)

        # Send ONE single bulk delete webhook to Google Sheets
        if deleted_data:
            try:
                payload = {
                    "type": "bulk_delete_transactions",
                    "data": deleted_data
                }
                requests.post(SHEETS_URL, json=payload, timeout=10)
            except Exception as e:
                print("Failed to sync bulk delete to sheets:", e)

        db.session.commit()
        return jsonify({"success": True, "message": f"Successfully deleted {len(deleted_data)} transactions!"})

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})
    
# ---- PHYSICAL ACTIVITY ----
@app.route('/api/transactions/category/exclude', methods=['PUT', 'OPTIONS'])
@require_api_key
def category_exclude():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.json
        heading = data.get('heading')
        exclude = data.get('exclude', False)

        if not heading:
            return jsonify({"success": False, "message": "Heading is required"}), 400

        # Find all transactions with this category and flip their flag
        txs = Transaction.query.filter_by(heading=heading).all()
        updated_count = 0
        for tx in txs:
            if getattr(tx, 'exclude_analytics', False) != exclude:
                tx.exclude_analytics = exclude
                # We do NOT set tx.synced = False here since this doesn't affect Sheets
                updated_count += 1

        db.session.commit()
        return jsonify({"success": True, "message": f"Updated {updated_count} transactions"})

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/physical', methods=['GET'])
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

@app.route('/api/physical', methods=['POST'])
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

@app.route('/api/investments/xirr', methods=['GET'])
@require_api_key
def get_portfolio_xirr():
    try:
        # 1. Get all Investment transactions (Cash Outflows)
        inv_txs = Transaction.query.filter_by(type='Investment').order_by(Transaction.date.asc()).all()
        
        if not inv_txs:
            return jsonify({"success": True, "xirr": 0.0})

        dates = [tx.date for tx in inv_txs]
        # XIRR requires outflows to be negative numbers
        amounts = [-abs(tx.amount) for tx in inv_txs] 

        # 2. Get the current total portfolio value (Cash Inflow)
        latest_snap = PortfolioSnapshot.query.order_by(PortfolioSnapshot.date.desc()).first()
        
        if not latest_snap:
            return jsonify({"success": True, "xirr": 0.0})

        # Add today's value as the final positive cash flow
        dates.append(datetime.now().date())
        amounts.append(latest_snap.grand_total_curr)

        # 3. Calculate XIRR
        portfolio_xirr = xirr(dates, amounts)
        
        # Convert to a readable percentage format
        xirr_pct = (portfolio_xirr * 100) if portfolio_xirr else 0.0
        
        return jsonify({"success": True, "xirr": round(xirr_pct, 2)})

    except Exception as e:
        print(f"❌ Error calculating XIRR: {str(e)}")
        return jsonify({"success": False, "message": str(e)})
    
# ---- INVESTMENTS ----
@app.route('/api/investments', methods=['GET'])
@require_api_key  
def get_investments():
    records = PortfolioSnapshot.query.order_by(PortfolioSnapshot.date.desc()).all()

    result = [
        {
            "id": r.id,
            "date": r.date.strftime("%Y-%m-%d"),
            # Backward compatibility mapping for current frontend
            "inv_stocks": r.total_equity_inv,
            "curr_stocks": r.total_equity_curr,
            "inv_mf": r.total_mf_inv,
            "curr_mf": r.total_mf_curr,
            "total_inv": r.grand_total_inv,
            "total_curr": r.grand_total_curr,
            
            # New data ready for Phase 2 UI
            "inv_fixed": r.total_fixed_income_inv,
            "curr_fixed": r.total_fixed_income_curr,
            "inv_prov": r.total_provident_inv,
            "curr_prov": r.total_provident_curr,
            "inv_gold": r.total_gold_inv,
            "curr_gold": r.total_gold_curr,
            
            # Mocking the old percentage fields dynamically
            "ret_pct_stocks": ((r.total_equity_curr - r.total_equity_inv) / r.total_equity_inv * 100) if r.total_equity_inv > 0 else 0,
            "ret_pct_mf": ((r.total_mf_curr - r.total_mf_inv) / r.total_mf_inv * 100) if r.total_mf_inv > 0 else 0,
            "total_ret_pct": ((r.grand_total_curr - r.grand_total_inv) / r.grand_total_inv * 100) if r.grand_total_inv > 0 else 0,
            "status_stocks": "",
            "status_mf": "",
            "total_status": ""
        }
        for r in records
    ]

    return jsonify(result)

@app.route('/api/cron/tasks', methods=['GET', 'POST', 'OPTIONS'])
@require_api_key
def handle_recurring_tasks():
    if request.method == 'OPTIONS': return '', 200
    
    if request.method == 'GET':
        tasks = RecurringTask.query.all()
        return jsonify([{
            "id": t.id, 
            "asset_name": t.asset_name, 
            "amount_to_add": t.amount_to_add, 
            "interval_months": t.interval_months,
            "next_run_date": t.next_run_date.strftime("%Y-%m-%d") if t.next_run_date else None,
            "is_active": t.is_active
        } for t in tasks])
        
    if request.method == 'POST':
        data = request.json
        new_task = RecurringTask(
            id=int(datetime.now().timestamp() * 1000),
            asset_name=data['asset_name'],
            amount_to_add=float(data['amount_to_add']),
            interval_months=int(data.get('interval_months', 1)),
            next_run_date=datetime.strptime(data['next_run_date'], '%Y-%m-%d').date(),
            is_active=True
        )
        db.session.add(new_task)
        db.session.commit()
        return jsonify({"success": True, "message": "Automation added"})

@app.route('/api/cron/tasks/<int:tid>', methods=['DELETE', 'OPTIONS'])
@require_api_key
def delete_recurring_task(tid):
    if request.method == 'OPTIONS': return '', 200
    task = RecurringTask.query.filter_by(id=tid).first()
    if task:
        db.session.delete(task)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Task not found"}), 404

def update_latest_portfolio_snapshot():
    """Recalculates manual asset totals for the most recent snapshot so charts update instantly."""
    latest_snap = PortfolioSnapshot.query.order_by(PortfolioSnapshot.date.desc()).first()
    if not latest_snap: return
        
    manual_assets = ManualAsset.query.all()
    
    fixed_inv = sum(a.invested_value for a in manual_assets if a.category in ['FD', 'RD', 'Cash'])
    fixed_curr = sum(a.current_value for a in manual_assets if a.category in ['FD', 'RD', 'Cash'])
    prov_inv = sum(a.invested_value for a in manual_assets if a.category in ['EPF', 'PPF', 'NPS'])
    prov_curr = sum(a.current_value for a in manual_assets if a.category in ['EPF', 'PPF', 'NPS'])
    gold_inv = sum(a.invested_value for a in manual_assets if a.category in ['SGB', 'RealEstate'])
    gold_curr = sum(a.current_value for a in manual_assets if a.category in ['SGB', 'RealEstate'])

    latest_snap.total_fixed_income_inv = fixed_inv
    latest_snap.total_fixed_income_curr = fixed_curr
    latest_snap.total_provident_inv = prov_inv
    latest_snap.total_provident_curr = prov_curr
    latest_snap.total_gold_inv = gold_inv
    latest_snap.total_gold_curr = gold_curr
    
    latest_snap.grand_total_inv = latest_snap.total_equity_inv + latest_snap.total_mf_inv + fixed_inv + prov_inv + gold_inv
    latest_snap.grand_total_curr = latest_snap.total_equity_curr + latest_snap.total_mf_curr + fixed_curr + prov_curr + gold_curr
    
    latest_snap.synced = False
    db.session.commit()


@app.route('/api/manual_assets/<int:aid>', methods=['DELETE'])
@require_api_key
def delete_manual_asset(aid):
    asset = ManualAsset.query.filter_by(id=aid).first()
    if asset:
        db.session.delete(asset)
        db.session.commit()
        update_latest_portfolio_snapshot() # <-- Updates Pie Chart instantly
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Asset not found"}), 404

@app.route('/api/manual_assets', methods=['GET', 'POST'])
@require_api_key
def handle_manual_assets():
    if request.method == 'GET':
        assets = ManualAsset.query.order_by(ManualAsset.category, ManualAsset.name).all()
        tasks = RecurringTask.query.all()
        task_map = {t.asset_name: t for t in tasks}
        
        return jsonify([{
            "id": a.id,
            "category": a.category,
            "name": a.name,
            "invested_value": a.invested_value,
            "current_value": a.current_value,
            "interest_rate": a.interest_rate,
            "start_date": a.start_date.strftime("%Y-%m-%d") if a.start_date else None,
            "maturity_date": a.maturity_date.strftime("%Y-%m-%d") if a.maturity_date else None,
            "last_updated": a.last_updated.strftime("%Y-%m-%d"),
            "is_recurring": a.name in task_map,
            "amount_to_add": task_map[a.name].amount_to_add if a.name in task_map else None,
            "interval_value": task_map[a.name].interval_value if a.name in task_map else None,
            "interval_unit": task_map[a.name].interval_unit if a.name in task_map else None,
            "next_run_date": task_map[a.name].next_run_date.strftime("%Y-%m-%d") if a.name in task_map and task_map[a.name].next_run_date else None
        } for a in assets])
        
    if request.method == 'POST':
        data = request.json
        ist_timezone = pytz.timezone('Asia/Kolkata')
        
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data.get('start_date') else None
        mat_date = datetime.strptime(data['maturity_date'], '%Y-%m-%d').date() if data.get('maturity_date') else None
    
        curr_val_raw = data.get('current_value')
        curr_val = float(curr_val_raw) if curr_val_raw else float(data.get('invested_value', 0))

        new_asset = ManualAsset(
            id=int(datetime.now().timestamp() * 1000),
            category=data['category'],
            name=data['name'],
            invested_value=float(data.get('invested_value', 0)),
            current_value=curr_val,
            interest_rate=float(data.get('interest_rate')) if data.get('interest_rate') else None,
            start_date=start_date,
            maturity_date=mat_date,
            last_updated=datetime.now(ist_timezone).date()
        )
        db.session.add(new_asset)
        
        if data.get('is_recurring'):
            new_task = RecurringTask(
                id=int(datetime.now().timestamp() * 1000) + 1,
                asset_name=data['name'],
                amount_to_add=float(data['amount_to_add']),
                interval_value=int(data.get('interval_value', 1)),
                interval_unit=data.get('interval_unit', 'months'),
                next_run_date=datetime.strptime(data['next_run_date'], '%Y-%m-%d').date(),
                is_active=True
            )
            db.session.add(new_task)

        db.session.commit()
        update_latest_portfolio_snapshot()
        return jsonify({"success": True, "message": "Asset & Automation added successfully"})

@app.route('/api/manual_assets/<int:aid>', methods=['PUT', 'OPTIONS'])
@require_api_key
def edit_manual_asset(aid):
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json
        asset = ManualAsset.query.filter_by(id=aid).first()
        if not asset: return jsonify({"success": False, "message": "Asset not found"}), 404

        ist_timezone = pytz.timezone('Asia/Kolkata')
        old_name = asset.name
        
        asset.category = data['category']
        asset.name = data['name']
        asset.invested_value = float(data.get('invested_value', 0))
        asset.current_value = float(data.get('current_value', 0))
        asset.interest_rate = float(data.get('interest_rate')) if data.get('interest_rate') else None
        asset.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data.get('start_date') else None
        asset.maturity_date = datetime.strptime(data['maturity_date'], '%Y-%m-%d').date() if data.get('maturity_date') else None
        asset.last_updated = datetime.now(ist_timezone).date()

        # Handle Recurring Task updates linked to this asset
        task = RecurringTask.query.filter_by(asset_name=old_name).first()
        
        if data.get('is_recurring'):
            if task:
                task.asset_name = asset.name
                task.amount_to_add = float(data['amount_to_add'])
                task.interval_value = int(data.get('interval_value', 1))
                task.interval_unit = data.get('interval_unit', 'months')
                task.next_run_date = datetime.strptime(data['next_run_date'], '%Y-%m-%d').date()
            else:
                new_task = RecurringTask(
                    id=int(datetime.now().timestamp() * 1000) + 1,
                    asset_name=asset.name,
                    amount_to_add=float(data['amount_to_add']),
                    interval_value=int(data.get('interval_value', 1)),
                    interval_unit=data.get('interval_unit', 'months'),
                    next_run_date=datetime.strptime(data['next_run_date'], '%Y-%m-%d').date(),
                    is_active=True
                )
                db.session.add(new_task)
        else:
            if task: db.session.delete(task)

        db.session.commit()
        update_latest_portfolio_snapshot()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})
    
@app.route('/api/equity', methods=['GET'])
@require_api_key
def get_equity():
    # Fetch the latest available equity snapshot
    latest_date = db.session.query(db.func.max(EquityHolding.date)).scalar()
    if not latest_date:
        return jsonify([])
        
    records = EquityHolding.query.filter_by(date=latest_date).all()
    return jsonify([{
        "symbol": r.symbol,
        "quantity": r.quantity,
        "average_price": r.average_price,
        "ltp": r.ltp,
        "invested_value": r.invested_value,
        "current_value": r.current_value
    } for r in records])

@app.route('/api/sync/kite', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def sync_kite_direct():
    print("🔄 Starting direct Kite sync...")
    data = request.json
    request_token = data.get('request_token')
    
    if not request_token:
        return jsonify({"success": False, "message": "Request token is required for Kite API"})

    if not KITE_API_KEY or not KITE_API_SECRET:
        return jsonify({"success": False, "message": "Kite API credentials not configured"})

    try:
        ist_timezone = pytz.timezone('Asia/Kolkata')
        today_date = datetime.now(ist_timezone).date()
        
        # 1. Check if already synced today
        if PortfolioSnapshot.query.filter_by(date=today_date).first():
            return jsonify({"success": False, "message": f"Already synced investments for {today_date.strftime('%d/%m/%Y')}!"})

        # 2. Auth with Kite
        raw = KITE_API_KEY + request_token + KITE_API_SECRET
        checksum = hashlib.sha256(raw.encode('utf-8')).hexdigest()

        token_res = requests.post("https://api.kite.trade/session/token", data={
            "api_key": KITE_API_KEY, "request_token": request_token, "checksum": checksum
        }).json()
        
        if token_res.get('status') != 'success':
            return jsonify({"success": False, "message": "Kite Auth Failed. Token might be expired."})
        
        access_token = token_res['data']['access_token']
        headers = {"Authorization": f"token {KITE_API_KEY}:{access_token}"}

        # ==========================================
        # 3. PROCESS MUTUAL FUNDS
        # ==========================================
        mf_res = requests.get("https://api.kite.trade/mf/holdings", headers=headers).json()
        mf_holdings = mf_res.get('data', [])
        
        instruments_res = requests.get("https://api.kite.trade/mf/instruments")
        reader = csv.DictReader(io.StringIO(instruments_res.text))
        mf_data_map = {row['tradingsymbol']: {'nav': float(row.get('last_price', 0) or 0), 'name': row.get('name', row['tradingsymbol'])} for row in reader if row.get('tradingsymbol')}

        mf_total_inv = 0.0
        mf_total_curr = 0.0
        mf_records = []

        for h in mf_holdings:
            raw_symbol = h['tradingsymbol']
            qty, avg_price = float(h['quantity']), float(h['average_price'])
            
            fund_info = mf_data_map.get(raw_symbol)
            if not fund_info or not fund_info['nav']: continue
                
            nav, real_name = fund_info['nav'], fund_info['name']
            inv_val, curr_val = (qty * avg_price), (qty * nav)
            
            mf_total_inv += inv_val
            mf_total_curr += curr_val
            
            mf_records.append(MutualFundHolding(
                id=int(datetime.now().timestamp() * 1000) + len(mf_records),
                date=today_date, symbol=real_name, quantity=qty, average_price=avg_price,
                nav=nav, invested_value=inv_val, current_value=curr_val
            ))

        # ==========================================
        # 4. PROCESS EQUITY (STOCKS)
        # ==========================================
        eq_res = requests.get("https://api.kite.trade/portfolio/holdings", headers=headers).json()
        eq_holdings = eq_res.get('data', [])
        
        eq_total_inv = 0.0
        eq_total_curr = 0.0
        eq_records = []

        for e in eq_holdings:
            qty, avg_price, ltp = e['quantity'], e['average_price'], e['last_price']
            inv_val, curr_val = (qty * avg_price), (qty * ltp)
            
            eq_total_inv += inv_val
            eq_total_curr += curr_val
            
            eq_records.append(EquityHolding(
                id=int(datetime.now().timestamp() * 1000) + e.get('instrument_token', len(eq_records)),
                date=today_date, symbol=e['tradingsymbol'], quantity=qty, average_price=avg_price,
                ltp=ltp, invested_value=inv_val, current_value=curr_val
            ))

        # ==========================================
        # 5. CALCULATE TOTALS (KITE + MANUAL)
        # ==========================================
        manual_assets = ManualAsset.query.all()
        
        fixed_inv = sum(a.invested_value for a in manual_assets if a.category in ['FD', 'RD', 'Cash'])
        fixed_curr = sum(a.current_value for a in manual_assets if a.category in ['FD', 'RD', 'Cash'])
        
        
        prov_inv = sum(a.invested_value for a in manual_assets if a.category in ['EPF', 'PPF', 'NPS'])
        prov_curr = sum(a.current_value for a in manual_assets if a.category in ['EPF', 'PPF', 'NPS'])
        
        gold_inv = sum(a.invested_value for a in manual_assets if a.category == 'SGB')
        gold_curr = sum(a.current_value for a in manual_assets if a.category == 'SGB')

        grand_inv = eq_total_inv + mf_total_inv + fixed_inv + prov_inv + gold_inv
        grand_curr = eq_total_curr + mf_total_curr + fixed_curr + prov_curr + gold_curr

        # ==========================================
        # 6. SAVE TO DATABASE
        # ==========================================
        new_snapshot = PortfolioSnapshot(
            id=int(datetime.now().timestamp() * 1000), 
            date=today_date,
            total_equity_inv=eq_total_inv, total_equity_curr=eq_total_curr,
            total_mf_inv=mf_total_inv, total_mf_curr=mf_total_curr,
            total_fixed_income_inv=fixed_inv, total_fixed_income_curr=fixed_curr,
            total_provident_inv=prov_inv, total_provident_curr=prov_curr,
            total_gold_inv=gold_inv, total_gold_curr=gold_curr,
            grand_total_inv=grand_inv, grand_total_curr=grand_curr
        )
        
        db.session.add(new_snapshot)
        db.session.add_all(mf_records)
        db.session.add_all(eq_records)
        db.session.commit()

        return jsonify({"success": True, "message": f"Successfully synced Combined Portfolio!"})

    except Exception as e:
        print(f"❌ Kite Sync Error: {str(e)}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/investments/<date_str>/equity_holdings', methods=['GET'])
@require_api_key
def get_daily_equity_holdings(date_str):
    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    holdings = EquityHolding.query.filter_by(date=date_obj).all()
    return jsonify([{
        "symbol": h.symbol,
        "quantity": h.quantity,
        "average_price": h.average_price,
        "ltp": h.ltp,
        "invested_value": h.invested_value,
        "current_value": h.current_value,
        "ret_pct": ((h.current_value - h.invested_value) / h.invested_value * 100) if h.invested_value > 0 else 0
    } for h in holdings])

@app.route('/api/sync/investments-to-sheets', methods=['POST'])
@require_api_key  
def sync_investments_to_sheets():
    try:
        # Fetch only unsynced snapshots
        unsynced_invs = PortfolioSnapshot.query.filter_by(synced=False).all()
        
        if not unsynced_invs:
            return jsonify({"success": True, "message": "No new investments to sync to Sheets."})

        # Format the payload for Apps Script (mocking the old column structure to prevent Sheets from breaking)
        payload = {
            "type": "investments",
            "data": [
                {
                    "date": inv.date.strftime("%Y-%m-%d"),
                    "inv_stocks": float(inv.total_equity_inv),
                    "curr_stocks": float(inv.total_equity_curr),
                    "ret_pct_stocks": float(((inv.total_equity_curr - inv.total_equity_inv) / inv.total_equity_inv * 100) if inv.total_equity_inv > 0 else 0),
                    "status_stocks": "",
                    "inv_mf": float(inv.total_mf_inv),
                    "curr_mf": float(inv.total_mf_curr),
                    "ret_pct_mf": float(((inv.total_mf_curr - inv.total_mf_inv) / inv.total_mf_inv * 100) if inv.total_mf_inv > 0 else 0),
                    "status_mf": "",
                    "total_inv": float(inv.grand_total_inv),
                    "total_curr": float(inv.grand_total_curr),
                    "total_ret_pct": float(((inv.grand_total_curr - inv.grand_total_inv) / inv.grand_total_inv * 100) if inv.grand_total_inv > 0 else 0),
                    "total_status": ""
                } for inv in unsynced_invs
            ]
        }

        print(f"📡 Sending {len(unsynced_invs)} records to Google Sheets...")
        response = requests.post(SHEETS_URL, json=payload, timeout=60)
        
        if response.status_code == 200:
            for inv in unsynced_invs:
                inv.synced = True
            db.session.commit()
            return jsonify({"success": True, "message": f"Successfully synced {len(unsynced_invs)} records to Sheets!"})
        else:
            return jsonify({"success": False, "message": f"Sheets error: {response.text}"})

    except Exception as e:
        print(f"❌ Sheets Sync Error: {str(e)}")
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/auth/firebase-login', methods=['POST'])
def firebase_login():
    try:
        id_token = request.json.get('id_token')
        if not id_token:
            return jsonify({"success": False, "message": "No token provided"}), 400

        # Verify the Firebase token
        decoded = firebase_auth.verify_id_token(id_token)
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

@app.route('/api/investments/<date_str>/holdings', methods=['GET'])
@require_api_key
def get_daily_holdings(date_str):
    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    holdings = MutualFundHolding.query.filter_by(date=date_obj).all()
    return jsonify([{
        "symbol": h.symbol,
        "quantity": h.quantity,
        "average_price": h.average_price,
        "nav": h.nav,
        "invested_value": h.invested_value,
        "current_value": h.current_value,
        "ret_pct": ((h.current_value - h.invested_value) / h.invested_value * 100) if h.invested_value > 0 else 0
    } for h in holdings])

@app.route('/api/assets/list', methods=['GET'])
@require_api_key
def get_asset_list():
    # Dynamically pull all unique assets you currently own
    latest_eq_date = db.session.query(db.func.max(EquityHolding.date)).scalar()
    eq_symbols = [r[0] for r in db.session.query(EquityHolding.symbol).filter(EquityHolding.date == latest_eq_date).all()] if latest_eq_date else []
    
    latest_mf_date = db.session.query(db.func.max(MutualFundHolding.date)).scalar()
    mf_symbols = [r[0] for r in db.session.query(MutualFundHolding.symbol).filter(MutualFundHolding.date == latest_mf_date).all()] if latest_mf_date else []
    
    manual_assets = ManualAsset.query.all()
    
    return jsonify({
        "EQUITY": sorted(list(set(eq_symbols))),
        "MF": sorted(list(set(mf_symbols))),
        "PROVIDENT": [a.name for a in manual_assets if a.category in ['EPF', 'PPF', 'NPS']],
        "FIXED_INCOME": [a.name for a in manual_assets if a.category in ['FD', 'RD', 'Cash']],
        "GOLD": [a.name for a in manual_assets if a.category in ['SGB', 'RealEstate']]
    })

@app.route('/api/investments/history', methods=['GET'])
@require_api_key
def get_asset_history():
    symbol = request.args.get('symbol')
    asset_type = request.args.get('type') # EQUITY, MF, PROVIDENT, etc.
    
    if not symbol or not asset_type:
        return jsonify([])
        
    data = []
    if asset_type == 'EQUITY':
        history = EquityHolding.query.filter_by(symbol=symbol).order_by(EquityHolding.date.asc()).all()
        data = [{"date": h.date.strftime("%Y-%m-%d"), "Current": h.current_value, "Invested": h.invested_value} for h in history]
    elif asset_type == 'MF':
        history = MutualFundHolding.query.filter_by(symbol=symbol).order_by(MutualFundHolding.date.asc()).all()
        data = [{"date": h.date.strftime("%Y-%m-%d"), "Current": h.current_value, "Invested": h.invested_value} for h in history]
    else:
        # For manual assets, we plot a straight line from creation to today
        asset = ManualAsset.query.filter_by(name=symbol).first()
        if asset:
            ist_timezone = pytz.timezone('Asia/Kolkata')
            today_str = datetime.now(ist_timezone).strftime("%Y-%m-%d")
            data = [
                {"date": asset.last_updated.strftime("%Y-%m-%d"), "Current": asset.current_value, "Invested": asset.invested_value},
                {"date": today_str, "Current": asset.current_value, "Invested": asset.invested_value}
            ]
    return jsonify(data)

# ==========================================
# 🚀 SECRET DEVELOPER MENU ENDPOINTS
# ==========================================
@app.route('/api/admin/emails', methods=['GET'])
@require_admin
def get_allowed_emails():
    emails = AllowedEmail.query.all()
    return jsonify({"success": True, "emails": [e.email for e in emails]})

@app.route('/api/admin/emails', methods=['POST'])
@require_admin
def add_allowed_email():
    new_email = request.json.get('email', '').strip()
    if not new_email:
        return jsonify({"success": False, "message": "Email is required"}), 400
    
    if not AllowedEmail.query.filter_by(email=new_email).first():
        db.session.add(AllowedEmail(email=new_email))
        db.session.commit()
    return jsonify({"success": True, "message": f"Added {new_email}"})

@app.route('/api/admin/emails/<path:email>', methods=['DELETE'])
@require_admin
def remove_allowed_email(email):
    record = AllowedEmail.query.filter_by(email=email).first()
    if record:
        db.session.delete(record)
        db.session.commit()
    return jsonify({"success": True})

# ==========================================
# 📺 TV TRACKER ENDPOINTS
# ==========================================

@app.route('/api/media/search', methods=['GET'])
@require_api_key
def search_media():
    query = request.args.get('q', '')
    if not query:
        return jsonify({"success": False, "message": "Query required"}), 400
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
    
    url = f"https://api.themoviedb.org/3/search/multi?query={query}&include_adult=false&language=en-US&page=1"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
        "Connection": "close"
    }
    
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=3, backoff_factor=0.5))
    session.mount('https://', adapter)
    
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return jsonify({"success": True, "data": response.json()})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tv/details/<int:tmdb_id>', methods=['GET'])
@require_api_key
def get_tv_details(tmdb_id):
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
        
    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?append_to_response=aggregate_credits,videos&language=en-US"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
        "Connection": "close"
    }
    
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=3, backoff_factor=0.5))
    session.mount('https://', adapter)
    
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return jsonify({"success": True, "data": response.json()})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tv/shows', methods=['GET'])
@require_api_key
def get_tv_shows():
    shows = TvShow.query.order_by(TvShow.added_on.desc()).all()
    result = []
    for s in shows:
        result.append({
            "id": s.id,
            "tmdb_id": s.tmdb_id,
            "name": s.name,
            "poster_path": s.poster_path,
            "status": s.status,
            "watched_episodes": s.watched_episodes,
            "added_on": s.added_on.isoformat() if s.added_on else None
        })
    return jsonify({"success": True, "shows": result})

@app.route('/api/tv/shows', methods=['POST'])
@require_api_key
def add_tv_show():
    data = request.json
    tmdb_id = data.get('tmdb_id')
    name = data.get('name')
    poster_path = data.get('poster_path')
    status = data.get('status', 'TO WATCH')
    
    if not tmdb_id or not name:
        return jsonify({"success": False, "message": "tmdb_id and name are required"}), 400
        
    existing = TvShow.query.filter_by(tmdb_id=tmdb_id).first()
    if existing:
        if existing.status == 'NONE' and status != 'NONE':
            existing.status = status
            db.session.commit()
            
        return jsonify({
            "success": True, 
            "message": "Show already tracked", 
            "id": existing.id,
            "show": {
                "id": existing.id, "tmdb_id": existing.tmdb_id, "name": existing.name, 
                "poster_path": existing.poster_path, "status": existing.status, "type": "tv"
            }
        })
        
    new_show = TvShow(
        tmdb_id=tmdb_id,
        name=name,
        poster_path=poster_path,
        status=status,
        watched_episodes={}
    )
    db.session.add(new_show)
    db.session.flush() # to get new_show.id
    
    if status != 'NONE':
        activity = TvActivityLog(tv_show_id=new_show.id, action=f"Added to library as {status}")
        db.session.add(activity)
    
    db.session.commit()
    
    return jsonify({
        "success": True, 
        "message": "Show added", 
        "id": new_show.id,
        "show": {
            "id": new_show.id, "tmdb_id": new_show.tmdb_id, "name": new_show.name, 
            "poster_path": new_show.poster_path, "status": new_show.status, "type": "tv"
        }
    })

@app.route('/api/tv/shows/<int:show_id>', methods=['PUT', 'DELETE'])
@require_api_key
def update_tv_show(show_id):
    show = TvShow.query.get(show_id)
    if not show:
        return jsonify({"success": False, "message": "Show not found"}), 404
        
    if request.method == 'DELETE':
        db.session.delete(show)
        db.session.commit()
        return jsonify({"success": True, "message": "Show deleted"})
        
    # PUT
    data = request.json
    if 'status' in data and show.status != data['status']:
        show.status = data['status']
        activity = TvActivityLog(tv_show_id=show.id, action=f"Status changed to {data['status']}")
        db.session.add(activity)
        
    if 'watched_episodes' in data:
        show.watched_episodes = data['watched_episodes']
        
    db.session.commit()
    return jsonify({"success": True, "message": "Show updated"})

@app.route('/api/tv/diary', methods=['GET'])
@require_api_key
def get_tv_diary():
    logs = TvDiaryLog.query.order_by(TvDiaryLog.date.desc(), TvDiaryLog.created_at.desc()).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "show_id": log.tv_show_id,
            "show_name": log.tv_show.name if log.tv_show else "Unknown",
            "poster_path": log.tv_show.poster_path if log.tv_show else None,
            "season_number": log.season_number,
            "episode_number": log.episode_number,
            "date": log.date.isoformat(),
            "rating": log.rating,
            "review": log.review,
            "liked": log.liked,
            "rewatch": log.rewatch,
            "tags": log.tags,
            "created_at": log.created_at.isoformat()
        })
    return jsonify({"success": True, "logs": result})

@app.route('/api/tv/diary', methods=['POST'])
@require_api_key
def add_tv_diary():
    data = request.json
    tv_show_id = data.get('tv_show_id')
    
    if not tv_show_id:
        return jsonify({"success": False, "message": "tv_show_id is required"}), 400
        
    log_date_str = data.get('date')
    log_date = datetime.strptime(log_date_str, "%Y-%m-%d").date() if log_date_str else date.today()
        
    new_log = TvDiaryLog(
        tv_show_id=tv_show_id,
        season_number=data.get('season_number'),
        episode_number=data.get('episode_number'),
        date=log_date,
        rating=data.get('rating'),
        review=data.get('review'),
        liked=data.get('liked', False),
        rewatch=data.get('rewatch', False),
        tags=data.get('tags')
    )
    
    db.session.add(new_log)
    db.session.commit()
    return jsonify({"success": True, "message": "Logged successfully", "id": new_log.id})

@app.route('/api/tv/diary', methods=['PUT'])
@require_api_key
def update_tv_diary():
    data = request.json
    log_ids = data.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
    
    update_data = {}
    if 'rating' in data: update_data['rating'] = data['rating'] or None
    if 'review' in data: update_data['review'] = data['review'] or None
    if 'liked' in data: update_data['liked'] = data['liked']
    if 'rewatch' in data: update_data['rewatch'] = data['rewatch']
    if 'tags' in data: update_data['tags'] = data['tags'] or None
    
    TvDiaryLog.query.filter(TvDiaryLog.id.in_(log_ids)).update(update_data, synchronize_session=False)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/tv/diary', methods=['DELETE'])
@require_api_key
def delete_tv_diary():
    log_ids = request.json.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
        
    TvDiaryLog.query.filter(TvDiaryLog.id.in_(log_ids)).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"success": True})

# ==========================================
# 🎬 MOVIE TRACKER ENDPOINTS
# ==========================================

@app.route('/api/movies/search', methods=['GET'])
@require_api_key
def search_tmdb_movies():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"success": True, "results": []})
        
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
        
    search_url = f"https://api.themoviedb.org/3/search/movie?query={requests.utils.quote(query)}"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0"
    }
    
    try:
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=2, backoff_factor=0.5))
        session.mount('https://', adapter)
        r = session.get(search_url, headers=headers, timeout=5)
        if r.status_code == 200:
            data = r.json()
            results = data.get('results', [])[:5] # Top 5
            return jsonify({
                "success": True, 
                "results": [{
                    "tmdb_id": m.get('id'),
                    "title": m.get('title'),
                    "year": m.get('release_date', '')[:4] if m.get('release_date') else '',
                    "poster_path": m.get('poster_path')
                } for m in results]
            })
        return jsonify({"success": False, "message": "TMDB API Error"}), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/movies/tags', methods=['GET'])
@require_api_key
def get_movie_tags():
    try:
        logs = MovieDiaryLog.query.filter(MovieDiaryLog.tags.isnot(None)).all()
        tags_set = set()
        for log in logs:
            if log.tags:
                for tag in log.tags.split(','):
                    t = tag.strip()
                    if t:
                        tags_set.add(t)
        return jsonify({"success": True, "tags": sorted(list(tags_set))})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# --- MOVIE STATS CACHE ---
_stats_cache = {}

def invalidate_stats_cache():
    """Call this whenever diary logs change (add/delete/RSS sync)."""
    global _stats_cache
    _stats_cache.clear()

@app.route('/api/movies/stats', methods=['GET'])
@require_api_key
def get_movie_stats():
    from sqlalchemy.sql import func, extract
    
    year_param = request.args.get('year', str(datetime.now().year))
    
    # Check cache
    if year_param in _stats_cache:
        return jsonify(_stats_cache[year_param])
    
    try:
        # Get available years
        year_rows = db.session.query(
            extract('year', MovieDiaryLog.date).label('yr')
        ).distinct().all()
        available_years = sorted([int(r.yr) for r in year_rows if r.yr], reverse=True)
        
        # Base query
        query = db.session.query(MovieDiaryLog).options(joinedload(MovieDiaryLog.movie))
        
        if year_param != 'all':
            try:
                yr = int(year_param)
                query = query.filter(extract('year', MovieDiaryLog.date) == yr)
            except ValueError:
                pass
        
        logs = query.all()
        
        # --- Compute stats ---
        total_entries = len(logs)
        total_reviews = sum(1 for l in logs if l.review and l.review.strip())
        total_likes = sum(1 for l in logs if l.liked)
        
        # Total hours from runtime
        total_minutes = 0
        for l in logs:
            if l.movie and l.movie.runtime:
                total_minutes += l.movie.runtime
        total_hours = round(total_minutes / 60, 1)
        
        # Unique films
        unique_movie_ids = set(l.movie_id for l in logs)
        films_logged = len(unique_movie_ids)
        
        # Averages
        if year_param == 'all' and available_years:
            num_months = max(1, (datetime.now().year - min(available_years)) * 12 + datetime.now().month)
            num_weeks = max(1, num_months * 4.33)
        elif year_param != 'all':
            try:
                yr = int(year_param)
                if yr == datetime.now().year:
                    from datetime import date as dt_date
                    jan1 = dt_date(yr, 1, 1)
                    today = dt_date.today()
                    days_elapsed = max(1, (today - jan1).days)
                    num_months = max(1, days_elapsed / 30.44)
                    num_weeks = max(1, days_elapsed / 7)
                else:
                    num_months = 12
                    num_weeks = 52
            except ValueError:
                num_months = 12
                num_weeks = 52
        else:
            num_months = 12
            num_weeks = 52
        
        avg_per_month = round(films_logged / num_months, 1)
        avg_per_week = round(films_logged / num_weeks, 1)
        
        # Highest rated films (top 14, unique movies, highest rating first)
        # To include rewatches that might not have been rated this year, we get the all-time max rating for all movies logged this year.
        unique_movie_ids = list(set(l.movie_id for l in logs))
        movie_best_rating = {}
        
        if unique_movie_ids:
            all_time_ratings = db.session.query(
                MovieDiaryLog.movie_id, func.max(MovieDiaryLog.rating)
            ).filter(
                MovieDiaryLog.movie_id.in_(unique_movie_ids),
                MovieDiaryLog.rating > 0
            ).group_by(MovieDiaryLog.movie_id).all()
            
            best_rating_map = {r[0]: r[1] for r in all_time_ratings if r[1]}
            
            for l in logs:
                mid = l.movie_id
                if mid in best_rating_map and mid not in movie_best_rating:
                    movie_best_rating[mid] = {
                        'movie_id': mid,
                        'tmdb_id': l.movie.tmdb_id if l.movie else None,
                        'name': l.movie.name if l.movie else 'Unknown',
                        'poster_path': l.movie.poster_path if l.movie else None,
                        'rating': best_rating_map[mid],
                        'release_year': l.movie.release_year if l.movie else None
                    }
        
        all_rated = sorted(movie_best_rating.values(), key=lambda x: -x['rating'])
        highest_rated = all_rated[:14]
        highest_rated_current = []
        highest_rated_older = []
        
        if year_param != 'all':
            yr = int(year_param)
            current = [m for m in all_rated if m['release_year'] == yr][:14]
            older = [m for m in all_rated if m['release_year'] is not None and m['release_year'] < yr][:14]
            # Fallback if release_year is missing: treat as older
            older += [m for m in all_rated if m['release_year'] is None][:14 - len(older)]
            highest_rated_current = sorted(current, key=lambda x: -x['rating'])
            highest_rated_older = sorted(older, key=lambda x: -x['rating'])[:14]
        else:
            highest_rated_current = highest_rated
            highest_rated_older = []
        
        # Films by week (ISO week number -> count)
        by_week = [0] * 53  # weeks 0-52
        for l in logs:
            if l.date:
                wk = l.date.isocalendar()[1]
                if 1 <= wk <= 52:
                    by_week[wk] += 1
        by_week = by_week[1:53]  # weeks 1-52
        
        # By day of week (Monday=0 ... Sunday=6)
        by_day = [0] * 7
        for l in logs:
            if l.date:
                dow = l.date.weekday()  # Monday=0, Sunday=6
                by_day[dow] += 1
        
        # Rating distribution (0.5, 1, 1.5, ..., 5)
        rating_dist = {}
        for l in logs:
            if l.rating and l.rating > 0:
                r_key = str(l.rating)
                rating_dist[r_key] = rating_dist.get(r_key, 0) + 1
        
        result = {
            "success": True,
            "year": year_param,
            "available_years": available_years,
            "total_entries": total_entries,
            "total_reviews": total_reviews,
            "total_likes": total_likes,
            "total_hours": total_hours,
            "films_logged": films_logged,
            "avg_per_month": avg_per_month,
            "avg_per_week": avg_per_week,
            "highest_rated": highest_rated,
            "highest_rated_current": highest_rated_current,
            "highest_rated_older": highest_rated_older,
            "by_week": by_week,
            "by_day": by_day,
            "rating_distribution": rating_dist
        }
        
        # Cache the result
        _stats_cache[year_param] = result
        
        return jsonify(result)
    except Exception as e:
        print(f"Stats error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/movies/details/<int:tmdb_id>', methods=['GET'])
@require_api_key
def get_movie_details(tmdb_id):
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB_API_KEY not set"}), 500
        
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?append_to_response=credits,videos&language=en-US"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "User-Agent": "Mozilla/5.0",
        "Connection": "close"
    }
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(max_retries=requests.packages.urllib3.util.retry.Retry(total=3, backoff_factor=0.5))
    session.mount('https://', adapter)
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        if 'credits' in data:
            data['aggregate_credits'] = data['credits']
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/movies', methods=['GET'])
@require_api_key
def get_movies():
    movies = Movie.query.filter(Movie.status != 'NONE').order_by(Movie.added_on.desc()).all()
    result = []
    for m in movies:
        result.append({
            "id": m.id,
            "tmdb_id": m.tmdb_id,
            "name": m.name,
            "poster_path": m.poster_path,
            "status": m.status,
            "added_on": m.added_on.isoformat() if m.added_on else None
        })
    return jsonify({"success": True, "movies": result})

@app.route('/api/movies', methods=['POST'])
@require_api_key
def add_movie():
    data = request.json
    tmdb_id = data.get('tmdb_id')
    name = data.get('name')
    poster_path = data.get('poster_path')
    status = data.get('status', 'TO WATCH')
    if not tmdb_id or not name:
        return jsonify({"success": False, "message": "tmdb_id and name are required"}), 400
    
    existing = Movie.query.filter_by(tmdb_id=tmdb_id).first()
    if existing:
        if existing.status == 'NONE' and status != 'NONE':
            existing.status = status
            db.session.commit()
            
        return jsonify({
            "success": True, 
            "message": "Movie already tracked", 
            "id": existing.id,
            "show": {
                "id": existing.id, "tmdb_id": existing.tmdb_id, "name": existing.name, 
                "poster_path": existing.poster_path, "status": existing.status, "type": "movie"
            }
        })

    rel_year = None
    try:
        if 'year' in data and data['year']:
            rel_year = int(str(data['year'])[:4])
    except:
        pass
    new_movie = Movie(tmdb_id=tmdb_id, name=name, poster_path=poster_path, status=status, release_year=rel_year)
    db.session.add(new_movie)
    db.session.commit()
    return jsonify({
        "success": True, 
        "message": "Movie added", 
        "id": new_movie.id,
        "show": {
            "id": new_movie.id, "tmdb_id": new_movie.tmdb_id, "name": new_movie.name, 
            "poster_path": new_movie.poster_path, "status": new_movie.status, "type": "movie"
        }
    })

@app.route('/api/movies/<int:movie_id>', methods=['PUT', 'DELETE'])
@require_api_key
def update_movie(movie_id):
    movie = Movie.query.get(movie_id)
    if not movie:
        return jsonify({"success": False, "message": "Movie not found"}), 404
    if request.method == 'DELETE':
        db.session.delete(movie)
        db.session.commit()
        return jsonify({"success": True, "message": "Movie deleted"})
    data = request.json
    if 'status' in data and movie.status != data['status']:
        movie.status = data['status']
    db.session.commit()
    return jsonify({"success": True, "message": "Movie updated"})

@app.route('/api/movies/diary', methods=['GET'])
@require_api_key
def get_movie_diary():
    logs = MovieDiaryLog.query.order_by(MovieDiaryLog.date.desc(), MovieDiaryLog.created_at.desc()).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "show_id": log.movie_id,
            "tmdb_id": log.movie.tmdb_id if log.movie else None,
            "show_name": log.movie.name if log.movie else "Unknown",
            "poster_path": log.movie.poster_path if log.movie else None,
            "date": log.date.isoformat(),
            "rating": log.rating,
            "review": log.review,
            "liked": log.liked,
            "rewatch": log.rewatch,
            "tags": log.tags,
            "created_at": log.created_at.isoformat()
        })
    return jsonify({"success": True, "logs": result})

@app.route('/api/movies/diary', methods=['POST'])
@require_api_key
def add_movie_diary():
    data = request.json
    movie_id = data.get('movie_id') or data.get('tv_show_id') # keeping tv_show_id property name for frontend compatibility
    if not movie_id:
        return jsonify({"success": False, "message": "movie_id is required"}), 400
    log_date_str = data.get('date')
    log_date = datetime.strptime(log_date_str, "%Y-%m-%d").date() if log_date_str else date.today()
    new_log = MovieDiaryLog(
        movie_id=movie_id,
        date=log_date,
        rating=data.get('rating'),
        review=data.get('review'),
        liked=data.get('liked', False),
        rewatch=data.get('rewatch', False),
        tags=data.get('tags')
    )
    db.session.add(new_log)
    db.session.commit()
    invalidate_stats_cache()
    return jsonify({"success": True, "message": "Logged successfully", "id": new_log.id})

@app.route('/api/movies/diary', methods=['PUT'])
@require_api_key
def update_movie_diary():
    data = request.json
    log_ids = data.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
    update_data = {}
    if 'rating' in data: update_data['rating'] = data['rating'] or None
    if 'review' in data: update_data['review'] = data['review'] or None
    if 'liked' in data: update_data['liked'] = data['liked']
    if 'rewatch' in data: update_data['rewatch'] = data['rewatch']
    if 'tags' in data: update_data['tags'] = data['tags'] or None
    MovieDiaryLog.query.filter(MovieDiaryLog.id.in_(log_ids)).update(update_data, synchronize_session=False)
    db.session.commit()
    invalidate_stats_cache()
    return jsonify({"success": True})

@app.route('/api/movies/diary', methods=['DELETE'])
@require_api_key
def delete_movie_diary():
    log_ids = request.json.get('log_ids', [])
    if not log_ids:
        return jsonify({"success": False, "message": "log_ids required"}), 400
    MovieDiaryLog.query.filter(MovieDiaryLog.id.in_(log_ids)).delete(synchronize_session=False)
    db.session.commit()
    invalidate_stats_cache()
    return jsonify({"success": True})

from flask import stream_with_context, Response

def _perform_rss_sync_generator(username, fast_mode=False):
    import json
    yield json.dumps({"status": "Fetching RSS feed..."}) + "\n"
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Connection': 'close'}
        r = requests.get(f'https://letterboxd.com/{username}/rss/', headers=headers, timeout=10)
        if r.status_code != 200:
            yield json.dumps({"success": False, "message": f"Failed to fetch RSS: {r.status_code}"}) + "\n"
            return
        
        root = ET.fromstring(r.content)
        items = root.findall('.//item')
        if fast_mode:
            items = items[:5] # Only check the 5 most recent logs in fast mode
        
        yield json.dumps({"status": f"Found {len(items)} logs. Processing..."}) + "\n"
        
        added_movies = 0
        added_logs = 0

        # Namespaces in Letterboxd RSS
        ns = {'letterboxd': 'https://letterboxd.com'}
    
        tmdb_session = requests.Session()
        tmdb_session.headers.update({
            "accept": "application/json",
            "Authorization": f"Bearer {TMDB_API_KEY}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        })

        for i, item in enumerate(items):
            title = item.find('letterboxd:filmTitle', ns)
            year = item.find('letterboxd:filmYear', ns)
            if title is None:
                continue
            
            film_title = title.text
            film_year = year.text if year is not None else ""
        
            if i % 5 == 0:
                yield json.dumps({"status": f"Processing {i+1}/{len(items)}: {film_title}..."}) + "\n"
        
            watched_date_node = item.find('letterboxd:watchedDate', ns)
            watched_date_str = watched_date_node.text if watched_date_node is not None else ""
            if not watched_date_str:
                pub_date = item.find('pubDate')
                if pub_date is not None:
                    # Very simple fallback for pubdate string parsing
                    watched_date_str = datetime.strptime(pub_date.text[5:16], "%d %b %Y").strftime("%Y-%m-%d")
                else:
                    watched_date_str = date.today().strftime("%Y-%m-%d")
                
            rating_node = item.find('letterboxd:memberRating', ns)
            rating = float(rating_node.text) if rating_node is not None else 0
        
            rewatch_node = item.find('letterboxd:rewatch', ns)
            rewatch = True if rewatch_node is not None and rewatch_node.text == 'Yes' else False
        
            liked_node = item.find('letterboxd:memberLike', ns)
            liked = True if liked_node is not None and liked_node.text == 'Yes' else False

            import re
            description_node = item.find('description')
            review_text = ""
            if description_node is not None and description_node.text:
                review_html = description_node.text
                review_text = re.sub(r'<[^>]+>', '', review_html).strip()

            # Check if this movie exists in our local DB by name (basic check first)
            movie = Movie.query.filter_by(name=film_title).first()
            if not movie:
                # Query TMDB
                import time
                time.sleep(0.1) # Small delay
            
                search_url = f"https://api.themoviedb.org/3/search/movie?query={requests.utils.quote(film_title)}"
                if film_year:
                    search_url += f"&year={film_year}"
            
                try:
                    max_attempts = 1 if fast_mode else 3
                    timeout_secs = 3 if fast_mode else 10
                    for attempt in range(max_attempts):
                        try:
                            tmdb_r = tmdb_session.get(search_url, timeout=timeout_secs).json()
                            break
                        except requests.exceptions.ConnectionError:
                            if attempt == max_attempts - 1:
                                print(f"Skipping {film_title} due to ConnectionError after {max_attempts} attempts")
                                tmdb_r = None
                            else:
                                time.sleep(1) # wait longer before retry
                except Exception as e:
                    print(f"Error fetching {film_title}: {e}")
                    continue
                
                if tmdb_r and tmdb_r.get('results'):
                    first_result = tmdb_r['results'][0]
                    tmdb_id = first_result['id']
                    movie = Movie.query.filter_by(tmdb_id=tmdb_id).first()
                    if not movie:
                        # Fetch runtime and release_year from TMDB movie details
                        runtime_val = None
                        rel_year_val = None
                        try:
                            detail_r = tmdb_session.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}", timeout=timeout_secs).json()
                            runtime_val = detail_r.get('runtime')
                            rel_date = detail_r.get('release_date')
                            if rel_date and len(rel_date) >= 4:
                                rel_year_val = int(rel_date[:4])
                        except Exception:
                            pass
                        
                        # Fallback to first_result for release year if details failed
                        if not rel_year_val and first_result.get('release_date'):
                            try:
                                rel_year_val = int(first_result.get('release_date')[:4])
                            except:
                                pass

                        movie = Movie(
                            tmdb_id=tmdb_id,
                            name=first_result.get('title') or film_title,
                            poster_path=first_result.get('poster_path'),
                            status='WATCHED',
                            runtime=runtime_val,
                            release_year=rel_year_val
                        )
                        db.session.add(movie)
                        db.session.flush() # Get ID
                    elif not movie.runtime:
                        # Backfill runtime if missing
                        try:
                            detail_r = tmdb_session.get(f"https://api.themoviedb.org/3/movie/{tmdb_id}", timeout=timeout_secs).json()
                            movie.runtime = detail_r.get('runtime')
                        except Exception:
                            pass
                    added_movies += 1
                else:
                    continue # Couldn't find in TMDB
        
            # Ensure movie status is WATCHED if we are importing a log
            if movie.status != 'WATCHED':
                movie.status = 'WATCHED'
                db.session.commit()
            
            # Create or update diary log
            log_date = datetime.strptime(watched_date_str, "%Y-%m-%d").date()
            existing_log = MovieDiaryLog.query.filter_by(movie_id=movie.id, date=log_date).first()
            if not existing_log:
                log = MovieDiaryLog(
                    movie_id=movie.id,
                    date=log_date,
                    rating=rating,
                    rewatch=rewatch,
                    liked=liked,
                    review=review_text
                )
                db.session.add(log)
                added_logs += 1
            else:
                # If log exists but review is empty and we have a review now, update it
                updated = False
                if review_text and not existing_log.review:
                    existing_log.review = review_text
                    updated = True
                if rating and not existing_log.rating:
                    existing_log.rating = rating
                    updated = True
                if liked and not existing_log.liked:
                    existing_log.liked = True
                    updated = True
            
                if updated:
                    added_logs += 1 # Count as a modified log for user feedback

        db.session.commit()
        invalidate_stats_cache()
        yield json.dumps({"status": "complete", "success": True, "added_movies": added_movies, "added_logs": added_logs}) + "\n"

    except Exception as e:
        import traceback
        traceback.print_exc()
        print("RSS SYNC ERROR", repr(e))
        yield json.dumps({"success": False, "message": str(e)}) + "\n"

@app.route('/api/movies/sync/rss', methods=['POST'])
@require_api_key
def sync_letterboxd_rss():
    data = request.json
    username = data.get('username')
    if not username:
        return jsonify({"success": False, "message": "Username required"}), 400
    if not TMDB_API_KEY:
        return jsonify({"success": False, "message": "TMDB API Key missing on server"}), 500

    return Response(stream_with_context(_perform_rss_sync_generator(username)), mimetype='application/x-ndjson')

@app.route('/api/media/library', methods=['GET'])
@require_api_key
def get_media_library():
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    media_type = request.args.get('type', 'all')
    status_filter = request.args.get('status', 'all')
    
    combined = []
    
    if media_type in ['all', 'movie']:
        from sqlalchemy.sql import func
        movies = db.session.query(Movie, func.max(MovieDiaryLog.date).label('latest_log')).outerjoin(MovieDiaryLog, Movie.id == MovieDiaryLog.movie_id).group_by(Movie.id).all()
        for m, latest_log in movies:
            if m.status == 'NONE':
                continue
            if status_filter != 'all' and m.status != status_filter:
                continue
            
            sort_date = m.added_on
            if latest_log:
                sort_date = datetime.combine(latest_log, datetime.min.time())
                
            combined.append({
                "id": m.id,
                "tmdb_id": m.tmdb_id,
                "name": m.name,
                "poster_path": m.poster_path,
                "status": m.status,
                "added_on": sort_date,
                "type": "movie"
            })
            
    if media_type in ['all', 'tv']:
        from sqlalchemy.sql import func
        shows = db.session.query(TvShow, func.max(TvDiaryLog.date).label('latest_log')).outerjoin(TvDiaryLog, TvShow.id == TvDiaryLog.tv_show_id).group_by(TvShow.id).all()
        for s, latest_log in shows:
            if s.status == 'NONE':
                continue
            if status_filter != 'all' and s.status != status_filter:
                continue
            
            sort_date = s.added_on
            if latest_log:
                sort_date = datetime.combine(latest_log, datetime.min.time())

            combined.append({
                "id": s.id,
                "tmdb_id": s.tmdb_id,
                "name": s.name,
                "poster_path": s.poster_path,
                "status": s.status,
                "added_on": sort_date,
                "type": "tv"
            })
            
    # Sort by added_on DESC, then by id DESC
    combined.sort(key=lambda x: (x['added_on'] or datetime.min, x['id']), reverse=True)
    
    # Now convert datetime to string after sorting
    for item in combined:
        if item['added_on']:
            item['added_on'] = item['added_on'].isoformat()
    
    total_count = len(combined)
    paginated = combined[offset:offset+limit]
    
    return jsonify({
        "success": True, 
        "shows": paginated, 
        "total_count": total_count,
        "hasMore": (offset + limit) < total_count
    })

@app.route('/api/media/diary', methods=['GET'])
@require_api_key
def get_media_diary():
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    media_type = request.args.get('type', 'all')
    
    show_id = request.args.get('show_id', type=int)
    
    combined = []
    
    if media_type in ['all', 'movie']:
        query = MovieDiaryLog.query.options(joinedload(MovieDiaryLog.movie))
        if show_id and media_type == 'movie':
            query = query.filter_by(movie_id=show_id)
        logs = query.all()
        for log in logs:
            combined.append({
                "id": log.id,
                "show_id": log.movie_id,
                "tmdb_id": log.movie.tmdb_id if log.movie else None,
                "show_name": log.movie.name if log.movie else "Unknown",
                "poster_path": log.movie.poster_path if log.movie else None,
                "date": log.date,
                "rating": log.rating,
                "review": log.review,
                "liked": log.liked,
                "rewatch": log.rewatch,
                "tags": log.tags,
                "created_at": log.created_at,
                "type": "movie"
            })
            
    if media_type in ['all', 'tv']:
        query = TvDiaryLog.query.options(joinedload(TvDiaryLog.tv_show))
        if show_id and media_type == 'tv':
            query = query.filter_by(tv_show_id=show_id)
        logs = query.all()
        for log in logs:
            combined.append({
                "id": log.id,
                "show_id": log.tv_show_id,
                "tmdb_id": log.tv_show.tmdb_id if log.tv_show else None,
                "show_name": log.tv_show.name if log.tv_show else "Unknown",
                "poster_path": log.tv_show.poster_path if log.tv_show else None,
                "season_number": log.season_number,
                "episode_number": log.episode_number,
                "date": log.date,
                "rating": log.rating,
                "review": log.review,
                "liked": log.liked,
                "rewatch": log.rewatch,
                "tags": log.tags,
                "created_at": log.created_at,
                "type": "tv"
            })
            
    # Sort by date DESC, then created_at DESC
    combined.sort(key=lambda x: (x['date'] or date.min, x['created_at'] or datetime.min), reverse=True)
    
    for item in combined:
        if item['date']:
            item['date'] = item['date'].isoformat() if hasattr(item['date'], 'isoformat') else str(item['date'])
        if item['created_at']:
            item['created_at'] = item['created_at'].isoformat() if hasattr(item['created_at'], 'isoformat') else str(item['created_at'])
    
    total_count = len(combined)
    paginated = combined[offset:offset+limit]
    
    return jsonify({
        "success": True, 
        "logs": paginated, 
        "total_count": total_count,
        "hasMore": (offset + limit) < total_count
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
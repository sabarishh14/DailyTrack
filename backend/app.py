from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import os
from datetime import datetime, date
import json
import pytz # <-- Add this line
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
    
    # Apply pagination
    transactions = query.limit(limit).offset(offset).all()

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
            "exclude_analytics": getattr(tx, 'exclude_analytics', False)
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
            
            # --- NEW: Automatically Update Account Balance ---
            account_record = Account.query.filter_by(account=acc_name).first()
            
            # Only update if the account exists and has balance tracking enabled (except CC-PINNACLE 6360)
            if account_record and account_record.balance_tracked and acc_name != "CC-PINNACLE 6360":
                if tx_type == 'Credit':
                    account_record.balance += amount
                elif tx_type in ['Debit', 'Savings']:
                    account_record.balance -= amount
                    
            added_count += 1
            
        db.session.commit()
        return jsonify({"success": True, "message": f"Successfully added {added_count} transactions & updated balances!"})

    except Exception as e:
        print(f"❌ Error adding transaction(s): {str(e)}")
        db.session.rollback() # Safely undo everything if there's an error
        return jsonify({"success": False, "message": str(e)})

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
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

app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "connect_args": {
        "sslmode": "require"
    }
}

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Account(db.Model):
    __tablename__ = "accounts"
    account = db.Column(db.String(50), primary_key=True)
    balance = db.Column(db.Float, default=0)
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
    synced = db.Column(db.Boolean, default=False)  # NEW

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

class Investment(db.Model):
    __tablename__ = "investments"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    
    # Stocks
    inv_stocks = db.Column(db.Float, default=0.0)
    curr_stocks = db.Column(db.Float, default=0.0)
    ret_pct_stocks = db.Column(db.Float, default=0.0)
    status_stocks = db.Column(db.String(10))
    
    # Mutual Funds
    inv_mf = db.Column(db.Float, default=0.0)
    curr_mf = db.Column(db.Float, default=0.0)
    ret_pct_mf = db.Column(db.Float, default=0.0)
    status_mf = db.Column(db.String(10))
    
    # Totals
    total_inv = db.Column(db.Float, default=0.0)
    total_curr = db.Column(db.Float, default=0.0)
    total_ret_pct = db.Column(db.Float, default=0.0)
    total_status = db.Column(db.String(10))
    synced = db.Column(db.Boolean, default=False) 

class SyncLog(db.Model):
    __tablename__ = "sync_log"
    id = db.Column(db.BigInteger, primary_key=True)
    last_sync = db.Column(db.DateTime, nullable=False)

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
        unsynced = Transaction.query.filter_by(synced=False).order_by(Transaction.date.asc()).all()
        
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
@require_api_key  # <-- Add this line to protect the route
def get_accounts():
    accounts = Account.query.all()

    result = [
        {
            "account": acc.account,
            "balance": acc.balance,
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

@app.route('/api/transactions/bulk', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def bulk_transactions():
    rows = request.json  # list of transaction dicts
    imported_count = 0

    for data in rows:
        try:
            date_str = data['date']
            if 'T' in date_str:
                date_str = date_str.split('T')[0]

            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            month_obj = date_obj.replace(day=1)

            amount_str = str(data.get('amount', '')).strip()
            if not amount_str:
                continue

            amount = float(amount_str)

            # Check duplicate in DB
            duplicate = Transaction.query.filter_by(
                date=date_obj,
                account=data['account'],
                amount=amount,
                heading=data['heading']
            ).first()

            if duplicate:
                continue

            new_tx = Transaction(
                id=int(datetime.now().timestamp() * 1000) + imported_count,
                account=data['account'],
                date=date_obj,
                month=month_obj,
                type=data['type'].lower(),
                heading=data['heading'],
                description=data.get('description', ''),
                amount=amount
            )

            db.session.add(new_tx)

            # Update account balance
            account = Account.query.filter_by(account=data['account']).first()
            if account and account.balance_tracked and data['account'] != "CC-PINNACLE 6360":
                if data['type'].lower() == "credit":
                    account.balance += amount
                elif data['type'].lower() == "debit":
                    account.balance -= amount

            imported_count += 1

        except Exception as e:
            print("Skipping row:", e)
            continue

    db.session.commit()

    return jsonify({
        "success": True,
        "imported": imported_count
    })

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
            "amount": tx.amount
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
                amount=amount
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

        # 2. UPDATE the transaction fields
        date_obj = datetime.strptime(data['date'], '%Y-%m-%d')
        tx.date = date_obj
        tx.month = date_obj.replace(day=1)
        tx.type = data['type']
        tx.heading = data['heading']
        tx.description = data.get('description', '')
        tx.amount = float(data['amount'])
        tx.account = data['account']
        
        # Mark as unsynced so it gets pushed to Sheets again
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
            tx.date = date_obj
            tx.month = date_obj.replace(day=1)
            tx.type = data['type']
            tx.heading = data['heading']
            tx.description = data.get('description', '')
            tx.amount = float(data['amount'])
            tx.account = data['account']
            
            # Mark as unsynced so Google Sheets catches the changes
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

# ---- INVESTMENTS ----
@app.route('/api/investments', methods=['GET'])
@require_api_key  # <-- Add this line to protect the route
def get_investments():
    records = Investment.query.order_by(Investment.date.desc()).all()

    result = [
        {
            "id": r.id,
            "date": r.date.strftime("%Y-%m-%d"),
            "inv_stocks": r.inv_stocks,
            "curr_stocks": r.curr_stocks,
            "ret_pct_stocks": r.ret_pct_stocks,
            "status_stocks": r.status_stocks,
            "inv_mf": r.inv_mf,
            "curr_mf": r.curr_mf,
            "ret_pct_mf": r.ret_pct_mf,
            "status_mf": r.status_mf,
            "total_inv": r.total_inv,
            "total_curr": r.total_curr,
            "total_ret_pct": r.total_ret_pct,
            "total_status": r.total_status
        }
        for r in records
    ]

    return jsonify(result)

@app.route('/api/investments', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def add_investment():
    data = request.json
    date_obj = datetime.strptime(data['date'], '%Y-%m-%d')

    new_record = Investment(
        id=int(datetime.now().timestamp() * 1000),
        date=date_obj,
        inv_stocks=float(data.get('inv_stocks', 0)),
        curr_stocks=float(data.get('curr_stocks', 0)),
        ret_pct_stocks=float(data.get('ret_pct_stocks', 0)),
        status_stocks=data.get('status_stocks', ''),
        inv_mf=float(data.get('inv_mf', 0)),
        curr_mf=float(data.get('curr_mf', 0)),
        ret_pct_mf=float(data.get('ret_pct_mf', 0)),
        status_mf=data.get('status_mf', ''),
        total_inv=float(data.get('total_inv', 0)),
        total_curr=float(data.get('total_curr', 0)),
        total_ret_pct=float(data.get('total_ret_pct', 0)),
        total_status=data.get('total_status', '')
    )

    db.session.add(new_record)
    db.session.commit()

    return jsonify({"success": True})

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
        # Force the server to calculate "today" based on Indian Standard Time
        ist_timezone = pytz.timezone('Asia/Kolkata')
        today_date = datetime.now(ist_timezone).date()
        
        # 1. Check if already synced today to prevent duplicates
        if Investment.query.filter_by(date=today_date).first():
            return jsonify({"success": False, "message": f"Already synced investments for {today_date.strftime('%d/%m/%Y')}!"})

        # 2. Generate Checksum & Get Access Token
        raw = KITE_API_KEY + request_token + KITE_API_SECRET
        checksum = hashlib.sha256(raw.encode('utf-8')).hexdigest()

        token_res = requests.post("https://api.kite.trade/session/token", data={
            "api_key": KITE_API_KEY,
            "request_token": request_token,
            "checksum": checksum
        })
        
        token_data = token_res.json()
        if token_data.get('status') != 'success':
            return jsonify({"success": False, "message": "Kite Auth Failed. Is your Request Token valid for today?"})
        
        access_token = token_data['data']['access_token']
        print("✅ Access token generated")

        # 3. Fetch Holdings
        headers = {"Authorization": f"token {KITE_API_KEY}:{access_token}"}
        holdings_res = requests.get("https://api.kite.trade/mf/holdings", headers=headers)
        holdings_data = holdings_res.json().get('data', [])
        
        if not holdings_data:
            return jsonify({"success": False, "message": "No MF holdings found in Kite."})
        print(f"✅ Fetched {len(holdings_data)} holdings")

        # 4. Fetch Instruments (for latest NAV and Real Names)
        instruments_res = requests.get("https://api.kite.trade/mf/instruments")
        reader = csv.DictReader(io.StringIO(instruments_res.text))
        mf_data_map = {}
        for row in reader:
            if row.get('tradingsymbol'):
                mf_data_map[row['tradingsymbol']] = {
                    'nav': float(row.get('last_price', 0) or 0),
                    'name': row.get('name', row['tradingsymbol'])
                }
        print("✅ Parsed instruments CSV for NAVs and Names")

        # 5. Calculate Totals and Prepare Holdings
        total_inv = 0.0
        total_curr = 0.0
        daily_holdings = []

        for h in holdings_data:
            raw_symbol = h['tradingsymbol']
            qty = float(h['quantity'])
            avg_price = float(h['average_price'])
            
            fund_info = mf_data_map.get(raw_symbol)
            if not fund_info or not fund_info['nav']:
                continue
                
            nav = fund_info['nav']
            real_name = fund_info['name'] # Extract the actual name
            
            fund_inv = (qty * avg_price)
            fund_curr = (qty * nav)
            
            total_inv += fund_inv
            total_curr += fund_curr
            
            # Create holding record using the real name
            daily_holdings.append(MutualFundHolding(
                id=int(datetime.now().timestamp() * 1000) + len(daily_holdings),
                date=today_date,
                symbol=real_name, # <--- Saved as Real Name here
                quantity=qty,
                average_price=avg_price,
                nav=nav,
                invested_value=fund_inv,
                current_value=fund_curr
            ))
            
        # 6. Calculate Returns and Status (Keep your existing code here)
        ret_pct = ((total_curr - total_inv) / total_inv * 100) if total_inv > 0 else 0
        prev = Investment.query.filter(Investment.date < today_date).order_by(Investment.date.desc()).first()
        status = "⬆️💹" if not prev or ret_pct >= prev.ret_pct_mf else "⬇️📉"

        # 7. Save to Database
        new_inv = Investment(
            id=int(datetime.now().timestamp() * 1000),
            date=today_date,
            inv_stocks=0.0, curr_stocks=0.0, ret_pct_stocks=0.0, status_stocks="—",
            inv_mf=total_inv, curr_mf=total_curr, ret_pct_mf=ret_pct, status_mf=status,
            total_inv=total_inv, total_curr=total_curr, total_ret_pct=ret_pct, total_status=status
        )
        db.session.add(new_inv)
        db.session.add_all(daily_holdings) # <--- ADD THIS LINE
        db.session.commit()

        print(f"✅ Synced to DB! Inv: {total_inv}, Curr: {total_curr}")
        return jsonify({"success": True, "message": f"Successfully synced from Kite!"})

    except Exception as e:
        print(f"❌ Kite Sync Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/sync/investments-to-sheets', methods=['POST'])
@require_api_key  # <-- Add this line to protect the route
def sync_investments_to_sheets():
    try:
        # Fetch only unsynced investments
        unsynced_invs = Investment.query.filter_by(synced=False).all()
        
        if not unsynced_invs:
            return jsonify({"success": True, "message": "No new investments to sync to Sheets."})

        # Format the payload for Apps Script
        payload = {
            "type": "investments",
            "data": [
                {
                    "date": inv.date.strftime("%Y-%m-%d"),
                    "total_inv": float(inv.total_inv),
                    "total_curr": float(inv.total_curr)
                } for inv in unsynced_invs
            ]
        }

        print(f"📡 Sending {len(unsynced_invs)} records to Google Sheets...")
        response = requests.post(SHEETS_URL, json=payload, timeout=60)
        
        if response.status_code == 200:
            # Mark as synced in the database
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

        # Check if email is in your allowed list
        if email not in ALLOWED_EMAILS:
            return jsonify({"success": False, "message": f"Access denied for {email}"}), 403

        # Issue our own JWT
        token = jwt.encode({
            "sub": email,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(days=30)
        }, JWT_SECRET, algorithm="HS256")

        return jsonify({"success": True, "token": token})

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

@app.route('/api/investments/history', methods=['GET'])
@require_api_key
def get_investment_history():
    symbol = request.args.get('symbol') # Optional: specific MF
    
    if symbol:
        history = MutualFundHolding.query.filter_by(symbol=symbol).order_by(MutualFundHolding.date.asc()).all()
        data = [{"date": h.date.strftime("%Y-%m-%d"), "value": h.current_value, "invested": h.invested_value} for h in history]
    else:
        history = Investment.query.order_by(Investment.date.asc()).all()
        data = [{"date": h.date.strftime("%Y-%m-%d"), "value": h.total_curr, "invested": h.total_inv} for h in history]
        
    return jsonify(data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
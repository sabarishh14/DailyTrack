from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import os
from datetime import datetime, date
import json
import requests

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = "postgresql+psycopg2://neondb_owner:npg_8LvdCXOIz5Ho@ep-green-surf-air145w2-pooler.c-4.us-east-1.aws.neon.tech/neondb"

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
    active = db.Column(db.Boolean, nullable=False)
    activity = db.Column(db.String(255))

class Investment(db.Model):
    __tablename__ = "investments"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    inv_mf = db.Column(db.Float, nullable=False)
    curr_mf = db.Column(db.Float, nullable=False)
    ret_amount = db.Column(db.Float, nullable=False)
    ret_pct = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(5))

class SyncLog(db.Model):
    __tablename__ = "sync_log"
    id = db.Column(db.BigInteger, primary_key=True)
    last_sync = db.Column(db.DateTime, nullable=False)

SHEETS_URL = "https://script.google.com/macros/s/AKfycbxmBBF0-oRREVy66H-mL6DGpdgY5fjgL8S1Nr13HBBVVfTbznemzSBWtnsYpPPbGbdb2A/exec"

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

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

@app.route("/api/sync/db-to-sheets", methods=["POST"])
def sync_db_to_sheets():
    try:
        transactions = get_transactions_for_sync()
        if not transactions:
            return jsonify({"success": True, "message": "No new transactions to sync"})

        # HITL: print transactions and ask for confirmation
        print(f"{len(transactions)} new transaction(s) detected:")
        for tx in transactions:
            print(f"{tx['date']} | {tx['account']} | {tx['type']} | {tx['heading']} | {tx['amount']}")

        ans = input("Send these to Sheets? (y/n): ")
        if ans.lower() != "y":
            return jsonify({"success": False, "message": "Sync aborted by user"})

        # Send to Apps Script
        response = requests.post(SHEETS_URL, json=transactions, timeout=60)
        if response.status_code != 200:
            return jsonify({"success": False, "message": f"Sheets error: {response.text}"})

        # Mark transactions as synced
        for tx in transactions:
            tx_obj = Transaction.query.get(tx['id'])
            tx_obj.synced = True
        db.session.commit()

        return jsonify({"success": True, "inserted": len(transactions)})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)})
    
# ---- ACCOUNTS ----
@app.route('/api/accounts', methods=['GET'])
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
def update_account():
    data = request.json

    account = Account.query.filter_by(account=data['account']).first()

    if not account:
        return jsonify({"success": False, "message": "Account not found"}), 404

    account.balance = float(data['balance'])

    db.session.commit()

    return jsonify({'success': True})

@app.route('/api/transactions/bulk', methods=['POST'])
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
            if account and account.balance_tracked:
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
def get_transactions():
    # Pagination and filtering parameters
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)
    month_filter = request.args.get('month')  # Format: YYYY-MM
    year_filter = request.args.get('year', type=int)
    
    # Limit max results to prevent abuse
    limit = min(limit, 500)
    
    query = Transaction.query.order_by(Transaction.date.desc())
    
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
def add_transaction():
    data = request.json

    date_obj = datetime.strptime(data['date'], '%Y-%m-%d')
    month_obj = date_obj.replace(day=1)

    new_tx = Transaction(
        id=int(datetime.now().timestamp() * 1000),
        account=data['account'],
        date=date_obj,
        month=month_obj,
        type=data['type'].lower(),
        heading=data['heading'],
        description=data.get('description', ''),
        amount=float(data['amount'])
    )

    db.session.add(new_tx)

    # Update account balance
    account = Account.query.filter_by(account=data['account']).first()

    if account and account.balance_tracked:
        if data['type'].lower() == 'credit':
            account.balance += float(data['amount'])
        elif data['type'].lower() == 'debit':
            account.balance -= float(data['amount'])

    db.session.commit()

    return jsonify({'success': True, 'id': new_tx.id})

@app.route('/api/transactions/<int:tid>', methods=['DELETE'])
def delete_transaction(tid):
    tx = Transaction.query.filter_by(id=tid).first()

    if not tx:
        return jsonify({"success": False, "message": "Transaction not found"}), 404

    account = Account.query.filter_by(account=tx.account).first()

    if account and account.balance_tracked:
        if tx.type.lower() == "credit":
            account.balance -= tx.amount
        elif tx.type.lower() == "debit":
            account.balance += tx.amount

    db.session.delete(tx)
    db.session.commit()

    return jsonify({"success": True})

# ---- PHYSICAL ACTIVITY ----
@app.route('/api/physical', methods=['GET'])
def get_physical():
    records = PhysicalActivity.query.order_by(PhysicalActivity.date.desc()).all()

    result = [
        {
            "id": r.id,
            "date": r.date.strftime("%Y-%m-%d"),
            "active": r.active,
            "activity": r.activity
        }
        for r in records
    ]

    return jsonify(result)

@app.route('/api/physical', methods=['POST'])
def add_physical():
    data = request.json

    date_obj = datetime.strptime(data['date'], '%Y-%m-%d')

    record = PhysicalActivity.query.filter_by(date=date_obj).first()

    if record:
        record.active = data['active']
        record.activity = data.get('activity', '')
    else:
        record = PhysicalActivity(
            id=int(datetime.now().timestamp() * 1000),
            date=date_obj,
            active=data['active'],
            activity=data.get('activity', '')
        )
        db.session.add(record)

    db.session.commit()

    return jsonify({"success": True})

# ---- INVESTMENTS ----
@app.route('/api/investments', methods=['GET'])
def get_investments():
    records = Investment.query.order_by(Investment.date.desc()).all()

    result = [
        {
            "id": r.id,
            "date": r.date.strftime("%Y-%m-%d"),
            "inv_mf": r.inv_mf,
            "curr_mf": r.curr_mf,
            "ret_amount": r.ret_amount,
            "ret_pct": r.ret_pct,
            "status": r.status
        }
        for r in records
    ]

    return jsonify(result)

@app.route('/api/sync/sheets', methods=['POST'])
def sync_from_sheets():
    print("🔄 Sync request received from frontend")
    try:
        print(f"📡 Fetching from Sheets URL: {SHEETS_URL}")
        response = requests.get(
            SHEETS_URL,
            params={"type": "transactions"},
            timeout=30
        )
        print(f"✅ Sheets response status: {response.status_code}")

        try:
            sheet_transactions = response.json()
            print(f"📦 Parsed JSON, type: {type(sheet_transactions)}, count: {len(sheet_transactions) if isinstance(sheet_transactions, list) else 'N/A'}")
        except Exception as je:
            print(f"❌ JSON parse error: {je}")
            print(f"📋 Response text: {response.text[:500]}")
            return jsonify({
                "success": False,
                "message": f"Failed to parse Sheets response: {str(je)}"
            })

        if not isinstance(sheet_transactions, list):
            print(f"❌ Invalid response type: {type(sheet_transactions)}")
            return jsonify({
                "success": False,
                "message": "Invalid response from Sheets"
            })

        # Pre-load all accounts into memory to avoid repeated queries
        print(f"📥 Pre-loading accounts...")
        all_accounts = {acc.account: acc for acc in Account.query.all()}
        print(f"✅ Loaded {len(all_accounts)} accounts")

        # Query ONLY the keys needed for dedup (single efficient query)
        print(f"🔍 Building dedup set from database...")
        existing_txs = set()
        for tx in db.session.query(Transaction.date, Transaction.account, Transaction.amount, Transaction.heading).all():
            existing_txs.add((str(tx.date), tx.account, float(tx.amount), tx.heading))
        print(f"✅ Loaded {len(existing_txs)} existing transaction signatures")

        imported_count = 0
        skipped_count = 0
        batch_size = 100
        print(f"🔄 Starting to process {len(sheet_transactions)} transactions (batch size: {batch_size})...")

        for i, tx in enumerate(sheet_transactions):
            try:
                if i % 500 == 0:
                    print(f"  [{i}/{len(sheet_transactions)}] Processing...")
                
                sheet_id = str(tx.get('id', ''))
                if not sheet_id:
                    continue

                date_str = tx.get('date', '')
                if not date_str:
                    continue
                    
                if 'T' in date_str:
                    date_str = date_str.split('T')[0]

                amount_str = str(tx.get('amount', '')).strip()
                if not amount_str:
                    continue

                try:
                    amount = float(amount_str)
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError:
                    continue

                account_name = tx.get('account', '')
                heading = tx.get('heading', '')

                # Check if this transaction already exists (in-memory set lookup - O(1))
                tx_key = (date_str, account_name, amount, heading)
                if tx_key in existing_txs:
                    skipped_count += 1
                    continue

                month_obj = date_obj.replace(day=1)

                new_tx = Transaction(
                    id=int(sheet_id),
                    account=account_name,
                    date=date_obj,
                    month=month_obj,
                    type=tx.get('type', 'debit').lower(),
                    heading=heading,
                    description=tx.get('description', ''),
                    amount=amount
                )

                db.session.add(new_tx)
                existing_txs.add(tx_key)

                # Update account balance from pre-loaded accounts
                if account_name in all_accounts:
                    if tx.get('type', '').lower() == "credit":
                        all_accounts[account_name].balance += amount
                    elif tx.get('type', '').lower() == "debit":
                        all_accounts[account_name].balance -= amount

                imported_count += 1

                # Commit in batches
                if imported_count % batch_size == 0:
                    db.session.commit()
                    print(f"  ✓ Batch committed: {imported_count} imported, {skipped_count} skipped")

            except Exception as e:
                print(f"⚠️  Skipping tx {i}: {type(e).__name__}: {str(e)}")
                continue

        print(f"💾 Final commit for remaining {imported_count % batch_size or batch_size} transactions...")
        try:
            db.session.commit()
            print(f"✅ Database commit successful")
        except Exception as commit_err:
            print(f"❌ Commit error: {type(commit_err).__name__}: {str(commit_err)}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            return jsonify({
                "success": False,
                "message": f"Database commit failed: {str(commit_err)}"
            })

        print(f"✨ Sync complete: {imported_count}/{len(sheet_transactions)} imported")
        return jsonify({
            "success": True,
            "sheet_count": len(sheet_transactions),
            "imported": imported_count
        })

    except Exception as e:
        print(f"❌ OUTER SYNC ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "message": str(e)
        })

@app.route('/api/investments', methods=['POST'])
def add_investment():
    data = request.json

    date_obj = datetime.strptime(data['date'], '%Y-%m-%d')

    prev = Investment.query.order_by(Investment.date.desc()).first()

    status = "📈"
    if prev:
        status = "📈" if float(data['ret_pct']) >= prev.ret_pct else "📉"

    inv_mf = float(data['inv_mf'])
    curr_mf = float(data['curr_mf'])
    ret_amount = curr_mf - inv_mf
    ret_pct = float(data['ret_pct'])

    new_record = Investment(
        id=int(datetime.now().timestamp() * 1000),
        date=date_obj,
        inv_mf=inv_mf,
        curr_mf=curr_mf,
        ret_amount=ret_amount,
        ret_pct=ret_pct,
        status=status
    )

    db.session.add(new_record)
    db.session.commit()

    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
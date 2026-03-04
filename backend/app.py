from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import os
from datetime import datetime, date
import json
import requests
import hashlib
import csv 
import io     

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
    gym = db.Column(db.Boolean, default=False)
    badminton = db.Column(db.Boolean, default=False)
    table_tennis = db.Column(db.Boolean, default=False)
    cricket = db.Column(db.Boolean, default=False)
    others = db.Column(db.Boolean, default=False)
    description = db.Column(db.String(255))

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
    try:
        data = request.json
        
        # Make it smart: if it's a single dict, wrap it in a list so we can use one loop
        transactions_data = data if isinstance(data, list) else [data]
        
        added_count = 0
        
        for item in transactions_data:
            date_obj = datetime.strptime(item['date'], '%Y-%m-%d')
            # For the month column, we typically store the 1st day of that month
            month_obj = date_obj.replace(day=1)
            
            new_tx = Transaction(
                # Add added_count to the timestamp so they don't get identical IDs if added in the same millisecond
                id=int(datetime.now().timestamp() * 1000) + added_count,
                account=item['account'],
                date=date_obj,
                month=month_obj,
                type=item['type'],
                heading=item['heading'],
                description=item.get('description', ''),
                amount=float(item['amount'])
            )
            db.session.add(new_tx)
            added_count += 1
            
        db.session.commit()
        return jsonify({"success": True, "message": f"Successfully added {added_count} transactions!"})

    except Exception as e:
        print(f"❌ Error adding transaction(s): {str(e)}")
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})
    
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
def sync_kite_direct():
    print("🔄 Starting direct Kite sync...")
    data = request.json
    request_token = data.get('request_token')
    
    if not request_token:
        return jsonify({"success": False, "message": "Request token is required for Kite API"})

    API_KEY = "6gcxnf0qycaphw5k"
    API_SECRET = "80h6ufr05f28bbl5ewxdfzezilanjwtn"

    try:
        today_date = datetime.now().date()
        
        # 1. Check if already synced today to prevent duplicates
        if Investment.query.filter_by(date=today_date).first():
            return jsonify({"success": False, "message": f"Already synced investments for {today_date.strftime('%d/%m/%Y')}!"})

        # 2. Generate Checksum & Get Access Token
        raw = API_KEY + request_token + API_SECRET
        checksum = hashlib.sha256(raw.encode('utf-8')).hexdigest()

        token_res = requests.post("https://api.kite.trade/session/token", data={
            "api_key": API_KEY,
            "request_token": request_token,
            "checksum": checksum
        })
        
        token_data = token_res.json()
        if token_data.get('status') != 'success':
            return jsonify({"success": False, "message": "Kite Auth Failed. Is your Request Token valid for today?"})
        
        access_token = token_data['data']['access_token']
        print("✅ Access token generated")

        # 3. Fetch Holdings
        headers = {"Authorization": f"token {API_KEY}:{access_token}"}
        holdings_res = requests.get("https://api.kite.trade/mf/holdings", headers=headers)
        holdings_data = holdings_res.json().get('data', [])
        
        if not holdings_data:
            return jsonify({"success": False, "message": "No MF holdings found in Kite."})
        print(f"✅ Fetched {len(holdings_data)} holdings")

        # 4. Fetch Instruments (for latest NAV)
        instruments_res = requests.get("https://api.kite.trade/mf/instruments")
        
        # Parse the CSV string into a dictionary: { "tradingsymbol": last_price }
        reader = csv.DictReader(io.StringIO(instruments_res.text))
        mf_nav_data = {}
        for row in reader:
            if row.get('last_price') and row.get('tradingsymbol'):
                mf_nav_data[row['tradingsymbol']] = float(row['last_price'])
        print("✅ Parsed instruments CSV")

        # 5. Calculate Totals (Replicating your Apps Script logic)
        total_inv = 0.0
        total_curr = 0.0

        for h in holdings_data:
            symbol = h['tradingsymbol']
            qty = float(h['quantity'])
            avg_price = float(h['average_price'])
            
            nav = mf_nav_data.get(symbol)
            if not nav:
                continue
            
            total_inv += (qty * avg_price)
            total_curr += (qty * nav)

        # 6. Calculate Returns and Status
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
        db.session.commit()

        print(f"✅ Synced to DB! Inv: {total_inv}, Curr: {total_curr}")
        return jsonify({"success": True, "message": f"Successfully synced from Kite!"})

    except Exception as e:
        print(f"❌ Kite Sync Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/sync/investments-to-sheets', methods=['POST'])
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

if __name__ == "__main__":
    app.run(debug=True, port=5000)
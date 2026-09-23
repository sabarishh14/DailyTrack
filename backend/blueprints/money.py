from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta, timezone
import os
import re
import json
import pytz
import requests
import pandas as pd
from extensions import (
    db,
    SHEETS_URL, JWT_SECRET, ALLOWED_EMAILS, ADMIN_USER, ADMIN_PASS,
    KITE_API_KEY, KITE_API_SECRET, TMDB_API_KEY,
)
from models import *
from access import require_api_key, require_admin, require_access, current_access

from blueprints.media import invalidate_stats_cache, _perform_rss_sync_generator, fetch_tmdb_movie_details

money_bp = Blueprint("money", __name__)

def is_cc_account(acc_name):
    """Check if account is a credit card account (starts with 'CC')."""
    return bool(acc_name and acc_name.strip().upper().startswith("CC"))
def _need_full_money():
    """Whole-ledger operations are only for users who can see the whole ledger."""
    if not current_access().full_money_edit:
        return jsonify({"success": False, "code": "FORBIDDEN", "message": "This needs edit access to all money data"}), 403
    return None
def _out_of_scope():
    return jsonify({"success": False, "code": "FORBIDDEN", "message": "That category or account is outside your access"}), 403
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
@money_bp.route('/api/sync/check-transactions', methods=['GET'])
@require_access("money")
def check_tx_sync():
    denied = _need_full_money()
    if denied: return denied
    try:
        # Just count how many are waiting
        count = Transaction.query.filter_by(synced=False).count()
        return jsonify({"success": True, "count": count})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
@money_bp.route('/api/sync/db-to-sheets', methods=['POST'])
@require_access("money")
def sync_db_to_sheets():
    denied = _need_full_money()
    if denied: return denied
    try:
        BATCH_SIZE = 5
        unsynced = Transaction.query.filter_by(synced=False).order_by(Transaction.date.asc(), Transaction.id.asc()).limit(BATCH_SIZE).all()
        
        if not unsynced:
            return jsonify({"success": True, "message": "No new transactions to sync to Sheets.", "synced_count": 0, "has_more": False})

        # Collect IDs and build payload BEFORE any DB changes
        tx_ids = [t.id for t in unsynced]
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

        # ==========================================
        # OPTIMISTIC UPDATE: Mark synced FIRST, then fire to GAS.
        # Single bulk SQL UPDATE — one round-trip instead of N ORM mutations.
        # ==========================================
        Transaction.query.filter(Transaction.id.in_(tx_ids)).update(
            {Transaction.synced: True}, synchronize_session='fetch'
        )
        db.session.commit()
        print(f"✅ Marked {len(unsynced)} transactions as synced in DB")

        # Now fire the request to GAS
        sheets_msg = ""
        try:
            print(f"📡 Sending {len(unsynced)} transactions to Google Sheets...")
            response = requests.post(SHEETS_URL, json=payload, timeout=30)
            if response.status_code == 200:
                try:
                    res_data = response.json()
                    sheets_msg = res_data.get('message', 'Sheet updated')
                except ValueError:
                    sheets_msg = "Sheet updated (no JSON response)"
            else:
                sheets_msg = f"Sheet returned HTTP {response.status_code}"
        except requests.exceptions.Timeout:
            # GAS received the payload and is still processing — this is FINE.
            sheets_msg = "Sheet is processing (timed out waiting, but data was sent)"
            print(f"⏳ GAS timed out but data was sent, DB already updated")
        except requests.exceptions.ConnectionError:
            # Request never reached GAS at all — ROLLBACK
            Transaction.query.filter(Transaction.id.in_(tx_ids)).update(
                {Transaction.synced: False}, synchronize_session='fetch'
            )
            db.session.commit()
            print(f"❌ Connection error — rolled back synced status")
            return jsonify({"success": False, "message": "Could not connect to Google Sheets. Rolled back."})

        has_more = Transaction.query.filter_by(synced=False).count() > 0
        
        return jsonify({
            "success": True, 
            "message": f"Synced {len(unsynced)} transactions. {sheets_msg}",
            "synced_count": len(unsynced),
            "has_more": has_more
        })

    except Exception as e:
        print(f"❌ Sheets Sync Error: {str(e)}")
        return jsonify({"success": False, "message": str(e)})
# ---- ACCOUNTS ----
@money_bp.route('/api/accounts', methods=['GET'])
@require_access("money")
def get_accounts():
    access = current_access()
    accounts = [acc for acc in Account.query.all() if access.account_allowed(acc.account)]
    show = access.balances_visible
    result = [
        {
            "account": acc.account,
            "balance": acc.balance if show else None,
            "real_balance": acc.real_balance if show else None, # <-- ADD THIS LINE
            "balance_tracked": acc.balance_tracked
        }
        for acc in accounts
    ]
    return jsonify(result)

@money_bp.route('/api/accounts', methods=['PUT'])
@require_access("money")
def update_account():
    denied = _need_full_money()
    if denied: return denied
    data = request.json

    account = Account.query.filter_by(account=data['account']).first()

    if not account:
        return jsonify({"success": False, "message": "Account not found"}), 404

    account.balance = float(data['balance'])

    db.session.commit()

    return jsonify({'success': True})
@money_bp.route('/api/transactions/categories', methods=['GET'])
@require_access("money")
def get_categories():
    try:
        # SQL DISTINCT is O(1) payload size and extremely fast on the DB level
        cats = current_access().scope_transactions(db.session.query(Transaction.heading)).distinct().all()
        return jsonify({"success": True, "categories": sorted([c[0] for c in cats if c[0]])})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
# ---- BUDGETS ----
@money_bp.route('/api/budgets', methods=['GET'])
@require_access("money")
def get_budgets():
    try:
        access = current_access()
        budgets = [b for b in Budget.query.all() if access.category_allowed(b.category)]
        result = [{"category": b.category, "monthly_limit": b.monthly_limit} for b in budgets]
        return jsonify({"success": True, "budgets": result})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@money_bp.route('/api/budgets', methods=['PUT'])
@require_access("money")
def update_budget():
    data = request.json
    category = data.get('category')
    monthly_limit = data.get('monthly_limit')
    
    if not category:
        return jsonify({"success": False, "message": "Category is required"}), 400
    if not current_access().category_allowed(category):
        return _out_of_scope()

    try:
        budget = Budget.query.filter_by(category=category).first()
        if monthly_limit is None or float(monthly_limit) <= 0:
            if budget:
                db.session.delete(budget)
        else:
            if budget:
                budget.monthly_limit = float(monthly_limit)
            else:
                new_budget = Budget(category=category, monthly_limit=float(monthly_limit))
                db.session.add(new_budget)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})

@money_bp.route('/api/budgets/bulk', methods=['PUT'])
@require_access("money")
def update_budgets_bulk():
    data = request.json
    if not isinstance(data, list):
        return jsonify({"success": False, "message": "Expected an array of budgets"}), 400
    if any(item.get('category') and not current_access().category_allowed(item.get('category')) for item in data):
        return _out_of_scope()
        
    try:
        for item in data:
            category = item.get('category')
            monthly_limit = item.get('monthly_limit')
            if not category:
                continue
                
            budget = Budget.query.filter_by(category=category).first()
            if monthly_limit is None or float(monthly_limit) <= 0:
                if budget:
                    db.session.delete(budget)
            else:
                if budget:
                    budget.monthly_limit = float(monthly_limit)
                else:
                    new_budget = Budget(category=category, monthly_limit=float(monthly_limit))
                    db.session.add(new_budget)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)})

@money_bp.route('/api/budgets/suggestions', methods=['GET'])
@require_access("money")
def get_budget_suggestions():
    """Suggest a monthly budget per category from spending history.

    Uses an exponentially-weighted average over completed months (the
    in-progress month is excluded so it can't drag the average down), so
    recent months count more than older ones. Categories need at least 2
    completed months of spend before a suggestion is confident enough to
    surface. "Debit" only, excluding exclude_analytics — same definition
    of "spent" the budget progress bars already use, so the numbers line
    up with what the user sees on screen.
    """
    try:
        rows = (
            current_access().scope_transactions(db.session.query(Transaction.heading, Transaction.month, Transaction.amount))
            .filter(Transaction.type == 'Debit')
            .filter(db.or_(Transaction.exclude_analytics == False, Transaction.exclude_analytics.is_(None)))
            .all()
        )
        if not rows:
            return jsonify({"success": True, "suggestions": {}})

        df = pd.DataFrame(rows, columns=["heading", "month", "amount"])
        df["month"] = pd.to_datetime(df["month"])

        current_month_start = pd.Timestamp(date.today().replace(day=1))
        df = df[df["month"] < current_month_start]  # drop the partial in-progress month
        if df.empty:
            return jsonify({"success": True, "suggestions": {}})

        monthly = df.groupby(["heading", "month"], as_index=False)["amount"].sum()

        suggestions = {}
        for heading, g in monthly.groupby("heading"):
            g = g.sort_values("month")
            if len(g) < 2:
                continue  # not enough history for a confident suggestion
            ewma = g["amount"].ewm(span=3, adjust=False).mean().iloc[-1]
            suggestions[heading] = {
                "suggested": round(float(ewma), 2),
                "months_of_history": int(len(g)),
            }

        return jsonify({"success": True, "suggestions": suggestions})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
# ---- TRANSACTIONS ----
@money_bp.route('/api/transactions', methods=['GET'])
@require_access("money")
def get_transactions():
    # Pagination and filtering parameters
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)
    month_filter = request.args.get('month')  # Format: YYYY-MM
    year_filter = request.args.get('year', type=int)
    
    # Limit max results to prevent abuse
    limit = min(limit, 500)
    
    # Sort by date first, then by the timestamp ID (newest added at the top)
    query = current_access().scope_transactions(Transaction.query).order_by(Transaction.date.desc(), Transaction.id.desc())
    
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

@money_bp.route('/api/transactions', methods=['POST'])
@require_access("money")
def add_transaction():
    try:
        data = request.json
        transactions_data = data if isinstance(data, list) else [data]
        added_count = 0
        access = current_access()
        if any(not access.tx_allowed(item.get('heading'), item.get('account')) for item in transactions_data):
            return _out_of_scope()
        # Cinema entries also write to SabDekho, so only link them for users who may.
        can_link_movies = access.can("sabdekho", "edit")
        
        # --- NEW: Perform a preemptive RSS sync if any transaction is a Cinema transaction
        # so that recent Letterboxd logs are in the DB before we append tags to them.
        lbx_username = next((item.get('lbx_username') for item in transactions_data if item.get('heading', '').strip().lower() == 'cinema' and item.get('lbx_username')), None) if can_link_movies else None
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
            
            # Only update if the account exists and has balance tracking enabled (except CC* accounts)
            if account_record and account_record.balance_tracked and not is_cc_account(acc_name):
                if tx_type == 'Credit':
                    account_record.balance += amount
                elif tx_type in ['Debit', 'Savings']:
                    account_record.balance -= amount
                    
            # --- NEW: Link Movie Tags ---
            movie_link_errors = []
            movie_link_successes = []
            if can_link_movies and item.get('heading', '').strip().lower() == 'cinema' and item.get('movie_tags'):
                movie_data = item.get('movie_data')
                
                if movie_data and movie_data.get('tmdb_id'):
                    tmdb_id = movie_data['tmdb_id']
                    movie_title = movie_data['title']
                    
                    movie = Movie.query.filter_by(tmdb_id=tmdb_id).first()
                    if not movie:
                        # Fetched per movie: a year left over from an earlier row
                        # in this batch must never leak onto this one.
                        details = fetch_tmdb_movie_details(tmdb_id)
                        movie = Movie(
                            tmdb_id=tmdb_id,
                            name=movie_title,
                            poster_path=movie_data.get('poster_path'),
                            status='WATCHED',
                            runtime=details["runtime"],
                            release_year=details["release_year"],
                            release_date=details["release_date"],
                            director=details["director"],
                            top_cast=details["top_cast"],
                        )
                        db.session.add(movie)
                        db.session.flush()
                        
                    # Ensure we have a diary log
                    log_date = date_obj.date()
                    existing_log = MovieDiaryLog.query.filter_by(movie_id=movie.id, date=log_date).first()
                    
                    # Add automatic tags
                    # Tag by the year of the visit itself, so a backdated entry
                    # from last December doesn't land in this year's theatre stats.
                    current_year = log_date.year
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
        return jsonify({"success": False, "message": str(e)}), 500
@money_bp.route('/api/sync/ocr-split', methods=['POST'])
@require_access("money")
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
@money_bp.route('/api/splits', methods=['POST'])
@require_access("money")
def save_split():
    try:
        data = request.json
        transaction_id = data.get('transaction_id')
        total_amount = data.get('total_amount')
        members = data.get('members', [])
        new_tx_amount = data.get('transaction_amount')
        
        if not transaction_id or total_amount is None:
            return jsonify({"success": False, "message": "transaction_id and total_amount required"}), 400
        scoped_tx = Transaction.query.get(transaction_id)
        if scoped_tx and not current_access().tx_allowed(scoped_tx.heading, scoped_tx.account):
            return _out_of_scope()
            
        split = Split.query.filter_by(transaction_id=transaction_id).first()
        if split:
            split.total_amount = total_amount
            split.members = members
        else:
            split = Split(transaction_id=transaction_id, total_amount=total_amount, members=members)
            db.session.add(split)
            
        # Load the transaction to mark it as unsynced
        tx = Transaction.query.get(transaction_id)
        if tx:
            if new_tx_amount is not None and tx.amount != float(new_tx_amount):
                # 1. Revert old amount
                account = Account.query.filter_by(account=tx.account).first()
                if account and account.balance_tracked and not is_cc_account(tx.account):
                    if tx.type.lower() == 'credit':
                        account.balance -= tx.amount
                    elif tx.type.lower() in ['debit', 'savings']:
                        account.balance += tx.amount
                
                # 2. Update amount
                tx.amount = float(new_tx_amount)
                
                # 3. Apply new amount
                if account and account.balance_tracked and not is_cc_account(tx.account):
                    if tx.type.lower() == 'credit':
                        account.balance += tx.amount
                    elif tx.type.lower() in ['debit', 'savings']:
                        account.balance -= tx.amount
            
            # 4. Always mark as unsynced so it gets pushed to Sheets
            tx.synced = False
            
        db.session.commit()
        return jsonify({"success": True, "split": {"id": split.id, "total_amount": split.total_amount, "members": split.members}})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
@money_bp.route('/api/splits/<int:transaction_id>', methods=['DELETE'])
@require_access("money")
def delete_split(transaction_id):
    tx = Transaction.query.get(transaction_id)
    if tx and not current_access().tx_allowed(tx.heading, tx.account):
        return _out_of_scope()
    try:
        Split.query.filter_by(transaction_id=transaction_id).delete()
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
@money_bp.route('/api/sync/ocr-balances', methods=['POST'])
@require_access("money")
def sync_ocr_balances():
    denied = _need_full_money()
    if denied: return denied
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
@money_bp.route('/api/transactions/<int:tid>', methods=['DELETE'])
@require_access("money")
def delete_transaction(tid):
    tx = Transaction.query.filter_by(id=tid).first()

    if not tx or not current_access().tx_allowed(tx.heading, tx.account):
        return jsonify({"success": False, "message": "Transaction not found"}), 404

    account = Account.query.filter_by(account=tx.account).first()

    if account and account.balance_tracked and not is_cc_account(tx.account):
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
@money_bp.route('/api/transactions/<int:tid>', methods=['PUT'])
@require_access("money")
def edit_transaction(tid):
    try:
        data = request.json
        tx = Transaction.query.filter_by(id=tid).first()
        access = current_access()

        if not tx or not access.tx_allowed(tx.heading, tx.account):
            return jsonify({"success": False, "message": "Transaction not found"}), 404
        if not access.tx_allowed(data['heading'], data['account']):
            return _out_of_scope()

        # 1. REVERT the old transaction's impact on the balance
        old_account = Account.query.filter_by(account=tx.account).first()
        if old_account and old_account.balance_tracked and not is_cc_account(tx.account):
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
        if new_account and new_account.balance_tracked and not is_cc_account(tx.account):
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
@money_bp.route('/api/transactions/bulk-edit', methods=['PUT', 'OPTIONS'])
@require_access("money")
def bulk_edit_transactions():
    try:
        updates = request.json  # Expecting a list of transaction dictionaries
        if not isinstance(updates, list):
            return jsonify({"success": False, "message": "Invalid payload format."}), 400

        updated_count = 0
        access = current_access()
        by_id = {t.id: t for t in Transaction.query.filter(Transaction.id.in_([u.get('id') for u in updates])).all()}
        for data in updates:
            old = by_id.get(data.get('id'))
            if (old and not access.tx_allowed(old.heading, old.account)) or not access.tx_allowed(data.get('heading'), data.get('account')):
                return _out_of_scope()

        for data in updates:
            tx_id = data.get('id')
            tx = Transaction.query.filter_by(id=tx_id).first()

            if not tx:
                continue  # Skip if ID not found somehow

            # 1. REVERT the old transaction's impact on the balance
            old_account = Account.query.filter_by(account=tx.account).first()
            if old_account and old_account.balance_tracked and not is_cc_account(tx.account):
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
            if new_account and new_account.balance_tracked and not is_cc_account(tx.account):
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
@money_bp.route('/api/transactions/bulk-delete', methods=['POST', 'OPTIONS'])
@require_access("money")
def bulk_delete_transactions():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        ids = request.json
        if not isinstance(ids, list):
            return jsonify({"success": False, "message": "Invalid payload format."}), 400

        deleted_data = []
        access = current_access()
        if any(not access.tx_allowed(t.heading, t.account) for t in Transaction.query.filter(Transaction.id.in_(ids)).all()):
            return _out_of_scope()

        for tid in ids:
            tx = Transaction.query.filter_by(id=tid).first()
            if not tx:
                continue

            # Revert the balance
            account = Account.query.filter_by(account=tx.account).first()
            if account and account.balance_tracked and not is_cc_account(tx.account):
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
@money_bp.route('/api/transactions/category/exclude', methods=['PUT', 'OPTIONS'])
@require_access("money")
def category_exclude():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.json
        heading = data.get('heading')
        exclude = data.get('exclude', False)

        if not heading:
            return jsonify({"success": False, "message": "Heading is required"}), 400
        if not current_access().category_allowed(heading):
            return _out_of_scope()

        # Find all transactions with this category and flip their flag
        txs = current_access().scope_transactions(Transaction.query.filter_by(heading=heading)).all()
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

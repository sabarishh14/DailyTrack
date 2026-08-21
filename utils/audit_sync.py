"""
Sheet vs DB Mismatch Auditor
=============================
Compares transactions in Google Sheets (COMPLETE view) with Neon DB.
Finds: missing in DB, missing in sheet, amount/type mismatches, and synced flag issues.

Usage: python utils/audit_sync.py
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import sys
import requests
import psycopg2
from collections import defaultdict
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env.local'))

DATABASE_URL = os.getenv("DATABASE_URL")
SHEETS_URL = os.getenv("SHEETS_URL")

if not DATABASE_URL or not SHEETS_URL:
    print("❌ DATABASE_URL or SHEETS_URL not found in .env.local")
    sys.exit(1)

# Convert SQLAlchemy URL to psycopg2 format
DB_URL = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://")


def fetch_db_transactions():
    """Fetch all transactions from Neon DB."""
    print("📡 Connecting to Neon DB...")
    conn = psycopg2.connect(DB_URL, sslmode="require", connect_timeout=30)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, date, account, type, heading, description, amount, synced
        FROM transactions
        ORDER BY date ASC, id ASC
    """)
    rows = cur.fetchall()
    conn.close()
    print(f"   ✅ Fetched {len(rows)} transactions from DB")
    return rows


def fetch_sheet_transactions():
    """Fetch all transactions from Google Sheets COMPLETE view."""
    print("📡 Fetching from Google Sheets...")
    resp = requests.get(SHEETS_URL, params={"type": "transactions"}, timeout=60)
    data = resp.json()
    print(f"   ✅ Fetched {len(data)} transactions from Sheets")
    return data


def make_signature(date_str, amount, heading, account, tx_type, description=""):
    """Create a comparison key from transaction fields."""
    return f"{date_str}|{float(amount):.2f}|{str(heading).strip().lower()}|{str(account).strip()}|{str(tx_type).strip().lower()}|{str(description or '').strip().lower()}"


def run_audit():
    print("=" * 60)
    print("🔍 SHEET vs DB SYNC AUDIT")
    print("=" * 60)
    print()

    db_rows = fetch_db_transactions()
    sheet_rows = fetch_sheet_transactions()
    print()

    # ─── 1. Basic counts ───
    db_synced = [r for r in db_rows if r[7] is True]
    db_unsynced = [r for r in db_rows if r[7] is False]
    print(f"📊 DB Total:     {len(db_rows)}")
    print(f"   ├─ Synced:    {len(db_synced)}")
    print(f"   └─ Unsynced:  {len(db_unsynced)}")
    print(f"📊 Sheet Total:  {len(sheet_rows)}")
    print()

    # ─── 2. Build signature maps ───
    # DB: signature → list of {id, synced, ...}
    db_sig_map = defaultdict(list)
    for row in db_rows:
        db_id, db_date, db_account, db_type, db_heading, db_desc, db_amount, db_synced_flag = row
        sig = make_signature(str(db_date), db_amount, db_heading, db_account, db_type, db_desc)
        db_sig_map[sig].append({
            "id": db_id,
            "date": str(db_date),
            "account": db_account,
            "type": db_type,
            "heading": db_heading,
            "amount": float(db_amount),
            "synced": db_synced_flag
        })

    # Sheet: signature → list of sheet rows
    sheet_sig_map = defaultdict(list)
    for row in sheet_rows:
        sig = make_signature(row["date"], row["amount"], row["heading"], row["account"], row.get("type", ""), row.get("description", ""))
        sheet_sig_map[sig].append(row)

    # ─── 3. Find mismatches ───
    in_db_not_sheet = []  # Synced=True in DB but NOT found in sheet
    in_sheet_not_db = []  # In sheet but NOT found in DB
    unsynced_list = []    # Synced=False in DB (pending sync)

    # Check DB → Sheet direction
    for sig, db_entries in db_sig_map.items():
        sheet_entries = sheet_sig_map.get(sig, [])
        for db_entry in db_entries:
            if db_entry["synced"] is False:
                unsynced_list.append(db_entry)
            elif db_entry["synced"] is True and len(sheet_entries) == 0:
                in_db_not_sheet.append(db_entry)

    # Check Sheet → DB direction
    for sig, sheet_entries in sheet_sig_map.items():
        db_entries = db_sig_map.get(sig, [])
        if len(db_entries) == 0:
            for entry in sheet_entries:
                in_sheet_not_db.append(entry)

    # ─── 4. Report ───
    print("=" * 60)
    print("📋 RESULTS")
    print("=" * 60)
    print()

    # Unsynced (pending)
    if unsynced_list:
        print(f"⏳ UNSYNCED IN DB (synced=False, pending sync): {len(unsynced_list)}")
        for tx in unsynced_list[:15]:
            print(f"   ID:{tx['id']}  {tx['date']}  {tx['account']:15s}  {tx['type']:7s}  ₹{tx['amount']:>10,.2f}  {tx['heading']}")
        if len(unsynced_list) > 15:
            print(f"   ... and {len(unsynced_list) - 15} more")
        print()

    # In DB (synced=True) but missing from sheet
    if in_db_not_sheet:
        print(f"🚨 IN DB (synced=True) BUT MISSING FROM SHEET: {len(in_db_not_sheet)}")
        for tx in in_db_not_sheet[:20]:
            print(f"   ID:{tx['id']}  {tx['date']}  {tx['account']:15s}  {tx['type']:7s}  ₹{tx['amount']:>10,.2f}  {tx['heading']}")
        if len(in_db_not_sheet) > 20:
            print(f"   ... and {len(in_db_not_sheet) - 20} more")
        print()
    else:
        print("✅ No DB transactions (synced=True) are missing from Sheet")
        print()

    # In sheet but not in DB
    if in_sheet_not_db:
        print(f"⚠️  IN SHEET BUT NOT IN DB: {len(in_sheet_not_db)}")
        for tx in in_sheet_not_db[:20]:
            print(f"   {tx['date']}  {tx.get('account','?'):15s}  {tx.get('type','?'):7s}  ₹{float(tx['amount']):>10,.2f}  {tx['heading']}")
        if len(in_sheet_not_db) > 20:
            print(f"   ... and {len(in_sheet_not_db) - 20} more")
        print()
    else:
        print("✅ No Sheet transactions are missing from DB")
        print()

    # Duplicate signatures
    print("─" * 60)
    dup_count = 0
    for sig, entries in sheet_sig_map.items():
        if len(entries) > 1:
            dup_count += 1
            if dup_count <= 10:
                desc = entries[0].get('description', '')
                desc_str = f" | {desc}" if desc else ""
                tx_type = entries[0].get('type', '?')
                print(f"⚠️  DUPLICATE IN SHEET ({len(entries)}x): {entries[0]['date']} | {entries[0]['heading']}{desc_str} | ₹{float(entries[0]['amount']):,.2f} | {tx_type} | {entries[0]['account']}")
    if dup_count > 10:
        print(f"   ... and {dup_count - 10} more duplicates")
    if dup_count == 0:
        print("✅ No duplicates found in Sheet")
    print()

    # Summary
    print("=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"   DB total:                        {len(db_rows)}")
    print(f"   Sheet total:                     {len(sheet_rows)}")
    print(f"   Diff (DB - Sheet):               {len(db_rows) - len(sheet_rows)}")
    print(f"   Unsynced (pending):              {len(unsynced_list)}")
    print(f"   Synced but missing from sheet:   {len(in_db_not_sheet)}")
    print(f"   In sheet but not in DB:          {len(in_sheet_not_db)}")
    print(f"   Sheet duplicates:                {dup_count}")
    print()

    if in_db_not_sheet:
        print("💡 TIP: Transactions marked synced=True but missing from sheet")
        print("   were likely lost due to the old timeout bug. You can fix them by")
        print("   running the --fix flag to reset them to synced=False for re-sync.")

    if "--fix" in sys.argv and in_db_not_sheet:
        print()
        print("🔧 FIXING: Resetting synced=False for missing transactions...")
        conn = psycopg2.connect(DB_URL, sslmode="require", connect_timeout=30)
        cur = conn.cursor()
        fix_ids = [tx["id"] for tx in in_db_not_sheet]
        cur.execute(
            "UPDATE transactions SET synced = FALSE WHERE id = ANY(%s)",
            (fix_ids,)
        )
        conn.commit()
        conn.close()
        print(f"   ✅ Reset {len(fix_ids)} transactions to synced=False. Run sync again to push them to Sheet.")


if __name__ == "__main__":
    run_audit()

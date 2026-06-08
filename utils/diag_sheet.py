import sys
import os
import requests
from dotenv import load_dotenv

# Path setup (reuse your existing path logic)
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.chdir(backend_dir)
sys.path.append(backend_dir)
load_dotenv('.env.local')

from app import app, Transaction

SHEETS_URL = os.getenv("SHEETS_URL")

def audit():
    with app.app_context():
        # 1. Get DB Data
        db_txs = {str(t.id): t for t in Transaction.query.all()}
        
        # 2. Get Sheet Data (Fetch via GET request to your API.gs)
        print("📥 Fetching Sheet data...")
        res = requests.get(SHEETS_URL, params={"type": "transactions"})
        sheet_txs = res.json()
        
        sheet_ids = {str(t['id']): t for t in sheet_txs}
        
        print(f"📊 Audit Results:")
        print(f"DB count: {len(db_txs)} | Sheet count: {len(sheet_txs)}")
        
        # 3. Find Mismatches
        missing_in_sheet = [tid for tid in db_txs if tid not in sheet_ids]
        missing_in_db = [sid for sid in sheet_ids if sid not in db_txs]
        
        if missing_in_sheet:
            print(f"\n❌ {len(missing_in_sheet)} IDs missing in Sheet (These will be duplicated if added!):")
            for tid in missing_in_sheet[:10]:
                print(f" -> DB ID {tid}: {db_txs[tid].heading} ({db_txs[tid].date})")
        
        if missing_in_db:
            print(f"\n⚠️ {len(missing_in_db)} IDs in Sheet NOT in DB (Orphan rows):")
            for sid in missing_in_db[:10]:
                print(f" -> Sheet ID {sid}")

if __name__ == "__main__":
    audit()
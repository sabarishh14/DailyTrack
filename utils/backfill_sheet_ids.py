import sys
import os
import requests
from dotenv import load_dotenv

# 1. Get the absolute path to the backend folder
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))

# 2. Change the working directory to the backend folder!
# This ensures app.py can find firebase-credentials.json and .env.local perfectly
os.chdir(backend_dir)

# 3. Add to sys.path and load env
sys.path.append(backend_dir)
load_dotenv('.env.local')

from app import app, Transaction

SHEETS_URL = os.getenv("SHEETS_URL")

def run_backfill():
    if not SHEETS_URL:
        print("❌ SHEETS_URL is missing from your .env.local file.")
        return

    print("\n" + "="*50)
    print("🔍 INITIATING SHEET ID BACKFILL")
    print("="*50)

    with app.app_context():
        # 1. Grab EVERY transaction from your Neon database
        txs = Transaction.query.all()
        print(f"📦 Fetched {len(txs)} total transactions from PostgreSQL.")

        payload_data = []
        for tx in txs:
            payload_data.append({
                "id": str(tx.id),
                "account": tx.account,
                "date": tx.date.strftime("%Y-%m-%d"),
                "heading": tx.heading,
                "amount": float(tx.amount)
            })

        print("🚀 Firing payload to Google Apps Script...")
        
        payload = {
            "type": "backfill_ids",
            "data": payload_data
        }

        try:
            # We give it a generous timeout (120s) because Apps Script 
            # looping through 1000+ rows takes a moment.
            res = requests.post(SHEETS_URL, json=payload, timeout=120)
            
            if res.status_code == 200:
                data = res.json()
                if data.get('status') == 'success':
                    print("\n✅ SUCCESS!")
                    print(f"📝 {data.get('message')}")
                else:
                    print(f"\n❌ Error from Apps Script: {data.get('message')}")
            else:
                print(f"\n❌ HTTP Error {res.status_code}: {res.text}")

        except Exception as e:
            print(f"\n❌ Request failed: {e}")

if __name__ == "__main__":
    run_backfill()
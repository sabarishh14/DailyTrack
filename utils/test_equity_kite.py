import sys
import os
import requests
import hashlib
from dotenv import load_dotenv

# Path setup
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env.local'))

KITE_API_KEY = os.getenv("KITE_API_KEY")
KITE_API_SECRET = os.getenv("KITE_API_SECRET")

def fetch_equity_holdings():
    print("🪁 Authenticating with Kite...")
    # Follow your existing auth flow
    print(f"Login here: https://kite.zerodha.com/connect/LOGIN?api_key={KITE_API_KEY}")
    request_token = input("Paste request_token: ").strip()
    
    raw = KITE_API_KEY + request_token + KITE_API_SECRET
    checksum = hashlib.sha256(raw.encode('utf-8')).hexdigest()

    token_res = requests.post("https://api.kite.trade/session/token", data={
        "api_key": KITE_API_KEY, "request_token": request_token, "checksum": checksum
    }).json()

    if token_res.get('status') != 'success':
        print("❌ Auth failed:", token_res)
        return

    access_token = token_res['data']['access_token']
    headers = {"Authorization": f"token {KITE_API_KEY}:{access_token}"}

    # Fetch Equity Holdings
    print("⏳ Fetching Equity Portfolio...")
    res = requests.get("https://api.kite.trade/portfolio/holdings", headers=headers)
    data = res.json()

    if data['status'] == 'success':
        print(f"\n✅ Successfully fetched {len(data['data'])} holdings:\n")
        print(f"{'SYMBOL':<15} | {'QTY':<8} | {'AVG':<10} | {'LTP':<10} | {'VALUE':<10}")
        print("-" * 65)
        
        for h in data['data']:
            val = h['quantity'] * h['last_price']
            print(f"{h['tradingsymbol']:<15} | {h['quantity']:<8} | {h['average_price']:<10.2f} | {h['last_price']:<10.2f} | {val:<10.0f}")
    else:
        print("❌ API Error:", data)

if __name__ == "__main__":
    fetch_equity_holdings()
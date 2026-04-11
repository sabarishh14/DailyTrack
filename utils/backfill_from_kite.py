import sys
import os
import time
import requests
import hashlib
import json
from datetime import datetime, timedelta

# Add backend to path to use your existing Flask app & DB models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from app import app, db, Investment, MutualFundHolding
from dotenv import load_dotenv

# Load env variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env.local'))
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

KITE_API_KEY = os.getenv("KITE_API_KEY")
KITE_API_SECRET = os.getenv("KITE_API_SECRET")
MAPPING_FILE = os.path.join(os.path.dirname(__file__), 'amfi_mapping.json')

def get_kite_holdings():
    """Authenticates with Kite and fetches current MF holdings."""
    print("\n" + "="*50)
    print("🪁 KITE API AUTHENTICATION")
    print("="*50)
    print(f"1. Login here: https://kite.zerodha.com/connect/LOGIN?api_key={KITE_API_KEY}")
    request_token = input("2. Paste the request_token from the URL: ").strip()

    # Smart extraction if user pastes the whole URL
    if "request_token=" in request_token:
        request_token = request_token.split("request_token=")[1].split("&")[0]

    raw = KITE_API_KEY + request_token + KITE_API_SECRET
    checksum = hashlib.sha256(raw.encode('utf-8')).hexdigest()

    print("\n⏳ Authenticating...")
    token_res = requests.post("https://api.kite.trade/session/token", data={
        "api_key": KITE_API_KEY,
        "request_token": request_token,
        "checksum": checksum
    }).json()

    if token_res.get('status') != 'success':
        print("❌ Authentication failed. Please check your token and API keys.")
        sys.exit(1)

    access_token = token_res['data']['access_token']
    
    print("⏳ Fetching holdings...")
    headers = {"Authorization": f"token {KITE_API_KEY}:{access_token}"}
    holdings_res = requests.get("https://api.kite.trade/mf/holdings", headers=headers).json()
    
    holdings = holdings_res.get('data', [])
    print(f"✅ Found {len(holdings)} mutual fund holdings in Kite.")
    return holdings

def load_or_create_mapping(holdings):
    """Maps Kite tradingsymbols to AMFI codes, fetching real names and prompting if missing."""
    import csv
    import io
    
    mapping = {}
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, 'r') as f:
            mapping = json.load(f)
            
    # FETCH INSTRUMENTS TO GET THE REAL NAME AND AUTO-AMFI
    print("⏳ Fetching fund names from Zerodha...")
    instruments_res = requests.get("https://api.kite.trade/mf/instruments")
    reader = csv.DictReader(io.StringIO(instruments_res.text))
    instruments_map = {}
    for row in reader:
        if row.get('tradingsymbol'):
            instruments_map[row['tradingsymbol']] = {
                'name': row.get('name', 'Unknown'),
                'amfi_code': row.get('amfi_code', '')
            }

    needs_save = False
    portfolio = []

    print("\n" + "="*50)
    print("🔗 AMFI CODE MAPPING")
    print("="*50)

    for h in holdings:
        symbol = h['tradingsymbol']
        qty = float(h['quantity'])
        avg_price = float(h['average_price'])
        
        # Look up the real human-readable name and potential AMFI code
        fund_info = instruments_map.get(symbol, {})
        fund_name = fund_info.get('name', symbol)
        auto_amfi = fund_info.get('amfi_code', '')
        
        if symbol not in mapping:
            if auto_amfi:
                print(f"✅ Auto-mapped {fund_name} to AMFI: {auto_amfi}")
                mapping[symbol] = auto_amfi
                needs_save = True
            else:
                print(f"\nFund: {fund_name} ({symbol})")
                print("Search for this name on: https://www.mfapi.in/")
                amfi = input(f"Enter 6-digit AMFI code (or leave blank to skip): ").strip()
                if amfi:
                    mapping[symbol] = amfi
                    needs_save = True
                else:
                    print(f"⏭️ Skipping {fund_name}...")
                    continue
                
        if symbol in mapping:
            portfolio.append({
                "symbol": symbol,
                "real_name": fund_name, # <--- ADD THIS LINE
                "amfi_code": mapping[symbol],
                "quantity": qty,
                "average_price": avg_price
            })

    if needs_save:
        with open(MAPPING_FILE, 'w') as f:
            json.dump(mapping, f, indent=4)
        print("\n💾 Saved mapping to amfi_mapping.json for future use.")
        
    return portfolio

def fetch_all_nav_histories(portfolio):
    """Fetches the complete NAV history from mfapi.in."""
    print("\n" + "="*50)
    print("📈 DOWNLOADING HISTORICAL NAVs")
    print("="*50)
    
    histories = {}
    for fund in portfolio:
        amfi = fund['amfi_code']
        print(f"📡 Fetching data for {fund['symbol']} (AMFI: {amfi})...")
        
        try:
            res = requests.get(f"https://api.mfapi.in/mf/{amfi}", timeout=10).json()
            nav_dict = {}
            for entry in res.get('data', []):
                date_obj = datetime.strptime(entry['date'], '%d-%m-%Y').date()
                nav_dict[date_obj.strftime('%Y-%m-%d')] = float(entry['nav'])
            
            histories[amfi] = nav_dict
            time.sleep(0.5) 
        except Exception as e:
            print(f"❌ Failed to fetch data for {amfi}: {e}")
            
    return histories

def get_closest_nav(nav_dict, target_date):
    """Finds the NAV for a date. Looks back up to 5 days for weekends/holidays."""
    for i in range(5):
        check_date = target_date - timedelta(days=i)
        date_str = check_date.strftime('%Y-%m-%d')
        if date_str in nav_dict:
            return nav_dict[date_str]
    return None

def run_backfill():
    if not KITE_API_KEY or not KITE_API_SECRET:
        print("❌ KITE_API_KEY or KITE_API_SECRET missing from your .env.local file.")
        return

    # 1. Get live holdings from Kite
    raw_holdings = get_kite_holdings()
    if not raw_holdings:
        return
        
    # 2. Map to AMFI codes
    portfolio = load_or_create_mapping(raw_holdings)
    if not portfolio:
        print("❌ No funds mapped. Exiting.")
        return

    # 3. Download historical NAVs
    nav_histories = fetch_all_nav_histories(portfolio)
    
    # 4. Backfill Database
    with app.app_context():
        investments = Investment.query.order_by(Investment.date.asc()).all()
        
        if not investments:
            print("\n📭 No historical dates found in the database to backfill.")
            return

        print("\n" + "="*50)
        print(f"🚀 BACKFILLING DATABASE ({len(investments)} dates)")
        print("="*50)
        
        added_count = 0
        skipped_count = 0
        
        for inv in investments:
            target_date = inv.date
            
            existing = MutualFundHolding.query.filter_by(date=target_date).first()
            if existing:
                skipped_count += 1
                continue
                
            daily_holdings = []
            
            for fund in portfolio:
                amfi = fund['amfi_code']
                nav_dict = nav_histories.get(amfi, {})
                historical_nav = get_closest_nav(nav_dict, target_date)
                
                if not historical_nav:
                    continue
                
                qty = fund['quantity']
                avg_price = fund['average_price']
                
                invested_val = qty * avg_price
                current_val = qty * historical_nav
                
                holding = MutualFundHolding(
                    id=int(datetime.now().timestamp() * 1000) + added_count,
                    date=target_date,
                    symbol=fund['real_name'], # <--- USE REAL NAME HERE
                    quantity=qty,
                    average_price=avg_price,
                    nav=historical_nav,
                    invested_value=invested_val,
                    current_value=current_val
                )
                daily_holdings.append(holding)
                added_count += 1
            
            if daily_holdings:
                db.session.add_all(daily_holdings)
                print(f"✅ Processed {target_date.strftime('%Y-%m-%d')}")
                
        db.session.commit()
        
        print("\n" + "="*50)
        print("🎉 BACKFILL COMPLETE!")
        print(f"📊 Added {added_count} individual fund records.")
        print(f"⏭️ Skipped {skipped_count} dates that were already mapped.")
        print("="*50)

if __name__ == "__main__":
    run_backfill()
import pandas as pd
from app import app, db, Investment
from datetime import datetime

# Helper to clean "15,187.00" and "₹44,998" into floats
def clean_currency(val):
    if isinstance(val, str):
        val = val.replace('₹', '').replace(',', '').strip()
        if not val:
            return 0.0
    return float(val)

print("Reading CSV...")
df = pd.read_csv('DT - INVES-T-RACKER.csv')

with app.app_context():
    for index, row in df.iterrows():
        # Convert DD/MM/YYYY to a Python Date object
        date_obj = datetime.strptime(row['Date'], '%d/%m/%Y').date()
        
        inv = Investment(
            id=int(datetime.now().timestamp() * 1000) + index,
            date=date_obj,
            
            inv_stocks=clean_currency(row['INV (Stocks)']),
            curr_stocks=clean_currency(row['CURR (Stocks)']),
            ret_pct_stocks=float(row['RET (Stocks)']),
            status_stocks=str(row['Stocks Status']),
            
            inv_mf=clean_currency(row['INV (MF)']),
            curr_mf=clean_currency(row['CURR (MF)']),
            ret_pct_mf=float(row['RET (MF)']),
            status_mf=str(row['MF Status']),
            
            total_inv=clean_currency(row['Total INV']),
            total_curr=clean_currency(row['Total CURR']),
            total_ret_pct=float(row['Total RET']),
            total_status=str(row['Total Status'])
        )
        db.session.add(inv)
    
    db.session.commit()
    print(f"Successfully imported {len(df)} investment records into Neon!")
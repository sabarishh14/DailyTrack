import re
import pg8000.native

with open('.env.local', 'r') as f:
    for line in f:
        if line.startswith('DATABASE_URL='):
            db_url = line.strip().split('=', 1)[1]
            break

db_url = db_url.split('://')[1]
user_pass, host_db = db_url.split('@')
user, password = user_pass.split(':')
host, database = host_db.split('/')

try:
    conn = pg8000.native.Connection(user=user, password=password, host=host, database=database, port=5432, timeout=30)
    print("Connected to database successfully.")
    
    rows = conn.run("SELECT id, symbol FROM mf_holdings")
    
    updated = 0
    for row in rows:
        h_id, old_name = row[0], row[1]
        name = old_name
        
        name = re.sub(r'(?i)\s*-\s*Direct.*', '', name)
        name = re.sub(r'(?i)\s*-\s*Regular.*', '', name)
        name = re.sub(r'(?i)\s*-\s*Growth.*', '', name)
        name = re.sub(r'(?i)\s*-\s*IDCW.*', '', name)
        name = re.sub(r'(?i)\s*-\s*Dividend.*', '', name)
        name = name.strip()
        
        if name == "ICICI Prudential Large Cap Fund":
            name = "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)"
            
        if name != old_name:
            # Escape single quotes in the name just in case
            safe_name = name.replace("'", "''")
            conn.run(f"UPDATE mf_holdings SET symbol = '{safe_name}' WHERE id = {h_id}")
            updated += 1
            
    print(f"Successfully updated {updated} historical mutual fund records.")
except Exception as e:
    print("Error:", e)

def get_transactions_for_sync():
    last_sync = db.session.query(SyncLog).order_by(SyncLog.last_sync.desc()).first()
    last_sync_time = last_sync.last_sync if last_sync else datetime(1970,1,1)
    
    new_txs = Transaction.query.filter(Transaction.date > last_sync_time).all()
    return [tx_to_dict(tx) for tx in new_txs]

def tx_to_dict(tx):
    return {
        "id": tx.id,
        "date": tx.date.strftime("%Y-%m-%d"),
        "month": tx.month.strftime("%B %Y"),
        "type": tx.type.capitalize(),
        "heading": tx.heading,
        "description": tx.description or "",
        "amount": float(tx.amount),
        "account": tx.account
    }

import requests

def sync_to_sheets():
    transactions = get_transactions_for_sync()
    if not transactions:
        print("No new transactions to sync")
        return

    response = requests.post(SHEETS_URL, json=transactions, timeout=60)
    if response.ok:
        # Update last sync time
        now = datetime.utcnow()
        new_log = SyncLog(id=int(now.timestamp()*1000), last_sync=now)
        db.session.add(new_log)
        db.session.commit()
        print(f"✅ Synced {len(transactions)} transactions")
    else:
        print(f"❌ Sheets sync failed: {response.text}")
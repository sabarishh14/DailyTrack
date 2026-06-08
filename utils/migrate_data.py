import sys
import os
from sqlalchemy import text

# Setup paths to import your Flask app correctly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from app import app, db, PortfolioSnapshot

def migrate_historical_data():
    with app.app_context():
        print("🔍 Reading from old 'investments' table...")
        
        # 1. Fetch all data using raw SQL (since we deleted the ORM model)
        try:
            old_records = db.session.execute(text("SELECT * FROM investments")).mappings().all()
        except Exception as e:
            print(f"❌ Error reading old table (maybe it was already dropped?): {e}")
            return

        migrated_count = 0
        skipped_count = 0

        for row in old_records:
            # 2. Prevent duplicates by checking if the date already exists in the new table
            existing = PortfolioSnapshot.query.filter_by(date=row['date']).first()
            
            if existing:
                skipped_count += 1
                continue

            # 3. Map the old schema to the new schema
            new_snap = PortfolioSnapshot(
                id=row['id'],
                date=row['date'],
                
                # Map old Stocks
                total_equity_inv=row['inv_stocks'] or 0.0,
                total_equity_curr=row['curr_stocks'] or 0.0,
                
                # Map old MFs
                total_mf_inv=row['inv_mf'] or 0.0,
                total_mf_curr=row['curr_mf'] or 0.0,
                
                # Historical manual assets weren't tracked, so they start at 0
                total_fixed_income_inv=0.0,
                total_fixed_income_curr=0.0,
                total_provident_inv=0.0,
                total_provident_curr=0.0,
                total_gold_inv=0.0,
                total_gold_curr=0.0,
                
                # Grand totals map perfectly
                grand_total_inv=row['total_inv'] or 0.0,
                grand_total_curr=row['total_curr'] or 0.0,
                
                synced=row['synced']
            )
            db.session.add(new_snap)
            migrated_count += 1

        # 4. Commit all the new snapshots
        db.session.commit()
        
        print("\n✅ MIGRATION COMPLETE!")
        print(f"📈 Successfully migrated {migrated_count} records into 'portfolio_snapshots'.")
        print(f"⏭️ Skipped {skipped_count} records that were already migrated.")

if __name__ == "__main__":
    migrate_historical_data()
"""SQLAlchemy models, shared by all blueprints."""
from datetime import datetime, date
from extensions import db

# Rupees stored exactly to the paisa. Python still sees floats, so JSON stays numeric.
Money = db.Numeric(14, 2, asdecimal=False)

class Account(db.Model):
    __tablename__ = "accounts"
    account = db.Column(db.String(50), primary_key=True)
    balance = db.Column(Money, default=0)
    real_balance = db.Column(Money, nullable=True)
    balance_tracked = db.Column(db.Boolean, default=True)
class Transaction(db.Model):
    __tablename__ = "transactions"
    __table_args__ = (
    db.UniqueConstraint('date', 'account', 'amount', 'heading', name='unique_tx'),
)
    id = db.Column(db.BigInteger, primary_key=True)
    account = db.Column(db.String(50), db.ForeignKey("accounts.account"))
    date = db.Column(db.Date, nullable=False, index=True) # <-- Added index for faster sorting
    month = db.Column(db.Date, nullable=False, index=True) # <-- Added index for faster filtering
    type = db.Column(db.String(10), nullable=False)
    heading = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    amount = db.Column(Money, nullable=False)
    synced = db.Column(db.Boolean, default=False)
    exclude_analytics = db.Column(db.Boolean, default=False)
class Split(db.Model):
    __tablename__ = "splits"
    id = db.Column(db.BigInteger, primary_key=True)
    transaction_id = db.Column(db.BigInteger, db.ForeignKey('transactions.id'), unique=True, nullable=False)
    total_amount = db.Column(Money, nullable=False)
    members = db.Column(db.JSON, nullable=False, default=list)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
class RecurringTask(db.Model):
    __tablename__ = "recurring_tasks"
    id = db.Column(db.BigInteger, primary_key=True)
    asset_name = db.Column(db.String(100)) # e.g., 'EPF'
    amount_to_add = db.Column(db.Float)    # e.g., 2210
    interval_value = db.Column(db.Integer, default=1)
    interval_unit = db.Column(db.String(10), default='months') # 'days', 'months', 'years'
    next_run_date = db.Column(db.Date)
    is_active = db.Column(db.Boolean, default=True)
class EquityHolding(db.Model):
    __tablename__ = "equity_holdings"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    symbol = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    average_price = db.Column(db.Float, nullable=False)
    ltp = db.Column(db.Float, nullable=False)
    invested_value = db.Column(db.Float, nullable=False)
    current_value = db.Column(db.Float, nullable=False)
class PhysicalActivity(db.Model):
    __tablename__ = "physical_activity"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, unique=True, nullable=False)
    gym = db.Column(db.Boolean, default=False)
    badminton = db.Column(db.Boolean, default=False)
    table_tennis = db.Column(db.Boolean, default=False)
    cricket = db.Column(db.Boolean, default=False)
    others = db.Column(db.Boolean, default=False)
    description = db.Column(db.String(255))
class MutualFundHolding(db.Model):
    __tablename__ = "mf_holdings"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    symbol = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    average_price = db.Column(db.Float, nullable=False)
    nav = db.Column(db.Float, nullable=False)
    invested_value = db.Column(db.Float, nullable=False)
    current_value = db.Column(db.Float, nullable=False)
class ManualAsset(db.Model):
    __tablename__ = "manual_assets"

    id = db.Column(db.BigInteger, primary_key=True)
    category = db.Column(db.String(50), nullable=False) # FD, EPF, PPF, NPS, SGB, RSU, RealEstate, Cash
    name = db.Column(db.String(100), nullable=False)
    invested_value = db.Column(db.Float, default=0.0)
    current_value = db.Column(db.Float, default=0.0)
    interest_rate = db.Column(db.Float, nullable=True)
    start_date = db.Column(db.Date, nullable=True) # <-- ADD THIS LINE
    maturity_date = db.Column(db.Date, nullable=True)
    last_updated = db.Column(db.Date, nullable=False)
class PortfolioSnapshot(db.Model):
    __tablename__ = "portfolio_snapshots"

    id = db.Column(db.BigInteger, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    
    total_equity_inv = db.Column(db.Float, default=0.0)
    total_equity_curr = db.Column(db.Float, default=0.0)
    
    total_mf_inv = db.Column(db.Float, default=0.0)
    total_mf_curr = db.Column(db.Float, default=0.0)
    
    total_fixed_income_inv = db.Column(db.Float, default=0.0)
    total_fixed_income_curr = db.Column(db.Float, default=0.0)
    
    total_provident_inv = db.Column(db.Float, default=0.0)
    total_provident_curr = db.Column(db.Float, default=0.0)
    
    total_gold_inv = db.Column(db.Float, default=0.0)
    total_gold_curr = db.Column(db.Float, default=0.0)
    
    grand_total_inv = db.Column(db.Float, default=0.0)
    grand_total_curr = db.Column(db.Float, default=0.0)
    
    synced = db.Column(db.Boolean, default=False)
class SyncLog(db.Model):
    __tablename__ = "sync_log"
    id = db.Column(db.BigInteger, primary_key=True)
    last_sync = db.Column(db.DateTime, nullable=False)

# ADD THIS NEW MODEL BELOW:
class AllowedEmail(db.Model):
    __tablename__ = "allowed_emails"
    email = db.Column(db.String(120), primary_key=True)
    added_on = db.Column(db.DateTime, default=datetime.utcnow)
    # Access control (see ACCESS_CONTROL.md). role NULL = pre-RBAC guest with full access.
    role = db.Column(db.String(20), nullable=True)          # admin | member
    permissions = db.Column(db.JSON, nullable=True)         # {"modules": {...}, "money_scope": {...}}
    updated_on = db.Column(db.DateTime, nullable=True)
class TvShow(db.Model):
    __tablename__ = "tv_shows"
    id = db.Column(db.BigInteger, primary_key=True)
    tmdb_id = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    poster_path = db.Column(db.String(255))
    status = db.Column(db.String(50), default="TO WATCH") # WATCHING, WATCHED, TO WATCH, DROPPED
    watched_episodes = db.Column(db.JSON, default=dict) # e.g. {"1": [1, 2, 3]} mapping season string to array of episode numbers
    language = db.Column(db.String(10), nullable=True) # ISO 639-1 original language, fetched from TMDB
    added_on = db.Column(db.DateTime, default=datetime.utcnow)
class TvDiaryLog(db.Model):
    __tablename__ = "tv_diary_logs"
    id = db.Column(db.BigInteger, primary_key=True)
    tv_show_id = db.Column(db.BigInteger, db.ForeignKey("tv_shows.id"), nullable=False)
    season_number = db.Column(db.Integer, nullable=True) # Null if logging the whole show
    episode_number = db.Column(db.Integer, nullable=True) # Null if logging the whole show
    date = db.Column(db.Date, nullable=False, default=date.today)
    rating = db.Column(db.Float, nullable=True) # 1-5 stars
    review = db.Column(db.Text, nullable=True)
    liked = db.Column(db.Boolean, default=False)
    rewatch = db.Column(db.Boolean, default=False)
    tags = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to TvShow
    tv_show = db.relationship('TvShow', backref=db.backref('diary_logs', lazy=True, cascade="all, delete-orphan"))
class TvActivityLog(db.Model):
    __tablename__ = "tv_activity_logs"
    id = db.Column(db.BigInteger, primary_key=True)
    tv_show_id = db.Column(db.BigInteger, db.ForeignKey("tv_shows.id"), nullable=False)
    action = db.Column(db.String(255), nullable=False) # e.g. "Added to library", "Status changed to WATCHED"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    tv_show = db.relationship('TvShow', backref=db.backref('activity_logs', lazy=True, cascade="all, delete-orphan"))
class Movie(db.Model):
    __tablename__ = "movies"
    id = db.Column(db.BigInteger, primary_key=True)
    tmdb_id = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    poster_path = db.Column(db.String(255))
    status = db.Column(db.String(50), default="TO WATCH") # WATCHED, TO WATCH
    runtime = db.Column(db.Integer, nullable=True)  # Runtime in minutes, fetched from TMDB
    release_year = db.Column(db.Integer, nullable=True) # Release year of the movie
    release_date = db.Column(db.String(20), nullable=True) # e.g. "YYYY-MM-DD"
    director = db.Column(db.String(255), nullable=True)
    top_cast = db.Column(db.JSON, nullable=True)
    language = db.Column(db.String(10), nullable=True) # ISO 639-1 original language, fetched from TMDB
    added_on = db.Column(db.DateTime, default=datetime.utcnow)
class MovieDiaryLog(db.Model):
    __tablename__ = "movie_diary_logs"
    id = db.Column(db.BigInteger, primary_key=True)
    movie_id = db.Column(db.BigInteger, db.ForeignKey("movies.id"), nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today)
    rating = db.Column(db.Float, nullable=True) # 1-5 stars
    review = db.Column(db.Text, nullable=True)
    liked = db.Column(db.Boolean, default=False)
    rewatch = db.Column(db.Boolean, default=False)
    tags = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to Movie
    movie = db.relationship('Movie', backref=db.backref('diary_logs', lazy=True, cascade="all, delete-orphan"))
class Budget(db.Model):
    __tablename__ = "budgets"
    id = db.Column(db.BigInteger, primary_key=True)
    category = db.Column(db.String(100), unique=True, nullable=False)
    monthly_limit = db.Column(Money, nullable=False)

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// Use environment variable for API URL, with fallback for development
const API = import.meta.env.VITE_API_URL || 
  (window.location.hostname === "localhost" 
    ? "http://localhost:5000/api" 
    : window.location.origin + "/api");

const getToken = () => localStorage.getItem('dt_token');

const BANKS = {
  KOTAK:  { emoji: "🔴", color: "#ef4444" },
  IDBI:   { emoji: "🟢", color: "#22c55e" },
  FEDERAL:{ emoji: "🟠", color: "#f97316" },
  CUB:    { emoji: "🟣", color: "#a855f7" },
  INDIAN: { emoji: "🔵", color: "#3b82f6" },
  ICICI:  { emoji: "🟡", color: "#eab308" },
  "CC-PINNACLE 6360": { emoji: "💳", color: "#ec4899" },
  "CC-SBI 0033": { emoji: "💳", color: "#ec4899" },
  "CC-ICICI SAFFIRE": { emoji: "💳", color: "#ec4899" },
  "CC-AP 4004": { emoji: "💳", color: "#ec4899" },
  "CC-SBI 9810": { emoji: "💳", color: "#ec4899" },
  "Cash": { emoji: "💵", color: "#10b981" },
};

// Helper function to get bank emoji
const getBankEmoji = (accountName) => {
  if (BANKS[accountName]) return BANKS[accountName].emoji;
  // Check if account starts with known prefix
  for (const key in BANKS) {
    if (accountName && accountName.startsWith(key.split('-')[0])) {
      return BANKS[key].emoji;
    }
  }
  return "🏦";
};

const CATEGORIES = [
  "Aasai","Annual Fee","Card Fees","Charges","Cinema","Clothing","Daily Need",
  "Donation","Education","Entertainment","FD","Food","Fruits","God","Haircut",
  "Income","Interest","Investment","Kudremukh Trip","Laundry","Loan","Medical",
  "Msc","Parking","Petrol","Popcorn","Salary","Savings","Snacks","Spotify",
  "Tally","Test","Tips","Transport","Travel","Veggies"
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TABS = [
  { id: 0, icon: "🏠", label: "Home" },
  { id: 1, icon: "💰", label: "Money" },
  { id: 2, icon: "➕", label: "Add Transaction", add: true },
  { id: 3, icon: "🏋️", label: "Gym & Activity" },
  { id: 4, icon: "📈", label: "Investments" },
];

const TAB_TITLES = ["Dashboard", "Money", "Add Transaction", "Gym & Activity", "Investments"];

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (isNaN(n)) return "0%";
  return (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(2)}`;
}

function LoadingScreen() {
  const [showWakeMsg, setShowWakeMsg] = useState(false);
  useEffect(() => {
    // Show wake up message if loading takes more than 3 seconds
    const timer = setTimeout(() => setShowWakeMsg(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: '1.5rem' }}>
      <span className="logo-name" style={{ fontSize: '2rem' }}>DailyTrack</span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'bounce 0.8s ease infinite',
            animationDelay: `${i * 0.15}s`
          }} />
        ))}
      </div>
      {showWakeMsg && (
        <div style={{ color: 'var(--text2)', fontSize: '0.9rem', marginTop: '1rem', animation: 'fadeIn 0.5s ease', textAlign: 'center' }}>
          Waking up the server...<br/>
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(This can take up to 1-2 minutes on free tiers)</span>
        </div>
      )}
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true); setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      
      // Send Firebase token to our backend to verify + get our JWT
      const res = await fetch(`${API}/auth/firebase-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken })
      });
      const data = await res.json();
      
      if (data.success) {
        localStorage.setItem('dt_token', data.token);
        onLogin();
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (e) {
      setError(e.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '2.5rem', width: '100%', maxWidth: '380px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        
        <div style={{ textAlign: 'center' }}>
          <span className="logo-name" style={{ fontSize: '2rem' }}>DailyTrack</span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.4rem' }}>Personal Dashboard</div>
        </div>

        {error && <div style={{ fontSize: '0.8rem', color: 'var(--neg)', textAlign: 'center', width: '100%' }}>{error}</div>}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
            padding: '0.85rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border)',
            background: 'var(--bg3)', color: 'var(--text)', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.95rem', fontWeight: 600,
            transition: 'all 0.2s', opacity: loading ? 0.7 : 1
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          {loading ? '⏳ Signing in...' : (
            <>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.5 39.6 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.7 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textAlign: 'center' }}>
          Only authorized Google accounts can access this dashboard.
        </div>
      </div>
    </div>
  );
}

// ─── HOME TAB ───────────────────────────────────────────────────────────
function HomeTab({ accounts, transactions, physical, investments, onSyncBalances, onImportCSV, fetchAllTransactions }) {
  if (!physical || !transactions || !accounts) return null;

  const [physMonth, setPhysMonth] = useState(new Date().getMonth());
  const [physYear, setPhysYear] = useState(new Date().getFullYear());
  const [moneyMonth, setMoneyMonth] = useState(new Date().getMonth());
  const [moneyYear, setMoneyYear] = useState(new Date().getFullYear());
  const [syncing, setSyncing] = useState(false);
  const [syncingSheetsTransactions, setSyncingSheetsTransactions] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const fileRef = useRef(null);
  const [showBalances, setShowBalances] = useState(false); // <-- Default to hidden for privacy
  const [showInvestments, setShowInvestments] = useState(false);

  // Trigger the background fetch when looking at the money section
  useEffect(() => {
    if (fetchAllTransactions) {
      fetchAllTransactions();
    }
  }, [moneyMonth, moneyYear, fetchAllTransactions]);

  const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxmBBF0-oRREVy66H-mL6DGpdgY5fjgL8S1Nr13HBBVVfTbznemzSBWtnsYpPPbGbdb2A/exec";

  const syncBalances = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await fetch(SHEETS_URL);
      const data = await res.json();
      // data looks like: { KOTAK: 12000, IDBI: 5000, ... }
      await onSyncBalances(data);
      setSyncMsg('✅ Balances synced!');
    } catch (e) {
      setSyncMsg('❌ Sync failed: ' + e.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 3000);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onImportCSV(ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-imported
  };

  const syncTransactionsFromSheets = async () => {
    try {
      // 1. Ask the backend how many transactions are waiting
      const checkRes = await fetch(`${API}/sync/check-transactions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const checkData = await checkRes.json();

      if (!checkData.success) {
        return alert("❌ Error checking sync status: " + checkData.message);
      }

      if (checkData.count === 0) {
        return alert("👍 No new transactions to sync to Sheets.");
      }

      // 2. The Confirmation Prompt (Mimicking your old y/n console check!)
      const isConfirmed = window.confirm(`You have ${checkData.count} unsynced transaction(s). Ready to send them to Google Sheets?`);
      
      // If you click Cancel, we stop right here.
      if (!isConfirmed) return; 

      // 3. If confirmed, lock the button and do the actual sync
      setSyncingSheetsTransactions(true);
      const res = await fetch(`${API}/sync/db-to-sheets`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      
      if (data.success) {
        alert("✅ " + data.message);
      } else {
        alert("❌ Sync Failed: " + data.message);
      }
    } catch (e) {
      alert("❌ Network Error: " + e.message);
    } finally {
      setSyncingSheetsTransactions(false);
    }
  };

  const netWorth = accounts
    .filter(a => a.balance_tracked)
    .reduce((s, a) => s + parseFloat(a.balance || 0), 0);

  // Grab the newest snapshot (index 0) and use your new total columns
  const latestInv = investments.length > 0 ? investments[0] : null;
  const latestDate = latestInv ? formatDate(latestInv.date) : "—";
  const totalInvested = latestInv ? parseFloat(latestInv.total_inv || 0) : 0;
  const totalCurrent = latestInv ? parseFloat(latestInv.total_curr || 0) : 0;
  const totalReturn = totalCurrent - totalInvested;
  const totalRetPct = latestInv ? parseFloat(latestInv.total_ret_pct || 0) : 0;

  const physActive = physical.filter(p => {
    if (!p.date) return false;
    const d = new Date(p.date);
    return d.getMonth() === physMonth && d.getFullYear() === physYear &&
      (p.gym || p.badminton || p.table_tennis || p.cricket || p.others);
  }).length;

  
  // Money section: Income/Expenses by month
  const moneyML = `${moneyYear}-${String(moneyMonth+1).padStart(2,'0')}`;
  const moneyTransactions = transactions.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date);
    const ml = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return ml === moneyML;
  });

  const income = {}, expense = {};
  accounts.forEach(a => { income[a.account] = 0; expense[a.account] = 0; });
  moneyTransactions.forEach(t => {
    if (t.type === 'credit') income[t.account] = (income[t.account] || 0) + parseFloat(t.amount);
    if (t.type === 'debit') expense[t.account] = (expense[t.account] || 0) + parseFloat(t.amount);
  });

  return (
    <div>
      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="action-btn" onClick={syncBalances} disabled={syncing}>
          {syncing ? '⏳ Syncing...' : '🔄 Sync Balances from Sheet'}
        </button>
        <button className="action-btn" onClick={syncTransactionsFromSheets} disabled={syncingSheetsTransactions} style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}>
          {syncingSheetsTransactions ? '⏳ Syncing...' : '📥 Sync Transactions to Sheets'}
        </button>
        <button className="action-btn secondary" onClick={() => fileRef.current?.click()}>
          📂 Import Transactions CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
        {syncMsg && <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: syncMsg.startsWith('✅') ? 'var(--pos)' : 'var(--neg)' }}>{syncMsg}</span>}
      </div>

      {/* Hero row: Net Worth + Physical Activity */}
      <div className="home-hero">
        <div className="net-worth-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="nw-label">Total Net Worth</div>
              <div className="nw-value">{showBalances ? fmt(netWorth) : '₹ ••••••'}</div>
              <div className="nw-sub">Across {accounts.length} accounts</div>
            </div>
            <button 
              onClick={() => setShowBalances(!showBalances)}
              style={{ position: 'relative', zIndex: 10, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', fontSize: '1.2rem' }}
              title={showBalances ? "Hide Balances" : "Show Balances"}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
              {showBalances ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div className="phys-home-card">
          <div className="phys-num">{physActive}</div>
          <div style={{ flex: 1 }}>
            <div className="phys-info-label">Days Active</div>
            <div className="phys-info-sub">{MONTHS[physMonth]} {physYear}</div>
          </div>
          <div className="phys-controls">
            <select className="sel" style={{ width: 'auto' }} value={physMonth} onChange={e => setPhysMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="sel" style={{ width: 'auto' }} value={physYear} onChange={e => setPhysYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Accounts */}
      <section className="section">
        <h2 className="section-title">🏦 Account Balances</h2>
        <div className="accounts-grid">
          {accounts
            .filter(a => a.balance_tracked && a.account !== 'CC-PINNACLE 6360' && a.account !== 'Cash') // <-- tracks balance and hides PINNACLE
            .map(a => (
              <div
                className="account-card"
                key={a.account}
                style={{ "--accent": BANKS[a.account]?.color }}
              >
                <div className="acc-top">
                  <span className="acc-emoji">{BANKS[a.account]?.emoji}</span>
                  <span className="acc-name">{a.account}</span>
                </div>
                <div className="acc-balance">{showBalances ? fmt(a.balance) : '₹ ••••••'}</div>
              </div>
            ))}
        </div>
      </section>
      
      {/* Investments */}
      <section className="section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h2 className="section-title" style={{ margin: 0, flex: 'none', display: 'flex' }}>📊 Investment Portfolio</h2>
          <button
            onClick={() => setShowInvestments(!showInvestments)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: 0, lineHeight: 1, flexShrink: 0 }}
            title={showInvestments ? 'Hide' : 'Show'}
          >
            {showInvestments ? '🙈' : '👁️'}
          </button>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>
      <div className="inv-summary-grid">
          {[
            { label: "Date", val: latestDate, color: "text3" },
           { label: "Invested", val: showInvestments ? fmt(totalInvested) : '₹ ••••••', color: null },
            { label: "Current Value", val: showInvestments ? fmt(totalCurrent) : '₹ ••••••', color: null },
            { label: "Returns ₹", val: showInvestments ? fmt(totalReturn) : '₹ ••••••', color: totalReturn >= 0 ? "pos" : "neg" },
            { label: "Returns %", val: showInvestments ? fmtPct(totalRetPct) : '••••', color: totalRetPct >= 0 ? "pos" : "neg" },
          ].map(card => (
            <div className="inv-card" key={card.label}>
              <div className="inv-label">{card.label}</div>
              <div className={`inv-val ${card.color || ''}`}>{card.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Money: Income & Expenses by Account */}
      <section className="section">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>💰 Money</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select className="sel" style={{ width: 'auto', fontSize: '0.875rem' }} value={moneyMonth} onChange={e => setMoneyMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="sel" style={{ width: 'auto', fontSize: '0.875rem' }} value={moneyYear} onChange={e => setMoneyYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
       <div className="money-top">
        <div className="money-col">
          <div className="col-title income-title">💚 Income by Account</div>
          {accounts
            .filter(a => a.balance_tracked) // only show balance-tracked accounts
            .map(a => (
              <div key={a.account} className="acc-row">
                <div className="acc-row-left">{BANKS[a.account]?.emoji} {a.account}</div>
                <span className="pos">{fmt(income[a.account] || 0)}</span>
              </div>
            ))}
          <div className="acc-row" style={{fontWeight:700}}>
            <div>Total</div>
            <span className="pos">
              {fmt(
                accounts
                  .filter(a => a.balance_tracked)
                  .reduce((sum, a) => sum + (income[a.account] || 0), 0)
              )}
            </span>
          </div>
        </div>

        <div className="money-col">
          <div className="col-title expense-title">❤️ Expenses by Account</div>
          {accounts
            .filter(a => a.balance_tracked) // only show balance-tracked accounts
            .map(a => (
              <div key={a.account} className="acc-row">
                <div className="acc-row-left">{BANKS[a.account]?.emoji} {a.account}</div>
                <span className="neg">{fmt(expense[a.account] || 0)}</span>
              </div>
            ))}
          <div className="acc-row" style={{fontWeight:700}}>
            <div>Total</div>
            <span className="neg">
              {fmt(
                accounts
                  .filter(a => a.balance_tracked)
                  .reduce((sum, a) => sum + (expense[a.account] || 0), 0)
              )}
            </span>
          </div>
        </div>
      </div>
      </section>

    </div>
  );
}

// ─── CUSTOM PIE TOOLTIP ─────────────────────────────────────────────────
function CustomPieTooltip({ active, payload, pieData }) {
  if (!active || !payload || !payload[0] || !pieData) return null;
  const { value, name } = payload[0];
  
  // Dynamically calculate the total and percentage
  const total = pieData.reduce((sum, item) => sum + item.value, 0);
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a2235 0%, #0d1117 100%)',
      border: '1px solid rgba(99, 102, 241, 0.6)',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      pointerEvents: 'none'
    }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px', fontWeight: 600 }}>
        {name}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#6366f1', fontFamily: 'Syne, sans-serif' }}>
          ₹{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
          ({pct}%)
        </span>
      </div>
    </div>
  );
}

// ─── MONEY TAB ───────────────────────────────────────────────────────────
function MoneyTab({ accounts, transactions, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const currentMonthLabel = `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`;

  // Analyzer filters - multi-select
  const [chartAccounts, setChartAccounts] = useState(new Set());
  const [chartTypes, setChartTypes] = useState(new Set());
  const [chartMonths, setChartMonths] = useState(new Set([currentMonthLabel]));
  const [chartHeadings, setChartHeadings] = useState(new Set());

  // Table filters - multi-select
  const [filterAccounts, setFilterAccounts] = useState(new Set());
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDateFromDebounced, setFilterDateFromDebounced] = useState("");
  const [filterDateToDebounced, setFilterDateToDebounced] = useState("");
  const [filterMonths, setFilterMonths] = useState(new Set([currentMonthLabel]));
  const [filterTypes, setFilterTypes] = useState(new Set());
  const [filterHeadings, setFilterHeadings] = useState(new Set());
  const [filterDesc, setFilterDesc] = useState("");
  const [filterDescDebounced, setFilterDescDebounced] = useState("");

  // Dropdown visibility
  const [openDropdown, setOpenDropdown] = useState(null);
  
  // Table sorting
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  /// Change actions: 90 to actions: 130
  const [colWidths, setColWidths] = useState({ checkbox: 50, date: 90, account: 230, type: 110, month: 110, amount: 130, heading: 140, desc: 0, actions: 100 });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isClickOnFilter = e.target.closest('.filter-bar') || e.target.closest('.chip-dropdown');
      if (!isClickOnFilter) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce filter inputs (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => setFilterDateFromDebounced(filterDateFrom), 300);
    return () => clearTimeout(timer);
  }, [filterDateFrom]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterDateToDebounced(filterDateTo), 300);
    return () => clearTimeout(timer);
  }, [filterDateTo]);

  useEffect(() => {
    if (!filterDateFromDebounced) return;
    const from = new Date(filterDateFromDebounced);
    const to = filterDateToDebounced ? new Date(filterDateToDebounced) : from;
    
    // Collect all months between from and to
    const months = new Set();
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= end) {
      const label = `${cursor.toLocaleString('default', { month: 'long' })} ${cursor.getFullYear()}`;
      months.add(label);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    setFilterMonths(months);
  }, [filterDateFromDebounced, filterDateToDebounced]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterDescDebounced(filterDesc), 300);
    return () => clearTimeout(timer);
  }, [filterDesc]);

  // Memoize expensive computations
  const { allMonths, allHeadings, allAccountsList, allTypes } = useMemo(() => {
    return {
      allMonths: [...new Set(transactions.map(t => {
        if (!t.date) return null;
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }))]
      .filter(Boolean)
      .sort().reverse()
      .map(ym => {
        const [y, m] = ym.split('-');
        const d = new Date(y, m - 1, 1);
        return `${d.toLocaleString('default', { month: 'long' })} ${y}`;
      }),
      allHeadings: [...new Set(transactions.map(t => t.heading))].sort(),
      allAccountsList: [...new Set(transactions.map(t => t.account))].sort(),
      allTypes: [...new Set(transactions.map(t => t.type))].sort().map(t => t.charAt(0).toUpperCase() + t.slice(1))
    };
  }, [transactions]);

  // Multi-select toggle functions
  const toggleSet = (set, item) => {
    const newSet = new Set(set);
    if (newSet.has(item)) newSet.delete(item);
    else newSet.add(item);
    return newSet;
  };

  // Memoize analyzer filtered results
  const { analyzerFiltered, pieArr } = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      const month = d.toLocaleString('default', { month: 'long' });
      const year = d.getFullYear();
      const ml = `${month} ${year}`;
      const capitalizedType = t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : '';
      const accountMatch = chartAccounts.size === 0 || chartAccounts.has(t.account);
      const typeMatch = chartTypes.size === 0 || chartTypes.has(capitalizedType);
      const monthMatch = chartMonths.size === 0 || chartMonths.has(ml);
      const headingMatch = chartHeadings.size === 0 || chartHeadings.has(t.heading);
      return accountMatch && typeMatch && monthMatch && headingMatch;
    });

    const pieData = {};
    filtered.forEach(t => { 
      pieData[t.heading] = (pieData[t.heading] || 0) + Math.abs(parseFloat(t.amount)); 
    });
    const pieArray = Object.entries(pieData).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    
    return { analyzerFiltered: filtered, pieArr: pieArray };
  }, [transactions, chartAccounts, chartTypes, chartMonths, chartHeadings]);

  // Memoize table filtered and sorted results
  const tableFiltered = useMemo(() => {
    return transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      const month = d.toLocaleString('default', { month: 'long' });
      const year = d.getFullYear();
      const ml = `${month} ${year}`;
      const dateStr = t.date || '';
      const capitalizedType = t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : '';
      const accountMatch = filterAccounts.size === 0 || filterAccounts.has(t.account);
      const dateMatch = (() => {
        if (!filterDateFromDebounced) return true;
        const txDate = new Date(dateStr);
        const from = new Date(filterDateFromDebounced);
        const to = filterDateToDebounced ? new Date(filterDateToDebounced) : from;
        return txDate >= from && txDate <= to;
      })();
      const monthMatch = filterMonths.size === 0 || filterMonths.has(ml);
      const typeMatch = filterTypes.size === 0 || filterTypes.has(capitalizedType);
      const headingMatch = filterHeadings.size === 0 || filterHeadings.has(t.heading);
      const descMatch = !filterDescDebounced || (t.description || '').toLowerCase().includes(filterDescDebounced.toLowerCase());
      return accountMatch && dateMatch && monthMatch && typeMatch && headingMatch && descMatch;
    }).sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'date') {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortBy === 'account') {
        aVal = a.account;
        bVal = b.account;
      } else if (sortBy === 'type') {
        aVal = a.type;
        bVal = b.type;
      } else if (sortBy === 'month') {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortBy === 'amount') {
        aVal = parseFloat(a.amount);
        bVal = parseFloat(b.amount);
      } else if (sortBy === 'heading') {
        aVal = a.heading;
        bVal = b.heading;
      } else if (sortBy === 'desc') {
        aVal = a.description || '';
        bVal = b.description || '';
      }
      
      if (typeof aVal === 'string') {
        const res = sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        // Tie-breaker: If dates/strings are identical, show the most recently added first
        return res !== 0 ? res : b.id - a.id; 
      } else {
        const res = sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        // Tie-breaker: If numbers are identical, show the most recently added first
        return res !== 0 ? res : b.id - a.id; 
      }
    });
  }, [transactions, filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterTypes, filterHeadings, filterDescDebounced, sortBy, sortDir]);

  // Paginate the filtered results
  const totalPages = Math.ceil(tableFiltered.length / rowsPerPage);
  const paginatedRows = useMemo(() => {
    const start = currentPage * rowsPerPage;
    const end = start + rowsPerPage;
    return tableFiltered.slice(start, end);
  }, [tableFiltered, currentPage, rowsPerPage]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterTypes, filterHeadings, filterDescDebounced]);

  const PIE_COLORS = ["#6366f1","#8b5cf6","#d946ef","#ec4899","#f43f5e","#f97316","#eab308","#84cc16","#22c55e","#10b981","#14b8a6","#06b6d4"];

  // Handle column resize
  const handleStartResize = (col, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[col];
    
    const handleMouseMove = (me) => {
      const diff = me.clientX - startX;
      const minWidths = { date: 80, account: 200, type: 90, month: 100, amount: 120, heading: 100, desc: 100 };
      const newWidth = Math.max(minWidths[col] || 60, startWidth + diff);
      setColWidths(w => ({ ...w, [col]: newWidth }));
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  const handleSortClick = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // Rows per page dropdown component
  const RowsPerPageDropdown = ({ value, onChange }) => {
    const options = [10, 25, 50, 100];
    return (
      <div style={{ position: 'relative' }}>
        <button
          className={`filter-chip ${openDropdown === 'rowsPerPage' ? 'open' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === 'rowsPerPage' ? null : 'rowsPerPage')}
        >
          <span>📄</span>
          <span>{value} rows</span>
          <span className="chip-arrow">▼</span>
        </button>

        {openDropdown === 'rowsPerPage' && (
          <div className="chip-dropdown">
            {options.map(opt => (
              <div
                key={opt}
                className={`chip-dropdown-item ${value === opt ? 'selected' : ''}`}
                onClick={() => {
                  onChange(opt);
                  setOpenDropdown(null);
                  setCurrentPage(0);
                }}
              >
                <div className={`chip-checkbox ${value === opt ? 'checked' : ''}`} />
                <span>{opt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Multi-select dropdown component
  const MultiSelectDropdown = ({ label, icon, options, selected, onToggle, dropdownKey }) => {
    const allSelected = selected.size === options.length && options.length > 0;
    const toggleSelectAll = () => {
      if (allSelected) {
        onToggle(new Set());
      } else {
        onToggle(new Set(options));
      }
    };
    return (
      <div style={{ position: 'relative' }}>
        <button
          className={`filter-chip ${selected.size > 0 ? 'active' : ''} ${openDropdown === dropdownKey ? 'open' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
        >
          <span>{icon}</span>
          <span>{label}</span>
          {selected.size > 0 && <span className="chip-count">{selected.size}</span>}
          <span className="chip-arrow">▼</span>
        </button>

        {openDropdown === dropdownKey && (
          <div className="chip-dropdown">
            {options.length > 0 && (
              <>
                <div
                  className="chip-dropdown-item chip-select-all"
                  onClick={toggleSelectAll}
                  style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px' }}
                >
                  <div className={`chip-checkbox ${allSelected ? 'checked' : ''}`} />
                  <span>{allSelected ? 'Clear All' : 'Select All'}</span>
                </div>
              </>
            )}
            {options.map(opt => (
              <div
                key={opt}
                className={`chip-dropdown-item ${selected.has(opt) ? 'selected' : ''}`}
                onClick={() => onToggle(toggleSet(selected, opt))}
              >
                <div className={`chip-checkbox ${selected.has(opt) ? 'checked' : ''}`} />
                <span>{opt}</span>
              </div>
            ))}
            {options.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.8rem' }}>No options</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedRows.map(t => t.id)));
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transactions?`)) return;
    try {
      // Delete them all in parallel via the existing route
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`${API}/transactions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } })
        )
      );
      setSelectedIds(new Set());
      onRefresh(); // Refresh balances and list
    } catch (e) {
      alert("Error deleting some transactions: " + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this transaction? This will also update your account balance.")) return;
    try {
      const res = await fetch(`${API}/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        onRefresh(); // Refresh balances and transactions!
      } else {
        alert("Failed to delete transaction.");
      }
    } catch (e) {
      alert("Error deleting: " + e.message);
    }
  };
  
  return (
    <div>
      {/* Spending Analyzer Section - Collapsible */}
      <div className="analyser-card">
        <div
          className={`analyser-header ${expanded ? 'open' : ''}`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="analyser-header-left">
            <div className="analyser-header-icon">📊</div>
            <div>
              <div className="analyser-header-title">Spending Analyser</div>
              <div className="analyser-header-sub" style={{ display: 'none' }}>
                {analyzerFiltered.length > 0 ? `${analyzerFiltered.length} transactions · ${fmt(analyzerFiltered.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0))}` : 'Filter by account, month, or category'}
              </div>
            </div>
          </div>
          <span className={`analyser-chevron ${expanded ? 'open' : ''}`}>▼</span>
        </div>

        {expanded && (
          <div style={{ animation: 'fadeIn 0.3s ease', padding: '1.5rem' }}>
            {/* Analyzer Filters */}
            <div className="filter-bar" style={{ marginBottom: '1.5rem' }} ref={dropdownRef}>
              <MultiSelectDropdown
                label="Account"
                icon="🏦"
                options={allAccountsList}
                selected={chartAccounts}
                onToggle={setChartAccounts}
                dropdownKey="analyzerAccount"
              />
              <MultiSelectDropdown
                label="Type"
                icon="💳"
                options={allTypes}
                selected={chartTypes}
                onToggle={setChartTypes}
                dropdownKey="analyzerType"
              />
              <MultiSelectDropdown
                label="Month"
                icon="📅"
                options={allMonths}
                selected={chartMonths}
                onToggle={setChartMonths}
                dropdownKey="analyzerMonth"
              />
              <MultiSelectDropdown
                label="Heading"
                icon="🏷️"
                options={allHeadings}
                selected={chartHeadings}
                onToggle={setChartHeadings}
                dropdownKey="analyzerHeading"
              />
              {(chartAccounts.size > 0 || chartTypes.size > 0 || chartMonths.size > 0 || chartHeadings.size > 0) && (
                <button 
                  className="filter-chip" 
                  onClick={() => {
                    setChartAccounts(new Set());
                    setChartTypes(new Set());
                    setChartMonths(new Set()); // <-- Empties the month completely!
                    setChartHeadings(new Set());
                  }}
                  style={{ border: '1px dashed var(--neg)', color: 'var(--neg)', background: 'transparent' }}
                >
                  <span>❌</span><span>Clear</span>
                </button>
              )}
            </div>

            {/* Pie Chart + Legend Grid */}
            {pieArr.length > 0 ? (
              <div className="pie-grid">
                {/* Pie Chart */}
                {/* 3D Modern Donut Chart */}
                <div style={{ position: 'relative', background: 'rgba(99, 102, 241, 0.04)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(99, 102, 241, 0.1)', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      {/* 1. The 3D "Depth" Base Layer (Shifted down and darkened) */}
                      <Pie 
                        data={pieArr.slice(0, 10)} 
                        dataKey="value" 
                        cx="50%" 
                        cy="54%" /* Shifted down to create thickness */
                        outerRadius={125} 
                        innerRadius={80}
                        paddingAngle={5}
                        cornerRadius={8}
                        stroke="none"
                        isAnimationActive={false} /* Base stays static while top animates */
                      >
                        {pieArr.slice(0, 10).map((_, i) => (
                          <Cell 
                            key={`depth-${i}`} 
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            style={{ filter: 'brightness(0.45)' }} /* Darkens the sides for realistic shadow */
                          />
                        ))}
                      </Pie>

                      {/* 2. The Main "Top" Glassy Layer */}
                     <Pie 
                        data={pieArr.slice(0, 10)} 
                        dataKey="value" 
                        cx="50%" 
                        cy="54%" /* Shifted down to create thickness */
                        outerRadius={125} 
                        innerRadius={80}
                        paddingAngle={5}
                        cornerRadius={8}
                        stroke="none"
                        animationDuration={1200} /* Match the top layer's animation */
                        animationEasing="ease-out"
                      >
                        {pieArr.slice(0, 10).map((_, i) => (
                          <Cell 
                            key={i} 
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            style={{ 
                              filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.5))', /* Floats the top layer */
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              cursor: 'pointer'
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={<CustomPieTooltip pieData={pieArr} />} 
                        wrapperStyle={{ zIndex: 100 }} /* Forces tooltip above the center text */
                        cursor={{fill: 'transparent'}} 
                      />                    
                      </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Floating Total Label perfectly centered in the Donut hole */}
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Total</div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text)' }}>
                      ₹{pieArr.reduce((sum, item) => sum + item.value, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>  

                {/* Legend - Scrollable Container */}
                <div 
                  className="pie-legend-container"
                  style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    height: '380px',
                    background: 'rgba(99, 102, 241, 0.04)',
                    border: '1px solid rgba(99, 102, 241, 0.1)',
                    borderRadius: '16px',
                    padding: '1.5rem 1rem',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Scroll Indicator Top */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '20px',
                    background: 'linear-gradient(to bottom, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0))',
                    borderRadius: '16px 16px 0 0',
                    pointerEvents: 'none',
                    zIndex: 5
                  }} />

                  {/* Legend Items */}
                  <div 
                    style={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                      overflowY: 'auto',
                      paddingRight: '0.5rem',
                      flex: 1,
                      paddingTop: '0.5rem'
                    }}
                    className="pie-legend-scroll"
                  >
                    {pieArr.map((d, i) => {
                      const total = pieArr.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
                      
                      // Check if this category is currently active in the table filters
                      const isSelected = filterHeadings.has(d.name);
                      
                      return (
                        <div 
                          key={d.name} 
                          className="pie-legend-item" 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            padding: '0.75rem 0.9rem', 
                            borderRadius: '10px',
                            background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                            border: `1px solid ${isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)'}`,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                              e.currentTarget.style.transform = 'translateX(4px)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                              e.currentTarget.style.transform = 'translateX(0)';
                            }
                          }}
                          onClick={() => {
                            if (isSelected) {
                              // Toggle off if already selected
                              setFilterHeadings(new Set());
                            } else {
                              // Set filter and sync scope
                              setFilterHeadings(new Set([d.name]));
                              setFilterAccounts(new Set(chartAccounts));
                              setFilterTypes(new Set(chartTypes));
                              setFilterMonths(new Set(chartMonths));
                              document.querySelector('.tx-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                            <div 
                              style={{ 
                                background: PIE_COLORS[i % PIE_COLORS.length], 
                                width: '12px', 
                                height: '12px', 
                                borderRadius: '4px', 
                                flexShrink: 0,
                                boxShadow: `0 2px 8px ${PIE_COLORS[i % PIE_COLORS.length]}40`
                              }} 
                            />
                            <span style={{ color: 'var(--text3)', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginLeft: '0.75rem', flexShrink: 0 }}>
                            <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem', minWidth: '75px', textAlign: 'right', fontFamily: 'Syne, sans-serif' }}>₹{Number(d.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            <span style={{ color: 'var(--text2)', fontSize: '0.7rem', minWidth: '38px', textAlign: 'right', fontWeight: 600 }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Scroll Indicator Bottom - shows scrollable state */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '30px',
                    background: 'linear-gradient(to top, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0))',
                    borderRadius: '0 0 16px 16px',
                    pointerEvents: 'none',
                    zIndex: 5
                  }} />
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', gridColumn: '1 / -1' }}>
                📭 No transactions match your filters
              </div>
            )}

            {/* Transaction Count Stats */}
            {analyzerFiltered.length > 0 && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(99,102,241,0.08)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.5rem' }}>Income Txns</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--pos)' }}>
                      {analyzerFiltered.filter(t => t.type === 'credit').length}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                      {fmt(analyzerFiltered.filter(t => t.type === 'credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}
                    </div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.5rem' }}>Expense Txns</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--neg)' }}>
                      {analyzerFiltered.filter(t => t.type === 'debit').length}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                      {fmt(analyzerFiltered.filter(t => t.type === 'debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <section className="section">
        <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>💳 All Transactions</h2>
        
        {/* Table Filters */}
        <div className="filter-bar" ref={dropdownRef}>
        <MultiSelectDropdown
            label="Account"
            icon="🏦"
            options={allAccountsList}
            selected={filterAccounts}
            onToggle={setFilterAccounts}
            dropdownKey="tableAccount"
          />
          <MultiSelectDropdown
            label="Type"
            icon="💳"
            options={allTypes}
            selected={filterTypes}
            onToggle={setFilterTypes}
            dropdownKey="tableType"
          />
          <MultiSelectDropdown
            label="Month"
            icon="📅"
            options={allMonths}
            selected={filterMonths}
            onToggle={setFilterMonths}
            dropdownKey="tableMonth"
          />
          <MultiSelectDropdown
            label="Heading"
            icon="🏷️"
            options={allHeadings}
            selected={filterHeadings}
            onToggle={setFilterHeadings}
            dropdownKey="tableHeading"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '999px', padding: '0.45rem 0.875rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>📅</span>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: filterDateFrom ? 'var(--text)' : 'var(--text2)', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", width: filterDateFrom ? '100px' : '90px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>→</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            min={filterDateFrom}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: filterDateTo ? 'var(--text)' : 'var(--text2)', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", width: filterDateTo ? '100px' : '90px', cursor: 'pointer' }}
          />
          {(filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>
          <input
            className="inp"
            placeholder="🔍 Description"
            value={filterDesc}
            onChange={e => setFilterDesc(e.target.value)}
            style={{ fontSize: '0.8rem', width: '200px', padding: '0.45rem 0.75rem', borderRadius: '999px' }}
          />
          {(filterAccounts.size > 0 || filterTypes.size > 0 || filterMonths.size > 0 || filterHeadings.size > 0 || filterDateFrom || filterDateTo || filterDesc) && (
            <button 
              className="filter-chip" 
              onClick={() => {
                setFilterAccounts(new Set());
                setFilterTypes(new Set());
                setFilterMonths(new Set());
                setFilterHeadings(new Set());
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterDesc("");
              }}
              style={{ border: '1px dashed var(--neg)', color: 'var(--neg)', background: 'transparent' }}
            >
              <span>❌</span><span>Clear All</span>
            </button>
          )}
        </div>

        {/* Stats Bar & Pagination - Above Table */}
        {tableFiltered.length > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="tx-stats-bar" style={{ marginBottom: '1.5rem' }}>
              <span>
                Page <strong style={{ color: 'var(--text)' }}>{currentPage + 1} of {totalPages}</strong> · Showing <strong style={{ color: 'var(--text)' }}>{paginatedRows.length}</strong> of {tableFiltered.length} transactions
              </span>
              <span>
                <span className="pos" style={{ fontWeight: 600 }}>{fmt(tableFiltered.filter(t => t.type === 'credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}</span>
                {' '}in &nbsp;·&nbsp; 
                <span className="neg" style={{ fontWeight: 600 }}>{fmt(tableFiltered.filter(t => t.type === 'debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}</span>
                {' '}out
              </span>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <RowsPerPageDropdown value={rowsPerPage} onChange={setRowsPerPage} />

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  style={{ 
                    padding: '0.45rem 0.85rem', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border)', 
                    background: currentPage === 0 ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)',
                    color: currentPage === 0 ? 'var(--text2)' : 'var(--text)',
                    cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: currentPage === 0 ? 0.5 : 1
                  }}
                >
                  ← Prev
                </button>

                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i;
                    } else if (currentPage < 2) {
                      pageNum = i;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 5 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: pageNum === currentPage ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: pageNum === currentPage ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-input)',
                          color: pageNum === currentPage ? 'var(--accent)' : 'var(--text2)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: pageNum === currentPage ? 600 : 400
                        }}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                </div>

                <button 
                  onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                  disabled={currentPage === totalPages - 1}
                  style={{ 
                    padding: '0.45rem 0.85rem', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border)', 
                    background: currentPage === totalPages - 1 ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)',
                    color: currentPage === totalPages - 1 ? 'var(--text2)' : 'var(--text)',
                    cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: currentPage === totalPages - 1 ? 0.5 : 1
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transactions List */}
        <div className="tx-table-wrap">
          <div className="tx-table-head" style={{ gridTemplateColumns: `${colWidths.checkbox}px ${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px minmax(250px, 1fr) ${colWidths.actions}px` }}>
            <div className="tx-col-header" style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0 }} onClick={handleSelectAll}>
              <div className={`chip-checkbox ${selectedIds.size > 0 && selectedIds.size === paginatedRows.length ? 'checked' : ''}`} />
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('date')}>
              <span>Date</span>
              {sortBy === 'date' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              <div className="col-resize" onMouseDown={(e) => handleStartResize('date', e)}></div>
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('account')}>
              <span>Account</span>
              {sortBy === 'account' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              <div className="col-resize" onMouseDown={(e) => handleStartResize('account', e)}></div>
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('type')}>
              <span>Type</span>
              {sortBy === 'type' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              <div className="col-resize" onMouseDown={(e) => handleStartResize('type', e)}></div>
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('month')}>
              <span>Month</span>
              {sortBy === 'month' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              <div className="col-resize" onMouseDown={(e) => handleStartResize('month', e)}></div>
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('amount')}>
              <span>Amount</span>
              {sortBy === 'amount' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              <div className="col-resize" onMouseDown={(e) => handleStartResize('amount', e)}></div>
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('heading')}>
              <span>Category</span>
              {sortBy === 'heading' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              <div className="col-resize" onMouseDown={(e) => handleStartResize('heading', e)}></div>
            </div>
            <div className="tx-col-header" onClick={() => handleSortClick('desc')}>
              <span>Description</span>
              {sortBy === 'desc' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </div>
            <div className="tx-col-header">
              <span>Actions</span>
            </div>
          </div>
          {tableFiltered.length > 0 ? (
            paginatedRows.map((t, i) => {
              const d = new Date(t.date);
              const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
              return (
                <div key={i} className="tx-row" style={{ gridTemplateColumns: `${colWidths.checkbox}px ${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px minmax(250px, 1fr) ${colWidths.actions}px` }}>
                  <span style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }} onClick={() => toggleSelection(t.id)}>
                    <div className={`chip-checkbox ${selectedIds.has(t.id) ? 'checked' : ''}`} />
                  </span>
                  <span className="tx-date">{formatDate(t.date)}</span>
                  <span className="tx-account">
                    <span>{getBankEmoji(t.account)}</span>
                    <span>{t.account}</span>
                  </span>
                  <span className="tx-type-cell"><span className={`tx-badge ${t.type}`}>{t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span></span>
                  <span className="tx-month">{monthLabel}</span>
                  <span className={`tx-amount ${t.type === 'debit' ? 'neg' : t.type === 'credit' ? 'pos' : t.type === 'investment' ? 'blue-text' : 'accent'}`}>
                    {t.type === 'debit' ? '−' : '+'}{fmt(t.amount)}
                  </span>
                  <span className="tx-heading">{t.heading}</span>
                  <span className="tx-desc">{t.description || '—'}</span>
                  <span className="tx-actions">
                    <button className="action-icon-btn edit" onClick={() => setEditingTx(t)} title="Edit">✏️</button>
                    <button className="action-icon-btn delete" onClick={() => handleDelete(t.id)} title="Delete">🗑️</button>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="empty-state">📭 No transactions match your filters</div>
          )}
          {/* Floating Action Bar */}
          {selectedIds.size > 0 && (
            <div className="floating-action-bar">
              <span className="fab-text">{selectedIds.size} selected</span>
              <div className="fab-actions">
                <button className="action-btn" onClick={() => setIsBulkEditOpen(true)} style={{ padding: '0.45rem 1rem' }}>✏️ Edit</button>
                <button className="action-btn" onClick={handleBulkDelete} style={{ padding: '0.45rem 1rem', background: '#dc2626', boxShadow: 'none' }}>🗑️ Delete</button>
                <button className="action-btn secondary" onClick={() => setSelectedIds(new Set())} style={{ padding: '0.45rem 1rem' }}>✕</button>
              </div>
            </div>
          )}

          {/* Bulk Edit Modal */}
          {isBulkEditOpen && (
            <BulkEditTransactionModal 
              transactions={transactions.filter(t => selectedIds.has(t.id))} 
              onClose={() => { setIsBulkEditOpen(false); setSelectedIds(new Set()); }} 
              onRefresh={onRefresh} 
            />
          )}
        </div>
      </section>

      {editingTx && (
        <EditTransactionModal 
          tx={editingTx} 
          onClose={() => setEditingTx(null)}  
          onRefresh={onRefresh} 
        />
      )}
    </div>
  );
}

function AutocompleteInput({ value, onChange, options, placeholder }) {
  const [filtered, setFiltered] = useState([]);
  const [show, setShow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleType = (e) => {
    const val = e.target.value;
    onChange(val);
    setFiltered(options.filter(o => o.toLowerCase().includes(val.toLowerCase())));
    setShow(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!show) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault(); // Prevents cursor from moving
      setActiveIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      onChange(filtered[activeIndex]);
      setShow(false);
      setActiveIndex(-1);
    } else if (e.key === 'Escape') {
      setShow(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input 
        type="text" className="bulk-inp" placeholder={placeholder} 
        value={value} onChange={handleType} onKeyDown={handleKeyDown}
        onFocus={() => { 
          setFiltered(options.filter(o => o.toLowerCase().includes(value.toLowerCase()))); 
          setShow(true); 
        }}
        onBlur={() => setTimeout(() => { setShow(false); setActiveIndex(-1); }, 200)} 
      />
      {show && filtered.length > 0 && (
        <div className="custom-dropdown">
          {filtered.map((opt, idx) => (
            <div 
              key={opt} 
              className={`custom-dropdown-item ${idx === activeIndex ? 'active-item' : ''}`} 
              onClick={() => { onChange(opt); setShow(false); setActiveIndex(-1); }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTransactionModal({ accounts, transactions, onAdd, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  
  const recentDescriptions = [...new Set(
    (transactions || [])
      .slice(0, 100)
      .map(t => t.description)
      .filter(desc => desc && desc.trim() !== '')
  )];

  // Create a factory for a fresh row
  const createEmptyRow = () => ({
    id: Date.now() + Math.random(), // unique ID for React mapping
    account: 'KOTAK', 
    date: today, 
    type: 'debit', 
    heading: '', 
    description: '', 
    amount: ''
  });

  const [rows, setRows] = useState([createEmptyRow()]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateRow = (id, field, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows([...rows, {
      ...lastRow,
      id: Date.now() + Math.random(), // Need a fresh ID for React
      amount: '',
      description: ''
    }]);
  };  
  
  const removeRow = (id) => {
    if (rows.length === 1) return; // Keep at least one row
    setRows(rows.filter(r => r.id !== id));
  };

  const submit = async () => {
    // Basic validation: ensure all rows have an amount and heading
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].amount || isNaN(rows[i].amount) || !rows[i].heading.trim()) {
        return alert(`Row ${i + 1} is missing a valid amount or category.`);
      }
    }

    setLoading(true);
    try {
      // Clean up the payload (remove the temporary frontend ID and parse amounts)
      const payload = rows.map(r => ({
        account: r.account,
        date: r.date,
        type: r.type,
        heading: r.heading.trim(),
        description: r.description.trim() || "",
        amount: parseFloat(r.amount)
      }));

      const res = await fetch(`${API}/transactions`, {
        method: "POST", headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(payload),
      });

      if (res.ok) {
        onAdd(); // This fetches the newly updated balances directly from the database!
        setSuccess(true);
        setTimeout(() => { setSuccess(false); onClose(); }, 1500);
      } else {
        const errText = await res.text();
        alert(`Failed to save. Server returned: ${res.status}\n${errText.substring(0, 100)}`);
      }
    } catch (e) {
      alert("Network error: " + e.message + "\n\nIf the server was asleep, please wait 15 seconds and click Save again. You will not lose your typed data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📝 Log Transactions</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        {/* We removed the huge padding, and added a sensible minHeight so the first row has room to breathe */}
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1rem' }}>
          
          {/* Table Headers */}
          <div className="bulk-grid bulk-header">
            <span>Account</span>
            <span>Date</span>
            <span>Type</span>
            <span>Category</span>
            <span>Amount (₹)</span>
            <span>Note</span>
            <span style={{textAlign: 'center'}}>#</span>
          </div>

          {/* Table Rows */}
          {rows.map((row, index) => (
            <div key={row.id} className="bulk-grid bulk-row" style={{ animation: 'fadeIn 0.2s ease' }}>
              <select className="bulk-sel" value={row.account} onChange={e => updateRow(row.id, 'account', e.target.value)}>
                {Object.keys(BANKS).map(b => <option key={b} value={b}>{BANKS[b].emoji} {b}</option>)}
              </select>
              
              <input type="date" className="bulk-inp" value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />
              
              <select className="bulk-sel" value={row.type} onChange={e => updateRow(row.id, 'type', e.target.value)}>
                <option value="debit">🔴 Debit</option>
                <option value="credit">🟢 Credit</option>
                <option value="savings">💰 Savings</option>
              </select>

              {/* Using a datalist for category autocomplete without messy z-index dropdowns in a grid */}
              <AutocompleteInput 
                value={row.heading} 
                onChange={val => updateRow(row.id, 'heading', val)} 
                options={CATEGORIES} 
                placeholder="Category" 
              />
              
              <input 
                type="number" className="bulk-inp" placeholder="0.00" 
                value={row.amount} onChange={e => updateRow(row.id, 'amount', e.target.value)} 
              />
              
              <AutocompleteInput 
                value={row.description} 
                onChange={val => updateRow(row.id, 'description', val)} 
                options={recentDescriptions} 
                placeholder="Optional note..." 
              />
              
              <button 
                className="bulk-del-btn" 
                onClick={() => removeRow(row.id)}
                disabled={rows.length === 1}
                style={{ opacity: rows.length === 1 ? 0.3 : 1, cursor: rows.length === 1 ? 'not-allowed' : 'pointer' }}
                title="Remove Row"
              >
                ×
              </button>
            </div>
          ))}

          {/* The Hidden Datalist for native browser autocomplete on Categories */}
          <datalist id="category-options">
            {CATEGORIES.map(cat => <option key={cat} value={cat} />)}
          </datalist>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button className="action-btn secondary" onClick={addRow} style={{ flex: 1, justifyContent: 'center' }}>
              ➕ Add Row
            </button>
            
            <button className={`action-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
              {loading ? "Saving..." : success ? "✅ Saved!" : `💾 Save (${rows.length})`}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function EditTransactionModal({ tx, onClose, onRefresh }) {
  const [form, setForm] = useState({
    date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
    account: tx.account,
    type: tx.type,
    heading: tx.heading,
    amount: tx.amount,
    description: tx.description || ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!form.amount || isNaN(form.amount) || !form.heading.trim()) {
      return alert("Missing a valid amount or category.");
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/transactions/${tx.id}`, {
        method: "PUT", 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, 
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (res.ok) {
        onRefresh(); 
        setSuccess(true);
        setTimeout(() => { setSuccess(false); onClose(); }, 1200);
      } else {
        alert("Failed to update transaction.");
      }
    } catch (e) {
      alert("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content bulk-modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">✏️ Edit Transaction</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          
          <div className="bulk-grid bulk-row" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: 'var(--bg2)', border: 'none' }}>
            <div className="form-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Account</label>
              <select className="bulk-sel" style={{ background: 'var(--bg3)', padding: '0.75rem' }} value={form.account} onChange={e => updateField('account', e.target.value)}>
                {Object.keys(BANKS).map(b => <option key={b} value={b}>{BANKS[b].emoji} {b}</option>)}
              </select>
            </div>
            
            <div className="form-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Date</label>
              <input type="date" className="bulk-inp" style={{ background: 'var(--bg3)', padding: '0.75rem' }} value={form.date} onChange={e => updateField('date', e.target.value)} />
            </div>
            
            <div className="form-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Type</label>
              <select className="bulk-sel" style={{ background: 'var(--bg3)', padding: '0.75rem' }} value={form.type} onChange={e => updateField('type', e.target.value)}>
                <option value="debit">🔴 Debit</option>
                <option value="credit">🟢 Credit</option>
                <option value="savings">💰 Savings</option>
              </select>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Amount (₹)</label>
              <input type="number" className="bulk-inp" style={{ background: 'var(--bg3)', padding: '0.75rem' }} value={form.amount} onChange={e => updateField('amount', e.target.value)} />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Category</label>
              <AutocompleteInput value={form.heading} onChange={val => updateField('heading', val)} options={CATEGORIES} placeholder="Category" />
            </div>
            
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Note</label>
              <input type="text" className="bulk-inp" style={{ background: 'var(--bg3)', padding: '0.75rem' }} value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Optional note..." />
            </div>
          </div>

          <button className={`submit-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading} style={{ width: '100%', marginTop: '1.5rem' }}>
            {loading ? "Saving..." : success ? "✅ Updated!" : "Save Changes"}
          </button>

        </div>
      </div>
    </div>
  );
}

function BulkEditTransactionModal({ transactions, onClose, onRefresh }) {
  // Pre-fill the grid with all selected transactions
  const [rows, setRows] = useState(
    transactions.map(tx => ({
      ...tx,
      date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : ''
    }))
  );
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateRow = (id, field, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const submit = async () => {
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].amount || isNaN(rows[i].amount) || !rows[i].heading.trim()) {
        return alert(`Row ${i + 1} is missing a valid amount or category.`);
      }
    }
    setLoading(true);
    try {
      const payload = rows.map(r => ({ ...r, amount: parseFloat(r.amount) }));
      const res = await fetch(`${API}/transactions/bulk-edit`, {
        method: "PUT", 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, 
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onRefresh(); 
        setSuccess(true);
        setTimeout(() => { setSuccess(false); onClose(); }, 1500);
      } else {
        alert("Failed to update transactions.");
      }
    } catch (e) {
      alert("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">✏️ Bulk Edit Transactions</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1rem' }}>
          
          <div className="bulk-grid bulk-header">
            <span>Account</span><span>Date</span><span>Type</span><span>Category</span><span>Amount (₹)</span><span>Note</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="bulk-grid bulk-row" style={{ animation: 'fadeIn 0.2s ease' }}>
              <select className="bulk-sel" value={row.account} onChange={e => updateRow(row.id, 'account', e.target.value)}>
                {Object.keys(BANKS).map(b => <option key={b} value={b}>{BANKS[b].emoji} {b}</option>)}
              </select>
              <input type="date" className="bulk-inp" value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />
              <select className="bulk-sel" value={row.type} onChange={e => updateRow(row.id, 'type', e.target.value)}>
                <option value="debit">🔴 Debit</option>
                <option value="credit">🟢 Credit</option>
                <option value="savings">💰 Savings</option>
              </select>
              <AutocompleteInput value={row.heading} onChange={val => updateRow(row.id, 'heading', val)} options={CATEGORIES} placeholder="Category" />
              <input type="number" className="bulk-inp" placeholder="0.00" value={row.amount} onChange={e => updateRow(row.id, 'amount', e.target.value)} />
              <input type="text" className="bulk-inp" value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)} placeholder="Optional note..." />
            </div>
          ))}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <button className={`action-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
              {loading ? "Saving..." : success ? "✅ Saved!" : `💾 Save All (${rows.length})`}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── ADD ACTIVITY MODAL ─────────────────────────────────────────────
function AddActivityModal({ onAdd, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ 
    date: today, gym: false, badminton: false, table_tennis: false, cricket: false, others: false, description: '' 
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/physical`, {
        method: "POST", headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(form),
      });
      if (res.ok) {
        onAdd(); 
        setSuccess(true);
        setTimeout(() => { setSuccess(false); onClose(); }, 1500);
      } else {
        alert("Failed to log activity.");
      }
    } catch (e) {
      alert("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">🏋️ Log Activity</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="add-form-card" style={{ border: 'none', padding: 0, minWidth: 'auto', background: 'transparent' }}>
            
            <div className="form-group">
              <label>Date</label>
              <input type="date" className="inp" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Activities Completed</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  ['gym', '🏋️ Gym'], ['badminton', '🏸 Badminton'], 
                  ['table_tennis', '🏓 Table Tennis'], ['cricket', '🏏 Cricket'], 
                  ['others', '🏃‍♂️ Others']
                ].map(([key, label]) => (
                  <div 
                    key={key} onClick={() => set(key, !form[key])}
                    style={{
                      padding: '0.65rem', border: `1px solid ${form[key] ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                      background: form[key] ? 'rgba(99,102,241,0.1)' : 'transparent', transition: 'all 0.2s'
                    }}
                  >
                    <div className={`chip-checkbox ${form[key] ? 'checked' : ''}`} style={{ margin: 0 }} />
                    <span style={{ fontSize: '0.85rem', color: form[key] ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Notes (Optional)</label>
              <input className="inp" placeholder="e.g., Leg day, 5km run..." value={form.description} onChange={e => set('description', e.target.value)} />
            </div>

            <button className={`submit-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading} style={{ marginTop: '0.5rem' }}>
              {loading ? "Saving..." : success ? "✅ Saved!" : "Save Activity"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── GYM TAB ───────────────────────────────────────────────────────────
function GymTab({ physical, onOpenModal }) {
  const [physMonth, setPhysMonth] = useState(new Date().getMonth());
  const [physYear, setPhysYear] = useState(new Date().getFullYear());

  // 1. Filter all records by the selected month and year
  const filteredRecords = physical.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === physMonth && d.getFullYear() === physYear;
  });

  // 2. Count how many of those filtered days had at least one activity
  const physActive = filteredRecords.filter(p => 
    p.gym || p.badminton || p.table_tennis || p.cricket || p.others
  ).length;

  // 3. Sort the filtered records for the table
  const sorted = [...filteredRecords].sort((a,b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="invest-layout" style={{ display: 'block' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Cleaned Up Days Active Stat Block */}
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', background: 'var(--card)', padding: '1rem 1.5rem', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
           
           {/* BIG Number */}
           <div style={{ fontSize: '3.2rem', fontWeight: 800, color: 'var(--accent2)', lineHeight: 0.85, fontFamily: "'Syne', sans-serif", position: 'relative', top: '-3px' }}>
             {physActive}
           </div>
           
           {/* Streamlined Label */}
           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '0.5rem' }}>
             <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text)', fontWeight: 700, letterSpacing: '0.5px' }}>Days Active</span>
             <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 500 }}>in {MONTHS[physMonth]} {physYear}</span>
           </div>
           
           <div style={{ width: '1px', height: '40px', background: 'var(--border)' }}></div>
           
           {/* Filters */}
           <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.25rem' }}>
              <select className="sel" style={{ width: 'auto', padding: '0.45rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px' }} value={physMonth} onChange={e => setPhysMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className="sel" style={{ width: 'auto', padding: '0.45rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px' }} value={physYear} onChange={e => setPhysYear(parseInt(e.target.value))}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
           </div>
        </div>

        <button className="action-btn" onClick={onOpenModal}>
          ➕ Log Activity
        </button>
      </div>

      {/* Data Table (Now Filtered!) */}
      <div>
        <div className="data-table">
          <div className="table-header" style={{ gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 2fr' }}>
            <span>📅 Date</span>
            <span style={{textAlign:'center'}}>🏋️ Gym</span>
            <span style={{textAlign:'center'}}>🏸 Badminton</span>
            <span style={{textAlign:'center'}}>🏓 TT</span>
            <span style={{textAlign:'center'}}>🏏 Cricket</span>
            <span style={{textAlign:'center'}}>🏃‍♂️ Others</span>
            <span>📝 Description</span>
          </div>
          {sorted.map((p, i) => (
            <div key={i} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 2fr' }}>
              <span style={{ fontWeight: 500 }}>{formatDate(p.date)}</span>
              <span style={{ textAlign: 'center' }}>{p.gym ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.badminton ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.table_tennis ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.cricket ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.others ? '✅' : '—'}</span>
              <span style={{ color: 'var(--text2)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description || '—'}</span>
            </div>
          ))}
          {sorted.length === 0 && <div className="empty-state">No activity logged in {MONTHS[physMonth]} {physYear}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── INVEST TAB ───────────────────────────────────────────────────────────
function InvestTab({ investments, onAdd }) {
  const [syncing, setSyncing] = useState(false);
  const [filterMonth, setFilterMonth] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenStr, setTokenStr] = useState("");
  const [syncingSheets, setSyncingSheets] = useState(false);

  // Get unique months for the dropdown filter
  const allMonths = useMemo(() => {
    return [...new Set(investments.map(inv => {
      if (!inv.date) return null;
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))]
    .filter(Boolean)
    .sort().reverse()
    .map(ym => {
      const [y, m] = ym.split('-');
      const d = new Date(y, m - 1, 1);
      return { val: ym, label: `${d.toLocaleString('default', { month: 'long' })} ${y}` };
    });
  }, [investments]);

  // Apply filters and sorting
  const processedData = useMemo(() => {
    let data = [...investments];
    
    // Filter
    if (filterMonth) {
      data = data.filter(inv => {
        if (!inv.date) return false;
        const d = new Date(inv.date);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return ym === filterMonth;
      });
    }

    // Sort
    data.sort((a, b) => {
      let aVal, bVal;
      
      if (sortBy === 'date') {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortBy === 'ret_amount') {
        aVal = parseFloat(a.total_curr || 0) - parseFloat(a.total_inv || 0);
        bVal = parseFloat(b.total_curr || 0) - parseFloat(b.total_inv || 0);
      } else {
        // Fallback for number fields (total_inv, total_curr, total_ret_pct)
        aVal = parseFloat(a[sortBy] || 0);
        bVal = parseFloat(b[sortBy] || 0);
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  }, [investments, filterMonth, sortBy, sortDir]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc'); // Default to highest/newest first when changing columns
    }
  };

  const handleOpenKite = () => {
    // 1. Open the Kite login page
    window.open("https://kite.zerodha.com/connect/LOGIN?api_key=6gcxnf0qycaphw5k", "_blank", "width=500,height=600");
    // 2. Show the inline input field
    setShowTokenInput(true);
  };

  const handleSubmitToken = async () => {
    let token = tokenStr.trim();
    
    // Smart extraction: pluck the request_token out of the pasted URL
    if (token.includes("request_token=")) {
      const match = token.match(/request_token=([^&]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      alert("❌ Please paste the full URL containing the request_token.");
      return;
    }

    setSyncing(true);
    try {
      const res = await fetch(`${API}/sync/kite`, {
        method: 'POST',
        headers: { 
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}` 
},
        body: JSON.stringify({ request_token: token })
      });
      const data = await res.json();
      
      if (data.success) {
        alert("✅ " + data.message);
        onAdd(); // Refresh the table
        setShowTokenInput(false); // Hide the input
        setTokenStr(""); // Clear the input
      } else {
        alert("❌ Sync Failed: " + data.message);
      }
    } catch (e) {
      alert("❌ Network Error: " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncToSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch(`${API}/sync/investments-to-sheets`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) {
        alert(data.message.includes("No new") ? "👍 " + data.message : "✅ " + data.message);
      } else {
        alert("❌ Sync Failed: " + data.message);
      }
    } catch (e) {
      alert("❌ Network Error: " + e.message);
    } finally {
      setSyncingSheets(false);
    }
  };

  return (
    <div className="invest-layout" style={{ display: 'block' }}>
      
      {/* Controls Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select className="sel" style={{ width: 'auto', minWidth: '180px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">📅 All Months</option>
            {allMonths.map(m => (
              <option key={m.val} value={m.val}>{m.label}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 500 }}>
            Showing {processedData.length} records
          </span>
        </div>
        
        {!showTokenInput ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button 
              className="action-btn" 
              style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
              onClick={handleSyncToSheets}
              disabled={syncingSheets}
            >
              {syncingSheets ? '⏳ Syncing...' : '📥 Sync to Sheets'}
            </button>
            <button 
              className="action-btn" 
              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}
              onClick={handleOpenKite} 
            >
              ⚡ Sync with Kite
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', animation: 'fadeIn 0.3s ease' }}>
            <input 
              className="inp" 
              placeholder="Paste 127.0.0.1 URL here..." 
              value={tokenStr} 
              onChange={e => setTokenStr(e.target.value)}
              style={{ width: '250px', padding: '0.55rem 0.8rem', borderRadius: '8px' }}
            />
            <button className="action-btn" onClick={handleSubmitToken} disabled={syncing}>
              {syncing ? '⏳...' : 'Submit'}
            </button>
            <button 
              className="action-btn secondary" 
              onClick={() => { setShowTokenInput(false); setTokenStr(""); }} 
              disabled={syncing}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div>
        <div className="data-table">
          <div className="table-header inv-cols" style={{ cursor: 'pointer', userSelect: 'none' }}>
            <span onClick={() => handleSort('date')}>Date {sortBy === 'date' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
            <span onClick={() => handleSort('total_inv')}>INV (MF) {sortBy === 'total_inv' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
            <span onClick={() => handleSort('total_curr')}>CURR (MF) {sortBy === 'total_curr' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
            <span onClick={() => handleSort('ret_amount')}>RET ₹ {sortBy === 'ret_amount' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
            <span onClick={() => handleSort('total_ret_pct')}>RET % {sortBy === 'total_ret_pct' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
            <span onClick={() => handleSort('total_status')}>Status {sortBy === 'total_status' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
          </div>
          {processedData.map((inv, i) => {
            const ret = parseFloat(inv.total_curr || 0) - parseFloat(inv.total_inv || 0);
            return (
              <div key={i} className={`table-row inv-cols ${i%2===0?'row-even':''}`}>
                <span>{formatDate(inv.date)}</span>
                <span>{fmt(inv.total_inv)}</span>
                <span>{fmt(inv.total_curr)}</span>
                <span className={ret >= 0 ? 'pos' : 'neg'}>{fmt(ret)}</span>
                <span className={parseFloat(inv.total_ret_pct) >= 0 ? 'pos' : 'neg'}>{fmtPct(inv.total_ret_pct)}</span>
                <span style={{fontSize:'1.2rem'}}>{inv.total_status || '—'}</span>
              </div>
            );
          })}
          {processedData.length === 0 && <div className="empty-state">No investment snapshots match your filters.</div>}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('dt_token'));
  const [appLoading, setAppLoading] = useState(!!localStorage.getItem('dt_token'));  const [tab, setTab] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [physical, setPhysical] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [allTransactionsLoaded, setAllTransactionsLoaded] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false); // <-- ADD THIS LINE  
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  
  // --- Sidebar Resizing Logic ---
  const [sidebarWidth, setSidebarWidth] = useState(280); 
  const [isResizing, setIsResizing] = useState(false);

  // --- Theme Logic ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  const logout = () => {
  signOut(auth);
  localStorage.removeItem('dt_token');
  setIsLoggedIn(false);
  setAllTransactionsLoaded(false);
  setTransactions([]);
  setAccounts([]);
  setPhysical([]);
  setInvestments([]);
};

  useEffect(() => {
    // This injects the theme directly into the HTML tag so CSS can read it
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Keep Hugging Face Space awake while the tab is open!
  useEffect(() => {
    if (!isLoggedIn) return;
    const pingInterval = setInterval(() => {
      // Pings the /test-db route every 3 minutes
      fetch(API.replace('/api', '/test-db')).catch(() => {});
    }, 3 * 60 * 1000); 
    return () => clearInterval(pingInterval);
  }, [isLoggedIn]);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 70) newWidth = 70;   // Minimum shrink
      if (newWidth > 400) newWidth = 400; // Maximum expand
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Snap to mini mode if they drag it really small
      setSidebarWidth(w => w < 120 ? 70 : w);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none'; // Prevents highlighting text while dragging
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Dynamically calculate if we are in "mini" mode based on width!
  const sidebarMinimized = sidebarWidth < 140;

  // Load all transactions (for MoneyTab) - lazy loaded when needed
  const fetchAllTransactions = useCallback(async () => {
    if (allTransactionsLoaded || !getToken()) return;
    try {
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        if (!getToken()) break; // stop mid-loop if logged out
        const res = await fetch(`${API}/transactions?limit=500&offset=${offset}`, { 
          headers: { 'Authorization': `Bearer ${getToken()}` } 
        }).then(r => r.json());
        
        if (!res.transactions || res.transactions.length === 0) break;
        
        // PROGRESSIVE UPDATE: Show data immediately as each batch arrives!
        if (getToken()) {
          setTransactions(prev => {
            // Filter out duplicates just in case React fires this twice
            const existingIds = new Set(prev.map(t => t.id));
            const newTxs = res.transactions.filter(t => !existingIds.has(t.id));
            return [...prev, ...newTxs];
          });
        }
        
        hasMore = res.hasMore;
        offset += 500;
      }
      
      if (getToken()) { 
        setAllTransactionsLoaded(true);
      }
    } catch(e) {
      console.error("Failed to load all transactions", e);
    }
  }, [allTransactionsLoaded]);

  const fetchAll = useCallback(async (showLoading = false) => {
    if (showLoading) setAppLoading(true);
    try {
      // Fire ALL 4 requests in parallel to eliminate network waterfall
      const [acc, phy, inv, txRes] = await Promise.all([
        fetch(`${API}/accounts`, { headers: { 'Authorization': `Bearer ${getToken()}` } }).then(r => r.json()),
        fetch(`${API}/physical`, { headers: { 'Authorization': `Bearer ${getToken()}` } }).then(r => r.json()),
        fetch(`${API}/investments`, { headers: { 'Authorization': `Bearer ${getToken()}` } }).then(r => r.json()),
        fetch(`${API}/transactions?limit=100&offset=0`, { headers: { 'Authorization': `Bearer ${getToken()}` } }).then(r => r.json())
      ]);
      
      // Merge stored balances into accounts (localStorage takes priority)
      setAccounts(acc);
      setTransactions(txRes.transactions);
      setAllTransactionsLoaded(false); // Mark as not fully loaded yet
      setPhysical(phy);
      setInvestments(inv);
      
      // ONLY stop loading if we successfully reached this point
      if (showLoading) setAppLoading(false); 
    } catch(e) {
      console.error("API error — retrying in 3s...", e);
      // Pass showLoading back in so the loading screen STAYS up while retrying
      setTimeout(() => fetchAll(showLoading), 3000); 
    }
    // REMOVED the finally block! This prevents the blank screen glitch.
  }, []);

  useEffect(() => { if (isLoggedIn) fetchAll(true); }, [fetchAll, isLoggedIn]);

  // Load all transactions when MoneyTab is opened
  useEffect(() => {
    if (tab === 1) {
      fetchAllTransactions();
    }
  }, [tab, fetchAllTransactions]);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const renderTab = () => {
    switch(tab) {
      case 0: return <HomeTab accounts={accounts ?? []} transactions={transactions ?? []} physical={physical ?? []} investments={investments ?? []} onSyncBalances={syncBalances} onImportCSV={importCSV} fetchAllTransactions={fetchAllTransactions} />;      
      case 1: return <MoneyTab accounts={accounts} transactions={transactions} onRefresh={fetchAll} />;
      case 2: return <AddTab accounts={accounts} onAdd={fetchAll} />;
      case 3: return <GymTab physical={physical} onOpenModal={() => setIsActivityModalOpen(true)} />;      
      case 4: return <InvestTab investments={investments} onAdd={fetchAll} />;
      default: return null;
    }
  };

  const syncBalances = useCallback(async (data) => {
  // data = { KOTAK: 12000, IDBI: 5000, FEDERAL: 0, CUB: 0, INDIAN: 0, ICICI: 0 }
  await Promise.all(
    Object.entries(data).map(([account, balance]) =>
      fetch(`${API}/accounts`, {
        method: 'PUT',
        headers: { 
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}` 
},
        body: JSON.stringify({ account, balance: parseFloat(balance) }),
      })
    )
  );
  fetchAll(); // refresh UI
}, [fetchAll]);

const importCSV = useCallback((csvText) => {
  // Proper CSV parser that handles quoted fields like "3,001.00"
  const parseCSVLine = (line) => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  };

  const lines = csvText.trim().split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());

  const col = (row, name) => {
    const i = headers.findIndex(h => h.includes(name.toLowerCase()));
    return i >= 0 ? (row[i] || '').trim() : '';
  };

  const parsed = lines.slice(1).map(line => {
    const row = parseCSVLine(line);

    // Date: DD/MM/YYYY → YYYY-MM-DD
    const rawDate = col(row, 'date');
    const dateParts = rawDate.split('/');
    const isoDate = dateParts.length === 3
      ? `${dateParts[2]}-${dateParts[1].padStart(2,'0')}-${dateParts[0].padStart(2,'0')}`
      : rawDate;

    // Amount: strip commas → float
    const amount = parseFloat(col(row, 'amount').replace(/,/g, '')) || 0;

    // Type: normalise to lowercase
    const type = col(row, 'debit').toLowerCase(); // header is "Debit/Credit"

    return {
      date: isoDate,
      month: col(row, 'month'),
      type,
      heading: col(row, 'heading'),
      description: col(row, 'description'),
      amount,
      account: col(row, 'account'),
    };
  }).filter(r => r.account && r.amount);

  if (parsed.length === 0) {
    alert('No valid rows found in CSV.');
    return;
  }

  // Single bulk request instead of one per row
  fetch(`${API}/transactions/bulk`, {
    method: 'POST',
    headers: { 
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}` 
},
    body: JSON.stringify(parsed),
  })
    .then(r => r.json())
    .then(data => {
      alert(`✅ Imported ${data.imported} transactions successfully!`);
      fetchAll();
    })
    .catch(e => alert('❌ Import failed: ' + e.message));

}, [fetchAll]);

  if (!isLoggedIn) return <LoginPage onLogin={() => setIsLoggedIn(true)} />;
  if (appLoading) return <LoadingScreen />;

    return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: `${sidebarWidth}px`, transition: isResizing ? 'none' : 'width 0.3s ease', position: 'relative' }}>
        
        {/* Invisible Drag Handle */}
        <div 
          onMouseDown={startResizing}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '6px',
            height: '100%',
            cursor: 'col-resize',
            background: isResizing ? 'var(--accent)' : 'transparent',
            zIndex: 100,
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => { if (!isResizing) e.target.style.background = 'rgba(99,102,241,0.3)'; }}
          onMouseLeave={(e) => { if (!isResizing) e.target.style.background = 'transparent'; }}
        />

        <div className="sidebar-logo" onClick={() => setTab(0)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', position: 'relative', cursor: 'pointer', overflow: 'hidden' }}>
          <div style={{ textAlign: 'center', opacity: sidebarMinimized ? 0 : 1, transition: 'opacity 0.3s ease 0.05s', pointerEvents: sidebarMinimized ? 'none' : 'auto', width: '100%', padding: '0 10px' }}>
            <span className="logo-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>DailyTrack</span>
            <span className="logo-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Personal Dashboard</span>
          </div>
          <div style={{ opacity: sidebarMinimized ? 1 : 0, transition: 'opacity 0.3s ease 0.05s', pointerEvents: sidebarMinimized ? 'auto' : 'none', position: 'absolute' }}>
            <span className="logo-name" style={{ fontSize: '1.2rem' }}>DT</span>
          </div>
        </div>
        <nav className="sidebar-nav" style={{ overflowX: 'hidden' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''} ${t.add ? 'add-item' : ''}`}
              onClick={() => t.add ? setIsAddModalOpen(true) : setTab(t.id)}
              title={sidebarMinimized ? t.label : ''}
              style={{ 
                justifyContent: sidebarMinimized ? 'center' : (t.add ? 'center' : 'flex-start'),
                gap: sidebarMinimized ? 0 : '0.75rem',
                padding: sidebarMinimized ? '0.7rem 0' : '0.7rem 0.85rem',
                overflow: 'hidden',
                width: '100%'
              }}
            >
              <span className="nav-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: sidebarMinimized ? '100%' : 'auto' }}>{t.icon}</span>
              <span className="nav-label" style={{ 
                opacity: sidebarMinimized ? 0 : 1, 
                flex: sidebarMinimized ? 'none' : 1,
                minWidth: 0,
                width: sidebarMinimized ? 0 : 'auto',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                transition: 'opacity 0.2s ease',
                display: 'block'
              }}>
                {t.label}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer" style={{ padding: sidebarMinimized ? '1rem 0' : '1rem 1.5rem', transition: 'padding 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button 
            onClick={() => setSidebarWidth(sidebarMinimized ? 280 : 70)} // <-- Increased from 250
            style={{ 
              width: '100%', 
              padding: '0', 
              border: 'none', 
              background: 'transparent', 
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              fontWeight: 700,
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: sidebarMinimized ? 0 : '0.4rem',
              fontFamily: "'Syne', sans-serif",
              marginBottom: '1rem',
              height: '32px'
            }}
            onMouseEnter={(e) => e.target.style.color = 'var(--accent)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--text)'}
            title={sidebarMinimized ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sidebarMinimized ? '➡' : '⬅'}</span>
            <span style={{ 
              opacity: sidebarMinimized ? 0 : 1, 
              maxWidth: sidebarMinimized ? 0 : '50px', 
              overflow: 'hidden', 
              whiteSpace: 'nowrap', 
              transition: 'all 0.3s ease', 
              fontSize: '0.75rem', 
              letterSpacing: '0.5px', 
              pointerEvents: sidebarMinimized ? 'none' : 'auto' 
            }}>
              HIDE
            </span>
          </button>
          
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            width: '100%',
            overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}>
            <div className="sidebar-date" style={{ fontSize: sidebarMinimized ? '0.7rem' : '0.75rem', transition: 'all 0.3s ease', color: 'var(--text3)', fontWeight: 500 }}>
              {sidebarMinimized 
                ? today.toLocaleDateString('en-IN', { day:'numeric', month:'numeric', year:'2-digit' }) 
                : today.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
              }
            </div>
            <div style={{
               opacity: sidebarMinimized ? 0 : 1, 
               maxHeight: sidebarMinimized ? 0 : '20px', 
               marginTop: sidebarMinimized ? 0 : '2px', 
               fontSize: '0.75rem', 
               color: 'var(--text2)', 
               transition: 'all 0.3s ease',
               overflow: 'hidden'
            }}>
               {today.toLocaleDateString('en-IN', {weekday:'long'})}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">{TAB_TITLES[tab]}</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{ 
              background: 'var(--card)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px', 
              padding: '0.45rem 0.85rem', 
              color: 'var(--text)', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              fontSize: '0.85rem', 
              fontWeight: 600,
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
  
        <button onClick={logout} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.8rem', color: 'var(--text)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
          🚪 Logout
        </button>
      </div>
      </header>        
      <main className="page-body" key={tab}>
          {renderTab()}
        </main>
      </div>

      {/* Floating Add Transaction Modal */}
      {isAddModalOpen && (
        <AddTransactionModal 
          accounts={accounts} 
          transactions={transactions} // <-- Make sure this is passed in!
          onAdd={fetchAll} 
          onClose={() => setIsAddModalOpen(false)} 
        />
      )}

      {/* Floating Add Activity Modal */}
      {isActivityModalOpen && (
        <AddActivityModal 
          onAdd={fetchAll} 
          onClose={() => setIsActivityModalOpen(false)} 
        />
      )}

      {/* 📱 Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`mobile-nav-item ${tab === t.id ? 'active' : ''} ${t.add ? 'add-item' : ''}`}
            onClick={() => t.add ? setIsAddModalOpen(true) : setTab(t.id)}
          >
            <span className="mobile-nav-icon">{t.icon}</span>
            {/* Split the label so things like "Gym & Activity" don't break the UI */}
            <span className="mobile-nav-label">{t.label.split(' ')[0]}</span> 
          </button>
        ))}
      </nav>
      </div>

      
  );
}

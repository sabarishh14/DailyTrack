import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
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
  "CC-AXIS REWARDS": { emoji: "💳", color: "#ec4899" },
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
  "Aasai",
  "Card Fees",
  "Charges",
  "Cinema",
  "Clothing",
  "CBE Trip",
  "Daily Need",
  "Donation",
  "Education",
  "Electricity",
  "Entertainment",
  "FD",
  "Flowers",
  "Food",
  "Fruits",
  "God",
  "Grocery",
  "Haircut",
  "Income",
  "Interest",
  "Internet",
  "Investment",
  "Kudremukh Trip",
  "Laundry",
  "Loan",
  "Locker",
  "Medical",
  "Msc",
  "Parking",
  "Petrol",
  "Popcorn",
  "Savings",
  "Snacks",
  "Spotify",
  "Sports",
  "Tally",
  "Test",
  "Tips",
  "Transport",
  "Veggies",
  "YT Premium"
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
function HomeTab({ accounts, transactions, physical, investments, onSyncBalances, fetchAllTransactions, onRefresh }) {
  if (!physical || !transactions || !accounts) return null;
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
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
    if (t.type === 'Credit') income[t.account] = (income[t.account] || 0) + parseFloat(t.amount);
    if (t.type === 'Debit') expense[t.account] = (expense[t.account] || 0) + parseFloat(t.amount);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
           <h2 className="section-title" style={{ margin: 0 }}>🏦 Account Balances</h2>
           <button className="action-btn secondary" onClick={() => setIsReconcileOpen(true)} style={{ padding: '0.45rem 1rem' }}>
             ⚖️ Reconcile
           </button>
        </div>
        <div className="accounts-grid">
          {accounts
            .filter(a => a.balance_tracked && a.account !== 'CC-PINNACLE 6360')
            .sort((a, b) => {
              // Sort them strictly by the order defined in the BANKS object
              const orderA = Object.keys(BANKS).indexOf(a.account);
              const orderB = Object.keys(BANKS).indexOf(b.account);
              
              // If an account isn't in the BANKS list, push it to the very end
              const indexA = orderA === -1 ? 999 : orderA;
              const indexB = orderB === -1 ? 999 : orderB;
              
              return indexA - indexB;
            })
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
      {isReconcileOpen && (
        <ReconciliationModal 
          accounts={accounts} 
          onClose={() => setIsReconcileOpen(false)} 
          onRefresh={onRefresh} 
        />
      )}
    </div> // This is the closing div of HomeTab
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
  const currentMonthLabel = `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`;
  
  const [expanded, setExpanded] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null); // Tracks last click for Shift-Select
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const dropdownRef = useRef(null);
  // Analyzer filters - 3-State Multi-select
  const [chartAccounts, setChartAccounts] = useState({ included: new Set(), excluded: new Set() });
  const [chartTypes, setChartTypes] = useState({ included: new Set(['Debit']), excluded: new Set() }); // Defaults to Debit
  const [chartMonths, setChartMonths] = useState({ included: new Set([currentMonthLabel]), excluded: new Set() });
  const [chartYears, setChartYears] = useState({ included: new Set(), excluded: new Set() });
  const [chartHeadings, setChartHeadings] = useState({ included: new Set(), excluded: new Set() });

  // Table filters - 3-State Multi-select
  const [filterYears, setFilterYears] = useState({ included: new Set(), excluded: new Set() });
  const [filterAccounts, setFilterAccounts] = useState({ included: new Set(), excluded: new Set() });
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDateFromDebounced, setFilterDateFromDebounced] = useState("");
  const [filterDateToDebounced, setFilterDateToDebounced] = useState("");
  const [filterMonths, setFilterMonths] = useState({ included: new Set([currentMonthLabel]), excluded: new Set() });
  const [filterTypes, setFilterTypes] = useState({ included: new Set(), excluded: new Set() });
  const [filterHeadings, setFilterHeadings] = useState({ included: new Set(), excluded: new Set() });
  const [filterDesc, setFilterDesc] = useState("");
  const [filterDescDebounced, setFilterDescDebounced] = useState("");
  const [filterVisibility, setFilterVisibility] = useState({ included: new Set(), excluded: new Set() }); // NEW STATE

  // Dropdown visibility
  const [openDropdown, setOpenDropdown] = useState(null);
  
  // Table sorting
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [actionMenuTx, setActionMenuTx] = useState(null); // <-- ADD THIS NEW STATE
  
  /// Change actions: 90 to actions: 130
  const [colWidths, setColWidths] = useState({ checkbox: 50, date: 90, account: 230, type: 110, month: 110, amount: 130, heading: 140, desc: 0, actions: 100 });

  // Reset to page 0 when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterYears, filterTypes, filterHeadings, filterDescDebounced]);

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
    setFilterMonths(prev => ({ ...prev, included: months }));
  }, [filterDateFromDebounced, filterDateToDebounced]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterDescDebounced(filterDesc), 300);
    return () => clearTimeout(timer);
  }, [filterDesc]);

  // Memoize expensive computations
  const { allMonths, allYears, allHeadings, allAccountsList, allTypes } = useMemo(() => { // <-- Destructure allYears
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
      // --- ADD THIS BLOCK FOR YEARS ---
      allYears: [...new Set(transactions.map(t => {
        if (!t.date) return null;
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return null;
        return d.getFullYear().toString();
      }))]
      .filter(Boolean)
      .sort().reverse(),
      // --------------------------------
      allHeadings: [...new Set(transactions.map(t => t.heading))].sort(),
      allAccountsList: [...new Set(transactions.map(t => t.account))].sort(),
      allTypes: [...new Set(transactions.map(t => t.type))].sort().map(t => t.charAt(0).toUpperCase() + t.slice(1))
    };
  }, [transactions]);

  // Multi-select toggle functions
  // Helper to check match based on 3-State filtering
  const checkMatch = (filterState, value) => {
    const { included, excluded } = filterState;
    if (excluded.has(value)) return false; // Exclusion always wins
    if (included.size > 0 && !included.has(value)) return false; // If there are inclusions, MUST be included
    return true;
  };

 // Memoize analyzer filtered results (with Drill-Down logic)
  const { analyzerFiltered, pieArr, isShowingDescriptions } = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (t.exclude_analytics) return false; // Hides it from charts and stats
      if (!t.date) return false;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      const month = d.toLocaleString('default', { month: 'long' });
      const year = d.getFullYear();
      const ml = `${month} ${year}`;
      const capitalizedType = t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : '';
      const accountMatch = checkMatch(chartAccounts, t.account);
      const typeMatch = checkMatch(chartTypes, capitalizedType);
      const monthMatch = checkMatch(chartMonths, ml);
      const yearStr = d.getFullYear().toString();
      const yearMatch = checkMatch(chartYears, yearStr);
      const headingMatch = checkMatch(chartHeadings, t.heading);
      return accountMatch && typeMatch && monthMatch && yearMatch && headingMatch;
    });

    // If exactly one heading is included, drill down into descriptions!
    const isShowingDescriptions = chartHeadings.included.size === 1;
    const pieData = {};
    
    filtered.forEach(t => { 
      let key = t.heading;
      if (isShowingDescriptions) {
        key = (t.description && t.description.trim() !== '') ? t.description.trim() : "No Description";
      }
      pieData[key] = (pieData[key] || 0) + Math.abs(parseFloat(t.amount)); 
    });
    
    const pieArray = Object.entries(pieData).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    
    return { analyzerFiltered: filtered, pieArr: pieArray, isShowingDescriptions };
  }, [transactions, chartAccounts, chartTypes, chartMonths, chartYears, chartHeadings]); // <-- UPDATE DEPENDENCIES

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
      const accountMatch = checkMatch(filterAccounts, t.account);
      const dateMatch = (() => {
        if (!filterDateFromDebounced) return true;
        const txDate = new Date(dateStr);
        const from = new Date(filterDateFromDebounced);
        const to = filterDateToDebounced ? new Date(filterDateToDebounced) : from;
        return txDate >= from && txDate <= to;
      })();
      const monthMatch = checkMatch(filterMonths, ml);
      
      const yearStr = d.getFullYear().toString();
      const yearMatch = checkMatch(filterYears, yearStr);
      
      const typeMatch = checkMatch(filterTypes, capitalizedType);
      const headingMatch = checkMatch(filterHeadings, t.heading);
      const descMatch = !filterDescDebounced || (t.description || '').toLowerCase().includes(filterDescDebounced.toLowerCase());
      
      const visibilityMatch = (() => {
        if (filterVisibility.included.size === 0 && filterVisibility.excluded.size === 0) return true;
        const statusLabel = t.exclude_analytics ? "Excluded" : "Active";
        return checkMatch(filterVisibility, statusLabel);
      })();

      return accountMatch && dateMatch && monthMatch && yearMatch && typeMatch && headingMatch && descMatch && visibilityMatch;
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
  }, [transactions, filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterYears, filterTypes, filterHeadings, filterDescDebounced, filterVisibility, sortBy, sortDir]); // <-- UPDATE DEPENDENCIES

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

  // Multi-select dropdown component (3-State Logic)
  const MultiSelectDropdown = ({ label, icon, options, filterState, setFilterState, dropdownKey }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const { included, excluded } = filterState;
    
    // Clear search when dropdown closes
    useEffect(() => {
      if (openDropdown !== dropdownKey) setSearchTerm("");
    }, [openDropdown, dropdownKey]);

    const filteredOptions = options.filter(opt => String(opt).toLowerCase().includes(searchTerm.toLowerCase()));
    const allSelected = included.size === options.length && options.length > 0;
    
    // 3-State Toggle: Neutral -> Included -> Excluded -> Neutral
    const handleItemClick = (opt) => {
      const newInc = new Set(included);
      const newExc = new Set(excluded);

      if (newInc.has(opt)) {
        newInc.delete(opt);
        newExc.add(opt);
      } else if (newExc.has(opt)) {
        newExc.delete(opt);
      } else {
        newInc.add(opt);
      }
      setFilterState({ included: newInc, excluded: newExc });
    };

    const toggleSelectAll = () => {
      if (allSelected) {
        setFilterState({ included: new Set(), excluded: new Set() });
      } else {
        setFilterState({ included: new Set(options), excluded: new Set() });
      }
    };
    
    const hasSelection = included.size > 0 || excluded.size > 0;
    const isExcludeOnly = included.size === 0 && excluded.size > 0;

    return (
      <div style={{ position: 'relative' }}>
        <button
          className={`filter-chip ${hasSelection ? (isExcludeOnly ? 'exclude-active' : 'active') : ''} ${openDropdown === dropdownKey ? 'open' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
        >
          <span>{icon}</span>
          <span style={{ textDecoration: isExcludeOnly ? 'line-through' : 'none', opacity: isExcludeOnly ? 0.8 : 1 }}>{label}</span>
          
          {/* Dual Status Counters */}
          {included.size > 0 && <span className="chip-count inc">{included.size}</span>}
          {excluded.size > 0 && <span className="chip-count exc">{excluded.size}</span>}

          {hasSelection && (
            <span 
              className="chip-clear" 
              onClick={(e) => { e.stopPropagation(); setFilterState({ included: new Set(), excluded: new Set() }); }}
              title="Clear filter"
            >
              ×
            </span>
          )}
          <span className="chip-arrow">▼</span>
        </button>

        {openDropdown === dropdownKey && (
          <div className="chip-dropdown">
            
            <div className="chip-helper-text">
              Tap once to include • Tap again to exclude
            </div>

            {options.length > 5 && (
              <div className="chip-search-container">
                <input 
                  type="text" 
                  placeholder={`Search ${label}...`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="chip-search-input"
                  onClick={e => e.stopPropagation()}
                />
              </div>
            )}
            {options.length > 0 && (
              <>
                <div
                  className="chip-dropdown-item chip-select-all"
                  onClick={toggleSelectAll}
                  style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px' }}
                >
                  <div className={`chip-checkbox ${allSelected ? 'included' : ''}`} />
                  <span>{allSelected ? 'Clear All' : 'Select All'}</span>
                </div>
              </>
            )}
            {filteredOptions.map(opt => (
              <div
                key={opt}
                className={`chip-dropdown-item ${included.has(opt) ? 'included' : ''} ${excluded.has(opt) ? 'excluded' : ''}`}
                onClick={() => handleItemClick(opt)}
              >
                <div className={`chip-checkbox ${included.has(opt) ? 'included' : ''} ${excluded.has(opt) ? 'excluded' : ''}`} />
                <span>{opt}</span>
              </div>
            ))}
            {filteredOptions.length === 0 && options.length > 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.8rem' }}>No results found</div>
            )}
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

  const handleRowSelect = (e, id, index) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);

    if (e.shiftKey && lastSelectedIdx !== null) {
      // Shift-Click Bulk Select
      const start = Math.min(lastSelectedIdx, index);
      const end = Math.max(lastSelectedIdx, index);
      for (let j = start; j <= end; j++) {
        newSet.add(paginatedRows[j].id);
      }
    } else {
      // Normal Click Toggle
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
    }

    setSelectedIds(newSet);
    setLastSelectedIdx(index); // Remember this click
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transactions?`)) return;
    try {
      // Send ONE single array of IDs to the backend
      const res = await fetch(`${API}/transactions/bulk-delete`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(Array.from(selectedIds))
      });
      
      if (res.ok) {
        setSelectedIds(new Set());
        onRefresh(); // Refresh balances and list
      } else {
        alert("Failed to delete transactions.");
      }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsCategoryModalOpen(true); }}
              className="action-btn secondary" 
              style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem', background: 'var(--bg3)', border: '1px solid var(--border)' }}
              title="Manage Categories"
            >
              ⚙️ Manage 
            </button>
            <span className={`analyser-chevron ${expanded ? 'open' : ''}`}>▼</span>
          </div>
        </div>

        {expanded && (
          <div style={{ animation: 'fadeIn 0.3s ease', padding: '1.5rem' }}>
            {/* Analyzer Filters */}
            <div className="filter-bar" style={{ marginBottom: '1.5rem' }} ref={dropdownRef}>
                <MultiSelectDropdown
                label="Visibility"
                icon="👁️"
                options={["Active", "Excluded"]}
                filterState={filterVisibility}
                setFilterState={setFilterVisibility}
                dropdownKey="tableVisibility"
              />
              <MultiSelectDropdown
                label="Account"
                icon="🏦"
                options={allAccountsList}
                filterState={chartAccounts}
                setFilterState={setChartAccounts}
                dropdownKey="analyzerAccount"
              />
              <MultiSelectDropdown
                label="Type"
                icon="💳"
                options={allTypes}
                filterState={chartTypes}
                setFilterState={setChartTypes}
                dropdownKey="analyzerType"
              />
              <MultiSelectDropdown
                label="Month"
                icon="📅"
                options={allMonths}
                filterState={chartMonths}
                setFilterState={setChartMonths}
                dropdownKey="analyzerMonth"
              />
              <MultiSelectDropdown
                label="Year"
                icon="📆"
                options={allYears}
                filterState={chartYears}
                setFilterState={setChartYears}
                dropdownKey="analyzerYear"
              />
              <MultiSelectDropdown
                label="Heading"
                icon="🏷️"
                options={allHeadings}
                filterState={chartHeadings}
                setFilterState={setChartHeadings}
                dropdownKey="analyzerHeading"
              />
              {(chartAccounts.included.size > 0 || chartAccounts.excluded.size > 0 || 
                chartTypes.included.size > 0 || chartTypes.excluded.size > 0 || 
                chartMonths.included.size > 0 || chartMonths.excluded.size > 0 || 
                chartYears.included.size > 0 || chartYears.excluded.size > 0 || 
                chartHeadings.included.size > 0 || chartHeadings.excluded.size > 0) && (
                <button 
                  className="filter-chip" 
                  onClick={() => {
                    const empty = { included: new Set(), excluded: new Set() };
                    setChartAccounts(empty); setChartTypes(empty); setChartMonths(empty);
                    setChartYears(empty); setChartHeadings(empty);
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
                      
                      // Highlight based on whether we are looking at Headings or Descriptions
                      const isSelected = isShowingDescriptions 
                        ? filterDesc === d.name 
                        : filterHeadings.included.has(d.name);
                      
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
                            if (isShowingDescriptions) {
                              // Toggles the description filter for the table below
                              if (filterDesc === d.name) {
                                setFilterDesc("");
                              } else {
                                setFilterDesc(d.name === "No Description" ? "" : d.name);
                                setFilterHeadings({ ...chartHeadings });
                              }
                            } else {
                              // Drills down the chart AND filters the table below!
                              setChartHeadings({ included: new Set([d.name]), excluded: new Set() });
                              setFilterHeadings({ included: new Set([d.name]), excluded: new Set() });
                              setFilterDesc("");
                            }
                            
                            // Sync base table filters with the chart
                            setFilterAccounts({ ...chartAccounts });
                            setFilterTypes({ ...chartTypes });
                            setFilterMonths({ ...chartMonths });
                            setFilterYears({ ...chartYears });
                            document.querySelector('.tx-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                      {analyzerFiltered.filter(t => t.type === 'Credit').length}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                      {fmt(analyzerFiltered.filter(t => t.type === 'Credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}
                    </div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.5rem' }}>Expense Txns</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--neg)' }}>
                      {analyzerFiltered.filter(t => t.type === 'Debit').length}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                      {fmt(analyzerFiltered.filter(t => t.type === 'Debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}
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
            label="Visibility"
            icon="👁️"
            options={["Active", "Excluded"]}
            filterState={filterVisibility}
            setFilterState={setFilterVisibility}
            dropdownKey="tableVisibility"
          />
          <MultiSelectDropdown
            label="Account"
            icon="🏦"
            options={allAccountsList}
            filterState={filterAccounts}
            setFilterState={setFilterAccounts}
            dropdownKey="tableAccount"
          />
          <MultiSelectDropdown
            label="Type"
            icon="💳"
            options={allTypes}
            filterState={filterTypes}
            setFilterState={setFilterTypes}
            dropdownKey="tableType"
          />
         <MultiSelectDropdown
            label="Month"
            icon="📅"
            options={allMonths}
            filterState={filterMonths}
            setFilterState={setFilterMonths}
            dropdownKey="tableMonth"
          />
          <MultiSelectDropdown
            label="Year"
            icon="📆"
            options={allYears}
            filterState={filterYears}
            setFilterState={setFilterYears}
            dropdownKey="tableYear"
          />
          <MultiSelectDropdown
            label="Heading"
            icon="🏷️"
            options={allHeadings}
            filterState={filterHeadings}
            setFilterState={setFilterHeadings}
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
          {(filterAccounts.included.size > 0 || filterAccounts.excluded.size > 0 || 
            filterTypes.included.size > 0 || filterTypes.excluded.size > 0 || 
            filterMonths.included.size > 0 || filterMonths.excluded.size > 0 || 
            filterYears.included.size > 0 || filterYears.excluded.size > 0 || 
            filterHeadings.included.size > 0 || filterHeadings.excluded.size > 0 || 
            filterVisibility.included.size > 0 || filterVisibility.excluded.size > 0 ||
            filterDateFrom || filterDateTo || filterDesc) && (
            <button 
              className="filter-chip" 
              onClick={() => {
                const empty = { included: new Set(), excluded: new Set() };
                setFilterAccounts(empty); setFilterTypes(empty); setFilterMonths(empty);
                setFilterYears(empty); setFilterHeadings(empty); setFilterVisibility(empty);
                setFilterDateFrom(""); setFilterDateTo(""); setFilterDesc("");
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
                <span className="pos" style={{ fontWeight: 600 }}>{fmt(tableFiltered.filter(t => t.type === 'Credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}</span>
                {' '}in &nbsp;·&nbsp; 
                <span className="neg" style={{ fontWeight: 600 }}>{fmt(tableFiltered.filter(t => t.type === 'Debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}</span>
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
              <div className={`chip-checkbox ${selectedIds.size > 0 && selectedIds.size === paginatedRows.length ? 'included' : ''}`} />
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
                <div 
                  key={i} 
                  className="tx-row" 
                  style={{ gridTemplateColumns: `${colWidths.checkbox}px ${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px minmax(250px, 1fr) ${colWidths.actions}px`, cursor: 'pointer' }}
                  onClick={() => setActionMenuTx(t)} // <-- Opens the details modal
                >
                  <span style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }} onClick={(e) => handleRowSelect(e, t.id, i)}>
                    <div className={`chip-checkbox ${selectedIds.has(t.id) ? 'included' : ''}`} />
                  </span>
                  <span className="tx-date">{formatDate(t.date)}</span>
                  <span className="tx-account">
                    <span>{getBankEmoji(t.account)}</span>
                    <span>{t.account}</span>
                  </span>
                  <span className="tx-type-cell"><span className={`tx-badge ${t.type}`}>{t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span></span>
                  <span className="tx-month">{monthLabel}</span>
                  <span className={`tx-amount ${t.type === 'Debit' ? 'neg' : t.type === 'Credit' ? 'pos' : t.type === 'investment' ? 'blue-text' : 'accent'}`}>
                    {t.type === 'Debit' ? '−' : '+'}{fmt(t.amount)}
                  </span>
                  <span className="tx-heading">{t.heading}</span>
                  <span className="tx-desc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description || '—'}
                    </span>
                    {t.exclude_analytics && (
                      <span title="Excluded from Analytics" style={{ marginLeft: '8px', fontSize: '0.9rem', cursor: 'help', flexShrink: 0 }}>
                        🙈
                      </span>
                    )}
                  </span>
                  <span className="tx-actions">
                    {/* Add e.stopPropagation() to the action buttons */}
                    <button className="action-icon-btn edit" onClick={(e) => { e.stopPropagation(); setEditingTx(t); }} title="Edit">✏️</button>
                    <button className="action-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} title="Delete">🗑️</button>
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

      {/* CATEGORY MANAGER MODAL */}
      {isCategoryModalOpen && (
        <CategoryExclusionModal 
          transactions={transactions}
          allHeadings={allHeadings}
          onClose={() => setIsCategoryModalOpen(false)}
          onRefresh={onRefresh}
        />
      )}

      {/* TRANSACTION DETAILS / ACTION MENU MODAL */}
      {actionMenuTx && (
        <div className="modal-backdrop" onClick={() => setActionMenuTx(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: 0, maxWidth: '400px' }}>
            
            {/* Header / Info Row */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text)' }}>{actionMenuTx.heading}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text3)' }}>{formatDate(actionMenuTx.date)} • {actionMenuTx.account}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={actionMenuTx.type === 'Debit' ? 'neg' : actionMenuTx.type === 'Credit' ? 'pos' : 'accent'} style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                    {actionMenuTx.type === 'Debit' ? '-' : '+'}{fmt(actionMenuTx.amount)}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text2)', marginTop: '2px' }}>{actionMenuTx.type}</span>
                </div>
              </div>
            </div>
            
            {/* Full Note / Description Box */}
            {actionMenuTx.description && (
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  📝 {actionMenuTx.description}
                </p>
              </div>
            )}

            {/* Quick Exclude Toggle */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 600 }}>Spending Analyser</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '2px' }}>Include this transaction in pie chart & stats</div>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const updatedTx = { ...actionMenuTx, exclude_analytics: !actionMenuTx.exclude_analytics };
                  setActionMenuTx(updatedTx); // Optimistic UI update for instant feedback
                  try {
                    const res = await fetch(`${API}/transactions/${actionMenuTx.id}`, {
                      method: "PUT",
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                      body: JSON.stringify({ ...updatedTx, amount: parseFloat(updatedTx.amount) }),
                    });
                    if (res.ok) onRefresh();
                  } catch (err) {
                    alert("Error updating transaction: " + err.message);
                    setActionMenuTx(actionMenuTx); // Revert on network failure
                  }
                }}
                style={{
                  width: '46px', height: '26px', borderRadius: '13px',
                  background: actionMenuTx.exclude_analytics ? 'var(--border2)' : 'var(--pos)',
                  position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '3px',
                  left: actionMenuTx.exclude_analytics ? '3px' : '23px',
                  transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                }} />
              </button>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem' }}>
              <button 
                onClick={() => { setEditingTx(actionMenuTx); setActionMenuTx(null); }}
                style={{ background: 'transparent', border: 'none', padding: '1rem', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                ✏️ Edit Transaction
              </button>
              <button 
                onClick={() => { handleDelete(actionMenuTx.id); setActionMenuTx(null); }}
                style={{ background: 'transparent', border: 'none', padding: '1rem', color: 'var(--neg)', fontSize: '0.95rem', fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                🗑️ Delete Transaction
              </button>
            </div>
          </div>
        </div>
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
    <div style={{ position: 'relative', width: '100%', height: '40px' }}>
      <input 
        type="text" className="bulk-inp" placeholder={placeholder} 
        value={value} onChange={handleType} onKeyDown={handleKeyDown}
        onFocus={() => { 
          const lowerVal = value.toLowerCase();
          const startsWith = options.filter(o => o.toLowerCase().startsWith(lowerVal));
          const contains = options.filter(o => o.toLowerCase().includes(lowerVal) && !o.toLowerCase().startsWith(lowerVal));
          setFiltered([...startsWith, ...contains]); 
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

function AddTab({ accounts, transactions, onAdd }) {
  const today = new Date().toISOString().split('T')[0];
 
  const recentDescriptions = [...new Set(
    (transactions || [])
      .map(t => t.description)
      .filter(desc => desc && desc.trim() !== '')
  )];

  const createEmptyRow = () => ({
    id: Date.now() + Math.random(),
    account: 'KOTAK', 
    date: today, 
    type: 'Debit', 
    heading: '', 
    description: '', 
    amount: ''
  });

  // MAGICAL AUTO-SAVE: Loads data from local storage so nothing is ever lost!
  const [rows, setRows] = useState(() => {
    const saved = localStorage.getItem('dt_draft_txs');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return [createEmptyRow()];
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // MAGICAL AUTO-SAVE: Saves to local storage every time you type a letter
  useEffect(() => {
    localStorage.setItem('dt_draft_txs', JSON.stringify(rows));
  }, [rows]);

  const updateRow = (id, field, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows([...rows, {
      ...lastRow,
      id: Date.now() + Math.random(),
      amount: '',
      description: ''
    }]);
  };  
  
  const removeRow = (id) => {
    if (rows.length === 1) {
      setRows([createEmptyRow()]); 
      return;
    }
    setRows(rows.filter(r => r.id !== id));
  };

  const submit = async () => {
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].amount || isNaN(rows[i].amount) || !rows[i].heading.trim()) {
        return alert(`Row ${i + 1} is missing a valid amount or category.`);
      }
    }

    setLoading(true);
    try {
              const payload = rows.map(r => {
                const catName = r.heading.trim();
                const catTxs = transactions.filter(t => t.heading === catName);
                
                // ✨ MAGIC RULE: if all previous transactions in this category are excluded, automatically exclude this new one!
                const isAutoExclude = catTxs.length > 0 && catTxs.every(t => t.exclude_analytics);
                
                return {
                  account: r.account,
                  date: r.date,
                  type: r.type,
                  heading: catName,
                  description: r.description.trim() || "",
                  amount: parseFloat(r.amount),
                  exclude_analytics: isAutoExclude
                };
              });

              const res = await fetch(`${API}/transactions`, {
        method: "POST", headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(payload),
      });

      if (res.ok) {
        onAdd(); 
        setSuccess(true);
        // Wipe local storage draft only on successful save
        localStorage.removeItem('dt_draft_txs');
        setTimeout(() => { 
            setSuccess(false); 
            setRows([createEmptyRow()]); 
        }, 1500);
      } else {
        const errText = await res.text();
        alert(`Failed to save. Server returned: ${res.status}\n${errText.substring(0, 100)}`);
      }
    } catch (e) {
      // The custom alert tells the user their data is completely safe
      alert("Network error: " + e.message + "\n\nDon't worry, your typed data is safely auto-saved! Just wait a few seconds for the server to wake up and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section" style={{ animation: 'fadeUp 0.2s ease', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="section-title" style={{ margin: 0, border: 'none' }}>➕ Log Transactions</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '4px' }}>
            Your progress is auto-saved locally. Take your time!
          </div>
        </div>
        
        <button className="action-btn secondary" onClick={() => {
          if(window.confirm("Are you sure you want to clear all drafts?")) {
            setRows([createEmptyRow()]);
            localStorage.removeItem('dt_draft_txs');
          }
        }}>
          🗑️ Clear Drafts
        </button>
      </div>

      <div className="add-table-wrap" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', overflowX: 'auto' }}>
        <div className="add-table-inner">
          
          <div className="bulk-grid bulk-header">
            <span>Account</span>
            <span>Date</span>
            <span>Type</span>
            <span>Category</span>
            <span>Amount (₹)</span>
            <span>Note</span>
            <span style={{textAlign: 'center'}}>#</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="bulk-grid bulk-row" style={{ animation: 'fadeIn 0.2s ease', marginBottom: '0.5rem' }}>
             <select className="bulk-sel" value={row.account} onChange={e => updateRow(row.id, 'account', e.target.value)}>
                {Object.keys(BANKS).map(b => <option key={b} value={b}>{BANKS[b]?.emoji} {b}</option>)}
              </select>

              <input type="date" className="bulk-inp" value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />

              <select className="bulk-sel" value={row.type} onChange={e => updateRow(row.id, 'type', e.target.value)}>
                <option value="Debit">🔴 Debit</option>
                <option value="Credit">🟢 Credit</option>
                <option value="Savings">💰 Savings</option>
                <option value="Investment">💸 Investment</option>
              </select>

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
                title="Remove Row"
              >
                ×
              </button>
            </div>
          ))}

          <datalist id="category-options">
            {CATEGORIES.map(cat => <option key={cat} value={cat} />)}
          </datalist>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button className="action-btn secondary" onClick={addRow} style={{ flex: 1, justifyContent: 'center', padding: '0.85rem' }}>
              ➕ Add Row
            </button>
            
            <button className={`action-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading} style={{ flex: 2, justifyContent: 'center', padding: '0.85rem' }}>
              {loading ? "⏳ Saving to Database..." : success ? "✅ Saved Successfully!" : `💾 Save to Database (${rows.length})`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function EditTransactionModal({ tx, onClose, onRefresh }) {

  const [form, setForm] = useState({
    date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
    account: tx.account,
    type: tx.type,
    heading: tx.heading,
    amount: tx.amount,
    description: tx.description || '',
    exclude_analytics: tx.exclude_analytics || false
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
                <option value="Debit">🔴 Debit</option>
                <option value="Credit">🟢 Credit</option>
                <option value="Savings">💰 Savings</option>
                <option value="Investment">💸 Investment</option>
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

          <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.85rem', marginTop: '0.5rem', background: 'var(--bg3)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div 
              onClick={() => updateField('exclude_analytics', !form.exclude_analytics)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                background: form.exclude_analytics ? 'var(--neg)' : 'var(--border2)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0
              }}
            >
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                position: 'absolute', top: '3px', left: form.exclude_analytics ? '23px' : '3px',
                transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>Exclude from Analyser</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Hide this transaction from the pie chart and stats</div>
            </div>
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

function AddManualAssetModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ category: 'FD', name: '', invested_value: '', current_value: '' });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/manual_assets`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(form)
      });
      if (res.ok) { onAdd(); onClose(); }
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">➕ Add Asset</div></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <select className="sel" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
            {['FD', 'EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="inp" placeholder="Asset Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <input className="inp" type="number" placeholder="Invested Amount" value={form.invested_value} onChange={e => setForm({...form, invested_value: e.target.value})} />
          <input className="inp" type="number" placeholder="Current Value" value={form.current_value} onChange={e => setForm({...form, current_value: e.target.value})} />
          <button className="submit-btn" onClick={submit}>{loading ? 'Saving...' : 'Save Asset'}</button>
        </div>
      </div>
    </div>
  );
}

function ReconciliationModal({ accounts, onClose, onRefresh }) {
  const [scanning, setScanning] = useState(false);

  const scanBalances = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/sync/ocr-balances`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      alert(data.message);
      if (data.success) onRefresh();
    } catch (e) {
      alert("Error: " + e.message + "\n(This might take a moment, check back later)");
    } finally {
      setScanning(false);
    }
  };

  return (
     <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '95%' }}>
            <div className="modal-header">
               <div className="modal-title">⚖️ Reconcile Balances</div>
               <button className="modal-close" onClick={onClose}>×</button>
            </div>
            
            <div className="modal-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                   <div style={{ fontSize: '0.85rem', color: 'var(--text2)', maxWidth: '400px', lineHeight: 1.5 }}>
                      Upload UPI screenshots to your specific Drive folder, then click Scan to detect discrepancies.
                   </div>
                   <button className="action-btn" onClick={scanBalances} disabled={scanning} style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' }}>
                      {scanning ? '⏳ Scanning Drive...' : '📸 Scan Screenshots'}
                   </button>
                </div>

                <div className="data-table">
                   <div className="table-header" style={{ gridTemplateColumns: '1.5fr 1.2fr 1.2fr 1.5fr' }}>
                      <span>Account</span>
                      <span>App Tracked</span>
                      <span>Bank Real</span>
                      <span>Action Required</span>
                   </div>
                   {accounts.filter(a => a.balance_tracked && a.account !== 'CC-PINNACLE 6360').map((acc, i) => {
                      const tracked = acc.balance || 0;
                      const real = acc.real_balance;
                      const diff = real !== null && real !== undefined ? tracked - real : null;

                      let status = "";
                      let actionClass = "";

                      if (diff === null) {
                         status = "Not Scanned";
                         actionClass = "text3";
                      } else if (diff === 0) {
                         status = "✅ NO CHANGE";
                         actionClass = "pos";
                      } else if (diff < 0) {
                         // C4 - D4 < 0: Move money OUT of real account
                         status = `🔴 REDUCE ₹${Math.abs(diff)}`;
                         actionClass = "neg";
                      } else {
                         // C4 - D4 > 0: Move money INTO real account
                         status = `🟢 INCREASE ₹${Math.abs(diff)}`;
                         actionClass = "pos";
                      }

                      return (
                         <div key={acc.account} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '1.5fr 1.2fr 1.2fr 1.5fr' }}>
                            <span style={{ fontWeight: 600 }}>{BANKS[acc.account]?.emoji} {acc.account}</span>
                            <span style={{ fontFamily: 'Syne, sans-serif' }}>{fmt(tracked)}</span>
                            <span style={{ fontFamily: 'Syne, sans-serif', color: real !== null ? 'var(--accent2)' : 'var(--text3)' }}>
                               {real !== null ? fmt(real) : "—"}
                            </span>
                            <span className={actionClass} style={{ fontWeight: 800, fontSize: '0.85rem' }}>{status}</span>
                         </div>
                      );
                   })}
                </div>
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
      date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
      exclude_analytics: tx.exclude_analytics || false
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
      const payload = rows.map(r => ({ ...r, amount: parseFloat(r.amount), exclude_analytics: r.exclude_analytics }))
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
            <span>Account</span><span>Date</span><span>Type</span><span>Category</span><span>Amount (₹)</span><span>Note</span><span style={{textAlign: 'center'}} title="Exclude from Analyser">🙈</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="bulk-grid bulk-row" style={{ animation: 'fadeIn 0.2s ease' }}>
             <select className="bulk-sel" value={row.account} onChange={e => updateRow(row.id, 'account', e.target.value)}>
                {Object.keys(BANKS).map(b => <option key={b} value={b}>{BANKS[b]?.emoji} {b}</option>)}
              </select>
              <input type="date" className="bulk-inp" value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />
              <select className="bulk-sel" value={row.type} onChange={e => updateRow(row.id, 'type', e.target.value)}>
                <option value="Debit">🔴 Debit</option>
                <option value="Credit">🟢 Credit</option>
                <option value="Savings">💰 Savings</option>
                <option value="Investment">💸 Investment</option>
              </select>
              <AutocompleteInput value={row.heading} onChange={val => updateRow(row.id, 'heading', val)} options={CATEGORIES} placeholder="Category" />
              <input type="number" className="bulk-inp" placeholder="0.00" value={row.amount} onChange={e => updateRow(row.id, 'amount', e.target.value)} />
              <input type="text" className="bulk-inp" value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)} placeholder="Optional note..." />
              
              <button 
                className="bulk-hide-btn"
                onClick={() => updateRow(row.id, 'exclude_analytics', !row.exclude_analytics)}
                style={{
                  background: row.exclude_analytics ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg3)',
                  border: row.exclude_analytics ? '1px solid var(--neg)' : '1px solid var(--border)',
                  color: row.exclude_analytics ? 'var(--neg)' : 'var(--text2)',
                  borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px', padding: 0, transition: 'all 0.2s', margin: 0
                }}
                title={row.exclude_analytics ? "Excluded from Analytics" : "Included in Analytics"}
              >
                {row.exclude_analytics ? '🙈' : '👁️'}
              </button>
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
function CategoryExclusionModal({ transactions, allHeadings, onClose, onRefresh }) {
  const [loadingCat, setLoadingCat] = useState(null);
  const [search, setSearch] = useState("");

  // 1. Compute exclusion status for all categories (Prevents recalculating during sorts)
  const exclusionMap = useMemo(() => {
    const map = {};
    allHeadings.forEach(cat => {
      const catTxs = transactions.filter(t => t.heading === cat);
      map[cat] = catTxs.length > 0 && catTxs.every(t => t.exclude_analytics);
    });
    return map;
  }, [allHeadings, transactions]);

  // 2. Filter by search, then sort (Excluded items at the top, then Alphabetical)
  const displayHeadings = useMemo(() => {
    return allHeadings
      .filter(h => h.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (exclusionMap[a] && !exclusionMap[b]) return -1; // 'a' is excluded, move up
        if (!exclusionMap[a] && exclusionMap[b]) return 1;  // 'b' is excluded, move up
        return a.localeCompare(b); // Alphabetical tie-breaker
      });
  }, [allHeadings, search, exclusionMap]);

  const toggleCategory = async (heading, currentExcluded) => {
    setLoadingCat(heading);
    try {
      const res = await fetch(`${API}/transactions/category/exclude`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ heading, exclude: !currentExcluded })
      });
      if (res.ok) {
        onRefresh();
      } else {
        alert("Failed to update category.");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoadingCat(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div className="modal-title">⚙️ Manage Categories</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        {/* Search Bar */}
        <div style={{ padding: '1rem 1.5rem 0' }}>
            <input 
                className="inp" 
                placeholder="🔍 Search categories..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
            />
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '1.5rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '1.5rem', lineHeight: 1.6, background: 'rgba(99,102,241,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.1)' }}>
            Exclude entire categories from the Spending Analyser pie chart and statistics. 
            <br/><br/><strong style={{ color: 'var(--accent)' }}>✨ Magic Feature:</strong> If a category is hidden here, any <i>new</i> transactions you log in this category will be automatically excluded in the future!
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {displayHeadings.map(cat => {
              const isExcluded = exclusionMap[cat];

              return (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: 'var(--bg2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.95rem', color: isExcluded ? 'var(--text3)' : 'var(--text)', fontWeight: 600, textDecoration: isExcluded ? 'line-through' : 'none', transition: 'all 0.2s' }}>
                    {cat}
                  </span>
                  <button
                    onClick={() => toggleCategory(cat, isExcluded)}
                    disabled={loadingCat === cat}
                    style={{
                      width: '46px', height: '26px', borderRadius: '13px',
                      background: isExcluded ? 'var(--border2)' : 'var(--pos)',
                      position: 'relative', border: 'none', cursor: loadingCat === cat ? 'wait' : 'pointer', transition: 'background 0.2s',
                      opacity: loadingCat === cat ? 0.5 : 1, flexShrink: 0
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: '3px',
                      left: isExcluded ? '3px' : '23px',
                      transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }} />
                  </button>
                </div>
              );
            })}
            
            {displayHeadings.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)', fontSize: '0.9rem' }}>
                No categories found matching "{search}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
function InvestTab({ investments, manualAssets, assetList, onAdd }) {  const [syncing, setSyncing] = useState(false);
  const [filterMonth, setFilterMonth] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenStr, setTokenStr] = useState("");
  const [syncingSheets, setSyncingSheets] = useState(false);
  
  // 🚀 NEW MASTER CHART STATES
  const [chartCategory, setChartCategory] = useState('ALL');
  const [timeframe, setTimeframe] = useState('3M');
  
  // 🚀 DRILLDOWN STATES
  const [selectedAsset, setSelectedAsset] = useState("");
  const [assetHistory, setAssetHistory] = useState([]);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const drilldownRef = useRef(null);

  // Close custom dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (drilldownRef.current && !drilldownRef.current.contains(e.target)) {
        setIsDrilldownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch history specifically when a micro-asset is selected
  useEffect(() => {
    if (!selectedAsset) { setAssetHistory([]); return; }
    
    const fetchAssetHistory = async () => {
      const res = await fetch(`${API}/investments/history?symbol=${encodeURIComponent(selectedAsset)}&type=${chartCategory}`, { 
        headers: { 'Authorization': `Bearer ${getToken()}` } 
      });
      if (res.ok) setAssetHistory(await res.json());
    };
    fetchAssetHistory();
  }, [selectedAsset, chartCategory]);
  
  // Clear the drilldown if the user changes the main category
  useEffect(() => { setSelectedAsset(""); }, [chartCategory]);

  // 🚀 NEW ACCORDION, MODAL & PRIVACY STATES
  const [expandedSection, setExpandedSection] = useState('MARKET');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showBalances, setShowBalances] = useState(false); // Eye Icon state
  const [invCurrentPage, setInvCurrentPage] = useState(0); // Pagination state
  const [invRowsPerPage, setInvRowsPerPage] = useState(10);

  // 🚀 HANDLER TO DELETE MANUAL ASSETS
  const handleDeleteManualAsset = async (id) => {
    if (!window.confirm("Are you sure you want to delete this asset?")) return;
    try {
      const res = await fetch(`${API}/manual_assets/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) onAdd(); // Refreshes all data
    } catch(e) { alert("Error deleting asset: " + e.message); }
  };
  
  // Drill-down states
  const [drillDownDate, setDrillDownDate] = useState(null);
  const [drillDownData, setDrillDownData] = useState([]);
  const [drillDownType, setDrillDownType] = useState(null); // "MF" or "EQUITY"
  const [drillSortBy, setDrillSortBy] = useState("symbol");
  const [drillSortDir, setDrillSortDir] = useState("asc");

  // 3-State Toggle
  const [viewMode, setViewMode] = useState("ALL"); // "ALL", "MF", "EQUITY"
  
  // 🚀 DYNAMIC CHART DATA PROCESSOR (Handles both Totals AND Single Assets)
  const chartData = useMemo(() => {
    // 1. CHOOSE SOURCE: If a specific asset is selected, use its API history. Otherwise, use global totals.
    let data = selectedAsset ? [...assetHistory] : [...investments].reverse();
    if (!data || data.length === 0) return [];
    
    // 2. APPLY TIMEFRAME
    if (timeframe !== 'ALL') {
      const now = new Date();
      let cutoffDate = new Date();
      if (timeframe === '1M') cutoffDate.setMonth(now.getMonth() - 1);
      else if (timeframe === '3M') cutoffDate.setMonth(now.getMonth() - 3);
      else if (timeframe === '6M') cutoffDate.setMonth(now.getMonth() - 6);
      else if (timeframe === '1Y') cutoffDate.setFullYear(now.getFullYear() - 1);
      else if (timeframe === 'YTD') cutoffDate = new Date(now.getFullYear(), 0, 1);
      
      data = data.filter(d => new Date(d.date) >= cutoffDate);
    }
    
    // 3. MAP VALUES
    return data.map(d => {
       if (selectedAsset) {
         // Drilldown data is already formatted by the backend
         return { date: formatDate(d.date), Current: d.Current || 0, Invested: d.Invested || 0 };
       }
       
       // Otherwise, we map the global totals
       let curr = 0; let inv = 0;
       if (chartCategory === 'ALL') { curr = d.total_curr; inv = d.total_inv; }
       else if (chartCategory === 'EQUITY') { curr = d.curr_stocks; inv = d.inv_stocks; }
       else if (chartCategory === 'MF') { curr = d.curr_mf; inv = d.inv_mf; }
       else if (chartCategory === 'PROVIDENT') { curr = d.curr_prov; inv = d.inv_prov; }
       else if (chartCategory === 'FIXED_INCOME') { curr = d.curr_fixed; inv = d.inv_fixed; }
       else if (chartCategory === 'GOLD') { curr = d.curr_gold; inv = d.inv_gold; }
       
       const pct = inv > 0 ? ((curr - inv) / inv) * 100 : 0;
       return { date: formatDate(d.date), Current: curr || 0, Invested: inv || 0, ReturnPct: pct };
    });
  }, [investments, chartCategory, timeframe, selectedAsset, assetHistory]);

  // 🚀 CUSTOM TOOLTIP FOR LINE CHART
  const CustomInvestTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const curr = payload.find(p => p.dataKey === 'Current')?.value || 0;
      const inv = payload.find(p => p.dataKey === 'Invested')?.value || 0;
      const pct = payload[0].payload.ReturnPct || 0;
      const isPos = pct >= 0;

      return (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '8px', fontWeight: 600 }}>{label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem' }}>Current</span>
              <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{showBalances ? `₹${curr.toLocaleString('en-IN', {maximumFractionDigits:0})}` : '₹ ••••••'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
              <span style={{ color: 'var(--text3)', fontWeight: 600, fontSize: '0.85rem' }}>Invested</span>
              <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{showBalances ? `₹${inv.toLocaleString('en-IN', {maximumFractionDigits:0})}` : '₹ ••••••'}</span>
            </div>
            <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text2)', fontWeight: 600, fontSize: '0.8rem' }}>Returns</span>
              <span className={isPos ? 'pos' : 'neg'} style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                {isPos ? '+' : ''}{pct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // 🚀 UPDATED DRILL-DOWN FETCHER (Supports Toggling inside Modal)
  const fetchDrillDownData = async (dateStr, type) => {
    const endpoint = type === "EQUITY" ? "equity_holdings" : "holdings";
    const res = await fetch(`${API}/investments/${dateStr}/${endpoint}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    const data = await res.json();
    
    // Ensure ret_pct is dynamically calculated if missing
    const dataWithRet = data.map(d => ({
      ...d,
      ret_pct: d.ret_pct !== undefined ? d.ret_pct : (d.invested_value > 0 ? ((d.current_value - d.invested_value) / d.invested_value) * 100 : 0)
    }));
    
    setDrillDownData(dataWithRet);
    setDrillDownType(type);
    setDrillDownDate(dateStr);
    setDrillSortBy("symbol"); 
    setDrillSortDir("asc");
  };

  const openDrillDown = (dateStr) => {
    fetchDrillDownData(dateStr, 'EQUITY'); // Default to Stocks when opened
  };

  const handleDrillSort = (col) => {
    if (drillSortBy === col) {
      setDrillSortDir(drillSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setDrillSortBy(col);
      setDrillSortDir('desc');
    }
  };

  // Sorted data for the modal table
  const processedDrillDownData = useMemo(() => {
    let data = [...drillDownData];
    data.sort((a, b) => {
      let aVal = a[drillSortBy];
      let bVal = b[drillSortBy];
      
      // Handle the LTP vs NAV naming dynamically
      if (drillSortBy === 'price') {
         aVal = drillDownType === "EQUITY" ? a.ltp : a.nav;
         bVal = drillDownType === "EQUITY" ? b.ltp : b.nav;
      }
      
      if (typeof aVal === 'string') {
        return drillSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return drillSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [drillDownData, drillSortBy, drillSortDir, drillDownType]);

  // Unique months for the dropdown
  const allMonths = useMemo(() => {
    return [...new Set(investments.map(inv => {
      if (!inv.date) return null;
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))]
    .filter(Boolean).sort().reverse()
    .map(ym => {
      const [y, m] = ym.split('-');
      const d = new Date(y, m - 1, 1);
      return { val: ym, label: `${d.toLocaleString('default', { month: 'long' })} ${y}` };
    });
  }, [investments]);

  // Unified Sorting & Filtering for ALL views
  const processedData = useMemo(() => {
    let data = [...investments];
    
    if (filterMonth) {
      data = data.filter(inv => {
        if (!inv.date) return false;
        const d = new Date(inv.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === filterMonth;
      });
    }

    data.sort((a, b) => {
      // Dynamic value extractor based on current ViewMode
      const getVal = (item, key) => {
         if (key === 'date') return new Date(item.date).getTime();
         
         const invVal = viewMode === 'ALL' ? parseFloat(item.total_inv || 0) : viewMode === 'EQUITY' ? parseFloat(item.inv_stocks || 0) : parseFloat(item.inv_mf || 0);
         const currVal = viewMode === 'ALL' ? parseFloat(item.total_curr || 0) : viewMode === 'EQUITY' ? parseFloat(item.curr_stocks || 0) : parseFloat(item.curr_mf || 0);
         const retPct = viewMode === 'ALL' ? parseFloat(item.total_ret_pct || 0) : viewMode === 'EQUITY' ? parseFloat(item.ret_pct_stocks || 0) : parseFloat(item.ret_pct_mf || 0);
         const statusStr = viewMode === 'ALL' ? item.total_status : viewMode === 'EQUITY' ? item.status_stocks : item.status_mf;
         
         if (key === 'inv') return invVal;
         if (key === 'curr') return currVal;
         if (key === 'ret_amount') return currVal - invVal;
         if (key === 'ret_pct') return retPct;
         if (key === 'status') return statusStr;
         return 0;
      };

      const aVal = getVal(a, sortBy);
      const bVal = getVal(b, sortBy);

      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return data;
  }, [investments, filterMonth, sortBy, sortDir, viewMode]);

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const handleOpenKite = () => {
    window.open("https://kite.zerodha.com/connect/LOGIN?api_key=6gcxnf0qycaphw5k", "_blank", "width=500,height=600");
    setShowTokenInput(true);
  };

  const handleSubmitToken = async () => {
    let token = tokenStr.trim();
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ request_token: token })
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ " + data.message);
        onAdd(); 
        setShowTokenInput(false);
        setTokenStr("");
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
      alert(data.success ? (data.message.includes("No new") ? "👍 " + data.message : "✅ " + data.message) : "❌ Sync Failed: " + data.message);
    } catch (e) {
      alert("❌ Network Error: " + e.message);
    } finally {
      setSyncingSheets(false);
    }
  };

  // 🚀 PAGINATION CALCULATIONS
  const invTotalPages = Math.ceil(processedData.length / invRowsPerPage);
  const invPaginatedRows = processedData.slice(invCurrentPage * invRowsPerPage, (invCurrentPage + 1) * invRowsPerPage);
  useEffect(() => { setInvCurrentPage(0); }, [filterMonth, sortBy, sortDir, viewMode]);

  // 🚀 CALCULATE DATA FOR NEW HERO SECTION
  const latest = investments.length > 0 ? investments[0] : null;
  const pieData = latest ? [
    { name: "Equity", value: latest.curr_stocks || 0, fill: "#6366f1" },
    { name: "Mutual Funds", value: latest.curr_mf || 0, fill: "#8b5cf6" },
    { name: "Fixed Income", value: latest.curr_fixed || 0, fill: "#10b981" },
    { name: "Provident", value: latest.curr_prov || 0, fill: "#f59e0b" },
    { name: "Gold", value: latest.curr_gold || 0, fill: "#eab308" }
  ].filter(d => d.value > 0) : [];

  return (
    <div className="invest-layout" style={{ display: 'block' }}>
      
      {/* 🚀 NEW HERO SECTION: Metrics & Allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Summary Metrics Card */}
        <div style={{ background: 'var(--card)', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Combined Net Worth</div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '2.8rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginTop: '0.2rem' }}>
                  {showBalances ? (latest ? fmt(latest.total_curr) : '₹0') : '₹ ••••••'}
                </div>
              </div>
              <button 
                onClick={() => setShowBalances(!showBalances)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', fontSize: '1.2rem' }}
                title={showBalances ? "Hide Balances" : "Show Balances"}
              >
                {showBalances ? '🙈' : '👁️'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', background: 'var(--bg2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Total Invested</span>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', marginTop: '2px' }}>
                  {showBalances ? (latest ? fmt(latest.total_inv) : '₹0') : '₹ ••••••'}
                </div>
              </div>
              <div style={{ width: '1px', background: 'var(--border)' }}></div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Returns</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '2px' }}>
                  <span className={(latest && latest.total_curr - latest.total_inv >= 0) ? 'pos' : 'neg'} style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                    {showBalances ? (latest && latest.total_curr - latest.total_inv >= 0 ? '+' : '') + (latest ? fmt(latest.total_curr - latest.total_inv) : '₹0') : '₹ ••••••'}
                  </span>
                  <span className={(latest && latest.total_ret_pct >= 0) ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.85rem', opacity: 0.9 }}>
                    {latest ? `(${latest.total_ret_pct >= 0 ? '+' : ''}${latest.total_ret_pct.toFixed(2)}%)` : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
             {!showTokenInput ? (
                <>
                  <button className="action-btn" style={{ flex: 1, minWidth: '120px', justifyContent: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'none' }} onClick={() => setIsAddModalOpen(true)}>
                    ➕ Add Asset
                  </button>
                  <button className="action-btn" style={{ flex: 1, minWidth: '120px', justifyContent: 'center', background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', boxShadow: '0 4px 15px rgba(20, 184, 166, 0.2)' }} onClick={handleSyncToSheets} disabled={syncingSheets}>
                    {syncingSheets ? '⏳ Syncing...' : '📥 Sync Sheets'}
                  </button>
                  <button className="action-btn" style={{ flex: 1, minWidth: '120px', justifyContent: 'center', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }} onClick={handleOpenKite}>
                    ⚡ Sync Broker
                  </button>
                </>
             ) : (
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%', animation: 'fadeIn 0.3s ease' }}>
                  <input className="inp" placeholder="Paste request_token URL..." value={tokenStr} onChange={e => setTokenStr(e.target.value)} style={{ flex: 1 }} />
                  <button className="action-btn" onClick={handleSubmitToken} disabled={syncing}>{syncing ? '⏳' : 'Sync'}</button>
                  <button className="action-btn secondary" onClick={() => { setShowTokenInput(false); setTokenStr(""); }}>✕</button>
                </div>
             )}
          </div>
        </div>

        {/* Allocation Donut Card */}
        <div style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '200px', height: '200px', position: 'relative', flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={3} cornerRadius={6} stroke="none">
                  {pieData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Pie>
                <Tooltip 
                  formatter={(value) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: 'var(--text)', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.5px' }}>ASSETS</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{pieData.length}</div>
            </div>
          </div>
          
          {/* Legend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem', flex: 1, paddingLeft: '1.5rem' }}>
            {pieData.map(d => {
              const pct = latest && latest.total_curr > 0 ? ((d.value / latest.total_curr) * 100).toFixed(1) : 0;
              return (
                <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: d.fill }}></div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{d.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', fontFamily: "'Syne', sans-serif" }}>
                      {showBalances ? fmt(d.value) : '₹ ••••••'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* 🚀 THE COMMAND CENTER: MASTER CHART */}
      <div className="analyser-card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Chart Header & Time Toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="section-title" style={{ margin: 0, border: 'none' }}>📈 Investment Analyser</h3>
          
          <div style={{ display: 'flex', gap: '0.3rem', background: 'var(--bg2)', padding: '0.3rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
            {['1M', '3M', '6M', '1Y', 'YTD', 'ALL'].map(tf => (
              <button 
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  background: timeframe === tf ? 'var(--card)' : 'transparent',
                  color: timeframe === tf ? 'var(--text)' : 'var(--text3)',
                  border: timeframe === tf ? '1px solid var(--border2)' : '1px solid transparent',
                  padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: timeframe === tf ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Category Toggles */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
          {[
            { id: 'ALL', label: 'Overall Portfolio' },
            { id: 'EQUITY', label: 'Equity' },
            { id: 'MF', label: 'Mutual Funds' },
            { id: 'PROVIDENT', label: 'Provident' },
            { id: 'FIXED_INCOME', label: 'Fixed Income' },
            { id: 'GOLD', label: 'Gold' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setChartCategory(cat.id)}
              style={{
                padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: chartCategory === cat.id ? 'var(--card)' : 'transparent',
                color: chartCategory === cat.id ? 'var(--accent)' : 'var(--text2)',
                border: chartCategory === cat.id ? '1px solid var(--accent)' : '1px solid transparent',
                boxShadow: chartCategory === cat.id ? '0 4px 12px rgba(99,102,241,0.15)' : 'none'
              }}
            >
              {cat.label}
            </button>
          ))}
          {/* 🚀 THE MICRO-ASSET DRILLDOWN DROPDOWN */}
          {chartCategory !== 'ALL' && assetList && assetList[chartCategory] && assetList[chartCategory].length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem' }} ref={drilldownRef}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>DRILLDOWN:</span>
              
              <div style={{ position: 'relative' }}>
                <button
                  className={`filter-chip ${isDrilldownOpen ? 'open' : ''}`}
                  onClick={() => setIsDrilldownOpen(!isDrilldownOpen)}
                  style={{
                    minWidth: '180px', maxWidth: '240px', justifyContent: 'space-between', padding: '0.45rem 0.85rem',
                    borderRadius: '8px', background: 'var(--card)', border: selectedAsset ? '1px solid var(--accent)' : '1px solid var(--border)',
                    color: selectedAsset ? 'var(--accent)' : 'var(--text)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, margin: 0, height: '36px',
                    boxShadow: selectedAsset ? '0 2px 8px rgba(99,102,241,0.1)' : 'none'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedAsset || "-- Entire Category --"}
                  </span>
                  <span className="chip-arrow">▼</span>
                </button>

                {isDrilldownOpen && (
                  <div className="chip-dropdown" style={{ width: '100%', right: 0, left: 'auto', top: 'calc(100% + 4px)', maxHeight: '280px', overflowY: 'auto' }}>
                    
                    <div
                      className={`chip-dropdown-item ${!selectedAsset ? 'selected' : ''}`}
                      onClick={() => { setSelectedAsset(""); setIsDrilldownOpen(false); }}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}
                    >
                      <div className={`chip-checkbox ${!selectedAsset ? 'checked' : ''}`} style={{ borderRadius: '50%' }} />
                      <span style={{ fontWeight: !selectedAsset ? 700 : 500, color: !selectedAsset ? 'var(--text)' : 'var(--text2)' }}>-- Entire Category --</span>
                    </div>
                    
                    {assetList[chartCategory].map(sym => (
                      <div
                        key={sym}
                        className={`chip-dropdown-item ${selectedAsset === sym ? 'selected' : ''}`}
                        onClick={() => { setSelectedAsset(sym); setIsDrilldownOpen(false); }}
                      >
                        <div className={`chip-checkbox ${selectedAsset === sym ? 'checked' : ''}`} style={{ borderRadius: '50%' }} />
                        <span style={{ fontWeight: selectedAsset === sym ? 700 : 500, color: selectedAsset === sym ? 'var(--text)' : 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sym}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* The Recharts Graph */}
        <div style={{ height: '350px', width: '100%', marginTop: '0.5rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--text3)" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text3)" fontSize={11} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip content={<CustomInvestTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '5 5' }} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
              <Line type="monotone" name="Current Value" dataKey="Current" stroke="var(--accent)" strokeWidth={3} dot={chartData.length <= 1} activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }} animationDuration={800} />
              <Line type="monotone" name="Invested Amount" dataKey="Invested" stroke="var(--text3)" strokeWidth={2} strokeDasharray="5 5" dot={chartData.length <= 1} activeDot={false} animationDuration={800} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 🚀 THE ASSET CLASS GRID (ACCORDIONS) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[
          { title: "Stocks & MFs (Brokerage)", id: "MARKET" },
          { title: "Provident Funds & Retirement", id: "PROVIDENT", categories: ['EPF', 'PPF', 'NPS'] },
          { title: "Fixed Income & Savings", id: "FIXED", categories: ['FD', 'RD', 'Cash'] },
          { title: "Gold & Real Estate", id: "GOLD", categories: ['SGB', 'RealEstate'] }
        ].map(section => {
          
          // Filter manual assets for this specific section
          const sectionAssets = manualAssets ? manualAssets.filter(a => section.categories?.includes(a.category)) : [];

          return (
            <div key={section.id} className="analyser-card" style={{ marginBottom: 0 }}>
              <div 
                className={`analyser-header ${expandedSection === section.id ? 'open' : ''}`} 
                onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
              >
                <div className="analyser-header-left">
                  <div className="analyser-header-icon">{section.id === 'MARKET' ? '📈' : section.id === 'PROVIDENT' ? '🛡️' : section.id === 'FIXED' ? '🏦' : '🥇'}</div>
                  <div className="analyser-header-title">{section.title}</div>
                </div>
                <span className={`analyser-chevron ${expandedSection === section.id ? 'open' : ''}`}>▼</span>
              </div>

              {expandedSection === section.id && (
                <div className="analyser-body" style={{ padding: '1.5rem', animation: 'fadeIn 0.2s ease' }}>
                  
                  {section.id === "MARKET" ? (
                    /* 🚀 UPGRADED MARKET TABLE (Pagination + Click Cues) */
                    <div>
                      <div className="data-table">
                        <div className="table-header inv-cols" style={{ cursor: 'pointer', userSelect: 'none', gridTemplateColumns: '1.2fr 1.5fr 1.5fr 1.5fr 1fr 1.2fr' }}>
                          <span onClick={() => handleSort('date')}>Date {sortBy === 'date' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                          <span onClick={() => handleSort('inv')}>TOTAL INV {sortBy === 'inv' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                          <span onClick={() => handleSort('curr')}>TOTAL CURR {sortBy === 'curr' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                          <span onClick={() => handleSort('ret_amount')}>RET ₹ {sortBy === 'ret_amount' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                          <span onClick={() => handleSort('ret_pct')}>RET % {sortBy === 'ret_pct' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                          <span>Action</span>
                        </div>
                        {invPaginatedRows && invPaginatedRows.length > 0 ? invPaginatedRows.map((inv, i) => {
                          const ret = inv.total_curr - inv.total_inv;
                          return (
                            <div 
                              key={i} 
                              className={`table-row inv-cols ${i%2===0?'row-even':''}`} 
                              onClick={() => openDrillDown(inv.date.split('T')[0])} 
                              style={{ cursor: 'pointer', gridTemplateColumns: '1.2fr 1.5fr 1.5fr 1.5fr 1fr 1.2fr', transition: 'background 0.2s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <span style={{ fontWeight: 600 }}>{formatDate(inv.date)}</span>
                              <span style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '4px', textDecorationColor: 'var(--border2)' }}>{showBalances ? fmt(inv.total_inv) : '₹ ••••••'}</span>
                              <span style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '4px', textDecorationColor: 'var(--border2)' }}>{showBalances ? fmt(inv.total_curr) : '₹ ••••••'}</span>
                              <span className={ret >= 0 ? 'pos' : 'neg'}>{showBalances ? fmt(ret) : '₹ ••••••'}</span>
                              <span className={inv.total_ret_pct >= 0 ? 'pos' : 'neg'}>{fmtPct(inv.total_ret_pct)}</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>🔍 View Split</span>
                            </div>
                          );
                        }) : <div className="empty-state">No brokerage snapshots match your filters.</div>}
                      </div>

                      {/* 🚀 PAGINATION CONTROLS */}
                      {invTotalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.75rem 1.25rem', background: 'var(--bg2)', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '1rem' }}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <select 
                              className="sel" 
                              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '8px', background: 'var(--card)' }} 
                              value={invRowsPerPage} 
                              onChange={e => { setInvRowsPerPage(Number(e.target.value)); setInvCurrentPage(0); }}
                            >
                              <option value={10}>10 rows</option>
                              <option value={25}>25 rows</option>
                              <option value={50}>50 rows</option>
                              <option value={100}>100 rows</option>
                            </select>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>
                              Showing {invCurrentPage * invRowsPerPage + 1} - {Math.min((invCurrentPage + 1) * invRowsPerPage, processedData.length)} of {processedData.length}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button onClick={() => setInvCurrentPage(Math.max(0, invCurrentPage - 1))} disabled={invCurrentPage === 0} className="action-btn secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>← Prev</button>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>Page {invCurrentPage + 1} / {invTotalPages}</span>
                            <button onClick={() => setInvCurrentPage(Math.min(invTotalPages - 1, invCurrentPage + 1))} disabled={invCurrentPage === invTotalPages - 1} className="action-btn secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Next →</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 🚀 FIXED TABLE STRUCTURE FOR MANUAL ASSETS */
                    <div className="data-table">
                      {sectionAssets.length > 0 ? (
                        <>
                          <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 1fr 1fr 1fr', padding: '0.75rem 1.25rem' }}>
                            <span>Asset Name</span>
                            <span>Type</span>
                            <span>Invested</span>
                            <span>Current Value</span>
                            <span>Return ₹</span>
                            <span>Updated</span>
                            <span style={{textAlign: 'right'}}>Actions</span>
                          </div>
                          {sectionAssets.map((asset, i) => {
                            const ret = asset.current_value - asset.invested_value;
                            return (
                              <div key={asset.id} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 1fr 1fr 1fr', padding: '0.75rem 1.25rem', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600 }}>{asset.name}</span>
                                <span><span style={{ background: 'var(--bg3)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}>{asset.category}</span></span>
                                <span>{fmt(asset.invested_value)}</span>
                                <span style={{ fontWeight: 700 }}>{fmt(asset.current_value)}</span>
                                <span className={ret >= 0 ? 'pos' : 'neg'}>{fmt(ret)}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{asset.last_updated}</span>
                                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                  <button className="action-icon-btn delete" onClick={() => handleDeleteManualAsset(asset.id)} title="Delete">🗑️</button>
                                </span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="empty-state">No assets added in this category yet.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Render the Add Modal if state is true */}
      {isAddModalOpen && <AddManualAssetModal onClose={() => setIsAddModalOpen(false)} onAdd={onAdd} />}

      {/* Drill-down Modal (Shared for MF & Equity) */}
      {drillDownDate && (
        <div className="modal-backdrop" onClick={() => setDrillDownDate(null)}>
          <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <div className="modal-title">Portfolio on {formatDate(drillDownDate)}</div>
                <button className="modal-close" onClick={() => setDrillDownDate(null)}>×</button>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => fetchDrillDownData(drillDownDate, 'EQUITY')}
                  style={{
                    padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    background: drillDownType === 'EQUITY' ? 'var(--card)' : 'transparent',
                    color: drillDownType === 'EQUITY' ? 'var(--accent)' : 'var(--text2)',
                    border: drillDownType === 'EQUITY' ? '1px solid var(--accent)' : '1px solid transparent',
                    boxShadow: drillDownType === 'EQUITY' ? '0 4px 12px rgba(99,102,241,0.15)' : 'none'
                  }}
                >📈 Equity (Stocks)</button>
                <button 
                  onClick={() => fetchDrillDownData(drillDownDate, 'MF')}
                  style={{
                    padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    background: drillDownType === 'MF' ? 'var(--card)' : 'transparent',
                    color: drillDownType === 'MF' ? 'var(--accent)' : 'var(--text2)',
                    border: drillDownType === 'MF' ? '1px solid var(--accent)' : '1px solid transparent',
                    boxShadow: drillDownType === 'MF' ? '0 4px 12px rgba(99,102,241,0.15)' : 'none'
                  }}
                >🏦 Mutual Funds</button>
              </div>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {processedDrillDownData.length > 0 ? (
                <div className="data-table">
                  <div className="table-header" style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1fr', cursor: 'pointer', userSelect: 'none' }}>
                    <span onClick={() => handleDrillSort('symbol')}>Symbol {drillSortBy === 'symbol' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                    <span onClick={() => handleDrillSort('quantity')}>Qty {drillSortBy === 'quantity' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                    <span onClick={() => handleDrillSort('average_price')}>Avg Price {drillSortBy === 'average_price' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                    <span onClick={() => handleDrillSort('price')}>{drillDownType === 'EQUITY' ? 'LTP' : 'NAV'} {drillSortBy === 'price' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                    <span onClick={() => handleDrillSort('invested_value')}>Invested {drillSortBy === 'invested_value' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                    <span onClick={() => handleDrillSort('current_value')}>Current {drillSortBy === 'current_value' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                    <span onClick={() => handleDrillSort('ret_pct')}>Ret % {drillSortBy === 'ret_pct' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                  </div>
                  {processedDrillDownData.map((h, i) => (
                    <div key={i} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1fr' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600' }}>{h.symbol}</span>
                      <span>{h.quantity.toFixed(2)}</span>
                      <span>₹{h.average_price.toFixed(2)}</span>
                      <span>₹{(drillDownType === 'EQUITY' ? h.ltp : h.nav).toFixed(2)}</span>
                      <span>₹{h.invested_value.toFixed(0)}</span>
                      <span className={h.current_value >= h.invested_value ? 'pos' : 'neg'}>₹{h.current_value.toFixed(0)}</span>
                      <span className={h.ret_pct >= 0 ? 'pos' : 'neg'}>{fmtPct(h.ret_pct)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No individual data saved for this date.</div>
              )}
            </div>
          </div>
        </div>
      )}
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
  const [manualAssets, setManualAssets] = useState([]); // 🚀 NEW STATE
  const [assetList, setAssetList] = useState({}); // 🚀 NEW: Dropdown options
  const [allTransactionsLoaded, setAllTransactionsLoaded] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  
  // --- Sidebar Resizing Logic ---
  const [sidebarWidth, setSidebarWidth] = useState(70); 
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
      // Helper function that explicitly throws an error if the server is throwing 500/503 during wake-up
      const fetchWithCheck = async (url) => {
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!r.ok) throw new Error(`Server waking up: ${r.status}`);
        return r.json();
      };

      // Fire ALL 6 requests in parallel
      const [acc, phy, inv, manAssets, txRes, listRes] = await Promise.all([
        fetchWithCheck(`${API}/accounts`),
        fetchWithCheck(`${API}/physical`),
        fetchWithCheck(`${API}/investments`),
        fetchWithCheck(`${API}/manual_assets`), 
        fetchWithCheck(`${API}/transactions?limit=100&offset=0`),
        fetchWithCheck(`${API}/assets/list`) // 🚀 FETCH SYMBOLS
      ]);
      
      setAccounts(acc);
      setTransactions(txRes.transactions);
      setAllTransactionsLoaded(false); 
      setPhysical(phy);
      setInvestments(inv);
      setManualAssets(manAssets); 
      setAssetList(listRes); // 🚀 SAVE SYMBOLS
      
      if (showLoading) setAppLoading(false); 
    } catch(e) {
      console.warn("Server is asleep or database is booting. Retrying in 3 seconds...", e.message);
      // The loading screen stays up, and we try again automatically!
      setTimeout(() => fetchAll(showLoading), 3000); 
    }
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
      case 0: return <HomeTab accounts={accounts ?? []} transactions={transactions ?? []} physical={physical ?? []} investments={investments ?? []} onSyncBalances={syncBalances} fetchAllTransactions={fetchAllTransactions} onRefresh={fetchAll} />;
      case 1: return <MoneyTab accounts={accounts} transactions={transactions} onRefresh={fetchAll} />;
      case 2: return <AddTab accounts={accounts} transactions={transactions} onAdd={fetchAll} />;
      case 3: return <GymTab physical={physical} onOpenModal={() => setIsActivityModalOpen(true)} />;      
      case 4: return <InvestTab investments={investments} manualAssets={manualAssets} assetList={assetList} onAdd={fetchAll} />;
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
              onClick={() => setTab(t.id)}
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
            
            {/* NEW: Version and Build Time */}
            <div style={{
               opacity: sidebarMinimized ? 0 : 1,
               maxHeight: sidebarMinimized ? 0 : '20px',
               marginTop: '8px',
               fontSize: '0.6rem',
               color: 'var(--border2)',
               transition: 'all 0.3s ease',
               overflow: 'hidden',
               fontFamily: "'DM Sans', monospace"
            }}>
               v:{__COMMIT_SHA__} • {__BUILD_TIME__}
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
            onClick={() => setTab(t.id)}
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

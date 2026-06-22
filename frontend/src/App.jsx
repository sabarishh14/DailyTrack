import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
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
        if (data.isAdmin) localStorage.setItem('dt_is_admin', 'true');
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

  // 🚀 GLOBAL ESCAPE: Closes Home-level Modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsReconcileOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

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
              <div className="nw-label">Overall Bank Balance</div>
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
            <CustomSelect 
              value={physMonth} 
              onChange={val => setPhysMonth(parseInt(val))} 
              options={MONTHS.map((m, i) => ({ label: m, value: i }))} 
              minWidth="120px" 
            />
            <CustomSelect 
              value={physYear} 
              onChange={val => setPhysYear(parseInt(val))} 
              options={[2024, 2025, 2026].map(y => ({ label: String(y), value: y }))} 
              minWidth="90px" 
            />
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
            .filter(a => a.balance_tracked && a.account !== 'CC-PINNACLE 6360' && a.account !== 'CC-AXIS REWARDS')
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
            <CustomSelect 
              value={moneyMonth} 
              onChange={val => setMoneyMonth(parseInt(val))} 
              options={MONTHS.map((m, i) => ({ label: m, value: i }))} 
              minWidth="140px" 
            />
            <CustomSelect 
              value={moneyYear} 
              onChange={val => setMoneyYear(parseInt(val))} 
              options={[2024, 2025, 2026].map(y => ({ label: String(y), value: y }))} 
              minWidth="100px" 
            />
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

// ─── REUSABLE CUSTOM SELECT (PORTAL VERSION) ─────────────────────────
function CustomSelect({ value, onChange, options, icon, placeholder, width = 'auto', minWidth = '120px' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Close if clicking outside the button AND outside the portal dropdown
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(e.target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    // 🚨 REMOVED the window.addEventListener('scroll') because it instantly 
    // closes the dropdown on mobile when trying to swipe through the options!

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      // Smart Alignment: If the button is on the right side of the screen, open to the left
      const isRightSide = rect.right > window.innerWidth * 0.6;
      
      setDropdownStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: isRightSide ? 'auto' : `${rect.left}px`,
        right: isRightSide ? `${window.innerWidth - rect.right}px` : 'auto',
        minWidth: `${rect.width}px`, // Matches the button exactly instead of forcing 180px
        zIndex: 999999 
      });
    }
    setIsOpen(!isOpen);
  };

  const filtered = options.filter(o => {
    const label = typeof o === 'object' ? o.label : o;
    return String(label).toLowerCase().includes(searchTerm.toLowerCase());
  });

  const displayValue = options.find(o => (typeof o === 'object' ? o.value : o) === value);
  const displayLabel = displayValue ? (typeof displayValue === 'object' ? displayValue.label : displayValue) : placeholder;

  return (
    <div style={{ position: 'relative', width }} ref={containerRef}>
      <button
        className={`filter-chip ${isOpen ? 'open' : ''}`}
        onClick={toggleDropdown}
        style={{ 
          width: '100%', minWidth, justifyContent: 'space-between', padding: '0.45rem 0.85rem', 
          height: '36px', borderRadius: '8px', margin: 0, 
          border: isOpen ? '1px solid var(--accent)' : '1px solid var(--border)', 
          color: isOpen ? 'var(--accent)' : 'var(--text)' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          {icon && <span>{icon}</span>}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{displayLabel}</span>
        </div>
        <span className="chip-arrow">▼</span>
      </button>
      
      {isOpen && createPortal(
        <div 
          className="chip-dropdown" 
          ref={dropdownRef}
          style={{ ...dropdownStyle }} 
        >
          {options.length > 5 && (
            <div className="chip-search-container">
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="chip-search-input" onClick={e => e.stopPropagation()} />
            </div>
          )}
          {filtered.map((opt, i) => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.label : opt;
            const isSelected = val === value;
            return (
              <div 
                key={i} 
                className={`chip-dropdown-item ${isSelected ? 'selected' : ''}`} 
                onClick={() => { onChange(val); setIsOpen(false); setSearchTerm(""); }} 
                // ⬇️ FIXED: Removed the massive inline padding so CSS can correctly shrink the rows
                style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.3' }}
              >
                <div className={`chip-checkbox ${isSelected ? 'included' : ''}`} style={{ borderRadius: '50%', flexShrink: 0, marginTop: '1px' }} />
                <span style={{ flex: 1, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--text)' : 'var(--text2)' }}>{lbl}</span>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.8rem' }}>No results found</div>}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── MONEY TAB ───────────────────────────────────────────────────────────
function MoneyTab({ accounts, transactions, categories, onRefresh }) {
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

  // 🚀 GLOBAL ESCAPE: Closes Money-level Modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setEditingTx(null);
        setIsBulkEditOpen(false);
        setIsCategoryModalOpen(false);
        setActionMenuTx(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

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
            
            {/* 🚀 STICKY HEADER GROUP */}
            <div style={{ position: 'sticky', top: '-0.375rem', zIndex: 10, background: 'var(--card)', margin: '-0.375rem -0.375rem 0.2rem -0.375rem', borderRadius: '12px 12px 0 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <div className="chip-helper-text" style={{ margin: '0.4rem 0.5rem 0' }}>
                Tap once to include • Tap again to exclude
              </div>

              {options.length > 5 && (
                <div style={{ padding: '0.4rem 0.5rem' }}>
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
                <div
                  className="chip-dropdown-item chip-select-all"
                  onClick={toggleSelectAll}
                  style={{ fontWeight: 600, borderRadius: 0, padding: '0.6rem 0.65rem', borderTop: options.length > 5 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                >
                  <div className={`chip-checkbox ${allSelected ? 'included' : ''}`} />
                  <span>{allSelected ? 'Clear All' : 'Select All'}</span>
                </div>
              )}
            </div>

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
              <div className="analyser-header-sub" style={{ display: 'none' }}></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsCategoryModalOpen(true); }}
              className="action-btn secondary" 
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Manage Categories"
            >
              <span>⚙️</span>
              <span className="manage-btn-text">Manage</span> 
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
                dropdownKey="analyzerVisibility"
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
            <BulkEditTransactionModal transactions={transactions.filter(t => selectedIds.has(t.id))} categories={categories} onClose={() => { setIsBulkEditOpen(false); setSelectedIds(new Set()); }} onRefresh={onRefresh} />
          )}
        </div>
      </section>

      {editingTx && (
        <EditTransactionModal tx={editingTx} categories={categories} onClose={() => setEditingTx(null)} onRefresh={onRefresh} />
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

function AddTab({ accounts, transactions, categories, onAdd }) {
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
             <CustomSelect 
                value={row.account} 
                onChange={val => updateRow(row.id, 'account', val)} 
                options={Object.keys(BANKS).map(b => ({ label: `${BANKS[b]?.emoji} ${b}`, value: b }))} 
                minWidth="140px" 
              />

              <input type="date" className="bulk-inp" style={{ height: '36px' }} value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />

              <CustomSelect 
                value={row.type} 
                onChange={val => updateRow(row.id, 'type', val)} 
                options={[
                  { label: '🔴 Debit', value: 'Debit' },
                  { label: '🟢 Credit', value: 'Credit' },
                  { label: '💰 Savings', value: 'Savings' },
                  { label: '💸 Investment', value: 'Investment' }
                ]} 
                minWidth="130px" 
              />

              <AutocompleteInput value={row.heading} onChange={val => updateRow(row.id, 'heading', val)} options={categories} placeholder="Category" />
              
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
            {categories.map(cat => <option key={cat} value={cat} />)}
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

function EditTransactionModal({ tx, categories, onClose, onRefresh }) {
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
            <CustomSelect 
              value={form.account} 
              onChange={val => updateField('account', val)} 
              options={Object.keys(BANKS).map(b => ({ label: `${BANKS[b]?.emoji} ${b}`, value: b }))} 
              width="100%" 
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Date</label>
            <input type="date" className="bulk-inp" style={{ background: 'var(--card)', padding: '0.75rem', height: '36px' }} value={form.date} onChange={e => updateField('date', e.target.value)} />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Type</label>
            <CustomSelect 
              value={form.type} 
              onChange={val => updateField('type', val)} 
              options={[
                { label: '🔴 Debit', value: 'Debit' },
                { label: '🟢 Credit', value: 'Credit' },
                { label: '💰 Savings', value: 'Savings' },
                { label: '💸 Investment', value: 'Investment' }
              ]} 
              width="100%" 
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Amount (₹)</label>
            <input type="number" className="bulk-inp" style={{ background: 'var(--bg3)', padding: '0.75rem' }} value={form.amount} onChange={e => updateField('amount', e.target.value)} />
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '4px' }}>Category</label>
            <AutocompleteInput value={form.heading} onChange={val => updateField('heading', val)} options={categories} placeholder="Category" />
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

function EditManualAssetModal({ asset, onClose, onRefresh }) {
  const [form, setForm] = useState({ 
    ...asset,
    is_recurring: asset.is_recurring || false,
    amount_to_add: asset.amount_to_add || '',
    interval_value: asset.interval_value || 1,
    interval_unit: asset.interval_unit || 'months',
    next_run_date: asset.next_run_date || new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  // 🚀 Determine the Asset Bucket to lock/unlock fields
  const isLedgerOrMarket = ['EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].includes(form.category);
  const isMath = ['FD', 'RD'].includes(form.category);

  const submit = async () => {
    if (form.is_recurring && (!form.amount_to_add || !form.next_run_date)) {
      return alert("Please fill in the recurring amount and next date.");
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/manual_assets/${asset.id}`, {
        method: "PUT", headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(form)
      });
      if (res.ok) { onRefresh(); onClose(); } 
      else alert("Failed to update asset");
    } catch (e) { alert("Network error: " + e.message); } 
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">✏️ Edit Asset</div></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
          
          <CustomSelect 
            value={form.category} 
            onChange={val => {
              const becomingMath = ['FD', 'RD'].includes(val);
              const becomingMarket = ['EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].includes(val);
              setForm({
                ...form, category: val,
                interest_rate: becomingMarket ? '' : form.interest_rate,
                is_recurring: becomingMath ? false : form.is_recurring
              });
            }} 
            options={['FD', 'EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].map(c => ({ label: c, value: c }))} 
            placeholder="Select Category" width="100%" 
          />
          
         <input className="inp" placeholder="Asset Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* 1. Invested Amount */}
            <input className="inp" type="number" placeholder="Invested Amount" value={form.invested_value} onChange={e => setForm({...form, invested_value: e.target.value})} />
            
            {/* 2. Current Value (Smart & Centralized) */}
            <div style={{ position: 'relative' }}>
              <input 
                className="inp" type="number" placeholder="Current Value" 
                value={form.current_value} 
                onChange={e => setForm({...form, current_value: e.target.value})} 
                disabled={!!form.interest_rate} 
                style={{ 
                  opacity: form.interest_rate ? 0.5 : 1, 
                  cursor: form.interest_rate ? 'not-allowed' : 'text',
                  background: form.interest_rate ? 'var(--bg3)' : 'var(--card)'
                }}
              />
              {!!form.interest_rate && (
                <div style={{ position: 'absolute', right: '10px', top: '10px', fontSize: '0.65rem', color: 'var(--text3)' }}>Auto</div>
              )}
            </div>
          </div>
          
          {/* 3. Interest Rate Row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Interest Rate %</span>
                {isLedgerOrMarket && (
                  <span title="Market/Ledger assets fluctuate. Leave this blank and update Current Value manually." 
                        style={{ cursor: 'help', background: 'var(--bg3)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text2)', border: '1px solid var(--border)' }}>?</span>
                )}
             </div>
             <input className="inp" type="number" placeholder="e.g. 7.1" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})} disabled={isLedgerOrMarket} style={{ opacity: isLedgerOrMarket ? 0.3 : 1, cursor: isLedgerOrMarket ? 'not-allowed' : 'text' }} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
               <span style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Start Date</span>
               <input className="inp" type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
               <span style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Maturity Date</span>
               <input className="inp" type="date" value={form.maturity_date} onChange={e => setForm({...form, maturity_date: e.target.value})} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.5rem', background: 'var(--bg3)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', opacity: isMath ? 0.4 : 1 }}>
            <div onClick={() => !isMath && setForm({...form, is_recurring: !form.is_recurring})} style={{ width: '44px', height: '24px', borderRadius: '12px', background: form.is_recurring ? 'var(--pos)' : 'var(--border2)', position: 'relative', cursor: isMath ? 'not-allowed' : 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: form.is_recurring ? '23px' : '3px', transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>Automate Recurring Additions</div>
              {isMath && (
                <span title="Math assets auto-compound daily using the Interest Rate. Recurring additions are meant for Ledger/Market assets." 
                      style={{ cursor: 'help', background: 'var(--bg2)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text2)', border: '1px solid var(--border)' }}>?</span>
              )}
            </div>
          </div>

          {/* New Flexbox Recurring Section */}
          {form.is_recurring && !isMath && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1.25rem', background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '8px', animation: 'fadeIn 0.2s ease' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 100%' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>Amount to Add (₹)</label>
                <input className="inp" type="number" placeholder="0.00" value={form.amount_to_add} onChange={e => setForm({...form, amount_to_add: e.target.value})} style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>Frequency</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                   <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', borderRadius: '8px', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0 0.5rem', height: '36px', flex: '1 1 80px' }}>
                     <span style={{ fontSize: '0.8rem', color: 'var(--text2)', paddingRight: '0.5rem' }}>Every</span>
                     <input type="number" min="1" value={form.interval_value} onChange={e => setForm({...form, interval_value: parseInt(e.target.value)})} style={{ border: 'none', width: '100%', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                   </div>
                   <div style={{ flex: '1 1 140px' }}>
                     <CustomSelect 
                       value={form.interval_unit} 
                       onChange={val => setForm({...form, interval_unit: val})} 
                       options={[{label: 'Days', value: 'days'}, {label: 'Months', value: 'months'}, {label: 'Years', value: 'years'}]} 
                       placeholder="Unit"
                     />
                   </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px' }}>
                 <label style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>Next Trigger</label>
                 <input className="inp" type="date" value={form.next_run_date} onChange={e => setForm({...form, next_run_date: e.target.value})} style={{ borderColor: 'rgba(52, 211, 153, 0.3)', height: '36px' }} />
              </div>

            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button className="submit-btn" onClick={submit} style={{ flex: 1 }}>{loading ? 'Saving...' : 'Update Asset'}</button>
            <button className="submit-btn" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text)' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddManualAssetModal({ onClose, onAdd }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ 
    category: 'FD', name: '', invested_value: '', current_value: '', 
    interest_rate: '', start_date: '', maturity_date: '',
    is_recurring: false, amount_to_add: '', interval_value: 1, interval_unit: 'months', next_run_date: today
  });
  const [loading, setLoading] = useState(false);

  // 🚀 Determine the Asset Bucket to lock/unlock fields
  const isLedgerOrMarket = ['EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].includes(form.category);
  const isMath = ['FD', 'RD'].includes(form.category);

  const submit = async () => {
    if (form.is_recurring && (!form.amount_to_add || !form.next_run_date)) {
      return alert("Please fill in the recurring amount and next date.");
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/manual_assets`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(form)
      });
      if (res.ok) { onAdd(); onClose(); } 
      else {
        const errData = await res.json().catch(() => ({}));
        alert("Failed to save asset: " + (errData.message || "Server error"));
      }
    } catch (e) { alert("Network error: " + e.message); } 
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">➕ Add Asset</div></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Category</label>
            <CustomSelect 
              value={form.category} 
              onChange={val => {
                const becomingMath = ['FD', 'RD'].includes(val);
                const becomingMarket = ['EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].includes(val);
                setForm({
                  ...form, category: val,
                  interest_rate: becomingMarket ? '' : form.interest_rate,
                  is_recurring: becomingMath ? false : form.is_recurring
                });
              }} 
              options={['FD', 'EPF', 'PPF', 'NPS', 'SGB', 'RSU', 'RealEstate', 'Cash'].map(c => ({ label: c, value: c }))} 
              placeholder="Select Category" width="100%"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Asset Name</label>
            <input className="inp" placeholder="e.g., Gold, PPF" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            {/* 1. Invested Amount */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Invested Amount (₹)</label>
              <input className="inp" type="number" placeholder="0.00" value={form.invested_value} onChange={e => setForm({...form, invested_value: e.target.value})} />
            </div>
            
            {/* 2. Current Value */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Current Value (₹)</label>
              <input 
                className="inp" type="number" placeholder="0.00" 
                value={form.current_value} 
                onChange={e => setForm({...form, current_value: e.target.value})} 
                disabled={!!form.interest_rate} 
                style={{ 
                  opacity: form.interest_rate ? 0.5 : 1, 
                  cursor: form.interest_rate ? 'not-allowed' : 'text',
                  background: form.interest_rate ? 'var(--bg3)' : 'var(--card)'
                }}
              />
              {!!form.interest_rate && (
                <div style={{ position: 'absolute', right: '10px', top: '32px', fontSize: '0.65rem', color: 'var(--text3)' }}>Auto</div>
              )}
            </div>
          </div>
          
          {/* 3. Interest Rate Row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Interest Rate %</label>
                {isLedgerOrMarket && (
                  <span title="Market/Ledger assets fluctuate. Leave this blank and update Current Value manually." 
                        style={{ cursor: 'help', background: 'var(--bg3)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text2)', border: '1px solid var(--border)' }}>?</span>
                )}
             </div>
             <input className="inp" type="number" placeholder="e.g. 7.1" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})} disabled={isLedgerOrMarket} style={{ opacity: isLedgerOrMarket ? 0.3 : 1, cursor: isLedgerOrMarket ? 'not-allowed' : 'text' }} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
               <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Start Date</label>
               <input className="inp" type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} style={{ color: form.start_date ? 'var(--text)' : 'var(--text3)' }} />
               <span style={{ fontSize: '0.65rem', color: 'var(--text3)', lineHeight: '1.2' }}>Needed for auto-compound.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
               <label style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 600 }}>Maturity Date</label>
               <input className="inp" type="date" value={form.maturity_date} onChange={e => setForm({...form, maturity_date: e.target.value})} style={{ color: form.maturity_date ? 'var(--text)' : 'var(--text3)' }} />
               <span style={{ fontSize: '0.65rem', color: 'var(--text3)', lineHeight: '1.2' }}>When compounding stops.</span>
            </div>
          </div>

          {/* Automate Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.5rem', background: 'var(--bg3)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', opacity: isMath ? 0.4 : 1 }}>
            <div 
              onClick={() => !isMath && setForm({...form, is_recurring: !form.is_recurring})}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                background: form.is_recurring ? 'var(--pos)' : 'var(--border2)',
                position: 'relative', cursor: isMath ? 'not-allowed' : 'pointer', transition: 'background 0.2s', flexShrink: 0
              }}
            >
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                position: 'absolute', top: '3px', left: form.is_recurring ? '23px' : '3px',
                transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>Automate Additions</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Add amount automatically</div>
              </div>
              {isMath && (
                <span title="Math assets auto-compound daily using the Interest Rate. Recurring additions are meant for Ledger/Market assets." 
                      style={{ cursor: 'help', background: 'var(--bg2)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text2)', border: '1px solid var(--border)' }}>?</span>
              )}
            </div>
          </div>

          {/* New Flexbox Recurring Section */}
          {form.is_recurring && !isMath && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1.25rem', background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '8px', animation: 'fadeIn 0.2s ease' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 100%' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>Amount to Add (₹)</label>
                <input className="inp" type="number" placeholder="0.00" value={form.amount_to_add} onChange={e => setForm({...form, amount_to_add: e.target.value})} style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>Frequency</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                   <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', borderRadius: '8px', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0 0.5rem', height: '36px', flex: '1 1 80px' }}>
                     <span style={{ fontSize: '0.8rem', color: 'var(--text2)', paddingRight: '0.5rem' }}>Every</span>
                     <input type="number" min="1" value={form.interval_value} onChange={e => setForm({...form, interval_value: parseInt(e.target.value)})} style={{ border: 'none', width: '100%', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                   </div>
                   <div style={{ flex: '1 1 140px' }}>
                     <CustomSelect 
                       value={form.interval_unit} 
                       onChange={val => setForm({...form, interval_unit: val})} 
                       options={[{label: 'Days', value: 'days'}, {label: 'Months', value: 'months'}, {label: 'Years', value: 'years'}]} 
                       placeholder="Unit"
                     />
                   </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px' }}>
                 <label style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>Next Trigger</label>
                 <input className="inp" type="date" value={form.next_run_date} onChange={e => setForm({...form, next_run_date: e.target.value})} style={{ borderColor: 'rgba(52, 211, 153, 0.3)', height: '36px' }} />
              </div>

            </div>
          )}

          <button className="submit-btn" onClick={submit} style={{ marginTop: '0.5rem' }}>
            {loading ? 'Saving...' : 'Save Asset'}
          </button>
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

      
function BulkEditTransactionModal({ transactions, categories, onClose, onRefresh }) {
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
             <CustomSelect 
                value={row.account} 
                onChange={val => updateRow(row.id, 'account', val)} 
                options={Object.keys(BANKS).map(b => ({ label: `${BANKS[b]?.emoji} ${b}`, value: b }))} 
                minWidth="140px" 
              />
              <input type="date" className="bulk-inp" style={{ height: '36px' }} value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />
              <CustomSelect 
                value={row.type} 
                onChange={val => updateRow(row.id, 'type', val)} 
                options={[
                  { label: '🔴 Debit', value: 'Debit' },
                  { label: '🟢 Credit', value: 'Credit' },
                  { label: '💰 Savings', value: 'Savings' },
                  { label: '💸 Investment', value: 'Investment' }
                ]} 
                minWidth="130px" 
              />
              <AutocompleteInput value={row.heading} onChange={val => updateRow(row.id, 'heading', val)} options={categories} placeholder="Category" />              <input type="number" className="bulk-inp" placeholder="0.00" value={row.amount} onChange={e => updateRow(row.id, 'amount', e.target.value)} />
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
              <CustomSelect 
                value={physMonth} 
                onChange={val => setPhysMonth(parseInt(val))} 
                options={MONTHS.map((m, i) => ({ label: m, value: i }))} 
                minWidth="130px" 
              />
              <CustomSelect 
                value={physYear} 
                onChange={val => setPhysYear(parseInt(val))} 
                options={[2024, 2025, 2026].map(y => ({ label: String(y), value: y }))} 
                minWidth="100px" 
              />
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

// ─── REUSABLE MULTI-ASSET SELECT (PORTAL VERSION) ────────────────────────
function MultiAssetSelect({ selectedAssets, setSelectedAssets, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(e.target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        setDropdownStyle({
          position: 'fixed',
          top: `${rect.bottom + 4}px`,
          left: '16px',
          right: '16px',
          width: 'calc(100vw - 32px)',
          zIndex: 999999 
        });
      } else {
        const isRightSide = rect.right > window.innerWidth * 0.6;
        setDropdownStyle({
          position: 'fixed',
          top: `${rect.bottom + 4}px`,
          left: isRightSide ? 'auto' : `${rect.left}px`,
          right: isRightSide ? `${window.innerWidth - rect.right}px` : 'auto',
          minWidth: `${rect.width}px`,
          zIndex: 999999 
        });
      }
    }
    setIsOpen(!isOpen);
  };

  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={containerRef}>
      <button
        className={`filter-chip ${isOpen ? 'open' : ''} ${selectedAssets.size > 0 ? 'active' : ''}`}
        onClick={toggleDropdown}
        style={{ width: '100%', minWidth: '180px', justifyContent: 'space-between', padding: '0.45rem 0.85rem', height: '36px', borderRadius: '8px', margin: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <span>🎯</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
            {selectedAssets.size === 0 ? placeholder : `${selectedAssets.size} Selected`}
          </span>
        </div>
        <span className="chip-arrow">▼</span>
      </button>
      
      {isOpen && createPortal(
        <div className="chip-dropdown" ref={dropdownRef} style={{ ...dropdownStyle, maxHeight: '300px' }}>
          
          {/* 🚀 STICKY HEADER GROUP */}
          <div style={{ position: 'sticky', top: '-0.375rem', zIndex: 10, background: 'var(--card)', margin: '-0.375rem -0.375rem 0.2rem -0.375rem', borderRadius: '12px 12px 0 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            {options.length > 5 && (
              <div style={{ padding: '0.4rem 0.5rem' }}>
                <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="chip-search-input" onClick={e => e.stopPropagation()} />
              </div>
            )}
            {selectedAssets.size > 0 && (
              <div 
                className="chip-dropdown-item" 
                onClick={(e) => { e.stopPropagation(); setSelectedAssets(new Set()); setIsOpen(false); setSearchTerm(""); }} 
                style={{ fontWeight: 600, color: 'var(--neg)', justifyContent: 'center', borderRadius: 0, padding: '0.6rem 0.5rem', borderTop: options.length > 5 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
              >
                ✕ Clear Selection
              </div>
            )}
          </div>

          {filtered.map(sym => {
            const isSelected = selectedAssets.has(sym);
            return (
              <div 
                key={sym} 
                className="chip-dropdown-item" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  const next = new Set(selectedAssets); 
                  if (next.has(sym)) next.delete(sym); else next.add(sym); 
                  setSelectedAssets(next); 
                }} 
                style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.3' }}
              >
                {/* 4px border radius for square multi-select checkboxes */}
                <div className={`chip-checkbox ${isSelected ? 'included' : ''}`} style={{ borderRadius: '4px', flexShrink: 0, marginTop: '1px' }} />
                <span style={{ flex: 1, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--text)' : 'var(--text2)' }}>{sym}</span>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.8rem' }}>No results found</div>}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── INVEST TAB ───────────────────────────────────────────────────────────
function InvestTab({ investments, manualAssets, assetList, onAdd }) {  
  // 🚀 PIN LOCK STATES
  const [savedPin, setSavedPin] = useState(localStorage.getItem('dt_inv_pin'));
  const [isUnlocked, setIsUnlocked] = useState(sessionStorage.getItem('dt_inv_unlocked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  const [showPin, setShowPin] = useState(false);
  const inputRefs = useRef([]);

  // 🚀 GLOBAL ESCAPE: Closes Invest-level Modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setIsAddModalOpen(false);
        setEditingAsset(null);
        setDrillDownDate(null);
        setShowAssetSettings(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handlePinChange = (index, value) => {
    if (!/^[0-9]*$/.test(value)) return;
    let newPin = (pinInput || '').split('');
    while (newPin.length < 4) newPin.push('');
    newPin[index] = value;
    const resultingPin = newPin.slice(0, 4).join('');
    setPinInput(resultingPin);
    setPinError(false);

    if (value !== '' && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits are filled
    if (value !== '' && index === 3 && resultingPin.length === 4) {
      setTimeout(() => {
        // Inline the submit logic to use resultingPin directly
        if (!savedPin) {
          localStorage.setItem('dt_inv_pin', resultingPin);
          sessionStorage.setItem('dt_inv_unlocked', 'true');
          setSavedPin(resultingPin);
          setIsUnlocked(true);
        } else {
          if (resultingPin === savedPin) {
            sessionStorage.setItem('dt_inv_unlocked', 'true');
            setIsUnlocked(true);
            setPinError(false);
          } else {
            setPinError(true);
            setPinInput('');
            inputRefs.current[0]?.focus();
          }
        }
      }, 150); // Small delay for visual feedback
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && (!pinInput[index] || pinInput[index] === '') && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter') {
      handlePinSubmit();
    }
  };

  // ---> ADD THIS NEW BLOCK HERE <---
  const [xirr, setXirr] = useState(null);
  const [loadingXirr, setLoadingXirr] = useState(false);

  useEffect(() => {
    if (isUnlocked) {
      const fetchXirr = async () => {
        setLoadingXirr(true);
        try {
          const res = await fetch(`${API}/investments/xirr`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          const data = await res.json();
          if (data.success) setXirr(data.xirr);
        } catch (e) {
          console.error("Failed to fetch XIRR", e);
        } finally {
          setLoadingXirr(false);
        }
      };
      fetchXirr();
    }
  }, [isUnlocked, investments]);

  const handlePinSubmit = () => {
    if (!savedPin) {
      if (pinInput.length === 4) {
        localStorage.setItem('dt_inv_pin', pinInput);
        sessionStorage.setItem('dt_inv_unlocked', 'true');
        setSavedPin(pinInput);
        setIsUnlocked(true);
      } else {
        setPinError(true);
      }
    } else {
      if (pinInput === savedPin) {
        sessionStorage.setItem('dt_inv_unlocked', 'true');
        setIsUnlocked(true);
        setPinError(false);
      } else {
        setPinError(true);
        setPinInput('');
      }
    }
  };

  const [syncing, setSyncing] = useState(false);
  const [filterMonth, setFilterMonth] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenStr, setTokenStr] = useState("");
  const [syncingSheets, setSyncingSheets] = useState(false);
  
  // 🚀 MASTER CHART & MULTI-SELECT STATES
  const [chartCategory, setChartCategory] = useState('ALL');
  const [timeframe, setTimeframe] = useState('3M');
  const [chartMode, setChartMode] = useState('PERCENTAGE'); // 🚀 NEW: 'ABSOLUTE' or 'PERCENTAGE'
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  
  // 🚀 OPTIMIZATION: IN-MEMORY CACHE
  const assetHistoryCache = useRef({});
  const drilldownCache = useRef({});
  const [isDrillDownLoading, setIsDrillDownLoading] = useState(false);
  const [triggerRender, setTriggerRender] = useState(0); 

  // Fetch history specifically when multiple micro-assets are selected
  useEffect(() => {
    if (chartCategory === 'ALL') { setSelectedAssets(new Set()); return; }
    
    if (selectedAssets.size > 0) {
      // Find which assets we don't have cached yet
      const missing = Array.from(selectedAssets).filter(sym => !assetHistoryCache.current[sym]);
      if (missing.length > 0) {
        Promise.all(missing.map(sym =>
          fetch(`${API}/investments/history?symbol=${encodeURIComponent(sym)}&type=${chartCategory}`, { 
            headers: { 'Authorization': `Bearer ${getToken()}` } 
          }).then(r => r.json())
        )).then(results => {
          missing.forEach((sym, i) => { assetHistoryCache.current[sym] = results[i]; });
          setTriggerRender(prev => prev + 1); // Force chart to redraw with new cache
        });
      }
    }
  }, [selectedAssets, chartCategory]);
  
  const [expandedSection, setExpandedSection] = useState('MARKET');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showBalances, setShowBalances] = useState(false); 
  const [invCurrentPage, setInvCurrentPage] = useState(0); 
  const [invRowsPerPage, setInvRowsPerPage] = useState(5);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // 🚀 ASSET VISIBILITY TOGGLES
  const [hiddenCategories, setHiddenCategories] = useState(() => {
    try { 
      const stored = localStorage.getItem('dt_inv_hidden_cats');
      if (stored) return JSON.parse(stored);
      return ['PROVIDENT', 'GOLD'];
    }
    catch { return ['PROVIDENT', 'GOLD']; }
  });
  const [showAssetSettings, setShowAssetSettings] = useState(false);

  const ASSET_CATEGORIES = [
    { id: 'EQUITY', label: 'Stocks', field_curr: 'curr_stocks', field_inv: 'inv_stocks', color: '#6366f1', icon: '📈' },
    { id: 'MF', label: 'Mutual Funds', field_curr: 'curr_mf', field_inv: 'inv_mf', color: '#8b5cf6', icon: '🏦' },
    { id: 'FIXED_INCOME', label: 'Fixed Deposits', field_curr: 'curr_fixed', field_inv: 'inv_fixed', color: '#10b981', icon: '💰' },
    { id: 'PROVIDENT', label: 'Retirement', field_curr: 'curr_prov', field_inv: 'inv_prov', color: '#f59e0b', icon: '🛡️' },
    { id: 'GOLD', label: 'Gold', field_curr: 'curr_gold', field_inv: 'inv_gold', color: '#eab308', icon: '🥇' },
  ];

  const toggleCategory = (catId) => {
    setHiddenCategories(prev => {
      const next = prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId];
      localStorage.setItem('dt_inv_hidden_cats', JSON.stringify(next));
      return next;
    });
  };
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDeleteManualAsset = async (id) => {
    if (!window.confirm("Are you sure you want to delete this asset?")) return;
    try {
      const res = await fetch(`${API}/manual_assets/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
      if (res.ok) onAdd();
    } catch(e) { alert("Error deleting asset: " + e.message); }
  };
  
  const [drillDownDate, setDrillDownDate] = useState(null);
  const [drillDownData, setDrillDownData] = useState([]);
  const [drillDownType, setDrillDownType] = useState(null);
  const [drillSortBy, setDrillSortBy] = useState("symbol");
  const [drillSortDir, setDrillSortDir] = useState("asc");
  const [viewMode, setViewMode] = useState("ALL");

  // 🚀 COMPARISON STATES
  const [drillDownCompareDate, setDrillDownCompareDate] = useState(null);
  const [drillDownCompareData, setDrillDownCompareData] = useState([]);
  const [isCompareLoading, setIsCompareLoading] = useState(false);

  // Reusable Diff Badge for the UI
  const DiffBadge = ({ diff, isCurrency = true, isPct = false }) => {
    if (!diff || Math.abs(diff) < 0.01) return <span style={{fontSize:'0.65rem', color:'var(--text3)'}}>= No Change</span>;
    const isPos = diff > 0;
    const formatted = isPct ? diff.toFixed(2) + '%' : (isCurrency ? '₹' + Math.abs(diff).toLocaleString('en-IN', {maximumFractionDigits:2}) : Math.abs(diff).toFixed(2));
    return (
      <span className={isPos ? 'pos' : 'neg'} style={{fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', background: isPos ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content'}}>
        {isPos ? '▲' : '▼'} {formatted}
      </span>
    );
  };
  
  // 🚀 DYNAMIC CHART DATA PROCESSOR (Handles Multi-Line Overlaps & Percentages)
  const chartData = useMemo(() => {
    let data = [];
    
    if (selectedAssets.size > 0) {
      // 1. MULTI-LINE MODE: Merge cached timelines
      let dates = new Set();
      const assetsData = {};
      
      selectedAssets.forEach(sym => {
         const history = assetHistoryCache.current[sym] || [];
         history.forEach(d => {
            dates.add(d.date);
            if (!assetsData[d.date]) assetsData[d.date] = { date: formatDate(d.date), rawDate: new Date(d.date) };
            assetsData[d.date][sym] = d.Current; 
            assetsData[d.date][`${sym}_Inv`] = d.Invested; // Hidden field for tooltip math
            assetsData[d.date][`${sym}_Pct`] = d.Invested > 0 ? ((d.Current - d.Invested) / d.Invested) * 100 : 0; // 🚀 Calculate % Return
         });
      });
      data = Array.from(dates).sort((a,b) => new Date(a) - new Date(b)).map(d => assetsData[d]);
      
    } else {
      // 2. CATEGORY TOTALS MODE
      let baseData = [...investments].reverse();
      if (!baseData || baseData.length === 0) return [];
      data = baseData.map(d => {
         let curr = 0; let inv = 0;
         if (chartCategory === 'ALL') { curr = d.total_curr; inv = d.total_inv; }
         else if (chartCategory === 'EQUITY') { curr = d.curr_stocks; inv = d.inv_stocks; }
         else if (chartCategory === 'MF') { curr = d.curr_mf; inv = d.inv_mf; }
         else if (chartCategory === 'PROVIDENT') { curr = d.curr_prov; inv = d.inv_prov; }
         else if (chartCategory === 'FIXED_INCOME') { curr = d.curr_fixed; inv = d.inv_fixed; }
         else if (chartCategory === 'GOLD') { curr = d.curr_gold; inv = d.inv_gold; }
         
         const pct = inv > 0 ? ((curr - inv) / inv) * 100 : 0;
         return { date: formatDate(d.date), rawDate: new Date(d.date), Current: curr || 0, Invested: inv || 0, ReturnPct: pct };
      });
    }
    
    // 3. APPLY TIMEFRAME
    if (timeframe !== 'ALL') {
      const now = new Date();
      let cutoffDate = new Date();
      if (timeframe === '1M') cutoffDate.setMonth(now.getMonth() - 1);
      else if (timeframe === '3M') cutoffDate.setMonth(now.getMonth() - 3);
      else if (timeframe === '6M') cutoffDate.setMonth(now.getMonth() - 6);
      else if (timeframe === '1Y') cutoffDate.setFullYear(now.getFullYear() - 1);
      else if (timeframe === 'YTD') cutoffDate = new Date(now.getFullYear(), 0, 1);
      data = data.filter(d => d.rawDate >= cutoffDate);
    }
    return data;
  }, [investments, chartCategory, timeframe, selectedAssets, triggerRender]);

// 🚀 HIGH-CONTRAST PALETTE FOR MULTI-LINES
  const PIE_COLORS = [
    "#6366f1", // Indigo
    "#f59e0b", // Amber
    "#10b981", // Emerald
    "#ec4899", // Pink
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#a855f7", // Purple
    "#84cc16", // Lime
    "#ef4444", // Red
    "#3b82f6"  // Blue
  ];

  // 🚀 UPGRADED TOOLTIP (Supports 10+ Multi-lines)
  const CustomInvestTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', minWidth: '220px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '10px', fontWeight: 600 }}>{label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {payload.map((p, i) => {
               const sym = p.name;
               const curr = p.value || 0;
               const inv = selectedAssets.size > 0 ? (p.payload[`${sym}_Inv`] || 0) : (payload.find(x => x.dataKey === 'Invested')?.value || 0);
               const retAmt = curr - inv;
               const isPos = retAmt >= 0;
               const pct = selectedAssets.size > 0 ? (inv > 0 ? (retAmt / inv) * 100 : 0) : (payload[0].payload.ReturnPct || 0);
               
               // If in single mode, skip drawing the "Invested Amount" block as its own entity since we merge it above
               if (selectedAssets.size === 0 && sym === 'Invested Amount') return null;

               return (
                  <div key={sym} style={{ borderBottom: (selectedAssets.size > 0 && i < payload.length - 1) ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: (selectedAssets.size > 0 && i < payload.length - 1) ? '8px' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }}></div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>{sym === 'Current Value' ? 'Total Portfolio' : sym}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                      <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>Current:</span>
                      <span style={{ color: 'var(--text)', fontWeight: 700 }}>{showBalances ? `₹${curr.toLocaleString('en-IN', {maximumFractionDigits:0})}` : '₹ ••••••'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                      <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>Return:</span>
                      <span className={isPos ? 'pos' : 'neg'} style={{ fontWeight: 600, fontSize: '0.75rem' }}>
                        {isPos ? '+' : '-'}{showBalances ? `₹${Math.abs(retAmt).toLocaleString('en-IN', {maximumFractionDigits:0})}` : '₹ ••••••'} ({Math.abs(pct).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
               )
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  // 🚀 OPTIMIZED DRILL-DOWN FETCHER (Instant Caching)
  const fetchDrillDownData = async (dateStr, type) => {
    const cacheKey = `${dateStr}_${type}`;
    if (drilldownCache.current[cacheKey]) {
      setDrillDownData(drilldownCache.current[cacheKey]);
      setDrillDownType(type);
      setDrillDownDate(dateStr);
      setDrillSortBy("symbol"); setDrillSortDir("asc");
      return;
    }
    
    setIsDrillDownLoading(true);
    setDrillDownType(type);
    setDrillDownDate(dateStr);
    
    try {
      const endpoint = type === "EQUITY" ? "equity_holdings" : "holdings";
      const res = await fetch(`${API}/investments/${dateStr}/${endpoint}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      
      const dataWithRet = data.map(d => ({
        ...d,
        ret_pct: d.ret_pct !== undefined ? d.ret_pct : (d.invested_value > 0 ? ((d.current_value - d.invested_value) / d.invested_value) * 100 : 0)
      }));
      
      drilldownCache.current[cacheKey] = dataWithRet;
      setDrillDownData(dataWithRet);
      setDrillSortBy("symbol"); setDrillSortDir("asc");
    } catch(e) {
      console.error(e);
    } finally {
      setIsDrillDownLoading(false);
    }
  };

  const fetchCompareData = async (dateStr, type) => {
    if (!dateStr) { setDrillDownCompareDate(null); setDrillDownCompareData([]); return; }
    const cacheKey = `${dateStr}_${type}`;
    if (drilldownCache.current[cacheKey]) {
      setDrillDownCompareData(drilldownCache.current[cacheKey]); setDrillDownCompareDate(dateStr); return;
    }
    setIsCompareLoading(true); setDrillDownCompareDate(dateStr);
    try {
      const endpoint = type === "EQUITY" ? "equity_holdings" : "holdings";
      const res = await fetch(`${API}/investments/${dateStr}/${endpoint}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      const dataWithRet = data.map(d => ({ ...d, ret_pct: d.ret_pct !== undefined ? d.ret_pct : (d.invested_value > 0 ? ((d.current_value - d.invested_value) / d.invested_value) * 100 : 0) }));
      drilldownCache.current[cacheKey] = dataWithRet;
      setDrillDownCompareData(dataWithRet);
    } catch(e) { console.error(e); } finally { setIsCompareLoading(false); }
  };

  const openDrillDown = (dateStr) => {
    fetchDrillDownData(dateStr, 'EQUITY');
    
    const currentDate = new Date(dateStr);
    const earlierDates = investments
      .map(inv => inv.date.split('T')[0])
      .filter(dt => new Date(dt) < currentDate)
      .sort((a, b) => new Date(b) - new Date(a));
      
    if (earlierDates.length > 0) {
      const prevDate = earlierDates[0];
      setDrillDownCompareDate(prevDate);
      fetchCompareData(prevDate, 'EQUITY');
    } else {
      setDrillDownCompareDate(null);
      setDrillDownCompareData([]);
    }
  };

  const handleDrillSort = (col) => {
    if (drillSortBy === col) setDrillSortDir(drillSortDir === 'asc' ? 'desc' : 'asc');
    else { setDrillSortBy(col); setDrillSortDir('desc'); }
  };

  // 🚀 MERGED COMPARISON ENGINE
  const comparisonData = useMemo(() => {
    if (!drillDownCompareDate) return null;
    const mapB = {}; // Baseline (Older Date)
    drillDownCompareData.forEach(item => { mapB[item.symbol] = item; });
    const mapA = {}; // Target (Newer Date)
    drillDownData.forEach(item => { mapA[item.symbol] = item; });
    
    const allSymbols = Array.from(new Set([...Object.keys(mapA), ...Object.keys(mapB)]));
    return allSymbols.map(sym => {
      const a = mapA[sym] || { quantity: 0, invested_value: 0, current_value: 0, average_price: 0, ltp: 0, nav: 0, ret_pct: 0 };
      const b = mapB[sym] || { quantity: 0, invested_value: 0, current_value: 0, average_price: 0, ltp: 0, nav: 0, ret_pct: 0 };
      const priceA = drillDownType === 'EQUITY' ? a.ltp : a.nav;
      const priceB = drillDownType === 'EQUITY' ? b.ltp : b.nav;
      return {
        symbol: sym,
        qty_A: a.quantity, qty_diff: a.quantity - b.quantity, is_new: b.quantity === 0 && a.quantity > 0, is_exited: a.quantity === 0 && b.quantity > 0,
        price_A: priceA, price_diff: priceA - priceB,
        inv_A: a.invested_value, inv_diff: a.invested_value - b.invested_value,
        curr_A: a.current_value, curr_diff: a.current_value - b.current_value,
        ret_A: a.current_value - a.invested_value, ret_diff: (a.current_value - a.invested_value) - (b.current_value - b.invested_value),
        sort_val: a.current_value > 0 ? a.current_value : b.current_value
      };
    }).sort((x, y) => y.sort_val - x.sort_val);
  }, [drillDownData, drillDownCompareData, drillDownCompareDate, drillDownType]);

  // 🚀 COMPARISON SUMMARY TOTALS
  const comparisonSummary = useMemo(() => {
    if (!comparisonData || !drillDownCompareDate) return null;
    const totals = comparisonData.reduce((acc, h) => {
      acc.inv_A += h.inv_A;
      acc.curr_A += h.curr_A;
      acc.inv_B += (h.inv_A - h.inv_diff);  // B = A - diff
      acc.curr_B += (h.curr_A - h.curr_diff);
      return acc;
    }, { inv_A: 0, curr_A: 0, inv_B: 0, curr_B: 0 });
    totals.ret_A = totals.curr_A - totals.inv_A;
    totals.ret_B = totals.curr_B - totals.inv_B;
    totals.inv_diff = totals.inv_A - totals.inv_B;
    totals.curr_diff = totals.curr_A - totals.curr_B;
    totals.ret_diff = totals.ret_A - totals.ret_B;
    totals.ret_pct_A = totals.inv_A > 0 ? (totals.ret_A / totals.inv_A) * 100 : 0;
    totals.ret_pct_B = totals.inv_B > 0 ? (totals.ret_B / totals.inv_B) * 100 : 0;
    totals.stocks_new = comparisonData.filter(h => h.is_new).length;
    totals.stocks_exited = comparisonData.filter(h => h.is_exited).length;
    totals.total_stocks = comparisonData.length;
    return totals;
  }, [comparisonData, drillDownCompareDate]);

  const availableCompareDates = useMemo(() => {
    if (!drillDownDate) return [];
    return investments.filter(inv => inv.date.split('T')[0] !== drillDownDate).map(inv => ({ 
      label: formatDate(inv.date), value: inv.date.split('T')[0], rawDate: new Date(inv.date)
    })).sort((a, b) => b.rawDate - a.rawDate);
  }, [investments, drillDownDate]);

  const processedDrillDownData = useMemo(() => {
    let data = [...drillDownData];
    data.sort((a, b) => {
      let aVal = a[drillSortBy]; let bVal = b[drillSortBy];
      if (drillSortBy === 'price') {
         aVal = drillDownType === "EQUITY" ? a.ltp : a.nav;
         bVal = drillDownType === "EQUITY" ? b.ltp : b.nav;
      }
      if (typeof aVal === 'string') return drillSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return drillSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [drillDownData, drillSortBy, drillSortDir, drillDownType]);

  const allMonths = useMemo(() => {
    return [...new Set(investments.map(inv => {
      if (!inv.date) return null;
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))].filter(Boolean).sort().reverse().map(ym => {
      const [y, m] = ym.split('-');
      const d = new Date(y, m - 1, 1);
      return { val: ym, label: `${d.toLocaleString('default', { month: 'long' })} ${y}` };
    });
  }, [investments]);

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
      const getVal = (item, key) => {
         if (key === 'date') return new Date(item.date).getTime();
         const invVal = viewMode === 'ALL' ? parseFloat(item.total_inv || 0) : viewMode === 'EQUITY' ? parseFloat(item.inv_stocks || 0) : parseFloat(item.inv_mf || 0);
         const currVal = viewMode === 'ALL' ? parseFloat(item.total_curr || 0) : viewMode === 'EQUITY' ? parseFloat(item.curr_stocks || 0) : parseFloat(item.curr_mf || 0);
         const retPct = viewMode === 'ALL' ? parseFloat(item.total_ret_pct || 0) : viewMode === 'EQUITY' ? parseFloat(item.ret_pct_stocks || 0) : parseFloat(item.ret_pct_mf || 0);
         const statusStr = viewMode === 'ALL' ? item.total_status : viewMode === 'EQUITY' ? item.status_stocks : item.status_mf;
         
         if (key === 'inv') return invVal; if (key === 'curr') return currVal;
         if (key === 'ret_amount') return currVal - invVal; if (key === 'ret_pct') return retPct;
         if (key === 'status') return statusStr; return 0;
      };
      const aVal = getVal(a, sortBy); const bVal = getVal(b, sortBy);
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [investments, filterMonth, sortBy, sortDir, viewMode]);

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const handleOpenKite = () => { window.open("https://kite.zerodha.com/connect/LOGIN?api_key=6gcxnf0qycaphw5k", "_blank", "width=500,height=600"); setShowTokenInput(true); };
  
  const handleSubmitToken = async () => {
    let token = tokenStr.trim();
    if (token.includes("request_token=")) {
      const match = token.match(/request_token=([^&]+)/);
      if (match) token = match[1];
    }
    if (!token) return alert("❌ Please paste the full URL containing the request_token.");
    setSyncing(true);
    try {
      const res = await fetch(`${API}/sync/kite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ request_token: token }) });
      const data = await res.json();
      if (data.success) { alert("✅ " + data.message); onAdd(); setShowTokenInput(false); setTokenStr(""); } 
      else alert("❌ Sync Failed: " + data.message);
    } catch (e) { alert("❌ Network Error: " + e.message); } 
    finally { setSyncing(false); }
  };

  const handleSyncToSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch(`${API}/sync/investments-to-sheets`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      alert(data.success ? (data.message.includes("No new") ? "👍 " + data.message : "✅ " + data.message) : "❌ Sync Failed: " + data.message);
    } catch (e) { alert("❌ Network Error: " + e.message); } 
    finally { setSyncingSheets(false); }
  };

  const invTotalPages = Math.ceil(processedData.length / invRowsPerPage);
  const invPaginatedRows = processedData.slice(invCurrentPage * invRowsPerPage, (invCurrentPage + 1) * invRowsPerPage);
  useEffect(() => { setInvCurrentPage(0); }, [filterMonth, sortBy, sortDir, viewMode]);

  const latest = investments.length > 0 ? investments[0] : null;

  // 🚀 FILTERED TOTALS (Respects hidden categories)
  const filteredTotals = useMemo(() => {
    if (!latest) return { curr: 0, inv: 0, ret: 0, retPct: 0 };
    let curr = 0, inv = 0;
    ASSET_CATEGORIES.forEach(cat => {
      if (!hiddenCategories.includes(cat.id)) {
        curr += parseFloat(latest[cat.field_curr] || 0);
        inv += parseFloat(latest[cat.field_inv] || 0);
      }
    });
    const ret = curr - inv;
    const retPct = inv > 0 ? (ret / inv) * 100 : 0;
    return { curr, inv, ret, retPct };
  }, [latest, hiddenCategories]);

  const pieData = latest ? ASSET_CATEGORIES
    .filter(cat => !hiddenCategories.includes(cat.id))
    .map(cat => ({ name: cat.label, value: parseFloat(latest[cat.field_curr] || 0), fill: cat.color }))
    .filter(d => d.value > 0) : [];

  return (
    <div style={{ position: 'relative', minHeight: '80vh' }}>
      
      {/* 🚀 THE PIN LOCK OVERLAY (Now Perfectly Centered) */}
      {!isUnlocked && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8, 11, 18, 0.3)' // Dark tint over the whole screen
        }}>
          <div style={{ background: 'var(--card)', padding: '2.5rem 2rem', borderRadius: '20px', border: '1px solid var(--border)', textAlign: 'center', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', width: '90%', maxWidth: '360px', animation: 'slideUp 0.3s ease' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', lineHeight: 1 }}>🔒</div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", margin: '0 0 0.5rem 0', color: 'var(--text)', fontSize: '1.4rem' }}>
              {savedPin ? 'Enter PIN' : 'Set up a PIN'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '2rem' }}>
              {savedPin ? 'Unlock your investment portfolio.' : 'Protect your assets with a 4-digit PIN.'}
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                {[0, 1, 2, 3].map((index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type={showPin ? "text" : "password"}
                    maxLength={1}
                    value={pinInput[index] || ''}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    style={{
                      background: 'var(--bg3)',
                      border: `2px solid ${pinError ? 'var(--neg)' : 'var(--border)'}`,
                      color: 'var(--text)',
                      fontSize: '1.8rem',
                      padding: '0.75rem 0',
                      borderRadius: '12px',
                      width: '52px',
                      textAlign: 'center',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      fontFamily: 'monospace'
                    }}
                    autoFocus={index === 0}
                  />
                ))}
              </div>
              <button 
                onClick={() => setShowPin(!showPin)}
                style={{ 
                  background: 'transparent', border: 'none', color: 'var(--text3)', 
                  fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' 
                }}
              >
                {showPin ? 'Hide PIN' : 'Show PIN'}
              </button>
            </div>
            {pinError && <div style={{ color: 'var(--neg)', fontSize: '0.8rem', marginTop: '0.75rem', fontWeight: 600 }}>{savedPin ? 'Incorrect PIN' : 'PIN must be exactly 4 digits'}</div>}
            
            <button
              onClick={handlePinSubmit}
              style={{ width: '100%', marginTop: '2rem', background: 'linear-gradient(135deg, var(--accent), var(--accent3))', color: '#fff', border: 'none', padding: '1rem', borderRadius: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', transition: 'transform 0.2s', boxShadow: '0 8px 20px rgba(99,102,241,0.3)' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              {savedPin ? 'Unlock Portfolio' : 'Save & Lock'}
            </button>
            
            {savedPin && (
              <div 
                onClick={() => { 
                  if(window.confirm('Forgot your PIN? This will sign you out to verify your identity.')) { 
                    localStorage.removeItem('dt_inv_pin'); 
                    localStorage.removeItem('dt_token'); // Kills the session
                    window.location.reload(); // Forces back to Google Login page
                  } 
                }}
                style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '1.25rem', cursor: 'pointer', textDecoration: 'underline', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
              >
                Forgot PIN?
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🚀 BLUR WRAPPER AROUND EXISTING CONTENT */}
      <div className="invest-layout" style={{ 
        display: 'block', 
        filter: !isUnlocked ? 'blur(12px) grayscale(50%)' : 'none', 
        pointerEvents: !isUnlocked ? 'none' : 'auto', 
        userSelect: !isUnlocked ? 'none' : 'auto', 
        transition: 'filter 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: !isUnlocked ? 0.4 : 1
      }}>
        
        {/* 🚀 NEW HERO SECTION: Metrics & Allocation */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Summary Metrics Card */}
        <div style={{ flex: '1 1 320px', background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Combined Net Worth</span>
                  {hiddenCategories.length > 0 && (
                    <span className="filtered-badge">
                      ⚡ Filtered ({ASSET_CATEGORIES.length - hiddenCategories.length}/{ASSET_CATEGORIES.length})
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(1.4rem, 7vw, 2.8rem)', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                  {showBalances ? fmt(filteredTotals.curr) : '₹ ••••••'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginTop: '-4px' }}>
                <button 
                  onClick={() => setShowAssetSettings(!showAssetSettings)}
                  style={{ 
                    background: showAssetSettings ? 'rgba(99,102,241,0.15)' : 'transparent', 
                    border: showAssetSettings ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent', 
                    cursor: 'pointer', fontSize: '1.1rem', padding: '0.35rem', 
                    opacity: showAssetSettings ? 1 : 0.7, transition: 'all 0.2s', 
                    borderRadius: '8px', position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => { if (!showAssetSettings) e.currentTarget.style.opacity = 0.7; }}
                  title="Configure Net Worth Categories"
                >
                  ⚙️
                  {hiddenCategories.length > 0 && (
                    <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--card)' }} />
                  )}
                </button>
                <button 
                  onClick={() => setShowBalances(!showBalances)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.3rem', padding: '0.4rem', opacity: 0.7, transition: 'opacity 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                  title={showBalances ? "Hide Balances" : "Show Balances"}
                >
                  {showBalances ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* 🚀 ASSET VISIBILITY SETTINGS PANEL */}
            {showAssetSettings && (
              <div className="asset-settings-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Include in Net Worth</span>
                  <button 
                    onClick={() => {
                      if (hiddenCategories.length > 0) {
                        setHiddenCategories([]);
                        localStorage.setItem('dt_inv_hidden_cats', '[]');
                      } else {
                        const allIds = ASSET_CATEGORIES.map(c => c.id);
                        setHiddenCategories(allIds);
                        localStorage.setItem('dt_inv_hidden_cats', JSON.stringify(allIds));
                      }
                    }}
                    style={{ fontSize: '0.7rem', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  >
                    {hiddenCategories.length > 0 ? 'Show All' : 'Hide All'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {ASSET_CATEGORIES.map(cat => {
                    const isVisible = !hiddenCategories.includes(cat.id);
                    const catValue = latest ? parseFloat(latest[cat.field_curr] || 0) : 0;
                    return (
                      <div 
                        key={cat.id} 
                        className="asset-setting-row"
                        onClick={() => toggleCategory(cat.id)}
                        style={{ opacity: isVisible ? 1 : 0.5 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: cat.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isVisible ? 'var(--text)' : 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.2s', textDecoration: isVisible ? 'none' : 'line-through' }}>
                            {cat.icon} {cat.label}
                          </span>
                          {showBalances && catValue > 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 500, flexShrink: 0 }}>
                              {fmt(catValue)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCategory(cat.id); }}
                          style={{
                            width: '40px', height: '22px', borderRadius: '11px',
                            background: isVisible ? 'var(--pos)' : 'var(--border2)',
                            position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.25s',
                            flexShrink: 0
                          }}
                        >
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: '3px',
                            left: isVisible ? '21px' : '3px',
                            transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
                          }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', background: 'var(--bg2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Total Invested</span>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', marginTop: '2px' }}>
                  {showBalances ? fmt(filteredTotals.inv) : '₹ ••••••'}
                </div>
              </div>
              <div style={{ width: '1px', background: 'var(--border)' }}></div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Returns & XIRR</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '2px', flexWrap: 'wrap' }}>
                  <span className={filteredTotals.ret >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                    {showBalances ? (filteredTotals.ret >= 0 ? '+' : '-') + fmt(Math.abs(filteredTotals.ret)) : '₹ ••••••'}
                  </span>
                  <span className={filteredTotals.retPct >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.85rem', opacity: 0.9 }}>
                    {latest ? `(${filteredTotals.retPct >= 0 ? '+' : '-'}${Math.abs(filteredTotals.retPct).toFixed(2)}% Abs)` : ''}
                  </span>
                  
                  {/* ---> NEW XIRR BADGE <--- */}
                  {xirr !== null && (
                    <span className={xirr >= 0 ? 'pos' : 'neg'} style={{ 
                      fontWeight: 700, fontSize: '0.75rem', 
                      background: xirr >= 0 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)', 
                      padding: '0.2rem 0.5rem', borderRadius: '6px', border: `1px solid ${xirr >= 0 ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
                      marginLeft: '4px'
                    }}>
                      {loadingXirr ? '⏳' : `${xirr >= 0 ? '+' : ''}${xirr}% XIRR`}
                    </span>
                  )}
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
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%', animation: 'fadeIn 0.3s ease', flexWrap: 'wrap' }}>
                  <input className="inp" placeholder="Paste request_token URL..." value={tokenStr} onChange={e => setTokenStr(e.target.value)} style={{ flex: '1 1 200px' }} />
                  <button className="action-btn" onClick={handleSubmitToken} disabled={syncing}>{syncing ? '⏳' : 'Sync'}</button>
                  <button className="action-btn secondary" onClick={() => { setShowTokenInput(false); setTokenStr(""); }}>✕</button>
                </div>
             )}
          </div>
        </div>

        {/* Allocation Donut Card - Mobile Wrapped */}
        <div style={{ flex: '1.2 1 320px', background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '220px', height: '220px', position: 'relative', flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={75} outerRadius={105} paddingAngle={3} cornerRadius={6} stroke="none">
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
          
          {/* Legend - Responsive Flex layout */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', width: '100%', maxWidth: '900px' }}>
            {pieData.map(d => {
              const pct = filteredTotals.curr > 0 ? ((d.value / filteredTotals.curr) * 100).toFixed(1) : 0;
              return (
                <div key={d.name} style={{ flex: '1 1 220px', maxWidth: '300px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.7rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', gap: '12px', transition: 'all 0.2s', cursor: 'default' }}
                     onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                     onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}>
                  
                  {/* Left Side: Name - Allows shrinking and ellipses */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: d.fill, flexShrink: 0 }}></div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                  </div>
                  
                  {/* Right Side: Values - Protected from shrinking */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: 'clamp(0.9rem, 1.5vw, 1.05rem)', fontWeight: 700, color: 'var(--text)', fontFamily: "'Syne', sans-serif", whiteSpace: 'nowrap' }}>
                      {showBalances ? fmt(d.value) : '₹ ••••••'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600, minWidth: '38px', textAlign: 'right' }}>
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
        
        {/* Chart Header & Time/Mode Toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="section-title" style={{ margin: 0, border: 'none' }}>📈 Investment Analyser</h3>
          
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {/* 🚀 NEW: Chart Mode Toggle */}
            <div style={{ display: 'flex', gap: '0.3rem', background: 'var(--bg2)', padding: '0.3rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
              {['ABSOLUTE', 'PERCENTAGE'].map(mode => (
                <button 
                  key={mode}
                  onClick={() => setChartMode(mode)}
                  style={{
                    background: chartMode === mode ? 'var(--card)' : 'transparent',
                    color: chartMode === mode ? 'var(--text)' : 'var(--text3)',
                    border: chartMode === mode ? '1px solid var(--border2)' : '1px solid transparent',
                    padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: chartMode === mode ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {mode === 'ABSOLUTE' ? '₹ Value' : '% Return'}
                </button>
              ))}
            </div>

            {/* Timeframe Toggle */}
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
        </div>

        {/* Category Toggles & Multi-Asset Filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', flex: '1 1 auto' }}>
            {[
              { id: 'ALL', label: 'Overall' },
              { id: 'EQUITY', label: 'Stocks' },
              { id: 'MF', label: 'Mutual Funds' },
              { id: 'PROVIDENT', label: 'Retirement' },
              { id: 'FIXED_INCOME', label: 'Fixed Deposits' },
              { id: 'GOLD', label: 'Gold' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setChartCategory(cat.id)}
                style={{
                  flexShrink: 0, padding: '0.45rem 1.25rem', borderRadius: '999px', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  background: chartCategory === cat.id ? 'var(--accent)' : 'transparent',
                  color: chartCategory === cat.id ? '#fff' : 'var(--text2)',
                  border: chartCategory === cat.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  boxShadow: chartCategory === cat.id ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 🚀 MULTI-ASSET CUSTOM SELECTOR */}
          {chartCategory !== 'ALL' && assetList && assetList[chartCategory] && assetList[chartCategory].length > 0 && (
            <div style={{ flex: '1 1 auto', minWidth: '200px', maxWidth: '300px' }}>
              <MultiAssetSelect
                selectedAssets={selectedAssets}
                setSelectedAssets={setSelectedAssets}
                options={assetList[chartCategory]}
                placeholder="All Assets"
              />
            </div>
          )}
        </div>

        {/* The Recharts Graph */}
        <div style={{ height: '350px', width: '100%', marginTop: '0.5rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--text3)" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis 
                stroke="var(--text3)" 
                fontSize={11} 
                tickFormatter={v => chartMode === 'PERCENTAGE' ? `${v.toFixed(0)}%` : `₹${(v/1000).toFixed(0)}k`} 
                axisLine={false} 
                tickLine={false} 
                domain={['auto', 'auto']} 
              />
              {/* 🚀 DYNAMIC TOOLTIP: Renders Both Metrics Gracefully */}
              <Tooltip 
                cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '5 5' }} 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', minWidth: '220px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '10px', fontWeight: 600 }}>{label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {payload.map((p, i) => {
                             // 🚀 NEW: Ignore the dotted "Invested" line so we don't get duplicate tooltip blocks
                             if (p.dataKey && p.dataKey.endsWith('_Inv')) return null;

                             let sym = p.name;
                             let curr = 0, inv = 0, pct = 0, retAmt = 0;
                             
                             if (selectedAssets.size > 0) {
                               sym = p.dataKey.replace('_Pct', ''); 
                               curr = p.payload[sym] || 0;
                               inv = p.payload[`${sym}_Inv`] || 0;
                               pct = p.payload[`${sym}_Pct`] || 0;
                             } else {
                               if (i > 0) return null; // Avoid duplicate tooltip rows for single mode
                               curr = p.payload.Current || 0;
                               inv = p.payload.Invested || 0;
                               pct = p.payload.ReturnPct || 0;
                               sym = "Total Portfolio";
                             }
                             retAmt = curr - inv;
                             const isPos = retAmt >= 0;

                             return (
                                <div key={sym} style={{ borderBottom: (selectedAssets.size > 0 && i < payload.length - 1) ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: (selectedAssets.size > 0 && i < payload.length - 1) ? '8px' : '0' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }}></div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>{sym}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                    <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>Current:</span>
                                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>{showBalances ? `₹${curr.toLocaleString('en-IN', {maximumFractionDigits:0})}` : '₹ ••••••'}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                    <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>Return:</span>
                                    <span className={isPos ? 'pos' : 'neg'} style={{ fontWeight: 600, fontSize: '0.75rem' }}>
                                      {isPos ? '+' : '-'}{showBalances ? `₹${Math.abs(retAmt).toLocaleString('en-IN', {maximumFractionDigits:0})}` : '₹ ••••••'} ({Math.abs(pct).toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>
                             )
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }} 
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
              
              {/* 🚀 DYNAMIC LINES BASED ON MODE */}
              {selectedAssets.size > 0 ? (
                <>
                  {Array.from(selectedAssets).map((sym, i) => (
                    <Line 
                      key={sym} 
                      type="monotone" 
                      name={sym} 
                      dataKey={chartMode === 'PERCENTAGE' ? `${sym}_Pct` : sym} 
                      stroke={PIE_COLORS[i % PIE_COLORS.length]} 
                      strokeWidth={3} 
                      dot={chartData.length <= 1} 
                      activeDot={{ r: 6, strokeWidth: 0 }} 
                      animationDuration={800} 
                    />
                  ))}
                  {/* 🚀 NEW: If exactly ONE asset is selected and we are in ₹ Value mode, show the dotted Invested line! */}
                  {selectedAssets.size === 1 && chartMode !== 'PERCENTAGE' && (
                    <Line 
                      key={`${Array.from(selectedAssets)[0]}_Inv`} 
                      type="monotone" 
                      name="Invested Amount" 
                      dataKey={`${Array.from(selectedAssets)[0]}_Inv`} 
                      stroke="var(--text3)" 
                      strokeWidth={2} 
                      strokeDasharray="5 5" 
                      dot={chartData.length <= 1} 
                      activeDot={false} 
                      animationDuration={800} 
                    />
                  )}
                </>
              ) : (
                chartMode === 'PERCENTAGE' ? (
                  <Line type="monotone" name="Return %" dataKey="ReturnPct" stroke="var(--accent)" strokeWidth={3} dot={chartData.length <= 1} activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }} animationDuration={800} />
                ) : (
                  <>
                    <Line type="monotone" name="Current Value" dataKey="Current" stroke="var(--accent)" strokeWidth={3} dot={chartData.length <= 1} activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }} animationDuration={800} />
                    <Line type="monotone" name="Invested Amount" dataKey="Invested" stroke="var(--text3)" strokeWidth={2} strokeDasharray="5 5" dot={chartData.length <= 1} activeDot={false} animationDuration={800} />
                  </>
                )
              )}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  {section.id === 'MARKET' && (
                    <button 
                      onClick={(e) => {
                         e.stopPropagation();
                         if (investments && investments.length >= 2) {
                           const latestDate = investments[0].date.split('T')[0];
                           const previousDate = investments[1].date.split('T')[0];
                           setDrillDownDate(latestDate);
                           setDrillDownCompareDate(previousDate);
                           fetchDrillDownData(latestDate, 'EQUITY');
                           fetchCompareData(previousDate, 'EQUITY');
                         } else if (investments && investments.length === 1) {
                           const latestDate = investments[0].date.split('T')[0];
                           setDrillDownDate(latestDate);
                           fetchDrillDownData(latestDate, 'EQUITY');
                         }
                      }}
                      className="action-btn secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}
                      title="Compare Snapshots"
                    >
                      <span style={{ fontSize: '0.85rem' }}>⚖️</span>
                      <span className="manage-btn-text">Compare</span>
                    </button>
                  )}
                  <span className={`analyser-chevron ${expandedSection === section.id ? 'open' : ''}`}>▼</span>
                </div>
              </div>

              {expandedSection === section.id && (
                <div className="analyser-body" style={{ padding: '1.5rem', animation: 'fadeIn 0.2s ease' }}>
                  
                  {section.id === "MARKET" ? (
                    /* 🚀 UPGRADED MARKET CARDS (Mobile-First Layout) */
                    <div>
                      {!isMobile ? (
                        /* 🖥️ DESKTOP: Classic Data Table */
                        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '8px' }}>
                          <div className="data-table" style={{ minWidth: '750px' }}>
                            <div className="table-header" style={{ cursor: 'pointer', userSelect: 'none', gridTemplateColumns: '1.2fr 1.5fr 1.5fr 1.5fr' }}>
                              <span onClick={() => handleSort('date')}>SYNC DATE {sortBy === 'date' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                              <span onClick={() => handleSort('inv')}>TOTAL INV {sortBy === 'inv' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                              <span onClick={() => handleSort('curr')}>TOTAL CURR {sortBy === 'curr' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                              <span onClick={() => handleSort('ret_amount')}>RETURNS {sortBy === 'ret_amount' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                            </div>
                            {invPaginatedRows && invPaginatedRows.length > 0 ? invPaginatedRows.map((inv, i) => {
                              const ret = inv.total_curr - inv.total_inv;
                              return (
                                <div 
                                  key={i} 
                                  className={`table-row ${i%2===0?'row-even':''}`} 
                                  onClick={() => openDrillDown(inv.date.split('T')[0])} 
                                  style={{ cursor: 'pointer', gridTemplateColumns: '1.2fr 1.5fr 1.5fr 1.5fr', transition: 'background 0.2s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  title="Click to view split"
                                >
                                  <span style={{ fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    🔍 {formatDate(inv.date)}
                                  </span>
                                  <span style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '4px', textDecorationColor: 'var(--border2)' }}>{showBalances ? fmt(inv.total_inv) : '₹ ••••••'}</span>
                                  <span style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '4px', textDecorationColor: 'var(--border2)' }}>{showBalances ? fmt(inv.total_curr) : '₹ ••••••'}</span>
                                  
                                  {/* Stacked Returns Column */}
                                  <span className={ret >= 0 ? 'pos' : 'neg'} style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                                    <span style={{ fontWeight: 700 }}>{showBalances ? (ret >= 0 ? '+' : '-') + fmt(Math.abs(ret)) : '₹ ••••••'}</span>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({inv.total_ret_pct >= 0 ? '+' : '-'}{Math.abs(inv.total_ret_pct).toFixed(2)}%)</span>
                                  </span>
                                </div>
                              );
                            }) : <div className="empty-state">No brokerage snapshots match your filters.</div>}
                          </div>
                        </div>
                      ) : (
                        /* 📱 MOBILE: Clean Vertical Cards */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {invPaginatedRows && invPaginatedRows.length > 0 ? invPaginatedRows.map((inv, i) => {
                            const ret = inv.total_curr - inv.total_inv;
                            const isPos = ret >= 0;
                            return (
                              <div 
                                key={i} 
                                onClick={() => openDrillDown(inv.date.split('T')[0])} 
                                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '1rem' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                              >
                                {/* Top Row: Date & Action */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>📅 {formatDate(inv.date)}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    Tap for Split ❯
                                  </span>
                                </div>
                                {/* Metrics Grid */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', rowGap: '1.25rem' }}>
                                  <div style={{ flex: '1 1 30%', minWidth: '85px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Invested</div>
                                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap' }}>{showBalances ? fmt(inv.total_inv) : '₹ ••••••'}</div>
                                  </div>
                                  <div style={{ flex: '1 1 30%', minWidth: '85px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Current Value</div>
                                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap' }}>{showBalances ? fmt(inv.total_curr) : '₹ ••••••'}</div>
                                  </div>
                                  <div style={{ flex: '1 1 30%', minWidth: '85px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Returns</div>
                                    <div className={isPos ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ whiteSpace: 'nowrap' }}>{showBalances ? (isPos ? '+' : '-') + fmt(Math.abs(ret)) : '₹ ••••••'}</span>
                                      <span style={{ fontSize: '0.7rem', opacity: 0.9, whiteSpace: 'nowrap' }}>({isPos ? '+' : '-'}{Math.abs(inv.total_ret_pct).toFixed(2)}%)</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }) : <div className="empty-state">No brokerage snapshots match your filters.</div>}
                        </div>
                      )}

                      {/* 🚀 PAGINATION CONTROLS */}
                      {invTotalPages > 1 && (
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: isMobile ? 'column' : 'row', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          marginTop: '1.5rem', 
                          padding: '0.85rem 1.25rem', 
                          background: 'var(--bg2)', 
                          borderRadius: '12px', 
                          border: '1px solid var(--border)', 
                          gap: '1rem' 
                        }}>
                          
                          {/* Left Side: Row Selector & Count */}
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <CustomSelect 
                              value={invRowsPerPage} 
                              onChange={val => { setInvRowsPerPage(Number(val)); setInvCurrentPage(0); }}
                              options={[5, 10, 25, 50].map(r => ({ label: `${r} rows`, value: r }))}
                              minWidth="110px"
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                              Showing {invCurrentPage * invRowsPerPage + 1} - {Math.min((invCurrentPage + 1) * invRowsPerPage, processedData.length)} of {processedData.length}
                            </span>
                          </div>

                          {/* Right Side: Navigation Buttons */}
                          <div style={{ 
                            display: 'flex', 
                            gap: '0.5rem', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            width: isMobile ? '100%' : 'auto' 
                          }}>
                            <button 
                              onClick={() => setInvCurrentPage(Math.max(0, invCurrentPage - 1))} 
                              disabled={invCurrentPage === 0} 
                              className="action-btn secondary" 
                              style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', flex: isMobile ? 1 : 'none', justifyContent: 'center' }}
                            >
                              ← Prev
                            </button>
                            
                            <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, margin: '0 0.5rem', whiteSpace: 'nowrap' }}>
                              Page {invCurrentPage + 1} of {invTotalPages}
                            </span>
                            
                            <button 
                              onClick={() => setInvCurrentPage(Math.min(invTotalPages - 1, invCurrentPage + 1))} 
                              disabled={invCurrentPage === invTotalPages - 1} 
                              className="action-btn secondary" 
                              style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', flex: isMobile ? 1 : 'none', justifyContent: 'center' }}
                            >
                              Next →
                            </button>
                          </div>

                        </div>
                      )}
                    </div>
                  ) : (
                    /* 🚀 FIXED CARD STRUCTURE FOR MANUAL ASSETS */
                    <div>
                      <div>
                      {!isMobile ? (
                        /* 🖥️ DESKTOP: Classic Data Table */
                        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '8px' }}>
                          <div className="data-table" style={{ minWidth: '800px' }}>
                            {sectionAssets.length > 0 ? (
                              <>
                                <div className="table-header" style={{ gridTemplateColumns: '2.5fr 1fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr 1fr', padding: '0.75rem 1.25rem' }}>
                                  <span>Asset Name</span>
                                  <span>Type</span>
                                  <span>Invested</span>
                                  <span>Current Value</span>
                                  <span>Returns</span>
                                  <span>Details</span>
                                  <span>Automation</span>
                                  <span style={{textAlign: 'right'}}>Actions</span>
                                </div>
                                {sectionAssets.map((asset, i) => {
                                  const ret = asset.current_value - asset.invested_value;
                                  const isPos = ret >= 0;
                                  return (
                                    <div key={asset.id} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '2.5fr 1fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr 1fr', padding: '0.75rem 1.25rem', alignItems: 'center' }}>
                                      <span style={{ fontWeight: 600 }}>{asset.name}</span>
                                      <span><span style={{ background: 'var(--bg3)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}>{asset.category}</span></span>
                                      <span>{fmt(asset.invested_value)}</span>
                                      <span style={{ fontWeight: 700 }}>{fmt(asset.current_value)}</span>
                                      <span className={isPos ? 'pos' : 'neg'} style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                                        <span style={{ fontWeight: 700 }}>{isPos ? '+' : '-'}{fmt(Math.abs(ret))}</span>
                                        {asset.invested_value > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({isPos ? '+' : '-'}{((Math.abs(ret) / asset.invested_value) * 100).toFixed(2)}%)</span>}
                                      </span>

                                      {/* New Details Column */}
                                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {asset.interest_rate ? <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: 600 }}>{asset.interest_rate}% Interest</span> : <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>No Interest</span>}
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>Start: {asset.start_date || '—'}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>Ends: {asset.maturity_date || '—'}</span>
                                      </span>
                                      
                                      {/* New Automation Column */}
                                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {asset.is_recurring ? (
                                          <>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--pos)', fontWeight: 600 }}>+ {fmt(asset.amount_to_add)}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>Every {asset.interval_value} {asset.interval_unit}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>Next: {asset.next_run_date}</span>
                                          </>
                                        ) : <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Not Automated</span>}
                                      </span>
                                      
                                      <span style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                        <button className="action-icon-btn edit" onClick={(e) => { e.stopPropagation(); setEditingAsset(asset); }} title="Edit">✏️</button>
                                        <button className="action-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteManualAsset(asset.id); }} title="Delete">🗑️</button>
                                      </span>
                                    </div>
                                  );
                                })}
                              </>
                            ) : (
                              <div className="empty-state">No assets added in this category yet.</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* 📱 MOBILE: Clean Vertical Cards */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {sectionAssets.length > 0 ? sectionAssets.map((asset, i) => {
                            const ret = asset.current_value - asset.invested_value;
                            const isPos = ret >= 0;
                            return (
                              <div key={asset.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Top Row: Name */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>{asset.name}</span>
                                    <span style={{ background: 'var(--bg3)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>{asset.category}</span>
                                  </div>
                                </div>
                                {/* Metrics Grid */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', rowGap: '1.25rem' }}>
                                  <div style={{ flex: '1 1 30%', minWidth: '85px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Invested</div>
                                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap' }}>{fmt(asset.invested_value)}</div>
                                  </div>
                                  <div style={{ flex: '1 1 30%', minWidth: '85px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Current Value</div>
                                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap' }}>{fmt(asset.current_value)}</div>
                                  </div>
                                  <div style={{ flex: '1 1 30%', minWidth: '85px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Returns</div>
                                    <div className={isPos ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ whiteSpace: 'nowrap' }}>{(isPos ? '+' : '-') + fmt(Math.abs(ret))}</span>
                                      {asset.invested_value > 0 && <span style={{ fontSize: '0.7rem', opacity: 0.9, whiteSpace: 'nowrap' }}>({isPos ? '+' : '-'}{((Math.abs(ret) / asset.invested_value) * 100).toFixed(2)}%)</span>}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* 🚀 NEW Additional Details row for Mobile */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                  <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Details</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text)', marginTop: '4px' }}>{asset.interest_rate ? `${asset.interest_rate}% Rate` : 'No Interest'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '2px' }}>{asset.start_date ? `Start: ${asset.start_date}` : ''}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '2px' }}>{asset.maturity_date ? `Ends: ${asset.maturity_date}` : ''}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Automation</div>
                                    {asset.is_recurring ? (
                                      <>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--pos)', fontWeight: 600, marginTop: '4px' }}>+{fmt(asset.amount_to_add)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '2px' }}>Every {asset.interval_value} {asset.interval_unit}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '2px' }}>Next: {asset.next_run_date}</div>
                                      </>
                                    ) : <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '4px' }}>Off</div>}
                                  </div>
                                </div>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 500 }}>Last updated: {asset.last_updated}</div>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="action-btn secondary" onClick={(e) => { e.stopPropagation(); setEditingAsset(asset); }} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>✏️ Edit</button>
                                    <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleDeleteManualAsset(asset.id); }} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: 'var(--neg)', border: 'none', boxShadow: 'none' }}>🗑️ Delete</button>
                                  </div>
                                </div>
                              </div>
                            );
                          }) : (
                            <div className="empty-state">No assets added in this category yet.</div>
                          )}
                        </div>
                      )}
                    </div>
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
      {editingAsset && <EditManualAssetModal asset={editingAsset} onClose={() => setEditingAsset(null)} onRefresh={onAdd} />}
        
      {/* Drill-down Modal (Shared for MF & Equity) */}
      {drillDownDate && (
        <div className="modal-backdrop" onClick={() => { setDrillDownDate(null); setDrillDownCompareDate(null); }}>
          <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start', borderBottom: '1px solid var(--border)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <div className="modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
                  Portfolio Snapshot
                  {(isDrillDownLoading || isCompareLoading) && <span className="loader-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginLeft: '0.5rem', display: 'inline-block', verticalAlign: 'middle' }} />}
                </div>
                <button className="modal-close" onClick={() => { setDrillDownDate(null); setDrillDownCompareDate(null); }}>×</button>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                  <CustomSelect
                     value={drillDownDate}
                     onChange={(val) => {
                       setDrillDownDate(val);
                       setDrillDownCompareDate(null);
                       setDrillDownCompareData([]);
                       fetchDrillDownData(val, drillDownType);
                     }}
                     options={[...investments].sort((a,b) => new Date(b.date) - new Date(a.date)).map(inv => ({ label: formatDate(inv.date), value: inv.date.split('T')[0] }))}
                     width={isMobile ? '100%' : 'auto'}
                     minWidth="130px"
                  />
                  <CustomSelect 
                    value={drillDownCompareDate || ""}
                    onChange={(val) => fetchCompareData(val, drillDownType)}
                    options={[
                      { label: 'No Compare', value: '' }, 
                      ...availableCompareDates
                    ]}
                    placeholder="⚖️ vs..."
                    width={isMobile ? '100%' : 'auto'}
                    minWidth="130px"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                  <button 
                    onClick={() => { fetchDrillDownData(drillDownDate, 'EQUITY'); if(drillDownCompareDate) fetchCompareData(drillDownCompareDate, 'EQUITY'); }}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: drillDownType === 'EQUITY' ? 'var(--card)' : 'transparent', color: drillDownType === 'EQUITY' ? 'var(--accent)' : 'var(--text2)', border: drillDownType === 'EQUITY' ? '1px solid var(--accent)' : '1px solid transparent', boxShadow: drillDownType === 'EQUITY' ? '0 4px 12px rgba(99,102,241,0.15)' : 'none', flex: isMobile ? 1 : 'none' }}
                  >📈 Stocks</button>
                  <button 
                    onClick={() => { fetchDrillDownData(drillDownDate, 'MF'); if(drillDownCompareDate) fetchCompareData(drillDownCompareDate, 'MF'); }}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: drillDownType === 'MF' ? 'var(--card)' : 'transparent', color: drillDownType === 'MF' ? 'var(--accent)' : 'var(--text2)', border: drillDownType === 'MF' ? '1px solid var(--accent)' : '1px solid transparent', boxShadow: drillDownType === 'MF' ? '0 4px 12px rgba(99,102,241,0.15)' : 'none', flex: isMobile ? 1 : 'none' }}
                  >🏦 MFs</button>
                </div>
              </div>

            </div>
            
            <div className="modal-body" style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: '65vh' }}>
              {(isDrillDownLoading || isCompareLoading) ? (
                <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text2)' }}>
                  <div className="loader-spinner" style={{ marginBottom: '1rem' }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Analyzing and Crunching Deltas...</div>
                </div>
              ) : drillDownCompareDate && comparisonData ? (
                /* 🚀 COMPARISON VIEW 🚀 */
                <>
                {/* Summary Banner */}
                {comparisonSummary && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    {[
                      { label: 'Invested', valA: comparisonSummary.inv_A, valB: comparisonSummary.inv_B, diff: comparisonSummary.inv_diff },
                      { label: 'Current Value', valA: comparisonSummary.curr_A, valB: comparisonSummary.curr_B, diff: comparisonSummary.curr_diff },
                      { label: 'Returns', valA: comparisonSummary.ret_A, valB: comparisonSummary.ret_B, diff: comparisonSummary.ret_diff, pctA: comparisonSummary.ret_pct_A, pctB: comparisonSummary.ret_pct_B },
                    ].map((card, ci) => (
                      <div key={ci} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.6rem' }}>{card.label}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginBottom: '2px' }}>{formatDate(drillDownDate)}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: card.label === 'Returns' ? (card.valA >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--text)', fontFamily: "'DM Sans', sans-serif" }}>
                              {card.label === 'Returns' && (card.valA >= 0 ? '+' : '-')}₹{Math.abs(card.valA).toLocaleString('en-IN', {maximumFractionDigits:0})}
                              {card.pctA !== undefined && <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '4px' }}>({card.pctA >= 0 ? '+' : ''}{card.pctA.toFixed(1)}%)</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginBottom: '2px' }}>{formatDate(drillDownCompareDate)}</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text2)', fontFamily: "'DM Sans', sans-serif" }}>
                              {card.label === 'Returns' && (card.valB >= 0 ? '+' : '-')}₹{Math.abs(card.valB).toLocaleString('en-IN', {maximumFractionDigits:0})}
                              {card.pctB !== undefined && <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '3px' }}>({card.pctB >= 0 ? '+' : ''}{card.pctB.toFixed(1)}%)</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                          <DiffBadge diff={card.diff} isCurrency={true} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {comparisonSummary && (
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                      {comparisonSummary.total_stocks} {drillDownType === 'EQUITY' ? 'stocks' : 'funds'}
                    </span>
                    {comparisonSummary.stocks_new > 0 && <span style={{ fontSize: '0.7rem', background: 'rgba(52,211,153,0.1)', color: 'var(--pos)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>+{comparisonSummary.stocks_new} New</span>}
                    {comparisonSummary.stocks_exited > 0 && <span style={{ fontSize: '0.7rem', background: 'rgba(248,113,113,0.1)', color: 'var(--neg)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{comparisonSummary.stocks_exited} Exited</span>}
                  </div>
                )}
                {!isMobile ? (
                  <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <div className="data-table" style={{ minWidth: '850px' }}>
                      <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.2fr 1.2fr 1.2fr', userSelect: 'none' }}>
                        <span>Symbol</span>
                        <span>Qty Δ</span>
                        <span>{drillDownType === 'EQUITY' ? 'LTP' : 'NAV'} Δ</span>
                        <span>Invested Δ</span>
                        <span>Current Δ</span>
                        <span>Returns Δ</span>
                      </div>
                      {comparisonData.map((h, i) => (
                        <div key={i} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '2fr 1fr 1fr 1.2fr 1.2fr 1.2fr' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '600', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {h.symbol}
                              {h.is_new && <span style={{background: 'var(--pos)', color: '#fff', fontSize: '0.55rem', padding: '2px 4px', borderRadius: '4px'}}>NEW</span>}
                              {h.is_exited && <span style={{background: 'var(--neg)', color: '#fff', fontSize: '0.55rem', padding: '2px 4px', borderRadius: '4px'}}>EXITED</span>}
                            </div>
                          </span>
                          <span style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px' }}>
                            <span>{h.qty_A.toFixed(2)}</span>
                            <DiffBadge diff={h.qty_diff} isCurrency={false} />
                          </span>
                          <span style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px' }}>
                            <span>₹{h.price_A.toLocaleString('en-IN', {maximumFractionDigits:2})}</span>
                            <DiffBadge diff={h.price_diff} isCurrency={true} />
                          </span>
                          <span style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px' }}>
                            <span>₹{h.inv_A.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                            <DiffBadge diff={h.inv_diff} isCurrency={true} />
                          </span>
                          <span style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>₹{h.curr_A.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                            <DiffBadge diff={h.curr_diff} isCurrency={true} />
                          </span>
                          <span style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px' }}>
                            <span className={h.ret_A >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700 }}>{h.ret_A >= 0 ? '+' : '-'}₹{Math.abs(h.ret_A).toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                            <DiffBadge diff={h.ret_diff} isCurrency={true} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {comparisonData.map((h, i) => {
                      const isPosRet = h.ret_A >= 0;
                      return (
                        <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'all 0.2s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', lineHeight: 1.3 }}>{h.symbol}</div>
                              {h.is_new && <span style={{background: 'var(--pos)', color: '#fff', fontSize: '0.55rem', padding: '2px 4px', borderRadius: '4px'}}>NEW</span>}
                              {h.is_exited && <span style={{background: 'var(--neg)', color: '#fff', fontSize: '0.55rem', padding: '2px 4px', borderRadius: '4px'}}>EXITED</span>}
                            </div>
                            <div className={isPosRet ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.85rem', background: isPosRet ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                              Ret: {isPosRet ? '+' : '-'}₹{Math.abs(h.ret_A).toLocaleString('en-IN', {maximumFractionDigits:0})}
                            </div>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Quantity</div>
                               <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px' }}>{h.qty_A.toFixed(2)}</div>
                               <div style={{ marginTop: '4px' }}><DiffBadge diff={h.qty_diff} isCurrency={false} /></div>
                            </div>
                            <div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>{drillDownType === 'EQUITY' ? 'LTP' : 'NAV'}</div>
                               <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px' }}>₹{h.price_A.toLocaleString('en-IN', {maximumFractionDigits:2})}</div>
                               <div style={{ marginTop: '4px' }}><DiffBadge diff={h.price_diff} isCurrency={true} /></div>
                            </div>
                            <div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Invested</div>
                               <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px' }}>₹{h.inv_A.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                               <div style={{ marginTop: '4px' }}><DiffBadge diff={h.inv_diff} isCurrency={true} /></div>
                            </div>
                            <div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Current Val</div>
                               <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px' }}>₹{h.curr_A.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                               <div style={{ marginTop: '4px' }}><DiffBadge diff={h.curr_diff} isCurrency={true} /></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </>
              ) : (
                /* 🚀 STANDARD VIEW (Original Logic) 🚀 */
                !isMobile ? (
                  <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <div className="data-table" style={{ minWidth: '750px' }}>
                      <div className="table-header" style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr', cursor: 'pointer', userSelect: 'none' }}>
                        <span onClick={() => handleDrillSort('symbol')}>Symbol {drillSortBy === 'symbol' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                        <span onClick={() => handleDrillSort('quantity')}>Qty {drillSortBy === 'quantity' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                        <span onClick={() => handleDrillSort('average_price')}>Avg Price {drillSortBy === 'average_price' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                        <span onClick={() => handleDrillSort('price')}>{drillDownType === 'EQUITY' ? 'LTP' : 'NAV'} {drillSortBy === 'price' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                        <span onClick={() => handleDrillSort('invested_value')}>Invested {drillSortBy === 'invested_value' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                        <span onClick={() => handleDrillSort('current_value')}>Current {drillSortBy === 'current_value' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                        <span onClick={() => handleDrillSort('ret_pct')}>Returns {drillSortBy === 'ret_pct' && <span className="sort-indicator">{drillSortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                      </div>
                      {processedDrillDownData.map((h, i) => {
                        const isPos = h.ret_pct >= 0;
                        return (
                          <div key={i} className={`table-row ${i%2===0?'row-even':''}`} style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600' }}>{h.symbol}</span>
                            <span>{h.quantity.toFixed(2)}</span>
                            <span>₹{h.average_price.toFixed(2)}</span>
                            <span>₹{(drillDownType === 'EQUITY' ? h.ltp : h.nav).toFixed(2)}</span>
                            <span>₹{h.invested_value.toFixed(0)}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>₹{h.current_value.toFixed(0)}</span>
                            <span className={isPos ? 'pos' : 'neg'} style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                              <span style={{ fontWeight: 700 }}>{isPos ? '+' : '-'}₹{Math.abs(h.current_value - h.invested_value).toFixed(0)}</span>
                              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({isPos ? '+' : '-'}{Math.abs(h.ret_pct).toFixed(2)}%)</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {processedDrillDownData.map((h, i) => {
                      const isPos = h.ret_pct >= 0;
                      return (
                        <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'all 0.2s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', lineHeight: 1.3 }}>{h.symbol}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '6px' }}>
                                {h.quantity.toFixed(2)} units • Avg: ₹{h.average_price.toFixed(2)} • {drillDownType === 'EQUITY' ? 'LTP' : 'NAV'}: ₹{(drillDownType === 'EQUITY' ? h.ltp : h.nav).toFixed(2)}
                              </div>
                            </div>
                            <div className={isPos ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.85rem', background: isPos ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                              {isPos ? '+' : '-'}{Math.abs(h.ret_pct).toFixed(2)}%
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Invested</div>
                              <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap' }}>₹{h.invested_value.toFixed(0)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Current</div>
                              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap' }}>₹{h.current_value.toFixed(0)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Return ₹</div>
                              <div className={h.current_value >= h.invested_value ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column' }}>
                                <span>{h.current_value >= h.invested_value ? '+' : '-'}₹{Math.abs(h.current_value - h.invested_value).toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🚀 FLOATING HIDE/SHOW TOGGLE */}
      <button
        onClick={() => setShowBalances(!showBalances)}
        title={showBalances ? "Hide Balances" : "Show Balances"}
        style={{
          position: 'fixed',
          bottom: isMobile ? '85px' : '30px', /* Stays above mobile bottom nav */
          right: '20px',
          zIndex: 999,
          width: '50px',
          height: '50px',
          borderRadius: '25px',
          background: 'var(--card)',
          border: '1px solid var(--accent)',
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(99,102,241,0.4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.4)'; }}
      >
        {showBalances ? '🙈' : '👁️'}
      </button>

    </div>
  </div>
  );
}

// ─── SECRET DEVELOPER MENU ───────────────────────────────────────────
function SecretAdminModal({ onClose }) {
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchEmails = async () => {
    try {
      const res = await fetch(`${API}/admin/emails`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setEmails(data.emails);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchEmails(); }, []);

  const handleAdd = async () => {
    if (!newEmail.includes('@')) return;
    await fetch(`${API}/admin/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ email: newEmail })
    });
    setNewEmail('');
    fetchEmails();
  };

  const handleRemove = async (email) => {
    if (!window.confirm(`Revoke access for ${email}?`)) return;
    await fetch(`${API}/admin/emails/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    fetchEmails();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', border: '1px solid var(--accent)' }}>
        <div className="modal-header" style={{ background: 'rgba(99, 102, 241, 0.1)', borderBottom: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🧑‍💻</span> Developer Access Control
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input 
              className="inp" 
              placeholder="friend@gmail.com" 
              value={newEmail} 
              onChange={e => setNewEmail(e.target.value.toLowerCase())} 
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button className="action-btn" onClick={handleAdd}>Add</button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>Approved Accounts</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>sbsabarish14@gmail.com</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 700, padding: '0.1rem 0.4rem', background: 'var(--bg3)', borderRadius: '4px' }}>MASTER</span>
            </div>
            
            {loading ? <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text3)' }}>Loading...</div> : emails.map(email => (
              <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>{email}</span>
                <button 
                  onClick={() => handleRemove(email)}
                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--neg)', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>
            ))}
            {emails.length === 0 && !loading && <div style={{ fontSize: '0.85rem', color: 'var(--text3)', textAlign: 'center', padding: '1rem' }}>No guest accounts added.</div>}
          </div>
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
  const [categories, setCategories] = useState([]);
  const [physical, setPhysical] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [manualAssets, setManualAssets] = useState([]); // 🚀 NEW STATE
  const [assetList, setAssetList] = useState({}); // 🚀 NEW: Dropdown options
  const [allTransactionsLoaded, setAllTransactionsLoaded] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  
  // 🚀 SECRET DEV MENU STATES
  const [logoClicks, setLogoClicks] = useState(0);
  const [isSecretMenuOpen, setIsSecretMenuOpen] = useState(false);
  const isAdmin = localStorage.getItem('dt_is_admin') === 'true';
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 🚀 GLOBAL ESCAPE: Closes App-level Modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setIsActivityModalOpen(false);
        setIsSecretMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // The hidden trigger function
  const handleLogoClick = () => {
    setTab(0); // Maintain normal home navigation
    if (!isAdmin) return; 
    
    setLogoClicks(prev => {
      if (prev + 1 >= 7) {
        setIsSecretMenuOpen(true);
        return 0;
      }
      return prev + 1;
    });
  };

  // --- Sidebar Resizing Logic ---
  const [sidebarWidth, setSidebarWidth] = useState(70); 
  const [isResizing, setIsResizing] = useState(false);

  // --- Theme Logic ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  const logout = () => {
  signOut(auth);
  localStorage.removeItem('dt_token');
  localStorage.removeItem('dt_is_admin'); // <-- ADD THIS LINE
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
      // Trigger Lazy Cron before fetching data so UI gets the updated values
      if (getToken()) {
         await fetch(`${API}/cron/process-recurring`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } }).catch(()=>console.log("Cron passed"));
      }
      
      // Helper function that explicitly throws an error if the server is throwing 500/503 during wake-up
      const fetchWithCheck = async (url) => {
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!r.ok) throw new Error(`Server waking up: ${r.status}`);
        return r.json();
      };

      // Fire ALL 6 requests in parallel
      const [acc, phy, inv, manAssets, txRes, listRes, catRes] = await Promise.all([
        fetchWithCheck(`${API}/accounts`),
        fetchWithCheck(`${API}/physical`),
        fetchWithCheck(`${API}/investments`),
        fetchWithCheck(`${API}/manual_assets`), 
        fetchWithCheck(`${API}/transactions?limit=100&offset=0`),
        fetchWithCheck(`${API}/assets/list`), // 🚀 FETCH SYMBOLS
        fetchWithCheck(`${API}/transactions/categories`)
      ]);
      
      setAccounts(acc);
      setTransactions(txRes.transactions);
      setAllTransactionsLoaded(false); 
      setPhysical(phy);
      setInvestments(inv);
      setManualAssets(manAssets); 
      setAssetList(listRes); // 🚀 SAVE SYMBOLS
      if (catRes && catRes.success) setCategories(catRes.categories);
      
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
      case 1: return <MoneyTab accounts={accounts} transactions={transactions} categories={categories} onRefresh={fetchAll} />;
      case 2: return <AddTab accounts={accounts} transactions={transactions} categories={categories} onAdd={fetchAll} />;
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

        <div className="sidebar-logo" onClick={handleLogoClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', position: 'relative', cursor: 'pointer', overflow: 'hidden' }}>
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
            
            {/* 1. Theme Toggle (Icons Only) */}
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '0.4rem', display: 'flex' }}
              title="Toggle Theme"
            >
              {theme === 'dark' ? (
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>

            {/* 2. Hamburger Menu */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '0.4rem', display: 'flex' }}
              >
                <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>

              {isMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: '0.5rem',
                  background: 'var(--card)', border: '1px solid var(--border)', 
                  borderRadius: '12px', padding: '0.5rem', zIndex: 100,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)', minWidth: '150px'
                }}>
                  <button 
                    onClick={() => { setIsMenuOpen(false); logout(); }} 
                    style={{ 
                      width: '100%', background: 'rgba(239, 68, 68, 0.1)', 
                      border: 'none', borderRadius: '8px', padding: '0.6rem 1rem', 
                      color: 'var(--neg)', cursor: 'pointer', fontSize: '0.85rem', 
                      fontWeight: 600, textAlign: 'left', display: 'flex', gap: '8px'
                    }}
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>

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

      {/* 🚀 HIDDEN DEVELOPER MENU */}
      {isSecretMenuOpen && isAdmin && (
        <SecretAdminModal onClose={() => setIsSecretMenuOpen(false)} />
      )}

      {/* 📱 Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`mobile-nav-item ${tab === t.id ? 'active' : ''} ${t.add ? 'add-item' : ''}`}
            // 🚀 NEW: Trigger the secret menu ONLY if it's the Home tab (id: 0)
            onClick={() => t.id === 0 ? handleLogoClick() : setTab(t.id)}
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

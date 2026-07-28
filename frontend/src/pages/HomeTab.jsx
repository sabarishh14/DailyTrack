import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from './SabDekho';

import { API, MONTHS, BANKS } from '../constants';
import { getToken, formatDate, fmt, fmtPct } from '../utils';
import CustomSelect from '../components/CustomSelect';
import ReconciliationModal from '../components/ReconciliationModal';

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
  const moneyML = `${moneyYear}-${String(moneyMonth + 1).padStart(2, '0')}`;
  const moneyTransactions = transactions.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date);
    const ml = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
      <div className="invest-action-buttons" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="action-btn" onClick={syncBalances} disabled={syncing} style={{ minWidth: '200px', justifyContent: 'center' }}>
          {syncing ? '⏳ Syncing...' : '🔄 Sync Balances from Sheet'}
        </button>
        <button className="action-btn" onClick={syncTransactionsFromSheets} disabled={syncingSheetsTransactions} style={{ minWidth: '200px', justifyContent: 'center', background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}>
          {syncingSheetsTransactions ? '⏳ Syncing...' : '📥 Sync Transactions to Sheets'}
        </button>
        {syncMsg && <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: syncMsg.startsWith('✅') ? 'var(--pos)' : 'var(--neg)', width: '100%', textAlign: 'center', marginTop: '0.5rem' }}>{syncMsg}</span>}
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
            <div className="acc-row" style={{ fontWeight: 700 }}>
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
            <div className="acc-row" style={{ fontWeight: 700 }}>
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

      {/* 📱 Mobile Version Tag (at bottom of Home) */}
      <div className="mobile-version-tag">
        v:{__COMMIT_SHA__} • {__BUILD_TIME__}
      </div>
    </div> // This is the closing div of HomeTab
  );
}

export default memo(HomeTab);

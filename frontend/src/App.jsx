import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const API = "http://localhost:5000/api";
const STORAGE_KEY = 'lifetrack_balances';

// localStorage helpers
const getStoredBalances = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const saveBalances = (accounts) => {
  try {
    const balances = {};
    accounts.forEach(a => {
      balances[a.account] = a.balance;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(balances));
  } catch (e) {
    console.error('Failed to save balances to localStorage:', e);
  }
};

const updateStoredBalance = (account, newBalance) => {
  try {
    const balances = getStoredBalances() || {};
    balances[account] = newBalance;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(balances));
  } catch (e) {
    console.error('Failed to update balance in localStorage:', e);
  }
};

const BANKS = {
  KOTAK:  { emoji: "🔴", color: "#ef4444" },
  IDBI:   { emoji: "🟢", color: "#22c55e" },
  FEDERAL:{ emoji: "🟠", color: "#f97316" },
  CUB:    { emoji: "🟣", color: "#a855f7" },
  INDIAN: { emoji: "🔵", color: "#3b82f6" },
  ICICI:  { emoji: "🟡", color: "#eab308" },
  CC:     { emoji: "💳", color: "#ec4899" },
  "CC-PINNACLE 6360": { emoji: "💳", color: "#ec4899" },
  "CC-SBI 0033": { emoji: "💳", color: "#ec4899" },
  "CC-ICICI SAFFIRE": { emoji: "💳", color: "#ec4899" },
  "CC-AP 4004": { emoji: "💳", color: "#ec4899" },
  "CC-SBI 9810": { emoji: "💳", color: "#ec4899" },
  Cash:   { emoji: "💵", color: "#f59e0b" },
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

const TAB_TITLES = ["Dashboard", "Money Tracker", "Add Transaction", "Gym & Activity", "Investment Tracker"];

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

function getSundays() {
  const sundays = [];
  let d = new Date(2025, 9, 5);
  const today = new Date(); today.setHours(23,59,59,999);
  while (d <= today) {
    sundays.push(new Date(d));
    d = new Date(d); d.setDate(d.getDate() + 7);
  }
  return sundays.reverse();
}

// ─── HOME TAB ───────────────────────────────────────────────────────────
function HomeTab({ accounts, transactions, physical, investments, onSyncBalances, onImportCSV }) {
  const [physMonth, setPhysMonth] = useState(new Date().getMonth());
  const [physYear, setPhysYear] = useState(new Date().getFullYear());
  const [moneyMonth, setMoneyMonth] = useState(new Date().getMonth());
  const [moneyYear, setMoneyYear] = useState(new Date().getFullYear());
  const [syncing, setSyncing] = useState(false);
  const [syncingSheetsTransactions, setSyncingSheetsTransactions] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const fileRef = useRef(null);

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
    setSyncingSheetsTransactions(true);
    setSyncMsg('');
    try {
      const res = await fetch(`${API}/sync/db-to-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncMsg(`✅ Synced successfully! Imported ${data.inserted} new transactions.`);
        // Transactions synced to backend. Refresh will happen on next navigation or page reload.
      } else {
        setSyncMsg(`❌ Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (e) {
      setSyncMsg('❌ Sync failed: ' + e.message);
    } finally {
      setSyncingSheetsTransactions(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  const netWorth = accounts
  .filter(a => a.balance_tracked) // only accounts that track balance
  .reduce((s, a) => s + parseFloat(a.balance || 0), 0);  const latestInv = investments.length ? investments[investments.length - 1] : null;
  const totalInvested = latestInv ? parseFloat(latestInv.inv_mf) : 0;
  const totalCurrent = latestInv ? parseFloat(latestInv.curr_mf) : 0;
  const totalReturn = totalCurrent - totalInvested;
  const totalRetPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  const physActive = physical.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === physMonth && d.getFullYear() === physYear &&
      (p.active === true || p.active === 'true' || p.active === 1);
  }).length;

  // Money section: Income/Expenses by month
  const moneyML = `${moneyYear}-${String(moneyMonth+1).padStart(2,'0')}`;
  const moneyTransactions = transactions.filter(t => {
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
          <div>
            <div className="nw-label">Total Net Worth</div>
            <div className="nw-value">{fmt(netWorth)}</div>
            <div className="nw-sub">Across {accounts.length} accounts</div>
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
            .filter(a => a.balance_tracked && a.account !== 'CC-PINNACLE 6360') // <-- tracks balance and hides PINNACLE
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
                <div className="acc-balance">{fmt(a.balance)}</div>
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

      {/* Investments */}
      <section className="section">
        <h2 className="section-title">📊 Investment Portfolio</h2>
        <div className="inv-summary-grid">
          {[
            { label: "Invested (MF)", val: fmt(totalInvested), color: null },
            { label: "Current Value", val: fmt(totalCurrent), color: null },
            { label: "Returns ₹", val: fmt(totalReturn), color: totalReturn >= 0 ? "pos" : "neg" },
            { label: "Returns %", val: fmtPct(totalRetPct), color: totalRetPct >= 0 ? "pos" : "neg" },
          ].map(card => (
            <div className="inv-card" key={card.label}>
              <div className="inv-label">{card.label}</div>
              <div className={`inv-val ${card.color || ''}`}>{card.val}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── CUSTOM PIE TOOLTIP ─────────────────────────────────────────────────
function CustomPieTooltip({ active, payload }) {
  if (!active || !payload || !payload[0]) return null;
  const { value, name } = payload[0];
  const total = 15000; // Will be calculated dynamically - this is a fallback
  const pct = typeof value === 'number' ? ((value / (value * 8)) * 100).toFixed(1) : '0';
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a2235 0%, #0d1117 100%)',
      border: '1px solid rgba(99, 102, 241, 0.6)',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(10px)',
      pointerEvents: 'none'
    }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px', fontWeight: 600 }}>
        {name}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: '#6366f1', fontFamily: 'Syne, sans-serif' }}>
        ₹{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
}

// ─── MONEY TAB ───────────────────────────────────────────────────────────
function MoneyTab({ accounts, transactions }) {
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef(null);
  
  const currentMonthLabel = `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`;

  // Analyzer filters - multi-select
  const [chartAccounts, setChartAccounts] = useState(new Set());
  const [chartTypes, setChartTypes] = useState(new Set());
  const [chartMonths, setChartMonths] = useState(new Set([currentMonthLabel]));
  const [chartHeadings, setChartHeadings] = useState(new Set());

  // Table filters - multi-select
  const [filterAccounts, setFilterAccounts] = useState(new Set());
  const [filterDate, setFilterDate] = useState("");
  const [filterDateDebounced, setFilterDateDebounced] = useState("");
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
  
  // Column widths for resizing
  const [colWidths, setColWidths] = useState({ date: 90, account: 230, type: 85, month: 110, amount: 130, heading: 140, desc: 0 });

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
    const timer = setTimeout(() => setFilterDateDebounced(filterDate), 300);
    return () => clearTimeout(timer);
  }, [filterDate]);

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
      const dateMatch = !filterDateDebounced || dateStr.includes(filterDateDebounced);
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
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  }, [transactions, filterAccounts, filterDateDebounced, filterMonths, filterTypes, filterHeadings, filterDescDebounced, sortBy, sortDir]);

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
  }, [filterAccounts, filterDateDebounced, filterMonths, filterTypes, filterHeadings, filterDescDebounced]);

  const PIE_COLORS = ["#6366f1","#8b5cf6","#d946ef","#ec4899","#f43f5e","#f97316","#eab308","#84cc16","#22c55e","#10b981","#14b8a6","#06b6d4"];

  // Handle column resize
  const handleStartResize = (col, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[col];
    
    const handleMouseMove = (me) => {
      const diff = me.clientX - startX;
      const minWidths = { date: 80, account: 200, type: 70, month: 100, amount: 120, heading: 100, desc: 100 };
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
            </div>

            {/* Pie Chart + Legend Grid */}
            {pieArr.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
                {/* Pie Chart */}
                <div style={{ position: 'relative', background: 'rgba(99, 102, 241, 0.04)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(99, 102, 241, 0.1)', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={pieArr.slice(0, 10)} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        outerRadius={130} 
                        innerRadius={50}
                        paddingAngle={2}
                        animationDuration={600}
                        animationEasing="ease-out"
                      >
                        {pieArr.slice(0, 10).map((_, i) => (
                          <Cell 
                            key={i} 
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            style={{ 
                              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              cursor: 'pointer'
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
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
                    {pieArr.slice(0, 10).map((d, i) => {
                      const total = pieArr.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
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
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                            e.currentTarget.style.transform = 'translateX(4px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.transform = 'translateX(0)';
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
                    {pieArr.length > 10 && (
                      <div style={{ padding: '0.75rem 0.9rem', color: 'var(--text2)', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem', fontStyle: 'italic' }}>
                        +{pieArr.length - 10} more categories
                      </div>
                    )}
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
          <input
            type="date"
            className="inp"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={{ fontSize: '0.8rem', width: '160px', padding: '0.45rem 0.75rem', borderRadius: '999px' }}
          />
          <input
            className="inp"
            placeholder="🔍 Description"
            value={filterDesc}
            onChange={e => setFilterDesc(e.target.value)}
            style={{ fontSize: '0.8rem', width: '200px', padding: '0.45rem 0.75rem', borderRadius: '999px' }}
          />
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
          <div className="tx-table-head" style={{ gridTemplateColumns: `${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px 1fr` }}>
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
          </div>
          {tableFiltered.length > 0 ? (
            paginatedRows.map((t, i) => {
              const d = new Date(t.date);
              const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
              return (
                <div key={i} className="tx-row" style={{ gridTemplateColumns: `${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px 1fr` }}>
                  <span className="tx-date">{formatDate(t.date)}</span>
                  <span className="tx-account">
                    <span>{getBankEmoji(t.account)}</span>
                    <span>{t.account}</span>
                  </span>
                  <span className="tx-type-cell"><span className={`tx-badge ${t.type}`}>{t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span></span>
                  <span className="tx-month">{monthLabel}</span>
                  <span className={`tx-amount ${t.type === 'debit' ? 'neg' : t.type === 'credit' ? 'pos' : 'accent'}`}>
                    {t.type === 'debit' ? '−' : '+'}{fmt(t.amount)}
                  </span>
                  <span className="tx-heading">{t.heading}</span>
                  <span className="tx-desc">{t.description || '—'}</span>
                </div>
              );
            })
          ) : (
            <div className="empty-state">📭 No transactions match your filters</div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── ADD TAB ───────────────────────────────────────────────────────────
function AddTab({ accounts, onAdd }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ account:'KOTAK', date:today, type:'debit', heading:'Food', description:'', amount:'' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filteredCategories = CATEGORIES.filter(c => 
    c.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const handleCategorySelect = (category) => {
    set('heading', category);
    setCategorySearch('');
    setShowCategoryDropdown(false);
  };

const submit = async () => {
  if (!form.amount || isNaN(form.amount)) return alert("Enter a valid amount");
  setLoading(true);
  try {
    const payload = {
      date: form.date,
      type: form.type,
      heading: form.heading,
      description: form.description || "",
      amount: parseFloat(form.amount),
      account: form.account,
    };

    const res = await fetch(`${API}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Update localStorage balance based on transaction type
      const storedBalances = getStoredBalances() || {};
      const currentBalance = storedBalances[form.account] || 0;
      const amount = parseFloat(form.amount);
      
      let newBalance = currentBalance;
      if (form.type === 'debit') {
        newBalance = currentBalance - amount;
      } else if (form.type === 'credit') {
        newBalance = currentBalance + amount;
      } else if (form.type === 'savings') {
        newBalance = currentBalance - amount;
      }
      
      updateStoredBalance(form.account, newBalance);
      onAdd(); // Refresh accounts state from localStorage/API
      
      setSuccess(true);
      setForm({ account: 'KOTAK', date: today, type: 'debit', heading: 'Food', description: '', amount: '' });
      setCategorySearch('');
      setShowCategoryDropdown(false);
      setTimeout(() => setSuccess(false), 2500);
    } else {
      alert("Failed to save transaction.");
    }
  } catch (e) {
    alert("Network error: " + e.message);
  } finally {
    setLoading(false);
  }
};

  const monthLabel = form.date ? new Date(form.date).toLocaleString('default',{month:'long',year:'numeric'}) : '';
  const amtNum = parseFloat(form.amount) || 0;

  return (
    <div className="add-layout">
      <div className="add-form-card">
        <div className="form-row">
          <div className="form-group">
            <label>Account</label>
            <select className="sel" value={form.account} onChange={e => set('account', e.target.value)}>
              {Object.keys(BANKS).map(b => <option key={b} value={b}>{BANKS[b].emoji} {b}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" className="inp" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Month (auto from date)</label>
          <input className="inp" readOnly value={monthLabel} style={{opacity:0.6,cursor:'not-allowed'}} />
        </div>

        <div className="form-group">
          <label>Transaction Type</label>
          <div className="type-btns">
            {[['debit','🔴 Debit'],['credit','🟢 Credit'],['savings','💰 Savings']].map(([t,l]) => (
              <button key={t} className={`type-btn ${form.type === t ? 'active-'+t : ''}`} onClick={() => set('type', t)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ position: 'relative' }}>
            <label>Category</label>
            <input 
              type="text" 
              className="inp" 
              placeholder="Search or type category..."
              value={showCategoryDropdown ? categorySearch : form.heading}
              onChange={e => {
                setCategorySearch(e.target.value);
                setShowCategoryDropdown(true);
              }}
              onFocus={() => {
                setCategorySearch('');
                setShowCategoryDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)}
            />
            {showCategoryDropdown && filteredCategories.length > 0 && (
              <div className="category-dropdown">
                {filteredCategories.map(cat => (
                  <div
                    key={cat}
                    className="category-option"
                    onClick={() => handleCategorySelect(cat)}
                  >
                    {cat}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Amount (₹)</label>
            <input className="inp" type="number" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <input className="inp" placeholder="Add a note..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <button className={`submit-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading}>
          {loading ? "Saving..." : success ? "✅ Transaction Saved!" : "Save Transaction"}
        </button>
      </div>

      {/* Preview Panel */}
      <div className="preview-panel">
        <div className="preview-title">Transaction Preview</div>
        <div className="preview-item"><span className="pk">Account</span><span className="pv">{BANKS[form.account]?.emoji} {form.account}</span></div>
        <div className="preview-item"><span className="pk">Date</span><span className="pv">{form.date ? formatDate(form.date) : '—'}</span></div>
        <div className="preview-item"><span className="pk">Month</span><span className="pv">{monthLabel || '—'}</span></div>
        <div className="preview-item"><span className="pk">Type</span><span className="pv" style={{textTransform:'capitalize'}}>{form.type}</span></div>
        <div className="preview-item"><span className="pk">Category</span><span className="pv">{form.heading}</span></div>
        {form.description && <div className="preview-item"><span className="pk">Note</span><span className="pv">{form.description}</span></div>}
        <div className={`preview-amount-pill ${form.type}`}>
          <div className="pill-label">Amount</div>
          <div className={`pill-amount ${form.type === 'debit' ? 'neg' : form.type === 'credit' ? 'pos' : 'accent'}`}>
            {form.type === 'debit' ? '−' : '+'}{fmt(amtNum)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── GYM TAB ───────────────────────────────────────────────────────────
function GymTab({ physical, onAdd }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ date:today, active:true, activity:'Gym' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const submit = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/physical`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(form)
      });
      setSuccess(true); onAdd();
      setTimeout(() => setSuccess(false), 2000);
    } finally { setLoading(false); }
  };

  const sorted = [...physical].sort((a,b) => new Date(b.date) - new Date(a.date));
  const isActive = r => r.active === true || r.active === 'true' || r.active === 1;

  return (
    <div className="gym-layout">
      <div className="gym-form-card">
        <h3 style={{fontFamily:'Syne',fontWeight:700,marginBottom:'0.25rem'}}>Log Activity</h3>
        <div className="form-group">
          <label>Date</label>
          <input type="date" className="inp" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Physical Activity Today?</label>
          <div className="type-btns">
            <button className={`type-btn ${form.active ? 'active-credit' : ''}`} onClick={() => set('active',true)}>✅ Yes</button>
            <button className={`type-btn ${!form.active ? 'active-debit' : ''}`} onClick={() => set('active',false)}>❌ No</button>
          </div>
        </div>
        {form.active && (
          <div className="form-group">
            <label>Activity Type</label>
            <div className="type-btns">
              {[['Gym','🏋️'],['Badminton','🏸'],['TT','🏓']].map(([a,e]) => (
                <button key={a} className={`type-btn ${form.activity===a?'active-savings':''}`} onClick={() => set('activity',a)}>
                  {e} {a}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className={`submit-btn ${success?'success':''}`} onClick={submit} disabled={loading}>
          {loading ? "Saving..." : success ? "✅ Logged!" : "Log Activity"}
        </button>
      </div>

      <div>
        <h3 className="section-title">📋 Activity History</h3>
        <div className="data-table">
          <div className="table-header gym-cols">
            <span>Date</span><span>Gym 🏋️</span><span>TT 🏓</span><span>Badminton 🏸</span>
          </div>
          {sorted.map((p, i) => (
            <div key={i} className={`table-row gym-cols ${i%2===0?'row-even':''}`}>
              <span>{formatDate(p.date)}</span>
              <span>{isActive(p) && p.activity==='Gym' ? '✅' : '—'}</span>
              <span>{isActive(p) && p.activity==='TT' ? '✅' : '—'}</span>
              <span>{isActive(p) && p.activity==='Badminton' ? '✅' : '—'}</span>
            </div>
          ))}
          {sorted.length === 0 && <div className="empty-state">No activity logged yet</div>}
        </div>
      </div>
    </div>
  );
}

// ─── INVEST TAB ───────────────────────────────────────────────────────────
function InvestTab({ investments, onAdd }) {
  const sundays = getSundays();
  const [form, setForm] = useState({
    date: sundays[0] ? sundays[0].toISOString().split('T')[0] : '',
    inv_mf:'', curr_mf:''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const calcPct = (inv, curr) => {
    if (!inv || !curr || parseFloat(inv) === 0) return '';
    return (((parseFloat(curr) - parseFloat(inv)) / parseFloat(inv)) * 100).toFixed(2);
  };

  const submit = async () => {
    if (!form.inv_mf || !form.curr_mf) return alert("Enter invested and current values");
    setLoading(true);
    try {
      await fetch(`${API}/investments`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...form, ret_pct: calcPct(form.inv_mf, form.curr_mf)})
      });
      setSuccess(true); onAdd();
      setForm({ date: sundays[0] ? sundays[0].toISOString().split('T')[0] : '', inv_mf:'', curr_mf:'' });
      setTimeout(() => setSuccess(false), 2000);
    } finally { setLoading(false); }
  };

  const sorted = [...investments].sort((a,b) => new Date(b.date) - new Date(a.date));
  const pct = calcPct(form.inv_mf, form.curr_mf);

  return (
    <div className="invest-layout">
      <div className="invest-form-card">
        <h3 style={{fontFamily:'Syne',fontWeight:700,marginBottom:'0.25rem'}}>Log Weekly Snapshot</h3>
        <div className="form-group">
          <label>Date (Sundays only)</label>
          <select className="sel" value={form.date} onChange={e => set('date', e.target.value)}>
            {sundays.map(s => {
              const iso = s.toISOString().split('T')[0];
              return <option key={iso} value={iso}>{iso} ({s.toLocaleDateString('en-IN',{weekday:'short'})})</option>;
            })}
          </select>
        </div>
        <div className="form-group">
          <label>Invested Amount (MF) ₹</label>
          <input className="inp" type="number" placeholder="0" value={form.inv_mf} onChange={e => set('inv_mf', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Current Value (MF) ₹</label>
          <input className="inp" type="number" placeholder="0" value={form.curr_mf} onChange={e => set('curr_mf', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Return % (auto-calculated)</label>
          <input className="inp" readOnly value={pct ? `${pct}%` : ''} style={{opacity:0.7,cursor:'not-allowed'}} />
        </div>
        {form.inv_mf && form.curr_mf && (
          <div className={`preview-amount-pill ${parseFloat(form.curr_mf) >= parseFloat(form.inv_mf) ? 'credit' : 'debit'}`}>
            <div className="pill-label">Unrealised Gain / Loss</div>
            <div className={`pill-amount ${parseFloat(form.curr_mf) >= parseFloat(form.inv_mf) ? 'pos' : 'neg'}`}>
              {fmt(parseFloat(form.curr_mf || 0) - parseFloat(form.inv_mf || 0))}
            </div>
          </div>
        )}
        <button className={`submit-btn ${success?'success':''}`} onClick={submit} disabled={loading}>
          {loading ? "Saving..." : success ? "✅ Logged!" : "Save Snapshot"}
        </button>
      </div>

      <div>
        <h3 className="section-title">📋 Investment History</h3>
        <div className="data-table">
          <div className="table-header inv-cols">
            <span>Date</span><span>INV (MF)</span><span>CURR (MF)</span><span>RET ₹</span><span>RET %</span><span>Status</span>
          </div>
          {sorted.map((inv, i) => {
            const ret = parseFloat(inv.ret_amount);
            return (
              <div key={i} className={`table-row inv-cols ${i%2===0?'row-even':''}`}>
                <span>{formatDate(inv.date)}</span>
                <span>{fmt(inv.inv_mf)}</span>
                <span>{fmt(inv.curr_mf)}</span>
                <span className={ret >= 0 ? 'pos' : 'neg'}>{fmt(ret)}</span>
                <span className={parseFloat(inv.ret_pct) >= 0 ? 'pos' : 'neg'}>{fmtPct(inv.ret_pct)}</span>
                <span style={{fontSize:'1.2rem'}}>{inv.status}</span>
              </div>
            );
          })}
          {sorted.length === 0 && <div className="empty-state">No investment snapshots yet</div>}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [physical, setPhysical] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [allTransactionsLoaded, setAllTransactionsLoaded] = useState(false);

  // Load all transactions (for MoneyTab) - lazy loaded when needed
  const fetchAllTransactions = useCallback(async () => {
    if (allTransactionsLoaded) return;
    try {
      let allTx = [];
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const res = await fetch(`${API}/transactions?limit=500&offset=${offset}`).then(r => r.json());
        allTx = allTx.concat(res.transactions);
        hasMore = res.hasMore;
        offset += 500;
      }
      
      setTransactions(allTx);
      setAllTransactionsLoaded(true);
    } catch(e) {
      console.error("Failed to load all transactions", e);
    }
  }, [allTransactionsLoaded]);

  const fetchAll = useCallback(async () => {
    try {
      const [acc, phy, inv] = await Promise.all([
        fetch(`${API}/accounts`).then(r => r.json()),
        fetch(`${API}/physical`).then(r => r.json()),
        fetch(`${API}/investments`).then(r => r.json()),
      ]);
      
      // Initial transactions load: only recent 100 for fast initial render
      const txRes = await fetch(`${API}/transactions?limit=100&offset=0`).then(r => r.json());
      
      // Merge stored balances into accounts (localStorage takes priority)
      const storedBalances = getStoredBalances() || {};
      const mergedAccounts = acc.map(a => ({
        ...a,
        balance: storedBalances[a.account] !== undefined ? storedBalances[a.account] : a.balance
      }));
      
      setAccounts(mergedAccounts);
      saveBalances(mergedAccounts); // save the merged result
      setTransactions(txRes.transactions);
      setAllTransactionsLoaded(false); // Mark as not fully loaded yet
      setPhysical(phy);
      setInvestments(inv);
    } catch(e) {
      console.error("API error — is the backend running?", e);
      // Fall back to localStorage balances if available
      const storedBalances = getStoredBalances();
      if (storedBalances) {
        // Reconstruct accounts with stored balances
        const reconstructedAccounts = Object.entries(BANKS).map(([account, _]) => ({
          account,
          balance: storedBalances[account] || 0
        }));
        setAccounts(reconstructedAccounts);
      }
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
      case 0: return <HomeTab accounts={accounts} transactions={transactions} physical={physical} investments={investments} onSyncBalances={syncBalances} onImportCSV={importCSV} />;
      case 1: return <MoneyTab accounts={accounts} transactions={transactions} />;
      case 2: return <AddTab accounts={accounts} onAdd={fetchAll} />;
      case 3: return <GymTab physical={physical} onAdd={fetchAll} />;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, balance: parseFloat(balance) }),
      })
    )
  );
  // Save synced balances to localStorage
  const balanceObj = {};
  Object.entries(data).forEach(([account, balance]) => {
    balanceObj[account] = parseFloat(balance);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(balanceObj));
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })
    .then(r => r.json())
    .then(data => {
      alert(`✅ Imported ${data.imported} transactions successfully!`);
      fetchAll();
    })
    .catch(e => alert('❌ Import failed: ' + e.message));

}, [fetchAll]);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: sidebarMinimized ? '70px' : '250px', transition: 'width 0.3s ease' }}>
        <div className="sidebar-logo" onClick={() => setTab(0)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', position: 'relative', cursor: 'pointer' }}>
          <div style={{ textAlign: 'center', opacity: sidebarMinimized ? 0 : 1, transition: 'opacity 0.3s ease 0.05s', pointerEvents: sidebarMinimized ? 'none' : 'auto' }}>
            <span className="logo-name">LifeTrack</span>
            <span className="logo-sub">Personal Dashboard</span>
          </div>
          <div style={{ opacity: sidebarMinimized ? 1 : 0, transition: 'opacity 0.3s ease 0.05s', pointerEvents: sidebarMinimized ? 'auto' : 'none', position: 'absolute' }}>
            <span className="logo-name" style={{ fontSize: '1.2rem' }}>LT</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''} ${t.add ? 'add-item' : ''}`}
              onClick={() => setTab(t.id)}
              title={sidebarMinimized ? t.label : ''}
              style={{ justifyContent: sidebarMinimized ? 'center' : 'flex-start' }}
            >
              <span className="nav-icon">{t.icon}</span>
              <span className="nav-label" style={{ display: sidebarMinimized ? 'none' : 'inline', transition: 'opacity 0.3s ease' }}>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button 
            onClick={() => setSidebarMinimized(!sidebarMinimized)}
            style={{ 
              width: '100%', 
              padding: '0.5rem 0.35rem', 
              border: 'none', 
              background: 'transparent', 
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
              transition: 'color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              fontFamily: "'Syne', sans-serif",
              marginBottom: '1.5rem',
              height: '32px',
              lineHeight: '1'
            }}
            onMouseEnter={(e) => e.target.style.color = 'var(--accent)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--text)'}
            title={sidebarMinimized ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarMinimized ? '⬅' : '➡'}
            <span style={{ opacity: sidebarMinimized ? 0 : 1, transition: 'opacity 0.3s ease', fontSize: '0.75rem', letterSpacing: '0.5px', width: sidebarMinimized ? '0' : 'auto', pointerEvents: sidebarMinimized ? 'none' : 'auto' }}>HIDE</span>
          </button>
          <div style={{ opacity: sidebarMinimized ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: sidebarMinimized ? 'none' : 'auto' }}>
            <div className="sidebar-date">{today.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
            <div style={{marginTop:'2px'}}>{today.toLocaleDateString('en-IN', {weekday:'long'})}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">{TAB_TITLES[tab]}</div>
          <div className="topbar-badge">{dateStr}</div>
        </header>
        <main className="page-body" key={tab}>
          {renderTab()}
        </main>
      </div>
    </div>
  );
}

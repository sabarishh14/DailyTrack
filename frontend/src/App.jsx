import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from './pages/SabDekho';

import { API, TABS, TAB_TITLES } from './constants';
import { getToken } from './utils';
import { auth } from './config/firebase';
import MemoizedHomeTab from './pages/HomeTab';
import MemoizedMoneyTab from './pages/MoneyTab';
import MemoizedAddTab from './pages/AddTab';
import MemoizedGymTab from './pages/GymTab';
import MemoizedInvestTab from './pages/InvestTab';
import MemoizedSabDekho from './pages/SabDekho';
import LoginPage from './components/LoginPage';
import LoadingScreen from './components/LoadingScreen';
import AddActivityModal from './components/AddActivityModal';
import SecretAdminModal from './components/SecretAdminModal';
import GlobalSearchModal from './components/GlobalSearchModal';
import EditTransactionModal from './components/EditTransactionModal';
import FloatingChatWidget from './components/FloatingChatWidget';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('dt_token'));
  const [appLoading, setAppLoading] = useState(!!localStorage.getItem('dt_token'));
  const [tab, setTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 🚀 GLOBAL SEARCH STATES
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [globalSearchEditTx, setGlobalSearchEditTx] = useState(null);
  const [globalActionTx, setGlobalActionTx] = useState(null);

  // 🚀 GLOBAL SEARCH KEYBOARD LISTENER
  useEffect(() => {
    const handleCmdK = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, []);

  const [loadingLogs, setLoadingLogs] = useState([]);
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
  const menuRef = useRef(null);

  // 🚀 GLOBAL ESCAPE: Closes App-level Modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setIsActivityModalOpen(false);
        setIsSecretMenuOpen(false);
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Close hamburger menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

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

  // --- Theme & Accent Logic ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [accent, setAccent] = useState(localStorage.getItem('dt_accent') || 'indigo');

  // --- SabDekho Settings ---
  const [showMovies, setShowMovies] = useState(localStorage.getItem('dt_show_movies') === 'true');
  const [enableNagapandi, setEnableNagapandi] = useState(localStorage.getItem('dt_enable_nagapandi') === 'true');
  const toggleNagapandi = () => {
    const val = !enableNagapandi;
    setEnableNagapandi(val);
    localStorage.setItem('dt_enable_nagapandi', val);
  };
  const [lbxUsername, setLbxUsername] = useState(localStorage.getItem('dt_lbx_username') || 'sabarishh14');
  const [lbxSyncing, setLbxSyncing] = useState(false);
  const [lbxSyncStatus, setLbxSyncStatus] = useState('');
  const [sabDekhoRefresh, setSabDekhoRefresh] = useState(0);

  const toggleShowMovies = () => {
    const val = !showMovies;
    setShowMovies(val);
    localStorage.setItem('dt_show_movies', val);
  };

  const syncLetterboxd = async () => {
    if (!lbxUsername) return alert("Please enter Letterboxd username");
    setLbxSyncing(true);
    setLbxSyncStatus('Syncing...');
    localStorage.setItem('dt_lbx_username', lbxUsername);
    try {
      const response = await fetch(`${API}/movies/sync/rss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ username: lbxUsername })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let finalData = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status === 'complete') {
              finalData = data;
            } else if (data.status) {
              setLbxSyncStatus(data.status);
            } else if (data.message) {
              setLbxSyncStatus(`Error: ${data.message}`);
            }
          } catch (e) { }
        }
      }

      if (finalData && finalData.success) {
        setLbxSyncStatus(`Synced! Added ${finalData.added_movies} movies, ${finalData.added_logs} logs.`);
        setSabDekhoRefresh(prev => prev + 1); // Trigger SabDekho refresh
      } else if (finalData && !finalData.success) {
        setLbxSyncStatus(`Error: ${finalData.message}`);
      }
    } catch (e) {
      setLbxSyncStatus(`Sync failed: ${e.message}`);
    }
    setLbxSyncing(false);
  };

  const ACCENT_PALETTES = [
    { id: 'indigo', color: '#6366f1', label: 'Indigo' },
    { id: 'ocean', color: '#0ea5e9', label: 'Ocean' },
    { id: 'rose', color: '#f43f5e', label: 'Rose' },
    { id: 'emerald', color: '#10b981', label: 'Emerald' },
    { id: 'amber', color: '#f59e0b', label: 'Amber' },
  ];

  const logout = useCallback(() => {
    signOut(auth);
    localStorage.removeItem('dt_token');
    localStorage.removeItem('dt_is_admin'); // <-- ADD THIS LINE
    setIsLoggedIn(false);
    setAllTransactionsLoaded(false);
    setTransactions([]);
    setAccounts([]);
    setPhysical([]);
    setInvestments([]);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('dt_accent', accent);
  }, [accent]);

  // Keep Hugging Face Space awake while the tab is open!
  useEffect(() => {
    if (!isLoggedIn) return;
    const pingInterval = setInterval(() => {
      // Pings the /test-db route every 3 minutes
      fetch(API.replace('/api', '/test-db')).catch(() => { });
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
        const r = await fetch(`${API}/transactions?limit=500&offset=${offset}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (r.status === 401) { logout(); break; }
        const res = await r.json();

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
    } catch (e) {
      console.error("Failed to load all transactions", e);
    }
  }, [allTransactionsLoaded, logout]);

  const fetchAll = useCallback(async (showLoading = false, attempt = 1) => {
    if (showLoading) setAppLoading(true);

    const addLog = (msg) => {
      setLoadingLogs(prev => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return [...prev, `[${time}] ${msg}`];
      });
    };

    try {
      if (showLoading) {
        setLoadingLogs([]); // reset
        addLog("Initializing startup sequence...");
      }

      // Trigger Lazy Cron before fetching data so UI gets the updated values
      if (getToken()) {
        if (showLoading) addLog("Authenticating & verifying background tasks...");
        await fetch(`${API}/cron/process-recurring`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } }).catch(() => console.log("Cron passed"));
      }

      // Helper function that explicitly throws an error if the server is throwing 500/503 during wake-up
      const fetchWithCheck = async (url, name) => {
        if (showLoading) addLog(`Fetching ${name}...`);
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (r.status === 401) {
          logout();
          throw new Error("UNAUTHORIZED");
        }
        if (!r.ok) throw new Error(`Server waking up: ${r.status}`);
        if (showLoading) addLog(`${name} loaded OK.`);
        return r.json();
      };

      if (showLoading) addLog("Connecting to LifeTrack database...");

      // Fire ALL 6 requests in parallel
      const [acc, phy, inv, manAssets, txRes, listRes, catRes] = await Promise.all([
        fetchWithCheck(`${API}/accounts`, 'Accounts'),
        fetchWithCheck(`${API}/physical`, 'Health & Fitness'),
        fetchWithCheck(`${API}/investments`, 'Investments'),
        fetchWithCheck(`${API}/manual_assets`, 'Manual Assets'),
        fetchWithCheck(`${API}/transactions?limit=100&offset=0`, 'Transactions (Batch 1)'),
        fetchWithCheck(`${API}/assets/list`, 'Market Symbols'),
        fetchWithCheck(`${API}/transactions/categories`, 'Categories')
      ]);

      if (showLoading) addLog("Data parsed successfully. Finalizing UI...");

      setAccounts(acc);
      setTransactions(txRes.transactions);
      setAllTransactionsLoaded(false);
      setPhysical(phy);
      setInvestments(inv);
      setManualAssets(manAssets);
      setAssetList(listRes); // 🚀 SAVE SYMBOLS
      if (catRes && catRes.success) setCategories(catRes.categories);

      // Also trigger SabDekho refresh
      setSabDekhoRefresh(prev => prev + 1);

      if (showLoading) setAppLoading(false);
    } catch (e) {
      if (e.message === "UNAUTHORIZED") {
        setAppLoading(false);
        return;
      }
      if (showLoading) {
        addLog(`Server unavailable (${e.message.split(':')[0] || 'timeout'}). Retrying in 3s... (Attempt ${attempt}/5)`);
      }
      console.warn("Server is asleep or database is booting. Retrying in 3 seconds...", e.message);

      if (attempt >= 5) {
        if (showLoading) addLog("Max connection attempts reached. Backend is unreachable. Please try again later.");
        return;
      }

      // The loading screen stays up, and we try again automatically!
      setTimeout(() => fetchAll(showLoading, attempt + 1), 3000);
    }
  }, [logout]);

  useEffect(() => { if (isLoggedIn) fetchAll(true); }, [fetchAll, isLoggedIn]);

  // Load all transactions when MoneyTab is opened
  useEffect(() => {
    if (tab === 1) {
      fetchAllTransactions();
    }
  }, [tab, fetchAllTransactions]);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const renderTab = () => {
    return (
      <>
        {tab === 0 && <MemoizedHomeTab accounts={accounts ?? []} transactions={transactions ?? []} physical={physical ?? []} investments={investments ?? []} onSyncBalances={syncBalances} fetchAllTransactions={fetchAllTransactions} onRefresh={fetchAll} />}
        <div style={{ display: tab === 1 ? 'contents' : 'none' }}>
          <MemoizedMoneyTab accounts={accounts} transactions={transactions} categories={categories} onRefresh={fetchAll} globalActionTx={globalActionTx} setGlobalActionTx={setGlobalActionTx} />
        </div>
        {tab === 2 && <MemoizedAddTab accounts={accounts} transactions={transactions} categories={categories} onAdd={fetchAll} />}
        {tab === 3 && <MemoizedGymTab physical={physical} onOpenModal={() => setIsActivityModalOpen(true)} />}
        {tab === 4 && <MemoizedInvestTab investments={investments} manualAssets={manualAssets} assetList={assetList} onAdd={fetchAll} />}
        {tab === 5 && <MemoizedSabDekho API={API} getToken={getToken} showMovies={showMovies} refreshTrigger={sabDekhoRefresh} />}
      </>
    );
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
  if (appLoading) return <LoadingScreen logs={loadingLogs} />;

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
                ? today.toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: '2-digit' })
                : today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
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
              {today.toLocaleDateString('en-IN', { weekday: 'long' })}
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

            {/* -1. Refresh Button */}
            <button
              className="action-btn secondary"
              style={{ padding: '0.4rem', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '1.2rem', cursor: isRefreshing ? 'default' : 'pointer', transition: 'transform 0.3s' }}
              onClick={async () => {
                if (isRefreshing) return;
                setIsRefreshing(true);
                await fetchAll(false);
                setIsRefreshing(false);
              }}
              title="Reload Data"
            >
              <svg
                style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.26l5.08 5.08" />
              </svg>
            </button>

            {/* 0. Global Search Button */}
            <button
              className="action-btn secondary"
              style={{ padding: '0.4rem', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '1.2rem', cursor: 'pointer' }}
              onClick={() => setIsSearchOpen(true)}
              title="Global Search (Cmd+K)"
            >
              🔍
            </button>

            {/* 1. Theme Toggle (Animated Pill) */}
            <button
              className={`theme-toggle ${theme === 'light' ? 'light' : ''}`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              <span className="theme-toggle-thumb" />
            </button>

            {/* 2. Menu Button */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '0.4rem', display: 'flex' }}
              >
                <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>

              {isMenuOpen && (
                <div className="menu-dropdown">
                  {/* Accent Picker */}
                  <div className="menu-section">
                    <div className="menu-section-title">Accent Color</div>
                    <div className="accent-picker">
                      {ACCENT_PALETTES.map(p => (
                        <div
                          key={p.id}
                          className={`accent-dot ${accent === p.id ? 'active' : ''}`}
                          style={{ background: p.color }}
                          title={p.label}
                          onClick={() => setAccent(p.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* SabDekho Settings */}
                  <div className="menu-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                    <div className="menu-section-title">Features</div>

                    <div className="toggle-container" onClick={toggleNagapandi} style={{ marginTop: '12px', marginBottom: '8px', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text2)', fontSize: '0.85rem', fontWeight: 600 }}>✨ Nagapandi AI</span>
                      <div className={`toggle-switch ${enableNagapandi ? 'active' : ''}`}>
                        <div className="toggle-knob" />
                      </div>
                    </div>

                    <div className="menu-section-title" style={{ marginTop: '1rem' }}>SabDekho Settings</div>

                    <div className="toggle-container" onClick={toggleShowMovies} style={{ marginTop: '12px', marginBottom: '8px', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text2)', fontSize: '0.85rem', fontWeight: 600 }}>Movies</span>
                      <div className={`toggle-switch ${showMovies ? 'active' : ''}`}>
                        <div className="toggle-knob" />
                      </div>
                    </div>

                    {showMovies && (
                      <div className="lbx-sync-container">
                        <input
                          type="text"
                          className="lbx-input"
                          value={lbxUsername}
                          onChange={e => setLbxUsername(e.target.value)}
                          placeholder="Letterboxd Username"
                        />
                        <button className="lbx-btn" onClick={syncLetterboxd} disabled={lbxSyncing}>
                          {lbxSyncing ? 'Syncing...' : 'Sync RSS'}
                        </button>
                        {lbxSyncStatus && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '4px', textAlign: 'center' }}>
                            {lbxSyncStatus}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Logout */}
                  <div className="menu-section">
                    <button
                      onClick={() => { setIsMenuOpen(false); logout(); }}
                      style={{
                        width: '100%', background: 'rgba(239, 68, 68, 0.1)',
                        border: 'none', borderRadius: '8px', padding: '0.6rem 1rem',
                        color: 'var(--neg)', cursor: 'pointer', fontSize: '0.85rem',
                        fontWeight: 600, textAlign: 'left', display: 'flex', gap: '8px',
                        fontFamily: "'DM Sans', sans-serif"
                      }}
                    >
                      🚪 Logout
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>
        <main className="page-body">
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


      {/* 🚀 GLOBAL SEARCH UI */}
      <GlobalSearchModal getToken={getToken}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        transactions={transactions}
        onNavigate={(id) => setTab(id)}
        onEditTx={(tx) => { setTab(1); setGlobalActionTx(tx); }}
        onAction={(action) => {
          if (action === 'theme') setTheme(theme === 'dark' ? 'light' : 'dark');
          if (action === 'balances') setShowBalances(!showBalances);
        }}
      />

      {globalSearchEditTx && (
        <EditTransactionModal
          tx={globalSearchEditTx}
          categories={categories}
          recentDescriptions={[]}
          onClose={() => setGlobalSearchEditTx(null)}
          onRefresh={fetchAll}
          isCopy={false}
        />
      )}

      {enableNagapandi && <FloatingChatWidget getToken={getToken} />}
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

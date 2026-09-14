import { TAB_TITLES } from '../../constants';

const ACCENT_PALETTES = [
  { id: 'indigo', color: '#6366f1', label: 'Indigo' },
  { id: 'ocean', color: '#0ea5e9', label: 'Ocean' },
  { id: 'rose', color: '#f43f5e', label: 'Rose' },
  { id: 'emerald', color: '#10b981', label: 'Emerald' },
  { id: 'amber', color: '#f59e0b', label: 'Amber' },
];

export default function TopBar({
  tab,
  isRefreshing,
  onRefresh,
  onOpenSearch,
  theme,
  setTheme,
  isMenuOpen,
  setIsMenuOpen,
  menuRef,
  accent,
  setAccent,
  enableNagapandi,
  toggleNagapandi,
  showMovies,
  toggleShowMovies,
  lbxUsername,
  setLbxUsername,
  lbxSyncing,
  lbxSyncStatus,
  syncLetterboxd,
  logout,
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">{TAB_TITLES[tab]}</div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>

        {/* -1. Refresh Button */}
        <button
          className="action-btn secondary"
          style={{ padding: '0.4rem', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '1.2rem', cursor: isRefreshing ? 'default' : 'pointer', transition: 'transform 0.3s' }}
          onClick={onRefresh}
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
          onClick={onOpenSearch}
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
  );
}

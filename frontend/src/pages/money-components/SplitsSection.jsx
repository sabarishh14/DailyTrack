import { fmt } from '../../utils';

export default function SplitsSection({
  splitsExpanded,
  setSplitsExpanded,
  activeSplits,
  settledSplits,
  splitBalances,
  totalOwed,
  settlingPerson,
  handleSettlePerson,
  handleToggleSplitPaid,
}) {
  if (activeSplits.length === 0 && settledSplits.length === 0) return null;

  return (
    <div className="analyser-card">
      <div
        className={`analyser-header ${splitsExpanded ? 'open' : ''}`}
        onClick={() => setSplitsExpanded(!splitsExpanded)}
      >
        <div className="analyser-header-left">
          <div className="analyser-header-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>🤝</div>
          <div>
            <div className="analyser-header-title">Splits</div>
            <div className="analyser-header-sub" style={{ display: splitsExpanded ? 'none' : 'block' }}>
              {totalOwed > 0
                ? <span>{splitBalances.length} {splitBalances.length === 1 ? 'person owes' : 'people owe'} you <span style={{ color: 'var(--pos)', fontWeight: 700 }}>{fmt(totalOwed)}</span></span>
                : <span style={{ color: 'var(--pos)' }}>All settled up ✓</span>
              }
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Quick counters */}
          {!splitsExpanded && activeSplits.length > 0 && (
            <span className="splits-badge splits-badge-active">{activeSplits.length} active</span>
          )}
          {!splitsExpanded && settledSplits.length > 0 && (
            <span className="splits-badge splits-badge-settled">{settledSplits.length} settled</span>
          )}
          <span className={`analyser-chevron ${splitsExpanded ? 'open' : ''}`} style={{ marginLeft: '4px' }}>▼</span>
        </div>
      </div>

      {splitsExpanded && (
        <div style={{ animation: 'fadeIn 0.3s ease', padding: '1.5rem' }}>

          {/* Person Balance Cards */}
          {splitBalances.length > 0 && (
            <div className="splits-people-grid">
              {splitBalances.map(b => (
                <div key={b.name} className="splits-person-card">
                  <div className="splits-person-avatar">{b.name.charAt(0).toUpperCase()}</div>
                  <div className="splits-person-info">
                    <div className="splits-person-name">{b.name}</div>
                    <div className="splits-person-amount">{fmt(b.amount)}</div>
                  </div>
                  <button
                    className="splits-settle-btn"
                    onClick={() => handleSettlePerson(b.name)}
                    disabled={settlingPerson === b.name}
                  >
                    {settlingPerson === b.name ? (
                      <span className="splits-settle-spinner">⏳</span>
                    ) : (
                      <>✓ Settle</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Total owed summary */}
          {totalOwed > 0 && (
            <div className="splits-total-bar">
              <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Total owed to you</span>
              <span style={{ color: 'var(--pos)', fontWeight: 700, fontSize: '1.1rem' }}>{fmt(totalOwed)}</span>
            </div>
          )}

          {/* Active / Settled tabs */}
          <div className="splits-tab-bar">
            <button
              className={`splits-tab-btn ${!settledSplits.length || activeSplits.length > 0 ? 'active' : ''}`}
              onClick={() => {
                document.getElementById('splits-active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }}
              style={{ cursor: 'default' }}
            >
              Active ({activeSplits.length})
            </button>
            {settledSplits.length > 0 && (
              <button
                className="splits-tab-btn"
                onClick={() => {
                  document.getElementById('splits-settled')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
                style={{ cursor: 'default' }}
              >
                Settled ({settledSplits.length})
              </button>
            )}
          </div>

          {/* Active Splits */}
          {activeSplits.length > 0 && (
            <div id="splits-active" style={{ marginBottom: '1.5rem' }}>
              <div className="splits-list">
                {activeSplits.map(t => {
                  const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
                  return (
                    <div key={t.id} className="splits-tx-card">
                      <div className="splits-tx-top">
                        <div className="splits-tx-left">
                          <div className="splits-tx-desc">{t.description || t.heading || '—'}</div>
                          <div className="splits-tx-meta">{dateStr} &middot; {t.account} &middot; {t.heading}</div>
                        </div>
                        <div className="splits-tx-amount">
                          <span style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill</span>
                          <span>{fmt(t.split.total_amount)}</span>
                        </div>
                      </div>
                      <div className="splits-members">
                        {t.split.members.map((m, idx) => (
                          <div key={idx} className={`splits-member ${m.paid ? 'paid' : ''}`}>
                            <div className="splits-member-left">
                              <div className={`splits-member-dot ${m.paid ? 'paid' : 'unpaid'}`} />
                              <span className="splits-member-name">{m.name}</span>
                            </div>
                            <div className="splits-member-right">
                              <span className="splits-member-amt">{fmt(m.amount)}</span>
                              {m.name.toLowerCase() !== 'you' && (
                                <button
                                  className={`splits-toggle-btn ${m.paid ? 'is-paid' : 'is-unpaid'}`}
                                  onClick={() => handleToggleSplitPaid(t, idx)}
                                >
                                  {m.paid ? 'Paid' : 'Owes'}
                                </button>
                              )}
                              {m.name.toLowerCase() === 'you' && (
                                <span className="splits-you-badge">You</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeSplits.length === 0 && (
            <div className="splits-empty">
              <span style={{ fontSize: '2rem' }}>🎉</span>
              <div>All settled up! No pending splits.</div>
            </div>
          )}

          {/* Settled Splits */}
          {settledSplits.length > 0 && (
            <div id="splits-settled">
              <div style={{ fontSize: '0.8rem', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', paddingLeft: '2px' }}>
                Settled &middot; {settledSplits.length}
              </div>
              <div className="splits-list">
                {settledSplits.map(t => {
                  const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
                  return (
                    <div key={t.id} className="splits-tx-card settled">
                      <div className="splits-tx-top">
                        <div className="splits-tx-left">
                          <div className="splits-tx-desc">{t.description || t.heading || '—'}</div>
                          <div className="splits-tx-meta">{dateStr} &middot; {t.account}</div>
                        </div>
                        <div className="splits-tx-amount" style={{ color: 'var(--text3)' }}>
                          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill</span>
                          <span>{fmt(t.split.total_amount)}</span>
                        </div>
                      </div>
                      <div className="splits-members">
                        {t.split.members.map((m, idx) => (
                          <div key={idx} className="splits-member paid">
                            <div className="splits-member-left">
                              <div className="splits-member-dot paid" />
                              <span className="splits-member-name">{m.name}</span>
                            </div>
                            <div className="splits-member-right">
                              <span className="splits-member-amt">{fmt(m.amount)}</span>
                              <span className="splits-settled-check">✓</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

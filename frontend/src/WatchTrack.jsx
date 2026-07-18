import { useState, useEffect, useRef, useCallback } from 'react';

const TMDB_IMG = 'https://image.tmdb.org/t/p';
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── STAR RATING (FIXED) ────────────────────────────────────────────────
function StarRating({ value = 0, onChange, size = 22, readonly = false }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="tv-stars" style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          className="tv-star-wrap"
          style={{ position: 'relative', width: size, height: size, cursor: readonly ? 'default' : 'pointer', display: 'inline-block' }}
          onMouseLeave={() => !readonly && setHover(0)}
        >
          {/* Left half = x.5 */}
          {!readonly && (
            <span
              style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', zIndex: 2 }}
              onMouseEnter={() => setHover(star - 0.5)}
              onClick={() => onChange && onChange(star - 0.5 === value ? 0 : star - 0.5)}
            />
          )}
          {/* Right half = x.0 */}
          {!readonly && (
            <span
              style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%', zIndex: 2 }}
              onMouseEnter={() => setHover(star)}
              onClick={() => onChange && onChange(star === value ? 0 : star)}
            />
          )}
          <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
            <defs>
              <linearGradient id={`sh-${star}`}>
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="50%" stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              fill={active >= star ? '#f59e0b' : active >= star - 0.5 ? `url(#sh-${star})` : 'transparent'}
              stroke={active >= star - 0.5 ? '#f59e0b' : 'var(--border2)'}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ))}
      {value > 0 && !readonly && <span style={{ fontSize: '0.75rem', color: 'var(--text2)', marginLeft: '4px', alignSelf: 'center' }}>{value}</span>}
    </div>
  );
}

// ─── STAR DISPLAY (compact, read-only) ──────────────────────────────────
function StarDisplay({ value, size = 13 }) {
  if (!value) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '1px', verticalAlign: 'middle' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24">
          <defs><linearGradient id={`sd${s}${value}`}><stop offset="50%" stopColor="#f59e0b" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={value >= s ? '#f59e0b' : value >= s - 0.5 ? `url(#sd${s}${value})` : 'transparent'}
            stroke={value >= s - 0.5 ? '#f59e0b' : 'rgba(255,255,255,0.1)'}
            strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────
export default function WatchTrack({ API, getToken }) {
  const [view, setView] = useState('library'); // library | diary | activity
  const [shows, setShows] = useState([]);
  const [diaryLogs, setDiaryLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  // Modal
  const [selectedShow, setSelectedShow] = useState(null);
  const [showDetails, setShowDetails] = useState(null);
  const [showDetailsLoading, setShowDetailsLoading] = useState(false);

  // Log form
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logSeason, setLogSeason] = useState('');
  const [logEpisodes, setLogEpisodes] = useState([]); // multi-select
  const [logRating, setLogRating] = useState(0);
  const [logReview, setLogReview] = useState('');
  const [logTags, setLogTags] = useState('');
  const [logLiked, setLogLiked] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [modalView, setModalView] = useState('log'); // log | details
  const [editingLogIds, setEditingLogIds] = useState(null);

  // Filter
  const [mediaType, setMediaType] = useState('all'); // 'movies', 'all', 'tv'
  const [statusFilter, setStatusFilter] = useState('Watching');

  // Calendar
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  const hdrs = useCallback(() => ({
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
  }), [getToken]);

  // ─── FETCHERS ─────────────────────────────────────────────────────────
  const fetchShows = useCallback(async () => {
    try {
      const [tvRes, movRes] = await Promise.all([
        fetch(`${API}/tv/shows`, { headers: hdrs() }).then(r => r.json()),
        fetch(`${API}/movies`, { headers: hdrs() }).then(r => r.json())
      ]);
      let combined = [];
      if (tvRes.success) combined = [...combined, ...tvRes.shows.map(s => ({ ...s, type: 'tv' }))];
      if (movRes.success) combined = [...combined, ...movRes.movies.map(s => ({ ...s, type: 'movie' }))];
      combined.sort((a, b) => new Date(b.added_on) - new Date(a.added_on));
      setShows(combined);
    } catch (e) { console.error(e); }
  }, [API, hdrs]);

  const fetchDiary = useCallback(async () => {
    try {
      const [tvRes, movRes] = await Promise.all([
        fetch(`${API}/tv/diary`, { headers: hdrs() }).then(r => r.json()),
        fetch(`${API}/movies/diary`, { headers: hdrs() }).then(r => r.json())
      ]);
      let combined = [];
      if (tvRes.success) combined = [...combined, ...tvRes.logs.map(l => ({ ...l, type: 'tv' }))];
      if (movRes.success) combined = [...combined, ...movRes.logs.map(l => ({ ...l, type: 'movie' }))];
      combined.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        return dateDiff !== 0 ? dateDiff : new Date(b.created_at) - new Date(a.created_at);
      });
      setDiaryLogs(combined);
    } catch (e) { console.error(e); }
  }, [API, hdrs]);

  useEffect(() => {
    Promise.all([fetchShows(), fetchDiary()]).finally(() => setLoading(false));
  }, []);

  // ─── DEBOUNCED SEARCH ─────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(`${API}/media/search?q=${encodeURIComponent(searchQuery)}`, { headers: hdrs() });
        const d = await r.json();
        if (d.success) {
          let results = d.data.results || [];
          results = results.filter(r => r.media_type === 'tv' || r.media_type === 'movie');
          setSearchResults(results);
        }
      } catch (e) { console.error(e); }
      setSearchLoading(false);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  useEffect(() => {
    const fn = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // ─── ACTIONS ──────────────────────────────────────────────────────────
  const addShow = async (tmdbShow) => {
    setShowDropdown(false); setSearchQuery('');
    try {
      const endpoint = tmdbShow.media_type === 'movie' ? '/movies' : '/tv/shows';
      const name = tmdbShow.title || tmdbShow.name;
      const status = tmdbShow.media_type === 'movie' ? 'Plan to Watch' : 'Watching';
      const r = await fetch(`${API}${endpoint}`, { 
        method: 'POST', headers: hdrs(), 
        body: JSON.stringify({ tmdb_id: tmdbShow.id, name: name, poster_path: tmdbShow.poster_path, status: status }) 
      });
      const d = await r.json();
      if (d.success) fetchShows();
    } catch (e) { console.error(e); }
  };

  const openModal = async (show) => {
    setSelectedShow(show); setShowDetails(null); setShowDetailsLoading(true);
    setLogDate(new Date().toISOString().split('T')[0]);
    setLogSeason(''); setLogEpisodes([]); setLogRating(0); setLogReview(''); setLogTags(''); setLogLiked(false);
    setModalView('log');
    try {
      const endpoint = show.type === 'movie' ? `/movies/details/${show.tmdb_id}` : `/tv/details/${show.tmdb_id}`;
      const r = await fetch(`${API}${endpoint}`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) {
        setShowDetails(d.data);
        if (show.type === 'tv') {
          const validSeasons = d.data.seasons?.filter(s => s.season_number > 0 && s.episode_count > 0) || [];
          if (validSeasons.length > 0) {
            const latestSeason = Math.max(...validSeasons.map(s => s.season_number));
            setLogSeason(latestSeason.toString());
          }
        }
      }
    } catch (e) { console.error(e); }
    setShowDetailsLoading(false);
  };

  const closeModal = () => setSelectedShow(null);

  const updateStatus = async (status) => {
    if (!selectedShow) return;
    setSelectedShow(prev => ({ ...prev, status }));
    setShows(prev => prev.map(s => (s.id === selectedShow.id && s.type === selectedShow.type) ? { ...s, status } : s));
    try {
      const endpoint = selectedShow.type === 'movie' ? `/movies/${selectedShow.id}` : `/tv/shows/${selectedShow.id}`;
      await fetch(`${API}${endpoint}`, { method: 'PUT', headers: hdrs(), body: JSON.stringify({ status }) });
    } catch (e) { console.error(e); fetchShows(); }
  };

  const deleteShow = async () => {
    if (!selectedShow || !confirm(`Remove "${selectedShow.name}"?`)) return;
    try {
      const endpoint = selectedShow.type === 'movie' ? `/movies/${selectedShow.id}` : `/tv/shows/${selectedShow.id}`;
      await fetch(`${API}${endpoint}`, { method: 'DELETE', headers: hdrs() });
      fetchShows(); fetchDiary(); closeModal();
    } catch (e) { console.error(e); }
  };

  const saveDiaryLog = async () => {
    if (!selectedShow) return;
    if (selectedShow.type === 'tv' && !editingLogIds && logSeason && logEpisodes.length === 0) {
      alert("Please select at least one episode to log.");
      return;
    }
    setLogSaving(true);
    try {
      const endpoint = selectedShow.type === 'movie' ? '/movies/diary' : '/tv/diary';
      if (editingLogIds) {
        await fetch(`${API}${endpoint}`, {
          method: 'PUT', headers: hdrs(),
          body: JSON.stringify({ log_ids: editingLogIds, rating: logRating || null, review: logReview || null, liked: logLiked, tags: logTags.trim() || null })
        });
      } else {
        if (selectedShow.type === 'tv') {
          const episodes = logSeason && logEpisodes.length > 0 ? logEpisodes : [null];
          for (const ep of episodes) {
            await fetch(`${API}${endpoint}`, {
              method: 'POST', headers: hdrs(),
              body: JSON.stringify({
                tv_show_id: selectedShow.id, date: logDate,
                season_number: logSeason || null, episode_number: ep,
                rating: logRating || null, review: logReview || null,
                liked: logLiked, tags: logTags.trim() || null
              })
            });
          }
        } else {
          // Movie log
          await fetch(`${API}${endpoint}`, {
            method: 'POST', headers: hdrs(),
            body: JSON.stringify({
              tv_show_id: selectedShow.id, date: logDate,
              rating: logRating || null, review: logReview || null,
              liked: logLiked, tags: logTags.trim() || null
            })
          });
        }
      }
      setEditingLogIds(null);
      fetchDiary();
      closeModal(); // close modal after saving
    } catch (e) { console.error(e); }
    setLogSaving(false);
  };

  const editLog = async (log) => {
    const show = shows.find(s => s.id === log.show_id && s.type === log.type);
    if (!show) return;
    await openModal(show);
    setEditingLogIds(log.log_ids);
    setLogDate(log.date);
    setLogSeason(log.season_number ? log.season_number.toString() : '');
    setLogEpisodes(log.episodes || []);
    setLogRating(log.rating || 0);
    setLogReview(log.review || '');
    setLogTags(log.tags || '');
    setLogLiked(log.liked || false);
  };

  const deleteLog = async (log_ids, logType) => {
    if (!confirm("Delete this diary entry?")) return;
    try {
      const endpoint = logType === 'movie' ? '/movies/diary' : '/tv/diary';
      await fetch(`${API}${endpoint}`, { method: 'DELETE', headers: hdrs(), body: JSON.stringify({ log_ids }) });
      fetchDiary();
    } catch (e) { console.error(e); }
  };

  // ─── HELPERS ──────────────────────────────────────────────────────────
  const getSeasons = () => {
    if (!showDetails?.seasons) return [];
    return showDetails.seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
  };

  const getEpisodes = () => {
    if (!logSeason || !showDetails?.seasons) return [];
    const season = showDetails.seasons.find(s => s.season_number === parseInt(logSeason));
    if (!season) return [];
    return Array.from({ length: season.episode_count }, (_, i) => i + 1);
  };

  const toggleEpisode = (ep) => {
    setLogEpisodes(prev => prev.includes(ep) ? prev.filter(e => e !== ep) : [...prev, ep].sort((a, b) => a - b));
  };

  const selectAllEpisodes = () => {
    setLogSeason('');
    setLogEpisodes([]);
  };

  const filteredShows = shows.filter(s => {
    const passType = mediaType === 'all' || s.type === mediaType;
    const passStatus = statusFilter === 'all' || s.status === statusFilter;
    return passType && passStatus;
  });
  const statusCounts = shows.reduce((acc, s) => {
    if (mediaType === 'all' || s.type === mediaType) {
      acc[s.status] = (acc[s.status] || 0) + 1;
    }
    return acc;
  }, {});

  const fmtDate = (str) => { const d = new Date(str); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; };

  const filteredDiaryLogs = diaryLogs.filter(l => mediaType === 'all' || l.type === mediaType);

  // Group diary by date and aggregate same-day episodes for a show
  const groupedDiary = filteredDiaryLogs.reduce((acc, l) => {
    if (!acc[l.date]) acc[l.date] = [];

    // Check if we already have an entry for this show and season on this date with the SAME review, rating, and tags
    const existing = acc[l.date].find(e => 
      e.type === l.type &&
      e.show_id === l.show_id && 
      e.season_number === l.season_number &&
      e.review === l.review &&
      e.rating === l.rating &&
      e.tags === l.tags
    );

    if (existing && existing.episode_number !== null && l.episode_number !== null) {
      existing.log_ids.push(l.id);
      if (!existing.episodes) {
        existing.episodes = [existing.episode_number];
      }
      if (!existing.episodes.includes(l.episode_number)) {
        existing.episodes.push(l.episode_number);
        existing.episodes.sort((a, b) => a - b);
      }
    } else {
      acc[l.date].push({ ...l, log_ids: [l.id], episodes: l.episode_number ? [l.episode_number] : null });
    }

    return acc;
  }, {});

  if (loading) return (
    <div className="tv-loading-screen">
      <div className="tv-loading-spinner" />
      <p>Loading your library...</p>
    </div>
  );

  // ─── RENDER ───────────────────────────────────────────────────────────
  return (
    <div className="tv-tracker">
      {/* NAV */}
      <div className="tv-header">
        <div className="tv-tabs">
          {[
            { id: 'library', icon: '📚', label: 'Library' },
            { id: 'diary', icon: '📅', label: 'Diary' }
          ].map(t => (
            <button key={t.id} className={`tv-tab ${view === t.id ? 'active' : ''}`} onClick={() => setView(t.id)}>
              <span className="tv-tab-icon">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="tv-media-toggle">
          <button className={mediaType === 'movie' ? 'active' : ''} onClick={() => { setMediaType('movie'); setStatusFilter('all'); }}>🎬 Movies</button>
          <button className={mediaType === 'all' ? 'active' : ''} onClick={() => { setMediaType('all'); setStatusFilter('all'); }}>🍿 All</button>
          <button className={mediaType === 'tv' ? 'active' : ''} onClick={() => { setMediaType('tv'); setStatusFilter('all'); }}>📺 TV Shows</button>
        </div>
      </div>

      {/* ─── LIBRARY ─── */}
      {view === 'library' && (
        <div>
          {/* Search */}
          <div className="tv-search-wrap" ref={searchRef}>
            <div className="tv-search-bar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input type="text" placeholder="Search TMDB to add a show..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onFocus={() => searchResults.length > 0 && setShowDropdown(true)} />
              {searchLoading && <span className="tv-search-spinner" />}
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div className="tv-search-dropdown">
                {searchResults.slice(0, 8).map(r => {
                  const added = shows.some(s => s.tmdb_id === r.id);
                  return (
                    <div key={r.id} className={`tv-search-item ${added ? 'added' : ''}`} onClick={() => !added && addShow(r)}>
                      {r.poster_path ? <img src={`${TMDB_IMG}/w92${r.poster_path}`} alt="" /> : <div className="tv-search-item-noposter">{r.media_type === 'movie' ? '🎬' : '📺'}</div>}
                      <div className="tv-search-item-info">
                        <span className="tv-search-item-name">{r.name || r.title}</span>
                        <span className="tv-search-item-year">{r.media_type === 'movie' ? '🎬' : '📺'} {(r.first_air_date || r.release_date)?.split('-')[0] || 'N/A'}</span>
                      </div>
                      {added ? <span className="tv-search-item-badge">In Library</span> : <span className="tv-search-item-add">+ Add</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="tv-filters">
            {[
              { key: 'all', label: 'All', count: shows.length },
              { key: 'Watching', label: 'Watching', count: statusCounts['Watching'] || 0 },
              { key: 'Plan to Watch', label: 'Plan to Watch', count: statusCounts['Plan to Watch'] || 0 },
              { key: 'Completed', label: 'Completed', count: statusCounts['Completed'] || 0 },
              { key: 'Dropped', label: 'Dropped', count: statusCounts['Dropped'] || 0 },
            ].filter(f => f.key === 'all' || f.count > 0).map(f => (
              <button key={f.key} className={`tv-filter-pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>
                {f.label} <span className="tv-filter-count">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="tv-poster-grid">
            {filteredShows.map(show => (
              <div key={show.id} className="tv-poster-card" onClick={() => openModal(show)}>
                <div className="tv-poster-img-wrap">
                  {show.poster_path ? <img src={`${TMDB_IMG}/w300${show.poster_path}`} alt={show.name} loading="lazy" /> : <div className="tv-poster-fallback"><span>{show.type === 'movie' ? '🎬' : '📺'}</span>{show.name}</div>}
                  <div className="tv-poster-gradient" />
                  {mediaType === 'all' && <div className="tv-poster-type-badge">{show.type === 'movie' ? '🎬' : '📺'}</div>}
                  <div className="tv-poster-status"><span className={`tv-status-chip ${show.status.toLowerCase().replace(/\s/g, '-')}`}>{show.status}</span></div>
                </div>
                <div className="tv-poster-name">{show.name}</div>
              </div>
            ))}
            {filteredShows.length === 0 && <div className="tv-empty-state"><span style={{ fontSize: '2.5rem' }}>📺</span><p>{statusFilter === 'all' ? 'Your library is empty. Search above to add shows!' : `No "${statusFilter}" shows`}</p></div>}
          </div>
        </div>
      )}

      {/* ─── DIARY ─── */}
      {view === 'diary' && (
        <div className="tv-diary-view">
          {Object.keys(groupedDiary).length === 0 ? (
            <div className="tv-empty-state"><span style={{ fontSize: '2.5rem' }}>📅</span><p>Your diary is empty. Log what you watch!</p></div>
          ) : (
            Object.entries(groupedDiary).map(([date, logs]) => (
              <div key={date} className="tv-diary-group">
                <div className="tv-diary-date-header"><span className="tv-diary-date-dot" />{fmtDate(date)}</div>
                {logs.map(log => (
                  <div key={log.id} className="tv-diary-entry">
                    <div className="tv-diary-entry-poster">
                      {log.poster_path ? <img src={`${TMDB_IMG}/w154${log.poster_path}`} alt={log.show_name} /> : <div className="tv-diary-entry-noposter">📺</div>}
                    </div>
                    <div className="tv-diary-entry-content">
                      <h4 className="tv-diary-entry-title">
                        {log.show_name}
                        {log.liked && <span style={{ marginLeft: '6px', fontSize: '0.9em', color: '#ff4d4f' }}>❤️</span>}
                      </h4>
                      <div className="tv-diary-entry-meta">
                        {log.type === 'movie' ? (
                          <span className="tv-ep-badge tv-ep-badge-movie">🎬 Movie</span>
                        ) : log.season_number && log.episodes ? (
                          <span className="tv-ep-badge">S{String(log.season_number).padStart(2, '0')} E{log.episodes.join(', ')}</span>
                        ) : (
                          <span className="tv-ep-badge tv-ep-badge-show">📺 Entire Show</span>
                        )}
                        {log.rating > 0 && <StarDisplay value={log.rating} />}
                      </div>
                      {log.review && <p className="tv-diary-entry-review">"{log.review}"</p>}
                      {log.tags && (
                        <div className="tv-diary-tags-row">
                          {log.tags.split(',').map((t, i) => <span key={i} className="tv-diary-tag">{t.trim()}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="tv-diary-entry-actions">
                      <button onClick={() => editLog(log)}>✏️</button>
                      <button onClick={() => deleteLog(log.log_ids)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── SHOW MODAL ─── */}
      {selectedShow && (
        <div className="tv-modal-overlay" onClick={closeModal}>
          <div className="tv-modal-panel" onClick={e => e.stopPropagation()}>
            <button className="tv-modal-x" onClick={closeModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>

            {/* Hero */}
            <div className="tv-modal-hero">
              {selectedShow.poster_path && <img className="tv-modal-hero-poster" src={`${TMDB_IMG}/w300${selectedShow.poster_path}`} alt="" />}
              <div className="tv-modal-hero-info">
                <h2>{selectedShow.name}</h2>
                {showDetailsLoading ? (
                  <div className="tv-modal-hero-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="tv-search-spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--accent)' }} /> Loading info...
                  </div>
                ) : showDetails && (
                  <div className="tv-modal-hero-meta">
                    {selectedShow.type === 'tv' ? (
                      <>
                        <span>{showDetails.number_of_seasons} Season{showDetails.number_of_seasons !== 1 ? 's' : ''}</span>
                        <span className="tv-meta-dot">·</span>
                        <span>{showDetails.number_of_episodes} Episodes</span>
                      </>
                    ) : (
                      <>
                        {showDetails.release_date && <span>{showDetails.release_date.split('-')[0]}</span>}
                        {showDetails.runtime && (
                          <>
                            <span className="tv-meta-dot">·</span>
                            <span>{Math.floor(showDetails.runtime / 60)}h {showDetails.runtime % 60}m</span>
                          </>
                        )}
                        {showDetails.aggregate_credits?.crew?.find(c => c.job === 'Director') && (
                          <>
                            <span className="tv-meta-dot">·</span>
                            <span>Dir. {showDetails.aggregate_credits.crew.find(c => c.job === 'Director').name}</span>
                          </>
                        )}
                      </>
                    )}
                    <span className="tv-meta-dot">·</span>
                    <span>{showDetails.status}</span>
                  </div>
                )}
                <div className="tv-modal-status-row">
                  {(selectedShow.type === 'movie' ? ['Watched', 'Plan to Watch'] : ['Watching', 'Completed', 'Plan to Watch', 'Dropped']).map(s => (
                    <button key={s} className={`tv-status-option ${selectedShow.status === s || (selectedShow.status === 'Completed' && s === 'Watched') ? 'active' : ''}`} onClick={() => updateStatus(s === 'Watched' ? 'Completed' : s)}>
                      {s === 'Watching' ? '👁️' : (s === 'Completed' || s === 'Watched') ? '✅' : s === 'Plan to Watch' ? '📋' : '🗑️'} {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {showDetails?.overview && <p className="tv-modal-overview">{showDetails.overview}</p>}

            {/* Tabs */}
            <div className="tv-modal-tabs">
              <button className={modalView === 'log' ? 'active' : ''} onClick={() => setModalView('log')}>📝 Log</button>
              <button className={modalView === 'details' ? 'active' : ''} onClick={() => setModalView('details')}>👥 Details</button>
            </div>

            {modalView === 'log' && (
              <div className="tv-modal-log-section">
                <div className="tv-log-grid">
                  <div className="tv-log-field">
                    <label>Date</label>
                    <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
                  </div>
                  {selectedShow.type === 'tv' && (
                    <div className="tv-log-field">
                      <label>Season</label>
                      <select value={logSeason} onChange={e => { setLogSeason(e.target.value); setLogEpisodes([]); }} disabled={!!editingLogIds}>
                        <option value="">— Entire Show —</option>
                        {getSeasons().map(s => <option key={s.season_number} value={s.season_number}>Season {s.season_number} ({s.episode_count} eps)</option>)}
                      </select>
                    </div>
                  )}

                  {/* Multi-episode selector */}
                  {logSeason && (
                    <div className="tv-log-field tv-log-field-full">
                      <label>
                        Episodes
                        {!editingLogIds && (
                          <button type="button" className="tv-ep-select-all" onClick={selectAllEpisodes}>
                            {logEpisodes.length === getEpisodes().length ? 'Deselect All' : 'Select All'}
                          </button>
                        )}
                      </label>
                      <div className="tv-ep-grid">
                        {getEpisodes().map(ep => (
                          <button key={ep} type="button" className={`tv-ep-btn ${logEpisodes.includes(ep) ? 'selected' : ''}`} onClick={() => !editingLogIds && toggleEpisode(ep)} disabled={!!editingLogIds}>
                            {ep}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="tv-log-field tv-log-field-full">
                    <label>Rating & Like</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <StarRating value={logRating} onChange={setLogRating} size={26} />
                      <button 
                        type="button" 
                        onClick={() => setLogLiked(!logLiked)}
                        style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', filter: logLiked ? 'none' : 'grayscale(1) opacity(0.3)' }}
                      >❤️</button>
                    </div>
                  </div>
                  <div className="tv-log-field tv-log-field-full">
                    <label>Tags</label>
                    <input type="text" value={logTags} onChange={e => setLogTags(e.target.value)} placeholder="Comma separated (e.g. Rewatch, Comfort)" />
                  </div>
                  <div className="tv-log-field tv-log-field-full">
                    <label>Review</label>
                    <textarea rows="3" value={logReview} onChange={e => setLogReview(e.target.value)} placeholder="What did you think?" />
                  </div>
                </div>
                <div className="tv-log-actions">
                  <button className="tv-log-save" onClick={saveDiaryLog} disabled={logSaving || (!editingLogIds && logSeason && logEpisodes.length === 0)}>{logSaving ? 'Saving...' : '💾 Save to Diary'}</button>
                  <button className="tv-log-delete" onClick={deleteShow}>🗑️ Remove</button>
                </div>
              </div>
            )}

            {modalView === 'details' && (
              <div className="tv-modal-details-section">
                {showDetails?.aggregate_credits?.cast && showDetails.aggregate_credits.cast.length > 0 ? (
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Top Cast</h3>
                    <div className="tv-cast-grid">
                      {showDetails.aggregate_credits.cast.slice(0, 8).map(actor => (
                        <div key={actor.id} className="tv-cast-card">
                          {actor.profile_path ? (
                            <img src={`${TMDB_IMG}/w138_and_h175_face${actor.profile_path}`} alt={actor.name} />
                          ) : (
                            <div className="tv-cast-nopfp">👤</div>
                          )}
                          <div className="tv-cast-info">
                            <div className="tv-cast-name">{actor.name}</div>
                            <div className="tv-cast-role">{actor.roles ? actor.roles[0]?.character : actor.character}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text2)' }}>No cast information available.</p>
                )}
                
                {showDetails?.aggregate_credits?.crew && showDetails.aggregate_credits.crew.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Key Crew</h3>
                    <div className="tv-cast-grid">
                      {showDetails.aggregate_credits.crew
                        .filter(c => ['Director', 'Executive Producer', 'Writer', 'Creator'].includes(c.job || c.department))
                        .reduce((unique, item) => unique.some(u => u.id === item.id) ? unique : [...unique, item], [])
                        .slice(0, 8)
                        .map(crew => (
                        <div key={`crew-${crew.id}`} className="tv-cast-card">
                          {crew.profile_path ? (
                            <img src={`${TMDB_IMG}/w138_and_h175_face${crew.profile_path}`} alt={crew.name} />
                          ) : (
                            <div className="tv-cast-nopfp">👤</div>
                          )}
                          <div className="tv-cast-info">
                            <div className="tv-cast-name">{crew.name}</div>
                            <div className="tv-cast-role">{crew.jobs ? crew.jobs[0]?.job : crew.job}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

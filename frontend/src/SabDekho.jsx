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
export default function SabDekho({ API, getToken, showMovies, refreshTrigger }) {
  const [view, setView] = useState('library'); // library | diary | activity
  const [shows, setShows] = useState([]);
  const [diaryLogs, setDiaryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

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
  const [logSeasons, setLogSeasons] = useState([]); // array of ints
  const [logEpisodes, setLogEpisodes] = useState([]); // multi-select
  const [logRating, setLogRating] = useState(0);
  const [logReview, setLogReview] = useState('');
  const [logTags, setLogTags] = useState('');
  const [logLiked, setLogLiked] = useState(false);
  const [logRewatch, setLogRewatch] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [modalView, setModalView] = useState('log'); // log | details
  const [editingLogIds, setEditingLogIds] = useState(null);

  // Filter
  const [mediaType, setMediaType] = useState('all'); // 'movies', 'all', 'tv'
  const [statusFilter, setStatusFilter] = useState('WATCHING');

  // Diary expanded reviews
  const [expandedLogs, setExpandedLogs] = useState({});

  // Pagination (Frontend)
  const [showsPage, setShowsPage] = useState(1);
  const [diaryPage, setDiaryPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  // Reset pagination when filters change
  useEffect(() => {
    setShowsPage(1);
    setDiaryPage(1);
  }, [mediaType, statusFilter, view, showMovies]);

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
        showMovies ? fetch(`${API}/movies`, { headers: hdrs() }).then(r => r.json()) : Promise.resolve({ success: true, movies: [] })
      ]);
      let combined = [];
      if (tvRes.success) combined = [...combined, ...tvRes.shows.map(s => ({ ...s, type: 'tv' }))];
      if (movRes.success) combined = [...combined, ...movRes.movies.map(s => ({ ...s, type: 'movie' }))];
      combined.sort((a, b) => {
        const timeDiff = new Date(b.added_on) - new Date(a.added_on);
        // If items were added within 1 hour of each other (like during a bulk import or sync), 
        // the items inserted FIRST (smaller ID) are actually the newest ones from the top of the CSV/RSS.
        if (Math.abs(timeDiff) < 1000 * 60 * 60) {
          return a.id - b.id;
        }
        return timeDiff;
      });
      setShows(combined);
    } catch (e) { console.error(e); }
  }, [API, hdrs, showMovies]);

  const fetchDiary = useCallback(async () => {
    try {
      const [tvRes, movRes] = await Promise.all([
        fetch(`${API}/tv/diary`, { headers: hdrs() }).then(r => r.json()),
        showMovies ? fetch(`${API}/movies/diary`, { headers: hdrs() }).then(r => r.json()) : Promise.resolve({ success: true, logs: [] })
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
  }, [API, hdrs, showMovies]);
  useEffect(() => {
    if (!loading) setIsSyncing(true); // Don't set syncing if we are already showing the full screen loader
    Promise.all([fetchShows(), fetchDiary()]).then(() => {
      setLoading(false);
      setIsSyncing(false);
    });
  }, [fetchShows, fetchDiary, refreshTrigger]);

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
          setShowDropdown(true);
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

    // Switch to 'TO WATCH' tab so the user instantly sees what they added
    setStatusFilter('TO WATCH');
    setShowsPage(1); // Reset to page 1 to see the newest item at the top

    // Optimistic UI insert
    const optimisticShow = {
      id: 'temp-' + tmdbShow.id,
      tmdb_id: tmdbShow.id,
      name: tmdbShow.title || tmdbShow.name,
      poster_path: tmdbShow.poster_path,
      status: 'TO WATCH',
      type: tmdbShow.media_type === 'movie' ? 'movie' : 'tv',
      isAdding: true,
      added_on: new Date().toISOString()
    };
    setShows(prev => [optimisticShow, ...prev]);

    try {
      const endpoint = tmdbShow.media_type === 'movie' ? '/movies' : '/tv/shows';
      const r = await fetch(`${API}${endpoint}`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ tmdb_id: tmdbShow.id, name: optimisticShow.name, poster_path: tmdbShow.poster_path, status: 'TO WATCH' })
      });
      const d = await r.json();
      if (d.success) fetchShows();
      else setShows(prev => prev.filter(s => s.id !== optimisticShow.id)); // revert on error
    } catch (e) {
      console.error(e);
      setShows(prev => prev.filter(s => s.id !== optimisticShow.id)); // revert on error
    }
  };

  const openModal = async (show) => {
    setSelectedShow(show); setShowDetails(null); setShowDetailsLoading(true);
    setLogDate(new Date().toISOString().split('T')[0]);
    setLogSeasons([]); setLogEpisodes([]); setLogRating(0); setLogReview(''); setLogTags(''); setLogLiked(false);
    setEditingLogIds(null); // Fix state leak where editing previously would overwrite new logs

    if (show.type === 'movie') {
      const hasLogged = diaryLogs.some(l => l.show_id === show.id && l.type === 'movie');
      setLogRewatch(hasLogged);
    } else {
      setLogRewatch(false);
    }
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
            setLogSeasons([latestSeason]);
          }
        }
      }
    } catch (e) { console.error(e); }
    setShowDetailsLoading(false);
  };

  const closeModal = () => setSelectedShow(null);

  const exportToLetterboxd = () => {
    const movies = diaryLogs.filter(log => log.type === 'movie' && log.tmdb_id);
    if (movies.length === 0) return alert('No movies found in diary to export!');

    let csvContent = "data:text/csv;charset=utf-8,tmdbID,Rating,WatchedDate,Rewatch,Tags,Review\n";

    movies.forEach(log => {
      const tmdbId = log.tmdb_id || '';
      const rating = log.rating ? log.rating : '';
      const date = log.date || '';
      const rewatch = log.rewatch ? 'Yes' : 'No';
      const tags = `"${(log.tags || '').replace(/"/g, '""')}"`;
      const review = `"${(log.review || '').replace(/"/g, '""')}"`;
      csvContent += `${tmdbId},${rating},${date},${rewatch},${tags},${review}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "watchtrack_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.open("https://letterboxd.com/import/", "_blank");
  };

  const canMarkAsWatched = () => {
    if (selectedShow.type === 'movie') return true;
    if (!showDetails) return false;
    const showLogs = diaryLogs.filter(l => l.show_id === selectedShow.id && l.type === 'tv');
    if (showLogs.some(l => !l.season_number && !l.episode_number)) return true;
    let watchedCount = 0;
    const loggedSeasons = new Set(showLogs.filter(l => l.season_number && !l.episode_number).map(l => l.season_number));
    if (showDetails.seasons) {
      showDetails.seasons.forEach(s => {
        if (loggedSeasons.has(s.season_number)) watchedCount += s.episode_count;
      });
    }
    const loggedEps = new Set(showLogs.filter(l => l.season_number && l.episode_number).map(l => `${l.season_number}-${l.episode_number}`));
    watchedCount += loggedEps.size;
    return watchedCount >= showDetails.number_of_episodes;
  };

  const updateStatus = async (status, force = false) => {
    if (!selectedShow) return;
    if (!force && status === 'WATCHED' && selectedShow.type === 'tv' && !canMarkAsWatched()) {
      alert("You can only mark this show as WATCHED if you have logged all episodes or an entire season.");
      return;
    }
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
    if (selectedShow.type === 'tv' && logSeasons.length === 1 && logEpisodes.length === 0) {
      alert("Please select at least one episode to log, or deselect the season to log the entire show.");
      return;
    }
    setLogSaving(true);
    try {
      const endpoint = selectedShow.type === 'movie' ? '/movies/diary' : '/tv/diary';

      if (editingLogIds) {
        if (selectedShow.type === 'tv') {
          // For TV shows, editing might involve changing seasons or episode counts (e.g., 3 logs to 1 "Entire Show" log)
          // It's safest to delete the old logs and recreate them
          await fetch(`${API}${endpoint}`, { method: 'DELETE', headers: hdrs(), body: JSON.stringify({ log_ids: editingLogIds }) });
        } else {
          // Movies are always 1:1, a PUT is perfectly fine
          await fetch(`${API}${endpoint}`, {
            method: 'PUT', headers: hdrs(),
            body: JSON.stringify({ log_ids: editingLogIds, rating: logRating || null, review: logReview || null, liked: logLiked, rewatch: logRewatch, tags: logTags.trim() || null })
          });
        }
      }

      if (!editingLogIds || selectedShow.type === 'tv') {
        if (selectedShow.type === 'tv') {
          const seasonsToLog = logSeasons.length > 0 ? logSeasons : [null];

          for (const s of seasonsToLog) {
            const episodesToLog = (s !== null && logSeasons.length === 1 && logEpisodes.length > 0) ? logEpisodes : [null];
            for (const ep of episodesToLog) {
              await fetch(`${API}${endpoint}`, {
                method: 'POST', headers: hdrs(),
                body: JSON.stringify({
                  tv_show_id: selectedShow.id, date: logDate,
                  season_number: s, episode_number: ep,
                  rating: logRating || null, review: logReview || null,
                  liked: logLiked, rewatch: logRewatch, tags: logTags.trim() || null
                })
              });
            }
          }
        } else if (!editingLogIds) {
          // Movie log
          await fetch(`${API}${endpoint}`, {
            method: 'POST', headers: hdrs(),
            body: JSON.stringify({
              movie_id: selectedShow.id, date: logDate,
              rating: logRating || null, review: logReview || null,
              liked: logLiked, rewatch: logRewatch, tags: logTags.trim() || null
            })
          });
        }
      }
      setEditingLogIds(null);

      // Auto-update status
      if (selectedShow.type === 'movie' && selectedShow.status !== 'WATCHED') {
        updateStatus('WATCHED', true);
      } else if (selectedShow.type === 'tv' && selectedShow.status !== 'WATCHED') {
        if (logSeasons.length === 0) {
          updateStatus('WATCHED', true);
        } else {
          const tvRes = await fetch(`${API}/tv/diary`, { headers: hdrs() }).then(r => r.json());
          if (tvRes.success) {
            const showLogs = tvRes.logs.filter(l => l.show_id === selectedShow.id);
            let watchedCount = 0;
            const loggedSeasons = new Set(showLogs.filter(l => l.season_number && !l.episode_number).map(l => l.season_number));
            if (showDetails?.seasons) {
              showDetails.seasons.forEach(s => {
                if (loggedSeasons.has(s.season_number)) watchedCount += s.episode_count;
              });
            }
            const loggedEps = new Set(showLogs.filter(l => l.season_number && l.episode_number).map(l => `${l.season_number}-${l.episode_number}`));
            watchedCount += loggedEps.size;
            if (watchedCount >= (showDetails?.number_of_episodes || 9999)) {
              updateStatus('WATCHED', true);
            }
          }
        }
      }

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
    setLogSeasons(log.seasons || (log.season_number != null ? [log.season_number] : []));
    setLogEpisodes(log.episodes || []);
    setLogRating(log.rating || 0);
    setLogReview(log.review || '');
    setLogTags(log.tags || '');
    setLogLiked(log.liked || false);
    setLogRewatch(log.rewatch || false);
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
    if (!showDetails?.seasons || logSeasons.length !== 1) return [];
    const seasonData = showDetails.seasons.find(s => s.season_number === logSeasons[0]);
    if (!seasonData) return [];
    return Array.from({ length: seasonData.episode_count }, (_, i) => i + 1);
  };

  const isEpisodeWatched = (ep) => {
    if (!selectedShow || logSeasons.length !== 1) return false;
    const showLogs = diaryLogs.filter(l => l.show_id === selectedShow.id);
    return showLogs.some(l => l.season_number === logSeasons[0] && l.episode_number === ep);
  };

  const isSeasonWatched = (seasonNum) => {
    if (!selectedShow || !showDetails) return false;
    const showLogs = diaryLogs.filter(l => l.show_id === selectedShow.id && l.type === 'tv');

    // Check if full season is logged
    const fullSeasonLogged = showLogs.some(l => l.season_number === seasonNum && l.episode_number === null);
    if (fullSeasonLogged) return true;

    // Check if all episodes are logged
    const seasonData = showDetails.seasons.find(s => s.season_number === seasonNum);
    if (!seasonData || seasonData.episode_count === 0) return false;

    const loggedEps = new Set(showLogs.filter(l => l.season_number === seasonNum && l.episode_number !== null).map(l => l.episode_number));
    return loggedEps.size >= seasonData.episode_count;
  };

  const toggleEpisode = (ep) => {
    setLogEpisodes(prev => {
      const newEps = prev.includes(ep) ? prev.filter(e => e !== ep) : [...prev, ep].sort((a, b) => a - b);
      if (newEps.length > 0) {
        const firstEp = newEps[0];
        const hasLogged = diaryLogs.some(l => l.show_id === selectedShow.id && l.type === 'tv' &&
          l.season_number === logSeasons[0] &&
          (l.episode_number === firstEp || l.episode_number === null));
        setLogRewatch(hasLogged);
      } else {
        setLogRewatch(false);
      }
      return newEps;
    });
  };

  const selectAllEpisodes = () => {
    const all = getEpisodes();
    if (logEpisodes.length === all.length) setLogEpisodes([]);
    else setLogEpisodes(all);
  };

  const filteredShows = shows.filter(s => {
    if (!showMovies && s.type === 'movie') return false;
    const passType = (mediaType === 'all' || s.type === mediaType);
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

  const filteredDiaryLogs = [...diaryLogs]
    .filter(l => showMovies || l.type !== 'movie')
    .filter(l => mediaType === 'all' || l.type === mediaType);

  const groupedDiary = filteredDiaryLogs.reduce((acc, l) => {
    if (!acc[l.date]) acc[l.date] = [];

    const existing = acc[l.date].find(e =>
      e.type === l.type &&
      e.show_id === l.show_id &&
      e.review === l.review &&
      e.rating === l.rating &&
      e.tags === l.tags &&
      (
        (e.episode_number !== null && l.episode_number !== null && e.season_number === l.season_number) ||
        (e.episode_number === null && l.episode_number === null && e.season_number !== null && l.season_number !== null)
      )
    );

    if (existing) {
      existing.log_ids.push(l.id);
      if (existing.episode_number !== null) {
        if (!existing.episodes) existing.episodes = [existing.episode_number];
        if (!existing.episodes.includes(l.episode_number)) {
          existing.episodes.push(l.episode_number);
          existing.episodes.sort((a, b) => a - b);
        }
      } else {
        if (!existing.seasons) existing.seasons = [existing.season_number];
        if (!existing.seasons.includes(l.season_number)) {
          existing.seasons.push(l.season_number);
          existing.seasons.sort((a, b) => a - b);
        }
      }
    } else {
      acc[l.date].push({
        ...l,
        log_ids: [l.id],
        episodes: l.episode_number !== null ? [l.episode_number] : null,
        seasons: (l.season_number !== null && l.episode_number === null) ? [l.season_number] : null
      });
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
        <div className="tv-header-left">
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
          {isSyncing && (
            <div className="tv-sync-indicator">
              <div className="tv-loading-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
              Syncing Library...
            </div>
          )}
        </div>
        <div className="tv-header-actions">
          {showMovies && (
            <div className="tv-media-toggle">
              <button className={mediaType === 'all' ? 'active' : ''} onClick={() => { setMediaType('all'); setStatusFilter('WATCHING'); }}>🍿 All</button>
              <button className={mediaType === 'movie' ? 'active' : ''} onClick={() => { setMediaType('movie'); setStatusFilter('WATCHING'); }}>🎬 Movies</button>
              <button className={mediaType === 'tv' ? 'active' : ''} onClick={() => { setMediaType('tv'); setStatusFilter('WATCHING'); }}>📺 TV Shows</button>
            </div>
          )}
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

          {/* Filters & Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div className="tv-filters" style={{ marginBottom: 0 }}>
              {[
                { key: 'WATCHING', label: 'Watching', count: statusCounts['WATCHING'] || 0 },
                { key: 'TO WATCH', label: 'To Watch', count: statusCounts['TO WATCH'] || 0 },
                { key: 'WATCHED', label: 'Watched', count: statusCounts['WATCHED'] || 0 },
                { key: 'DROPPED', label: 'Dropped', count: statusCounts['DROPPED'] || 0 },
              ].filter(f => f.count > 0).map(f => (
                <button key={f.key} className={`tv-filter-pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>
                  {f.label} <span className="tv-filter-count">{f.count}</span>
                </button>
              ))}
            </div>

            {filteredShows.length > ITEMS_PER_PAGE && (
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <button
                  onClick={() => setShowsPage(prev => Math.max(1, prev - 1))}
                  disabled={showsPage === 1}
                  style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)', background: showsPage === 1 ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)', color: showsPage === 1 ? 'var(--text2)' : 'var(--text)', cursor: showsPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                >
                  ←
                </button>

                {Array.from({ length: Math.min(5, Math.ceil(filteredShows.length / ITEMS_PER_PAGE)) }, (_, i) => {
                  const totalPages = Math.ceil(filteredShows.length / ITEMS_PER_PAGE);
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (showsPage < 3) pageNum = i + 1;
                  else if (showsPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = showsPage - 2 + i;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setShowsPage(pageNum)}
                      style={{
                        padding: '0.35rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
                        border: pageNum === showsPage ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: pageNum === showsPage ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg-input)',
                        color: pageNum === showsPage ? 'var(--accent)' : 'var(--text2)',
                        fontWeight: pageNum === showsPage ? 600 : 400
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setShowsPage(prev => Math.min(Math.ceil(filteredShows.length / ITEMS_PER_PAGE), prev + 1))}
                  disabled={showsPage === Math.ceil(filteredShows.length / ITEMS_PER_PAGE)}
                  style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)', background: showsPage === Math.ceil(filteredShows.length / ITEMS_PER_PAGE) ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)', color: showsPage === Math.ceil(filteredShows.length / ITEMS_PER_PAGE) ? 'var(--text2)' : 'var(--text)', cursor: showsPage === Math.ceil(filteredShows.length / ITEMS_PER_PAGE) ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                >
                  →
                </button>
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="tv-poster-grid">
            {filteredShows.slice((showsPage - 1) * ITEMS_PER_PAGE, showsPage * ITEMS_PER_PAGE).map(show => (
              <div key={`${show.type}-${show.id}`} className="tv-poster-card" onClick={() => openModal(show)}>
                <div className="tv-poster-img-wrap">
                  {show.poster_path ? <img src={`${TMDB_IMG}/w300${show.poster_path}`} alt={show.name} loading="lazy" style={show.isAdding ? { filter: 'blur(4px) grayscale(0.5)' } : {}} /> : <div className="tv-poster-fallback"><span>{show.type === 'movie' ? '🎬' : '📺'}</span>{show.name}</div>}
                  <div className="tv-poster-gradient" />
                  {show.isAdding && (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 10 }}>
                      <div className="tv-loading-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
                    </div>
                  )}
                  {mediaType === 'all' && <div className="tv-poster-type-badge">{show.type === 'movie' ? '🎬' : '📺'}</div>}
                  <div className="tv-poster-status"><span className={`tv-status-chip ${show.status.toLowerCase().replace(/\s/g, '-')}`}>{show.status}</span></div>
                </div>
                <div className="tv-poster-name">{show.name}</div>
              </div>
            ))}
            {filteredShows.length === 0 && (
              <div className="tv-empty-state">
                <span style={{ fontSize: '2.5rem' }}>{mediaType === 'movie' ? '🎬' : mediaType === 'tv' ? '📺' : '🍿'}</span>
                <p>
                  {statusFilter === 'all'
                    ? `Your library is empty. Search above to add ${mediaType === 'movie' ? 'movies' : mediaType === 'tv' ? 'shows' : 'titles'}!`
                    : `No "${statusFilter}" ${mediaType === 'movie' ? 'movies' : mediaType === 'tv' ? 'shows' : 'titles'}`}
                </p>
              </div>
            )}
          </div>

          {/* Empty Space for bottom padding since pagination is moved to top */}
          <div style={{ height: '6rem' }} />
        </div>
      )}

      {/* ─── DIARY ─── */}
      {view === 'diary' && (
        <div className="tv-diary-view" style={{ paddingBottom: '6rem' }}>
          {Object.keys(groupedDiary).length === 0 ? (
            <div className="tv-empty-state"><span style={{ fontSize: '2.5rem' }}>📅</span><p>Your diary is empty. Log what you watch!</p></div>
          ) : (
            <>
              <div className="tv-diary-list-container">
                {Object.keys(groupedDiary)
                  .sort((a, b) => new Date(b) - new Date(a))
                  .slice((diaryPage - 1) * ITEMS_PER_PAGE, diaryPage * ITEMS_PER_PAGE)
                  .map(date => {
                    const logs = groupedDiary[date];
                    return (
                      <div key={date} className="tv-diary-group">
                        <div className="tv-diary-date-header"><span className="tv-diary-date-dot" />{fmtDate(date)}</div>
                        <div className="tv-diary-entries-grid">
                          {logs.map(log => (
                            <div key={log.id} className="tv-diary-entry">
                              <div className="tv-diary-entry-poster">
                                {log.poster_path ? <img src={`${TMDB_IMG}/w154${log.poster_path}`} alt={log.show_name} /> : <div className="tv-diary-entry-noposter">📺</div>}
                              </div>
                              <div className="tv-diary-entry-content">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.3rem', minWidth: 0 }}>
                                  <h4 className="tv-diary-entry-title" style={{ margin: 0, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                                    {log.show_name}
                                    {log.liked && <span style={{ marginLeft: '6px', fontSize: '0.9em', color: '#ff4d4f' }}>❤️</span>}
                                    {log.rewatch && <span style={{ marginLeft: '6px', fontSize: '0.9em' }}>🔄</span>}
                                  </h4>
                                  <div className="tv-diary-entry-actions">
                                    <button onClick={() => editLog(log)} title="Edit Log">✏️</button>
                                    <button onClick={() => deleteLog(log.log_ids)} title="Delete Log">🗑️</button>
                                  </div>
                                </div>
                                <div className="tv-diary-entry-meta">
                                  {log.type === 'movie' ? (
                                    <span className="tv-ep-badge tv-ep-badge-movie">🎬 Movie</span>
                                  ) : log.season_number !== null && log.episodes ? (
                                    <span className="tv-ep-badge">S{String(log.season_number).padStart(2, '0')} E{log.episodes.join(', ')}</span>
                                  ) : log.seasons && log.seasons.length > 1 ? (
                                    <span className="tv-ep-badge">Seasons {log.seasons.join(', ')}</span>
                                  ) : log.season_number !== null ? (
                                    <span className="tv-ep-badge">Season {log.season_number}</span>
                                  ) : (
                                    <span className="tv-ep-badge tv-ep-badge-show">📺 Entire Show</span>
                                  )}
                                  {log.rating > 0 && <StarDisplay value={log.rating} />}
                                </div>
                                {log.review && (
                                  <p className="tv-diary-entry-review">
                                    "{expandedLogs[log.id] || log.review.length <= 150 ? log.review : `${log.review.substring(0, 150).trim()}...`}"
                                    {log.review.length > 150 && (
                                      <span
                                        onClick={() => setExpandedLogs(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
                                        style={{ display: 'block', marginTop: '0.4rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}
                                      >
                                        {expandedLogs[log.id] ? 'Show less' : 'Read more'}
                                      </span>
                                    )}
                                  </p>
                                )}
                                {log.tags && (
                                  <div className="tv-diary-tags-row">
                                    {log.tags.split(',').map((t, i) => <span key={i} className="tv-diary-tag">{t.trim()}</span>)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {Object.keys(groupedDiary).length > ITEMS_PER_PAGE && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem', marginTop: '1.5rem', marginBottom: '4rem' }}>
                  <button
                    onClick={() => setDiaryPage(prev => Math.max(1, prev - 1))}
                    disabled={diaryPage === 1}
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)', background: diaryPage === 1 ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)', color: diaryPage === 1 ? 'var(--text2)' : 'var(--text)', cursor: diaryPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    ←
                  </button>

                  {Array.from({ length: Math.min(5, Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE)) }, (_, i) => {
                    const totalPages = Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE);
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (diaryPage < 3) pageNum = i + 1;
                    else if (diaryPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = diaryPage - 2 + i;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setDiaryPage(pageNum)}
                        style={{
                          padding: '0.35rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
                          border: pageNum === diaryPage ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: pageNum === diaryPage ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg-input)',
                          color: pageNum === diaryPage ? 'var(--accent)' : 'var(--text2)',
                          fontWeight: pageNum === diaryPage ? 600 : 400
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setDiaryPage(prev => Math.min(Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE), prev + 1))}
                    disabled={diaryPage === Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE)}
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)', background: diaryPage === Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE) ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)', color: diaryPage === Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE) ? 'var(--text2)' : 'var(--text)', cursor: diaryPage === Math.ceil(Object.keys(groupedDiary).length / ITEMS_PER_PAGE) ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    →
                  </button>
                </div>
              )}
            </>
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
                  {(selectedShow.type === 'movie' ? ['WATCHED', 'TO WATCH'] : ['WATCHING', 'WATCHED', 'TO WATCH', 'DROPPED']).map(s => (
                    <button key={s} className={`tv-status-option ${selectedShow.status === s ? 'active' : ''}`} onClick={() => updateStatus(s)}>
                      {s === 'WATCHING' ? '👁️' : s === 'WATCHED' ? '✅' : s === 'TO WATCH' ? '📋' : '🗑️'} {s}
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
                    <div className="tv-log-field tv-log-field-full">
                      <label>Seasons</label>
                      <div className="tv-ep-grid" style={{ marginBottom: '0.75rem' }}>
                        <button type="button" className={`tv-ep-btn ${logSeasons.length === 0 ? 'selected' : ''}`} onClick={() => { setLogSeasons([]); setLogEpisodes([]); }}>
                          All
                        </button>
                        {getSeasons().map(s => (
                          <button
                            key={s.season_number}
                            type="button"
                            className={`tv-ep-btn ${logSeasons.includes(s.season_number) ? 'selected' : ''} ${isSeasonWatched(s.season_number) ? 'watched' : ''}`}
                            onClick={() => {
                              setLogSeasons(prev => {
                                const newSeasons = prev.includes(s.season_number) ? prev.filter(x => x !== s.season_number) : [...prev, s.season_number];
                                return newSeasons;
                              });
                              setLogEpisodes([]);
                            }}
                          >
                            S{s.season_number}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedShow.type === 'tv' && logSeasons.length === 1 && (
                    <div className="tv-log-field tv-log-field-full">
                      <label>Episodes for Season {logSeasons[0]}</label>
                      <div className="tv-ep-grid">
                        <button type="button" className={`tv-ep-btn ${logEpisodes.length === getEpisodes().length ? 'selected' : ''}`} onClick={selectAllEpisodes}>
                          All
                        </button>
                        {getEpisodes().map(ep => (
                          <button key={ep} type="button" className={`tv-ep-btn ${logEpisodes.includes(ep) ? 'selected' : ''} ${isEpisodeWatched(ep) ? 'watched' : ''}`} onClick={() => toggleEpisode(ep)}>
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
                        title="Like"
                      >❤️</button>
                      <button
                        type="button"
                        onClick={() => setLogRewatch(!logRewatch)}
                        style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', filter: logRewatch ? 'none' : 'grayscale(1) opacity(0.3)' }}
                        title="Rewatch"
                      >🔄</button>
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
                  <button className="tv-log-save" onClick={saveDiaryLog} disabled={logSaving || (!editingLogIds && logSeasons.length === 1 && logEpisodes.length === 0)}>{logSaving ? 'Saving...' : '💾 Save to Diary'}</button>
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import CustomSelect from '../../components/CustomSelect';

// ═══════════════════════════════════════════════════════════════════════
// STATS VIEW — Letterboxd-Inspired Movie Stats
// ═══════════════════════════════════════════════════════════════════════

const TMDB_IMG_STATS = 'https://image.tmdb.org/t/p';

export default function StatsView({ API, getToken, statsData, setStatsData, statsYear, setStatsYear, statsLoading, setStatsLoading, openModal, refreshTrigger }) {
  const [error, setError] = useState(null);
  const [highestRatedFilter, setHighestRatedFilter] = useState('current'); // 'current' | 'older'
  const [theatreFilter, setTheatreFilter] = useState('all');
  const [showAllTheatreTags, setShowAllTheatreTags] = useState(false);

  const fetchStats = useCallback(async (year) => {
    setStatsLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/movies/stats?year=${year}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await r.json();
      if (data.success) {
        setStatsData(data);
      } else {
        setError(data.message || 'Failed to load stats');
      }
    } catch (e) {
      setError(e.message);
    }
    setStatsLoading(false);
  }, [API, getToken, setStatsData, setStatsLoading]);

  useEffect(() => {
    fetchStats(statsYear);
    setHighestRatedFilter('current');
  }, [statsYear, fetchStats, refreshTrigger]);

  const handleYearChange = (e) => {
    setStatsYear(e.target.value);
  };

  // Render star icons for a given rating
  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (rating >= i) {
        stars.push(<span key={i} className="star-filled">★</span>);
      } else if (rating >= i - 0.5) {
        stars.push(<span key={i} className="star-filled">½</span>);
      }
    }
    return stars;
  };

  const filteredAndGroupedTheatreMovies = useMemo(() => {
    if (!statsData || !statsData.theatre_stats || !statsData.theatre_stats.movies) return [];

    // Filter first, so counts are accurate for the specific filter
    const filtered = statsData.theatre_stats.movies.filter(m =>
      theatreFilter === 'all' || m.tags.includes(theatreFilter)
    );

    const map = {};
    filtered.forEach(m => {
      if (!map[m.movie_id]) {
        map[m.movie_id] = { ...m, visitCount: 0, allTags: new Set() };
      }
      map[m.movie_id].visitCount += 1;
      m.tags.forEach(t => map[m.movie_id].allTags.add(t));
    });

    return Object.values(map).map(m => ({ ...m, tags: Array.from(m.allTags) }));
  }, [statsData, theatreFilter]);

  if (statsLoading && !statsData) {
    return (
      <div className="stats-loading">
        <div className="tv-loading-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
        <span>Loading your stats...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stats-loading">
        <span style={{ fontSize: '2rem' }}>😕</span>
        <span>{error}</span>
      </div>
    );
  }

  if (!statsData) return null;

  const d = statsData;
  const maxWeek = Math.max(...d.by_week, 1);
  const maxDay = Math.max(...d.by_day, 1);
  const maxMonth = Math.max(...(d.by_month || []), 1);
  const maxYear = d.films_by_year ? Math.max(...d.films_by_year.map(y => y.count), 1) : 1;
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Rating distribution for chart
  const ratingKeys = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'];
  const ratingValues = ratingKeys.map(k => d.rating_distribution[k] || d.rating_distribution[String(parseFloat(k))] || 0);
  const maxRating = Math.max(...ratingValues, 1);

  // Highest Rated Selection
  let highestRatedList = d.highest_rated || [];
  if (statsYear !== 'all') {
    highestRatedList = highestRatedFilter === 'current' ? (d.highest_rated_current || []) : (d.highest_rated_older || []);
  }

  return (
    <div className="stats-container">
      {/* ─── HERO ─── */}
      <div className="stats-hero">
        <div className="stats-year-display">{statsYear === 'all' ? '∞' : statsYear}</div>
        <div style={{ width: '120px', margin: '0 auto 8px', position: 'relative', zIndex: 10 }}>
          <CustomSelect
            value={statsYear}
            onChange={(val) => setStatsYear(val)}
            options={[
              { value: 'all', label: 'All Time' },
              ...(d.available_years || []).map(y => ({ value: String(y), label: String(y) }))
            ]}
          />
        </div>
        <div className="stats-subtitle">
          {statsYear === 'all' ? 'Your all-time movie journey' : `Your ${statsYear} year in film`}
        </div>
        {statsLoading && (
          <div style={{ marginTop: '0.75rem' }}>
            <div className="tv-loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', display: 'inline-block' }} />
          </div>
        )}
      </div>

      {/* ─── SUMMARY COUNTERS ─── */}
      <div className="stats-counters">
        <div className="stats-counter-card">
          <div className="stats-counter-value">{d.films_logged}</div>
          <div className="stats-counter-label">Films Watched</div>
        </div>
        <div className="stats-counter-card">
          <div className="stats-counter-value">{d.total_likes}</div>
          <div className="stats-counter-label">Likes</div>
        </div>
        <div className="stats-counter-card">
          <div className="stats-counter-value">{d.total_hours}</div>
          <div className="stats-counter-label">Hours</div>
        </div>
        {d.theatre_stats && d.theatre_stats.total_visits > 0 && (
          <div className="stats-counter-card">
            <div className="stats-counter-value">{d.theatre_stats.total_visits}</div>
            <div className="stats-counter-label">Theatre Visits</div>
          </div>
        )}
      </div>

      {/* ─── HIGHEST RATED ─── */}
      {highestRatedList.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">
            <span className="stats-section-title">🏆 Highest Rated Films</span>
            {statsYear !== 'all' && (
              <div className="stats-section-toggles">
                <button
                  className={`stats-toggle-btn ${highestRatedFilter === 'current' ? 'active' : ''}`}
                  onClick={() => setHighestRatedFilter('current')}
                >
                  {statsYear}
                </button>
                <button
                  className={`stats-toggle-btn ${highestRatedFilter === 'older' ? 'active' : ''}`}
                  onClick={() => setHighestRatedFilter('older')}
                >
                  Older
                </button>
              </div>
            )}
          </div>
          <div className="stats-poster-grid">
            {highestRatedList.map(m => (
              <div
                key={m.movie_id}
                className="stats-poster-item"
                onClick={() => openModal({ id: m.movie_id, tmdb_id: m.tmdb_id, type: 'movie', name: m.name, poster_path: m.poster_path })}
                style={{ cursor: 'pointer' }}
              >
                <div className="stats-poster-img-wrap">
                  {m.poster_path ? (
                    <img src={`${TMDB_IMG_STATS}/w342${m.poster_path}`} alt={m.name} loading="lazy" />
                  ) : (
                    <div className="stats-no-poster">🎬</div>
                  )}
                </div>
                <div className="stats-poster-rating">{renderStars(m.rating)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── THEATRE EXPERIENCES ─── */}
      {d.theatre_stats && d.theatre_stats.movies.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header" style={{ marginBottom: '0.75rem' }}>
            <span className="stats-section-title">🍿 Theatre Experiences <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>({d.theatre_stats.total_visits})</span></span>
          </div>

          {Object.keys(d.theatre_stats.supplementary_tags || {}).length > 0 && (
            <div className="stats-theatre-filters">
              <button
                className={`stats-theatre-pill ${theatreFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTheatreFilter('all')}
              >
                ALL <span>{d.theatre_stats.total_visits}</span>
              </button>
              {Object.entries(d.theatre_stats.supplementary_tags)
                .sort((a, b) => b[1] - a[1]) // sort by frequency
                .slice(0, showAllTheatreTags ? undefined : 6)
                .map(([tag, count]) => (
                  <button
                    key={tag}
                    className={`stats-theatre-pill ${theatreFilter === tag ? 'active' : ''}`}
                    onClick={() => setTheatreFilter(tag)}
                  >
                    {tag.toUpperCase()} <span>{count}</span>
                  </button>
                ))}
              {Object.keys(d.theatre_stats.supplementary_tags).length > 6 && (
                <button
                  className="stats-theatre-pill"
                  onClick={() => setShowAllTheatreTags(!showAllTheatreTags)}
                  style={{ background: 'transparent', border: '1px dashed rgba(var(--accent-rgb), 0.4)', opacity: 0.8 }}
                >
                  {showAllTheatreTags ? '- Show Less' : '+ Show More'}
                </button>
              )}
            </div>
          )}

          <div className="stats-poster-grid stats-theatre-grid">
            {filteredAndGroupedTheatreMovies.map((m) => (
              <div
                key={m.movie_id}
                className="stats-poster-item"
                onClick={() => openModal({ id: m.movie_id, tmdb_id: m.tmdb_id, type: 'movie', name: m.name, poster_path: m.poster_path })}
                style={{ cursor: 'pointer' }}
              >
                <div className="stats-poster-img-wrap">
                  {m.poster_path ? (
                    <img src={`${TMDB_IMG_STATS}/w342${m.poster_path}`} alt={m.name} loading="lazy" />
                  ) : (
                    <div className="stats-no-poster">🎬</div>
                  )}
                  {m.visitCount > 1 && (
                    <div className="tv-ep-badge" style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      fontSize: '0.8rem',
                      padding: '0.2rem 0.5rem',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
                      backgroundColor: 'var(--accent)',
                      color: '#000',
                      fontWeight: '800',
                      border: '1px solid rgba(255,255,255,0.4)',
                      borderRadius: '50%'
                    }}>
                      {m.visitCount}
                    </div>
                  )}
                </div>
                <div className="stats-poster-rating">{renderStars(m.rating)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── BY WEEK ─── */}
      <div className="stats-section">
        <div className="stats-section-header">
          <span className="stats-section-title">📈 By Week</span>
        </div>
        <div className="stats-week-chart">
          <div className="stats-week-bars">
            {d.by_week.map((count, i) => (
              <div
                key={i}
                className="stats-week-bar"
                style={{ height: count > 0 ? `${Math.max(4, (count / maxWeek) * 100)}%` : '0' }}
                data-count={`W${i + 1}: ${count} films`}
              />
            ))}
          </div>
          <div className="stats-week-labels">
            <span>Jan</span>
            <span>Apr</span>
            <span>Jul</span>
            <span>Oct</span>
            <span>Dec</span>
          </div>
        </div>
      </div>
      {/* ─── BY YEAR ─── */}
      {d.year === 'all' && d.films_by_year && d.films_by_year.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">
            <span className="stats-section-title">📅 Films by Year</span>
          </div>
          <div className="stats-month-chart"> {/* Reusing month chart CSS for similar bar style */}
            <div className="stats-month-bars" style={{ overflowX: 'auto', paddingBottom: '8px', justifyContent: d.films_by_year.length > 12 ? 'flex-start' : 'center' }}>
              {d.films_by_year.map((item, i) => (
                <div key={item.year} className="stats-month-bar-wrap" style={{ minWidth: '40px', flex: d.films_by_year.length > 12 ? '0 0 auto' : '1' }}>
                  <div className="stats-month-count">{item.count > 0 ? item.count : ''}</div>
                  <div
                    className="stats-month-bar"
                    style={{ height: item.count > 0 ? `${Math.max(6, (item.count / maxYear) * 100)}%` : '4px' }}
                    data-count={`${item.year}: ${item.count} films`}
                  />
                  <span className="stats-month-label">{item.year}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── BY MONTH ─── */}
      {d.by_month && d.by_month.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">
            <span className="stats-section-title">📊 By Month</span>
          </div>
          <div className="stats-month-chart">
            <div className="stats-month-bars">
              {d.by_month.map((count, i) => (
                <div key={i} className="stats-month-bar-wrap">
                  <div className="stats-month-count">{count > 0 ? count : ''}</div>
                  <div
                    className="stats-month-bar"
                    style={{ height: count > 0 ? `${Math.max(6, (count / maxMonth) * 100)}%` : '4px' }}
                    data-count={`${monthLabels[i]}: ${count} films`}
                  />
                  <span className="stats-month-label">{monthLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── AVERAGES ─── */}
      <div className="stats-section">
        <div className="stats-averages">
          <div className="stats-avg-item">
            <div className="stats-avg-value">{d.films_logged}</div>
            <div className="stats-avg-label">Films logged</div>
          </div>
          <span className="stats-avg-arrow">→</span>
          <div className="stats-avg-item">
            <div className="stats-avg-value">{d.avg_per_month}</div>
            <div className="stats-avg-label">Average per month</div>
          </div>
          <span className="stats-avg-arrow">→</span>
          <div className="stats-avg-item">
            <div className="stats-avg-value">{d.avg_per_week}</div>
            <div className="stats-avg-label">Average per week</div>
          </div>
        </div>
      </div>

      {/* ─── THE EXTREMES ─── */}
      {d.extremes && (d.extremes.longest || d.extremes.shortest || d.extremes.oldest || d.extremes.newest) && (
        <div className="stats-section">
          <div className="stats-section-header">
            <span className="stats-section-title">⚖️ The Extremes</span>
          </div>
          <div className="stats-extremes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {[
              { label: "Longest Film", data: d.extremes.longest, val: d.extremes.longest?.runtime ? `${d.extremes.longest.runtime} mins` : null, icon: "⏳" },
              { label: "Shortest Film", data: d.extremes.shortest, val: d.extremes.shortest?.runtime ? `${d.extremes.shortest.runtime} mins` : null, icon: "⏱️" },
              { label: "Oldest Release", data: d.extremes.oldest, val: d.extremes.oldest?.release_year, icon: "🏛️" },
              { label: "Newest Release", data: d.extremes.newest, val: d.extremes.newest?.release_year, icon: "✨" },
              { label: "Longest Streak", data: d.longest_streak?.length > 0 ? { id: 'streak', name: d.longest_streak.start === d.longest_streak.end ? d.longest_streak.start : `${d.longest_streak.start} to ${d.longest_streak.end}` } : null, val: `${d.longest_streak?.length} days`, icon: "🔥", noClick: true },
            ].map((ext, i) => ext.data && (
              <div key={i} onClick={() => !ext.noClick && openModal({ id: ext.data.id, tmdb_id: ext.data.tmdb_id, type: 'movie', name: ext.data.name, poster_path: ext.data.poster_path })} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-input)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', cursor: ext.noClick ? 'default' : 'pointer' }}>
                <div style={{ width: '45px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', background: ext.noClick ? 'var(--bg2)' : 'transparent', aspectRatio: '2/3' }}>
                  {ext.data.poster_path ? <img src={`${TMDB_IMG_STATS}/w92${ext.data.poster_path}`} alt="" style={{ width: '100%', display: 'block' }} /> : <div style={{ fontSize: '1.5rem' }}>{ext.icon}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{ext.icon}</span> {ext.label}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ext.data.name}</div>
                  <div style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }}>{ext.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MOST REWATCHED ─── */}
      {d.most_rewatched && d.most_rewatched.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">
            <span className="stats-section-title">🔁 Most Rewatched</span>
          </div>
          <div className="stats-poster-grid">
            {d.most_rewatched.map((m) => (
              <div key={m.movie_id} className="stats-poster-item" onClick={() => openModal({ id: m.movie_id, tmdb_id: m.tmdb_id, type: 'movie', name: m.name, poster_path: m.poster_path })}>
                <div className="stats-poster-img-wrap">
                  {m.poster_path ? (
                    <img src={`${TMDB_IMG_STATS}/w185${m.poster_path}`} alt={m.name} loading="lazy" />
                  ) : (
                    <div className="stats-poster-placeholder">
                      <span>{m.name}</span>
                    </div>
                  )}
                  <div style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.5rem',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
                    backgroundColor: 'var(--accent)',
                    color: '#000',
                    fontWeight: '800',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '50%'
                  }}>
                    {m.watch_count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── BOTTOM GRID ─── */}
      <div className="stats-bottom-grid">
        {/* Day of week */}
        <div>
          <div className="stats-section-header">
            <span className="stats-section-title">📅 By Day</span>
          </div>
          <div className="stats-day-chart">
            {d.by_day.map((count, i) => (
              <div key={i} className="stats-day-bar-wrap">
                <div
                  className={`stats-day-bar ${i >= 5 ? 'weekend' : ''}`}
                  style={{ height: count > 0 ? `${Math.max(4, (count / maxDay) * 80)}px` : '4px' }}
                  data-count={`${count} films`}
                />
                <span className="stats-day-label">{dayLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rating distribution */}
        <div>
          <div className="stats-section-header">
            <span className="stats-section-title">⭐ Ratings</span>
          </div>
          <div className="stats-rating-chart">
            {ratingKeys.map((k, i) => (
              <div key={k} className="stats-rating-bar-wrap">
                <div
                  className="stats-rating-bar"
                  style={{ height: ratingValues[i] > 0 ? `${Math.max(4, (ratingValues[i] / maxRating) * 80)}px` : '4px' }}
                  data-count={`${ratingValues[i]} films`}
                />
                <span className="stats-rating-label">{k.replace('.0', '').replace('.5', '½')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

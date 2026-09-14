import { useState } from 'react';

// ─── STAR RATING (FIXED) ────────────────────────────────────────────────
export function StarRating({ value = 0, onChange, size = 22, readonly = false }) {
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
export function StarDisplay({ value, size = 13 }) {
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

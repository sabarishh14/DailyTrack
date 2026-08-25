import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';

import { API } from '../constants';
import { getToken } from '../utils';

export default function TmdbMovieSearchInput({ value, onChange, onSelectMovie, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTmdb = async (q) => {
    if (!q.trim()) { setResults([]); setIsOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/movies/search?q=${encodeURIComponent(q)}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        setIsOpen(true);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const isSelected = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef(null);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    if (!isOpen) setActiveIndex(-1);
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isSelected.current && query) {
        searchTmdb(query);
      }
      isSelected.current = false;
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const r = results[activeIndex];
      isSelected.current = true;
      onSelectMovie(r);
      setQuery(`Movie (${r.title})`);
      onChange(`Movie (${r.title})`);
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', minWidth: '150px' }}>
      <input
        type="text"
        className="bulk-inp"
        placeholder={placeholder || "Search TMDB..."}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      {loading && <div style={{ position: 'absolute', right: '10px', top: '8px', fontSize: '12px' }}>⏳</div>}

      {isOpen && results.length > 0 && (
        <div className="custom-dropdown" style={{ minWidth: '250px' }} ref={listRef}>
          {results.map((r, idx) => (
            <div
              key={r.tmdb_id}
              className={`custom-dropdown-item ${idx === activeIndex ? 'active-item' : ''}`}
              style={{ display: 'flex', gap: '12px', alignItems: 'center' }}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                isSelected.current = true;
                onSelectMovie(r);
                setQuery(`Movie (${r.title})`);
                onChange(`Movie (${r.title})`);
                setIsOpen(false);
              }}
            >
              {r.poster_path ? (
                <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="poster" style={{ width: '36px', height: '54px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
              ) : (
                <div style={{ width: '36px', height: '54px', background: 'var(--border2)', borderRadius: '4px', flexShrink: 0 }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>{r.year}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

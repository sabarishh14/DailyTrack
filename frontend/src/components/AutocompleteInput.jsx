import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';


export default function AutocompleteInput({ value, onChange, options, placeholder }) {
  const [filtered, setFiltered] = useState([]);
  const [show, setShow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleType = (e) => {
    const val = e.target.value;
    onChange(val);
    setFiltered(options.filter(o => o.toLowerCase().includes(val.toLowerCase())));
    setShow(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!show) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault(); // Prevents cursor from moving
      setActiveIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      onChange(filtered[activeIndex]);
      setShow(false);
      setActiveIndex(-1);
    } else if (e.key === 'Escape') {
      setShow(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '40px' }}>
      <input
        type="text" className="bulk-inp" placeholder={placeholder}
        value={value} onChange={handleType} onKeyDown={handleKeyDown}
        onFocus={() => {
          const lowerVal = value.toLowerCase();
          const startsWith = options.filter(o => o.toLowerCase().startsWith(lowerVal));
          const contains = options.filter(o => o.toLowerCase().includes(lowerVal) && !o.toLowerCase().startsWith(lowerVal));
          setFiltered([...startsWith, ...contains]);
          setShow(true);
        }}
        onBlur={() => setTimeout(() => { setShow(false); setActiveIndex(-1); }, 200)}
      />
      {show && filtered.length > 0 && (
        <div className="custom-dropdown">
          {filtered.map((opt, idx) => (
            <div
              key={opt}
              className={`custom-dropdown-item ${idx === activeIndex ? 'active-item' : ''}`}
              onClick={() => { onChange(opt); setShow(false); setActiveIndex(-1); }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

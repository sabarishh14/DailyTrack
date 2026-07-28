import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from './SabDekho';

import { MONTHS } from '../constants';
import { formatDate } from '../utils';
import CustomSelect from '../components/CustomSelect';

function GymTab({ physical, onOpenModal }) {
  const [physMonth, setPhysMonth] = useState(new Date().getMonth());
  const [physYear, setPhysYear] = useState(new Date().getFullYear());

  // 1. Filter all records by the selected month and year
  const filteredRecords = physical.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === physMonth && d.getFullYear() === physYear;
  });

  // 2. Count how many of those filtered days had at least one activity
  const physActive = filteredRecords.filter(p =>
    p.gym || p.badminton || p.table_tennis || p.cricket || p.others
  ).length;

  // 3. Sort the filtered records for the table
  const sorted = [...filteredRecords].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="invest-layout" style={{ display: 'block' }}>

      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>

        {/* Cleaned Up Days Active Stat Block */}
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', background: 'var(--card)', padding: '1rem 1.5rem', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>

          {/* BIG Number */}
          <div style={{ fontSize: '3.2rem', fontWeight: 800, color: 'var(--accent2)', lineHeight: 0.85, fontFamily: "'Syne', sans-serif", position: 'relative', top: '-3px' }}>
            {physActive}
          </div>

          {/* Streamlined Label */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text)', fontWeight: 700, letterSpacing: '0.5px' }}>Days Active</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 500 }}>in {MONTHS[physMonth]} {physYear}</span>
          </div>

          <div style={{ width: '1px', height: '40px', background: 'var(--border)' }}></div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.25rem' }}>
            <CustomSelect
              value={physMonth}
              onChange={val => setPhysMonth(parseInt(val))}
              options={MONTHS.map((m, i) => ({ label: m, value: i }))}
              minWidth="130px"
            />
            <CustomSelect
              value={physYear}
              onChange={val => setPhysYear(parseInt(val))}
              options={[2024, 2025, 2026].map(y => ({ label: String(y), value: y }))}
              minWidth="100px"
            />
          </div>
        </div>


        <button className="action-btn" onClick={onOpenModal}>
          ➕ Log Activity
        </button>
      </div>

      {/* Data Table (Now Filtered!) */}
      <div>
        <div className="data-table">
          <div className="table-header" style={{ gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 2fr' }}>
            <span>📅 Date</span>
            <span style={{ textAlign: 'center' }}>🏋️ Gym</span>
            <span style={{ textAlign: 'center' }}>🏸 Badminton</span>
            <span style={{ textAlign: 'center' }}>🏓 TT</span>
            <span style={{ textAlign: 'center' }}>🏏 Cricket</span>
            <span style={{ textAlign: 'center' }}>🏃‍♂️ Others</span>
            <span>📝 Description</span>
          </div>
          {sorted.map((p, i) => (
            <div key={i} className={`table-row ${i % 2 === 0 ? 'row-even' : ''}`} style={{ gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 2fr' }}>
              <span style={{ fontWeight: 500 }}>{formatDate(p.date)}</span>
              <span style={{ textAlign: 'center' }}>{p.gym ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.badminton ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.table_tennis ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.cricket ? '✅' : '—'}</span>
              <span style={{ textAlign: 'center' }}>{p.others ? '✅' : '—'}</span>
              <span style={{ color: 'var(--text2)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description || '—'}</span>
            </div>
          ))}
          {sorted.length === 0 && <div className="empty-state">No activity logged in {MONTHS[physMonth]} {physYear}</div>}
        </div>
      </div>
    </div>
  );
}

export default memo(GymTab);

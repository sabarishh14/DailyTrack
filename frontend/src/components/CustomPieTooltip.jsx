import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';


export default function CustomPieTooltip({ active, payload, pieData }) {
  if (!active || !payload || !payload[0] || !pieData) return null;
  const { value, name } = payload[0];

  // Dynamically calculate the total and percentage
  const total = pieData.reduce((sum, item) => sum + item.value, 0);
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a2235 0%, #0d1117 100%)',
      border: '1px solid rgba(var(--accent-rgb), 0.6)',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      pointerEvents: 'none'
    }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px', fontWeight: 600 }}>
        {name}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'Syne, sans-serif' }}>
          ₹{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
          ({pct}%)
        </span>
      </div>
    </div>
  );
}

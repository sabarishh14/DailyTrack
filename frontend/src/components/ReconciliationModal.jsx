import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';

import { API, BANKS } from '../constants';
import { getToken, fmt } from '../utils';

export default function ReconciliationModal({ accounts, onClose, onRefresh }) {
  const [scanning, setScanning] = useState(false);

  const scanBalances = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/sync/ocr-balances`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      alert(data.message);
      if (data.success) onRefresh();
    } catch (e) {
      alert("Error: " + e.message + "\n(This might take a moment, check back later)");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '95%' }}>
        <div className="modal-header">
          <div className="modal-title">⚖️ Reconcile Balances</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text2)', maxWidth: '400px', lineHeight: 1.5 }}>
              Upload UPI screenshots to your specific Drive folder, then click Scan to detect discrepancies.
            </div>
            <button className="action-btn" onClick={scanBalances} disabled={scanning} style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' }}>
              {scanning ? '⏳ Scanning Drive...' : '📸 Scan Screenshots'}
            </button>
          </div>

          <div className="data-table">
            <div className="table-header" style={{ gridTemplateColumns: '1.5fr 1.2fr 1.2fr 1.5fr' }}>
              <span>Account</span>
              <span>App Tracked</span>
              <span>Bank Real</span>
              <span>Action Required</span>
            </div>
            {accounts.filter(a => a.balance_tracked && a.account !== 'CC-PINNACLE 6360').map((acc, i) => {
              const tracked = acc.balance || 0;
              const real = acc.real_balance;
              const diff = real !== null && real !== undefined ? tracked - real : null;

              let status = "";
              let actionClass = "";

              if (diff === null) {
                status = "Not Scanned";
                actionClass = "text3";
              } else if (diff === 0) {
                status = "✅ NO CHANGE";
                actionClass = "pos";
              } else if (diff < 0) {
                // C4 - D4 < 0: Move money OUT of real account
                status = `🔴 REDUCE ₹${Math.abs(diff)}`;
                actionClass = "neg";
              } else {
                // C4 - D4 > 0: Move money INTO real account
                status = `🟢 INCREASE ₹${Math.abs(diff)}`;
                actionClass = "pos";
              }

              return (
                <div key={acc.account} className={`table-row ${i % 2 === 0 ? 'row-even' : ''}`} style={{ gridTemplateColumns: '1.5fr 1.2fr 1.2fr 1.5fr' }}>
                  <span style={{ fontWeight: 600 }}>{BANKS[acc.account]?.emoji} {acc.account}</span>
                  <span style={{ fontFamily: 'Syne, sans-serif' }}>{fmt(tracked)}</span>
                  <span style={{ fontFamily: 'Syne, sans-serif', color: real !== null ? 'var(--accent2)' : 'var(--text3)' }}>
                    {real !== null ? fmt(real) : "—"}
                  </span>
                  <span className={actionClass} style={{ fontWeight: 800, fontSize: '0.85rem' }}>{status}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

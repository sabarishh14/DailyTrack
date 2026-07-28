import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';

import { API } from '../constants';
import { getToken } from '../utils';

export default function AddActivityModal({ onAdd, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    date: today, gym: false, badminton: false, table_tennis: false, cricket: false, others: false, description: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/physical`, {
        method: "POST", headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(form),
      });
      if (res.ok) {
        onAdd();
        setSuccess(true);
        setTimeout(() => { setSuccess(false); onClose(); }, 1500);
      } else {
        alert("Failed to log activity.");
      }
    } catch (e) {
      alert("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">🏋️ Log Activity</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="add-form-card" style={{ border: 'none', padding: 0, minWidth: 'auto', background: 'transparent' }}>

            <div className="form-group">
              <label>Date</label>
              <input type="date" className="inp" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Activities Completed</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  ['gym', '🏋️ Gym'], ['badminton', '🏸 Badminton'],
                  ['table_tennis', '🏓 Table Tennis'], ['cricket', '🏏 Cricket'],
                  ['others', '🏃‍♂️ Others']
                ].map(([key, label]) => (
                  <div
                    key={key} onClick={() => set(key, !form[key])}
                    style={{
                      padding: '0.65rem', border: `1px solid ${form[key] ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                      background: form[key] ? 'rgba(99,102,241,0.1)' : 'transparent', transition: 'all 0.2s'
                    }}
                  >
                    <div className={`chip-checkbox ${form[key] ? 'checked' : ''}`} style={{ margin: 0 }} />
                    <span style={{ fontSize: '0.85rem', color: form[key] ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Notes (Optional)</label>
              <input className="inp" placeholder="e.g., Leg day, 5km run..." value={form.description} onChange={e => set('description', e.target.value)} />
            </div>

            <button className={`submit-btn ${success ? 'success' : ''}`} onClick={submit} disabled={loading} style={{ marginTop: '0.5rem' }}>
              {loading ? "Saving..." : success ? "✅ Saved!" : "Save Activity"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

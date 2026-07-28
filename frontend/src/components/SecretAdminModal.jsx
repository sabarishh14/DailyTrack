import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';

import { API } from '../constants';
import { getToken } from '../utils';

export default function SecretAdminModal({ onClose }) {
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchEmails = async () => {
    try {
      const res = await fetch(`${API}/admin/emails`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setEmails(data.emails);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchEmails(); }, []);

  const handleAdd = async () => {
    if (!newEmail.includes('@')) return;
    await fetch(`${API}/admin/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ email: newEmail })
    });
    setNewEmail('');
    fetchEmails();
  };

  const handleRemove = async (email) => {
    if (!window.confirm(`Revoke access for ${email}?`)) return;
    await fetch(`${API}/admin/emails/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    fetchEmails();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', border: '1px solid var(--accent)' }}>
        <div className="modal-header" style={{ background: 'rgba(var(--accent-rgb), 0.1)', borderBottom: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🧑‍💻</span> Developer Access Control
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input
              className="inp"
              placeholder="friend@gmail.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value.toLowerCase())}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button className="action-btn" onClick={handleAdd}>Add</button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>Approved Accounts</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>sbsabarish14@gmail.com</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 700, padding: '0.1rem 0.4rem', background: 'var(--bg3)', borderRadius: '4px' }}>MASTER</span>
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text3)' }}>Loading...</div> : emails.map(email => (
              <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>{email}</span>
                <button
                  onClick={() => handleRemove(email)}
                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--neg)', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>
            ))}
            {emails.length === 0 && !loading && <div style={{ fontSize: '0.85rem', color: 'var(--text3)', textAlign: 'center', padding: '1rem' }}>No guest accounts added.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

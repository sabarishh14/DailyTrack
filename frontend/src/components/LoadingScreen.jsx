import { useState, useEffect, useRef } from "react";

export default function LoadingScreen({ logs = [] }) {
  const [showWakeMsg, setShowWakeMsg] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Show wake up message if loading takes more than 3 seconds
    const wakeTimer = setTimeout(() => setShowWakeMsg(true), 3000);
    // Smoothly expand the logo after a longer pause (850ms) to let DT strike
    const expTimer = setTimeout(() => setExpanded(true), 850);

    return () => {
      clearTimeout(wakeTimer);
      clearTimeout(expTimer);
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: '1.5rem', padding: '1rem' }}>
      
      <div className="logo-name" style={{ fontSize: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span>D</span>
        <span 
          style={{ 
            display: 'inline-block',
            maxWidth: expanded ? '150px' : '0px', 
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-width 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >aily</span>
        <span>T</span>
        <span 
          style={{ 
            display: 'inline-block',
            maxWidth: expanded ? '150px' : '0px', 
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-width 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >rack</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'bounce 0.8s ease infinite',
            animationDelay: `${i * 0.15}s`
          }} />
        ))}
      </div>
      
      {showWakeMsg && (
        <div style={{ color: 'var(--text2)', fontSize: '0.9rem', marginTop: '1rem', animation: 'fadeIn 0.5s ease', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%', maxWidth: '600px' }}>
          <div>
            Waking up the server...<br />
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(This can take up to 1-2 minutes on free tiers)</span>
          </div>

          {logs.length > 0 && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text3)', opacity: 0.5, fontFamily: 'monospace', animation: 'fadeIn 0.3s ease', marginTop: '0.5rem' }}>
              {logs[logs.length - 1]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

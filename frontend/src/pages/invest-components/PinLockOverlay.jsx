export default function PinLockOverlay({
  savedPin,
  pinInput,
  pinError,
  showPin,
  setShowPin,
  inputRefs,
  handlePinChange,
  handlePinKeyDown,
  handlePinSubmit,
}) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8, 11, 18, 0.3)' // Dark tint over the whole screen
    }}>
      <div style={{ background: 'var(--card)', padding: '2.5rem 2rem', borderRadius: '20px', border: '1px solid var(--border)', textAlign: 'center', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', width: '90%', maxWidth: '360px', animation: 'slideUp 0.3s ease' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', lineHeight: 1 }}>🔒</div>
        <h3 style={{ fontFamily: "'Syne', sans-serif", margin: '0 0 0.5rem 0', color: 'var(--text)', fontSize: '1.4rem' }}>
          {savedPin ? 'Enter PIN' : 'Set up a PIN'}
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '2rem' }}>
          {savedPin ? 'Unlock your investment portfolio.' : 'Protect your assets with a 4-digit PIN.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {[0, 1, 2, 3].map((index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type={showPin ? "text" : "password"}
                maxLength={1}
                value={pinInput[index] || ''}
                onChange={(e) => handlePinChange(index, e.target.value)}
                onKeyDown={(e) => handlePinKeyDown(index, e)}
                style={{
                  background: 'var(--bg3)',
                  border: `2px solid ${pinError ? 'var(--neg)' : 'var(--border)'}`,
                  color: 'var(--text)',
                  fontSize: '1.8rem',
                  padding: '0.75rem 0',
                  borderRadius: '12px',
                  width: '52px',
                  textAlign: 'center',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  fontFamily: 'monospace'
                }}
                autoFocus={index === 0}
              />
            ))}
          </div>
          <button
            onClick={() => setShowPin(!showPin)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text3)',
              fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline'
            }}
          >
            {showPin ? 'Hide PIN' : 'Show PIN'}
          </button>
        </div>
        {pinError && <div style={{ color: 'var(--neg)', fontSize: '0.8rem', marginTop: '0.75rem', fontWeight: 600 }}>{savedPin ? 'Incorrect PIN' : 'PIN must be exactly 4 digits'}</div>}

        <button
          onClick={handlePinSubmit}
          style={{ width: '100%', marginTop: '2rem', background: 'linear-gradient(135deg, var(--accent), var(--accent3))', color: '#fff', border: 'none', padding: '1rem', borderRadius: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', transition: 'transform 0.2s', boxShadow: '0 8px 20px rgba(99,102,241,0.3)' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          {savedPin ? 'Unlock Portfolio' : 'Save & Lock'}
        </button>

        {savedPin && (
          <div
            onClick={() => {
              if (window.confirm('Forgot your PIN? This will sign you out to verify your identity.')) {
                localStorage.removeItem('dt_inv_pin');
                localStorage.removeItem('dt_token'); // Kills the session
                window.location.reload(); // Forces back to Google Login page
              }
            }}
            style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '1.25rem', cursor: 'pointer', textDecoration: 'underline', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
          >
            Forgot PIN?
          </div>
        )}
      </div>
    </div>
  );
}

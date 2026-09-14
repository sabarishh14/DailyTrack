import { TABS } from '../../constants';

export default function MobileBottomNav({ tab, setTab, handleLogoClick }) {
  return (
    <nav className="mobile-bottom-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`mobile-nav-item ${tab === t.id ? 'active' : ''} ${t.add ? 'add-item' : ''}`}
          // Trigger the secret menu ONLY if it's the Home tab (id: 0)
          onClick={() => t.id === 0 ? handleLogoClick() : setTab(t.id)}
        >
          <span className="mobile-nav-icon">{t.icon}</span>
          {/* Split the label so things like "Gym & Activity" don't break the UI */}
          <span className="mobile-nav-label">{t.label.split(' ')[0]}</span>
        </button>
      ))}
    </nav>
  );
}

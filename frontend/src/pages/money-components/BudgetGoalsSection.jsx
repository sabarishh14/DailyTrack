import { fmt } from '../../utils';
import { useAccess } from '../../access/AccessContext';

export default function BudgetGoalsSection({
  budgetExpanded,
  setBudgetExpanded,
  budgets,
  currentMonthSpending,
  setIsBudgetModalOpen,
  editingBudgetCategory,
  setEditingBudgetCategory,
  editingBudgetValue,
  setEditingBudgetValue,
  handleInlineBudgetSave,
  spendingLoaded = true,
}) {
  const canEdit = useAccess().can('money', 'edit');
  return (
    <div className="analyser-card">
      <div
        className={`analyser-header ${budgetExpanded ? 'open' : ''}`}
        onClick={(e) => {
          if (e.target.closest('.budget-settings-btn') || e.target.closest('.budget-inline-edit')) return;
          setBudgetExpanded(!budgetExpanded);
        }}
      >
        <div className="analyser-header-left">
          <div className="analyser-header-icon" style={{ background: 'rgba(236, 72, 153, 0.15)' }}>🎯</div>
          <div>
            <div className="analyser-header-title">Budget Goals</div>
            <div className="analyser-header-sub" style={{ display: budgetExpanded ? 'none' : 'block' }}>
              {budgets.length === 0 ? (
                <span>No budgets set</span>
              ) : !spendingLoaded ? (
                <span className="skeleton-line" style={{ width: 120 }} />
              ) : (
                <span>{budgets.filter(b => (currentMonthSpending[b.category] || 0) > b.monthly_limit).length} of {budgets.length} over budget</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {canEdit && (
          <button
            className="budget-settings-btn"
            onClick={(e) => { e.stopPropagation(); setIsBudgetModalOpen(true); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: '4px', fontSize: '1.1rem' }}
            title="Manage Budgets"
          >
            ⚙️
          </button>
          )}
          <span className={`analyser-chevron ${budgetExpanded ? 'open' : ''}`} style={{ marginLeft: '4px' }}>▼</span>
        </div>
      </div>

      {budgetExpanded && (
        <div className="analyser-body">
          {budgets.length === 0 ? (
            <div className="budget-empty-state" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text3)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎯</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>{canEdit ? 'Set your first budget goal' : 'No budget goals yet'}</div>
              <div style={{ fontSize: '0.85rem', marginBottom: canEdit ? '1.5rem' : 0 }}>Track your monthly spending limits by category.</div>
              {canEdit && (
              <button className="action-btn" onClick={() => setIsBudgetModalOpen(true)} style={{ margin: '0 auto', display: 'flex' }}>
                Manage Budgets
              </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {budgets.map(b => {
                const spent = currentMonthSpending[b.category] || 0;
                const limit = b.monthly_limit;
                const percentage = Math.min((spent / limit) * 100, 100);
                const isOver = spent > limit;
                let colorClass = 'green';
                if (percentage >= 80 && !isOver) colorClass = 'yellow';
                if (isOver) colorClass = 'red';

                // Pace projection: at the current day-of-month spend rate, will this
                // land over budget by month end? Catches a fast start early, before
                // the bar itself would ever turn red.
                const now = new Date();
                const dayOfMonth = now.getDate();
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const projected = spent * (daysInMonth / dayOfMonth);
                const showPaceWarning = !isOver && spent > 0 && projected > limit;

                return (
                  <div key={b.category} className="budget-item" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className="budget-item-header">
                      <span className="budget-item-category">{b.category}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', flexShrink: 0 }}>
                        <span style={{ color: isOver ? 'var(--neg)' : 'var(--text)' }}>{fmt(spent)}</span>
                        <span style={{ color: 'var(--text3)' }}>/</span>
                        {editingBudgetCategory === b.category ? (
                          <input
                            autoFocus
                            type="number"
                            className="budget-inline-edit"
                            value={editingBudgetValue}
                            onChange={e => setEditingBudgetValue(e.target.value)}
                            onBlur={() => handleInlineBudgetSave(b.category)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineBudgetSave(b.category);
                              if (e.key === 'Escape') setEditingBudgetCategory(null);
                            }}
                            style={{ width: '70px', background: 'var(--bg-input)', border: '1px solid var(--accent)', color: 'var(--text)', padding: '2px 4px', borderRadius: '4px', textAlign: 'right' }}
                          />
                        ) : (
                          <span
                            style={canEdit ? { color: 'var(--text2)', cursor: 'pointer', borderBottom: '1px dashed var(--border)' } : { color: 'var(--text2)' }}
                            onClick={canEdit ? () => { setEditingBudgetCategory(b.category); setEditingBudgetValue(b.monthly_limit); } : undefined}
                            title={canEdit ? 'Edit Limit' : undefined}
                          >
                            {fmt(limit)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="budget-bar-track" style={{ height: '8px', background: 'var(--bg2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        className={`budget-bar-fill ${colorClass}`}
                        style={{ width: `${percentage}%`, height: '100%', borderRadius: '4px', transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
                      />
                    </div>

                    {showPaceWarning && (
                      <div style={{ fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span aria-hidden="true">⚡</span> On pace for {fmt(projected)} by month end
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

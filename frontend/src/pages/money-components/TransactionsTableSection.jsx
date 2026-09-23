import { fmt, formatDate, getBankEmoji } from '../../utils';
import MultiSelectDropdown from './MultiSelectDropdown';
import RowsPerPageDropdown from './RowsPerPageDropdown';
import BulkEditTransactionModal from '../../components/BulkEditTransactionModal';
import { useAccess } from '../../access/AccessContext';

export default function TransactionsTableSection({
  dropdownRef,
  openDropdown,
  setOpenDropdown,

  filterVisibility, setFilterVisibility,
  allAccountsList, filterAccounts, setFilterAccounts,
  allTypes, filterTypes, setFilterTypes,
  allMonths, filterMonths, setFilterMonths,
  allYears, filterYears, setFilterYears,
  allHeadings, filterHeadings, setFilterHeadings,
  allFYs, filterFY, handleFilterFYChange,
  filterDateFrom, setFilterDateFrom,
  filterDateTo, setFilterDateTo,
  setFilterFY,
  filterDesc, setFilterDesc,

  tableTotal,
  tableSums,
  totalPages,
  paginatedRows,
  currentPage, setCurrentPage,
  rowsPerPage, setRowsPerPage,

  colWidths,
  handleStartResize,
  handleSortClick,
  sortBy,
  sortDir,

  selectedIds, setSelectedIds,
  handleSelectAll,
  handleRowSelect,

  setActionMenuTx,
  setEditingTx,
  setCopyingTx,
  handleDelete,
  handleBulkDelete,

  isBulkEditOpen, setIsBulkEditOpen,
  isBulkCopyOpen, setIsBulkCopyOpen,

  selectedTransactions,
  categories,
  onRefresh,
}) {
  const canEdit = useAccess().can('money', 'edit');
  return (
    <section className="section" style={{ marginTop: '3rem' }}>
      <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>💳 All Transactions</h2>

      {/* Table Filters */}
      <div className="filter-bar" ref={dropdownRef}>
        <MultiSelectDropdown
          label="Visibility"
          icon="👁️"
          options={["Active", "Excluded"]}
          filterState={filterVisibility}
          setFilterState={setFilterVisibility}
          dropdownKey="tableVisibility"
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
        />
        <MultiSelectDropdown
          label="Account"
          icon="🏦"
          options={allAccountsList}
          filterState={filterAccounts}
          setFilterState={setFilterAccounts}
          dropdownKey="tableAccount"
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
        />
        <MultiSelectDropdown
          label="Type"
          icon="💳"
          options={allTypes}
          filterState={filterTypes}
          setFilterState={setFilterTypes}
          dropdownKey="tableType"
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
        />
        <MultiSelectDropdown
          label="Month"
          icon="📅"
          options={allMonths}
          filterState={filterMonths}
          setFilterState={setFilterMonths}
          dropdownKey="tableMonth"
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
        />
        <MultiSelectDropdown
          label="Year"
          icon="📆"
          options={allYears}
          filterState={filterYears}
          setFilterState={setFilterYears}
          dropdownKey="tableYear"
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
        />
        <MultiSelectDropdown
          label="Heading"
          icon="🏷️"
          options={allHeadings}
          filterState={filterHeadings}
          setFilterState={setFilterHeadings}
          dropdownKey="tableHeading"
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
        />
        {/* Financial Year Filter */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-chip ${filterFY ? 'active' : ''} ${openDropdown === 'tableFY' ? 'open' : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'tableFY' ? null : 'tableFY')}
          >
            <span>📋</span>
            <span>{filterFY || 'FY'}</span>
            {filterFY && (
              <span
                className="chip-clear"
                onClick={(e) => { e.stopPropagation(); handleFilterFYChange(''); }}
                title="Clear FY"
              >
                ×
              </span>
            )}
            <span className="chip-arrow">▼</span>
          </button>
          {openDropdown === 'tableFY' && (
            <div className="chip-dropdown">
              {allFYs.map(fy => (
                <div
                  key={fy}
                  className={`chip-dropdown-item ${filterFY === fy ? 'included' : ''}`}
                  onClick={() => { handleFilterFYChange(filterFY === fy ? '' : fy); setOpenDropdown(null); }}
                >
                  <div className={`chip-checkbox ${filterFY === fy ? 'included' : ''}`} />
                  <span>{fy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="date-filter-chip">
          <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>📅</span>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => { setFilterDateFrom(e.target.value); setFilterFY(""); }}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: filterDateFrom ? 'var(--text)' : 'var(--text2)', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", width: filterDateFrom ? '100px' : '90px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>→</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => { setFilterDateTo(e.target.value); setFilterFY(""); }}
            min={filterDateFrom}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: filterDateTo ? 'var(--text)' : 'var(--text2)', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", width: filterDateTo ? '100px' : '90px', cursor: 'pointer' }}
          />
          {(filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterFY(''); }} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>
        <input
          className="inp"
          placeholder="🔍 Description"
          value={filterDesc}
          onChange={e => setFilterDesc(e.target.value)}
          style={{ fontSize: '0.8rem', width: '200px', padding: '0.45rem 0.75rem', borderRadius: '999px' }}
        />
        {(filterAccounts.included.size > 0 || filterAccounts.excluded.size > 0 ||
          filterTypes.included.size > 0 || filterTypes.excluded.size > 0 ||
          filterMonths.included.size > 0 || filterMonths.excluded.size > 0 ||
          filterYears.included.size > 0 || filterYears.excluded.size > 0 ||
          filterHeadings.included.size > 0 || filterHeadings.excluded.size > 0 ||
          filterVisibility.included.size > 0 || filterVisibility.excluded.size > 0 ||
          filterDateFrom || filterDateTo || filterDesc || filterFY) && (
            <button
              className="filter-chip"
              onClick={() => {
                const empty = { included: new Set(), excluded: new Set() };
                setFilterAccounts(empty); setFilterTypes(empty); setFilterMonths(empty);
                setFilterYears(empty); setFilterHeadings(empty); setFilterVisibility(empty);
                setFilterDateFrom(""); setFilterDateTo(""); setFilterDesc(""); setFilterFY("");
              }}
              style={{ border: '1px dashed var(--neg)', color: 'var(--neg)', background: 'transparent' }}
            >
              <span>❌</span><span>Clear All</span>
            </button>
          )}
      </div>

      {/* Stats Bar & Pagination - Above Table */}
      {tableTotal > 0 && (
        <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <div className="tx-stats-bar" style={{ marginBottom: '1.5rem' }}>
            <span>
              Page <strong style={{ color: 'var(--text)' }}>{currentPage + 1} of {totalPages}</strong> · Showing <strong style={{ color: 'var(--text)' }}>{paginatedRows.length}</strong> of {tableTotal} transactions
            </span>
            <span>
              <span className="pos" style={{ fontWeight: 600 }}>{fmt(tableSums.credit)}</span>
              {' '}in &nbsp;·&nbsp;
              <span className="neg" style={{ fontWeight: 600 }}>{fmt(tableSums.debit)}</span>
              {' '}out
            </span>
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <RowsPerPageDropdown
              value={rowsPerPage}
              onChange={setRowsPerPage}
              openDropdown={openDropdown}
              setOpenDropdown={setOpenDropdown}
              setCurrentPage={setCurrentPage}
            />

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: currentPage === 0 ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)',
                  color: currentPage === 0 ? 'var(--text2)' : 'var(--text)',
                  cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  opacity: currentPage === 0 ? 0.5 : 1
                }}
              >
                ← Prev
              </button>

              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i;
                  } else if (currentPage < 2) {
                    pageNum = i;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 5 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        border: pageNum === currentPage ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: pageNum === currentPage ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg-input)',
                        color: pageNum === currentPage ? 'var(--accent)' : 'var(--text2)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: pageNum === currentPage ? 600 : 400
                      }}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage === totalPages - 1}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: currentPage === totalPages - 1 ? 'rgba(255,255,255,0.05)' : 'var(--bg-input)',
                  color: currentPage === totalPages - 1 ? 'var(--text2)' : 'var(--text)',
                  cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  opacity: currentPage === totalPages - 1 ? 0.5 : 1
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions List */}
      <div className="tx-table-wrap">
        <div className="tx-table-head" style={{ gridTemplateColumns: `${colWidths.checkbox}px ${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px minmax(250px, 1fr) ${colWidths.actions}px` }}>
          <div className="tx-col-header" style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0 }} onClick={canEdit ? handleSelectAll : undefined}>
            {canEdit && <div className={`chip-checkbox ${selectedIds.size > 0 && selectedIds.size === paginatedRows.length ? 'included' : ''}`} />}
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('date')}>
            <span>Date</span>
            {sortBy === 'date' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            <div className="col-resize" onMouseDown={(e) => handleStartResize('date', e)}></div>
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('account')}>
            <span>Account</span>
            {sortBy === 'account' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            <div className="col-resize" onMouseDown={(e) => handleStartResize('account', e)}></div>
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('type')}>
            <span>Type</span>
            {sortBy === 'type' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            <div className="col-resize" onMouseDown={(e) => handleStartResize('type', e)}></div>
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('month')}>
            <span>Month</span>
            {sortBy === 'month' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            <div className="col-resize" onMouseDown={(e) => handleStartResize('month', e)}></div>
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('amount')}>
            <span>Amount</span>
            {sortBy === 'amount' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            <div className="col-resize" onMouseDown={(e) => handleStartResize('amount', e)}></div>
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('heading')}>
            <span>Category</span>
            {sortBy === 'heading' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            <div className="col-resize" onMouseDown={(e) => handleStartResize('heading', e)}></div>
          </div>
          <div className="tx-col-header" onClick={() => handleSortClick('desc')}>
            <span>Description</span>
            {sortBy === 'desc' && <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          <div className="tx-col-header">
            <span>Actions</span>
          </div>
        </div>
        {paginatedRows.length > 0 ? (
          paginatedRows.map((t, i) => {
            const d = new Date(t.date);
            const monthLabel = d.toLocaleString('default', { month: 'long' });
            return (
              <div
                key={i}
                className="tx-row"
                style={{ gridTemplateColumns: `${colWidths.checkbox}px ${colWidths.date}px ${colWidths.account}px ${colWidths.type}px ${colWidths.month}px ${colWidths.amount}px ${colWidths.heading}px minmax(250px, 1fr) ${colWidths.actions}px`, cursor: 'pointer' }}
                onClick={() => setActionMenuTx(t)} // <-- Opens the details modal
              >
                <span style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0, cursor: canEdit ? 'pointer' : 'inherit' }} onClick={canEdit ? (e) => handleRowSelect(e, t.id, i) : undefined}>
                  {canEdit && <div className={`chip-checkbox ${selectedIds.has(t.id) ? 'included' : ''}`} />}
                </span>
                <span className="tx-date">{formatDate(t.date)}</span>
                <span className="tx-account">
                  <span>{getBankEmoji(t.account)}</span>
                  <span>{t.account}</span>
                </span>
                <span className="tx-type-cell"><span className={`tx-badge ${t.type}`}>{t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span></span>
                <span className="tx-month">{monthLabel}</span>
                <span className={`tx-amount ${t.type === 'Debit' ? 'neg' : t.type === 'Credit' ? 'pos' : t.type === 'investment' ? 'blue-text' : 'accent'}`}>
                  {t.type === 'Debit' ? '−' : '+'}{fmt(t.amount)}
                </span>
                <span className="tx-heading">{t.heading}</span>
                <span className="tx-desc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description || '—'}
                  </span>
                  <span style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {t.split && (
                      <span title="Contains Split Details" style={{ fontSize: '0.9rem', cursor: 'help' }}>
                        👥
                      </span>
                    )}
                    {t.exclude_analytics && (
                      <span title="Excluded from Analytics" style={{ fontSize: '0.9rem', cursor: 'help' }}>
                        🙈
                      </span>
                    )}
                  </span>
                </span>
                <span className="tx-actions">
                  {canEdit ? (
                    <>
                      <button className="action-icon-btn edit" onClick={(e) => { e.stopPropagation(); setEditingTx(t); }} title="Edit">✏️</button>
                      <button className="action-icon-btn copy" onClick={(e) => { e.stopPropagation(); setCopyingTx(t); }} title="Duplicate">📋</button>
                      <button className="action-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} title="Delete">🗑️</button>
                    </>
                  ) : (
                    <span className="view-only-pill" title="You have view-only access">View only</span>
                  )}
                </span>
              </div>
            );
          })
        ) : (
          <div className="empty-state">📭 No transactions match your filters</div>
        )}
        {/* Floating Action Bar */}
        {canEdit && selectedIds.size > 0 && (
          <div className="floating-action-bar">
            <span className="fab-text">{selectedIds.size} selected</span>
            <div className="fab-actions">
              <button className="action-btn" onClick={() => setIsBulkEditOpen(true)} style={{ padding: '0.45rem 1rem' }}>✏️ <span className="hide-mobile">Edit</span></button>
              <button className="action-btn" onClick={() => setIsBulkCopyOpen(true)} style={{ padding: '0.45rem 1rem' }}>📋 <span className="hide-mobile">Duplicate</span></button>
              <button className="action-btn" onClick={handleBulkDelete} style={{ padding: '0.45rem 1rem', background: '#dc2626', boxShadow: 'none' }}>🗑️ <span className="hide-mobile">Delete</span></button>
              <button className="action-btn secondary" onClick={() => setSelectedIds(new Set())} style={{ padding: '0.45rem 1rem' }}>✕</button>
            </div>
          </div>
        )}

        {/* Bulk Edit Modal */}
        {isBulkEditOpen && (
          <BulkEditTransactionModal transactions={selectedTransactions} categories={categories} onClose={() => { setIsBulkEditOpen(false); setSelectedIds(new Set()); }} onRefresh={onRefresh} />
        )}

        {/* Bulk Copy Modal */}
        {isBulkCopyOpen && (
          <BulkEditTransactionModal transactions={selectedTransactions} categories={categories} isCopy={true} onClose={() => { setIsBulkCopyOpen(false); setSelectedIds(new Set()); }} onRefresh={onRefresh} />
        )}
      </div>
    </section>
  );
}

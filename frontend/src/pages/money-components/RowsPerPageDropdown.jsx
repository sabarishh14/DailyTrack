import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function RowsPerPageDropdown({ value, onChange, openDropdown, setOpenDropdown, setCurrentPage }) {
  const containerRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    if (openDropdown === 'rowsPerPage' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isOffBottom = rect.bottom + 200 > window.innerHeight;
      setDropdownStyle({
        position: 'fixed',
        top: isOffBottom ? 'auto' : `${rect.bottom + 4}px`,
        bottom: isOffBottom ? `${window.innerHeight - rect.top + 4}px` : 'auto',
        left: `${rect.left}px`,
        minWidth: `${rect.width}px`,
        zIndex: 999999
      });
    }
  }, [openDropdown]);

  return (
    <div style={{ position: 'relative' }} ref={containerRef}>
      <button
        className={`filter-chip ${openDropdown === 'rowsPerPage' ? 'open' : ''}`}
        onClick={() => setOpenDropdown(openDropdown === 'rowsPerPage' ? null : 'rowsPerPage')}
      >
        <span>📄</span>
        <span>{value} rows</span>
        <span className="chip-arrow">▼</span>
      </button>

      {openDropdown === 'rowsPerPage' && createPortal(
        <div className="chip-dropdown portaled" style={{ ...dropdownStyle }}>
          {[10, 25, 50, 100].map(opt => (
            <div
              key={opt}
              className={`chip-dropdown-item ${value === opt ? 'included' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(opt);
                setOpenDropdown(null);
                setCurrentPage(0);
              }}
            >
              {/* "included" is the ticked state every chip dropdown styles. */}
              <div className={`chip-checkbox ${value === opt ? 'included' : ''}`} />
              <span>{opt}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// Placeholder for a collapsible section card (icon, title, one-line summary)
// while its data loads, so the card holds its place instead of popping in.
export function SectionCardSkeleton() {
  return (
    <div className="analyser-card" aria-busy="true">
      <div className="analyser-header" style={{ cursor: 'default' }}>
        <div className="analyser-header-left">
          <span className="skeleton-block" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="skeleton-line" style={{ width: 90 }} />
            <span className="skeleton-line" style={{ width: 150, height: '0.6em' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

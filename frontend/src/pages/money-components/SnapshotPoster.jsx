import { PieChart, Pie, Cell } from "recharts";

export default function SnapshotPoster({
  pieArr,
  captureColors,
  captureMode,
  isShowingDescriptions,
  filterDesc,
  chartHeadings,
  analyzerFiltered,
  renderActiveFilters,
  PIE_COLORS,
}) {
  return (
    <>
      {Array.from({ length: Math.max(1, Math.ceil(pieArr.length / 30)) }).map((_, pageIndex) => {
        const chunk = pieArr.slice(pageIndex * 30, (pageIndex + 1) * 30);
        const totalPages = Math.max(1, Math.ceil(pieArr.length / 30));

        const c = captureColors || {
          bg: '#080b12', card: '#0d1117', border: 'rgba(255,255,255,0.05)',
          text: 'white', text2: 'rgba(255,255,255,0.5)', text3: 'rgba(255,255,255,0.3)',
          accent: '#818cf8', accent2: '#22d3ee', accentRgb: '99, 102, 241', accent2Rgb: '6, 182, 212'
        };

        const posterWidth = captureMode === 'pdf' ? 1358 : 1080;
        return (
          <div key={pageIndex} id={`pdf-poster-${pageIndex}`} style={{ position: 'absolute', left: '-9999px', top: '0px', opacity: 1, pointerEvents: 'none', overflow: 'hidden' }}>
            <div style={{ width: `${posterWidth}px`, height: '1920px', background: c.bg, display: 'flex', flexDirection: 'column', color: c.text, fontFamily: "'Syne', sans-serif" }}>

              {/* Header */}
              <div style={{ padding: '40px 60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: `1px solid ${c.border}` }}>
                <svg width="400" height="70" viewBox="0 0 400 70" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id={`logo-grad-${pageIndex}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={c.accent} />
                      <stop offset="100%" stopColor={c.accent2} />
                    </linearGradient>
                  </defs>
                  <text
                    x="200" y="52"
                    textAnchor="middle"
                    fill={`url(#logo-grad-${pageIndex})`}
                    style={{ fontSize: '48px', fontWeight: 800, fontFamily: "'Syne', sans-serif", letterSpacing: '-1px' }}
                  >
                    DailyTrack
                  </text>
                </svg>
                <div style={{ fontSize: '20px', color: c.text2, marginTop: '4px' }}>Spending Analyser</div>
              </div>

              {/* Filters Info */}
              <div style={{ padding: '24px 60px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '20px', color: c.text, fontWeight: 600, textAlign: 'center' }}>
                  {isShowingDescriptions && filterDesc ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span style={{ color: c.text2, marginRight: '8px' }}>Filtered by:</span>
                      <span style={{ color: c.text2, marginRight: '4px' }}>Breakdown:</span>
                      <span style={{ color: c.accent }}>{filterDesc}</span>
                    </span>
                  ) : (
                    renderActiveFilters(c)
                  )}
                </div>
                <div style={{ fontSize: '18px', color: c.text2, fontWeight: 500 }}>
                  {isShowingDescriptions || chartHeadings.included.size === 1
                    ? `Unique Items: ${pieArr.length} | Transactions: ${analyzerFiltered.length}`
                    : `Categories: ${pieArr.length} | Transactions: ${analyzerFiltered.length}`}
                </div>
              </div>

              {/* Chart Container */}
              <div style={{ padding: '10px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '480px', position: 'relative' }}>
                <PieChart width={460} height={460}>
                  <Pie data={pieArr} dataKey="value" cx="50%" cy="50%" outerRadius={190} innerRadius={145} stroke="none" paddingAngle={3} cornerRadius={6} isAnimationActive={false}>
                    {pieArr.map((_, i) => <Cell key={`b-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                </PieChart>

                {/* Centered Total */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '20px', color: c.text2, textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}>Total</div>
                  {(() => {
                    const sumStr = '₹' + pieArr.reduce((sum, item) => sum + item.value, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                    return (
                      <div style={{ fontSize: sumStr.length > 7 ? '30px' : '38px', fontWeight: 800, color: c.text }}>
                        {sumStr}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Legend */}
              <div style={{ flex: 1, padding: '10px 60px 40px', display: 'grid', gridTemplateColumns: chunk.length > 14 ? '1fr 1fr' : '1fr', gap: '16px', alignContent: 'start' }}>
                {chunk.map((d, i) => {
                  const total = pieArr.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';

                  const TARGET_ROWS = 15;
                  const N = chunk.length;
                  let doubleCols = 0;
                  if (N > TARGET_ROWS) doubleCols = (N - TARGET_ROWS) * 2;
                  const isFullWidth = i >= doubleCols;

                  // Keep color synced with actual item index from pieArr
                  const actualIndex = pageIndex * 30 + i;

                  return (
                    <div key={actualIndex} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: c.card, border: `1px solid ${c.border}`, borderRadius: '16px', gridColumn: isFullWidth ? '1 / -1' : 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', flex: 1, minWidth: 0, marginRight: '16px' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: PIE_COLORS[actualIndex % PIE_COLORS.length], flexShrink: 0 }}></div>
                        <span style={{ fontSize: '20px', fontWeight: 600, color: c.text, wordBreak: 'break-word' }}>{d.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexShrink: 0 }}>
                        <span style={{ fontSize: '22px', fontWeight: 800, color: c.text }}>₹{d.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: PIE_COLORS[actualIndex % PIE_COLORS.length], width: '50px', textAlign: 'right' }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Watermark & Page Indicator */}
              <div style={{ padding: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${c.border}`, marginTop: 'auto' }}>
                <div style={{ width: '120px' }}></div>
                <div style={{ color: c.text3, fontSize: '20px', fontWeight: 600, letterSpacing: '1px' }}>
                  © SB Creations
                </div>
                <div style={{ width: '120px', textAlign: 'right', color: c.text3, fontSize: '18px', fontWeight: 600 }}>
                  Page {pageIndex + 1} of {totalPages}
                </div>
              </div>

            </div>
          </div>
        );
      })}
    </>
  );
}

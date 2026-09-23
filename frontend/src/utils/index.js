import { BANKS } from '../constants';

export const getToken = () => localStorage.getItem('dt_token');

export const getBankEmoji = (accountName) => {
  if (BANKS[accountName]) return BANKS[accountName].emoji;
  // Check if account starts with known prefix
  for (const key in BANKS) {
    if (accountName && accountName.startsWith(key.split('-')[0])) {
      return BANKS[key].emoji;
    }
  }
  return "🏦";
};

export function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  if (isNaN(n)) return "0%";
  return (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
}

export function evaluateMath(expr) {
  if (expr === null || expr === undefined || expr === '') return '';
  const str = String(expr).replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(str)) return null;
  try {
    const result = new Function(`return ${str}`)();
    if (!isFinite(result) || isNaN(result)) return null;
    return Number.isInteger(result) ? result.toString() : result.toFixed(2);
  } catch (e) {
    return null;
  }
}

// Year pickers: every year from the start of tracking up to the current one,
// so they never go stale when a new year starts.
export function yearOptions(firstYear = 2024) {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = Math.min(firstYear, current); y <= current; y++) years.push(y);
  return years;
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

// ---- Description suggestion ----
// Suggests a description once a transaction's category (and ideally amount)
// are known, from how that category has been described before. No network
// call — runs entirely over the transaction history already loaded in the app.

// Entries carry a `count` (the server groups identical heading/description/
// amount rows), so "most common" is weighted by how often each was used.
function mostCommon(entries) {
  const counts = {};
  let best = entries[0]?.description, bestCount = 0;
  for (const e of entries) {
    counts[e.description] = (counts[e.description] || 0) + (e.count || 1);
    if (counts[e.description] > bestCount) { bestCount = counts[e.description]; best = e.description; }
  }
  return best;
}

// Build once (e.g. in a useMemo) from /api/money/meta `descriptions` or raw transactions.
export function buildDescriptionIndex(entries) {
  return (entries || [])
    .filter(t => t.description && t.description.trim() && t.heading)
    .map(t => ({
      heading: t.heading,
      description: t.description.trim(),
      amount: Number(t.amount) || 0,
      count: t.count || 1,
    }));
}

// Returns a description string, or null if this category has no history yet.
export function guessDescription(heading, amount, index) {
  if (!heading || !index || index.length === 0) return null;
  const matches = index.filter(e => e.heading === heading);
  if (matches.length === 0) return null;

  const amt = Number(amount);
  if (amt > 0) {
    // Prefer whichever description was used at a similar amount before
    // (within 15%) — same category often covers several distinct vendors.
    const close = matches.filter(e => {
      const scale = Math.max(e.amount, amt, 1);
      return Math.abs(e.amount - amt) / scale <= 0.15;
    });
    if (close.length > 0) return mostCommon(close);
  }

  // No amount yet, or nothing close in amount — fall back to whatever
  // description is used most often for this category overall.
  return mostCommon(matches);
}
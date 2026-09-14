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

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

// ---- Description suggestion ----
// Suggests a description once a transaction's category (and ideally amount)
// are known, from how that category has been described before. No network
// call — runs entirely over the transaction history already loaded in the app.

function mostCommon(values) {
  const counts = {};
  let best = values[0], bestCount = 0;
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > bestCount) { bestCount = counts[v]; best = v; }
  }
  return best;
}

// Build once per transaction list (e.g. in a useMemo) and reuse across guesses.
export function buildDescriptionIndex(transactions) {
  return (transactions || [])
    .filter(t => t.description && t.description.trim() && t.heading)
    .map(t => ({
      heading: t.heading,
      description: t.description.trim(),
      amount: Number(t.amount) || 0,
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
    if (close.length > 0) return mostCommon(close.map(e => e.description));
  }

  // No amount yet, or nothing close in amount — fall back to whatever
  // description is used most often for this category overall.
  return mostCommon(matches.map(e => e.description));
}
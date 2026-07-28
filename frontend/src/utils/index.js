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
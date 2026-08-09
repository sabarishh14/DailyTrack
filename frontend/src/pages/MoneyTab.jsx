import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from './SabDekho';

import { API } from '../constants';
import { getToken, fmt, formatDate, getBankEmoji } from '../utils';
import CustomSelect from '../components/CustomSelect';
import CustomPieTooltip from '../components/CustomPieTooltip';
import BulkEditTransactionModal from '../components/BulkEditTransactionModal';
import EditTransactionModal from '../components/EditTransactionModal';
import CategoryExclusionModal from '../components/CategoryExclusionModal';

function MoneyTab({ accounts, transactions, categories, onRefresh, globalActionTx, setGlobalActionTx }) {
  const currentMonthLabel = new Date().toLocaleString('default', { month: 'long' });
  const currentYearLabel = new Date().getFullYear().toString();

  const [expanded, setExpanded] = useState(false);
  const [splitsExpanded, setSplitsExpanded] = useState(false);
  const [settlingPerson, setSettlingPerson] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [copyingTx, setCopyingTx] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null); // Tracks last click for Shift-Select
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkCopyOpen, setIsBulkCopyOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const dropdownRef = useRef(null);
  // Analyzer filters - 3-State Multi-select
  const [chartAccounts, setChartAccounts] = useState({ included: new Set(), excluded: new Set() });
  const [chartTypes, setChartTypes] = useState({ included: new Set(['Debit']), excluded: new Set() }); // Defaults to Debit
  const [chartMonths, setChartMonths] = useState({ included: new Set([currentMonthLabel]), excluded: new Set() });
  const [chartYears, setChartYears] = useState({ included: new Set([currentYearLabel]), excluded: new Set() });
  const [chartHeadings, setChartHeadings] = useState({ included: new Set(), excluded: new Set() });
  const [chartDateFrom, setChartDateFrom] = useState("");
  const [chartDateTo, setChartDateTo] = useState("");
  const [chartDateFromDebounced, setChartDateFromDebounced] = useState("");
  const [chartDateToDebounced, setChartDateToDebounced] = useState("");
  const [chartFY, setChartFY] = useState(""); // Financial Year for Analyzer

  // Table filters - 3-State Multi-select
  const [filterYears, setFilterYears] = useState({ included: new Set([currentYearLabel]), excluded: new Set() });
  const [filterAccounts, setFilterAccounts] = useState({ included: new Set(), excluded: new Set() });
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDateFromDebounced, setFilterDateFromDebounced] = useState("");
  const [filterDateToDebounced, setFilterDateToDebounced] = useState("");
  const [filterMonths, setFilterMonths] = useState({ included: new Set([currentMonthLabel]), excluded: new Set() });
  const [filterTypes, setFilterTypes] = useState({ included: new Set(), excluded: new Set() });
  const [filterHeadings, setFilterHeadings] = useState({ included: new Set(), excluded: new Set() });
  const [filterDesc, setFilterDesc] = useState("");
  const [filterDescDebounced, setFilterDescDebounced] = useState("");
  const [filterVisibility, setFilterVisibility] = useState({ included: new Set(), excluded: new Set() }); // NEW STATE
  const [filterFY, setFilterFY] = useState(""); // Financial Year for Table

  // Dropdown visibility
  const [openDropdown, setOpenDropdown] = useState(null);

  // Table sorting
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [actionMenuTx, setActionMenuTx] = useState(null);
  useEffect(() => {
    if (globalActionTx) {
      setActionMenuTx(globalActionTx);
      setGlobalActionTx(null);
    }
  }, [globalActionTx, setGlobalActionTx]);
  // <-- ADD THIS NEW STATE
  const [captureMode, setCaptureMode] = useState(null);
  const [captureColors, setCaptureColors] = useState(null);
  const posterRef = useRef(null);

  /// Change actions: 90 to actions: 130
  const [colWidths, setColWidths] = useState({ checkbox: 50, date: 90, account: 230, type: 110, month: 110, amount: 130, heading: 140, desc: 0, actions: 140 });

  // 🚀 GLOBAL ESCAPE: Closes Money-level Modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setEditingTx(null);
        setCopyingTx(null);
        setIsBulkEditOpen(false);
        setIsBulkCopyOpen(false);
        setIsCategoryModalOpen(false);
        setActionMenuTx(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Reset to page 0 when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterYears, filterTypes, filterHeadings, filterDescDebounced]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isClickOnFilter = e.target.closest('.filter-bar') || e.target.closest('.chip-dropdown');
      if (!isClickOnFilter) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce filter inputs (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => setFilterDateFromDebounced(filterDateFrom), 300);
    return () => clearTimeout(timer);
  }, [filterDateFrom]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterDateToDebounced(filterDateTo), 300);
    return () => clearTimeout(timer);
  }, [filterDateTo]);

  useEffect(() => {
    if (!filterDateFromDebounced) return;
    const from = new Date(filterDateFromDebounced);
    const to = filterDateToDebounced ? new Date(filterDateToDebounced) : from;

    // Collect all months between from and to
    const months = new Set();
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= end) {
      const label = cursor.toLocaleString('default', { month: 'long' });
      months.add(label);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    setFilterMonths(prev => ({ ...prev, included: months }));
  }, [filterDateFromDebounced, filterDateToDebounced]);

  // Debounce analyzer date filters
  useEffect(() => {
    const timer = setTimeout(() => setChartDateFromDebounced(chartDateFrom), 300);
    return () => clearTimeout(timer);
  }, [chartDateFrom]);

  useEffect(() => {
    const timer = setTimeout(() => setChartDateToDebounced(chartDateTo), 300);
    return () => clearTimeout(timer);
  }, [chartDateTo]);

  useEffect(() => {
    const timer = setTimeout(() => setFilterDescDebounced(filterDesc), 300);
    return () => clearTimeout(timer);
  }, [filterDesc]);

  // Memoize expensive computations
  const { allMonths, allYears, allHeadings, allAccountsList, allTypes, allFYs } = useMemo(() => { // <-- Destructure allYears, allFYs
    const years = [...new Set(transactions.map(t => {
      if (!t.date) return null;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return null;
      return d.getFullYear().toString();
    }))]
      .filter(Boolean)
      .sort().reverse();

    // Generate Financial Year options from transactions
    // FY runs April 1 to March 31. A date in Jan-Mar belongs to FY starting previous year.
    const fySet = new Set();
    transactions.forEach(t => {
      if (!t.date) return;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return;
      const month = d.getMonth(); // 0-indexed
      const year = d.getFullYear();
      const fyStart = month >= 3 ? year : year - 1; // Apr(3)-Dec = current year, Jan-Mar = prev year
      fySet.add(`FY ${fyStart}-${fyStart + 1}`);
    });
    const fys = [...fySet].sort().reverse();

    return {
      allMonths: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      allYears: years,
      allFYs: fys,
      allHeadings: [...new Set(transactions.map(t => t.heading))].sort(),
      allAccountsList: [...new Set(transactions.map(t => t.account))].sort(),
      allTypes: [...new Set(transactions.map(t => t.type))].sort().map(t => t.charAt(0).toUpperCase() + t.slice(1))
    };
  }, [transactions]);

  // Optimistic split overrides — local state for instant UI
  const [splitOverrides, setSplitOverrides] = useState({});

  // Split dashboard computed data (merges optimistic overrides)
  const { activeSplits, settledSplits, splitBalances, totalOwed } = useMemo(() => {
    const active = [];
    const settled = [];
    const bals = {};
    let owed = 0;

    transactions.forEach(t => {
      const effectiveSplit = splitOverrides[t.id] || t.split;
      if (!effectiveSplit || !effectiveSplit.members || effectiveSplit.members.length === 0) return;
      const txWithSplit = { ...t, split: effectiveSplit };
      const allPaid = effectiveSplit.members.every(m => m.paid);
      if (allPaid) {
        settled.push(txWithSplit);
      } else {
        active.push(txWithSplit);
        effectiveSplit.members.forEach(m => {
          if (!m.paid && m.name.toLowerCase() !== 'you') {
            const amt = parseFloat(m.amount) || 0;
            if (amt > 0) {
              bals[m.name] = (bals[m.name] || 0) + amt;
              owed += amt;
            }
          }
        });
      }
    });

    active.sort((a, b) => new Date(b.date) - new Date(a.date));
    settled.sort((a, b) => new Date(b.date) - new Date(a.date));

    const balsArr = Object.entries(bals)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    return { activeSplits: active, settledSplits: settled, splitBalances: balsArr, totalOwed: owed };
  }, [transactions, splitOverrides]);

  // Multi-select toggle functions
  // Helper to check match based on 3-State filtering
  const checkMatch = (filterState, value) => {
    const { included, excluded } = filterState;
    if (excluded.has(value)) return false; // Exclusion always wins
    if (included.size > 0 && !included.has(value)) return false; // If there are inclusions, MUST be included
    return true;
  };

  // Memoize analyzer filtered results (with Drill-Down logic)
  const { analyzerFiltered, pieArr, isShowingDescriptions } = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (t.exclude_analytics) return false; // Hides it from charts and stats
      if (!t.date) return false;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      const month = d.toLocaleString('default', { month: 'long' });
      const year = d.getFullYear().toString();
      const capitalizedType = t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : '';
      const accountMatch = checkMatch(chartAccounts, t.account);
      const typeMatch = checkMatch(chartTypes, capitalizedType);
      const monthMatch = checkMatch(chartMonths, month);
      const yearMatch = checkMatch(chartYears, year);
      const headingMatch = checkMatch(chartHeadings, t.heading);
      // Date range filter for analyzer
      const dateMatch = (() => {
        if (!chartDateFromDebounced) return true;
        const txDate = new Date(t.date);
        const from = new Date(chartDateFromDebounced);
        const to = chartDateToDebounced ? new Date(chartDateToDebounced) : from;
        return txDate >= from && txDate <= to;
      })();
      return accountMatch && typeMatch && monthMatch && yearMatch && headingMatch && dateMatch;
    });

    // If exactly one heading is included, drill down into descriptions!
    const isShowingDescriptions = chartHeadings.included.size === 1;
    const pieData = {};

    filtered.forEach(t => {
      let key = t.heading;
      if (isShowingDescriptions) {
        key = (t.description && t.description.trim() !== '') ? t.description.trim() : "No Description";
      }
      pieData[key] = (pieData[key] || 0) + Math.abs(parseFloat(t.amount));
    });

    const pieArray = Object.entries(pieData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    return { analyzerFiltered: filtered, pieArr: pieArray, isShowingDescriptions };
  }, [transactions, chartAccounts, chartTypes, chartMonths, chartYears, chartHeadings, chartDateFromDebounced, chartDateToDebounced]);

  const renderActiveFilters = (c) => {
    const filters = [];
    if (chartFY) filters.push({ label: 'FY', val: chartFY });
    if (chartMonths.included.size > 0) filters.push({ label: 'Month', val: Array.from(chartMonths.included).join(', ') });
    if (chartYears.included.size > 0) filters.push({ label: 'Year', val: Array.from(chartYears.included).join(', ') });
    if (chartAccounts.included.size > 0) filters.push({ label: 'Account', val: Array.from(chartAccounts.included).join(', ') });
    if (chartTypes.included.size > 0) filters.push({ label: 'Type', val: Array.from(chartTypes.included).join(', ') });
    if (chartHeadings.included.size > 0) filters.push({ label: 'Category', val: Array.from(chartHeadings.included).join(', ') });
    if (chartDateFromDebounced) filters.push({ label: 'Date', val: `${chartDateFromDebounced}${chartDateToDebounced ? ' → ' + chartDateToDebounced : ''}` });

    if (filters.length === 0) return 'All Transactions';

    const color2 = c ? c.text2 : 'rgba(255,255,255,0.6)';
    const color3 = c ? c.text3 : 'rgba(255,255,255,0.4)';
    const accent = c ? c.accent : '#818cf8';

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
        <span style={{ color: color3 }}>Filtered by:</span>
        {filters.map((f, i) => (
          <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ color: color2, marginRight: '4px' }}>{f.label}:</span>
            <span style={{ color: accent }}>{f.val}</span>
            {i < filters.length - 1 && <span style={{ color: color3, marginLeft: '8px' }}>|</span>}
          </span>
        ))}
      </span>
    );
  };

  // FY selection handler for Spending Analyser
  const handleChartFYChange = (fy) => {
    if (!fy) {
      setChartFY("");
      setChartDateFrom(""); setChartDateTo("");
      setChartDateFromDebounced(""); setChartDateToDebounced("");
      return;
    }
    setChartFY(fy);
    // Parse "FY 2025-2026" → startYear=2025
    const match = fy.match(/FY (\d{4})-(\d{4})/);
    if (match) {
      const startYear = parseInt(match[1]);
      const endYear = parseInt(match[2]);
      setChartDateFrom(`${startYear}-04-01`);
      setChartDateTo(`${endYear}-03-31`);
      setChartDateFromDebounced(`${startYear}-04-01`);
      setChartDateToDebounced(`${endYear}-03-31`);
      // Clear month and year filters since FY covers the full range
      const empty = { included: new Set(), excluded: new Set() };
      setChartMonths(empty);
      setChartYears(empty);
    }
  };

  // FY selection handler for All Transactions table
  const handleFilterFYChange = (fy) => {
    if (!fy) {
      setFilterFY("");
      setFilterDateFrom(""); setFilterDateTo("");
      setFilterDateFromDebounced(""); setFilterDateToDebounced("");
      return;
    }
    setFilterFY(fy);
    const match = fy.match(/FY (\d{4})-(\d{4})/);
    if (match) {
      const startYear = parseInt(match[1]);
      const endYear = parseInt(match[2]);
      setFilterDateFrom(`${startYear}-04-01`);
      setFilterDateTo(`${endYear}-03-31`);
      setFilterDateFromDebounced(`${startYear}-04-01`);
      setFilterDateToDebounced(`${endYear}-03-31`);
      // Clear month and year filters since FY covers the full range
      const empty = { included: new Set(), excluded: new Set() };
      setFilterMonths(empty);
      setFilterYears(empty);
    }
  };

  const handleExportPDF = async (e) => {
    if (e) e.stopPropagation();

    const rs = getComputedStyle(document.body);
    const tColors = {
      bg: rs.getPropertyValue('--bg').trim() || '#080b12',
      card: rs.getPropertyValue('--bg2').trim() || '#0d1117',
      border: rs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.07)',
      text: rs.getPropertyValue('--text').trim() || '#e2e8f0',
      text2: rs.getPropertyValue('--text2').trim() || '#94a3b8',
      text3: rs.getPropertyValue('--text3').trim() || 'rgba(255,255,255,0.3)',
      accent: rs.getPropertyValue('--accent').trim() || '#6366f1',
      accent2: rs.getPropertyValue('--accent2').trim() || '#06b6d4',
      accentRgb: rs.getPropertyValue('--accent-rgb').trim() || '99, 102, 241',
      accent2Rgb: rs.getPropertyValue('--accent2-rgb').trim() || '6, 182, 212',
    };

    setCaptureColors(tColors);
    setCaptureMode('pdf');
    try {
      await new Promise(r => setTimeout(r, 150)); // wait for DOM resize
      const { toJpeg } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const totalPages = Math.max(1, Math.ceil(pieArr.length / 30));

      for (let i = 0; i < totalPages; i++) {
        const node = document.getElementById(`pdf-poster-${i}`);
        if (!node) continue;

        const dataUrl = await toJpeg(node, {
          quality: 0.95,
          pixelRatio: 1,
          cacheBust: true,
          backgroundColor: tColors.bg,
          canvasWidth: 1358,
          canvasHeight: 1920,
          style: {
            width: '1358px',
            height: '1920px',
            left: '0',
            top: '0',
            position: 'static',
            transform: 'none'
          }
        });

        if (i > 0) pdf.addPage('a4', 'portrait');

        // Draw dark background to fill A4 page
        pdf.setFillColor(tColors.bg);
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

        // Center the 1358x1920 image on A4
        const imgRatio = 1358 / 1920;
        const finalH = pdfHeight;
        const finalW = finalH * imgRatio;
        const xOffset = (pdfWidth - finalW) / 2;
        const yOffset = (pdfHeight - finalH) / 2;

        pdf.addImage(dataUrl, 'JPEG', xOffset, yOffset, finalW, finalH, undefined, 'FAST');
      }

      pdf.save(`DailyTrack-Report-${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to capture PDF.");
    }
    setCaptureMode(null);
  };

  const handleShareSnapshot = async (e) => {
    if (e) e.stopPropagation();

    if (pieArr.length > 30) {
      return handleExportPDF(e);
    }

    const rs = getComputedStyle(document.body);
    const tColors = {
      bg: rs.getPropertyValue('--bg').trim() || '#080b12',
      card: rs.getPropertyValue('--bg2').trim() || '#0d1117',
      border: rs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.07)',
      text: rs.getPropertyValue('--text').trim() || '#e2e8f0',
      text2: rs.getPropertyValue('--text2').trim() || '#94a3b8',
      text3: rs.getPropertyValue('--text3').trim() || 'rgba(255,255,255,0.3)',
      accent: rs.getPropertyValue('--accent').trim() || '#6366f1',
      accent2: rs.getPropertyValue('--accent2').trim() || '#06b6d4',
      accentRgb: rs.getPropertyValue('--accent-rgb').trim() || '99, 102, 241',
      accent2Rgb: rs.getPropertyValue('--accent2-rgb').trim() || '6, 182, 212',
    };
    setCaptureColors(tColors);

    setCaptureMode('snapshot');
    try {
      await new Promise(r => setTimeout(r, 150)); // wait for DOM resize
      const node = document.getElementById('pdf-poster-0');
      if (!node) return;

      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: tColors.bg,
        canvasWidth: 1080,
        canvasHeight: 1920,
        style: {
          width: '1080px',
          height: '1920px',
          left: '0',
          top: '0',
          position: 'static',
          transform: 'none',
          backgroundImage: `radial-gradient(circle at top right, rgba(${tColors.accentRgb}, 0.15), transparent 400px), radial-gradient(circle at bottom left, rgba(${tColors.accent2Rgb}, 0.1), transparent 400px)`
        }
      });

      const filename = `DailyTrack-Snapshot-${new Date().getTime()}.png`;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title: `Spending Snapshot`, files: [file] }) }
        catch (shareErr) { console.log('User canceled share') }
      } else {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Failed to capture snapshot', err);
      alert('Failed to generate snapshot.');
    }
    setCaptureMode(null);
  };

  // Memoize table filtered and sorted results
  const tableFiltered = useMemo(() => {
    return transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      const month = d.toLocaleString('default', { month: 'long' });
      const year = d.getFullYear().toString();
      const dateStr = t.date || '';
      const capitalizedType = t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : '';
      const accountMatch = checkMatch(filterAccounts, t.account);
      const dateMatch = (() => {
        if (!filterDateFromDebounced) return true;
        const txDate = new Date(dateStr);
        const from = new Date(filterDateFromDebounced);
        const to = filterDateToDebounced ? new Date(filterDateToDebounced) : from;
        return txDate >= from && txDate <= to;
      })();
      const monthMatch = checkMatch(filterMonths, month);

      const yearStr = d.getFullYear().toString();
      const yearMatch = checkMatch(filterYears, yearStr);

      const typeMatch = checkMatch(filterTypes, capitalizedType);
      const headingMatch = checkMatch(filterHeadings, t.heading);
      const descMatch = !filterDescDebounced || (t.description || '').toLowerCase().includes(filterDescDebounced.toLowerCase());

      const visibilityMatch = (() => {
        if (filterVisibility.included.size === 0 && filterVisibility.excluded.size === 0) return true;
        const statusLabel = t.exclude_analytics ? "Excluded" : "Active";
        return checkMatch(filterVisibility, statusLabel);
      })();

      return accountMatch && dateMatch && monthMatch && yearMatch && typeMatch && headingMatch && descMatch && visibilityMatch;
    }).sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'date') {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortBy === 'account') {
        aVal = a.account;
        bVal = b.account;
      } else if (sortBy === 'type') {
        aVal = a.type;
        bVal = b.type;
      } else if (sortBy === 'month') {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortBy === 'amount') {
        aVal = parseFloat(a.amount);
        bVal = parseFloat(b.amount);
      } else if (sortBy === 'heading') {
        aVal = a.heading;
        bVal = b.heading;
      } else if (sortBy === 'desc') {
        aVal = a.description || '';
        bVal = b.description || '';
      }

      if (typeof aVal === 'string') {
        const res = sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        // Tie-breaker: If dates/strings are identical, show the most recently added first
        return res !== 0 ? res : b.id - a.id;
      } else {
        const res = sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        // Tie-breaker: If numbers are identical, show the most recently added first
        return res !== 0 ? res : b.id - a.id;
      }
    });
  }, [transactions, filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterYears, filterTypes, filterHeadings, filterDescDebounced, filterVisibility, sortBy, sortDir]); // <-- UPDATE DEPENDENCIES

  // Paginate the filtered results
  const totalPages = Math.ceil(tableFiltered.length / rowsPerPage);
  const paginatedRows = useMemo(() => {
    const start = currentPage * rowsPerPage;
    const end = start + rowsPerPage;
    return tableFiltered.slice(start, end);
  }, [tableFiltered, currentPage, rowsPerPage]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [filterAccounts, filterDateFromDebounced, filterDateToDebounced, filterMonths, filterTypes, filterHeadings, filterDescDebounced]);

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
  const PIE_COLORS = [accentColor, "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4"];

  // Handle column resize
  const handleStartResize = (col, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[col];

    const handleMouseMove = (me) => {
      const diff = me.clientX - startX;
      const minWidths = { date: 80, account: 200, type: 90, month: 100, amount: 120, heading: 100, desc: 100 };
      const newWidth = Math.max(minWidths[col] || 60, startWidth + diff);
      setColWidths(w => ({ ...w, [col]: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSortClick = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // Rows per page dropdown component
  // RowsPerPage dropdown component
  const RowsPerPageDropdown = ({ value, onChange }) => {
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
                className={`chip-dropdown-item ${value === opt ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt);
                  setOpenDropdown(null);
                  setCurrentPage(0);
                }}
              >
                <div className={`chip-checkbox ${value === opt ? 'checked' : ''}`} />
                <span>{opt}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  };

  // Multi-select dropdown component (3-State Logic)
  const MultiSelectDropdown = ({ label, icon, options, filterState, setFilterState, dropdownKey }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const { included, excluded } = filterState;
    const containerRef = useRef(null);
    const [dropdownStyle, setDropdownStyle] = useState({});

    // Clear search and set position when dropdown opens/closes
    useEffect(() => {
      if (openDropdown !== dropdownKey) {
        setSearchTerm("");
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const clientWidth = document.documentElement.clientWidth;
        const isRightSide = rect.left + 300 > clientWidth;
        const isOffBottom = rect.bottom + 300 > window.innerHeight;

        setDropdownStyle({
          position: 'fixed',
          top: isOffBottom ? 'auto' : `${rect.bottom + 4}px`,
          bottom: isOffBottom ? `${window.innerHeight - rect.top + 4}px` : 'auto',
          left: isRightSide ? 'auto' : `${rect.left}px`,
          right: isRightSide ? `${window.innerWidth - rect.right}px` : 'auto',
          minWidth: `${rect.width}px`,
          maxWidth: isRightSide ? `calc(100vw - ${window.innerWidth - rect.right + 16}px)` : `calc(100vw - ${rect.left + 16}px)`,
          zIndex: 999999
        });
      }
    }, [openDropdown, dropdownKey]);

    const filteredOptions = options
      .filter(opt => String(opt).toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        const aSelected = included.has(a) || excluded.has(a);
        const bSelected = included.has(b) || excluded.has(b);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return 0;
      });
    const allSelected = included.size === options.length && options.length > 0;

    // 3-State Toggle: Neutral -> Included -> Excluded -> Neutral
    const handleItemClick = (opt) => {
      const newInc = new Set(included);
      const newExc = new Set(excluded);

      if (newInc.has(opt)) {
        newInc.delete(opt);
        newExc.add(opt);
      } else if (newExc.has(opt)) {
        newExc.delete(opt);
      } else {
        newInc.add(opt);
      }
      setFilterState({ included: newInc, excluded: newExc });
    };

    const toggleSelectAll = () => {
      if (allSelected) {
        setFilterState({ included: new Set(), excluded: new Set() });
      } else {
        setFilterState({ included: new Set(options), excluded: new Set() });
      }
    };

    const hasSelection = included.size > 0 || excluded.size > 0;
    const isExcludeOnly = included.size === 0 && excluded.size > 0;

    return (
      <div style={{ position: 'relative' }} ref={containerRef}>
        <button
          className={`filter-chip ${hasSelection ? (isExcludeOnly ? 'exclude-active' : 'active') : ''} ${openDropdown === dropdownKey ? 'open' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
        >
          <span>{icon}</span>
          <span style={{ textDecoration: isExcludeOnly ? 'line-through' : 'none', opacity: isExcludeOnly ? 0.8 : 1 }}>{label}</span>

          {/* Dual Status Counters */}
          {included.size > 0 && <span className="chip-count inc">{included.size}</span>}
          {excluded.size > 0 && <span className="chip-count exc">{excluded.size}</span>}

          {hasSelection && (
            <span
              className="chip-clear"
              onClick={(e) => { e.stopPropagation(); setFilterState({ included: new Set(), excluded: new Set() }); }}
              title="Clear filter"
            >
              ×
            </span>
          )}
          <span className="chip-arrow">▼</span>
        </button>

        {openDropdown === dropdownKey && createPortal(
          <div className="chip-dropdown portaled" style={{ ...dropdownStyle, maxHeight: '350px' }}>

            {/* 🚀 STICKY HEADER GROUP */}
            <div style={{ position: 'sticky', top: '-0.375rem', zIndex: 10, background: 'var(--card)', margin: '-0.375rem -0.375rem 0.2rem -0.375rem', borderRadius: '12px 12px 0 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <div className="chip-helper-text" style={{ margin: '0.4rem 0.5rem 0' }}>
                Tap once to include • Tap again to exclude
              </div>

              {options.length > 5 && (
                <div style={{ padding: '0.4rem 0.5rem' }}>
                  <input
                    type="text"
                    placeholder={`Search ${label}...`}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="chip-search-input"
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}
              {options.length > 0 && (
                <div
                  className="chip-dropdown-item chip-select-all"
                  onClick={toggleSelectAll}
                  style={{ fontWeight: 600, borderRadius: 0, padding: '0.6rem 0.65rem', borderTop: options.length > 5 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                >
                  <div className={`chip-checkbox ${allSelected ? 'included' : ''}`} />
                  <span>{allSelected ? 'Clear All' : 'Select All'}</span>
                </div>
              )}
            </div>

            {filteredOptions.map(opt => (
              <div
                key={opt}
                className={`chip-dropdown-item ${included.has(opt) ? 'included' : ''} ${excluded.has(opt) ? 'excluded' : ''}`}
                onClick={() => handleItemClick(opt)}
              >
                <div className={`chip-checkbox ${included.has(opt) ? 'included' : ''} ${excluded.has(opt) ? 'excluded' : ''}`} />
                <span>{opt}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedRows.map(t => t.id)));
    }
  };

  const handleRowSelect = (e, id, index) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);

    if (e.shiftKey && lastSelectedIdx !== null) {
      // Shift-Click Bulk Select
      const start = Math.min(lastSelectedIdx, index);
      const end = Math.max(lastSelectedIdx, index);
      for (let j = start; j <= end; j++) {
        newSet.add(paginatedRows[j].id);
      }
    } else {
      // Normal Click Toggle
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
    }

    setSelectedIds(newSet);
    setLastSelectedIdx(index); // Remember this click
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transactions?`)) return;
    try {
      // Send ONE single array of IDs to the backend
      const res = await fetch(`${API}/transactions/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(Array.from(selectedIds))
      });

      if (res.ok) {
        setSelectedIds(new Set());
        onRefresh(); // Refresh balances and list
      } else {
        alert("Failed to delete transactions.");
      }
    } catch (e) {
      alert("Error deleting some transactions: " + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this transaction? This will also update your account balance.")) return;
    try {
      const res = await fetch(`${API}/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        onRefresh(); // Refresh balances and transactions!
      } else {
        alert("Failed to delete transaction.");
      }
    } catch (e) {
      alert("Error deleting: " + e.message);
    }
  };

  // Splits: Settle all for a person (optimistic)
  const handleSettlePerson = (personName) => {
    if (!window.confirm(`Settle all splits for ${personName}?`)) return;
    setSettlingPerson(personName);

    // Build all overrides + API calls at once
    const overrides = {};
    const apiCalls = [];
    for (const t of activeSplits) {
      let changed = false;
      const newMembers = t.split.members.map(m => {
        if (m.name === personName && !m.paid) { changed = true; return { ...m, paid: true }; }
        return m;
      });
      if (changed) {
        overrides[t.id] = { ...t.split, members: newMembers };
        let myAmount = 0;
        const youMember = newMembers.find(m => m.name.toLowerCase() === 'you');
        if (youMember) myAmount += parseFloat(youMember.amount) || 0;
        myAmount += newMembers.filter(m => m.name.toLowerCase() !== 'you' && !m.paid).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
        const finalAmount = myAmount > 0 ? Math.round(myAmount) : t.amount;
        apiCalls.push(
          fetch(`${API}/splits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ transaction_id: t.id, total_amount: t.split.total_amount, members: newMembers, transaction_amount: finalAmount })
          })
        );
      }
    }

    // Instant UI update
    setSplitOverrides(prev => ({ ...prev, ...overrides }));
    setSettlingPerson(null);

    // Fire all APIs in parallel in background
    Promise.all(apiCalls).catch(err => alert('Error settling: ' + err.message));
  };

  // Splits: Toggle individual member paid status (optimistic)
  const handleToggleSplitPaid = (t, memberIdx) => {
    const newMembers = [...t.split.members];
    newMembers[memberIdx] = { ...newMembers[memberIdx], paid: !newMembers[memberIdx].paid };

    // Instant UI update
    setSplitOverrides(prev => ({ ...prev, [t.id]: { ...t.split, members: newMembers } }));

    // Fire API in background
    let myAmount = 0;
    const youMember = newMembers.find(m => m.name.toLowerCase() === 'you');
    if (youMember) myAmount += parseFloat(youMember.amount) || 0;
    myAmount += newMembers.filter(m => m.name.toLowerCase() !== 'you' && !m.paid).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
    const finalAmount = myAmount > 0 ? Math.round(myAmount) : t.amount;
    fetch(`${API}/splits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ transaction_id: t.id, total_amount: t.split.total_amount, members: newMembers, transaction_amount: finalAmount })
    }).catch(err => {
      // Revert on error
      setSplitOverrides(prev => { const n = { ...prev }; delete n[t.id]; return n; });
      alert('Error updating split: ' + err.message);
    });
  };

  return (
    <div>
      {/* Spending Analyzer Section - Collapsible */}
      <div className="analyser-card">
        <div
          className={`analyser-header ${expanded ? 'open' : ''}`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="analyser-header-left">
            <div className="analyser-header-icon">📊</div>
            <div>
              <div className="analyser-header-title">Spending Analyser</div>
              <div className="analyser-header-sub" style={{ display: 'none' }}></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handleShareSnapshot}
              className="action-btn secondary"
              disabled={!!captureMode}
              style={{ padding: '0', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', color: 'var(--text2)' }}
              title="Share Snapshot"
            >
              {captureMode ? (
                <span style={{ fontSize: '12px' }}>⏳</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              )}
            </button>
            <button
              onClick={handleExportPDF}
              className="action-btn secondary"
              disabled={!!captureMode}
              style={{ padding: '0', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', color: 'var(--text2)' }}
              title="Save PDF"
            >
              {captureMode ? (
                <span style={{ fontSize: '12px' }}>⏳</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsCategoryModalOpen(true); }}
              className="action-btn secondary"
              style={{ padding: '0', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px' }}
              title="Manage Categories"
            >
              <span style={{ fontSize: '14px' }}>⚙️</span>
            </button>
            <span className={`analyser-chevron ${expanded ? 'open' : ''}`} style={{ marginLeft: '4px' }}>▼</span>
          </div>
        </div>

        {expanded && (
          <div style={{ animation: 'fadeIn 0.3s ease', padding: '1.5rem' }}>

            {/* Analyzer Filters */}
            <div className="filter-bar" style={{ marginBottom: '1.5rem' }} ref={dropdownRef}>
              <MultiSelectDropdown
                label="Visibility"
                icon="👁️"
                options={["Active", "Excluded"]}
                filterState={filterVisibility}
                setFilterState={setFilterVisibility}
                dropdownKey="analyzerVisibility"
              />
              <MultiSelectDropdown
                label="Account"
                icon="🏦"
                options={allAccountsList}
                filterState={chartAccounts}
                setFilterState={setChartAccounts}
                dropdownKey="analyzerAccount"
              />
              <MultiSelectDropdown
                label="Type"
                icon="💳"
                options={allTypes}
                filterState={chartTypes}
                setFilterState={setChartTypes}
                dropdownKey="analyzerType"
              />
              <MultiSelectDropdown
                label="Month"
                icon="📅"
                options={allMonths}
                filterState={chartMonths}
                setFilterState={setChartMonths}
                dropdownKey="analyzerMonth"
                maxWidth="160px"
              />
              <MultiSelectDropdown
                label="Year"
                icon="📆"
                options={allYears}
                filterState={chartYears}
                setFilterState={setChartYears}
                dropdownKey="analyzerYear"
                maxWidth="160px"
              />
              <MultiSelectDropdown
                label="Heading"
                icon="🏷️"
                options={allHeadings}
                filterState={chartHeadings}
                setFilterState={setChartHeadings}
                dropdownKey="analyzerHeading"
              />
              {/* FY Filter upgraded to CustomSelect for portal support */}
              <CustomSelect
                value={chartFY}
                onChange={(fy) => handleChartFYChange(fy === chartFY ? '' : fy)}
                options={allFYs.map(fy => ({ label: `FY ${fy}`, value: fy }))}
                placeholder="All FYs"
                minWidth="110px"
                icon={<span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>📅</span>}
              />
              {/* Date Range Filter */}
              <div className="date-filter-chip">
                <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>📅</span>
                <input
                  type="date"
                  value={chartDateFrom}
                  onChange={e => { setChartDateFrom(e.target.value); setChartFY(""); }}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: chartDateFrom ? 'var(--text)' : 'var(--text2)', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", width: chartDateFrom ? '100px' : '90px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>→</span>
                <input
                  type="date"
                  value={chartDateTo}
                  onChange={e => { setChartDateTo(e.target.value); setChartFY(""); }}
                  min={chartDateFrom}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: chartDateTo ? 'var(--text)' : 'var(--text2)', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", width: chartDateTo ? '100px' : '90px', cursor: 'pointer' }}
                />
                {(chartDateFrom || chartDateTo) && (
                  <button onClick={() => { setChartDateFrom(''); setChartDateTo(''); setChartFY(''); }} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
                )}
              </div>
              {(chartAccounts.included.size > 0 || chartAccounts.excluded.size > 0 ||
                chartTypes.included.size > 0 || chartTypes.excluded.size > 0 ||
                chartMonths.included.size > 0 || chartMonths.excluded.size > 0 ||
                chartYears.included.size > 0 || chartYears.excluded.size > 0 ||
                chartHeadings.included.size > 0 || chartHeadings.excluded.size > 0 ||
                chartDateFrom || chartDateTo || chartFY) && (
                  <button
                    className="filter-chip"
                    onClick={() => {
                      const empty = { included: new Set(), excluded: new Set() };
                      setChartAccounts(empty); setChartTypes(empty); setChartMonths(empty);
                      setChartYears(empty); setChartHeadings(empty);
                      setChartDateFrom(""); setChartDateTo(""); setChartFY("");
                    }}
                    style={{ border: '1px dashed var(--neg)', color: 'var(--neg)', background: 'transparent' }}
                  >
                    <span>❌</span><span>Clear</span>
                  </button>
                )}
            </div>

            {/* Pie Chart + Legend Grid */}
            {pieArr.length > 0 ? (
              <div className="pie-grid">
                {/* Pie Chart */}
                {/* 3D Modern Donut Chart */}
                <div style={{ position: 'relative', background: 'rgba(var(--accent-rgb), 0.04)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(var(--accent-rgb), 0.1)', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      {/* 1. The 3D "Depth" Base Layer (Shifted down and darkened) */}
                      <Pie
                        data={pieArr.slice(0, 10)}
                        dataKey="value"
                        cx="50%"
                        cy="54%" /* Shifted down to create thickness */
                        outerRadius={125}
                        innerRadius={80}
                        paddingAngle={5}
                        cornerRadius={8}
                        stroke="none"
                        isAnimationActive={false} /* Base stays static while top animates */
                      >
                        {pieArr.slice(0, 10).map((_, i) => (
                          <Cell
                            key={`depth-${i}`}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            style={{ filter: 'brightness(0.45)' }} /* Darkens the sides for realistic shadow */
                          />
                        ))}
                      </Pie>

                      {/* 2. The Main "Top" Glassy Layer */}
                      <Pie
                        data={pieArr.slice(0, 10)}
                        dataKey="value"
                        cx="50%"
                        cy="54%" /* Shifted down to create thickness */
                        outerRadius={125}
                        innerRadius={80}
                        paddingAngle={5}
                        cornerRadius={8}
                        stroke="none"
                        animationDuration={1200} /* Match the top layer's animation */
                        animationEasing="ease-out"
                      >
                        {pieArr.slice(0, 10).map((_, i) => (
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            style={{
                              filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.5))', /* Floats the top layer */
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              cursor: 'pointer'
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={<CustomPieTooltip pieData={pieArr} />}
                        wrapperStyle={{ zIndex: 100 }} /* Forces tooltip above the center text */
                        cursor={{ fill: 'transparent' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Floating Total Label perfectly centered in the Donut hole */}
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Total</div>
                    {(() => {
                      const sumStr = '₹' + pieArr.reduce((sum, item) => sum + item.value, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                      return (
                        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: sumStr.length > 7 ? '1rem' : '1.3rem', fontWeight: 800, color: 'var(--text)' }}>
                          {sumStr}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Legend - Scrollable Container */}
                <div
                  className="pie-legend-container"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '380px',
                    background: 'rgba(var(--accent-rgb), 0.04)',
                    border: '1px solid rgba(var(--accent-rgb), 0.1)',
                    borderRadius: '16px',
                    padding: '1.5rem 1rem',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Scroll Indicator Top */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '20px',
                    background: 'linear-gradient(to bottom, rgba(var(--accent-rgb), 0.1), rgba(var(--accent-rgb), 0))',
                    borderRadius: '16px 16px 0 0',
                    pointerEvents: 'none',
                    zIndex: 5
                  }} />

                  {/* Legend Items */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                      overflowY: 'auto',
                      paddingRight: '0.5rem',
                      flex: 1,
                      paddingTop: '0.5rem'
                    }}
                    className="pie-legend-scroll"
                  >
                    {pieArr.map((d, i) => {
                      const total = pieArr.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';

                      // Highlight based on whether we are looking at Headings or Descriptions
                      const isSelected = isShowingDescriptions
                        ? filterDesc === d.name
                        : filterHeadings.included.has(d.name);

                      return (
                        <div
                          key={d.name}
                          className={`pie-legend-item ${isSelected ? 'selected' : ''}`}
                          style={{ flexShrink: 0 }}
                          onClick={() => {
                            if (isShowingDescriptions) {
                              // Toggles the description filter for the table below
                              if (filterDesc === d.name) {
                                setFilterDesc("");
                              } else {
                                setFilterDesc(d.name === "No Description" ? "" : d.name);
                                setFilterHeadings({ ...chartHeadings });
                              }
                            } else {
                              // Drills down the chart AND filters the table below!
                              setChartHeadings({ included: new Set([d.name]), excluded: new Set() });
                              setFilterHeadings({ included: new Set([d.name]), excluded: new Set() });
                              setFilterDesc("");
                            }

                            // Sync base table filters with the chart
                            setFilterAccounts({ ...chartAccounts });
                            setFilterTypes({ ...chartTypes });
                            setFilterMonths({ ...chartMonths });
                            setFilterYears({ ...chartYears });
                            document.querySelector('.tx-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                background: PIE_COLORS[i % PIE_COLORS.length],
                                width: '12px',
                                height: '12px',
                                borderRadius: '4px',
                                flexShrink: 0,
                                boxShadow: `0 2px 8px ${PIE_COLORS[i % PIE_COLORS.length]}40`
                              }}
                            />
                            <span style={{ color: 'var(--text3)', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginLeft: '0.75rem', flexShrink: 0 }}>
                            <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem', minWidth: '75px', textAlign: 'right', fontFamily: 'Syne, sans-serif' }}>₹{Number(d.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            <span style={{ color: 'var(--text2)', fontSize: '0.7rem', minWidth: '38px', textAlign: 'right', fontWeight: 600 }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Scroll Indicator Bottom - shows scrollable state */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '30px',
                    background: 'linear-gradient(to top, rgba(var(--accent-rgb), 0.1), rgba(var(--accent-rgb), 0))',
                    borderRadius: '0 0 16px 16px',
                    pointerEvents: 'none',
                    zIndex: 5
                  }} />
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', gridColumn: '1 / -1' }}>
                📭 No transactions match your filters
              </div>
            )}

            {/* Transaction Count Stats */}
            {analyzerFiltered.length > 0 && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(99,102,241,0.08)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.5rem' }}>Income Txns</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--pos)' }}>
                      {analyzerFiltered.filter(t => t.type === 'Credit').length}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                      {fmt(analyzerFiltered.filter(t => t.type === 'Credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}
                    </div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.5rem' }}>Expense Txns</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--neg)' }}>
                      {analyzerFiltered.filter(t => t.type === 'Debit').length}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                      {fmt(analyzerFiltered.filter(t => t.type === 'Debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Splits Section - Collapsible, same style as Spending Analyser */}
      {(activeSplits.length > 0 || settledSplits.length > 0) && (
        <div className="analyser-card">
          <div
            className={`analyser-header ${splitsExpanded ? 'open' : ''}`}
            onClick={() => setSplitsExpanded(!splitsExpanded)}
          >
            <div className="analyser-header-left">
              <div className="analyser-header-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>🤝</div>
              <div>
                <div className="analyser-header-title">Splits</div>
                <div className="analyser-header-sub" style={{ display: splitsExpanded ? 'none' : 'block' }}>
                  {totalOwed > 0
                    ? <span>{splitBalances.length} {splitBalances.length === 1 ? 'person owes' : 'people owe'} you <span style={{ color: 'var(--pos)', fontWeight: 700 }}>{fmt(totalOwed)}</span></span>
                    : <span style={{ color: 'var(--pos)' }}>All settled up ✓</span>
                  }
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Quick counters */}
              {!splitsExpanded && activeSplits.length > 0 && (
                <span className="splits-badge splits-badge-active">{activeSplits.length} active</span>
              )}
              {!splitsExpanded && settledSplits.length > 0 && (
                <span className="splits-badge splits-badge-settled">{settledSplits.length} settled</span>
              )}
              <span className={`analyser-chevron ${splitsExpanded ? 'open' : ''}`} style={{ marginLeft: '4px' }}>▼</span>
            </div>
          </div>

          {splitsExpanded && (
            <div style={{ animation: 'fadeIn 0.3s ease', padding: '1.5rem' }}>

              {/* Person Balance Cards */}
              {splitBalances.length > 0 && (
                <div className="splits-people-grid">
                  {splitBalances.map(b => (
                    <div key={b.name} className="splits-person-card">
                      <div className="splits-person-avatar">{b.name.charAt(0).toUpperCase()}</div>
                      <div className="splits-person-info">
                        <div className="splits-person-name">{b.name}</div>
                        <div className="splits-person-amount">{fmt(b.amount)}</div>
                      </div>
                      <button
                        className="splits-settle-btn"
                        onClick={() => handleSettlePerson(b.name)}
                        disabled={settlingPerson === b.name}
                      >
                        {settlingPerson === b.name ? (
                          <span className="splits-settle-spinner">⏳</span>
                        ) : (
                          <>✓ Settle</>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Total owed summary */}
              {totalOwed > 0 && (
                <div className="splits-total-bar">
                  <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Total owed to you</span>
                  <span style={{ color: 'var(--pos)', fontWeight: 700, fontSize: '1.1rem' }}>{fmt(totalOwed)}</span>
                </div>
              )}

              {/* Active / Settled tabs */}
              <div className="splits-tab-bar">
                <button
                  className={`splits-tab-btn ${!settledSplits.length || activeSplits.length > 0 ? 'active' : ''}`}
                  onClick={() => {
                    document.getElementById('splits-active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  style={{ cursor: 'default' }}
                >
                  Active ({activeSplits.length})
                </button>
                {settledSplits.length > 0 && (
                  <button
                    className="splits-tab-btn"
                    onClick={() => {
                      document.getElementById('splits-settled')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                    style={{ cursor: 'default' }}
                  >
                    Settled ({settledSplits.length})
                  </button>
                )}
              </div>

              {/* Active Splits */}
              {activeSplits.length > 0 && (
                <div id="splits-active" style={{ marginBottom: '1.5rem' }}>
                  <div className="splits-list">
                    {activeSplits.map(t => {
                      const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
                      return (
                        <div key={t.id} className="splits-tx-card">
                          <div className="splits-tx-top">
                            <div className="splits-tx-left">
                              <div className="splits-tx-desc">{t.description || t.heading || '—'}</div>
                              <div className="splits-tx-meta">{dateStr} &middot; {t.account} &middot; {t.heading}</div>
                            </div>
                            <div className="splits-tx-amount">
                              <span style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill</span>
                              <span>{fmt(t.split.total_amount)}</span>
                            </div>
                          </div>
                          <div className="splits-members">
                            {t.split.members.map((m, idx) => (
                              <div key={idx} className={`splits-member ${m.paid ? 'paid' : ''}`}>
                                <div className="splits-member-left">
                                  <div className={`splits-member-dot ${m.paid ? 'paid' : 'unpaid'}`} />
                                  <span className="splits-member-name">{m.name}</span>
                                </div>
                                <div className="splits-member-right">
                                  <span className="splits-member-amt">{fmt(m.amount)}</span>
                                  {m.name.toLowerCase() !== 'you' && (
                                    <button
                                      className={`splits-toggle-btn ${m.paid ? 'is-paid' : 'is-unpaid'}`}
                                      onClick={() => handleToggleSplitPaid(t, idx)}
                                    >
                                      {m.paid ? 'Paid' : 'Owes'}
                                    </button>
                                  )}
                                  {m.name.toLowerCase() === 'you' && (
                                    <span className="splits-you-badge">You</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeSplits.length === 0 && (
                <div className="splits-empty">
                  <span style={{ fontSize: '2rem' }}>🎉</span>
                  <div>All settled up! No pending splits.</div>
                </div>
              )}

              {/* Settled Splits */}
              {settledSplits.length > 0 && (
                <div id="splits-settled">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', paddingLeft: '2px' }}>
                    Settled &middot; {settledSplits.length}
                  </div>
                  <div className="splits-list">
                    {settledSplits.map(t => {
                      const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
                      return (
                        <div key={t.id} className="splits-tx-card settled">
                          <div className="splits-tx-top">
                            <div className="splits-tx-left">
                              <div className="splits-tx-desc">{t.description || t.heading || '—'}</div>
                              <div className="splits-tx-meta">{dateStr} &middot; {t.account}</div>
                            </div>
                            <div className="splits-tx-amount" style={{ color: 'var(--text3)' }}>
                              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill</span>
                              <span>{fmt(t.split.total_amount)}</span>
                            </div>
                          </div>
                          <div className="splits-members">
                            {t.split.members.map((m, idx) => (
                              <div key={idx} className="splits-member paid">
                                <div className="splits-member-left">
                                  <div className="splits-member-dot paid" />
                                  <span className="splits-member-name">{m.name}</span>
                                </div>
                                <div className="splits-member-right">
                                  <span className="splits-member-amt">{fmt(m.amount)}</span>
                                  <span className="splits-settled-check">✓</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Transactions Table */}
      <section className="section">
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
          />
          <MultiSelectDropdown
            label="Account"
            icon="🏦"
            options={allAccountsList}
            filterState={filterAccounts}
            setFilterState={setFilterAccounts}
            dropdownKey="tableAccount"
          />
          <MultiSelectDropdown
            label="Type"
            icon="💳"
            options={allTypes}
            filterState={filterTypes}
            setFilterState={setFilterTypes}
            dropdownKey="tableType"
          />
          <MultiSelectDropdown
            label="Month"
            icon="📅"
            options={allMonths}
            filterState={filterMonths}
            setFilterState={setFilterMonths}
            dropdownKey="tableMonth"
          />
          <MultiSelectDropdown
            label="Year"
            icon="📆"
            options={allYears}
            filterState={filterYears}
            setFilterState={setFilterYears}
            dropdownKey="tableYear"
          />
          <MultiSelectDropdown
            label="Heading"
            icon="🏷️"
            options={allHeadings}
            filterState={filterHeadings}
            setFilterState={setFilterHeadings}
            dropdownKey="tableHeading"
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
        {tableFiltered.length > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="tx-stats-bar" style={{ marginBottom: '1.5rem' }}>
              <span>
                Page <strong style={{ color: 'var(--text)' }}>{currentPage + 1} of {totalPages}</strong> · Showing <strong style={{ color: 'var(--text)' }}>{paginatedRows.length}</strong> of {tableFiltered.length} transactions
              </span>
              <span>
                <span className="pos" style={{ fontWeight: 600 }}>{fmt(tableFiltered.filter(t => t.type === 'Credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}</span>
                {' '}in &nbsp;·&nbsp;
                <span className="neg" style={{ fontWeight: 600 }}>{fmt(tableFiltered.filter(t => t.type === 'Debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0))}</span>
                {' '}out
              </span>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <RowsPerPageDropdown value={rowsPerPage} onChange={setRowsPerPage} />

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
            <div className="tx-col-header" style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0 }} onClick={handleSelectAll}>
              <div className={`chip-checkbox ${selectedIds.size > 0 && selectedIds.size === paginatedRows.length ? 'included' : ''}`} />
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
          {tableFiltered.length > 0 ? (
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
                  <span style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }} onClick={(e) => handleRowSelect(e, t.id, i)}>
                    <div className={`chip-checkbox ${selectedIds.has(t.id) ? 'included' : ''}`} />
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
                    <button className="action-icon-btn edit" onClick={(e) => { e.stopPropagation(); setEditingTx(t); }} title="Edit">✏️</button>
                    <button className="action-icon-btn copy" onClick={(e) => { e.stopPropagation(); setCopyingTx(t); }} title="Duplicate">📋</button>
                    <button className="action-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} title="Delete">🗑️</button>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="empty-state">📭 No transactions match your filters</div>
          )}
          {/* Floating Action Bar */}
          {selectedIds.size > 0 && (
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
            <BulkEditTransactionModal transactions={transactions.filter(t => selectedIds.has(t.id))} categories={categories} onClose={() => { setIsBulkEditOpen(false); setSelectedIds(new Set()); }} onRefresh={onRefresh} />
          )}

          {/* Bulk Copy Modal */}
          {isBulkCopyOpen && (
            <BulkEditTransactionModal transactions={transactions.filter(t => selectedIds.has(t.id))} categories={categories} isCopy={true} onClose={() => { setIsBulkCopyOpen(false); setSelectedIds(new Set()); }} onRefresh={onRefresh} />
          )}
        </div>
      </section>

      {editingTx && (
        <EditTransactionModal
          tx={editingTx}
          categories={categories}
          recentDescriptions={[...new Set((transactions || []).map(t => t.description).filter(d => d && d.trim() !== ''))]}
          onClose={() => setEditingTx(null)}
          onRefresh={onRefresh}
        />
      )}

      {copyingTx && (
        <EditTransactionModal
          tx={copyingTx}
          categories={categories}
          recentDescriptions={[...new Set((transactions || []).map(t => t.description).filter(d => d && d.trim() !== ''))]}
          onClose={() => setCopyingTx(null)}
          onRefresh={onRefresh}
          isCopy={true}
        />
      )}

      {/* CATEGORY MANAGER MODAL */}
      {isCategoryModalOpen && (
        <CategoryExclusionModal
          transactions={transactions}
          allHeadings={allHeadings}
          onClose={() => setIsCategoryModalOpen(false)}
          onRefresh={onRefresh}
        />
      )}

      {/* TRANSACTION DETAILS / ACTION MENU MODAL */}
      {actionMenuTx && (
        <div className="modal-backdrop" onClick={() => setActionMenuTx(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: 0, maxWidth: '400px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header / Info Row */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text)' }}>{actionMenuTx.heading}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text3)' }}>{formatDate(actionMenuTx.date)} • {actionMenuTx.account}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={actionMenuTx.type === 'Debit' ? 'neg' : actionMenuTx.type === 'Credit' ? 'pos' : 'accent'} style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                    {actionMenuTx.type === 'Debit' ? '-' : '+'}{fmt(actionMenuTx.amount)}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text2)', marginTop: '2px' }}>{actionMenuTx.type}</span>
                </div>
              </div>
            </div>

            {/* Full Note / Description Box */}
            {actionMenuTx.description && (
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  📝 {actionMenuTx.description}
                </p>
              </div>
            )}

            {/* Split Details UI */}
            {actionMenuTx.split && (
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', maxHeight: '200px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 600 }}>👥 Split Details</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}>Total: ₹{actionMenuTx.split.total_amount}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {actionMenuTx.split.members.map((m, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg3)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={m.paid}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newMembers = [...actionMenuTx.split.members];
                            newMembers[idx] = { ...newMembers[idx], paid: !newMembers[idx].paid };

                            let myAmount = 0;
                            const youMember = newMembers.find(m => m.name.toLowerCase() === 'you');
                            if (youMember) myAmount += parseFloat(youMember.amount) || 0;
                            myAmount += newMembers.filter(m => m.name.toLowerCase() !== 'you' && !m.paid).reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
                            const finalAmount = myAmount > 0 ? Math.round(myAmount) : actionMenuTx.amount;

                            const updatedTx = { ...actionMenuTx, amount: finalAmount, split: { ...actionMenuTx.split, members: newMembers } };
                            setActionMenuTx(updatedTx);
                            // Also update optimistic overrides for the splits section
                            setSplitOverrides(prev => ({ ...prev, [actionMenuTx.id]: { ...actionMenuTx.split, members: newMembers } }));

                            // Fire API in background
                            fetch(`${API}/splits`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                              body: JSON.stringify({ transaction_id: updatedTx.id, total_amount: updatedTx.split.total_amount, members: newMembers, transaction_amount: finalAmount })
                            }).catch(err => {
                              alert("Error updating split: " + err.message);
                              setActionMenuTx(actionMenuTx);
                            });
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', color: m.paid ? 'var(--text3)' : 'var(--text)', textDecoration: m.paid ? 'line-through' : 'none' }}>{m.name}</span>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: m.paid ? 'var(--text3)' : 'var(--text)', textDecoration: m.paid ? 'line-through' : 'none' }}>₹{m.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Exclude Toggle */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 600 }}>Spending Analyser</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '2px' }}>Include this transaction in pie chart & stats</div>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const updatedTx = { ...actionMenuTx, exclude_analytics: !actionMenuTx.exclude_analytics };
                  setActionMenuTx(updatedTx); // Optimistic UI update for instant feedback
                  try {
                    const res = await fetch(`${API}/transactions/${actionMenuTx.id}`, {
                      method: "PUT",
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                      body: JSON.stringify({ ...updatedTx, amount: parseFloat(updatedTx.amount) }),
                    });
                    if (res.ok) onRefresh();
                  } catch (err) {
                    alert("Error updating transaction: " + err.message);
                    setActionMenuTx(actionMenuTx); // Revert on network failure
                  }
                }}
                style={{
                  width: '46px', height: '26px', borderRadius: '13px',
                  background: actionMenuTx.exclude_analytics ? 'var(--border2)' : 'var(--pos)',
                  position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '3px',
                  left: actionMenuTx.exclude_analytics ? '3px' : '23px',
                  transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                }} />
              </button>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem' }}>
              <button
                onClick={() => { setEditingTx(actionMenuTx); setActionMenuTx(null); }}
                style={{ background: 'transparent', border: 'none', padding: '1rem', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                ✏️ Edit Transaction
              </button>
              <button
                onClick={() => { setCopyingTx(actionMenuTx); setActionMenuTx(null); }}
                style={{ background: 'transparent', border: 'none', padding: '1rem', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                📋 Duplicate Transaction
              </button>
              <button
                onClick={() => { handleDelete(actionMenuTx.id); setActionMenuTx(null); }}
                style={{ background: 'transparent', border: 'none', padding: '1rem', color: 'var(--neg)', fontSize: '0.95rem', fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                🗑️ Delete Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📸 HIDDEN SNAPSHOT POSTER CHUNKS 📸 */}
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

    </div>
  );
}

export default memo(MoneyTab);

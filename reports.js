// ═══════════════════════════════════════════════════════════
//  Sales Reports — reports.js
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'grocery_inventory_v1';
const HISTORY_KEY = 'grocery_sales_history';
const SETTINGS_KEY = 'grocery_pos_settings';

let period    = 'month';
let sortCol   = 'revenue';
let sortAsc   = false;
let allSales  = [];
let inventory = [];

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  allSales  = JSON.parse(localStorage.getItem(HISTORY_KEY)  || '[]');
  inventory = JSON.parse(localStorage.getItem(STORAGE_KEY)  || '[]');
  const opts = { weekday:'short', year:'numeric', month:'short', day:'numeric' };
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', opts);
  setPeriod('month');
});

// ── Period ────────────────────────────────────────────────
function setPeriod(p) {
  period = p;
  document.querySelectorAll('.period-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.period === p)
  );
  render();
}

function getPeriodRange() {
  const now = new Date();
  let start, end;

  if (period === 'week') {
    const day  = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;  // back to Monday
    start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0,0,0,0);
    end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else {
    start = new Date(0);
    end   = new Date(8640000000000000);
  }
  return { start, end };
}

function getPeriodLabel() {
  const { start, end } = getPeriodRange();
  const fmt = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  if (period === 'all') return 'All time';
  if (period === 'year') return String(new Date().getFullYear());
  return fmt(start) + ' – ' + fmt(end);
}

function getFilteredSales() {
  const { start, end } = getPeriodRange();
  return allSales.filter(s => s.timestamp >= start.getTime() && s.timestamp <= end.getTime());
}

// ── Compute ───────────────────────────────────────────────
function computeStats(sales) {
  const productMap  = new Map();
  const categoryMap = new Map();
  const dailyMap    = new Map();

  let totalRevenue = 0, totalCost = 0;

  sales.forEach(sale => {
    // daily bucket (YYYY-MM-DD)
    const dayKey = new Date(sale.timestamp).toISOString().slice(0, 10);
    if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { revenue: 0, cost: 0, txns: 0 });
    const day = dailyMap.get(dayKey);
    day.txns++;

    sale.items.forEach(item => {
      const revenue = Number(item.retailPrice) * Number(item.qty);
      const cost    = Number(item.costPrice  || 0) * Number(item.qty);
      totalRevenue += revenue;
      totalCost    += cost;
      day.revenue  += revenue;
      day.cost     += cost;

      // product map
      const key = item.itemId || item.name;
      if (!productMap.has(key)) {
        const inv = inventory.find(i => i.id === item.itemId);
        productMap.set(key, {
          name:      item.name,
          category:  inv ? inv.category : '—',
          unitsSold: 0,
          revenue:   0,
          cost:      0,
        });
      }
      const p = productMap.get(key);
      p.unitsSold += Number(item.qty);
      p.revenue   += revenue;
      p.cost      += cost;

      // category map
      const inv = inventory.find(i => i.id === item.itemId);
      const cat = inv ? inv.category : '—';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { revenue: 0, cost: 0 });
      const c = categoryMap.get(cat);
      c.revenue += revenue;
      c.cost    += cost;
    });
  });

  const products = Array.from(productMap.values()).map(p => ({
    ...p,
    profit: p.revenue - p.cost,
    margin: p.revenue > 0 ? (p.revenue - p.cost) / p.revenue * 100 : 0,
  }));

  const categories = Array.from(categoryMap.entries()).map(([name, c]) => ({
    name, revenue: c.revenue, cost: c.cost, profit: c.revenue - c.cost,
  })).sort((a, b) => b.revenue - a.revenue);

  const daily = Array.from(dailyMap.entries())
    .map(([date, d]) => ({ date, ...d, profit: d.revenue - d.cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalTxns: sales.length,
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    margin: totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue * 100 : 0,
    products,
    categories,
    daily,
  };
}

// ── Sort helper ───────────────────────────────────────────
function sortProducts(products) {
  return [...products].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (typeof av === 'string') av = av.toLowerCase(), bv = bv.toLowerCase();
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
}

function setSort(col) {
  if (sortCol === col) sortAsc = !sortAsc;
  else { sortCol = col; sortAsc = false; }
  render();
}

// ── Render ────────────────────────────────────────────────
function render() {
  const sales = getFilteredSales();
  const stats = computeStats(sales);

  document.getElementById('periodLabel').textContent = getPeriodLabel();

  // Summary cards
  const fmt = n => '₱' + n.toFixed(2);
  document.getElementById('statTxns').textContent    = stats.totalTxns;
  document.getElementById('statRevenue').textContent = fmt(stats.totalRevenue);
  document.getElementById('statCost').textContent    = fmt(stats.totalCost);
  document.getElementById('statProfit').textContent  = fmt(stats.totalProfit);
  document.getElementById('statMargin').textContent  = stats.margin.toFixed(1) + '%';

  renderProductTable(stats.products);
  renderCategories(stats.categories, stats.totalRevenue);
  renderDaily(stats.daily);
}

function renderProductTable(products) {
  const wrap = document.getElementById('productTableWrap');
  document.getElementById('productCount').textContent = products.length + ' product' + (products.length !== 1 ? 's' : '');

  if (!products.length) {
    wrap.innerHTML = `<div class="empty-report"><div class="empty-icon">🛒</div><p>No sales data for this period.</p></div>`;
    return;
  }

  const sorted = sortProducts(products);
  const arrow  = col => sortCol === col ? `<span class="sort-arrow">${sortAsc ? '▲' : '▼'}</span>` : '<span class="sort-arrow" style="opacity:0.3">▼</span>';

  const rows = sorted.map((p, i) => {
    const profitCls = p.profit >= 0 ? 'profit-pos' : 'profit-neg';
    const barW      = Math.max(0, Math.min(100, p.margin)).toFixed(1);
    return `<tr>
      <td style="color:var(--text-muted);font-size:0.75rem;width:32px">${i + 1}</td>
      <td style="font-weight:600">${escHtml(p.name)}</td>
      <td><span class="badge-cat">${escHtml(p.category)}</span></td>
      <td class="td-num">${p.unitsSold}</td>
      <td class="td-num">₱${p.revenue.toFixed(2)}</td>
      <td class="td-num">₱${p.cost.toFixed(2)}</td>
      <td class="td-num ${profitCls}">₱${p.profit.toFixed(2)}</td>
      <td>
        <div class="margin-bar-wrap">
          <div class="margin-bar" style="width:${barW}px;max-width:60px"></div>
          <span class="margin-val">${p.margin.toFixed(1)}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="report-table">
      <thead>
        <tr>
          <th>#</th>
          <th onclick="setSort('name')"      class="${sortCol==='name'?'sorted':''}">Product ${arrow('name')}</th>
          <th onclick="setSort('category')"  class="${sortCol==='category'?'sorted':''}">Category ${arrow('category')}</th>
          <th onclick="setSort('unitsSold')" class="${sortCol==='unitsSold'?'sorted':''}">Units ${arrow('unitsSold')}</th>
          <th onclick="setSort('revenue')"   class="${sortCol==='revenue'?'sorted':''}">Revenue ${arrow('revenue')}</th>
          <th onclick="setSort('cost')"      class="${sortCol==='cost'?'sorted':''}">Cost ${arrow('cost')}</th>
          <th onclick="setSort('profit')"    class="${sortCol==='profit'?'sorted':''}">Profit ${arrow('profit')}</th>
          <th onclick="setSort('margin')"    class="${sortCol==='margin'?'sorted':''}">Margin ${arrow('margin')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderCategories(categories, totalRevenue) {
  const list = document.getElementById('catList');
  if (!categories.length) {
    list.innerHTML = `<div class="empty-report" style="padding:28px 20px"><div class="empty-icon" style="font-size:2rem">📂</div><p>No data</p></div>`;
    return;
  }
  const maxRev = Math.max(...categories.map(c => c.revenue), 1);
  list.innerHTML = categories.map(c => {
    const share  = totalRevenue > 0 ? (c.revenue / totalRevenue * 100).toFixed(1) : '0.0';
    const barPct = (c.revenue / maxRev * 100).toFixed(1);
    const profCls = c.profit >= 0 ? 'profit-pos' : 'profit-neg';
    return `<div class="cat-row">
      <div class="cat-row-top">
        <span class="cat-name">${escHtml(c.name)}</span>
        <span class="cat-profit ${profCls}">₱${c.profit.toFixed(2)}</span>
      </div>
      <div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${barPct}%"></div></div>
      <div class="cat-meta">Revenue ₱${c.revenue.toFixed(2)} · ${share}% of total</div>
    </div>`;
  }).join('');
}

function renderDaily(daily) {
  const wrap = document.getElementById('dailyTableWrap');
  if (!daily.length) {
    wrap.innerHTML = `<div class="empty-report"><div class="empty-icon">📅</div><p>No sales data.</p></div>`;
    return;
  }
  const rows = daily.map(d => {
    const profCls = d.profit >= 0 ? 'profit-pos' : 'profit-neg';
    const dateStr = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    return `<tr>
      <td style="font-weight:600">${dateStr}</td>
      <td class="td-num">${d.txns}</td>
      <td class="td-num">₱${d.revenue.toFixed(2)}</td>
      <td class="td-num">₱${d.cost.toFixed(2)}</td>
      <td class="td-num ${profCls}">₱${d.profit.toFixed(2)}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `
    <table class="report-table">
      <thead>
        <tr>
          <th>Date</th>
          <th class="td-num">Transactions</th>
          <th class="td-num">Revenue</th>
          <th class="td-num">Cost</th>
          <th class="td-num">Profit</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Excel Export ──────────────────────────────────────────
function exportExcel() {
  const sales = getFilteredSales();
  const stats = computeStats(sales);
  const label = getPeriodLabel();
  const wb    = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Sales Report', label],
    [],
    ['Metric', 'Value'],
    ['Transactions',   stats.totalTxns],
    ['Total Revenue',  '₱' + stats.totalRevenue.toFixed(2)],
    ['Total Cost',     '₱' + stats.totalCost.toFixed(2)],
    ['Gross Profit',   '₱' + stats.totalProfit.toFixed(2)],
    ['Profit Margin',  stats.margin.toFixed(2) + '%'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

  // Products sheet
  const productHead = [['Product', 'Category', 'Units Sold', 'Revenue (₱)', 'Cost (₱)', 'Profit (₱)', 'Margin (%)']];
  const productRows = sortProducts(stats.products).map(p => [
    p.name, p.category, p.unitsSold,
    p.revenue.toFixed(2), p.cost.toFixed(2), p.profit.toFixed(2), p.margin.toFixed(2),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...productHead, ...productRows]), 'Products');

  // Category sheet
  const catHead = [['Category', 'Revenue (₱)', 'Cost (₱)', 'Profit (₱)']];
  const catRows  = stats.categories.map(c => [
    c.name, c.revenue.toFixed(2), c.cost.toFixed(2), c.profit.toFixed(2),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...catHead, ...catRows]), 'By Category');

  // Daily sheet
  const dailyHead = [['Date', 'Transactions', 'Revenue (₱)', 'Cost (₱)', 'Profit (₱)']];
  const dailyRows  = stats.daily.map(d => [d.date, d.txns, d.revenue.toFixed(2), d.cost.toFixed(2), d.profit.toFixed(2)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...dailyHead, ...dailyRows]), 'Daily');

  // Transactions detail sheet
  const txnHead = [['Txn ID', 'Date', 'Time', 'Product', 'Qty', 'Retail Price', 'Cost Price', 'Line Revenue', 'Line Cost', 'Line Profit', 'Payment']];
  const txnRows = [];
  sales.forEach(s => {
    s.items.forEach(item => {
      const rev  = Number(item.retailPrice) * Number(item.qty);
      const cost = Number(item.costPrice || 0) * Number(item.qty);
      txnRows.push([
        s.txnId, s.date, s.time,
        item.name, item.qty,
        Number(item.retailPrice).toFixed(2), Number(item.costPrice || 0).toFixed(2),
        rev.toFixed(2), cost.toFixed(2), (rev - cost).toFixed(2),
        s.payMethod,
      ]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...txnHead, ...txnRows]), 'Transactions');

  const filename = `sales_report_${period}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ── PDF Export ────────────────────────────────────────────
function exportPDF() {
  const { jsPDF } = window.jspdf;
  const sales  = getFilteredSales();
  const stats  = computeStats(sales);
  const label  = getPeriodLabel();
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const storeName = settings.storeName || 'GROCERY STORE';
  const genDate = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName, 14, 16);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Sales Report — ' + label, 14, 23);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Generated: ' + genDate, 14, 29);
  doc.setTextColor(0);

  // Summary box
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SUMMARY', 14, 37);
  doc.setFont('helvetica', 'normal');
  const summaryItems = [
    ['Transactions', String(stats.totalTxns)],
    ['Total Revenue', '₱' + stats.totalRevenue.toFixed(2)],
    ['Total Cost',    '₱' + stats.totalCost.toFixed(2)],
    ['Gross Profit',  '₱' + stats.totalProfit.toFixed(2)],
    ['Profit Margin', stats.margin.toFixed(2) + '%'],
  ];
  doc.autoTable({
    startY: 40,
    head: [],
    body: summaryItems,
    theme: 'plain',
    columnStyles: { 0: { fontStyle:'bold', cellWidth: 45 }, 1: { halign:'right' } },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
    tableWidth: 90,
  });

  // Products table
  doc.setFont('helvetica', 'bold');
  doc.text('PRODUCT BREAKDOWN', 14, doc.lastAutoTable.finalY + 10);
  doc.setFont('helvetica', 'normal');
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 13,
    head: [['Product', 'Category', 'Units', 'Revenue (₱)', 'Cost (₱)', 'Profit (₱)', 'Margin']],
    body: sortProducts(stats.products).map(p => [
      p.name, p.category, p.unitsSold,
      p.revenue.toFixed(2), p.cost.toFixed(2), p.profit.toFixed(2), p.margin.toFixed(1) + '%',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle:'bold' },
    alternateRowStyles: { fillColor: [245, 250, 247] },
    columnStyles: { 2: { halign:'right' }, 3: { halign:'right' }, 4: { halign:'right' }, 5: { halign:'right' }, 6: { halign:'right' } },
    margin: { left: 14, right: 14 },
  });

  // Category table
  if (doc.lastAutoTable.finalY + 30 < 270) {
    doc.setFont('helvetica', 'bold');
    doc.text('BY CATEGORY', 14, doc.lastAutoTable.finalY + 10);
    doc.setFont('helvetica', 'normal');
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Category', 'Revenue (₱)', 'Cost (₱)', 'Profit (₱)']],
      body: stats.categories.map(c => [c.name, c.revenue.toFixed(2), c.cost.toFixed(2), c.profit.toFixed(2)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle:'bold' },
      alternateRowStyles: { fillColor: [245, 250, 247] },
      columnStyles: { 1: { halign:'right' }, 2: { halign:'right' }, 3: { halign:'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  // Daily table (new page)
  if (stats.daily.length) {
    doc.addPage();
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DAILY SALES SUMMARY', 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.autoTable({
      startY: 20,
      head: [['Date', 'Transactions', 'Revenue (₱)', 'Cost (₱)', 'Profit (₱)']],
      body: stats.daily.map(d => [d.date, d.txns, d.revenue.toFixed(2), d.cost.toFixed(2), d.profit.toFixed(2)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle:'bold' },
      alternateRowStyles: { fillColor: [245, 250, 247] },
      columnStyles: { 1: { halign:'right' }, 2: { halign:'right' }, 3: { halign:'right' }, 4: { halign:'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  // Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align:'right' });
  }

  doc.save(`sales_report_${period}_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ── Helpers ───────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

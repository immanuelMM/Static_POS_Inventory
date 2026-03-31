// ── Constants ──────────────────────────────────────────────
const STORAGE_KEY = 'grocery_inventory_v1';
const WARN_DAYS   = 7;

const CATEGORY_EMOJI = {
  'Fruits & Vegetables': '🥦',
  'Dairy & Eggs':        '🥛',
  'Meat & Seafood':      '🥩',
  'Bakery & Bread':      '🍞',
  'Frozen Foods':        '🧊',
  'Canned & Dry Goods':  '🥫',
  'Beverages':           '🧃',
  'Snacks & Sweets':     '🍪',
  'Condiments & Spices': '🧂',
  'Cleaning Supplies':   '🧹',
  'Personal Care':       '🧼',
  'Other':               '📦',
};

// ── State ──────────────────────────────────────────────────
let items        = [];
let editingId    = null;
let deletingId   = null;
let currentImage = null; // base64 data URL

// ── LocalStorage ───────────────────────────────────────────
function loadItems()  { items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveItems()  { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

// ── Expiry helpers ─────────────────────────────────────────
function today() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function parseDate(str) {
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysUntilExpiry(expiryStr) {
  const diff = parseDate(expiryStr) - today();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getStatus(expiryStr) {
  const d = daysUntilExpiry(expiryStr);
  if (d < 0)          return 'expired';
  if (d <= WARN_DAYS) return 'warning';
  return 'fresh';
}

function expiryLabel(expiryStr) {
  const d = daysUntilExpiry(expiryStr);
  if (d < 0)   return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return 'Expires today!';
  if (d === 1) return 'Expires tomorrow!';
  if (d <= WARN_DAYS) return `Expires in ${d} days`;
  return `${d} days left`;
}

function formatDate(str) {
  return parseDate(str).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Stats ──────────────────────────────────────────────────
function updateStats() {
  const total   = items.length;
  const expired = items.filter(i => getStatus(i.expiry) === 'expired').length;
  const warn    = items.filter(i => getStatus(i.expiry) === 'warning').length;
  const fresh   = total - expired - warn;

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statFresh').textContent   = fresh;
  document.getElementById('statWarn').textContent    = warn;
  document.getElementById('statExpired').textContent = expired;

  const banner = document.getElementById('alertBanner');
  const msgs = [];
  if (expired > 0) msgs.push(`${expired} item${expired>1?'s are':' is'} expired`);
  if (warn    > 0) msgs.push(`${warn} item${warn>1?'s are':' is'} expiring within ${WARN_DAYS} days`);

  if (msgs.length) {
    document.getElementById('alertText').textContent = msgs.join(' and ') + '.';
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}

// ── Render ─────────────────────────────────────────────────
function renderItems() {
  const search  = document.getElementById('searchInput').value.toLowerCase();
  const catF    = document.getElementById('filterCategory').value;
  const statusF = document.getElementById('filterStatus').value;
  const sortKey = document.getElementById('sortBy').value;

  let list = [...items];

  if (search)  list = list.filter(i => i.name.toLowerCase().includes(search) || i.category.toLowerCase().includes(search));
  if (catF)    list = list.filter(i => i.category === catF);
  if (statusF) list = list.filter(i => getStatus(i.expiry) === statusF);

  list.sort((a, b) => {
    if (sortKey === 'name')   return a.name.localeCompare(b.name);
    if (sortKey === 'expiry') return parseDate(a.expiry) - parseDate(b.expiry);
    if (sortKey === 'added')  return b.addedAt - a.addedAt;
    if (sortKey === 'qty')    return b.qty - a.qty;
    return 0;
  });

  const grid  = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyState');

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    updateStats();
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = list.map(item => {
    const status      = getStatus(item.expiry);
    const emoji       = CATEGORY_EMOJI[item.category] || '📦';
    const label       = expiryLabel(item.expiry);
    const fmtDate     = formatDate(item.expiry);
    const retail      = Number(item.retailPrice) || 0;
    const cost        = Number(item.costPrice)   || 0;
    const margin      = retail > 0 ? (retail - cost) / retail * 100 : null;
    const profitBadge = margin === null ? '' :
      margin >= 30  ? '<span class="profit-badge high-profit">🔥 High Profit</span>' :
      margin <= 0   ? '<span class="profit-badge no-profit">📉 No Profit</span>'    : '';

    return `
      <div class="item-card status-${status}" id="card-${item.id}">
        ${item.image ? `<div class="card-img"><img src="${item.image}" alt="${escHtml(item.name)}" loading="lazy"></div>` : ''}
        <div class="card-header">
          <div class="card-emoji">${emoji}</div>
          <div class="card-title">
            <h3>${escHtml(item.name)}</h3>
            <p>${escHtml(item.category)} · ${escHtml(item.location)}</p>
          </div>
          <div class="card-actions">
            <button class="icon-btn edit"   onclick="openEditModal('${item.id}')" title="Edit">✏️</button>
            <button class="icon-btn delete" onclick="askDelete('${item.id}', '${escHtml(item.name)}')" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="card-body">
          <div class="card-row">
            <span class="label">Quantity</span>
            <span class="value">${item.qty} ${escHtml(item.unit)}</span>
          </div>
          <div class="card-row">
            <span class="label">Expiry Date</span>
            <span class="value">${fmtDate}</span>
          </div>
          <div class="card-row">
            <span class="label">Status</span>
            <span class="exp-badge ${status}">
              ${ status === 'fresh'   ? '✅' :
                 status === 'warning' ? '⚠️' : '❌'} ${label}
            </span>
          </div>
          ${retail > 0 ? `<div class="card-row"><span class="label">Cost</span><span class="value">₱${cost.toFixed(2)} / ${escHtml(item.unit)}</span></div>` : ''}
          ${retail > 0 ? `<div class="card-row"><span class="label">Retail Price</span><span class="value" style="color:var(--primary-dark);font-weight:700">₱${retail.toFixed(2)} / ${escHtml(item.unit)}</span></div>` : ''}
          ${profitBadge ? `<div class="card-row"><span class="label">Profit</span><span class="value">${profitBadge}${margin !== null ? ` <span style="font-size:0.78rem;color:#666">${margin.toFixed(0)}% margin</span>` : ''}</span></div>` : ''}
          ${item.notes ? `<div class="card-row"><span class="label">Notes</span><span class="value" style="font-size:0.8rem;font-weight:400">${escHtml(item.notes)}</span></div>` : ''}
        </div>
        <div class="card-qr-section">
          <img id="qri-${item.id}" src="${item.qrDataUrl || ''}" class="card-qr-canvas" alt="QR" />
          <div class="card-qr-info">
            <div class="card-qr-name">${escHtml(item.name)}</div>
            <div class="card-qr-id">#${item.id.slice(-8).toUpperCase()}</div>
            <div class="card-qr-hint">Scan in POS to sell</div>
            <button class="card-qr-print-btn" onclick="showQR('${item.id}')">🖨️ Print Label</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Generate + persist QR for any items that don't have one stored yet
  list.filter(i => !i.qrDataUrl).forEach(i => generateAndStoreQR(i.id));

  updateStats();
}

// ── Image handling ─────────────────────────────────────────
function handleImageFile(input) {
  const file = input.files[0];
  if (!file) return;
  compressImage(file, (dataUrl) => {
    currentImage = dataUrl;
    showImagePreview(dataUrl);
  });
  input.value = ''; // reset so same file can be re-selected
}

function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      else if (h > MAX)     { w = Math.round(w * MAX / h); h = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function showImagePreview(dataUrl) {
  const preview = document.getElementById('imgPreview');
  preview.innerHTML = `<img src="${dataUrl}" alt="Item photo">`;
  document.getElementById('imgClearBtn').style.display = 'inline';
}

function clearImage() {
  currentImage = null;
  document.getElementById('imgPreview').innerHTML = '<div class="img-preview-placeholder">📷</div>';
  document.getElementById('imgClearBtn').style.display = 'none';
}

function resetImageUI() {
  currentImage = null;
  clearImage();
}

// ── Modal ──────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Item';
  clearForm();
  const def = new Date(); def.setDate(def.getDate() + 7);
  document.getElementById('fExpiry').value = def.toISOString().slice(0,10);
  resetImageUI();
  document.getElementById('itemModal').classList.add('open');
}

function openEditModal(id) {
  editingId = id;
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('modalTitle').textContent = 'Edit Item';
  document.getElementById('fName').value     = item.name;
  document.getElementById('fCategory').value = item.category;
  document.getElementById('fQty').value      = item.qty;
  document.getElementById('fUnit').value     = item.unit;
  document.getElementById('fExpiry').value   = item.expiry;
  document.getElementById('fLocation').value = item.location;
  document.getElementById('fNotes').value    = item.notes || '';
  document.getElementById('fCostPrice').value   = item.costPrice || '';
  document.getElementById('fRetailPrice').value = item.retailPrice || '';
  if (item.image) {
    currentImage = item.image;
    showImagePreview(item.image);
  } else {
    resetImageUI();
  }
  document.getElementById('itemModal').classList.add('open');
}

function closeModal() {
  document.getElementById('itemModal').classList.remove('open');
  editingId = null;
  resetImageUI();
}

function clearForm() {
  ['fName','fQty','fNotes','fCostPrice','fRetailPrice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fCategory').value = '';
  document.getElementById('fQty').value      = '';
  document.getElementById('fUnit').value     = 'pcs';
  document.getElementById('fLocation').value = 'Pantry';
}

function saveItem() {
  const name     = document.getElementById('fName').value.trim();
  const category = document.getElementById('fCategory').value;
  const qty      = parseFloat(document.getElementById('fQty').value);
  const unit     = document.getElementById('fUnit').value;
  const expiry   = document.getElementById('fExpiry').value;
  const location = document.getElementById('fLocation').value;
  const notes    = document.getElementById('fNotes').value.trim();
  const costPrice   = parseFloat(document.getElementById('fCostPrice').value)   || 0;
  const retailPrice = parseFloat(document.getElementById('fRetailPrice').value) || 0;

  if (!name)            return alert('Please enter an item name.');
  if (!category)        return alert('Please select a category.');
  if (!qty || qty <= 0) return alert('Please enter a valid quantity.');
  if (!expiry)          return alert('Please select an expiration date.');

  let savedId;
  if (editingId) {
    const idx = items.findIndex(i => i.id === editingId);
    if (idx !== -1) {
      items[idx] = { ...items[idx], name, category, qty, unit, expiry, location, notes, costPrice, retailPrice, image: currentImage || items[idx].image || null };
      savedId = items[idx].id;
    }
  } else {
    const newItem = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      name, category, qty, unit, expiry, location, notes, costPrice, retailPrice,
      image: currentImage || null,
      addedAt: Date.now()
    };
    items.push(newItem);
    savedId = newItem.id;
  }

  saveItems();
  closeModal();
  renderItems();

  // Auto-generate and persist QR code for this item
  if (savedId) generateAndStoreQR(savedId);
}

// ── Barcode generation (JsBarcode — no conflict with html5-qrcode) ──
function makeBarcodeDataUrl(value) {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format:       'CODE128',
      width:        2,
      height:       70,
      displayValue: false,
      margin:       8,
      background:   '#ffffff',
      lineColor:    '#0F4C35',
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('Barcode generation error:', e);
    return '';
  }
}

function generateAndStoreQR(itemId) {
  const dataUrl = makeBarcodeDataUrl(itemId);
  if (!dataUrl) return;
  const idx = items.findIndex(i => i.id === itemId);
  if (idx !== -1) {
    items[idx].qrDataUrl = dataUrl;
    saveItems();
    const imgEl = document.getElementById('qri-' + itemId);
    if (imgEl) imgEl.src = dataUrl;
  }
}

// Regenerate barcodes for all items (replaces any old QR data URLs too)
function generateMissingQRCodes() {
  items.forEach(i => {
    if (!i.qrDataUrl) generateAndStoreQR(i.id);
  });
}

// ── Delete ─────────────────────────────────────────────────
function askDelete(id, name) {
  deletingId = id;
  document.getElementById('confirmText').textContent = `Delete "${name}"? This cannot be undone.`;
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirm() {
  deletingId = null;
  document.getElementById('confirmModal').classList.remove('open');
}

function confirmDelete() {
  if (!deletingId) return;
  items = items.filter(i => i.id !== deletingId);
  saveItems();
  closeConfirm();
  renderItems();
}

// ── Export to Excel ────────────────────────────────────────
function exportExcel() {
  if (!items.length) return alert('No items to export.');

  const wb = XLSX.utils.book_new();
  const rows = [
    ['Name', 'Category', 'Quantity', 'Unit', 'Cost Price (₱)', 'Retail Price (₱)', 'Margin (%)', 'Expiry Date', 'Status', 'Location', 'Notes']
  ];

  items.forEach(item => {
    const status  = getStatus(item.expiry);
    const retail  = Number(item.retailPrice) || 0;
    const cost    = Number(item.costPrice)   || 0;
    const margin  = retail > 0 ? ((retail - cost) / retail * 100).toFixed(1) : '';
    rows.push([
      item.name,
      item.category,
      item.qty,
      item.unit,
      cost   || '',
      retail || '',
      margin,
      formatDate(item.expiry),
      status.charAt(0).toUpperCase() + status.slice(1),
      item.location,
      item.notes || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 8 },
    { wch: 14 }, { wch: 16 }, { wch: 10 },
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 28 }
  ];

  const headerRange = XLSX.utils.decode_range(ws['!ref']);
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cellAddr]) ws[cellAddr].s = { font: { bold: true } };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.writeFile(wb, `grocery_inventory_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── Export to PDF ──────────────────────────────────────────
function exportPDF() {
  if (!items.length) return alert('No items to export.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const genDate = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const total   = items.length;
  const expired = items.filter(i => getStatus(i.expiry) === 'expired').length;
  const warn    = items.filter(i => getStatus(i.expiry) === 'warning').length;
  const fresh   = total - expired - warn;

  doc.setFontSize(20);
  doc.setTextColor(27, 67, 50);
  doc.setFont(undefined, 'bold');
  doc.text('Grocery Inventory Report', 14, 18);

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(108, 117, 125);
  doc.text(`Generated: ${genDate}   ·   Total: ${total}   Fresh: ${fresh}   Expiring Soon: ${warn}   Expired: ${expired}`, 14, 26);

  doc.autoTable({
    startY: 32,
    head: [['Name', 'Category', 'Qty', 'Unit', 'Cost (₱)', 'Retail (₱)', 'Margin', 'Expiry Date', 'Status', 'Location', 'Notes']],
    body: items.map(item => {
      const s      = getStatus(item.expiry);
      const retail = Number(item.retailPrice) || 0;
      const cost   = Number(item.costPrice)   || 0;
      const margin = retail > 0 ? ((retail - cost) / retail * 100).toFixed(1) + '%' : '-';
      return [
        item.name,
        item.category,
        item.qty,
        item.unit,
        cost   > 0 ? '₱' + cost.toFixed(2)   : '-',
        retail > 0 ? '₱' + retail.toFixed(2) : '-',
        margin,
        formatDate(item.expiry),
        s.charAt(0).toUpperCase() + s.slice(1),
        item.location,
        item.notes || ''
      ];
    }),
    headStyles: {
      fillColor: [27, 67, 50],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [27, 38, 49]
    },
    alternateRowStyles: {
      fillColor: [240, 244, 248]
    },
    didParseCell: (data) => {
      if (data.column.index === 8 && data.section === 'body') {
        const val = (data.cell.text[0] || '').toLowerCase();
        if (val === 'expired')       data.cell.styles.textColor = [230, 57, 70];
        else if (val === 'warning')  data.cell.styles.textColor = [180, 90, 0];
        else                         data.cell.styles.textColor = [27, 110, 60];
      }
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 30 },
      2: { cellWidth: 10 },
      3: { cellWidth: 10 },
      4: { cellWidth: 16 },
      5: { cellWidth: 16 },
      6: { cellWidth: 14 },
      7: { cellWidth: 22 },
      8: { cellWidth: 18 },
      9: { cellWidth: 18 },
      10: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 }
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  doc.save(`grocery_inventory_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ── QR Code ────────────────────────────────────────────────
function showQR(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('qrItemName').textContent = item.name;
  document.getElementById('qrItemSub').textContent  = item.category + ' · ' + item.location + (item.retailPrice > 0 ? ' · ₱' + Number(item.retailPrice).toFixed(2) : '');
  document.getElementById('qrModal').classList.add('open');

  const imgEl = document.getElementById('qrCanvas');
  if (item.qrDataUrl) {
    imgEl.src = item.qrDataUrl;
  } else {
    const dataUrl = makeBarcodeDataUrl(item.id);
    imgEl.src = dataUrl;
    if (dataUrl) {
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) { items[idx].qrDataUrl = dataUrl; saveItems(); }
    }
  }
}

function closeQRModal() {
  document.getElementById('qrModal').classList.remove('open');
}

function printQRLabel() {
  const name    = document.getElementById('qrItemName').textContent;
  const sub     = document.getElementById('qrItemSub').textContent;
  const dataUrl = document.getElementById('qrCanvas').src;
  if (!dataUrl) return;
  const win = window.open('', '_blank', 'width=380,height=320');
  win.document.write(`<!DOCTYPE html><html><head><title>Barcode Label</title>
    <style>
      body { margin:0; display:flex; flex-direction:column; align-items:center;
             justify-content:center; min-height:100vh; font-family:'Segoe UI',sans-serif; background:#fff; }
      img  { width:260px; height:100px; object-fit:contain; }
      .name{ font-weight:800; font-size:1rem; margin:8px 0 2px; text-align:center; }
      .sub { font-size:0.75rem; color:#666; text-align:center; }
    </style></head>
    <body onload="window.print();window.close()">
      <img src="${dataUrl}" alt="Barcode"/>
      <div class="name">${name.replace(/</g,'&lt;')}</div>
      <div class="sub">${sub.replace(/</g,'&lt;')}</div>
    </body></html>`);
  win.document.close();
}

function printAllQRStickers() {
  if (!items.length) { alert('No items to print.'); return; }

  const stickers = items.map(item => ({
    item,
    url: item.qrDataUrl || makeBarcodeDataUrl(item.id),
  }));

  const rows = stickers.map(({ item, url }) => {
    const price = Number(item.retailPrice) > 0 ? '₱' + Number(item.retailPrice).toFixed(2) : '';
    const name  = item.name.replace(/</g, '&lt;');
    const cat   = item.category.replace(/</g, '&lt;');
    return `
      <div class="sticker">
        <img class="qr" src="${url}" alt="Barcode"/>
        <div class="sname">${name}</div>
        <div class="scat">${cat}</div>
        ${price ? `<div class="sprice">${price}</div>` : ''}
        <div class="sid">#${item.id.slice(-6).toUpperCase()}</div>
      </div>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>QR Stickers</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 10mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6mm;
      width: 100%;
    }
    .sticker {
      border: 1px dashed #aaa;
      border-radius: 6px;
      padding: 4mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2mm;
      page-break-inside: avoid;
      background: #fff;
    }
    .qr { width: 100%; height: 18mm; object-fit: contain; display: block; }
    .sname { font-weight: 800; font-size: 7.5pt; line-height: 1.2; text-align:center; word-break: break-word; }
    .scat  { font-size: 6pt; color: #666; text-align:center; }
    .sprice{ font-size: 9.5pt; font-weight: 900; color: #1b4332; text-align:center; }
    .sid   { font-size: 5pt; color: #999; letter-spacing: 0.5px; font-family: monospace; text-align:center; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style></head>
  <body onload="window.print();window.close()">
    <div class="grid">${rows}</div>
  </body></html>`);
  win.document.close();
}

// ── Close modals on overlay click ─────────────────────────
document.getElementById('itemModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('confirmModal').addEventListener('click', function(e) {
  if (e.target === this) closeConfirm();
});
document.getElementById('qrModal').addEventListener('click', function(e) {
  if (e.target === this) closeQRModal();
});

document.getElementById('importModal').addEventListener('click', function(e) {
  if (e.target === this) cancelImport();
});

// ── Keyboard: ESC closes modals ───────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); closeQRModal(); cancelImport(); closeScanModal(); }
});

// ── Inventory QR Scanner ──────────────────────────────────
let invScanner        = null;
let invScannerRunning = false;
let invScanCooldown   = false;

function openScanModal() {
  document.getElementById('invScanFeedback').textContent = 'Point camera at a product barcode';
  document.getElementById('invScanFeedback').style.color = 'var(--text-muted)';
  document.getElementById('scanModal').classList.add('open');
  startInventoryScanner();
}

function closeScanModal() {
  stopInventoryScanner();
  document.getElementById('scanModal').classList.remove('open');
}

function startInventoryScanner() {
  if (invScannerRunning) return;
  invScanner = new Html5Qrcode('inv-qr-reader');
  invScanner.start(
    { facingMode: 'environment' },
    {
      fps: 15,
      qrbox: { width: 280, height: 100 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
      ],
    },
    onInventoryScan,
    () => {}
  ).then(() => {
    invScannerRunning = true;
  }).catch(() => {
    const fb = document.getElementById('invScanFeedback');
    fb.textContent = '⛔ Camera access denied — please allow camera permission and try again.';
    fb.style.color = 'var(--danger)';
  });
}

function stopInventoryScanner() {
  if (!invScanner || !invScannerRunning) return;
  invScanner.stop().catch(() => {});
  invScannerRunning = false;
  invScanner = null;
}

function onInventoryScan(decodedText) {
  if (invScanCooldown) return;
  invScanCooldown = true;
  setTimeout(() => { invScanCooldown = false; }, 1500);

  const fb = document.getElementById('invScanFeedback');
  loadItems();
  const item = items.find(i => i.id === decodedText);

  if (!item) {
    fb.textContent = '❌ Product not found — make sure this barcode was generated from this system.';
    fb.style.color = 'var(--danger)';
    return;
  }

  // Found — stop scanner, close modal, open edit
  stopInventoryScanner();
  document.getElementById('scanModal').classList.remove('open');
  openEditModal(item.id);
  showToast(`Found: ${item.name}`, 'ok');
}

// ── Export / Import data ──────────────────────────────────
const HISTORY_KEY  = 'grocery_sales_history';
const SETTINGS_KEY = 'grocery_pos_settings';
const PROMOS_KEY   = 'grocery_promos_v1';

function exportData() {
  const payload = {
    version:   1,
    exportedAt: new Date().toISOString(),
    inventory: JSON.parse(localStorage.getItem(STORAGE_KEY)  || '[]'),
    sales:     JSON.parse(localStorage.getItem(HISTORY_KEY)  || '[]'),
    settings:  JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'),
    promos:    JSON.parse(localStorage.getItem(PROMOS_KEY)   || '[]'),
  };
  const blob     = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const link     = document.createElement('a');
  link.href      = url;
  link.download  = `grocery_backup_${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

let _pendingImport = null;

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';   // reset so same file can be re-selected

  const reader = new FileReader();
  reader.onload = e => {
    let parsed;
    try { parsed = JSON.parse(e.target.result); }
    catch { alert('Invalid file — could not parse JSON.'); return; }

    if (!parsed || !Array.isArray(parsed.inventory)) {
      alert('Invalid backup file — missing inventory data.');
      return;
    }

    const invCount    = parsed.inventory.length;
    const salesCount  = Array.isArray(parsed.sales)  ? parsed.sales.length  : 0;
    const promoCount  = Array.isArray(parsed.promos) ? parsed.promos.length : 0;
    document.getElementById('importConfirmText').textContent =
      `Found ${invCount} inventory item${invCount !== 1 ? 's' : ''}, ${salesCount} sales record${salesCount !== 1 ? 's' : ''}` +
      (promoCount ? `, and ${promoCount} promotion${promoCount !== 1 ? 's' : ''}` : '') +
      `. This will replace your current data.`;

    _pendingImport = parsed;
    document.getElementById('importModal').classList.add('open');
  };
  reader.readAsText(file);
}

function confirmImport() {
  if (!_pendingImport) return;
  localStorage.setItem(STORAGE_KEY,  JSON.stringify(_pendingImport.inventory));
  if (Array.isArray(_pendingImport.sales))
    localStorage.setItem(HISTORY_KEY,  JSON.stringify(_pendingImport.sales));
  if (_pendingImport.settings && typeof _pendingImport.settings === 'object')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(_pendingImport.settings));
  if (Array.isArray(_pendingImport.promos))
    localStorage.setItem(PROMOS_KEY, JSON.stringify(_pendingImport.promos));
  _pendingImport = null;
  document.getElementById('importModal').classList.remove('open');
  loadItems();
  renderItems();
  updateStats();
  generateMissingQRCodes();
}

function cancelImport() {
  _pendingImport = null;
  document.getElementById('importModal').classList.remove('open');
}

// ── Current date display ───────────────────────────────────
function setCurrentDate() {
  const opts = { weekday:'short', year:'numeric', month:'short', day:'numeric' };
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', opts);
}

// ── Seed demo data (first time only) ──────────────────────
function seedDemo() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const d = (offset) => {
    const dt = new Date(); dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0,10);
  };
  const demo = [
    { name:'Whole Milk',       category:'Dairy & Eggs',        qty:2,    unit:'L',    expiry: d(3),   location:'Refrigerator', notes:'Full fat',    costPrice:1.20, retailPrice:2.50 },
    { name:'Chicken Breast',   category:'Meat & Seafood',      qty:500,  unit:'g',    expiry: d(-2),  location:'Freezer',      notes:'',            costPrice:3.50, retailPrice:5.99 },
    { name:'Sourdough Bread',  category:'Bakery & Bread',      qty:1,    unit:'pcs',  expiry: d(1),   location:'Counter',      notes:'Artisan loaf',costPrice:1.80, retailPrice:4.50 },
    { name:'Baby Spinach',     category:'Fruits & Vegetables', qty:200,  unit:'g',    expiry: d(5),   location:'Refrigerator', notes:'',            costPrice:0.80, retailPrice:1.99 },
    { name:'Cheddar Cheese',   category:'Dairy & Eggs',        qty:250,  unit:'g',    expiry: d(14),  location:'Refrigerator', notes:'',            costPrice:2.20, retailPrice:3.99 },
    { name:'Orange Juice',     category:'Beverages',           qty:1,    unit:'L',    expiry: d(7),   location:'Refrigerator', notes:'No pulp',     costPrice:1.50, retailPrice:1.80 },
    { name:'Greek Yogurt',     category:'Dairy & Eggs',        qty:500,  unit:'g',    expiry: d(10),  location:'Refrigerator', notes:'Plain',       costPrice:1.00, retailPrice:2.99 },
    { name:'Pasta',            category:'Canned & Dry Goods',  qty:3,    unit:'pack', expiry: d(180), location:'Pantry',       notes:'',            costPrice:0.60, retailPrice:1.49 },
    { name:'Tomato Sauce',     category:'Canned & Dry Goods',  qty:2,    unit:'can',  expiry: d(365), location:'Pantry',       notes:'',            costPrice:0.70, retailPrice:1.29 },
    { name:'Strawberries',     category:'Fruits & Vegetables', qty:400,  unit:'g',    expiry: d(4),   location:'Refrigerator', notes:'Organic',     costPrice:1.20, retailPrice:3.99 },
  ];
  items = demo.map((i, idx) => ({ ...i, id: 'item_demo_' + idx, image: null, addedAt: Date.now() - idx * 1000 }));
  saveItems();
}

// ── Init ───────────────────────────────────────────────────
setCurrentDate();
seedDemo();
loadItems();
renderItems();
// Generate and persist QR codes for any items that don't have one yet
generateMissingQRCodes();

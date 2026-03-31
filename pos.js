// ═══════════════════════════════════════════════════════════
//  POS Terminal — pos.js
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY  = 'grocery_inventory_v1';
const SETTINGS_KEY = 'grocery_pos_settings';
const HISTORY_KEY  = 'grocery_sales_history';

const CATEGORY_EMOJI = {
  'Fruits & Vegetables': '🥦', 'Dairy & Eggs': '🥛', 'Meat & Seafood': '🥩',
  'Bakery & Bread': '🍞',      'Frozen Foods': '🧊', 'Canned & Dry Goods': '🥫',
  'Beverages': '🧃',           'Snacks & Sweets': '🍪', 'Condiments & Spices': '🧂',
  'Cleaning Supplies': '🧹',   'Personal Care': '🧼',
  'Other': '📦',
};

// ── State ─────────────────────────────────────────────────
let inventory      = [];
let cart           = [];   // { itemId, name, unit, retailPrice, costPrice, qty, maxQty }
let payMethod      = 'cash';
let scanner        = null;
let scannerRunning = false;
let scanCooldown   = false;
let lastReceipt    = null;
let txnSeq         = 1;

// ── Init ─────────────────────────────────────────────────
function init() {
  loadInventory();
  loadSettings();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  renderCart();
  renderSearchResults();
  document.getElementById('posSearch').addEventListener('focus', renderSearchResults);
}

function updateDateTime() {
  const now  = new Date();
  const date = now.toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  document.getElementById('posDateTime').textContent = date + '  ' + time;
}

// ── Inventory ─────────────────────────────────────────────
function loadInventory()  { inventory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveInventory()  { localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory)); }

// ── Settings ─────────────────────────────────────────────
function loadSettings() {
  const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const storeName = s.storeName || 'GROCERY STORE';
  const taxRate   = s.taxRate   ?? 0;
  document.getElementById('storeNameDisplay').textContent = storeName;
  document.getElementById('storeNameInput').value  = storeName;
  document.getElementById('taxRateInput').value    = taxRate;
  document.getElementById('taxRateLbl').textContent = taxRate;
}

function saveSettings() {
  const storeName = document.getElementById('storeNameInput').value.trim() || 'GROCERY STORE';
  const taxRate   = parseFloat(document.getElementById('taxRateInput').value) || 0;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ storeName, taxRate }));
  document.getElementById('storeNameDisplay').textContent = storeName;
  document.getElementById('taxRateLbl').textContent = taxRate;
  updateTotals();
  showToast('Settings saved', 'ok');
}

// ── QR Scanner ────────────────────────────────────────────
function toggleScanner() {
  scannerRunning ? stopScanner() : startScanner();
}

function startScanner() {
  const readerEl = document.getElementById('qr-reader');
  scanner = new Html5Qrcode('qr-reader');
  scanner.start(
    { facingMode: 'environment' },
    { fps: 12, qrbox: { width: 240, height: 240 } },
    onScanSuccess,
    () => {}
  ).then(() => {
    scannerRunning = true;
    const btn = document.getElementById('scanBtn');
    btn.textContent = '⏹ Stop Scanner';
    btn.classList.replace('btn-primary', 'btn-danger');
  }).catch(() => {
    readerEl.style.display = 'none';
    showToast('Camera access denied. Use manual search.', 'err');
  });
}

function stopScanner() {
  if (!scanner || !scannerRunning) return;
  scanner.stop().then(() => {
    scannerRunning = false;
    const btn = document.getElementById('scanBtn');
    btn.textContent = '▶ Start Scanner';
    btn.classList.replace('btn-danger', 'btn-primary');
  }).catch(() => {});
}

function onScanSuccess(decodedText) {
  if (scanCooldown) return;
  scanCooldown = true;
  setTimeout(() => { scanCooldown = false; }, 1500);

  loadInventory();
  const item = inventory.find(i => i.id === decodedText);
  if (!item) {
    showScanBadge('❌ Unknown QR code', 'error');
    return;
  }
  addToCart(decodedText);
}

function showScanBadge(msg, type) {
  const el = document.getElementById('scanFeedback');
  el.textContent = msg;
  el.className = `scan-feedback show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'scan-feedback'; }, 2200);
}

// ── Cart ──────────────────────────────────────────────────
function addToCart(itemId) {
  loadInventory();
  const item = inventory.find(i => i.id === itemId);
  if (!item) return showToast('Item not found', 'err');

  const inStock = Math.max(0, Number(item.qty) || 0);
  const existing = cart.find(c => c.itemId === itemId);
  const inCart   = existing ? existing.qty : 0;

  if (inCart >= inStock) {
    showToast(`"${item.name}" — no more stock available`, 'warn');
    showScanBadge(`⚠️ Out of stock: ${item.name}`, 'warn');
    return;
  }

  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      itemId:      item.id,
      name:        item.name,
      unit:        item.unit,
      retailPrice: Number(item.retailPrice) || 0,
      costPrice:   Number(item.costPrice)   || 0,
      qty:         1,
      maxQty:      inStock,
    });
  }

  playBeep();
  showScanBadge(`✅ Added: ${item.name}`, 'success');
  showToast(`${item.name} added to cart`, 'ok');
  renderCart();
}

function changeQty(itemId, delta) {
  const ci = cart.find(c => c.itemId === itemId);
  if (!ci) return;
  const newQty = ci.qty + delta;
  if (newQty <= 0)         { removeFromCart(itemId); return; }
  if (newQty > ci.maxQty)  { showToast('Exceeds available stock', 'warn'); return; }
  ci.qty = newQty;
  renderCart();
}

function removeFromCart(itemId) {
  cart = cart.filter(c => c.itemId !== itemId);
  renderCart();
}

function clearCart() {
  if (!cart.length) return;
  cart = [];
  renderCart();
  showToast('Cart cleared', 'ok');
}

function renderCart() {
  const listEl   = document.getElementById('cartList');
  const badgeEl  = document.getElementById('cartBadge');
  const checkBtn = document.getElementById('checkoutBtn');

  const totalQty = cart.reduce((s, c) => s + c.qty, 0);
  badgeEl.textContent  = totalQty + ' item' + (totalQty !== 1 ? 's' : '');
  checkBtn.disabled    = cart.length === 0;
  // sync mobile tab badge
  const mobCount = document.getElementById('mobCartCount');
  if (mobCount) mobCount.textContent = totalQty;

  if (!cart.length) {
    listEl.innerHTML = `
      <div class="cart-empty" id="cartEmpty" style="display:flex">
        <div style="font-size:2.8rem">🛒</div>
        <p>Cart is empty</p>
        <small>Scan a QR code or search items to add</small>
      </div>`;
    updateTotals();
    return;
  }

  listEl.innerHTML = cart.map(ci => {
    const line = (ci.retailPrice * ci.qty).toFixed(2);
    return `
      <div class="cart-item">
        <div class="ci-info">
          <div class="ci-name">${escHtml(ci.name)}</div>
          <div class="ci-meta">${escHtml(ci.unit)} &nbsp;·&nbsp; ₱${ci.retailPrice.toFixed(2)} each &nbsp;·&nbsp; stock: ${ci.maxQty}</div>
        </div>
        <div class="ci-qty-ctrl">
          <button class="qty-btn" onclick="changeQty('${ci.itemId}',-1)">−</button>
          <span class="ci-qty-num">${ci.qty}</span>
          <button class="qty-btn" onclick="changeQty('${ci.itemId}',1)">+</button>
        </div>
        <div class="ci-line-total">₱${line}</div>
        <button class="ci-del" onclick="removeFromCart('${ci.itemId}')" title="Remove">✕</button>
      </div>`;
  }).join('');

  updateTotals();
}

function updateTotals() {
  const subtotal = cart.reduce((s, c) => s + c.retailPrice * c.qty, 0);
  const taxRate  = parseFloat(document.getElementById('taxRateInput').value) || 0;
  const tax      = subtotal * taxRate / 100;
  const total    = subtotal + tax;

  document.getElementById('totSubtotal').textContent = '₱' + subtotal.toFixed(2);
  document.getElementById('totTax').textContent      = '₱' + tax.toFixed(2);
  document.getElementById('totGrand').textContent    = '₱' + total.toFixed(2);
  document.getElementById('taxRateLbl').textContent  = taxRate;
}

// ── Manual Item Search ────────────────────────────────────
function renderSearchResults() {
  loadInventory();
  const q = (document.getElementById('posSearch').value || '').toLowerCase().trim();
  const container = document.getElementById('searchResults');

  let list = inventory.filter(i => Number(i.qty) > 0);
  if (q) list = list.filter(i =>
    i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
  );
  list = list.slice(0, 10);

  if (!list.length) {
    container.innerHTML = `<div class="search-empty-msg">${q ? 'No matching in-stock items' : 'Start typing to search items…'}</div>`;
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="search-result-item" onclick="addToCart('${item.id}')">
      <span class="sr-emoji">${CATEGORY_EMOJI[item.category] || '📦'}</span>
      <div class="sr-info">
        <div class="sr-name">${escHtml(item.name)}</div>
        <div class="sr-sub">
          Stock: ${item.qty} ${escHtml(item.unit)}
          &nbsp;·&nbsp; ₱${Number(item.retailPrice || 0).toFixed(2)} / ${escHtml(item.unit)}
        </div>
      </div>
      <button class="sr-add-btn">+ Add</button>
    </div>`
  ).join('');
}

// ── Payment ───────────────────────────────────────────────
function openPayModal() {
  if (!cart.length) return showToast('Cart is empty', 'warn');
  const subtotal = cart.reduce((s, c) => s + c.retailPrice * c.qty, 0);
  const taxRate  = parseFloat(document.getElementById('taxRateInput').value) || 0;
  const total    = subtotal + subtotal * taxRate / 100;

  document.getElementById('payTotalAmt').textContent = '₱' + total.toFixed(2);
  document.getElementById('cashIn').value = '';
  document.getElementById('changeRow').style.display = 'none';
  setPayMethod('cash');
  document.getElementById('payModal').classList.add('open');
  setTimeout(() => document.getElementById('cashIn').focus(), 200);
}

function closePayModal() {
  document.getElementById('payModal').classList.remove('open');
}

function setPayMethod(method) {
  payMethod = method;
  document.getElementById('btnCash').classList.toggle('active', method === 'cash');
  document.getElementById('btnCard').classList.toggle('active', method === 'card');
  document.getElementById('cashSection').style.display = method === 'cash' ? 'flex' : 'none';
  document.getElementById('cardSection').style.display = method === 'card' ? 'block' : 'none';
  if (method === 'card') document.getElementById('changeRow').style.display = 'none';
}

function calcChange() {
  const totalText = document.getElementById('payTotalAmt').textContent.replace('₱', '');
  const total     = parseFloat(totalText) || 0;
  const received  = parseFloat(document.getElementById('cashIn').value) || 0;
  const change    = received - total;

  const changeRow = document.getElementById('changeRow');
  if (received > 0) {
    document.getElementById('changeAmt').textContent = '₱' + Math.max(0, change).toFixed(2);
    changeRow.style.display = 'flex';
    changeRow.style.color   = change < 0 ? '#e63946' : '#2d6a4f';
  } else {
    changeRow.style.display = 'none';
  }
}

function completeSale() {
  const subtotal    = cart.reduce((s, c) => s + c.retailPrice * c.qty, 0);
  const taxRate     = parseFloat(document.getElementById('taxRateInput').value) || 0;
  const tax         = subtotal * taxRate / 100;
  const total       = subtotal + tax;
  const cashReceived = payMethod === 'cash'
    ? parseFloat(document.getElementById('cashIn').value) || 0
    : total;

  if (payMethod === 'cash' && cashReceived < total) {
    showToast('Cash received is less than total', 'err');
    document.getElementById('cashIn').focus();
    return;
  }

  // Deduct inventory
  loadInventory();
  cart.forEach(ci => {
    const idx = inventory.findIndex(i => i.id === ci.itemId);
    if (idx !== -1) {
      inventory[idx].qty = Math.max(0, Number(inventory[idx].qty) - ci.qty);
    }
  });
  saveInventory();

  // Build receipt data
  const now      = new Date();
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const txnId    = 'TXN-' + now.toISOString().slice(0,10).replace(/-/g,'') + '-' + String(txnSeq++).padStart(4,'0');

  lastReceipt = {
    txnId,
    storeName:    settings.storeName || 'GROCERY STORE',
    date:         now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
    time:         now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
    timestamp:    now.getTime(),
    items:        cart.map(c => ({ ...c })),
    subtotal,
    taxRate,
    tax,
    total,
    payMethod:    payMethod === 'cash' ? 'Cash' : 'Card',
    cashReceived,
    change:       Math.max(0, cashReceived - total),
  };

  // Save to sales history
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  history.push(lastReceipt);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

  closePayModal();
  showReceiptModal();
}

// ── Receipt ───────────────────────────────────────────────
function showReceiptModal() {
  const html = buildReceiptHTML(lastReceipt);
  document.getElementById('receiptPreview').innerHTML = html;
  document.getElementById('printArea').innerHTML = html;
  document.getElementById('receiptModal').classList.add('open');
}

function closeReceiptModal() {
  document.getElementById('receiptModal').classList.remove('open');
}

function newSale() {
  closeReceiptModal();
  cart = [];
  renderCart();
  document.getElementById('posSearch').value = '';
  renderSearchResults();
}

function printReceipt() {
  window.print();
}

function downloadReceiptImage() {
  const receiptEl = document.querySelector('#receiptPreview .receipt-paper');
  if (!receiptEl) return showToast('No receipt to download', 'warn');

  const btn = document.getElementById('dlImgBtn');
  btn.textContent = '⏳ Generating…';
  btn.disabled = true;

  html2canvas(receiptEl, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = `receipt_${lastReceipt ? lastReceipt.txnId : Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Receipt image downloaded', 'ok');
  }).catch(() => {
    showToast('Image generation failed', 'err');
  }).finally(() => {
    btn.textContent = '📥 Save Image';
    btn.disabled = false;
  });
}

function buildReceiptHTML(d) {
  const totalQty = d.items.reduce((s, i) => s + i.qty, 0);

  const itemRows = d.items.map(i => `
    <tr>
      <td class="rp-col-name">${escHtml(i.name)}</td>
      <td class="rp-col-qty">${i.qty}</td>
      <td class="rp-col-price">₱${i.retailPrice.toFixed(2)}</td>
      <td class="rp-col-total">₱${(i.retailPrice * i.qty).toFixed(2)}</td>
    </tr>`).join('');

  const cashRows = d.payMethod === 'Cash' ? `
    <div class="rp-pay-row"><span>Received</span><span>₱${d.cashReceived.toFixed(2)}</span></div>
    <div class="rp-pay-row"><span>Change</span><span>₱${d.change.toFixed(2)}</span></div>` : '';

  return `
    <div class="receipt-paper">
      <div class="rp-store">${escHtml(d.storeName)}</div>
      <div class="rp-subtitle">POS RECEIPT</div>
      <div class="rp-div-solid"></div>

      <div class="rp-meta">
        <div class="rp-meta-row"><span>Date</span><span>${d.date}</span></div>
        <div class="rp-meta-row"><span>Time</span><span>${d.time}</span></div>
        <div class="rp-meta-row"><span>Txn #</span><span>${d.txnId}</span></div>
      </div>
      <div class="rp-div-dash"></div>

      <table class="rp-items-table">
        <thead>
          <tr>
            <th class="rp-col-name">ITEM</th>
            <th class="rp-col-qty" style="text-align:center">QTY</th>
            <th class="rp-col-price" style="text-align:right">PRICE</th>
            <th class="rp-col-total" style="text-align:right">TOTAL</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="rp-div-dash"></div>

      <div class="rp-totals">
        <div class="rp-total-row"><span>Subtotal</span><span>₱${d.subtotal.toFixed(2)}</span></div>
        <div class="rp-total-row"><span>Tax (${d.taxRate}%)</span><span>₱${d.tax.toFixed(2)}</span></div>
        <div class="rp-grand"><span>TOTAL</span><span>₱${d.total.toFixed(2)}</span></div>
      </div>
      <div class="rp-div-solid"></div>

      <div class="rp-payment">
        <div class="rp-pay-row"><span>Payment</span><span>${d.payMethod}</span></div>
        ${cashRows}
      </div>
      <div class="rp-div-dash"></div>

      <div class="rp-footer">
        <div>Items sold: ${totalQty}</div>
        <div class="rp-div-dash" style="margin:6px 0"></div>
        <strong>Thank you for shopping!</strong>
        <div>Please come again! 🛒</div>
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showToast(msg, type = 'ok') {
  const wrap  = document.getElementById('toastWrap');
  const toast = document.createElement('div');
  toast.className = `toast t-${type}`;
  toast.textContent = msg;
  wrap.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, 2600);
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    const ctx  = new AudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1100;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

// ── Close modals on overlay click ─────────────────────────
document.getElementById('payModal').addEventListener('click', function(e) {
  if (e.target === this) closePayModal();
});

// ── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePayModal(); closeReceiptModal(); }
  if (e.key === 'F2') { openPayModal(); }
  if (e.key === 'F3') { document.getElementById('posSearch').focus(); e.preventDefault(); }
  if (e.key === 'F4') { toggleScanner(); }
});

// ── Mobile Tabs ───────────────────────────────────────────
function showTab(tab) {
  const scanCol = document.querySelector('.pos-left');
  const cartCol = document.querySelector('.pos-right');
  const tabScan = document.getElementById('tabScan');
  const tabCart = document.getElementById('tabCart');
  if (tab === 'scan') {
    scanCol.classList.remove('mob-hidden');
    cartCol.classList.add('mob-hidden');
    tabScan.classList.add('active');
    tabCart.classList.remove('active');
  } else {
    cartCol.classList.remove('mob-hidden');
    scanCol.classList.add('mob-hidden');
    tabCart.classList.add('active');
    tabScan.classList.remove('active');
  }
}

// ── Boot ─────────────────────────────────────────────────
init();

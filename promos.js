// ═══════════════════════════════════════════════════════════
//  Promotions — promos.js
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'grocery_inventory_v1';
const PROMOS_KEY  = 'grocery_promos_v1';

// ── State ─────────────────────────────────────────────────
let inventory   = [];
let promos      = [];
let editingId   = null;
let deletingId  = null;
let bundleItems = []; // [{itemId, qty}] being built in the modal

// ── Storage ───────────────────────────────────────────────
function loadInventory() { inventory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function loadPromos()    { promos    = JSON.parse(localStorage.getItem(PROMOS_KEY)  || '[]'); }
function savePromos()    { localStorage.setItem(PROMOS_KEY, JSON.stringify(promos)); }

// ── Init ─────────────────────────────────────────────────
function init() {
  loadInventory();
  loadPromos();
  setCurrentDate();
  renderPromos();
}

function setCurrentDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Resolve a promo against live inventory ─────────────────
function resolvePromo(promo) {
  let normalTotal = 0;
  let available   = promo.items.length ? Infinity : 0;
  const resolved  = promo.items.map(bi => {
    const invItem = inventory.find(i => i.id === bi.itemId);
    if (!invItem) {
      available = 0;
      return { ...bi, name: '(item removed)', retailPrice: 0 };
    }
    normalTotal += (Number(invItem.retailPrice) || 0) * bi.qty;
    const stock = Math.max(0, Number(invItem.qty) || 0);
    available   = Math.min(available, Math.floor(stock / bi.qty));
    return { ...bi, name: invItem.name, unit: invItem.unit, retailPrice: Number(invItem.retailPrice) || 0 };
  });
  if (available === Infinity) available = 0;
  return { resolved, normalTotal, available };
}

// ── Render Promos Grid ────────────────────────────────────
function renderPromos() {
  loadInventory();
  loadPromos();
  const grid  = document.getElementById('promosGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('promoCount');

  if (count) count.textContent = promos.length + ' promo' + (promos.length !== 1 ? 's' : '');

  if (!promos.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = promos.map(promo => {
    const { resolved, normalTotal, available } = resolvePromo(promo);
    const savings     = normalTotal - Number(promo.promoPrice);
    const savingsPct  = normalTotal > 0 ? (savings / normalTotal * 100) : 0;
    const isActive    = promo.active !== false;

    const itemRows = resolved.map(r => `
      <div class="promo-item-row">
        <span class="pi-qty">${r.qty}×</span>
        <span class="pi-name">${escHtml(r.name)}</span>
        <span class="pi-price">₱${(r.retailPrice * r.qty).toFixed(2)}</span>
      </div>`).join('');

    const stockBadge = available > 0
      ? `<span class="stock-badge ok">${available} bundle${available !== 1 ? 's' : ''} available</span>`
      : `<span class="stock-badge out">Out of stock</span>`;

    return `
      <div class="promo-card${!isActive ? ' inactive' : ''}">
        <div class="promo-card-head">
          <div class="promo-card-title-wrap">
            <div class="promo-name">${escHtml(promo.name)}</div>
            ${!isActive ? '<span class="inactive-badge">Inactive</span>' : ''}
            ${promo.description ? `<div class="promo-desc">${escHtml(promo.description)}</div>` : ''}
          </div>
          <div class="promo-actions">
            <button class="icon-btn edit" onclick="openEditModal('${promo.id}')" title="Edit">✏️</button>
            <button class="icon-btn delete" onclick="askDelete('${promo.id}')" title="Delete">🗑️</button>
          </div>
        </div>

        <div class="promo-items-list">
          ${itemRows || '<em class="promo-no-items">No products added</em>'}
        </div>

        <div class="promo-footer">
          <div class="promo-pricing">
            ${normalTotal > 0 && savings > 0 ? `<span class="normal-price">₱${normalTotal.toFixed(2)}</span>` : ''}
            <span class="promo-price-tag">₱${Number(promo.promoPrice).toFixed(2)}</span>
            ${savings > 0 && normalTotal > 0 ? `<span class="savings-badge">Save ${savingsPct.toFixed(0)}%</span>` : ''}
          </div>
          ${stockBadge}
        </div>
      </div>`;
  }).join('');
}

// ── Add / Edit Modal ──────────────────────────────────────
function openAddModal() {
  editingId   = null;
  bundleItems = [];
  document.getElementById('modalTitle').textContent      = 'New Promotion';
  document.getElementById('fPromoName').value            = '';
  document.getElementById('fPromoDesc').value            = '';
  document.getElementById('fPromoPrice').value           = '';
  document.getElementById('fPromoActive').checked        = true;
  document.getElementById('bundleItemSearch').value      = '';
  document.getElementById('normalTotalSugg').textContent = '';
  renderBundleItems();
  renderBundleSearch('');
  document.getElementById('promoModal').classList.add('open');
  setTimeout(() => document.getElementById('fPromoName').focus(), 150);
}

function openEditModal(id) {
  const promo = promos.find(p => p.id === id);
  if (!promo) return;
  editingId   = id;
  bundleItems = promo.items.map(bi => ({ ...bi }));

  document.getElementById('modalTitle').textContent      = 'Edit Promotion';
  document.getElementById('fPromoName').value            = promo.name;
  document.getElementById('fPromoDesc').value            = promo.description || '';
  document.getElementById('fPromoPrice').value           = promo.promoPrice;
  document.getElementById('fPromoActive').checked        = promo.active !== false;
  document.getElementById('bundleItemSearch').value      = '';

  renderBundleItems();
  renderBundleSearch('');
  updateNormalTotal();
  document.getElementById('promoModal').classList.add('open');
}

function closeModal() {
  document.getElementById('promoModal').classList.remove('open');
}

function savePromo() {
  const name       = document.getElementById('fPromoName').value.trim();
  const desc       = document.getElementById('fPromoDesc').value.trim();
  const promoPrice = parseFloat(document.getElementById('fPromoPrice').value);
  const active     = document.getElementById('fPromoActive').checked;

  if (!name)                          { showToast('Promotion name is required', 'warn'); return; }
  if (isNaN(promoPrice) || promoPrice < 0) { showToast('Enter a valid promo price (₱)', 'warn'); return; }
  if (!bundleItems.length)            { showToast('Add at least one product to the bundle', 'warn'); return; }

  if (editingId) {
    const idx = promos.findIndex(p => p.id === editingId);
    if (idx !== -1) {
      promos[idx] = { ...promos[idx], name, description: desc, promoPrice, active, items: bundleItems };
    }
  } else {
    promos.push({
      id:          'promo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name,
      description: desc,
      promoPrice,
      active,
      items:       bundleItems,
      createdAt:   Date.now(),
    });
  }

  savePromos();
  renderPromos();
  closeModal();
  showToast(editingId ? 'Promotion updated' : 'Promotion created! 🎁', 'ok');
}

// ── Bundle Item Picker ────────────────────────────────────
function renderBundleSearch(q) {
  const container = document.getElementById('bundleSearchResults');
  const query     = (q || '').toLowerCase().trim();

  // Items not already in bundle
  let list = inventory.filter(i => !bundleItems.find(bi => bi.itemId === i.id));
  if (query) list = list.filter(i =>
    i.name.toLowerCase().includes(query) || (i.category || '').toLowerCase().includes(query)
  );
  list = list.slice(0, 8);

  if (!list.length) {
    container.innerHTML = `<div class="bsr-empty">${query ? 'No matching items' : 'Type to search products…'}</div>`;
    return;
  }

  container.innerHTML = list.map(i => `
    <div class="bundle-pick-item" onclick="addItemToBundle('${i.id}')">
      <div class="bpi-name">${escHtml(i.name)}</div>
      <div class="bpi-meta">
        ${escHtml(i.category)} &nbsp;·&nbsp; ₱${Number(i.retailPrice || 0).toFixed(2)} / ${escHtml(i.unit)}
        &nbsp;·&nbsp; Stock: ${i.qty} ${escHtml(i.unit)}
      </div>
    </div>`).join('');
}

function addItemToBundle(itemId) {
  if (bundleItems.find(bi => bi.itemId === itemId)) return;
  bundleItems.push({ itemId, qty: 1 });
  document.getElementById('bundleItemSearch').value = '';
  renderBundleSearch('');
  renderBundleItems();
  updateNormalTotal();
}

function removeItemFromBundle(itemId) {
  bundleItems = bundleItems.filter(bi => bi.itemId !== itemId);
  renderBundleItems();
  updateNormalTotal();
  renderBundleSearch(document.getElementById('bundleItemSearch').value);
}

function updateBundleQty(itemId, val) {
  const bi = bundleItems.find(bi => bi.itemId === itemId);
  if (bi) bi.qty = Math.max(1, parseInt(val) || 1);
  updateNormalTotal();
}

function renderBundleItems() {
  const container = document.getElementById('bundleItemsList');
  if (!bundleItems.length) {
    container.innerHTML = '<div class="bundle-empty-hint">No products added yet — search and click to add</div>';
    return;
  }
  container.innerHTML = bundleItems.map(bi => {
    const inv   = inventory.find(i => i.id === bi.itemId);
    const name  = inv ? escHtml(inv.name) : '<em>Unknown item</em>';
    const unit  = inv ? escHtml(inv.unit) : '';
    const price = inv ? Number(inv.retailPrice || 0) : 0;
    return `
      <div class="bundle-item-row">
        <div class="bir-info">
          <div class="bir-name">${name}</div>
          <div class="bir-price">₱${(price * bi.qty).toFixed(2)}</div>
        </div>
        <div class="bir-controls">
          <label class="bir-qty-label">${unit}</label>
          <input type="number" class="bir-qty-input" value="${bi.qty}" min="1"
                 onchange="updateBundleQty('${bi.itemId}', this.value)"
                 oninput="updateBundleQty('${bi.itemId}', this.value)" />
          <button class="bir-del" onclick="removeItemFromBundle('${bi.itemId}')" title="Remove">✕</button>
        </div>
      </div>`;
  }).join('');
}

function updateNormalTotal() {
  let total = 0;
  bundleItems.forEach(bi => {
    const inv = inventory.find(i => i.id === bi.itemId);
    if (inv) total += (Number(inv.retailPrice) || 0) * bi.qty;
  });
  const el = document.getElementById('normalTotalSugg');
  if (el) el.textContent = total > 0 ? `Normal total: ₱${total.toFixed(2)}` : '';
}

// ── Delete ────────────────────────────────────────────────
function askDelete(id) {
  deletingId = id;
  const promo = promos.find(p => p.id === id);
  document.getElementById('confirmText').textContent =
    `Delete "${promo ? promo.name : 'this promotion'}"? This cannot be undone.`;
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirm() {
  deletingId = null;
  document.getElementById('confirmModal').classList.remove('open');
}

function confirmDelete() {
  if (!deletingId) return;
  promos = promos.filter(p => p.id !== deletingId);
  savePromos();
  renderPromos();
  closeConfirm();
  showToast('Promotion deleted', 'ok');
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  const wrap = document.getElementById('toastWrap');
  const t    = document.createElement('div');
  t.className   = `toast toast-${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 2800);
}

// ── Keyboard ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeModal();
  closeConfirm();
});

document.addEventListener('DOMContentLoaded', init);

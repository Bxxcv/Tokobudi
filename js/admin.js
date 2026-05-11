/**
 * LINKify — Admin Dashboard (admin.js)
 * PATCHED: dedup Firebase fetches, cache clear on save, lazy img,
 *          debounce search, DocumentFragment chart, mobile fixes,
 *          race-condition guard, double-submit prevention.
 */

import { auth, db, CONFIG } from '../firebase.js';
import {
  onAuthStateChanged, signOut, updatePassword, updateEmail,
  EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDoc, query, orderBy, setDoc, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  escHtml, checkPremium, checkPlan, hexToRgb, ACCENT_COLORS, DAY_NAMES,
  formatDate, TEMPLATE_LIST, showToast
} from './utils.js';
import { PREMIUM_TEMPLATES, getTemplate, getAllTemplates, getThemePreviewData } from './templates.js';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const CLOUD_NAME   = CONFIG.cloudinary.cloudName;
const CLOUD_PRESET = CONFIG.cloudinary.uploadPreset;
const BASE_PATH    = window.location.hostname.includes('github.io') ? '/LINKify' : '';

// ── STATE ──────────────────────────────────────────────────────────────────
let currentTokoData  = null;
let currentAccent    = '#FF6B35';
let allProductsCache = [];
let prodBlobUrl      = null;
let logoBlobUrl      = null;
let customBtns       = [];
let galleryPhotos    = [];

// ── PERF UTILS ─────────────────────────────────────────────────────────────
function debounce(fn, delay) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

// ── DOM ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const productsList = $('products-list');

// ── CLOCK ──────────────────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const ce  = $('clock-time');
  const de  = $('clock-date');
  if (ce) ce.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (de) de.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
tickClock();
setInterval(tickClock, 1000);

// ── SIDEBAR ────────────────────────────────────────────────────────────────
const sidebar = $('sidebar');
const overlay = $('overlay');
function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
$('btn-hamburger').addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

// ── TABS ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
    btn.classList.add('active-tab');
    $('tab-' + btn.dataset.tab)?.classList.add('show');
    closeSidebar();
  });
});

// ── COPY LINK ──────────────────────────────────────────────────────────────
$('btn-copy-link').addEventListener('click', () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return showToast('Login dulu!', 'error');
  const link = `${window.location.origin}${BASE_PATH}/?uid=${uid}`;
  navigator.clipboard.writeText(link)
    .then(() => showToast('Link toko berhasil dicopy!'))
    .catch(() => showToast('Gagal copy link', 'error'));
});

$('btn-preview-store')?.addEventListener('click', () => {
  const uid = auth.currentUser?.uid;
  if (uid) window.open(`${window.location.origin}${BASE_PATH}/?uid=${uid}`, '_blank');
});

$('btn-logout').addEventListener('click', () => {
  if (confirm('Yakin mau keluar?')) signOut(auth);
});

// ── AUTH ───────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login-user.html'; return; }

  const tokoSnap = await getDoc(doc(db, 'toko', user.uid));
  if (!tokoSnap.exists()) {
    showToast('Akun ini belum terdaftar sebagai toko! Hubungi admin.', 'error');
    setTimeout(() => signOut(auth), 2000);
    return;
  }

  currentTokoData = tokoSnap.data();

  // SECURITY: block suspended users
  if (currentTokoData.status === 'blokir') {
    showToast('Akun Anda telah dinonaktifkan. Hubungi admin.', 'error');
    setTimeout(() => signOut(auth), 2200);
    return;
  }

  // Sidebar user block
  const emailEl  = $('admin-email');
  const avatarEl = $('sidebar-avatar');
  if (emailEl)  emailEl.textContent  = user.email;
  if (avatarEl) avatarEl.textContent = (user.email || 'U').charAt(0).toUpperCase();
  $('inp-new-email').value = user.email;

  // FIX: Share tokoData across loaders to avoid duplicate getDoc('toko')
  // FIX: loadStats race-condition — currentTokoData now set before calling it
  // FIX: loadProducts and loadDashboardStats both fetched produk — deduped below
  const prodSnap = await getDocs(query(collection(db, 'toko', user.uid, 'produk'), orderBy('createdAt', 'desc')));

  await Promise.all([
    _initProducts(user.uid, prodSnap),
    _initSettings(user.uid),
    loadStats(user.uid),
    _initDashboardStats(user.uid, prodSnap),
  ]);
});

// ── HELPERS ────────────────────────────────────────────────────────────────
const produkCol = uid => collection(db, 'toko', uid, 'produk');
const produkDoc = (uid, id) => doc(db, 'toko', uid, 'produk', id);
const rupiah    = v => Number(v || 0).toLocaleString('id-ID');

// ── CLEAR PUBLIC CACHE (after admin save) ──────────────────────────────────
function clearPublicCache(uid) {
  try { localStorage.removeItem(`toko_${uid}`); } catch {}
}

// ── DASHBOARD STATS ────────────────────────────────────────────────────────
// FIX: accepts pre-fetched prodSnap so no duplicate getDocs
async function _initDashboardStats(uid, prodSnap) {
  try {
    let total = 0, emptyCount = 0, omsetEstimasi = 0;
    const prodList = [];

    prodSnap.forEach(d => {
      const p = d.data();
      total++;
      if (Number(p.stok) === 0) emptyCount++;
      const terjual = Math.max(0, (p.stokAwal || 0) - (p.stok || 0));
      omsetEstimasi += terjual * (p.harga || 0);
      prodList.push({ id: d.id, ...p, terjual });
    });

    const lowStock = prodList.filter(p => Number(p.stok) > 0 && Number(p.stok) <= 5).sort((a, b) => a.stok - b.stok);
    const topProds = [...prodList].sort((a, b) => b.terjual - a.terjual).slice(0, 5);

    $('stat-total').textContent = total;
    $('stat-empty').textContent = emptyCount;
    $('stat-omset').textContent = 'Rp' + rupiah(omsetEstimasi);

    renderLowStockList(lowStock);
    renderTopProducts(topProds);
  } catch (e) { console.error('_initDashboardStats:', e); }
}

// Keep async wrapper for re-calls after product add/delete
async function loadDashboardStats(uid) {
  try {
    const snap = await getDocs(produkCol(uid));
    await _initDashboardStats(uid, snap);
  } catch (e) { console.error('loadDashboardStats:', e); }
}

function renderLowStockList(items) {
  const el = $('low-stock-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div style="padding:18px;text-align:center;font-size:13px;color:var(--text-3);">Semua stok aman</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'activity-item';
    div.style.borderBottom = i < items.length - 1 ? '1px solid var(--border)' : 'none';
    div.innerHTML = `
      <div class="activity-dot" style="background:${Number(p.stok) === 1 ? '#EF4444' : '#F59E0B'}"></div>
      <div class="activity-text">
        <strong>${escHtml(p.nama)}</strong> — Stok: <span style="color:${Number(p.stok)<=2?'var(--danger)':'var(--warning)'};font-weight:700">${Number(p.stok)}</span>
        ${p.kategori ? `<span style="color:var(--text-3);font-size:11px"> · ${escHtml(p.kategori)}</span>` : ''}
      </div>
      <div class="activity-time" style="color:${Number(p.stok)<=2?'var(--danger)':'var(--warning)'};font-weight:700">${Number(p.stok)} sisa</div>`;
    frag.appendChild(div);
  });
  el.innerHTML = '';
  el.appendChild(frag);
}

function renderTopProducts(items) {
  const el = $('top-products-list');
  if (!el) return;
  const hasTerjual = items.some(p => p.terjual > 0);
  if (!items.length || !hasTerjual) {
    el.innerHTML = '<div style="padding:18px;text-align:center;font-size:13px;color:var(--text-3);">Isi stok awal produk untuk melihat terlaris</div>';
    return;
  }
  const maxTerjual = Math.max(...items.map(p => p.terjual), 1);
  const frag = document.createDocumentFragment();
  items.filter(p => p.terjual > 0).forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'activity-item';
    div.style.cssText = `flex-direction:column;align-items:stretch;gap:6px;padding:13px 16px;border-bottom:${i < items.length - 1 ? '1px solid var(--border)' : 'none'}`;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(p.nama)}</span>
        <span style="font-size:12px;font-weight:700;color:var(--accent)">${p.terjual} terjual</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${Math.round(p.terjual / maxTerjual * 100)}%"></div></div>`;
    frag.appendChild(div);
  });
  el.innerHTML = '';
  el.appendChild(frag);
}

// ── TODAY VISITS ───────────────────────────────────────────────────────────
async function loadTodayVisits(uid) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const snap  = await getDoc(doc(db, 'toko', uid, 'stats', today));
    $('stat-visits-dash').textContent = snap.exists() ? (snap.data().visits || 0) : 0;
  } catch { $('stat-visits-dash').textContent = '—'; }
}

// ── PRODUCTS ───────────────────────────────────────────────────────────────
// FIX: accepts pre-fetched prodSnap on init to avoid double getDocs
async function _initProducts(uid, prodSnap) {
  productsList.innerHTML = [1,2,3].map(() =>
    `<div class="skel-card"><div class="skel" style="height:130px;border-radius:12px 12px 0 0"></div><div style="padding:10px 12px"><div class="skel" style="height:12px;width:70%;margin-bottom:7px"></div><div class="skel" style="height:13px;width:45%"></div></div></div>`
  ).join('');

  try {
    allProductsCache = [];
    prodSnap.forEach(ds => allProductsCache.push({ id: ds.id, ...ds.data() }));
    renderProductGrid(allProductsCache, uid);
    const lbl = $('prod-count-label');
    if (lbl) lbl.textContent = allProductsCache.length + ' produk terdaftar';
  } catch (e) {
    productsList.innerHTML = `<div class="empty-state"><p>Gagal memuat produk. Coba refresh halaman.</p></div>`;
  }
}

async function loadProducts(uid) {
  productsList.innerHTML = [1,2,3].map(() =>
    `<div class="skel-card"><div class="skel" style="height:130px;border-radius:12px 12px 0 0"></div><div style="padding:10px 12px"><div class="skel" style="height:12px;width:70%;margin-bottom:7px"></div><div class="skel" style="height:13px;width:45%"></div></div></div>`
  ).join('');
  try {
    const snap = await getDocs(query(produkCol(uid), orderBy('createdAt', 'desc')));
    allProductsCache = [];
    snap.forEach(ds => allProductsCache.push({ id: ds.id, ...ds.data() }));
    renderProductGrid(allProductsCache, uid);
    const lbl = $('prod-count-label');
    if (lbl) lbl.textContent = allProductsCache.length + ' produk terdaftar';
  } catch {
    productsList.innerHTML = `<div class="empty-state"><p>Gagal memuat produk. Coba refresh halaman.</p></div>`;
  }
}

function renderProductGrid(list, uid) {
  if (!list.length) {
    productsList.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
      <h3>Belum ada produk</h3><p>Klik "Tambah Produk" untuk mulai berjualan.</p>
    </div>`;
    return;
  }

  // FIX: Use DocumentFragment for large product lists
  const frag = document.createDocumentFragment();
  list.forEach(p => {
    const stokNol = Number(p.stok) === 0;
    const div = document.createElement('div');
    div.className = 'p-card';
    // FIX: add loading=lazy + decoding=async + proper onerror
    div.innerHTML = `
      <img class="p-img" src="${escHtml(p.img || '')}" alt="${escHtml(p.nama)}"
           loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='https://placehold.co/400x300/F4F4F4/AAA?text=Foto'">
      <div class="p-body">
        <div class="p-name">${escHtml(p.nama)}${p.unggulan ? ' <span style="color:#F59E0B;font-size:11px;">★</span>' : ''}</div>
        <div class="p-price">Rp${rupiah(p.harga)}${p.hargaAsli > p.harga ? `<span style="text-decoration:line-through;color:var(--text-3);font-size:11px;font-weight:400;margin-left:5px">Rp${rupiah(p.hargaAsli)}</span>` : ''}</div>
        <div class="p-stock">Stok: ${Number(p.stok)}${stokNol ? ' · <span style="color:var(--danger);font-weight:600">Habis</span>' : ''}${p.kategori ? ` · ${escHtml(p.kategori)}` : ''}</div>
        <div class="p-acts">
          <button type="button" class="btn-ed" data-id="${p.id}">Edit</button>
          <button type="button" class="btn-del" data-id="${p.id}">Hapus</button>
        </div>
      </div>`;
    frag.appendChild(div);
  });
  productsList.innerHTML = '';
  productsList.appendChild(frag);
}

// FIX: Product search — debounced, runs on in-memory cache only
window.filterProducts = function() {
  const uid  = auth.currentUser?.uid;
  if (!uid) return;
  const q    = ($('prod-search')?.value || '').toLowerCase().trim();
  const kat  = $('prod-filter-kat')?.value  || '';
  const stok = $('prod-filter-stok')?.value || '';

  const filtered = allProductsCache.filter(p => {
    const mText = !q || (p.nama || '').toLowerCase().includes(q) || (p.deskripsi || '').toLowerCase().includes(q);
    const mKat  = !kat  || p.kategori === kat;
    const mStok = !stok || (stok === 'habis' ? Number(p.stok) === 0 : Number(p.stok) > 0);
    return mText && mKat && mStok;
  });

  renderProductGrid(filtered, uid);
  const lbl = $('prod-count-label');
  if (lbl) lbl.textContent = `${filtered.length} dari ${allProductsCache.length} produk`;
};

// FIX: debounce 300ms
const _debouncedFilter = debounce(window.filterProducts, 300);
window.debouncedFilter = _debouncedFilter;

// Product list delegation
productsList.addEventListener('click', async e => {
  const btn = e.target.closest('[data-id]');
  if (!btn) return;
  const id  = btn.dataset.id;
  const uid = auth.currentUser?.uid;
  if (!id || !uid) return;

  if (btn.classList.contains('btn-ed')) {
    try {
      const snap = await getDoc(produkDoc(uid, id));
      if (!snap.exists()) { showToast('Produk tidak ditemukan', 'error'); return; }
      const p = snap.data();
      $('inp-prod-id').value         = id;
      $('inp-prod-name').value        = p.nama       || '';
      $('inp-prod-price').value       = p.harga      || 0;
      $('inp-prod-stock').value       = p.stok       || 0;
      $('inp-prod-weight').value      = p.berat      || 0;
      $('inp-prod-desc').value        = p.deskripsi  || '';
      $('inp-prod-shopee').value      = p.shopee     || '';
      $('inp-prod-wa').value          = p.wa         || '';
      $('inp-prod-img').value         = p.img        || '';
      $('inp-prod-kategori').value    = p.kategori   || '';
      $('inp-prod-harga-asli').value  = p.hargaAsli  || '';
      $('inp-prod-unggulan').checked  = !!p.unggulan;
      $('inp-prod-file').value        = '';
      if (prodBlobUrl) { URL.revokeObjectURL(prodBlobUrl); prodBlobUrl = null; }
      if (p.img) {
        $('img-preview').src = p.img;
        $('img-preview-wrap').style.display = 'block';
      } else {
        $('img-preview-wrap').style.display = 'none';
      }
      $('modal-title').textContent = 'Edit Produk';
      openModal();
    } catch (err) { showToast('Gagal load: ' + err.message, 'error'); }
  }

  if (btn.classList.contains('btn-del')) {
    if (!confirm('Yakin hapus produk "' + (allProductsCache.find(p => p.id === id)?.nama || 'ini') + '"?')) return;
    try {
      await deleteDoc(produkDoc(uid, id));
      showToast('Produk dihapus.');
      clearPublicCache(uid);
      await loadProducts(uid);
      await loadDashboardStats(uid);
    } catch (err) { showToast('Gagal hapus: ' + err.message, 'error'); }
  }
});

// ── MODAL ──────────────────────────────────────────────────────────────────
const productModal = $('product-modal');
function openModal()  { productModal.classList.add('open');    document.body.style.overflow = 'hidden'; }
function closeModal() { productModal.classList.remove('open'); document.body.style.overflow = ''; }

$('btn-add-product').addEventListener('click', () => {
  $('product-form').reset();
  $('inp-prod-id').value         = '';
  $('inp-prod-img').value        = '';
  $('inp-prod-file').value       = '';
  $('inp-prod-kategori').value   = '';
  $('inp-prod-harga-asli').value = '';
  $('inp-prod-unggulan').checked = false;
  if (prodBlobUrl) { URL.revokeObjectURL(prodBlobUrl); prodBlobUrl = null; }
  $('img-preview-wrap').style.display = 'none';
  $('img-preview').src = '';
  $('modal-title').textContent = 'Tambah Produk Baru';
  openModal();
});

$('modal-pull').addEventListener('click', closeModal);
productModal.addEventListener('click', e => { if (e.target === productModal) closeModal(); });

$('upload-zone').addEventListener('click', () => $('inp-prod-file').click());
$('inp-prod-file').addEventListener('change', () => {
  const file = $('inp-prod-file').files[0];
  if (!file) return;
  if (prodBlobUrl) URL.revokeObjectURL(prodBlobUrl);
  prodBlobUrl = URL.createObjectURL(file);
  $('img-preview').src = prodBlobUrl;
  $('img-preview-wrap').style.display = 'block';
});

// FIX: prevent double-submit with submitting flag
let _submitting = false;
$('product-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (_submitting) return;
  _submitting = true;

  const uid  = auth.currentUser?.uid;
  const id   = $('inp-prod-id').value;
  const file = $('inp-prod-file').files[0];
  let imgUrl = $('inp-prod-img').value;

  if (!file && !imgUrl) { showToast('Pilih foto produk!', 'warn'); _submitting = false; return; }

  const saveBtn = $('btn-save-product');
  saveBtn.disabled = true;
  try {
    if (file) {
      saveBtn.innerHTML = '<span class="spinner"></span> Upload foto...';
      imgUrl = await uploadCloudinary(file);
      if (!imgUrl) throw new Error('Upload foto gagal.');
    }
    saveBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';

    const stok = Number($('inp-prod-stock').value);
    const rawData = {
      nama:      $('inp-prod-name').value.trim(),
      harga:     Number($('inp-prod-price').value),
      stok,
      berat:     Number($('inp-prod-weight').value) || 0,
      deskripsi: $('inp-prod-desc').value.trim(),
      shopee:    $('inp-prod-shopee').value.trim(),
      wa:        $('inp-prod-wa').value.trim(),
      img:       imgUrl,
      kategori:  $('inp-prod-kategori').value,
      hargaAsli: Number($('inp-prod-harga-asli').value) || 0,
      unggulan:  $('inp-prod-unggulan').checked,
    };

    validateProduct(rawData);

    const data = { ...rawData, updatedAt: serverTimestamp() };

    if (id) {
      await updateDoc(produkDoc(uid, id), data);
      showToast('Produk diperbarui!');
    } else {
      data.createdAt = serverTimestamp();
      data.stokAwal  = stok;
      await addDoc(produkCol(uid), data);
      showToast('Produk ditambahkan!');
    }

    // FIX: clear public cache so visitor sees fresh data
    clearPublicCache(uid);
    closeModal();
    await loadProducts(uid);
    await loadDashboardStats(uid);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    _submitting = false;
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Simpan Produk';
  }
});

// ── VALIDATION ─────────────────────────────────────────────────────────────
function validateProduct(data) {
  if (!data.nama || typeof data.nama !== 'string' || data.nama.trim().length === 0)
    throw new Error('Nama produk tidak boleh kosong');
  if (data.nama.length > 100) throw new Error('Nama produk maksimal 100 karakter');
  if (isNaN(data.harga) || data.harga < 0) throw new Error('Harga harus berupa angka positif');
  if (data.harga > 100000000) throw new Error('Harga terlalu tinggi');
  if (isNaN(data.stok) || data.stok < 0) throw new Error('Stok harus berupa angka positif');
  if (data.deskripsi && data.deskripsi.length > 500) throw new Error('Deskripsi maksimal 500 karakter');
  if (data.shopee && !/^https?:\/\/.+/.test(data.shopee)) throw new Error('Link Shopee harus valid (dimulai dengan http/https)');
  if (data.wa && !/^https?:\/\/.+/.test(data.wa)) throw new Error('Link WhatsApp harus valid');
  if (!data.img || typeof data.img !== 'string') throw new Error('Foto produk wajib diupload');
  if (!/^https?:\/\//i.test(data.img)) throw new Error('URL foto tidak valid');
  return true;
}

// ── SETTINGS ───────────────────────────────────────────────────────────────
// FIX: use pre-loaded currentTokoData, only re-fetch if null
async function _initSettings(uid) {
  try {
    // currentTokoData already set by onAuthStateChanged
    const s = currentTokoData;
    if (!s) return;

    $('inp-username').value  = s.namaToko  || '';
    $('inp-bio').value       = s.bio       || '';
    $('inp-wa').value        = s.wa        || '';
    $('inp-shopee').value    = s.shopee    || '';
    $('inp-tokopedia').value = s.tokopedia || '';
    $('inp-instagram').value = s.instagram || '';
    $('inp-tiktok').value    = s.tiktok    || '';
    $('inp-twitter').value   = s.twitter   || '';
    $('inp-facebook').value  = s.facebook  || '';
    $('inp-youtube').value   = s.youtube   || '';
    $('inp-logo-url').value  = s.logo      || '';
    if (s.logo) $('logo-preview').src = s.logo;

    updatePremiumUI();
    await loadTodayVisits(uid);
  } catch (e) { console.error('_initSettings:', e); }
}

async function loadSettings(uid) {
  try {
    const snap = await getDoc(doc(db, 'toko', uid));
    if (!snap.exists()) return;
    currentTokoData = snap.data();
    await _initSettings(uid);
  } catch (e) { console.error('loadSettings:', e); }
}

$('btn-logo-pick').addEventListener('click', () => $('inp-logo-file').click());
$('inp-logo-file').addEventListener('change', () => {
  const file = $('inp-logo-file').files[0];
  if (!file) return;
  if (logoBlobUrl) URL.revokeObjectURL(logoBlobUrl);
  logoBlobUrl = URL.createObjectURL(file);
  $('logo-preview').src = logoBlobUrl;
});

// FIX: prevent double-submit
let _savingSettings = false;
$('btn-save-settings').addEventListener('click', async () => {
  if (_savingSettings) return;
  _savingSettings = true;
  const uid = auth.currentUser?.uid;
  const btn = $('btn-save-settings');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    let logoUrl = $('inp-logo-url').value;
    const file  = $('inp-logo-file').files[0];
    if (file) {
      logoUrl = await uploadCloudinary(file);
      if (!logoUrl) throw new Error('Upload logo gagal.');
      $('inp-logo-url').value = logoUrl;
    }
    await setDoc(doc(db, 'toko', uid), {
      namaToko:  $('inp-username').value.trim(),
      bio:       $('inp-bio').value.trim(),
      wa:        $('inp-wa').value.trim(),
      shopee:    $('inp-shopee').value.trim(),
      tokopedia: $('inp-tokopedia').value.trim(),
      instagram: $('inp-instagram').value.trim(),
      tiktok:    $('inp-tiktok').value.trim(),
      twitter:   $('inp-twitter').value.trim(),
      facebook:  $('inp-facebook').value.trim(),
      youtube:   $('inp-youtube').value.trim(),
      logo:      logoUrl,
    }, { merge: true });
    // FIX: clear public cache so visitor sees updated settings
    clearPublicCache(uid);
    showToast('Pengaturan disimpan!');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
  finally {
    _savingSettings = false;
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Pengaturan`;
  }
});

// ── AKUN ───────────────────────────────────────────────────────────────────
let _savingAccount = false;
$('btn-save-account').addEventListener('click', async () => {
  if (_savingAccount) return;
  const newEmail = $('inp-new-email').value.trim();
  const newPass  = $('inp-new-pass').value;
  const oldPass  = $('inp-old-pass').value;
  const user     = auth.currentUser;

  if (!oldPass) { showToast('Masukkan password lama!', 'warn'); return; }
  if (newEmail === user.email && !newPass) { showToast('Tidak ada perubahan.', 'warn'); return; }

  _savingAccount = true;
  const btn = $('btn-save-account');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memverifikasi...';
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, oldPass));
    if (newEmail !== user.email) {
      if (!newEmail.includes('@')) throw new Error('Format email tidak valid!');
      await updateEmail(user, newEmail);
    }
    if (newPass) {
      if (newPass.length < 6) throw new Error('Password minimal 6 karakter!');
      await updatePassword(user, newPass);
    }
    showToast('Akun diperbarui! Keluar otomatis...');
    setTimeout(() => signOut(auth), 1800);
  } catch (err) {
    const msg = err.code === 'auth/wrong-password' ? 'Password lama salah!' : err.message;
    showToast(msg, 'error');
  } finally {
    _savingAccount = false;
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Perbarui Akun`;
  }
});

// ── PLAN UI ──────────────────────────────────────────────────────────────────
function updatePremiumUI() {
  const plan    = checkPlan(currentTokoData);
  const isPrem  = plan === 'premium';
  const isBasic = plan === 'basic' || plan === 'premium';

  const planBadgeEl = $('current-plan-badge');
  if (planBadgeEl) {
    if (plan === 'premium') {
      planBadgeEl.textContent = '⚡ Premium';
      planBadgeEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:rgba(255,107,53,0.15);border:1px solid rgba(255,107,53,0.3);color:#FF6B35;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;';
    } else if (plan === 'basic') {
      planBadgeEl.textContent = '● Basic';
      planBadgeEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#3B82F6;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;';
    } else {
      planBadgeEl.textContent = 'Gratis';
      planBadgeEl.style.cssText = 'display:inline-flex;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#9CA3AF;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;';
    }
  }

  $('premium-cta')?.classList.toggle('hidden', isBasic);
  // FIX: Show premium-content for both basic and premium (gallery visible to basic)
  $('premium-content')?.classList.toggle('hidden', !isBasic);

  const planInfoEl = $('plan-info-section');
  if (planInfoEl) planInfoEl.classList.toggle('hidden', !isBasic);

  // Show/hide premium-only sections inside premium-content
  const premOnlySections = document.querySelectorAll('.prem-only');
  premOnlySections.forEach(el => el.classList.toggle('hidden', !isPrem));

  const planEndDate = currentTokoData.planEndDate || currentTokoData.premium?.endDate;
  if (planEndDate) {
    const end   = planEndDate?.toDate ? planEndDate.toDate() : new Date(planEndDate);
    const label = end.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const exEl  = $('premium-expiry');
    if (exEl) exEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Paket ${plan === 'premium' ? 'Premium' : 'Basic'} aktif sampai <strong>${label}</strong>`;
  }

  // FIX: Update badge text based on plan
  const badgeEl = $('premium-badge');
  if (badgeEl) {
    if (isPrem) {
      badgeEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Akun Premium Aktif';
      badgeEl.style.cssText = 'background:rgba(255,107,53,0.12);border:1px solid rgba(255,107,53,0.25);color:#FF6B35;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;padding:8px 16px;border-radius:10px;margin-bottom:20px;';
    } else if (isBasic) {
      badgeEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg> Akun Basic Aktif';
      badgeEl.style.cssText = 'background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#3B82F6;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;padding:8px 16px;border-radius:10px;margin-bottom:20px;';
    }
  }

  if (isBasic) renderGalleryEditor();

  if (isPrem) {
    currentAccent = currentTokoData.premium?.accentColor || '#FF6B35';
    const slugEl  = $('inp-custom-slug');
    if (slugEl) slugEl.value = currentTokoData.premium?.slug || auth.currentUser?.uid || '';
    renderColorPicker();
    renderQR();
    renderPremiumTemplatePicker();
    initBackgroundStudio();   // FIX: replaced renderTemplatePicker with full studio
    renderCustomButtonEditor();
  }
}

// ── PREMIUM: STATS ─────────────────────────────────────────────────────────
async function loadStats(uid) {
  // FIX: race-condition guard — currentTokoData now set before this is called
  const isPrem = checkPlan(currentTokoData) === 'premium';
  if (!isPrem) return;

  try {
    const today = new Date();
    const days  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });

    const q    = query(collection(db, 'toko', uid, 'stats'), where('__name__', '>=', days[0]), where('__name__', '<=', days[6]), orderBy('__name__'));
    const snap = await getDocs(q);
    const data = {};
    snap.forEach(d => { data[d.id] = d.data(); });

    let tV = 0, tW = 0, tS = 0;
    const chartData = days.map(day => {
      const d = data[day] || {};
      tV += d.visits || 0; tW += d.waClicks || 0; tS += d.shopeeClicks || 0;
      return { label: formatDate(day), visits: d.visits || 0 };
    });

    $('stat-visits').textContent = tV;
    $('stat-wa').textContent     = tW;
    $('stat-shopee').textContent = tS;
    $('stat-visits-dash').textContent = data[today.toISOString().slice(0, 10)]?.visits || 0;

    const chartEl = $('stats-chart');
    if (!chartEl) return;
    const max  = Math.max(...chartData.map(d => d.visits), 1);
    // FIX: use DocumentFragment for chart rendering
    const frag = document.createDocumentFragment();
    chartData.forEach(d => {
      const h   = Math.max(Math.round((d.visits / max) * 100), 3);
      const col = document.createElement('div');
      col.className = 'chart-col';
      col.innerHTML = `<div class="chart-val">${d.visits || ''}</div><div class="chart-bar" style="height:${h}%"></div><div class="chart-label">${d.label}</div>`;
      frag.appendChild(col);
    });
    chartEl.innerHTML = '';
    chartEl.appendChild(frag);
  } catch (e) { console.error('loadStats:', e); }
}

// ── PREMIUM: COLOR PICKER ──────────────────────────────────────────────────
let _colorPickerDelegated = false;
function renderColorPicker() {
  const wrap = $('color-options');
  if (!wrap) return;
  // Re-render HTML (safe — static data only)
  wrap.innerHTML = ACCENT_COLORS.map(clr =>
    `<button type="button" class="color-circle${clr.hex === currentAccent ? ' active' : ''}" data-color="${clr.hex}" style="background:${clr.hex}" title="${clr.label}" aria-label="Warna ${clr.label}"></button>`
  ).join('');
  // Delegate on static container — attach ONCE
  if (!_colorPickerDelegated) {
    _colorPickerDelegated = true;
    wrap.addEventListener('click', async e => {
      const btn   = e.target.closest('.color-circle');
      if (!btn) return;
      const color = btn.dataset.color;
      wrap.querySelectorAll('.color-circle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAccent = color;
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'toko', uid), { 'premium.accentColor': color });
        clearPublicCache(uid);
        showToast('Warna aksen diperbarui!');
      } catch { showToast('Gagal simpan warna', 'error'); }
    });
  }
}

// ── PREMIUM: QR CODE ───────────────────────────────────────────────────────
function renderQR() {
  const uid = auth.currentUser?.uid;
  const img = $('qr-img');
  if (!uid || !img) return;
  const url = `${window.location.origin}${BASE_PATH}/?uid=${uid}`;
  const hex = encodeURIComponent(currentAccent.replace('#', ''));
  img.src         = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}&color=${hex}`;
  img.dataset.url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(url)}&color=${hex}&format=png`;
}

$('btn-download-qr')?.addEventListener('click', async () => {
  const url = $('qr-img')?.dataset.url;
  if (!url) return;
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${currentTokoData?.namaToko || 'toko'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToast('QR Code didownload!');
  } catch { window.open($('qr-img').dataset.url, '_blank'); }
});

// ── BACKGROUND STUDIO ──────────────────────────────────────────────────────
// FIX: guard to prevent duplicate listener registration on re-render
let _bgStudioInited = false;
let _pendingBgUrl   = null;
let _pendingBgType  = null;
let _savingBgNow    = false;

function initBackgroundStudio() {
  // FIX: only attach listeners once, re-render visuals only
  if (!_bgStudioInited) {
    _bgStudioInited = true;

    // Tab clicks — single delegation on parent
    const tabBar = document.querySelector('[data-bgtab]')?.parentElement;
    if (tabBar) {
      tabBar.addEventListener('click', e => {
        const tab = e.target.closest('[data-bgtab]');
        if (tab) switchBgTab(tab.dataset.bgtab);
      });
    }

    // Upload zone
    const zone    = $('bg-upload-zone');
    const fileInp = $('inp-bg-file');
    if (zone && fileInp) {
      zone.addEventListener('click', () => fileInp.click());
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.style.borderColor = 'var(--accent)';
        zone.style.background  = 'rgba(255,107,53,0.05)';
      });
      zone.addEventListener('dragleave', () => {
        zone.style.borderColor = '';
        zone.style.background  = '';
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = '';
        zone.style.background  = '';
        const file = e.dataTransfer.files[0];
        if (file) handleBgUpload(file);
      });
      fileInp.addEventListener('change', () => {
        const file = fileInp.files[0];
        if (file) handleBgUpload(file);
        fileInp.value = '';
      });
    }

    // Remove bg button
    $('btn-remove-bg')?.addEventListener('click', () => {
      setBgPreview('', 'none', 'Polos (tanpa background)');
    });

    // Save button
    $('btn-save-bg')?.addEventListener('click', saveBgSelection);
  }

  // Always re-render visuals (preset cards, preview state)
  renderPresetCards();
  const curBg = currentTokoData?.premium?.templateBg || '';
  updateLivePreview(curBg);
  updateBgSelectedInfo(curBg ? 'Background terpasang' : 'Belum ada background', false);

  // Always show preset tab on init (explicit, not relying on HTML/CSS state)
  switchBgTab('preset');

  // Reset pending state on re-init
  _pendingBgUrl  = null;
  _pendingBgType = null;
}

// FIX: use explicit display values, not empty string
function switchBgTab(tabId) {
  document.querySelectorAll('.bg-tab[data-bgtab]').forEach(t => {
    const active = t.dataset.bgtab === tabId;
    t.style.color        = active ? 'var(--text)' : 'var(--text-3)';
    t.style.borderBottom = active ? '2px solid var(--accent)' : '2px solid transparent';
    t.classList.toggle('active', active);
  });
  document.querySelectorAll('.bg-tab-panel').forEach(p => {
    p.style.display = 'none';
  });
  const panel = $('bgtab-' + tabId);
  if (panel) panel.style.display = 'block';

  if (tabId === 'gallery') renderBgGalleryPicker();
}

function renderPresetCards() {
  const wrap = $('template-options');
  if (!wrap) return;
  const curBg = currentTokoData?.premium?.templateBg || '';

  const frag = document.createDocumentFragment();
  TEMPLATE_LIST.forEach(t => {
    const isActive = t.bg ? (t.bg === curBg) : (!curBg && t.id === 'default');
    const card = document.createElement('div');
    card.className = 'tpl-card' + (isActive ? ' active' : '');
    card.dataset.bg    = t.bg || '';
    card.dataset.label = t.label;
    card.style.cssText = `cursor:pointer;border-radius:10px;overflow:hidden;border:2px solid ${isActive ? 'var(--accent)' : 'var(--border)'};transition:border-color 0.18s,transform 0.18s;`;
    card.innerHTML = `
      <div style="position:relative;height:72px;overflow:hidden;background:${t.bg ? 'transparent' : t.preview};">
        ${t.bg ? `<img src="${encodeURI(t.bg)}" alt="${escHtml(t.label)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'">` : ''}
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.38);"></div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
          <div style="width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,0.3);border:1.5px solid rgba(255,255,255,0.6);"></div>
          <div style="height:3px;width:36px;background:${t.accent};border-radius:3px;opacity:0.9;"></div>
          <div style="height:3px;width:24px;background:rgba(255,255,255,0.25);border-radius:3px;"></div>
        </div>
        ${isActive ? '<div style="position:absolute;top:4px;right:4px;background:var(--accent);color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;letter-spacing:0.5px;">AKTIF</div>' : ''}
      </div>
      <div style="padding:6px 8px 8px;">
        <div style="font-size:11px;font-weight:700;color:var(--text);line-height:1.2;">${escHtml(t.label)}</div>
        <div style="font-size:10px;color:var(--text-3);margin-top:1px;">${escHtml(t.desc)}</div>
      </div>`;
    card.addEventListener('click', () => {
      setBgPreview(t.bg || '', 'preset', t.label);
      wrap.querySelectorAll('.tpl-card').forEach(c => {
        c.style.borderColor = 'var(--border)';
        c.classList.remove('active');
      });
      card.style.borderColor = 'var(--accent)';
      card.classList.add('active');
    });
    frag.appendChild(card);
  });
  wrap.innerHTML = '';
  wrap.appendChild(frag);
}

function renderBgGalleryPicker() {
  const wrap = $('bg-from-gallery');
  if (!wrap) return;
  const gallery = currentTokoData?.gallery || [];
  const photos  = gallery
    .map(p => (typeof p === 'string' ? { url: p } : p))
    .filter(p => p?.url && /^https?:\/\//.test(p.url));

  if (!photos.length) {
    wrap.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:12px;color:var(--text-3);">Belum ada foto di Gallery.<br>Tambahkan dulu di bagian Gallery Foto di bawah.</div>';
    return;
  }

  const curBg = currentTokoData?.premium?.templateBg || '';
  const frag  = document.createDocumentFragment();
  photos.forEach((p, i) => {
    const url      = p.url;
    const isActive = url === curBg;
    const card = document.createElement('div');
    card.className    = 'gal-bg-pick';
    card.dataset.url  = url;
    card.style.cssText = `aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;border:2px solid ${isActive ? 'var(--accent)' : 'transparent'};transition:border-color 0.18s;position:relative;`;
    card.innerHTML = `
      <img src="${escHtml(url)}" alt="Gallery ${i+1}" loading="lazy" decoding="async"
        style="width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.3s;"
        onerror="this.onerror=null;this.src='https://placehold.co/200x200/111/333?text=Error'">
      ${isActive ? '<div style="position:absolute;top:4px;right:4px;background:var(--accent);color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;">AKTIF</div>' : ''}`;
    card.addEventListener('click', () => {
      setBgPreview(url, 'gallery', 'Dari Gallery');
      wrap.querySelectorAll('.gal-bg-pick').forEach(c => {
        c.style.borderColor = 'transparent';
        c.classList.remove('active');
      });
      card.style.borderColor = 'var(--accent)';
      card.classList.add('active');
    });
    frag.appendChild(card);
  });
  wrap.innerHTML = '';
  wrap.appendChild(frag);
}

async function handleBgUpload(file) {
  if (file.size > 5 * 1024 * 1024) { showToast('Ukuran foto maks 5MB', 'warn'); return; }
  const status = $('bg-upload-status');
  const zone   = $('bg-upload-zone');
  if (status) status.innerHTML = '<span style="color:var(--accent);">⏳ Mengupload foto...</span>';
  if (zone)   zone.style.opacity = '0.6';
  try {
    const url = await uploadCloudinary(file);
    if (!url) throw new Error('Upload gagal');
    setBgPreview(url, 'upload', 'Foto Upload');
    if (status) status.innerHTML = '<span style="color:#10B981;">✓ Upload berhasil! Klik Simpan Background.</span>';
  } catch (e) {
    if (status) { status.textContent = '✗ ' + (e.message || 'Upload gagal'); status.style.color = 'var(--danger)'; }
  } finally {
    if (zone) zone.style.opacity = '';
  }
}

function setBgPreview(url, type, label) {
  _pendingBgUrl  = url;
  _pendingBgType = type;
  updateLivePreview(url);
  updateBgSelectedInfo(label, true);
}

function updateLivePreview(url) {
  const img = $('bg-preview-img');
  if (!img) return;
  if (url) {
    img.style.backgroundImage = `url('${encodeURI(url)}')`;
    img.style.opacity         = '1';
  } else {
    img.style.backgroundImage = 'none';
    img.style.opacity         = '0';
  }
}

function updateBgSelectedInfo(label, canSave) {
  const info = $('bg-selected-info');
  const btn  = $('btn-save-bg');
  if (info) info.textContent = label ? `Dipilih: ${label}` : 'Belum ada pilihan';
  if (btn)  btn.disabled = !canSave;
}

async function saveBgSelection() {
  if (_savingBgNow) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  _savingBgNow = true;
  const btn = $('btn-save-bg');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan...'; }
  try {
    const bgUrl = _pendingBgType === 'none' ? '' : (_pendingBgUrl || '');
    await updateDoc(doc(db, 'toko', uid), { 'premium.templateBg': bgUrl });
    if (!currentTokoData.premium) currentTokoData.premium = {};
    currentTokoData.premium.templateBg = bgUrl;
    clearPublicCache(uid);
    _pendingBgUrl  = null;
    _pendingBgType = null;
    updateBgSelectedInfo(bgUrl ? '✓ Background disimpan' : '✓ Background dihapus', false);
    renderPresetCards();
    updateLivePreview(bgUrl);
    showToast(bgUrl ? 'Background berhasil disimpan!' : 'Background dihapus!');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message, 'error');
  } finally {
    _savingBgNow = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Simpan Background';
    }
  }
}

// alias for legacy calls
function renderTemplatePicker() { renderPresetCards(); }



// ── PREMIUM: TEMPLATE THEMES ──────────────────────────────────────────────
function renderPremiumTemplatePicker() {
  const wrap = $('premium-template-options');
  if (!wrap) return;

  const currentTemplate = currentTokoData?.premium?.templateTheme || 'fashion';
  const templates = getAllTemplates();

  wrap.innerHTML = templates.map(template => {
    const preview  = getThemePreviewData(template.id);
    const isActive = template.id === currentTemplate;
    return `
      <div class="premium-template-card${isActive ? ' active' : ''}" data-template="${template.id}" role="button" tabindex="0" aria-pressed="${isActive}">
        <div class="premium-template-preview" style="background: linear-gradient(135deg, ${preview.colors.primary} 0%, ${preview.colors.secondary} 100%);">
          ${template.icon}
        </div>
        <div class="premium-template-content">
          <div class="premium-template-title">${escHtml(template.name)}</div>
          <div class="premium-template-category">${escHtml(template.category)}</div>
          <div class="premium-template-desc">${escHtml(template.description)}</div>
          <div class="premium-template-features">
            ${template.features.map(f => `<span class="premium-template-tag">${escHtml(f)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  // Event delegation — attached ONCE on static container, survives re-render
  if (!_premTplDelegated) {
    _premTplDelegated = true;
    wrap.addEventListener('click', async e => {
      const card = e.target.closest('.premium-template-card');
      if (!card) return;
      const templateId = card.dataset.template;
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      card.style.opacity = '0.6';
      card.style.pointerEvents = 'none';
      try {
        await updateDoc(doc(db, 'toko', uid), { 'premium.templateTheme': templateId });
        if (!currentTokoData.premium) currentTokoData.premium = {};
        currentTokoData.premium.templateTheme = templateId;
        wrap.querySelectorAll('.premium-template-card').forEach(el => {
          el.classList.remove('active');
          el.style.opacity = '';
          el.style.pointerEvents = '';
        });
        card.classList.add('active');
        clearPublicCache(uid);
        showToast('Template diaktifkan! ✓', 'success');
      } catch (err) {
        showToast('Gagal menyimpan template', 'error');
        card.style.opacity = '';
        card.style.pointerEvents = '';
      }
    });
  }
}

// ── PREMIUM: CUSTOM BUTTONS ────────────────────────────────────────────────
const BTN_COLORS = ['#FF6B35','#EE4D2D','#25D366','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#111111','#06B6D4','#10B981'];

function renderCustomButtonEditor() {
  customBtns = Array.isArray(currentTokoData?.customButtons) ? [...currentTokoData.customButtons] : [];
  renderCustomBtnList();
}

function renderCustomBtnList() {
  const list = $('custom-btn-list');
  if (!list) return;
  if (!customBtns.length) {
    list.innerHTML = '<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-3);">Belum ada tombol. Klik "+ Tambah Tombol".</div>';
    return;
  }
  list.innerHTML = customBtns.map((btn, i) => {
    const clr = btn.color || '#3B82F6';
    return `<div class="custom-btn-item" data-idx="${i}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="color-swatch-btn" data-idx="${i}" title="Ganti warna" style="width:28px;height:28px;border-radius:6px;background:${escHtml(clr)};cursor:pointer;flex-shrink:0;border:2px solid rgba(255,255,255,0.15);transition:transform .15s;" onclick="cycleColor(${i})"></div>
        <input type="text" placeholder="Label (cth: GoFood)" value="${escHtml(btn.label || '')}" data-field="label" data-idx="${i}" style="flex:1;background:var(--input-bg,rgba(255,255,255,0.06));border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);min-width:0;">
        <button type="button" class="cb-remove" data-idx="${i}" aria-label="Hapus" style="background:rgba(239,68,68,.12);border:none;border-radius:6px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#EF4444;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <input type="text" placeholder="https://link.com" value="${escHtml(btn.url || '')}" data-field="url" data-idx="${i}" style="width:100%;background:var(--input-bg,rgba(255,255,255,0.06));border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);">
      <input type="text" placeholder="Deskripsi singkat (opsional)" value="${escHtml(btn.desc || '')}" data-field="desc" data-idx="${i}" style="width:100%;background:var(--input-bg,rgba(255,255,255,0.06));border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;color:var(--text);opacity:.85;">
    </div>`;
  }).join('');

  list.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx   = parseInt(inp.dataset.idx);
      const field = inp.dataset.field;
      if (!customBtns[idx]) customBtns[idx] = { label: '', url: '', color: '#3B82F6', desc: '' };
      customBtns[idx][field] = inp.value;
    });
  });
  list.querySelectorAll('.cb-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      customBtns.splice(parseInt(btn.dataset.idx), 1);
      renderCustomBtnList();
    });
  });
}

window.cycleColor = function(idx) {
  if (!customBtns[idx]) return;
  const cur = customBtns[idx].color || BTN_COLORS[0];
  const pos = BTN_COLORS.indexOf(cur);
  customBtns[idx].color = BTN_COLORS[(pos + 1) % BTN_COLORS.length];
  renderCustomBtnList();
};

$('btn-add-custom-btn')?.addEventListener('click', () => {
  if (customBtns.length >= 10) { showToast('Maksimal 10 tombol kustom.', 'warn'); return; }
  customBtns.push({ label: '', url: '', color: BTN_COLORS[customBtns.length % BTN_COLORS.length], desc: '' });
  renderCustomBtnList();
  const inputs = $('custom-btn-list').querySelectorAll('input[data-field="label"]');
  inputs[inputs.length - 1]?.focus();
});

let _savingCustomBtns = false;
$('btn-save-custom-btns')?.addEventListener('click', async () => {
  if (_savingCustomBtns) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const cleaned = customBtns.filter(b => b.label?.trim() && b.url?.trim());
  const btn = $('btn-save-custom-btns');
  _savingCustomBtns = true;
  btn.disabled = true;
  try {
    await updateDoc(doc(db, 'toko', uid), { customButtons: cleaned });
    clearPublicCache(uid);
    showToast(`${cleaned.length} tombol kustom disimpan!`);
    currentTokoData.customButtons = cleaned;
  } catch (e) { showToast('Gagal simpan: ' + e.message, 'error'); }
  finally { _savingCustomBtns = false; btn.disabled = false; }
});

// ── PREMIUM: GALLERY ───────────────────────────────────────────────────────
function normalizeGalleryItem(item) {
  if (typeof item === 'string') return { url: item, caption: '', kategori: '' };
  return { url: item?.url || '', caption: item?.caption || '', kategori: item?.kategori || '' };
}

function getGalleryKategoriList() {
  const cats = new Set(galleryPhotos.map(p => p.kategori).filter(Boolean));
  return [...cats];
}

function renderGalleryEditor() {
  galleryPhotos = (Array.isArray(currentTokoData?.gallery) ? currentTokoData.gallery : [])
    .map(normalizeGalleryItem).filter(p => p.url);
  renderGalleryGrid();
}

function renderGalleryGrid() {
  const grid = $('gallery-grid');
  if (!grid) return;
  if (!galleryPhotos.length) {
    grid.innerHTML = '<div style="grid-column:span 1;padding:20px;text-align:center;font-size:12px;color:var(--text-3);">Belum ada foto gallery. Klik "+ Tambah Foto".</div>';
    return;
  }

  const cats = getGalleryKategoriList();
  const datalistId = 'gal-kat-list';

  grid.innerHTML = `
    <datalist id="${datalistId}">${cats.map(c => `<option value="${escHtml(c)}">`).join('')}</datalist>
    ${galleryPhotos.map((p, i) => `
    <div class="gal-edit-card" data-idx="${i}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">
      <div style="position:relative;aspect-ratio:1;overflow:hidden;background:rgba(0,0,0,.3);flex-shrink:0;">
        <img src="${escHtml(p.url)}" alt="Gallery ${i + 1}" style="width:100%;height:100%;object-fit:cover;"
             loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src='https://placehold.co/200x200/111/333?text=Error'">
        <button type="button" onclick="removeGalleryPhoto(${i})"
          style="position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.75);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;z-index:2;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div style="padding:8px 8px 10px;display:flex;flex-direction:column;gap:5px;">
        <input type="text" placeholder="Kategori (cth: Interior)" value="${escHtml(p.kategori)}"
          data-field="kategori" data-idx="${i}" list="${datalistId}"
          style="width:100%;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:7px;padding:6px 8px;font-size:11.5px;color:var(--text);outline:none;">
        <input type="text" placeholder="Caption foto..." value="${escHtml(p.caption)}"
          data-field="caption" data-idx="${i}"
          style="width:100%;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:7px;padding:6px 8px;font-size:11.5px;color:var(--text);outline:none;">
      </div>
    </div>`).join('')}`;

  grid.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx   = parseInt(inp.dataset.idx);
      const field = inp.dataset.field;
      if (galleryPhotos[idx]) galleryPhotos[idx][field] = inp.value;
    });
  });
}

window.removeGalleryPhoto = function(idx) {
  galleryPhotos.splice(idx, 1);
  renderGalleryGrid();
};

$('btn-add-gallery')?.addEventListener('click', () => {
  if (galleryPhotos.length >= 12) { showToast('Maksimal 12 foto gallery.', 'warn'); return; }
  $('inp-gallery-file').click();
});

$('inp-gallery-file')?.addEventListener('change', async () => {
  const files = Array.from($('inp-gallery-file').files);
  if (!files.length) return;
  const remaining = 12 - galleryPhotos.length;
  const toUpload  = files.slice(0, remaining);
  if (files.length > remaining) showToast(`Hanya ${remaining} foto lagi yang bisa ditambah (maks. 12).`, 'warn');

  const statusEl = $('gallery-upload-status');
  const addBtn   = $('btn-add-gallery');
  if (addBtn) addBtn.disabled = true;
  if (statusEl) statusEl.textContent = `Mengupload 0/${toUpload.length}...`;

  let uploaded = 0;
  for (const file of toUpload) {
    const url = await uploadCloudinary(file);
    if (url) { galleryPhotos.push({ url, caption: '', kategori: '' }); uploaded++; }
    if (statusEl) statusEl.textContent = `Mengupload ${uploaded}/${toUpload.length}...`;
  }
  renderGalleryGrid();
  if (statusEl) statusEl.textContent = uploaded ? `${uploaded} foto diupload. Isi caption/kategori lalu Simpan.` : 'Upload gagal.';
  if (addBtn) addBtn.disabled = false;
  $('inp-gallery-file').value = '';
});

let _savingGallery = false;
$('btn-save-gallery')?.addEventListener('click', async () => {
  if (_savingGallery) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const btn = $('btn-save-gallery');
  _savingGallery = true;
  btn.disabled = true;
  try {
    $('gallery-grid')?.querySelectorAll('input[data-field]').forEach(inp => {
      const idx = parseInt(inp.dataset.idx);
      if (galleryPhotos[idx]) galleryPhotos[idx][inp.dataset.field] = inp.value;
    });
    const clean = galleryPhotos.filter(p => p.url);
    await updateDoc(doc(db, 'toko', uid), { gallery: clean });
    clearPublicCache(uid);
    showToast(`Gallery (${clean.length} foto) disimpan!`);
    currentTokoData.gallery = [...clean];
    if ($('gallery-upload-status')) $('gallery-upload-status').textContent = '';
  } catch (e) { showToast('Gagal simpan gallery: ' + e.message, 'error'); }
  finally { _savingGallery = false; btn.disabled = false; }
});

// ── CLOUDINARY ─────────────────────────────────────────────────────────────
async function uploadCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUD_PRESET);
  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    throw new Error(data.error?.message || 'Upload gagal');
  } catch (err) {
    showToast('Upload gagal: ' + err.message, 'error');
    return null;
  }
}

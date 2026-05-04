/**
 * LINKify — Admin Dashboard (admin.js)
 * Features: rich dashboard, product filter/search, custom buttons,
 *           low-stock alerts, top-products, advanced premium UI
 */

import { auth, db, CONFIG } from '../firebase.js';
import {
  onAuthStateChanged, signOut, updatePassword, updateEmail,
  EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDoc, query, orderBy, setDoc, where, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  escHtml, checkPremium, hexToRgb, ACCENT_COLORS, DAY_NAMES,
  formatDate, TEMPLATE_LIST
} from './utils.js';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const CLOUD_NAME   = CONFIG.cloudinary.cloudName;
const CLOUD_PRESET = CONFIG.cloudinary.uploadPreset;
const BASE_PATH    = window.location.hostname.includes('github.io') ? '/LINKify' : '';

// ── STATE ──────────────────────────────────────────────────────────────────
let currentTokoData = null;
let currentAccent   = '#FF6B35';
let allProductsCache = [];
let prodBlobUrl = null;
let logoBlobUrl = null;
let customBtns  = [];

// ── DOM ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const productsList = $('products-list');

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'ok') {
  const el = $('toast');
  el.textContent  = msg;
  el.style.background = type === 'ok' ? '#111' : type === 'err' ? '#EF4444' : '#D97706';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
window.showToast = toast;

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
const sidebar  = $('sidebar');
const overlay  = $('overlay');
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
  if (!uid) return toast('Login dulu!', 'err');
  const link = `${window.location.origin}${BASE_PATH}/?uid=${uid}`;
  navigator.clipboard.writeText(link)
    .then(() => toast('Link toko berhasil dicopy!'))
    .catch(() => toast('Gagal copy link', 'err'));
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
    toast('Akun ini belum terdaftar sebagai toko! Hubungi admin.', 'err');
    setTimeout(() => signOut(auth), 2000);
    return;
  }

  currentTokoData = tokoSnap.data();

  // Sidebar user block
  const emailEl = $('admin-email');
  const avatarEl = $('sidebar-avatar');
  if (emailEl)  emailEl.textContent  = user.email;
  if (avatarEl) avatarEl.textContent  = (user.email || 'U').charAt(0).toUpperCase();
  $('inp-new-email').value = user.email;

  await Promise.all([
    loadProducts(user.uid),
    loadSettings(user.uid),
    loadStats(user.uid),
    loadDashboardStats(user.uid),
  ]);
});

// ── HELPERS ────────────────────────────────────────────────────────────────
const produkCol = uid => collection(db, 'toko', uid, 'produk');
const produkDoc = (uid, id) => doc(db, 'toko', uid, 'produk', id);
const rupiah    = v => Number(v || 0).toLocaleString('id-ID');

// ── DASHBOARD STATS ────────────────────────────────────────────────────────
async function loadDashboardStats(uid) {
  try {
    const snap = await getDocs(produkCol(uid));
    let total = 0, emptyCount = 0;
    let omsetEstimasi = 0;
    const prodList = [];

    snap.forEach(d => {
      const p = d.data();
      total++;
      if (Number(p.stok) === 0) emptyCount++;
      const terjual = Math.max(0, (p.stokAwal || 0) - (p.stok || 0));
      const omset   = terjual * (p.harga || 0);
      omsetEstimasi += omset;
      prodList.push({ id: d.id, ...p, terjual, omset });
    });

    // Sort by stok for low-stock alerts (stok > 0 but low)
    const lowStock = prodList.filter(p => Number(p.stok) > 0 && Number(p.stok) <= 5).sort((a,b) => a.stok - b.stok);
    // Top by terjual
    const topProds = [...prodList].sort((a,b) => b.terjual - a.terjual).slice(0, 5);

    $('stat-total').textContent = total;
    $('stat-empty').textContent = emptyCount;
    $('stat-omset').textContent = 'Rp' + rupiah(omsetEstimasi);

    renderLowStockList(lowStock);
    renderTopProducts(topProds);
  } catch (e) { console.error('loadDashboardStats:', e); }
}

function renderLowStockList(items) {
  const el = $('low-stock-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div style="padding:18px;text-align:center;font-size:13px;color:var(--text-3);">Semua stok aman</div>';
    return;
  }
  el.innerHTML = items.map((p, i) => `
    <div class="activity-item" style="border-bottom:${i < items.length-1 ? '1px solid var(--border)' : 'none'}">
      <div class="activity-dot" style="background:${Number(p.stok) === 1 ? '#EF4444' : '#F59E0B'}"></div>
      <div class="activity-text">
        <strong>${escHtml(p.nama)}</strong> — Stok: <span style="color:${Number(p.stok)<=2?'var(--danger)':'var(--warning)'};font-weight:700">${Number(p.stok)}</span>
        ${p.kategori ? `<span style="color:var(--text-3);font-size:11px"> · ${escHtml(p.kategori)}</span>` : ''}
      </div>
      <div class="activity-time" style="color:${Number(p.stok)<=2?'var(--danger)':'var(--warning)'};font-weight:700">${Number(p.stok)} sisa</div>
    </div>`).join('');
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
  el.innerHTML = items.filter(p => p.terjual > 0).map((p, i) => `
    <div class="activity-item" style="flex-direction:column;align-items:stretch;gap:6px;padding:13px 16px;border-bottom:${i < items.length-1 ? '1px solid var(--border)' : 'none'}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(p.nama)}</span>
        <span style="font-size:12px;font-weight:700;color:var(--accent)">${p.terjual} terjual</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${Math.round(p.terjual/maxTerjual*100)}%"></div></div>
    </div>`).join('');
}

// ── VISIT STAT on dashboard (today) ───────────────────────────────────────
async function loadTodayVisits(uid) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const snap  = await getDoc(doc(db, 'toko', uid, 'stats', today));
    $('stat-visits-dash').textContent = snap.exists() ? (snap.data().visits || 0) : 0;
  } catch { $('stat-visits-dash').textContent = '—'; }
}

// ── PRODUCTS ───────────────────────────────────────────────────────────────
async function loadProducts(uid) {
  productsList.innerHTML = [1,2,3].map(() =>
    `<div class="skel-card"><div class="skel" style="height:130px;border-radius:12px 12px 0 0"></div><div style="padding:10px 12px"><div class="skel" style="height:12px;width:70%;margin-bottom:7px"></div><div class="skel" style="height:13px;width:45%"></div></div></div>`
  ).join('');

  try {
    const q    = query(produkCol(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allProductsCache = [];
    snap.forEach(ds => allProductsCache.push({ id: ds.id, ...ds.data() }));
    renderProductGrid(allProductsCache, uid);

    const lbl = $('prod-count-label');
    if (lbl) lbl.textContent = allProductsCache.length + ' produk terdaftar';
  } catch (e) {
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

  productsList.innerHTML = list.map(p => {
    const stokNol = Number(p.stok) === 0;
    return `<div class="p-card">
      <img class="p-img" src="${escHtml(p.img || '')}" alt="${escHtml(p.nama)}"
           onerror="this.src='https://placehold.co/400x300/F4F4F4/AAA?text=Foto'">
      <div class="p-body">
        <div class="p-name">${escHtml(p.nama)}${p.unggulan ? ' <span style="color:#F59E0B;font-size:11px;">★</span>' : ''}</div>
        <div class="p-price">Rp${rupiah(p.harga)}${p.hargaAsli > p.harga ? `<span style="text-decoration:line-through;color:var(--text-3);font-size:11px;font-weight:400;margin-left:5px">Rp${rupiah(p.hargaAsli)}</span>` : ''}</div>
        <div class="p-stock">Stok: ${Number(p.stok)}${stokNol ? ' · <span style="color:var(--danger);font-weight:600">Habis</span>' : ''}${p.kategori ? ` · ${escHtml(p.kategori)}` : ''}</div>
        <div class="p-acts">
          <button type="button" class="btn-ed" data-id="${p.id}">Edit</button>
          <button type="button" class="btn-del" data-id="${p.id}">Hapus</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Product search & filter
window.filterProducts = function() {
  const uid = auth.currentUser?.uid;
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
      if (!snap.exists()) { toast('Produk tidak ditemukan', 'err'); return; }
      const p = snap.data();
      $('inp-prod-id').value    = id;
      $('inp-prod-name').value  = p.nama       || '';
      $('inp-prod-price').value = p.harga      || 0;
      $('inp-prod-stock').value = p.stok       || 0;
      $('inp-prod-weight').value = p.berat     || 0;
      $('inp-prod-desc').value  = p.deskripsi  || '';
      $('inp-prod-shopee').value = p.shopee    || '';
      $('inp-prod-wa').value    = p.wa         || '';
      $('inp-prod-img').value   = p.img        || '';
      $('inp-prod-kategori').value  = p.kategori  || '';
      $('inp-prod-harga-asli').value = p.hargaAsli || '';
      $('inp-prod-unggulan').checked = !!p.unggulan;
      $('inp-prod-file').value = '';
      if (prodBlobUrl) { URL.revokeObjectURL(prodBlobUrl); prodBlobUrl = null; }
      if (p.img) {
        $('img-preview').src = p.img;
        $('img-preview-wrap').style.display = 'block';
      } else {
        $('img-preview-wrap').style.display = 'none';
      }
      $('modal-title').textContent = 'Edit Produk';
      openModal();
    } catch (err) { toast('Gagal load: ' + err.message, 'err'); }
  }

  if (btn.classList.contains('btn-del')) {
    if (!confirm('Yakin hapus produk "' + (allProductsCache.find(p=>p.id===id)?.nama||'ini') + '"?')) return;
    try {
      await deleteDoc(produkDoc(uid, id));
      toast('Produk dihapus.');
      await loadProducts(uid);
      await loadDashboardStats(uid);
    } catch (err) { toast('Gagal hapus: ' + err.message, 'err'); }
  }
});

// ── MODAL ──────────────────────────────────────────────────────────────────
const productModal = $('product-modal');
function openModal()  { productModal.classList.add('open');    document.body.style.overflow = 'hidden'; }
function closeModal() { productModal.classList.remove('open'); document.body.style.overflow = ''; }

$('btn-add-product').addEventListener('click', () => {
  $('product-form').reset();
  $('inp-prod-id').value  = '';
  $('inp-prod-img').value = '';
  $('inp-prod-file').value = '';
  $('inp-prod-kategori').value  = '';
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

$('product-form').addEventListener('submit', async e => {
  e.preventDefault();
  const uid  = auth.currentUser?.uid;
  const id   = $('inp-prod-id').value;
  const file = $('inp-prod-file').files[0];
  let imgUrl = $('inp-prod-img').value;

  if (!file && !imgUrl) { toast('Pilih foto produk!', 'warn'); return; }

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
    const data = {
      nama:       $('inp-prod-name').value.trim(),
      harga:      Number($('inp-prod-price').value),
      stok,
      stokAwal:   id ? undefined : stok, // only set on create
      berat:      Number($('inp-prod-weight').value) || 0,
      deskripsi:  $('inp-prod-desc').value.trim(),
      shopee:     $('inp-prod-shopee').value.trim(),
      wa:         $('inp-prod-wa').value.trim(),
      img:        imgUrl,
      kategori:   $('inp-prod-kategori').value,
      hargaAsli:  Number($('inp-prod-harga-asli').value) || 0,
      unggulan:   $('inp-prod-unggulan').checked,
      updatedAt:  serverTimestamp(),
    };
    if (id === '') delete data.stokAwal; // no stokAwal on new product before Firestore write

    if (id) {
      delete data.stokAwal; // don't overwrite stokAwal on edit
      await updateDoc(produkDoc(uid, id), data);
      toast('Produk diperbarui!');
    } else {
      data.createdAt = serverTimestamp();
      data.stokAwal  = stok;
      await addDoc(produkCol(uid), data);
      toast('Produk ditambahkan!');
    }

    closeModal();
    await loadProducts(uid);
    await loadDashboardStats(uid);
  } catch (err) {
    toast('Error: ' + err.message, 'err');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Simpan Produk';
  }
});

// ── SETTINGS ───────────────────────────────────────────────────────────────
async function loadSettings(uid) {
  try {
    const snap = await getDoc(doc(db, 'toko', uid));
    if (!snap.exists()) return;
    currentTokoData = snap.data();
    const s = currentTokoData;

    $('inp-username').value   = s.namaToko   || '';
    $('inp-bio').value        = s.bio        || '';
    $('inp-wa').value         = s.wa         || '';
    $('inp-shopee').value     = s.shopee     || '';
    $('inp-instagram').value  = s.instagram  || '';
    $('inp-tiktok').value     = s.tiktok     || '';
    $('inp-twitter').value    = s.twitter    || '';
    $('inp-facebook').value   = s.facebook   || '';
    $('inp-youtube').value    = s.youtube    || '';
    $('inp-logo-url').value   = s.logo       || '';
    if (s.logo) $('logo-preview').src = s.logo;

    updatePremiumUI();
    await loadTodayVisits(uid);
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

$('btn-save-settings').addEventListener('click', async () => {
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
      instagram: $('inp-instagram').value.trim(),
      tiktok:    $('inp-tiktok').value.trim(),
      twitter:   $('inp-twitter').value.trim(),
      facebook:  $('inp-facebook').value.trim(),
      youtube:   $('inp-youtube').value.trim(),
      logo:      logoUrl,
    }, { merge: true });
    toast('Pengaturan disimpan!');
  } catch (err) { toast('Gagal: ' + err.message, 'err'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Pengaturan`;
  }
});

// ── AKUN ───────────────────────────────────────────────────────────────────
$('btn-save-account').addEventListener('click', async () => {
  const newEmail = $('inp-new-email').value.trim();
  const newPass  = $('inp-new-pass').value;
  const oldPass  = $('inp-old-pass').value;
  const user     = auth.currentUser;

  if (!oldPass) { toast('Masukkan password lama!', 'warn'); return; }
  if (newEmail === user.email && !newPass) { toast('Tidak ada perubahan.', 'warn'); return; }

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
      await updateDoc(doc(db, 'toko', user.uid), { authPass: newPass });
    }
    toast('Akun diperbarui! Keluar otomatis...');
    setTimeout(() => signOut(auth), 1800);
  } catch (err) {
    const msg = err.code === 'auth/wrong-password' ? 'Password lama salah!' : err.message;
    toast(msg, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Perbarui Akun`;
  }
});

// ── PREMIUM UI ─────────────────────────────────────────────────────────────
function updatePremiumUI() {
  const isPrem = checkPremium(currentTokoData);
  $('premium-cta')?.classList.toggle('hidden', isPrem);
  $('premium-content')?.classList.toggle('hidden', !isPrem);
  if (!isPrem) return;

  currentAccent = currentTokoData.premium?.accentColor || '#FF6B35';

  // Slug display
  const slugEl = $('inp-custom-slug');
  if (slugEl) slugEl.value = currentTokoData.premium?.slug || auth.currentUser?.uid || '';

  // Expiry
  const endDate = currentTokoData.premium?.endDate;
  if (endDate) {
    const end = endDate?.toDate ? endDate.toDate() : new Date(endDate);
    const exEl = $('premium-expiry');
    if (exEl) exEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Aktif sampai ${end.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}`;
  }

  renderColorPicker();
  renderQR();
  renderTemplatePicker();
  renderCustomButtonEditor();
}

// ── PREMIUM: STATS ─────────────────────────────────────────────────────────
async function loadStats(uid) {
  const isPrem = checkPremium(currentTokoData);
  if (!isPrem) return;

  try {
    const today = new Date();
    const days  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
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
      return { label: formatDate(day), visits: d.visits || 0, wa: d.waClicks || 0 };
    });

    $('stat-visits').textContent = tV;
    $('stat-wa').textContent     = tW;
    $('stat-shopee').textContent = tS;
    $('stat-visits-dash').textContent = data[today.toISOString().slice(0,10)]?.visits || 0;

    const chartEl = $('stats-chart');
    if (!chartEl) return;
    const max = Math.max(...chartData.map(d => d.visits), 1);
    chartEl.innerHTML = chartData.map(d => {
      const h = Math.max(Math.round((d.visits / max) * 100), 3);
      return `<div class="chart-col">
        <div class="chart-val">${d.visits || ''}</div>
        <div class="chart-bar" style="height:${h}%"></div>
        <div class="chart-label">${d.label}</div>
      </div>`;
    }).join('');
  } catch (e) { console.error('loadStats:', e); }
}

// ── PREMIUM: COLOR PICKER ──────────────────────────────────────────────────
function renderColorPicker() {
  const wrap = $('color-options');
  if (!wrap) return;
  wrap.innerHTML = ACCENT_COLORS.map(c =>
    `<button type="button" class="color-circle${c.hex === currentAccent ? ' active' : ''}" data-color="${c.hex}" style="background:${c.hex}" title="${c.label}" aria-label="Warna ${c.label}"></button>`
  ).join('');
  wrap.querySelectorAll('.color-circle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const color = btn.dataset.color;
      wrap.querySelectorAll('.color-circle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAccent = color;
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'toko', uid), { 'premium.accentColor': color });
        toast('Warna aksen diperbarui!');
      } catch { toast('Gagal simpan warna', 'err'); }
    });
  });
}

// ── PREMIUM: QR CODE ───────────────────────────────────────────────────────
function renderQR() {
  const uid = auth.currentUser?.uid;
  const img = $('qr-img');
  if (!uid || !img) return;
  const url = `${window.location.origin}${BASE_PATH}/?uid=${uid}`;
  const hex = encodeURIComponent(currentAccent.replace('#', ''));
  img.src          = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}&color=${hex}`;
  img.dataset.url  = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(url)}&color=${hex}&format=png`;
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
    toast('QR Code didownload!');
  } catch { window.open($('qr-img').dataset.url, '_blank'); }
});

// ── PREMIUM: TEMPLATE ──────────────────────────────────────────────────────
function renderTemplatePicker() {
  const wrap = $('template-options');
  if (!wrap) return;
  const cur = currentTokoData?.premium?.template || 'default';
  wrap.innerHTML = TEMPLATE_LIST.map(t => `
    <div class="tpl-card${t.id === cur ? ' active' : ''}" data-tpl="${t.id}">
      <div class="tpl-preview" style="background:${t.bg ? `url('${t.bg}') center/cover no-repeat` : t.preview};">
        <div class="tpl-overlay"></div>
        <div class="tpl-mock">
          <div class="tpl-mock-avatar"></div>
          <div class="tpl-mock-line" style="background:${t.accent};opacity:0.9;width:55%;"></div>
          <div class="tpl-mock-line" style="width:38%;"></div>
          <div class="tpl-mock-btn" style="background:${t.accent};"></div>
        </div>
      </div>
      <div class="tpl-dot" style="background:${t.accent};"></div>
      <div class="tpl-label">${t.label}</div>
      <div class="tpl-desc">${t.desc}</div>
      ${t.id === cur ? '<div class="tpl-active-badge">Aktif</div>' : ''}
    </div>`).join('');

  wrap.querySelectorAll('.tpl-card').forEach(card => {
    card.addEventListener('click', async () => {
      const tpl     = card.dataset.tpl;
      const uid     = auth.currentUser?.uid;
      const tplData = TEMPLATE_LIST.find(t => t.id === tpl);
      try {
        await updateDoc(doc(db, 'toko', uid), {
          'premium.template':        tpl,
          'premium.templateBg':      tplData?.bg     || '',
          'premium.templateAccent':  tplData?.accent || '',
        });
        currentTokoData.premium = { ...currentTokoData.premium, template: tpl, templateBg: tplData?.bg || '', templateAccent: tplData?.accent || '' };
        renderTemplatePicker();
        toast('Tema diperbarui!');
      } catch { toast('Gagal simpan tema', 'err'); }
    });
  });
}

// ── PREMIUM: CUSTOM BUTTONS ────────────────────────────────────────────────
function renderCustomButtonEditor() {
  customBtns = Array.isArray(currentTokoData?.customButtons) ? [...currentTokoData.customButtons] : [];
  renderCustomBtnList();
}

function renderCustomBtnList() {
  const list = $('custom-btn-list');
  if (!list) return;
  list.innerHTML = customBtns.map((btn, i) => `
    <div class="custom-btn-item" data-idx="${i}">
      <input type="text" placeholder="Label tombol" value="${escHtml(btn.label || '')}" data-field="label" data-idx="${i}">
      <input type="text" placeholder="https://..." value="${escHtml(btn.url || '')}" data-field="url" data-idx="${i}" style="flex:1.6">
      <button type="button" class="cb-remove" data-idx="${i}" aria-label="Hapus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');

  list.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx   = parseInt(inp.dataset.idx);
      const field = inp.dataset.field;
      if (!customBtns[idx]) customBtns[idx] = { label: '', url: '' };
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

$('btn-add-custom-btn')?.addEventListener('click', () => {
  if (customBtns.length >= 10) { toast('Maksimal 10 tombol kustom.', 'warn'); return; }
  customBtns.push({ label: '', url: '' });
  renderCustomBtnList();
  $('custom-btn-list').lastElementChild?.querySelector('input')?.focus();
});

$('btn-save-custom-btns')?.addEventListener('click', async () => {
  const uid = auth.currentUser?.uid;
  const cleaned = customBtns.filter(b => b.label && b.url);
  try {
    await updateDoc(doc(db, 'toko', uid), { customButtons: cleaned });
    toast(`${cleaned.length} tombol kustom disimpan!`);
    currentTokoData.customButtons = cleaned;
  } catch (e) { toast('Gagal simpan: ' + e.message, 'err'); }
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
    toast('Upload gagal: ' + err.message, 'err');
    return null;
  }
}

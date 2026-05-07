/**
 * LINKify — Admin Daftar (Manajemen User)
 * Fix: import auth/db dari firebase.js — tidak init Firebase sendiri
 *      supaya tidak konflik dengan maintenance.js yang juga import firebase.js
 */

import { APP_CONFIG } from '../config.js';
import { auth, db } from '../firebase.js';
import {
  initializeApp, getApps, deleteApp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, browserLocalPersistence, setPersistence,
  sendPasswordResetEmail, deleteUser
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, setDoc, getDoc, getDocs,
  collection, updateDoc, deleteDoc, query, orderBy,
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { escHtml, checkPremium, TEMPLATE_LIST } from './utils.js';
import { getMaintenanceStatus } from './maintenance.js';

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const EMAIL_ADMIN = 'unrageunrage@gmail.com';
const BASE_PATH   = window.location.hostname.includes('github.io') ? '/LINKify' : '';

// ── AUTH PERSISTENCE ─────────────────────────────────────────────────────────
// Wrap in IIFE for broad browser compat (some Safari versions reject top-level await in modules)
(async () => {
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
})();

// ── STATE ────────────────────────────────────────────────────────────────────
let allUsers         = [];
let confirmCallback  = null;
let premiumTargetUid = null;
let selectedColor    = '#FF6B35';

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'ok') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = type === 'ok' ? '#10B981' : type === 'err' ? '#EF4444' : '#D97706';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ── SIDEBAR ──────────────────────────────────────────────────────────────────
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('overlay').style.display = 'none';
}
function openSidebar() {
  $('sidebar').classList.add('open');
  $('overlay').style.display = 'block';
}
$('btn-hamburger').addEventListener('click', openSidebar);

// ── AUTH ─────────────────────────────────────────────────────────────────────
function loginAdmin() {
  const email = $('adminEmail').value.trim();
  const pass  = $('adminPass').value;
  const errEl = $('loginError');
  errEl.classList.add('hidden');

  if (!email || !pass) { showLoginErr('Email dan password wajib diisi!'); return; }

  signInWithEmailAndPassword(auth, email, pass).catch(e => {
    const msgs = {
      'auth/wrong-password':     'Email atau password salah!',
      'auth/user-not-found':     'Email atau password salah!',
      'auth/invalid-credential': 'Email atau password salah!',
      'auth/invalid-email':      'Format email tidak valid!',
      'auth/too-many-requests':  'Terlalu banyak percobaan. Coba lagi nanti.',
    };
    showLoginErr(msgs[e.code] || 'Login gagal: ' + e.message);
  });
}

function showLoginErr(msg) {
  const el = $('loginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function logoutAdmin() {
  showConfirm({
    title: 'Logout?',
    msg:   'Anda akan keluar dari panel admin.',
    type:  'warning',
    ok:    'Ya, Logout',
    onOk:  () => signOut(auth)
  });
}

let isLoggingOut = false;
onAuthStateChanged(auth, user => {
  if (isLoggingOut) return;
  if (user && user.email === EMAIL_ADMIN) {
    $('loginAdmin').style.display = 'none';
    $('formDaftar').style.display = 'block';
    const emailEl  = $('adminYgLogin');
    const avatarEl = $('admin-avatar');
    if (emailEl)  emailEl.textContent  = user.email;
    if (avatarEl) avatarEl.textContent = user.email.charAt(0).toUpperCase();
    ambilDataUser();
    loadMaintenancePanel();
    const maintPanel = $('maint-panel');
    if (maintPanel) maintPanel.style.display = 'block';
  } else {
    $('loginAdmin').style.display = 'flex';
    $('formDaftar').style.display = 'none';
    if (user) {
      isLoggingOut = true;
      signOut(auth).finally(() => { isLoggingOut = false; });
    }
  }
});

// ── REGISTER USER ─────────────────────────────────────────────────────────────
async function daftarkanUser() {
  const namaToko    = $('namaToko').value.trim();
  const namaPemilik = $('namaPemilik').value.trim();
  const emailUser   = $('emailUser').value.trim();
  const passUser    = $('passUser').value;
  const btn         = $('btnDaftar');

  if (!namaToko || !namaPemilik || !emailUser || !passUser) {
    return toast('Semua field wajib diisi!', 'warn');
  }
  if (passUser.length < 6) return toast('Password minimal 6 karakter!', 'warn');

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> Mendaftarkan...';

  // Pakai secondary app agar admin tidak ter-logout
  const secName = 'sec-' + Date.now();
  const secApp  = initializeApp(APP_CONFIG.firebaseConfig, secName);
  const secAuth = getAuth(secApp);

  try {
    const cred = await createUserWithEmailAndPassword(secAuth, emailUser, passUser);
    await setDoc(doc(db, 'toko', cred.user.uid), {
      namaToko,
      pemilik:    namaPemilik,
      email:      emailUser,
      authPass:   passUser,
      omset:      0,
      status:     'aktif',
      dibuatPada: serverTimestamp()
    });
    toast('User ' + emailUser + ' berhasil didaftarkan!');
    clearForm();
    await ambilDataUser();
  } catch (err) {
    const msgs = {
      'auth/email-already-in-use': 'Email sudah dipakai!',
      'auth/invalid-email':        'Format email tidak valid!',
    };
    toast(msgs[err.code] || 'Gagal: ' + err.message, 'err');
  } finally {
    await signOut(secAuth).catch(() => {});
    await deleteApp(secApp).catch(() => {});
    btn.disabled  = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Daftarkan`;
  }
}

function clearForm() {
  ['namaToko','namaPemilik','emailUser','passUser'].forEach(id => { $(id).value = ''; });
}

// ── LOAD USERS ────────────────────────────────────────────────────────────────
async function ambilDataUser() {
  $('tabelUser').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#4B5563;font-size:13px;">Memuat data...</td></tr>';
  try {
    const q    = query(collection(db, 'toko'), orderBy('dibuatPada', 'desc'));
    const snap = await getDocs(q);
    allUsers = [];
    snap.forEach(ds => {
      const d = ds.data();
      if (!d.email) return;
      allUsers.push({ uid: ds.id, ...d });
    });
    updateCards();
    renderTable(allUsers);
  } catch (e) {
    $('tabelUser').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#F87171;font-size:13px;">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function updateCards() {
  const now = new Date();
  let aktif = 0, basicCount = 0, premCount = 0, suspend = 0;
  allUsers.forEach(u => {
    if (u.status === 'aktif') aktif++;
    if (u.status === 'blokir') suspend++;
    const p = isPlanActive(u, null, now);
    if (p === 'premium') premCount++;
    if (p === 'basic')   basicCount++;
  });
  $('totalUser').textContent    = allUsers.length;
  $('totalAktif').textContent   = aktif;
  $('totalPremium').textContent = premCount;
  $('totalBasic') && ($('totalBasic').textContent = basicCount);
  $('totalSuspend').textContent = suspend;
}

function isPlanActive(u, plan = null, now = new Date()) {
  // New plan system
  if (u.plan && u.planEndDate) {
    const end = u.planEndDate?.toDate ? u.planEndDate.toDate() : new Date(u.planEndDate);
    if (end > now) {
      if (!plan) return u.plan; // return plan name
      return u.plan === plan;
    }
  }
  // Legacy premium support
  if (u.premium?.active) {
    const end = u.premium.endDate;
    if (end) {
      const endTime = end?.toDate ? end.toDate() : new Date(end);
      if (endTime > now) {
        if (!plan) return 'premium';
        return plan === 'premium';
      }
    }
  }
  return plan ? false : 'free';
}

// backward compat
function isPremiumActive(u, now = new Date()) {
  return isPlanActive(u, 'premium', now);
}

// ── FILTER ────────────────────────────────────────────────────────────────────
function filterTable() {
  const q   = ($('searchInput')?.value || '').toLowerCase().trim();
  const fil = $('filterStatus')?.value  || '';
  const now = new Date();
  const filtered = allUsers.filter(u => {
    const matchText = !q
      || (u.namaToko || '').toLowerCase().includes(q)
      || (u.pemilik  || '').toLowerCase().includes(q)
      || (u.email    || '').toLowerCase().includes(q);
    const now  = new Date();
    const plan = isPlanActive(u, null, now);
    let matchFil = true;
    if (fil === 'aktif')   matchFil = u.status === 'aktif';
    if (fil === 'blokir')  matchFil = u.status === 'blokir';
    if (fil === 'premium') matchFil = plan === 'premium';
    if (fil === 'basic')   matchFil = plan === 'basic';
    if (fil === 'gratis')  matchFil = plan === 'free';
    return matchText && matchFil;
  });
  renderTable(filtered, q);
}

// ── RENDER TABLE ──────────────────────────────────────────────────────────────
function renderTable(users, q = '') {
  const tbody = $('tabelUser');
  const count = $('tableCount');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#4B5563;font-size:13px;">Tidak ada user ditemukan</td></tr>';
    if (count) count.textContent = '0 user';
    return;
  }
  const now = new Date();
  tbody.innerHTML = users.map((u, i) => buildRow(u, i + 1, now, q)).join('');
  if (count) count.textContent = users.length + ' dari ' + allUsers.length + ' user';
}

function hl(text, q) {
  if (!q || !text) return escHtml(String(text || ''));
  const str = String(text);
  const idx = str.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return escHtml(str);
  return escHtml(str.slice(0, idx))
    + `<mark style="background:rgba(255,107,53,0.25);color:#FCA5A5;border-radius:2px;padding:0 1px;">${escHtml(str.slice(idx, idx + q.length))}</mark>`
    + escHtml(str.slice(idx + q.length));
}

function buildRow(u, no, now, q) {
  const plan    = isPlanActive(u, null, now);
  const isPrem  = plan === 'premium';
  const isBasic = plan === 'basic';
  const omset   = (u.omset || 0).toLocaleString('id-ID');
  const viewUrl = `${window.location.origin}${BASE_PATH}/?uid=${u.uid}`;

  const statusBadge = u.status === 'aktif'
    ? '<span class="badge badge-aktif">Aktif</span>'
    : '<span class="badge badge-blokir">Diblokir</span>';

  const planBadge = isPrem
    ? '<span class="badge badge-premium">Premium</span>'
    : isBasic
      ? '<span class="badge badge-basic">Basic</span>'
      : '<span class="badge badge-gratis">Gratis</span>';

  const blockBtn = u.status === 'aktif'
    ? `<button class="act-btn act-block" onclick="blokirUser('${u.uid}','blokir')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Blokir</button>`
    : `<button class="act-btn act-unblock" onclick="blokirUser('${u.uid}','aktif')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>Aktifkan</button>`;

  const planBtn = (isPrem || isBasic)
    ? `<button class="act-btn act-unprem" onclick="nonaktifPlan('${u.uid}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Nonaktif</button>`
    : `<button class="act-btn act-prem" onclick="openPlanModal('${u.uid}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Atur Paket</button>`;

  return `<tr>
    <td style="color:#4B5563;font-size:12px;">${no}</td>
    <td>
      <div style="font-size:13px;font-weight:600;color:#fff;">${hl(u.namaToko, q)}</div>
      <div style="font-size:11px;color:#6B7280;margin-top:2px;">${hl(u.pemilik || '—', q)}</div>
    </td>
    <td class="md-show" style="display:none;font-size:12px;color:#9CA3AF;">${hl(u.email, q)}</td>
    <td class="lg-show" style="display:none;font-size:12px;color:#D1D5DB;font-weight:500;">Rp ${omset}</td>
    <td>${statusBadge}</td>
    <td>${planBadge}</td>
    <td>
      <div class="act-wrap">
        <a href="${viewUrl}" target="_blank" rel="noopener" class="act-btn act-view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Lihat</a>
        <button class="act-btn act-reset" onclick="resetPassword('${escHtml(u.email)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>Reset</button>
        ${blockBtn}
        ${planBtn}
        <button class="act-btn act-delete" onclick="hapusUser('${u.uid}','${escHtml(u.namaToko)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Hapus</button>
      </div>
    </td>
  </tr>`;
}

  return `<tr>
    <td style="color:#4B5563;font-size:12px;">${no}</td>
    <td>
      <div style="font-size:13px;font-weight:600;color:#fff;">${hl(u.namaToko, q)}</div>
      <div style="font-size:11px;color:#6B7280;margin-top:2px;">${hl(u.pemilik || '—', q)}</div>
    </td>
    <td class="md-show" style="display:none;font-size:12px;color:#9CA3AF;">${hl(u.email, q)}</td>
    <td class="lg-show" style="display:none;font-size:12px;color:#D1D5DB;font-weight:500;">Rp ${omset}</td>
    <td>${statusBadge}</td>
    <td>${premBadge}</td>
    <td>
      <div class="act-wrap">
        <a href="${viewUrl}" target="_blank" rel="noopener" class="act-btn act-view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Lihat</a>
        <button class="act-btn act-reset" onclick="resetPassword('${escHtml(u.email)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>Reset</button>
        ${blockBtn}
        ${premBtn}
        <button class="act-btn act-delete" onclick="hapusUser('${u.uid}','${escHtml(u.namaToko)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Hapus</button>
      </div>
    </td>
  </tr>`;
}

// ── USER ACTIONS ──────────────────────────────────────────────────────────────
function resetPassword(email) {
  showConfirm({
    title: 'Reset Password',
    msg:   `Kirim link reset ke:\n${email}`,
    type:  'info',
    ok:    'Kirim Email',
    onOk: async () => {
      try {
        await sendPasswordResetEmail(auth, email);
        toast('Link reset dikirim ke ' + email);
      } catch (e) { toast('Gagal: ' + e.message, 'err'); }
    }
  });
}

function blokirUser(uid, status) {
  showConfirm({
    title: status === 'blokir' ? 'Blokir User?' : 'Aktifkan User?',
    msg:   status === 'blokir' ? 'User tidak bisa login ke akun tokonya.' : 'User bisa login kembali.',
    type:  status === 'blokir' ? 'danger' : 'info',
    ok:    status === 'blokir' ? 'Ya, Blokir' : 'Ya, Aktifkan',
    onOk: async () => {
      try {
        await updateDoc(doc(db, 'toko', uid), { status });
        toast('Status diperbarui.');
        await ambilDataUser();
      } catch (e) { toast('Gagal: ' + e.message, 'err'); }
    }
  });
}

function nonaktifPlan(uid) {
  showConfirm({
    title: 'Nonaktifkan Paket?',
    msg:   'Paket Basic/Premium user ini akan dinonaktifkan. User kembali ke mode Gratis.',
    type:  'warning',
    ok:    'Ya, Nonaktifkan',
    onOk: async () => {
      try {
        await updateDoc(doc(db, 'toko', uid), {
          plan: null,
          planEndDate: null,
          'premium.active': false,  // also clear legacy
        });
        toast('Paket dinonaktifkan.');
        await ambilDataUser();
      } catch (e) { toast('Gagal: ' + e.message, 'err'); }
    }
  });
}

// backward compat alias
window.openPlanModal    = openPlanModal;
window.closePlanModal   = closePlanModal;
window.savePlanModal    = savePlanModal;
window.nonaktifPlan     = nonaktifPlan;

function hapusUser(uid, namaToko) {
  showConfirm({
    title: 'Hapus Permanen?',
    msg:   `Hapus "${namaToko}"?\n\nSemua data toko, produk, dan statistik akan dihapus.\nTIDAK BISA DIBATALKAN.`,
    type:  'danger',
    ok:    'Hapus Selamanya',
    onOk:  () => doHapusUser(uid, namaToko)
  });
}

async function doHapusUser(uid, namaToko) {
  let tokoData;
  try {
    const snap = await getDoc(doc(db, 'toko', uid));
    if (!snap.exists()) throw new Error('Data tidak ditemukan');
    tokoData = snap.data();
  } catch (e) { return toast('Gagal baca data: ' + e.message, 'err'); }

  try {
    for (const col of ['produk', 'stats']) {
      const sub = await getDocs(collection(db, 'toko', uid, col));
      if (!sub.empty) {
        const batch = writeBatch(db);
        sub.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'toko', uid));
  } catch (e) { return toast('Gagal hapus data: ' + e.message, 'err'); }

  try {
    const sApp  = initializeApp(APP_CONFIG.firebaseConfig, 'del-' + Date.now());
    const sAuth = getAuth(sApp);
    const cred  = await signInWithEmailAndPassword(sAuth, tokoData.email, tokoData.authPass);
    await deleteUser(cred.user);
    await signOut(sAuth);
    await deleteApp(sApp);
    toast(`"${namaToko}" dihapus sepenuhnya.`);
  } catch {
    toast('Data dihapus. Auth perlu hapus manual di Firebase Console.', 'warn');
  }
  await ambilDataUser();
}

// ── PREMIUM MODAL ──────────────────────────────────────────────────────────────
function openPlanModal(uid) {
  premiumTargetUid = uid;
  selectedColor    = '#FF6B35';
  $('pm-days').value     = 30;
  $('pm-template').value = 'default';
  $('pm-slug').value     = '';
  // Default to premium tab
  switchPlanTab('premium');
  document.querySelectorAll('.pm-col').forEach(b => {
    b.classList.toggle('selected', b.dataset.c === selectedColor);
  });
  $('plan-modal').classList.add('open');
}

// backward compat
window.openPremiumModal = openPlanModal;

function closePlanModal() {
  $('plan-modal').classList.remove('open');
  premiumTargetUid = null;
}
window.closePremiumModal = closePlanModal;

let activePlanTab = 'premium';
function switchPlanTab(tab) {
  activePlanTab = tab;
  $('tab-basic-btn')?.classList.toggle('active', tab === 'basic');
  $('tab-premium-btn')?.classList.toggle('active', tab === 'premium');
  $('plan-basic-fields')?.classList.toggle('hidden', tab !== 'basic');
  $('plan-premium-fields')?.classList.toggle('hidden', tab !== 'premium');
  const saveBtn = $('pm-save-btn');
  if (saveBtn) saveBtn.textContent = tab === 'basic' ? 'Aktifkan Basic' : 'Aktifkan Premium';
}
window.switchPlanTab = switchPlanTab;

document.querySelectorAll('.pm-col').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedColor = btn.dataset.c;
    document.querySelectorAll('.pm-col').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

async function savePlanModal() {
  if (!premiumTargetUid) return;

  const days    = parseInt($('pm-days').value) || 30;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const btn = $('pm-save-btn');
  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

  try {
    if (activePlanTab === 'basic') {
      // ── BASIC PLAN ──────────────────────────────────────────────
      await updateDoc(doc(db, 'toko', premiumTargetUid), {
        plan:        'basic',
        planEndDate: endDate,
        // Clear premium if upgrading from legacy
        'premium.active': false,
      });
      toast(`Paket Basic aktif ${days} hari!`);

    } else {
      // ── PREMIUM PLAN ─────────────────────────────────────────────
      const template = $('pm-template').value;
      const slug     = $('pm-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      const tplData  = TEMPLATE_LIST.find(t => t.id === template) || {};

      // Validate slug uniqueness
      if (slug) {
        const allSnap  = await getDocs(collection(db, 'toko'));
        const slugTaken = allSnap.docs.some(d => {
          if (d.id === premiumTargetUid) return false;
          return d.data()?.premium?.slug === slug;
        });
        if (slugTaken) {
          toast('Slug sudah dipakai user lain. Coba slug berbeda.', 'warn');
          btn.disabled = false;
          btn.textContent = 'Aktifkan Premium';
          return;
        }
      }

      const update = {
        plan:                     'premium',
        planEndDate:              endDate,
        'premium.active':         true,
        'premium.startDate':      serverTimestamp(),
        'premium.endDate':        endDate,
        'premium.accentColor':    selectedColor,
        'premium.template':       template,
        'premium.templateBg':     tplData.bg     || '',
        'premium.templateAccent': tplData.accent || '',
      };
      if (slug) update['premium.slug'] = slug;
      await updateDoc(doc(db, 'toko', premiumTargetUid), update);
      toast(`Paket Premium aktif ${days} hari!`);
    }

    closePlanModal();
    await ambilDataUser();
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
  } finally {
    btn.disabled    = false;
    btn.textContent = activePlanTab === 'basic' ? 'Aktifkan Basic' : 'Aktifkan Premium';
  }
}

// backward compat
window.savePremiumModal = savePlanModal;

// ── CONFIRM MODAL ──────────────────────────────────────────────────────────────
function showConfirm({ title, msg, type = 'danger', ok = 'Lanjutkan', onOk }) {
  confirmCallback = onOk;
  $('confirm-title').textContent = title;
  $('confirm-msg').textContent   = msg;

  const icon  = $('confirm-icon');
  const okBtn = $('confirm-ok');
  icon.className  = 'dark-modal-icon';
  okBtn.className = 'btn';

  const cfgs = {
    danger:  { ic: 'modal-icon-danger',  oc: 'btn-modal-danger',  svg: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' },
    warning: { ic: 'modal-icon-warning', oc: 'btn-modal-warning', svg: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>' },
    info:    { ic: 'modal-icon-info',    oc: 'btn-modal-info',    svg: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
  };
  const cfg = cfgs[type] || cfgs.danger;
  icon.classList.add(cfg.ic);
  icon.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="20" height="20">${cfg.svg}</svg>`;
  okBtn.classList.add(cfg.oc);
  okBtn.textContent = ok;
  $('confirm-modal').classList.add('open');
}

function closeConfirm() {
  $('confirm-modal').classList.remove('open');
  confirmCallback = null;
}

$('confirm-ok').addEventListener('click', async () => {
  const cb = confirmCallback;
  closeConfirm();
  if (typeof cb === 'function') await cb();
});

// ── MAINTENANCE ────────────────────────────────────────────────────────────────
async function loadMaintenancePanel() {
  const data     = await getMaintenanceStatus();
  const activeEl = $('maint-toggle');
  const msgEl    = $('maint-msg-inp');
  const estEl    = $('maint-est-inp');
  const statusEl = $('maint-status-label');
  const titleEl  = $('maint-title-inp');

  if (activeEl) {
    activeEl.checked = !!data.active;
    // Sync toggle visual
    const track = document.querySelector('.maint-track');
    const thumb = document.querySelector('.maint-thumb');
    if (track) track.style.background  = data.active ? '#EF4444' : '#2C313A';
    if (thumb) thumb.style.transform   = data.active ? 'translateX(20px)' : 'translateX(0)';
  }
  if (msgEl   && data.message)       msgEl.value   = data.message;
  if (titleEl && data.title)         titleEl.value = data.title;
  if (estEl   && data.estimatedDone) {
    const d = data.estimatedDone?.seconds
      ? new Date(data.estimatedDone.seconds * 1000)
      : new Date(data.estimatedDone);
    const pad = n => String(n).padStart(2, '0');
    estEl.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (statusEl) {
    statusEl.textContent = data.active ? 'AKTIF' : 'NONAKTIF';
    statusEl.style.color = data.active ? '#F87171' : '#34D399';
  }
}

async function toggleMaintenance() {
  const cur = $('maint-toggle').checked;
  const track = document.querySelector('.maint-track');
  const thumb = document.querySelector('.maint-thumb');
  if (track) track.style.background = cur ? '#EF4444' : '#2C313A';
  if (thumb) thumb.style.transform  = cur ? 'translateX(20px)' : 'translateX(0)';
  try {
    await setDoc(doc(db, 'config', 'maintenance'), { active: cur }, { merge: true });
    const statusEl = $('maint-status-label');
    if (statusEl) {
      statusEl.textContent = cur ? 'AKTIF' : 'NONAKTIF';
      statusEl.style.color = cur ? '#F87171' : '#34D399';
    }
    toast(cur
      ? 'Maintenance AKTIF — toko publik tidak bisa diakses.'
      : 'Maintenance NONAKTIF — toko kembali normal.',
      cur ? 'warn' : 'ok'
    );
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
    // Rollback toggle visual
    $('maint-toggle').checked = !cur;
    if (track) track.style.background = !cur ? '#EF4444' : '#2C313A';
    if (thumb) thumb.style.transform  = !cur ? 'translateX(20px)' : 'translateX(0)';
  }
}

async function saveMaintenance() {
  const msg   = $('maint-msg-inp')?.value.trim()   || 'Sistem sedang dalam pemeliharaan.';
  const est   = $('maint-est-inp')?.value;
  const title = $('maint-title-inp')?.value.trim() || 'Sedang Maintenance';
  const btn   = $('maint-save-btn');

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    const payload = {
      message:   msg,
      title,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email || 'admin',
    };
    if (est) payload.estimatedDone = new Date(est);
    else     payload.estimatedDone = null;

    await setDoc(doc(db, 'config', 'maintenance'), payload, { merge: true });
    toast('Pengaturan maintenance disimpan!');
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Simpan Pengaturan';
  }
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────────────────────
Object.assign(window, {
  loginAdmin, logoutAdmin, daftarkanUser, ambilDataUser, filterTable,
  blokirUser, nonaktifPremium, resetPassword, hapusUser,
  openPremiumModal, closePremiumModal, savePremiumModal,
  closeConfirm, closeSidebar,
  toggleMaintenance, saveMaintenance,
});

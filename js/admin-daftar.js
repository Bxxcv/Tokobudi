/**
 * LINKify — Admin Daftar (Manajemen User)
 */

import { APP_CONFIG } from '../config.js';
import { auth, db } from '../firebase.js';
import { initializeApp, getApps, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
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
(async () => { await setPersistence(auth, browserLocalPersistence).catch(() => {}); })();

// ── STATE ────────────────────────────────────────────────────────────────────
let allUsers         = [];
let confirmCallback  = null;
let premiumTargetUid = null;
let selectedColor    = '#FF6B35';
let activePlanTab    = 'premium';

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
  $('sidebar')?.classList.remove('open');
  const ov = $('overlay'); if (ov) ov.style.display = 'none';
}
function openSidebar() {
  $('sidebar')?.classList.add('open');
  const ov = $('overlay'); if (ov) ov.style.display = 'block';
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
function loginAdmin() {
  const email = $('adminEmail')?.value.trim();
  const pass  = $('adminPass')?.value;
  const errEl = $('loginError');
  if (errEl) errEl.classList.add('hidden');

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
  if (!el) return;
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
    const loginEl  = $('loginAdmin');
    const formEl   = $('formDaftar');
    if (loginEl) loginEl.style.display = 'none';
    if (formEl)  formEl.style.display  = 'block';
    const emailEl  = $('adminYgLogin');
    const avatarEl = $('admin-avatar');
    if (emailEl)  emailEl.textContent  = user.email;
    if (avatarEl) avatarEl.textContent = user.email.charAt(0).toUpperCase();
    ambilDataUser();
    loadMaintenancePanel();
    const maintPanel = $('maint-panel');
    if (maintPanel) maintPanel.style.display = 'block';
  } else {
    const loginEl = $('loginAdmin');
    const formEl  = $('formDaftar');
    if (loginEl) loginEl.style.display = 'flex';
    if (formEl)  formEl.style.display  = 'none';
    if (user) {
      isLoggingOut = true;
      signOut(auth).finally(() => { isLoggingOut = false; });
    }
  }
});

// ── REGISTER USER ─────────────────────────────────────────────────────────────
async function daftarkanUser() {
  const namaToko    = $('namaToko')?.value.trim();
  const namaPemilik = $('namaPemilik')?.value.trim();
  const emailUser   = $('emailUser')?.value.trim();
  const passUser    = $('passUser')?.value;
  const btn         = $('btnDaftar');

  if (!namaToko || !namaPemilik || !emailUser || !passUser) {
    return toast('Semua field wajib diisi!', 'warn');
  }
  if (passUser.length < 6) return toast('Password minimal 6 karakter!', 'warn');

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> Mendaftarkan...';

  const secName = 'sec-' + Date.now();
  const secApp  = initializeApp(APP_CONFIG.firebaseConfig, secName);
  const secAuth = getAuth(secApp);

  try {
    const cred = await createUserWithEmailAndPassword(secAuth, emailUser, passUser);
    await setDoc(doc(db, 'toko', cred.user.uid), {
      namaToko, pemilik: namaPemilik, email: emailUser,
      omset: 0, status: 'aktif', dibuatPada: serverTimestamp()
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
  ['namaToko','namaPemilik','emailUser','passUser'].forEach(id => { const el = $(id); if(el) el.value = ''; });
}

// ── LOAD USERS ────────────────────────────────────────────────────────────────
async function ambilDataUser() {
  const tbody = $('tabelUser');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#4B5563;font-size:13px;">Memuat data...</td></tr>';
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#F87171;font-size:13px;">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

// ── PLAN HELPERS ──────────────────────────────────────────────────────────────
function isPlanActive(u, plan, now) {
  now = now || new Date();
  // New plan system
  if (u.plan && u.planEndDate) {
    const end = u.planEndDate && u.planEndDate.toDate ? u.planEndDate.toDate() : new Date(u.planEndDate);
    if (end > now) {
      if (!plan) return u.plan;
      return u.plan === plan;
    }
  }
  // Legacy premium
  if (u.premium && u.premium.active) {
    const endRaw = u.premium.endDate;
    if (endRaw) {
      const end = endRaw.toDate ? endRaw.toDate() : new Date(endRaw);
      if (end > now) {
        if (!plan) return 'premium';
        return plan === 'premium';
      }
    }
  }
  return plan ? false : 'free';
}

function updateCards() {
  const now = new Date();
  let aktif = 0, basicCount = 0, premCount = 0, suspend = 0;
  allUsers.forEach(u => {
    if (u.status === 'aktif')  aktif++;
    if (u.status === 'blokir') suspend++;
    const p = isPlanActive(u, null, now);
    if (p === 'premium') premCount++;
    if (p === 'basic')   basicCount++;
  });
  if ($('totalUser'))    $('totalUser').textContent    = allUsers.length;
  if ($('totalAktif'))   $('totalAktif').textContent   = aktif;
  if ($('totalPremium')) $('totalPremium').textContent = premCount;
  if ($('totalBasic'))   $('totalBasic').textContent   = basicCount;
  if ($('totalSuspend')) $('totalSuspend').textContent = suspend;
}

// ── FILTER ────────────────────────────────────────────────────────────────────
function filterTable() {
  const q   = ($('searchInput') ? $('searchInput').value : '').toLowerCase().trim();
  const fil = $('filterStatus') ? $('filterStatus').value : '';
  const now = new Date();
  const filtered = allUsers.filter(u => {
    const matchText = !q
      || (u.namaToko || '').toLowerCase().includes(q)
      || (u.pemilik  || '').toLowerCase().includes(q)
      || (u.email    || '').toLowerCase().includes(q);
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
function renderTable(users, q) {
  q = q || '';
  const tbody = $('tabelUser');
  const count = $('tableCount');
  if (!users.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#4B5563;font-size:13px;">Tidak ada user ditemukan</td></tr>';
    if (count) count.textContent = '0 user';
    return;
  }
  const now = new Date();
  if (tbody) tbody.innerHTML = users.map((u, i) => buildRow(u, i + 1, now, q)).join('');
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
  const viewUrl = window.location.origin + BASE_PATH + '/?uid=' + u.uid;

  const statusBadge = u.status === 'aktif'
    ? '<span class="badge badge-aktif">Aktif</span>'
    : '<span class="badge badge-blokir">Diblokir</span>';

  const planBadge = isPrem
    ? '<span class="badge badge-premium">Premium</span>'
    : isBasic
      ? '<span class="badge badge-basic">Basic</span>'
      : '<span class="badge badge-gratis">Gratis</span>';

  const blockBtn = u.status === 'aktif'
    ? `<button class="act-btn act-block" onclick="blokirUser('${u.uid}','blokir')">Blokir</button>`
    : `<button class="act-btn act-unblock" onclick="blokirUser('${u.uid}','aktif')">Aktifkan</button>`;

  const planBtn = (isPrem || isBasic)
    ? `<button class="act-btn act-unprem" onclick="nonaktifPlan('${u.uid}')">Nonaktif</button>`
    : `<button class="act-btn act-prem" onclick="openPlanModal('${u.uid}')">Atur Paket</button>`;

  return '<tr>'
    + '<td style="color:#4B5563;font-size:12px;">' + no + '</td>'
    + '<td><div style="font-size:13px;font-weight:600;color:#fff;">' + hl(u.namaToko, q) + '</div>'
    + '<div style="font-size:11px;color:#6B7280;margin-top:2px;">' + hl(u.pemilik || '—', q) + '</div></td>'
    + '<td class="md-show" style="display:none;font-size:12px;color:#9CA3AF;">' + hl(u.email, q) + '</td>'
    + '<td class="lg-show" style="display:none;font-size:12px;color:#D1D5DB;font-weight:500;">Rp ' + omset + '</td>'
    + '<td>' + statusBadge + '</td>'
    + '<td>' + planBadge + '</td>'
    + '<td><div class="act-wrap">'
    + '<a href="' + viewUrl + '" target="_blank" rel="noopener" class="act-btn act-view">Lihat</a>'
    + '<button class="act-btn act-reset" onclick="resetPassword(\'' + escHtml(u.email) + '\')">Reset</button>'
    + blockBtn + planBtn
    + '<button class="act-btn act-delete" onclick="hapusUser(\'' + u.uid + '\',\'' + escHtml(u.namaToko) + '\')">Hapus</button>'
    + '</div></td></tr>';
}

// ── USER ACTIONS ──────────────────────────────────────────────────────────────
function resetPassword(email) {
  showConfirm({
    title: 'Reset Password',
    msg:   'Kirim link reset ke:\n' + email,
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
    msg:   'Paket user ini akan dinonaktifkan. User kembali ke mode Gratis.',
    type:  'warning',
    ok:    'Ya, Nonaktifkan',
    onOk: async () => {
      try {
        await updateDoc(doc(db, 'toko', uid), {
          plan: null, planEndDate: null, 'premium.active': false
        });
        toast('Paket dinonaktifkan.');
        await ambilDataUser();
      } catch (e) { toast('Gagal: ' + e.message, 'err'); }
    }
  });
}

function hapusUser(uid, namaToko) {
  showConfirm({
    title: 'Hapus Permanen?',
    msg:   'Hapus "' + namaToko + '"?\n\nSemua data toko, produk, dan statistik akan dihapus.\nTIDAK BISA DIBATALKAN.',
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
    toast('"' + namaToko + '" dihapus sepenuhnya.');
  } catch {
    toast('Data dihapus. Auth perlu hapus manual di Firebase Console.', 'warn');
  }
  await ambilDataUser();
}

// ── PLAN MODAL ────────────────────────────────────────────────────────────────
function openPlanModal(uid) {
  premiumTargetUid = uid;
  selectedColor    = '#FF6B35';
  if ($('pm-days'))     $('pm-days').value     = 30;
  if ($('pm-template')) $('pm-template').value = 'default';
  if ($('pm-slug'))     $('pm-slug').value     = '';
  switchPlanTab('premium');
  document.querySelectorAll('.pm-col').forEach(b => {
    b.classList.toggle('selected', b.dataset.c === selectedColor);
  });
  const modal = $('plan-modal');
  if (modal) modal.classList.add('open');
}

function closePlanModal() {
  const modal = $('plan-modal');
  if (modal) modal.classList.remove('open');
  premiumTargetUid = null;
}

function switchPlanTab(tab) {
  activePlanTab = tab;
  const basicBtn = $('tab-basic-btn');
  const premBtn  = $('tab-premium-btn');
  const basicF   = $('plan-basic-fields');
  const premF    = $('plan-premium-fields');
  const saveBtn  = $('pm-save-btn');
  if (basicBtn) basicBtn.style.cssText = tab === 'basic'   ? 'flex:1;padding:8px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:Inter,sans-serif;background:#3B82F6;color:#fff;' : 'flex:1;padding:8px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:Inter,sans-serif;background:transparent;color:#6B7280;';
  if (premBtn)  premBtn.style.cssText  = tab === 'premium' ? 'flex:1;padding:8px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:Inter,sans-serif;background:#FF6B35;color:#fff;' : 'flex:1;padding:8px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:Inter,sans-serif;background:transparent;color:#6B7280;';
  if (basicF)  basicF.style.display   = tab === 'basic'   ? '' : 'none';
  if (premF)   premF.style.display    = tab === 'premium' ? '' : 'none';
  if (saveBtn) saveBtn.textContent    = tab === 'basic'   ? 'Aktifkan Basic' : 'Aktifkan Premium';
}

async function savePlanModal() {
  if (!premiumTargetUid) return;
  const days    = parseInt($('pm-days') ? $('pm-days').value : 30) || 30;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const btn = $('pm-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan...'; }

  try {
    if (activePlanTab === 'basic') {
      await updateDoc(doc(db, 'toko', premiumTargetUid), {
        plan: 'basic', planEndDate: endDate, 'premium.active': false
      });
      toast('Paket Basic aktif ' + days + ' hari!');
    } else {
      const template = $('pm-template') ? $('pm-template').value : 'default';
      const slug     = $('pm-slug') ? $('pm-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
      const tplData  = TEMPLATE_LIST.find(t => t.id === template) || {};

      if (slug) {
        const allSnap   = await getDocs(collection(db, 'toko'));
        const slugTaken = allSnap.docs.some(d => d.id !== premiumTargetUid && d.data().premium && d.data().premium.slug === slug);
        if (slugTaken) {
          toast('Slug sudah dipakai. Coba slug lain.', 'warn');
          if (btn) { btn.disabled = false; btn.textContent = 'Aktifkan Premium'; }
          return;
        }
      }

      const update = {
        plan: 'premium', planEndDate: endDate,
        'premium.active': true, 'premium.startDate': serverTimestamp(),
        'premium.endDate': endDate, 'premium.accentColor': selectedColor,
        'premium.template': template,
        'premium.templateBg': tplData.bg || '',
        'premium.templateAccent': tplData.accent || '',
      };
      if (slug) update['premium.slug'] = slug;
      await updateDoc(doc(db, 'toko', premiumTargetUid), update);
      toast('Paket Premium aktif ' + days + ' hari!');
    }
    closePlanModal();
    await ambilDataUser();
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = activePlanTab === 'basic' ? 'Aktifkan Basic' : 'Aktifkan Premium'; }
  }
}

// ── CONFIRM MODAL ──────────────────────────────────────────────────────────────
function showConfirm({ title, msg, type, ok, onOk }) {
  type = type || 'danger'; ok = ok || 'Lanjutkan';
  confirmCallback = onOk;
  if ($('confirm-title')) $('confirm-title').textContent = title;
  if ($('confirm-msg'))   $('confirm-msg').textContent   = msg;

  const icon  = $('confirm-icon');
  const okBtn = $('confirm-ok');
  if (icon)  icon.className  = 'dark-modal-icon';
  if (okBtn) okBtn.className = 'btn';

  const cfgs = {
    danger:  { ic: 'modal-icon-danger',  oc: 'btn-modal-danger',  svg: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' },
    warning: { ic: 'modal-icon-warning', oc: 'btn-modal-warning', svg: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>' },
    info:    { ic: 'modal-icon-info',    oc: 'btn-modal-info',    svg: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
  };
  const cfg = cfgs[type] || cfgs.danger;
  if (icon) { icon.classList.add(cfg.ic); icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="20" height="20">' + cfg.svg + '</svg>'; }
  if (okBtn) { okBtn.classList.add(cfg.oc); okBtn.textContent = ok; }
  const modal = $('confirm-modal');
  if (modal) modal.classList.add('open');
}

function closeConfirm() {
  const modal = $('confirm-modal');
  if (modal) modal.classList.remove('open');
  confirmCallback = null;
}

// ── MAINTENANCE ────────────────────────────────────────────────────────────────
async function loadMaintenancePanel() {
  const data     = await getMaintenanceStatus();
  const activeEl = $('maint-toggle');
  const msgEl    = $('maint-msg-inp');
  const estEl    = $('maint-est-inp');
  const statusEl = $('maint-status-label');
  const titleEl  = $('maint-title-inp');
  const track    = document.querySelector('.maint-track');
  const thumb    = document.querySelector('.maint-thumb');

  if (activeEl) activeEl.checked = !!data.active;
  if (track) track.style.background = data.active ? '#EF4444' : '#2C313A';
  if (thumb) thumb.style.transform  = data.active ? 'translateX(20px)' : 'translateX(0)';
  if (msgEl   && data.message)       msgEl.value   = data.message;
  if (titleEl && data.title)         titleEl.value = data.title;
  if (estEl   && data.estimatedDone) {
    const d = data.estimatedDone && data.estimatedDone.seconds
      ? new Date(data.estimatedDone.seconds * 1000)
      : new Date(data.estimatedDone);
    const pad = n => String(n).padStart(2, '0');
    estEl.value = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  if (statusEl) {
    statusEl.textContent = data.active ? 'AKTIF' : 'NONAKTIF';
    statusEl.style.color = data.active ? '#F87171' : '#34D399';
  }
}

async function toggleMaintenance() {
  const activeEl = $('maint-toggle');
  if (!activeEl) return;
  const cur   = activeEl.checked;
  const track = document.querySelector('.maint-track');
  const thumb = document.querySelector('.maint-thumb');
  if (track) track.style.background = cur ? '#EF4444' : '#2C313A';
  if (thumb) thumb.style.transform  = cur ? 'translateX(20px)' : 'translateX(0)';
  try {
    await setDoc(doc(db, 'config', 'maintenance'), { active: cur }, { merge: true });
    const statusEl = $('maint-status-label');
    if (statusEl) { statusEl.textContent = cur ? 'AKTIF' : 'NONAKTIF'; statusEl.style.color = cur ? '#F87171' : '#34D399'; }
    toast(cur ? 'Maintenance AKTIF.' : 'Maintenance NONAKTIF.', cur ? 'warn' : 'ok');
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
    activeEl.checked = !cur;
    if (track) track.style.background = !cur ? '#EF4444' : '#2C313A';
    if (thumb) thumb.style.transform  = !cur ? 'translateX(20px)' : 'translateX(0)';
  }
}

async function saveMaintenance() {
  const msg   = $('maint-msg-inp')   ? $('maint-msg-inp').value.trim()   : 'Sistem sedang dalam pemeliharaan.';
  const est   = $('maint-est-inp')   ? $('maint-est-inp').value           : '';
  const title = $('maint-title-inp') ? $('maint-title-inp').value.trim()  : 'Sedang Maintenance';
  const btn   = $('maint-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan...'; }
  try {
    const payload = { message: msg || 'Sistem sedang dalam pemeliharaan.', title: title || 'Sedang Maintenance', updatedAt: serverTimestamp(), updatedBy: auth.currentUser ? auth.currentUser.email : 'admin' };
    if (est) payload.estimatedDone = new Date(est);
    else payload.estimatedDone = null;
    await setDoc(doc(db, 'config', 'maintenance'), payload, { merge: true });
    toast('Pengaturan maintenance disimpan!');
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Pengaturan'; }
  }
}

// ── DOM READY ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar
  const hamburger = $('btn-hamburger');
  if (hamburger) hamburger.addEventListener('click', openSidebar);

  // Color picker
  document.querySelectorAll('.pm-col').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedColor = btn.dataset.c;
      document.querySelectorAll('.pm-col').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Confirm ok button
  const confirmOk = $('confirm-ok');
  if (confirmOk) {
    confirmOk.addEventListener('click', async () => {
      const cb = confirmCallback;
      closeConfirm();
      if (typeof cb === 'function') await cb();
    });
  }
});

// ── EXPOSE TO WINDOW ──────────────────────────────────────────────────────────
Object.assign(window, {
  loginAdmin, logoutAdmin, daftarkanUser, ambilDataUser, filterTable,
  blokirUser, resetPassword, hapusUser, closeConfirm, closeSidebar,
  toggleMaintenance, saveMaintenance,
  openPlanModal, closePlanModal, savePlanModal, nonaktifPlan, switchPlanTab,
  // backward compat
  openPremiumModal:  openPlanModal,
  closePremiumModal: closePlanModal,
  savePremiumModal:  savePlanModal,
  nonaktifPremium:   nonaktifPlan,
});

import { auth, db, CONFIG } from './firebase.js';
import {
  onAuthStateChanged, signOut, updatePassword, updateEmail,
  EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDoc, query, orderBy, setDoc, where, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escHtml, checkPremium, hexToRgb, ACCENT_COLORS, DAY_NAMES, formatDate } from './utils.js';

const CLOUD_NAME = CONFIG.cloudinary.cloudName;
const CLOUD_PRESET = CONFIG.cloudinary.uploadPreset;

document.addEventListener('DOMContentLoaded', () => {

  const sidebar      = document.getElementById('sidebar');
  const overlay      = document.getElementById('overlay');
  const btnHamburger = document.getElementById('btn-hamburger');
  const btnLogout    = document.getElementById('btn-logout');
  const adminEmail   = document.getElementById('admin-email');
  const btnCopyLink  = document.getElementById('btn-copy-link');

  const productsList = document.getElementById('products-list');
  const btnAddProd   = document.getElementById('btn-add-product');

  const productModal = document.getElementById('product-modal');
  const modalPull    = document.getElementById('modal-pull');
  const productForm  = document.getElementById('product-form');
  const modalTitle   = document.getElementById('modal-title');
  const btnSaveProd  = document.getElementById('btn-save-product');
  const uploadZone   = document.getElementById('upload-zone');
  const inpProdFile  = document.getElementById('inp-prod-file');
  const imgPrevWrap  = document.getElementById('img-preview-wrap');
  const imgPreview   = document.getElementById('img-preview');

  const logoPreview  = document.getElementById('logo-preview');
  const btnLogoPick  = document.getElementById('btn-logo-pick');
  const inpLogoFile  = document.getElementById('inp-logo-file');
  const inpLogoUrl   = document.getElementById('inp-logo-url');
  const inpUsername  = document.getElementById('inp-username');
  const inpBio       = document.getElementById('inp-bio');
  const inpWa        = document.getElementById('inp-wa');
  const inpShopee    = document.getElementById('inp-shopee');
  const btnSaveSett  = document.getElementById('btn-save-settings');

  const inpNewEmail  = document.getElementById('inp-new-email');
  const inpNewPass   = document.getElementById('inp-new-pass');
  const inpOldPass   = document.getElementById('inp-old-pass');
  const btnSaveAcc   = document.getElementById('btn-save-account');

  // Premium elements
  const premiumBadge    = document.getElementById('premium-badge');
  const premiumCta      = document.getElementById('premium-cta');
  const premiumContent  = document.getElementById('premium-content');
  const colorPickerWrap = document.getElementById('color-picker-wrap');
  const qrImg           = document.getElementById('qr-img');
  const btnDownloadQR   = document.getElementById('btn-download-qr');

  function produkCol(uid) { return collection(db, 'toko', uid, 'produk'); }
  function produkDoc(uid, id) { return doc(db, 'toko', uid, 'produk', id); }

  let prodBlobUrl = null;
  let logoBlobUrl = null;
  let currentTokoData = null;
  let currentAccent = '#FF6B35';

  // ── TOAST ──
  let toastTimer;
  function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = type === 'ok' ? '#111' : type === 'err' ? '#EE4D2D' : '#B45309';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
  window.showToast = toast;

  // ── CLOCK ──
  const clockEl = document.getElementById('clock-time');
  const dateEl  = document.getElementById('clock-date');
  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateEl.textContent  = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ── SIDEBAR ──
  function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('show');    document.body.style.overflow = 'hidden'; }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); document.body.style.overflow = ''; }
  btnHamburger.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  // ── TABS ──
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
      btn.classList.add('active-tab');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('show');
      closeSidebar();
    });
  });

  // ── AUTH ──
  onAuthStateChanged(auth, async user => {
    if (user) {
      const tokoSnap = await getDoc(doc(db, 'toko', user.uid));
      if (tokoSnap.exists()) {
        currentTokoData = tokoSnap.data();
        adminEmail.textContent = user.email;
        inpNewEmail.value = user.email;
        loadProducts(user.uid);
        loadSettings(user.uid);
        loadStats(user.uid);
        loadDashboardStats(user.uid);
      } else {
        toast('Akun ini belum terdaftar sebagai toko! Hubungi admin.', 'err');
        setTimeout(() => signOut(auth), 2000);
      }
    } else {
      window.location.href = 'login-user.html';
    }
  });

  // ── COPY LINK ──
  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return toast('Login dulu!', 'err');
      const link = `${window.location.origin}/?uid=${uid}`;
      navigator.clipboard.writeText(link)
        .then(() => toast('Link toko berhasil dicopy!'))
        .catch(() => toast('Gagal copy link', 'err'));
    });
  }

  btnLogout.addEventListener('click', () => {
    if (confirm('Yakin mau keluar?')) signOut(auth);
  });

  // ── PREMIUM UI UPDATE ──
  function updatePremiumUI() {
    const isPrem = checkPremium(currentTokoData);
    premiumBadge.classList.toggle('hidden', !isPrem);
    premiumCta.classList.toggle('hidden', isPrem);
    premiumContent.classList.toggle('hidden', !isPrem);
    if (isPrem) {
      currentAccent = currentTokoData.premium?.accentColor || '#FF6B35';
      renderColorPicker();
      renderQR();
    }
  }

  // ── DASHBOARD STATS (total produk & stok habis) ──
  async function loadDashboardStats(uid) {
    try {
      const snap = await getDocs(produkCol(uid));
      let total = 0, empty = 0;
      snap.forEach(d => { total++; if (d.data().stok === 0) empty++; });
      document.getElementById('stat-total').textContent = total;
      document.getElementById('stat-empty').textContent = empty;
    } catch (e) { console.error('loadDashboardStats:', e); }
  }

  // ── PREMIUM: STATISTIK 7 HARI ──
  async function loadStats(uid) {
    updatePremiumUI();
    const isPrem = checkPremium(currentTokoData);
    if (!isPrem) return;

    try {
      const today = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
      }

      const q = query(
        collection(db, 'toko', uid, 'stats'),
        where('__name__', '>=', days[0]),
        where('__name__', '<=', days[6]),
        orderBy('__name__')
      );
      const snap = await getDocs(q);

      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });

      let totalVisits = 0, totalWa = 0, totalShopee = 0;
      const chartData = [];

      days.forEach(day => {
        const d = data[day] || {};
        const v = d.visits || 0;
        const w = d.waClicks || 0;
        const s = d.shopeeClicks || 0;
        totalVisits += v;
        totalWa += w;
        totalShopee += s;
        chartData.push({ day, label: formatDate(day), visits: v, wa: w, shopee: s });
      });

      const maxVisits = Math.max(...chartData.map(d => d.visits), 1);

      document.getElementById('stat-visits').textContent = totalVisits;
      document.getElementById('stat-wa').textContent = totalWa;
      document.getElementById('stat-shopee').textContent = totalShopee;

      const chartEl = document.getElementById('stats-chart');
      if (!chartEl) return;
      chartEl.innerHTML = chartData.map(d => {
        const h = Math.max((d.visits / maxVisits) * 100, 4);
        return `
          <div class="chart-col">
            <div class="chart-bar" style="height:${h}%"></div>
            <span class="chart-label">${d.label}</span>
            <span class="chart-val">${d.visits}</span>
          </div>`;
      }).join('');

      // Premium expiry info
      const endDate = currentTokoData.premium?.endDate;
      if (endDate) {
        const end = endDate?.toDate ? endDate.toDate() : new Date(endDate);
        document.getElementById('premium-expiry').textContent =
          'Berlaku sampai ' + end.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    } catch (e) {
      console.error('loadStats:', e);
    }
  }

  // ── PREMIUM: COLOR PICKER ──
  function renderColorPicker() {
    const wrap = document.getElementById('color-options');
    if (!wrap) return;
    wrap.innerHTML = ACCENT_COLORS.map(c => `
      <button type="button" class="color-circle${c.hex === currentAccent ? ' active' : ''}"
              data-color="${c.hex}" style="background:${c.hex}" title="${c.label}"
              aria-label="Warna ${c.label}"></button>
    `).join('');

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
        } catch (e) {
          toast('Gagal simpan warna', 'err');
        }
      });
    });
  }

  // ── PREMIUM: QR CODE ──
  function renderQR() {
    const uid = auth.currentUser?.uid;
    if (!uid || !qrImg) return;
    const storeUrl = `${window.location.origin}/?uid=${uid}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(storeUrl)}&color=${encodeURIComponent(currentAccent.replace('#', ''))}`;
    qrImg.dataset.url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(storeUrl)}&color=${encodeURIComponent(currentAccent.replace('#', ''))}&format=png`;
  }

  if (btnDownloadQR) {
    btnDownloadQR.addEventListener('click', async () => {
      const url = qrImg?.dataset.url;
      if (!url) return;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `qr-${currentTokoData?.namaToko || 'toko'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast('QR Code berhasil didownload!');
      } catch (e) {
        window.open(url, '_blank');
      }
    });
  }

  // ── PRODUK: LOAD ──
  async function loadProducts(uid) {
    productsList.innerHTML = `
      <div class="skel-card"><div class="skel" style="height:130px;border-radius:14px 14px 0 0"></div><div style="padding:10px 12px"><div class="skel" style="height:12px;width:70%;margin-bottom:7px"></div><div class="skel" style="height:13px;width:45%"></div></div></div>
      <div class="skel-card"><div class="skel" style="height:130px;border-radius:14px 14px 0 0"></div><div style="padding:10px 12px"><div class="skel" style="height:12px;width:55%;margin-bottom:7px"></div><div class="skel" style="height:13px;width:40%"></div></div></div>
      <div class="skel-card"><div class="skel" style="height:130px;border-radius:14px 14px 0 0"></div><div style="padding:10px 12px"><div class="skel" style="height:12px;width:80%;margin-bottom:7px"></div><div class="skel" style="height:13px;width:50%"></div></div></div>`;
    try {
      const q = query(produkCol(uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);

      if (snap.empty) {
        productsList.innerHTML = `<div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
            <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
          </svg>
          <p class="empty-h">Belum ada produk</p>
          <p class="empty-p">Klik "Tambah Produk" untuk mulai.</p>
        </div>`;
        return;
      }

      let html = '';
      snap.forEach(ds => {
        const p = ds.data(), id = ds.id;
        const stokNol = Number(p.stok) === 0;
        html += `
          <div class="p-card">
            <img class="p-img" src="${escHtml(p.img)}" alt="${escHtml(p.nama)}"
                 onerror="this.src='https://placehold.co/400x300/F4F4F4/AAA?text=Error'">
            <div class="p-body">
              <div class="p-name">${escHtml(p.nama)}</div>
              <div class="p-price">Rp${Number(p.harga).toLocaleString('id-ID')}</div>
              <div class="p-stock">Stok: ${p.stok}${stokNol ? ' · <span style="color:var(--danger)">Habis</span>' : ''}</div>
              <div class="p-acts">
                <button type="button" class="btn-ed" data-id="${id}">Edit</button>
                <button type="button" class="btn-del" data-id="${id}">Hapus</button>
              </div>
            </div>
          </div>`;
      });
      productsList.innerHTML = html;
    } catch (e) {
      productsList.innerHTML = `<div class="empty"><p class="empty-h">Gagal memuat produk</p><p class="empty-p">${e.message}</p></div>`;
    }
  }

  // ── MODAL ──
  function openModal()  { productModal.classList.add('open');    document.body.style.overflow = 'hidden'; }
  function closeModal() { productModal.classList.remove('open'); document.body.style.overflow = ''; }

  btnAddProd.addEventListener('click', () => {
    productForm.reset();
    document.getElementById('inp-prod-id').value  = '';
    document.getElementById('inp-prod-img').value = '';
    inpProdFile.value = '';
    if (prodBlobUrl) { URL.revokeObjectURL(prodBlobUrl); prodBlobUrl = null; }
    imgPrevWrap.style.display = 'none';
    imgPreview.src = '';
    modalTitle.textContent = 'Tambah Produk Baru';
    openModal();
  });

  modalPull.addEventListener('click', closeModal);
  productModal.addEventListener('click', e => { if (e.target === productModal) closeModal(); });

  uploadZone.addEventListener('click', () => inpProdFile.click());
  inpProdFile.addEventListener('change', () => {
    const file = inpProdFile.files[0];
    if (!file) return;
    if (prodBlobUrl) URL.revokeObjectURL(prodBlobUrl);
    prodBlobUrl = URL.createObjectURL(file);
    imgPreview.src = prodBlobUrl;
    imgPrevWrap.style.display = 'block';
  });

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
        document.getElementById('inp-prod-id').value    = id;
        document.getElementById('inp-prod-name').value  = p.nama      || '';
        document.getElementById('inp-prod-price').value = p.harga     || 0;
        document.getElementById('inp-prod-stock').value = p.stok      || 0;
        document.getElementById('inp-prod-desc').value  = p.deskripsi || '';
        document.getElementById('inp-prod-shopee').value= p.shopee    || '';
        document.getElementById('inp-prod-wa').value    = p.wa        || '';
        document.getElementById('inp-prod-img').value   = p.img       || '';
        inpProdFile.value = '';
        if (p.img) {
          if (prodBlobUrl) URL.revokeObjectURL(prodBlobUrl);
          prodBlobUrl = null;
          imgPreview.src = p.img;
          imgPrevWrap.style.display = 'block';
        } else {
          imgPrevWrap.style.display = 'none';
        }
        modalTitle.textContent = 'Edit Produk';
        openModal();
      } catch (err) { toast('Gagal load data: ' + err.message, 'err'); }
    }

    if (btn.classList.contains('btn-del')) {
      if (!confirm('Yakin hapus produk ini?')) return;
      try {
        await deleteDoc(produkDoc(uid, id));
        toast('Produk dihapus.');
        loadProducts(uid);
        loadDashboardStats(uid);
      } catch (err) { toast('Gagal hapus: ' + err.message, 'err'); }
    }
  });

  productForm.addEventListener('submit', async e => {
    e.preventDefault();
    const uid  = auth.currentUser?.uid;
    const id   = document.getElementById('inp-prod-id').value;
    const file = inpProdFile.files[0];
    let imgUrl = document.getElementById('inp-prod-img').value;

    if (!file && !imgUrl) { toast('Pilih foto produk!', 'warn'); return; }

    btnSaveProd.disabled = true;
    try {
      if (file) {
        btnSaveProd.textContent = 'Upload foto...';
        imgUrl = await uploadCloudinary(file);
        if (!imgUrl) throw new Error('Upload foto gagal.');
      }

      btnSaveProd.textContent = 'Menyimpan...';
      const data = {
        nama:      document.getElementById('inp-prod-name').value.trim(),
        harga:     Number(document.getElementById('inp-prod-price').value),
        stok:      Number(document.getElementById('inp-prod-stock').value),
        deskripsi: document.getElementById('inp-prod-desc').value.trim(),
        shopee:    document.getElementById('inp-prod-shopee').value.trim(),
        wa:        document.getElementById('inp-prod-wa').value.trim(),
        img:       imgUrl,
        updatedAt: serverTimestamp()
      };

      if (id) {
        await updateDoc(produkDoc(uid, id), data);
        toast('Produk diperbarui!');
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(produkCol(uid), data);
        toast('Produk ditambahkan!');
      }
      closeModal();
      loadProducts(uid);
      loadDashboardStats(uid);
    } catch (err) { toast('Error: ' + err.message, 'err'); }
    finally {
      btnSaveProd.disabled = false;
      btnSaveProd.textContent = 'Simpan Produk';
    }
  });

  // ── SETTINGS: LOAD ──
  async function loadSettings(uid) {
    try {
      const snap = await getDoc(doc(db, 'toko', uid));
      if (snap.exists()) {
        currentTokoData = snap.data();
        const s = currentTokoData;
        inpUsername.value = s.namaToko || '';
        inpBio.value      = s.bio      || '';
        inpWa.value       = s.wa       || '';
        inpShopee.value   = s.shopee   || '';
        inpLogoUrl.value  = s.logo     || '';
        if (s.logo) logoPreview.src = s.logo;
        updatePremiumUI();
      }
    } catch (e) { console.error('loadSettings:', e); }
  }

  btnLogoPick.addEventListener('click', () => inpLogoFile.click());
  inpLogoFile.addEventListener('change', () => {
    const file = inpLogoFile.files[0];
    if (!file) return;
    if (logoBlobUrl) URL.revokeObjectURL(logoBlobUrl);
    logoBlobUrl = URL.createObjectURL(file);
    logoPreview.src = logoBlobUrl;
  });

  btnSaveSett.addEventListener('click', async () => {
    const uid = auth.currentUser?.uid;
    btnSaveSett.disabled = true;
    btnSaveSett.textContent = 'Menyimpan...';
    try {
      let logoUrl = inpLogoUrl.value;
      const file  = inpLogoFile.files[0];
      if (file) {
        logoUrl = await uploadCloudinary(file);
        if (!logoUrl) throw new Error('Upload logo gagal.');
        inpLogoUrl.value = logoUrl;
      }
      await setDoc(doc(db, 'toko', uid), {
        namaToko: inpUsername.value.trim(),
        bio:      inpBio.value.trim(),
        wa:       inpWa.value.trim(),
        shopee:   inpShopee.value.trim(),
        logo:     logoUrl
      }, { merge: true });
      toast('Pengaturan disimpan!');
    } catch (err) { toast('Gagal simpan: ' + err.message, 'err'); }
    finally {
      btnSaveSett.disabled = false;
      btnSaveSett.textContent = 'Simpan Pengaturan';
    }
  });

  // ── AKUN: UPDATE ──
  btnSaveAcc.addEventListener('click', async () => {
    const newEmail = inpNewEmail.value.trim();
    const newPass  = inpNewPass.value;
    const oldPass  = inpOldPass.value;
    const user     = auth.currentUser;

    if (!oldPass) { toast('Masukkan password lama!', 'warn'); return; }
    if (newEmail === user.email && !newPass) { toast('Tidak ada perubahan.', 'warn'); return; }

    btnSaveAcc.disabled = true;
    btnSaveAcc.textContent = 'Memverifikasi...';
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
      toast('Akun diperbarui! Keluar otomatis...');
      setTimeout(() => signOut(auth), 1800);
    } catch (err) {
      const msg = err.code === 'auth/wrong-password' ? 'Password lama salah!' : err.message;
      toast(msg, 'err');
    } finally {
      btnSaveAcc.disabled = false;
      btnSaveAcc.textContent = 'Update Akun';
    }
  });

  // ── CLOUDINARY ──
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

});
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CLOUDINARY_CLOUD_NAME = "dxq06iq2r";
const CLOUDINARY_UPLOAD_PRESET = "tokobudi";

// DOM Elements
const logoutBtn = document.getElementById('logout-btn');
const adminEmailSpan = document.getElementById('admin-email');
const productsList = document.getElementById('products-list');
const addProductBtn = document.getElementById('add-product-btn');
const productModal = document.getElementById('product-modal');
const closeBtn = document.querySelector('.modal-handle'); 
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const saveProductBtn = document.getElementById('save-product-btn');
const imagePreviewContainer = document.getElementById('image-preview');
const imagePreview = imagePreviewContainer ? imagePreviewContainer.querySelector('img') : null;
const fileInput = document.getElementById('product-image-file');
const logoPreview = document.getElementById('logo-preview');
const logoFileInput = document.getElementById('logo-file');
const logoUrlInput = document.getElementById('logo-url');
const usernameInput = document.getElementById('username-input');
const bioInput = document.getElementById('bio-input');
const waInput = document.getElementById('wa-input');
const shopeeInput = document.getElementById('shopee-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const saveAccountBtn = document.getElementById('save-account-btn');

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  startClock();
});

// LOGIKA TOAST
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#1A1A2E' : type === 'error' ? '#EE4D2D' : '#854F0B';
  toast.style.display = 'block';
  toast.style.animation = 'toastIn 0.3s ease forwards';
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2500);
}

// LOGIKA JAM
function startClock() {
  const update = () => {
    const n = new Date();
    const t = n.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const d = n.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const lc = document.getElementById('live-clock');
    const bc = document.getElementById('big-clock');
    const bd = document.getElementById('big-date');
    if(lc) lc.textContent = t;
    if(bc) bc.textContent = t;
    if(bd) bd.textContent = d;
  };
  update();
  setInterval(update, 1000);
}

// LOGIKA UPLOAD TRIGGER
const uploadTrigger = document.getElementById('upload-trigger');
const realFileInput = document.getElementById('product-image-file');
if (uploadTrigger && realFileInput) {
  uploadTrigger.onclick = () => realFileInput.click();
}

// LOGIKA TABS
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('sidebar-active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      b.classList.add('sidebar-active');
      document.getElementById(`page-${b.dataset.page}`).classList.add('active');
    };
  });
}

// LOGIKA STATISTIK
async function loadStats() {
  const q = query(collection(db, "products"));
  const s = await getDocs(q);
  let t = 0, e = 0;
  s.forEach(d => { t++; if(d.data().stok == 0) e++; });
  document.getElementById('stat-total').textContent = t;
  document.getElementById('stat-empty').textContent = e;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    adminEmailSpan.textContent = user.email;
    document.getElementById('new-email-input').value = user.email;
    loadProducts();
    loadSettings();
    loadStats();
  } else {
    window.location.href = 'login.html';
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

// ==================== PRODUK CRUD ====================
async function loadProducts() {
  productsList.innerHTML = '<div class="skeleton h-24 rounded-2xl"></div>';
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const s = await getDocs(q);
  if (s.empty) {
    productsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" ry="2"/><path d="M12 12h.01"/><path d="M12 8v4M12 16v4"/></svg>
        </div>
        <p class="empty-title">Belum ada produk</p>
        <p class="empty-desc">Klik tombol "+ Tambah Produk" untuk menambahkan item baru.</p>
      </div>`;
    return;
  }
  productsList.innerHTML = '';
  s.forEach((docSnap) => {
    const p = docSnap.data();
    const id = docSnap.id;
    const card = document.createElement('div');
    card.className = "product-card";
    card.style.animationDelay = `${Math.random() * 0.2}s`;
    card.innerHTML = `
        <img src="${p.img}" alt="${p.nama}" class="product-img">
        <div class="product-info">
            <div class="product-name truncate">${p.nama}</div>
            <div class="product-price">Rp${p.harga.toLocaleString('id-ID')}</div>
            <div class="product-stock">Stok: ${p.stok}</div>
        </div>
        <div class="product-actions">
            <button class="btn-edit" data-id="${id}">Edit</button>
            <button class="btn-hapus" data-id="${id}">Hapus</button>
        </div>`;
    productsList.appendChild(card);
  });
}


addProductBtn.addEventListener('click', () => {
  productForm.reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-image-url').value = '';
  imagePreviewContainer.style.display = 'none';
  fileInput.value = '';
  modalTitle.textContent = 'Tambah Produk Baru';
  productModal.style.display = 'flex';
});

const closeModal = () => productModal.style.display = 'none';
closeBtn.addEventListener('click', closeModal);
productModal.addEventListener('click', (e) => { if (e.target === productModal) closeModal(); });

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    imagePreview.src = URL.createObjectURL(file);
    imagePreviewContainer.style.display = 'block';
  }
});

productsList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('btn-edit')) {
    const ds = await getDoc(doc(db, "products", id));
    const p = ds.data();
    document.getElementById('product-id').value = id;
    document.getElementById('product-name').value = p.nama;
    document.getElementById('product-price').value = p.harga;
    // Pastikan ID elemen di HTML bener, misalnya stock/desc
    // Tapi sesuai kode sebelumnya, gw biarin ini mengambil apa yang ada
    document.getElementById('product-stock').value = p.stok || 0;
    document.getElementById('product-description').value = p.deskripsi || '';
    document.getElementById('product-wa').value = p.wa || '';
    document.getElementById('product-shopee').value = p.shopee || '';
    document.getElementById('product-image-url').value = p.img || '';
    if(p.img) {
      imagePreview.src = p.img;
      imagePreviewContainer.style.display = 'block';
    }
    productModal.style.display = 'flex';
  } else if (e.target.classList.contains('btn-hapus')) {
    if (confirm('Yakin mau hapus produk ini?')) {
      await deleteDoc(doc(db, "products", id));
      loadProducts();
      loadStats();
      showToast('Produk dihapus', 'error');
    }
  }
});

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const file = fileInput.files[0];
  let finalImageUrl = document.getElementById('product-image-url').value;
  
  if (file) {
    saveProductBtn.classList.add('loading');
    saveProductBtn.textContent = 'Upload foto...';
    finalImageUrl = await uploadToCloudinary(file);
    if (!finalImageUrl) {
      saveProductBtn.classList.remove('loading');
      saveProductBtn.textContent = 'Simpan Produk';
      return;
    }
  }
  
  if (!finalImageUrl) {
    saveProductBtn.classList.remove('loading');
    saveProductBtn.textContent = 'Simpan Produk';
    return;
  }
  
  const productData = {
    nama: document.getElementById('product-name').value,
    harga: Number(document.getElementById('product-price').value), // DIBENERIN PAKE NUMBER
    stok: Number(document.getElementById('product-stock').value), // DIBENERIN PAKE NUMBER
    deskripsi: document.getElementById('product-description').value,
    wa: document.getElementById('product-wa').value,
    shopee: document.getElementById('product-shopee').value,
    img: finalImageUrl,
    updatedAt: serverTimestamp()
  };
  
  try {
    saveProductBtn.classList.add('loading');
    saveProductBtn.textContent = 'Menyimpan...';
    if (id) {
      await updateDoc(doc(db, "products", id), productData);
      showToast('Produk berhasil diperbarui!');
    } else {
      productData.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), productData);
      showToast('Produk berhasil ditambahkan!');
    }
    closeModal();
    loadProducts();
    loadStats(); // Refresh stat
  } catch (error) {
    showToast('Gagal menyimpan: ' + error.message, 'error');
  } finally {
    saveProductBtn.classList.remove('loading');
    saveProductBtn.textContent = 'Simpan Produk';
  }
});

// ==================== PENGATURAN TOKO ====================
async function loadSettings() {
  // DIBENERIN: Tambahin kurung tutup disini
  const ds = await getDoc(doc(db, "settings", "toko")); 
  if (ds.exists()) {
    const s = ds.data();
    usernameInput.value = s.username || '';
    bioInput.value = s.bio || '';
    waInput.value = s.wa || '';
    shopeeInput.value = s.shopee || '';
    logoUrlInput.value = s.logo || '';
    logoPreview.src = s.logo || 'https://placehold.co/200x200/F3F4F6/AAAAAA?text=Logo';
  }
}

const uploadTriggerLogo = document.getElementById('logo-file');
if(uploadTriggerLogo) {
  uploadTriggerLogo.onclick = () => document.getElementById('logo-file-hidden').click();
}

// Listen untuk perubahan pada logo file hidden input
const logoFileHiddenInput = document.getElementById('logo-file-hidden');
if(logoFileHiddenInput) {
  logoFileHiddenInput.addEventListener('change', () => {
    const file = logoFileHiddenInput.files[0];
    if (file) {
      logoPreview.src = URL.createObjectURL(file);
    }
  });
}

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.textContent = 'Menyimpan...';
  saveSettingsBtn.classList.add('loading');
  
  let finalLogoUrl = logoUrlInput.value;
  const file = document.getElementById('logo-file-hidden').files[0];
  
  if (file) {
    finalLogoUrl = await uploadToCloudinary(file);
    if (!finalLogoUrl) {
      saveSettingsBtn.textContent = 'Simpan Pengaturan Toko';
      saveSettingsBtn.classList.remove('loading');
      return;
    }
  }
  
  const settingsData = {
    username: usernameInput.value,
    bio: bioInput.value,
    wa: waInput.value,
    shopee: shopeeInput.value, // DIBENERIN: HURUF 'K' DIHAPUS
    logo: finalLogoUrl
  };
  
  try {
    await setDoc(doc(db, "settings", "toko"), settingsData);
    showToast('Pengaturan tersimpan!');
  } catch (error) {
    showToast('Gagal simpan: ' + error.message, 'error');
  } finally {
    saveSettingsBtn.textContent = 'Simpan Pengaturan Toko';
    saveSettingsBtn.classList.remove('loading');
  }
});

// ==================== KEAMANAN AKUN ====================
saveAccountBtn.addEventListener('click', async () => {
  const ne = document.getElementById('new-email-input').value;
  const np = document.getElementById('new-password-input').value;
  const cp = document.getElementById('reauth-password-input').value;
  
  if (!cp) return showToast('Wajib masukkan password lama!', 'warning');
  if (ne === auth.currentUser.email && !np) return showToast('Tidak ada perubahan.', 'warning');
  
  saveAccountBtn.textContent = 'Memverifikasi...';
  saveAccountBtn.classList.add('loading');
  saveAccountBtn.style.pointerEvents = 'none';
  
  try {
    const u = auth.currentUser;
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cp));
    if (ne !== u.email) { if (!ne.includes('@')) throw new Error('Format email salah!'); await updateEmail(u, ne); }
    if (np) { if (np.length < 6) throw new Error('Password min 6 karakter!'); await updatePassword(u, np); }
    showToast('Akun diperbarui! Keluar otomatis...');
    setTimeout(() => signOut(auth), 1500);
  } catch (error) {
    let msg = error.message;
    if (error.code === 'auth/wrong-password') msg = 'Password lama SALAH!';
    showToast(msg, 'error');
  } finally {
    saveAccountBtn.textContent = 'Update Akun';
    saveAccountBtn.classList.remove('loading');
    saveAccountBtn.style.pointerEvents = 'auto';
  }
});

// ==================== HELPER CLOUDINARY ====================
async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    if (d.secure_url) return d.secure_url;
    throw new Error('Upload gagal');
  } catch (error) {
    showToast('Gagal upload foto', 'error');
    return null;
  }
}

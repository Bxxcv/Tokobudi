const CLOUDINARY_CLOUD_NAME = "dxq06iq2r";
const CLOUDINARY_UPLOAD_PRESET = "tokobudi_unsigned";

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const logoutBtn = document.getElementById('logout-btn');
const adminEmailSpan = document.getElementById('admin-email');
const saveAccountBtn = document.getElementById('save-account-btn');
const productsList = document.getElementById('products-list');
const addProductBtn = document.getElementById('add-product-btn');
const productModal = document.getElementById('product-modal');
const closeBtn = document.querySelector('.close-btn');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const saveProductBtn = document.getElementById('save-product-btn');
const imagePreview = document.getElementById('image-preview');
const fileInput = document.getElementById('product-image-file');
const logoPreview = document.getElementById('logo-preview');
const logoFileInput = document.getElementById('logo-file');
const logoUrlInput = document.getElementById('logo-url');
const usernameInput = document.getElementById('username-input');
const bioInput = document.getElementById('bio-input');
const waInput = document.getElementById('wa-input');
const shopeeInput = document.getElementById('shopee-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');

document.addEventListener('DOMContentLoaded', () => { lucide.createIcons(); setupTabs(); startClock(); });

function startClock() {
  const updateClock = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('live-clock').textContent = timeStr;
    document.getElementById('live-date').textContent = dateStr;
    document.getElementById('big-clock').textContent = timeStr;
    document.getElementById('big-date').textContent = dateStr;
  };
  updateClock(); setInterval(updateClock, 1000);
}

async function loadStats() {
  const q = query(collection(db, "products"));
  const querySnapshot = await getDocs(q);
  let total = 0, empty = 0;
  querySnapshot.forEach((docSnap) => { total++; if (docSnap.data().stok == 0) empty++; });
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-empty').textContent = empty;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const box = document.getElementById('toast-box');
  if (isError) {
    box.className = "earth-card p-4 text-sm font-bold text-center flex items-center justify-center gap-2 border border-red-200 text-red-600";
    box.innerHTML = `<i data-lucide="alert-circle" class="w-5 h-5"></i><span>${message}</span>`;
  } else {
    box.className = "earth-card p-4 text-sm font-bold text-center flex items-center justify-center gap-2 border border-green-200 text-green-700";
    box.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span>${message}</span>`;
  }
  lucide.createIcons();
  toast.classList.remove('-translate-y-10', 'opacity-0', 'pointer-events-none');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => { toast.classList.add('-translate-y-10', 'opacity-0', 'pointer-events-none'); toast.classList.remove('translate-y-0', 'opacity-100'); }, 3000);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    adminEmailSpan.textContent = user.email;
    document.getElementById('new-email-input').value = user.email;
    loadProducts(); loadSettings(); loadStats();
  } else { window.location.href = 'login.html'; }
});

logoutBtn.addEventListener('click', () => signOut(auth));

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('sidebar-active', 'text-white'); b.classList.add('text-stone-500'); });
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('sidebar-active', 'text-white'); btn.classList.remove('text-stone-500');
      document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
      if(btn.dataset.page === 'dashboard') loadStats();
    };
  });
}

saveAccountBtn.addEventListener('click', async () => {
  const newEmail = document.getElementById('new-email-input').value;
  const newPassword = document.getElementById('new-password-input').value;
  const currentPassword = document.getElementById('reauth-password-input').value;
  if (!currentPassword) return showToast('Wajib masukkan password lama!', true);
  if (newEmail === auth.currentUser.email && !newPassword) return showToast('Tidak ada perubahan.', true);
  saveAccountBtn.disabled = true;
  saveAccountBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Memverifikasi...'; lucide.createIcons();
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    if (newEmail !== user.email) { if (!newEmail.includes('@')) throw new Error('Format email salah!'); await updateEmail(user, newEmail); }
    if (newPassword) { if (newPassword.length < 6) throw new Error('Password min 6 karakter!'); await updatePassword(user, newPassword); }
    showToast('Akun berhasil diperbarui! Keluar otomatis...'); setTimeout(() => signOut(auth), 1500);
  } catch (error) {
    let msg = error.message;
    if (error.code === 'auth/wrong-password') msg = 'Password lama SALAH!';
    else if (error.code === 'auth/email-already-in-use') msg = 'Email baru sudah dipakai!';
    showToast(msg, true);
  } finally { saveAccountBtn.disabled = false; saveAccountBtn.innerHTML = '<i data-lucide="key" class="w-4 h-4"></i> Update Akun'; lucide.createIcons(); }
});

async function loadProducts() {
  productsList.innerHTML = '<div class="skeleton h-28 rounded-2xl"></div>';
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  productsList.innerHTML = '';
  if (querySnapshot.empty) {
    productsList.innerHTML = `<div class="text-center py-16"><i data-lucide="package-open" class="lucide w-20 h-20 mx-auto text-stone-200 mb-4"></i><p class="text-stone-400 text-sm font-medium">Belum ada produk ditambahkan</p></div>`; lucide.createIcons(); return;
  }
  querySnapshot.forEach((docSnap) => {
    const p = docSnap.data();
    const card = document.createElement('div');
    card.className = "earth-card p-3 flex items-center gap-3";
    card.innerHTML = `<img src="${p.img}" alt="${p.nama}" class="w-16 h-16 object-cover rounded-xl flex-shrink-0"><div class="flex-1 min-w-0"><h3 class="font-bold text-sm truncate text-[#3E2723]">${p.nama}</h3><p class="text-amber-800 font-bold text-sm">Rp${p.harga.toLocaleString('id-ID')}</p><p class="text-xs text-stone-400">Stok: ${p.stok}</p></div><div class="flex flex-col gap-1"><button class="edit-btn bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs" data-id="${docSnap.id}">Edit</button><button class="delete-btn bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs" data-id="${docSnap.id}">Hapus</button></div>`;
    productsList.appendChild(card);
  });
}

addProductBtn.addEventListener('click', () => { productForm.reset(); document.getElementById('product-id').value = ''; document.getElementById('product-image-url').value = ''; imagePreview.style.display = 'none'; fileInput.value = ''; modalTitle.textContent = 'Tambah Produk Baru'; productModal.style.display = 'flex'; });
const closeModal = () => productModal.style.display = 'none';
closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => { if (e.target == productModal) closeModal(); });
fileInput.addEventListener('change', () => { const file = fileInput.files[0]; if (file) { if (imagePreview.src.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src); imagePreview.src = URL.createObjectURL(file); imagePreview.style.display = 'block'; } });

productsList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('edit-btn')) {
    const docSnap = await getDoc(doc(db, "products", id)); const p = docSnap.data();
    document.getElementById('product-id').value = id; document.getElementById('product-name').value = p.nama; document.getElementById('product-price').value = p.harga; document.getElementById('product-stock').value = p.stok; document.getElementById('product-description').value = p.deskripsi || ''; document.getElementById('product-wa').value = p.wa || ''; document.getElementById('product-shopee').value = p.shopee || ''; document.getElementById('product-image-url').value = p.img; imagePreview.src = p.img; imagePreview.style.display = 'block'; fileInput.value = ''; modalTitle.textContent = 'Edit Produk'; productModal.style.display = 'flex';
  }
  if (e.target.classList.contains('delete-btn')) { if (confirm('Yakin mau hapus produk ini?')) { await deleteDoc(doc(db, "products", id)); loadProducts(); showToast('Produk berhasil dihapus!'); } }
});

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('product-id').value; const file = fileInput.files[0]; let finalImageUrl = document.getElementById('product-image-url').value;
  if (file) { saveProductBtn.disabled = true; saveProductBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Upload foto...'; lucide.createIcons(); finalImageUrl = await uploadToCloudinary(file); if (!finalImageUrl) { saveProductBtn.disabled = false; saveProductBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Simpan Produk'; lucide.createIcons(); return; } }
  if (!finalImageUrl) return showToast('Gambar wajib diisi!', true);
  const productData = { nama: document.getElementById('product-name').value, harga: Number(document.getElementById('product-price').value), stok: Number(document.getElementById('product-stock').value), deskripsi: document.getElementById('product-description').value, wa: document.getElementById('product-wa').value, shopee: document.getElementById('product-shopee').value, img: finalImageUrl, updatedAt: serverTimestamp() };
  saveProductBtn.disabled = true; saveProductBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Menyimpan...'; lucide.createIcons();
  try {
    if (id) { await updateDoc(doc(db, "products", id), productData); showToast('Produk berhasil diperbarui!'); } else { productData.createdAt = serverTimestamp(); await addDoc(collection(db, "products"), productData); showToast('Produk berhasil ditambahkan!'); }
    closeModal(); loadProducts(); loadStats();
  } catch (error) { showToast('Gagal menyimpan: ' + error.message, true); } finally { saveProductBtn.disabled = false; saveProductBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Simpan Produk'; lucide.createIcons(); }
});

async function loadSettings() {
  const docSnap = await getDoc(doc(db, "settings", "toko"));
  if (docSnap.exists()) { const s = docSnap.data(); usernameInput.value = s.username || ''; bioInput.value = s.bio || ''; waInput.value = s.wa || ''; shopeeInput.value = s.shopee || ''; logoUrlInput.value = s.logo || ''; logoPreview.src = s.logo || 'https://picsum.photos/id/64/200/200'; }
}
logoFileInput.addEventListener('change', () => { const file = logoFileInput.files[0]; if (file) { if (logoPreview.src.startsWith('blob:')) URL.revokeObjectURL(logoPreview.src); logoPreview.src = URL.createObjectURL(file); } });

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true; saveSettingsBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Menyimpan...'; lucide.createIcons();
  let finalLogoUrl = logoUrlInput.value; const file = logoFileInput.files[0];
  if (file) { saveSettingsBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Upload logo...'; lucide.createIcons(); finalLogoUrl = await uploadToCloudinary(file); if (!finalLogoUrl) { saveSettingsBtn.disabled = false; saveSettingsBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Simpan Pengaturan Toko'; lucide.createIcons(); return; } }
  try { await setDoc(doc(db, "settings", "toko"), { username: usernameInput.value, bio: bioInput.value, wa: waInput.value, shopee: shopeeInput.value, logo: finalLogoUrl }); showToast('Pengaturan toko berhasil disimpan!'); logoFileInput.value = ''; } catch (error) { showToast('Gagal simpan: ' + error.message, true); } finally { saveSettingsBtn.disabled = false; saveSettingsBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Simpan Pengaturan Toko'; lucide.createIcons(); }
});

async function uploadToCloudinary(file) {
  const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  try { const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData }); const data = await res.json(); if (data.secure_url) return data.secure_url; throw new Error(data.error?.message || 'Upload gagal'); } catch (error) { showToast('Gagal upload foto: ' + error.message, true); return null; }
}

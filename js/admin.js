const CLOUDINARY_CLOUD_NAME = "dxq06iq2r";
const CLOUDINARY_UPLOAD_PRESET = "tokobudi_unsigned";

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// DOM Elements - Umum
const logoutBtn = document.getElementById('logout-btn');
const adminEmailSpan = document.getElementById('admin-email');
const saveAccountBtn = document.getElementById('save-account-btn');

// DOM Elements - Produk
const productsList = document.getElementById('products-list');
const addProductBtn = document.getElementById('add-product-btn');
const productModal = document.getElementById('product-modal');
const closeBtn = document.querySelector('.close-btn');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const saveProductBtn = document.getElementById('save-product-btn');
const imagePreview = document.getElementById('image-preview');
const fileInput = document.getElementById('product-image-file');

// DOM Elements - Pengaturan
const logoPreview = document.getElementById('logo-preview');
const logoFileInput = document.getElementById('logo-file');
const logoUrlInput = document.getElementById('logo-url');
const usernameInput = document.getElementById('username-input');
const bioInput = document.getElementById('bio-input');
const waInput = document.getElementById('wa-input');
const shopeeInput = document.getElementById('shopee-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupTabs();
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    adminEmailSpan.textContent = user.email;
    document.getElementById('new-email-input').value = user.email; // Isi email saat ini
    loadProducts();
    loadSettings();
  } else {
    window.location.href = 'login.html';
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('sidebar-active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('sidebar-active');
      document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
    };
  });
}

// ==================== KEAMANAN AKUN (BARU) ====================
saveAccountBtn.addEventListener('click', async () => {
  const newPassword = document.getElementById('new-password-input').value;
  const currentPassword = document.getElementById('reauth-password-input').value;

  if (!currentPassword) {
    return alert('⚠️ Wajib masukkan password lama untuk keamanan!');
  }

  if (!newPassword) {
    return alert('Masukkan password baru jika ingin mengganti.');
  }

  if (newPassword.length < 6) {
    return alert('Password baru minimal 6 karakter!');
  }

  saveAccountBtn.disabled = true;
  saveAccountBtn.textContent = 'Memverifikasi...';

  try {
    const user = auth.currentUser;
    // 1. WAJIB: Re-authenticate dulu pakai password lama
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // 2. Kalau sukses, baru update password
    await updatePassword(user, newPassword);
    
    alert('✅ Password berhasil diubah!');
    document.getElementById('new-password-input').value = '';
    document.getElementById('reauth-password-input').value = '';
    
  } catch (error) {
    if (error.code === 'auth/wrong-password') {
      alert('❌ Password lama yang lu masukkan SALAH!');
    } else if (error.code === 'auth/weak-password') {
      alert('❌ Password baru terlalu lemah (min 6 karakter).');
    } else {
      alert('Gagal update: ' + error.message);
    }
  } finally {
    saveAccountBtn.disabled = false;
    saveAccountBtn.innerHTML = '<i data-lucide="key" class="w-4 h-4"></i> Update Password';
    lucide.createIcons();
  }
});

// ==================== PRODUK CRUD ====================
async function loadProducts() {
  productsList.innerHTML = '<div class="skeleton h-24 rounded-2xl"></div>';
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  productsList.innerHTML = '';
  if (querySnapshot.empty) {
    productsList.innerHTML = '<p class="text-center text-white/50 text-sm py-8">Belum ada produk.</p>';
    return;
  }
  querySnapshot.forEach((docSnap) => {
    const p = docSnap.data();
    const card = document.createElement('div');
    card.className = "glass rounded-2xl p-3 flex items-center gap-3";
    card.innerHTML = `
        <img src="${p.img}" alt="${p.nama}" class="w-16 h-16 object-cover rounded-xl flex-shrink-0">
        <div class="flex-1 min-w-0">
            <h3 class="font-bold text-sm truncate">${p.nama}</h3>
            <p class="text-amber-400 font-bold text-sm">Rp${p.harga.toLocaleString('id-ID')}</p>
            <p class="text-xs text-white/50">Stok: ${p.stok}</p>
        </div>
        <div class="flex flex-col gap-1">
            <button class="edit-btn bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg text-xs" data-id="${docSnap.id}">Edit</button>
            <button class="delete-btn bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-xs" data-id="${docSnap.id}">Hapus</button>
        </div>
    `;
    productsList.appendChild(card);
  });
}

addProductBtn.addEventListener('click', () => {
  productForm.reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-image-url').value = '';
  imagePreview.style.display = 'none';
  fileInput.value = '';
  modalTitle.textContent = 'Tambah Produk Baru';
  productModal.style.display = 'flex';
});

const closeModal = () => productModal.style.display = 'none';
closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => { if (e.target == productModal) closeModal(); });

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    if (imagePreview.src.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src);
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.style.display = 'block';
  }
});

productsList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('edit-btn')) {
    const docRef = doc(db, "products", id);
    const docSnap = await getDoc(docRef);
    const p = docSnap.data();
    document.getElementById('product-id').value = id;
    document.getElementById('product-name').value = p.nama;
    document.getElementById('product-price').value = p.harga;
    document.getElementById('product-stock').value = p.stok;
    document.getElementById('product-description').value = p.deskripsi || '';
    document.getElementById('product-wa').value = p.wa || '';
    document.getElementById('product-shopee').value = p.shopee || '';
    document.getElementById('product-image-url').value = p.img;
    imagePreview.src = p.img;
    imagePreview.style.display = 'block';
    fileInput.value = '';
    modalTitle.textContent = 'Edit Produk';
    productModal.style.display = 'flex';
  }
  if (e.target.classList.contains('delete-btn')) {
    if (confirm('Yakin mau hapus produk ini?')) {
      await deleteDoc(doc(db, "products", id));
      loadProducts();
    }
  }
});

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const file = fileInput.files[0];
  let finalImageUrl = document.getElementById('product-image-url').value;
  
  if (file) {
    saveProductBtn.disabled = true;
    saveProductBtn.textContent = 'Upload foto...';
    finalImageUrl = await uploadToCloudinary(file);
    if (!finalImageUrl) {
      saveProductBtn.disabled = false;
      saveProductBtn.textContent = 'Simpan Produk';
      return;
    }
  }
  
  if (!finalImageUrl) return alert('Gambar wajib diisi!');
  
  const productData = {
    nama: document.getElementById('product-name').value,
    harga: Number(document.getElementById('product-price').value),
    stok: Number(document.getElementById('product-stock').value),
    deskripsi: document.getElementById('product-description').value,
    wa: document.getElementById('product-wa').value,
    shopee: document.getElementById('product-shopee').value,
    img: finalImageUrl,
    updatedAt: serverTimestamp()
  };
  
  saveProductBtn.disabled = true;
  saveProductBtn.textContent = 'Menyimpan...';
  
  try {
    if (id) {
      await updateDoc(doc(db, "products", id), productData);
    } else {
      productData.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), productData);
    }
    closeModal();
    loadProducts();
  } catch (error) {
    alert('Gagal menyimpan produk: ' + error.message);
  } finally {
    saveProductBtn.disabled = false;
    saveProductBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Simpan Produk';
    lucide.createIcons();
  }
});

// ==================== PENGATURAN TOKO ====================
async function loadSettings() {
  const docSnap = await getDoc(doc(db, "settings", "toko"));
  if (docSnap.exists()) {
    const s = docSnap.data();
    usernameInput.value = s.username || '';
    bioInput.value = s.bio || '';
    waInput.value = s.wa || '';
    shopeeInput.value = s.shopee || '';
    logoUrlInput.value = s.logo || '';
    logoPreview.src = s.logo || 'https://picsum.photos/id/64/200/200';
  }
}

logoFileInput.addEventListener('change', () => {
  const file = logoFileInput.files[0];
  if (file) {
    if (logoPreview.src.startsWith('blob:')) URL.revokeObjectURL(logoPreview.src);
    logoPreview.src = URL.createObjectURL(file);
  }
});

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = 'Menyimpan...';
  
  let finalLogoUrl = logoUrlInput.value;
  const file = logoFileInput.files[0];
  
  if (file) {
    saveSettingsBtn.textContent = 'Upload logo...';
    finalLogoUrl = await uploadToCloudinary(file);
    if (!finalLogoUrl) {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Simpan Pengaturan Toko';
      return;
    }
  }
  
  const settingsData = {
    username: usernameInput.value,
    bio: bioInput.value,
    wa: waInput.value,
    shopee: shopeeInput.value,
    logo: finalLogoUrl
  };
  
  try {
    await setDoc(doc(db, "settings", "toko"), settingsData);
    alert('Pengaturan toko berhasil disimpan!');
    logoFileInput.value = '';
  } catch (error) {
    alert('Gagal simpan pengaturan: ' + error.message);
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Simpan Pengaturan Toko';
    lucide.createIcons();
  }
});

// ==================== HELPER ====================
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    throw new Error(data.error?.message || 'Upload gagal');
  } catch (error) {
    alert('Gagal upload foto: ' + error.message);
    return null;
  }
}

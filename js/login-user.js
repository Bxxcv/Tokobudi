import { auth, db } from '../firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

onAuthStateChanged(auth, async (user) => {
  const btn = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, 'toko', user.uid));
    if (!snap.exists()) throw new Error('Akun toko tidak ditemukan.');
    const toko = snap.data();
    if (toko.status !== 'aktif') {
      await signOut(auth);
      throw new Error('Akun Anda diblokir. Hubungi admin.');
    }
    window.location.href = 'admin.html';
  } catch (err) {
    await signOut(auth).catch(() => {});
    errorMsg.innerText = err.message;
    if (btn) {
      btn.innerHTML = 'Masuk';
      btn.disabled = false;
    }
  }
});

document.getElementById('loginBtn').onclick = () => {
  const btn = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  btn.innerHTML = '<span class="spinner"></span> Memproses...';
  btn.disabled = true;
  errorMsg.innerText = '';

  signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
    .then(() => {})
    .catch((err) => {
      const msgs = {
        'auth/user-not-found': 'Akun tidak ditemukan',
        'auth/wrong-password': 'Password salah',
        'auth/invalid-email': 'Format email tidak valid',
        'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
        'auth/user-disabled': 'Akun dinonaktifkan. Hubungi admin.',
        'auth/network-request-failed': 'Tidak ada koneksi internet',
      };
      errorMsg.innerText = msgs[err.code] || 'Login gagal: ' + err.message;
      btn.innerHTML = 'Masuk';
      btn.disabled = false;
    });
};

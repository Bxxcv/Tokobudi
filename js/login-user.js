import { auth } from '../firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = 'admin.html';
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
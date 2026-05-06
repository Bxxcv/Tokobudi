import { auth, db } from '../firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── AUTH STATE — check blocked status before redirect ─────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'toko', user.uid));
    if (!snap.exists()) { await signOut(auth); return; }
    const data = snap.data();
    if (data.status === 'blokir') {
      showError('Akun Anda telah dinonaktifkan. Hubungi admin.');
      await signOut(auth);
      return;
    }
    window.location.href = 'admin.html';
  } catch {
    // Fail open — let admin.html do its own guard
    window.location.href = 'admin.html';
  }
});

function showError(msg) {
  const errorMsg = document.getElementById('errorMsg');
  if (errorMsg) errorMsg.innerText = msg;
}

// ── LOGIN HANDLER ─────────────────────────────────────────────────────────────
document.getElementById('loginBtn').onclick = () => {
  const btn      = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  const email    = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  errorMsg.innerText = '';

  if (!email || !password) {
    errorMsg.innerText = 'Email dan password wajib diisi.';
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Memproses...';
  btn.disabled  = true;

  signInWithEmailAndPassword(auth, email, password)
    .then(() => { /* onAuthStateChanged handles redirect */ })
    .catch((err) => {
      const msgs = {
        'auth/user-not-found':         'Akun tidak ditemukan',
        'auth/wrong-password':         'Password salah',
        'auth/invalid-credential':     'Email atau password salah',
        'auth/invalid-email':          'Format email tidak valid',
        'auth/too-many-requests':      'Terlalu banyak percobaan. Coba lagi nanti.',
        'auth/user-disabled':          'Akun dinonaktifkan. Hubungi admin.',
        'auth/network-request-failed': 'Tidak ada koneksi internet',
      };
      errorMsg.innerText = msgs[err.code] || 'Login gagal: ' + err.message;
      btn.innerHTML = 'Masuk';
      btn.disabled  = false;
    });
};

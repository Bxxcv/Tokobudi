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
  // SECURITY: textContent — never innerText/innerHTML
  if (errorMsg) errorMsg.textContent = typeof msg === 'string' ? msg : 'Terjadi kesalahan.';
}

// ── LOGIN HANDLER ─────────────────────────────────────────────────────────────
// Double-submit guard
let _loginInProgress = false;

// Rate limit: max 1 attempt per 2.5s
let _lastLoginAttempt = 0;

document.getElementById('loginBtn').addEventListener('click', handleLogin);
// Support Enter key on password field
document.getElementById('password')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
  if (_loginInProgress) return;

  const now = Date.now();
  if (now - _lastLoginAttempt < 2500) {
    showError('Tunggu sebentar sebelum mencoba lagi.');
    return;
  }

  const btn      = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  const email    = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  if (errorMsg) errorMsg.textContent = '';

  if (!email || !password) {
    showError('Email dan password wajib diisi.');
    return;
  }

  // Basic email format guard
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('Format email tidak valid.');
    return;
  }

  _loginInProgress  = true;
  _lastLoginAttempt = now;
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
      showError(msgs[err.code] || 'Login gagal. Coba lagi.');
      btn.innerHTML = 'Masuk';
      btn.disabled  = false;
      _loginInProgress = false;
    });
}

import { APP_CONFIG } from '../config.js';
import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, browserLocalPersistence, setPersistence,
  sendPasswordResetEmail, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escHtml } from './utils.js';

const EMAIL_ADMIN = 'unrageunrage@gmail.com';

const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(APP_CONFIG.firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

const loginAdminDiv = document.getElementById('loginAdmin');
const formDaftarDiv = document.getElementById('formDaftar');
const adminYgLogin  = document.getElementById('adminYgLogin');
const tabelUser     = document.getElementById('tabelUser');
const sidebar       = document.getElementById('sidebar');
const overlay       = document.getElementById('overlay');
const loginError    = document.getElementById('loginError');

function closeSidebar() {
  sidebar.classList.add('-translate-x-full');
  overlay.classList.add('hidden');
}

document.getElementById('hamburger').addEventListener('click', () => {
  sidebar.classList.remove('-translate-x-full');
  overlay.classList.remove('hidden');
});

function updateJam() {
  const jam = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
  document.getElementById('jam').innerText = jam + ' WIB';
}
setInterval(updateJam, 1000);
updateJam();

async function loginAdmin() {
  const email = document.getElementById('adminEmail').value.trim();
  const pass  = document.getElementById('adminPass').value;
  loginError.classList.add('hidden');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    const msg = e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential'
      ? 'Email atau password salah!'
      : e.code === 'auth/invalid-email'
      ? 'Format email tidak valid!'
      : 'Login gagal: ' + e.message;
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
  }
}

function logoutAdmin() {
  signOut(auth);
}

async function resetPassword(email) {
  if (!confirm('Kirim link reset password ke ' + email + '?')) return;
  try {
    await sendPasswordResetEmail(auth, email);
    alert('Link reset password berhasil dikirim ke ' + email + '\n\nUser akan menerima email dan bisa set password baru.');
  } catch (e) {
    const msg = e.code === 'auth/user-not-found'
      ? 'Email tidak terdaftar.'
      : 'Gagal kirim: ' + e.message;
    alert(msg);
  }
}

let isLoggingOut = false;
onAuthStateChanged(auth, user => {
  if (isLoggingOut) return;
  if (user && user.email === EMAIL_ADMIN) {
    loginAdminDiv.style.display = 'none';
    formDaftarDiv.style.display = 'block';
    adminYgLogin.innerText = user.email;
    ambilDataUser();
  } else {
    loginAdminDiv.style.display = 'block';
    formDaftarDiv.style.display = 'none';
    if (user) {
      alert('Akses ditolak. Akun ini bukan admin.');
      isLoggingOut = true;
      signOut(auth).finally(() => isLoggingOut = false);
    }
  }
});

async function daftarkanUser() {
  const namaToko    = document.getElementById('namaToko').value.trim();
  const namaPemilik = document.getElementById('namaPemilik').value.trim();
  const emailUser   = document.getElementById('emailUser').value.trim();
  const passUser    = document.getElementById('passUser').value;
  const btnDaftar   = document.getElementById('btnDaftar');

  if (!namaToko || !namaPemilik || !emailUser || !passUser) {
    return alert('Isi semua field terlebih dahulu!');
  }
  if (passUser.length < 6) {
    return alert('Password minimal 6 karakter!');
  }

  btnDaftar.disabled = true;
  btnDaftar.textContent = 'Mendaftarkan...';

  const secondaryAppName = 'secondary-' + Date.now();
  const secondaryApp  = initializeApp(APP_CONFIG.firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailUser, passUser);
    const uid = userCredential.user.uid;

    await setDoc(doc(db, 'toko', uid), {
      namaToko:   namaToko,
      pemilik:    namaPemilik,
      email:      emailUser,
      authPass:   passUser,
      omset:      0,
      status:     'aktif',
      dibuatPada: serverTimestamp()
    });

    alert('Sukses! User ' + emailUser + ' berhasil didaftarkan.');
    document.getElementById('namaToko').value    = '';
    document.getElementById('namaPemilik').value = '';
    document.getElementById('emailUser').value   = '';
    document.getElementById('passUser').value    = '';
    ambilDataUser();
  } catch (error) {
    const msg = error.code === 'auth/email-already-in-use'
      ? 'Email sudah terdaftar! Gunakan email lain.'
      : error.code === 'auth/invalid-email'
      ? 'Format email tidak valid!'
      : 'Gagal daftar: ' + error.message;
    alert(msg);
  } finally {
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    btnDaftar.disabled = false;
    btnDaftar.textContent = '+ Daftarkan';
  }
}

async function ambilDataUser() {
  tabelUser.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-slate-500">Memuat data...</td></tr>';
  try {
    const q    = query(collection(db, 'toko'), orderBy('dibuatPada', 'desc'));
    const snap = await getDocs(q);

    let totalUser = 0, totalOmset = 0, totalAktif = 0, htmlTabel = '', no = 1;

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const uid  = docSnap.id;
      if (!data.email) return;

      totalUser++;
      totalOmset += data.omset || 0;
      if (data.status === 'aktif') totalAktif++;

      const statusBadge = data.status === 'aktif'
        ? '<span class="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">Aktif</span>'
        : '<span class="bg-red-100 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">Diblokir</span>';

      const isPrem = data.premium?.active && new Date(data.premium.endDate?.toDate ? data.premium.endDate.toDate() : data.premium.endDate) > new Date();
      const premBadge = isPrem
        ? '<span class="bg-yellow-100 text-yellow-700 text-xs font-medium px-2.5 py-1 rounded-full">⭐ Premium</span>'
        : '<span class="bg-slate-100 text-slate-500 text-xs font-medium px-2.5 py-1 rounded-full">Gratis</span>';

      const tombolAksi = '<div class="flex items-center gap-2 flex-wrap">'
        + '<a href="/?uid=' + uid + '" target="_blank" class="text-blue-600 hover:text-blue-800 font-medium text-xs">Lihat</a>'
        + '<button type="button" onclick="resetPassword(\'' + escHtml(data.email) + '\')" class="text-indigo-600 hover:text-indigo-800 font-medium text-xs">Reset Pass</button>'
        + (data.status === 'aktif'
          ? '<button type="button" onclick="blokirUser(\'' + uid + '\', \'blokir\')" class="text-red-600 hover:text-red-800 font-medium text-xs">Blokir</button>'
          : '<button type="button" onclick="blokirUser(\'' + uid + '\', \'aktif\')" class="text-green-600 hover:text-green-800 font-medium text-xs">Aktifkan</button>')
        + (isPrem
          ? '<button type="button" onclick="togglePremium(\'' + uid + '\', false)" class="text-orange-600 hover:text-orange-800 font-medium text-xs">Nonaktif Premium</button>'
          : '<button type="button" onclick="togglePremium(\'' + uid + '\', true)" class="text-yellow-600 hover:text-yellow-800 font-medium text-xs">Aktifkan Premium</button>')
        + '<button type="button" onclick="hapusUser(\'' + uid + '\', \'' + escHtml(data.namaToko) + '\')" class="text-slate-400 hover:text-red-600 font-medium text-xs">Hapus</button>'
        + '</div>';

      htmlTabel += '<tr class="hover:bg-slate-50">'
        + '<td class="p-3 text-slate-500">' + no++ + '</td>'
        + '<td class="p-3 font-medium text-slate-800">' + escHtml(data.namaToko) + '</td>'
        + '<td class="p-3 text-slate-600">' + escHtml(data.pemilik || '-') + '</td>'
        + '<td class="p-3 text-slate-600">' + escHtml(data.email) + '</td>'
        + '<td class="p-3 text-slate-800">Rp ' + (data.omset || 0).toLocaleString('id-ID') + '</td>'
        + '<td class="p-3">' + statusBadge + '</td>'
        + '<td class="p-3">' + premBadge + '</td>'
        + '<td class="p-3">' + tombolAksi + '</td>'
        + '</tr>';
    });

    document.getElementById('totalUser').innerText  = totalUser;
    document.getElementById('totalOmset').innerText = 'Rp ' + totalOmset.toLocaleString('id-ID');
    document.getElementById('totalAktif').innerText = totalAktif;
    tabelUser.innerHTML = htmlTabel || '<tr><td colspan="8" class="text-center p-6 text-slate-500">Belum ada user</td></tr>';
  } catch (e) {
    tabelUser.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-red-500">Gagal memuat: ' + e.message + '</td></tr>';
  }
}

async function blokirUser(uid, statusBaru) {
  const label = statusBaru === 'blokir' ? 'memblokir' : 'mengaktifkan';
  if (!confirm('Yakin mau ' + label + ' user ini?')) return;
  try {
    await updateDoc(doc(db, 'toko', uid), { status: statusBaru });
    ambilDataUser();
  } catch (error) {
    alert('Gagal update status: ' + error.message);
  }
}

async function togglePremium(uid, activate) {
  const label = activate ? 'mengaktifkan' : 'menonaktifkan';
  if (!confirm('Yakin mau ' + label + ' Premium?\n\n' + (activate ? 'Akan aktif selama 30 hari.' : 'Fitur premium akan dinonaktifkan.'))) return;
  try {
    if (activate) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      await updateDoc(doc(db, 'toko', uid), {
        'premium.active': true,
        'premium.startDate': serverTimestamp(),
        'premium.endDate': endDate,
        'premium.accentColor': '#FF6B35'
      });
      alert('Premium diaktifkan selama 30 hari!');
    } else {
      await updateDoc(doc(db, 'toko', uid), {
        'premium.active': false
      });
      alert('Premium dinonaktifkan.');
    }
    ambilDataUser();
  } catch (error) {
    alert('Gagal: ' + error.message);
  }
}

async function hapusUser(uid, namaToko) {
  if (!confirm('Yakin mau HAPUS PERMANEN akun toko "' + namaToko + '"?\n\nIni akan menghapus:\n- Akun login (email & password)\n- Semua data toko\n- Semua produk\n- Semua statistik\n\nTIDAK BISA DIBATALKAN.')) return;

  let stepError = '';

  try {
    // Step 1: Ambil data toko
    try {
      const tokoSnap = await getDoc(doc(db, 'toko', uid));
      if (!tokoSnap.exists()) throw new Error('Data toko tidak ditemukan');
      var tokoData = tokoSnap.data();
    } catch (e) { stepError = 'Step 1 (baca toko): ' + e.message; throw e; }

    // Step 2: Hapus produk
    try {
      const prodSnap = await getDocs(collection(db, 'toko', uid, 'produk'));
      if (!prodSnap.empty) {
        const batch = writeBatch(db);
        prodSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) { stepError = 'Step 2 (hapus produk): ' + e.message; throw e; }

    // Step 3: Hapus stats
    try {
      const statSnap = await getDocs(collection(db, 'toko', uid, 'stats'));
      if (!statSnap.empty) {
        const batch = writeBatch(db);
        statSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) { stepError = 'Step 3 (hapus stats): ' + e.message; throw e; }

    // Step 4: Hapus dokumen toko
    try {
      await deleteDoc(doc(db, 'toko', uid));
    } catch (e) { stepError = 'Step 4 (hapus toko): ' + e.message; throw e; }

    // Step 5: Hapus akun Auth via secondary app
    let authDeleted = false;
    try {
      const secondaryApp = initializeApp(APP_CONFIG.firebaseConfig, 'delete-' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await signInWithEmailAndPassword(secondaryAuth, tokoData.email, tokoData.authPass);
      await deleteUser(cred.user);
      authDeleted = true;
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
    } catch (e) {
      // Auth delete gagal bukan fatal, data firestore sudah dihapus
    }

    if (authDeleted) {
      alert('Akun "' + namaToko + '" berhasil dihapus sepenuhnya.');
    } else {
      alert('Data Firestore berhasil dihapus.\n\nAkun auth gagal dihapus otomatis.\nHapus manual di:\nFirebase Console > Authentication > klik user > Delete account');
    }

  } catch (error) {
    alert('Gagal hapus di:\n' + stepError + '\n\nPastikan Firestore Rules sudah di-publish.');
  }

  ambilDataUser();
}

window.closeSidebar   = closeSidebar;
window.loginAdmin     = loginAdmin;
window.logoutAdmin    = logoutAdmin;
window.resetPassword  = resetPassword;
window.daftarkanUser  = daftarkanUser;
window.ambilDataUser  = ambilDataUser;
window.blokirUser     = blokirUser;
window.togglePremium  = togglePremium;
window.hapusUser      = hapusUser;
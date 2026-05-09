/**
 * LINKify — Maintenance Mode Checker (js/maintenance.js)
 * FIX: Firestore rules harus allow read untuk config/maintenance (lihat firestore.rules)
 * FIX: estimatedDone Timestamp handling diperbaiki
 */

import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/**
 * Cek status maintenance dari Firestore.
 * Jika aktif → redirect ke maintenance.html.
 * Harus dipanggil di awal setiap halaman publik (index, login-user).
 */
export async function checkMaintenance({ bypass = false, adminEmail = '' } = {}) {
  if (bypass) return false;

  // Sudah di halaman maintenance? Jangan loop
  if (window.location.pathname.endsWith('maintenance.html')) return false;

  try {
    const snap = await getDoc(doc(db, 'config', 'maintenance'));

    // Dokumen belum dibuat = tidak ada maintenance
    if (!snap.exists()) return false;

    const data = snap.data();
    if (!data?.active) return false;

    // Bypass email check
    if (adminEmail && data.bypassEmails && Array.isArray(data.bypassEmails)) {
      if (data.bypassEmails.includes(adminEmail)) return false;
    }

    // FIX: Handle Firestore Timestamp & plain string/date untuk estimatedDone
    let estimatedDoneISO = null;
    if (data.estimatedDone) {
      try {
        const d = data.estimatedDone?.toDate
          ? data.estimatedDone.toDate()
          : new Date(data.estimatedDone);
        if (!isNaN(d)) estimatedDoneISO = d.toISOString();
      } catch {}
    }

    // Simpan ke sessionStorage agar maintenance.html bisa baca
    sessionStorage.setItem('lf_maint', JSON.stringify({
      message:       data.message       || 'Sistem sedang dalam pemeliharaan.',
      estimatedDone: estimatedDoneISO,
      title:         data.title         || 'Sedang Maintenance',
    }));

    window.location.replace('maintenance.html');
    return true;
  } catch (err) {
    // PENTING: jika ini karena permission-denied → Firestore rules perlu diupdate
    // Lihat firestore.rules yang disertakan. Fail-open untuk ketersediaan publik.
    console.warn('[checkMaintenance] Firestore read gagal:', err.code || err.message);
    return false;
  }
}

/**
 * Admin panel: baca status maintenance saat ini
 */
export async function getMaintenanceStatus() {
  try {
    const snap = await getDoc(doc(db, 'config', 'maintenance'));
    if (!snap.exists()) return { active: false };
    return snap.data();
  } catch {
    return { active: false };
  }
}

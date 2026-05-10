/**
 * LINKify — Maintenance Mode Checker (js/maintenance.js)
 * PATCH: window.location.replace (no back), Timestamp fix, fail-open.
 * PENTING: Firestore rules harus allow read config/maintenance untuk publik!
 */

import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function checkMaintenance({ bypass = false, adminEmail = '' } = {}) {
  if (bypass) return false;
  if (window.location.pathname.endsWith('maintenance.html')) return false;

  try {
    const snap = await getDoc(doc(db, 'config', 'maintenance'));
    if (!snap.exists()) return false;

    const data = snap.data();
    if (!data?.active) return false;

    if (adminEmail && Array.isArray(data.bypassEmails)) {
      if (data.bypassEmails.includes(adminEmail)) return false;
    }

    // FIX: handle Firestore Timestamp dan string date
    let estimatedDone = null;
    if (data.estimatedDone) {
      try {
        const d = data.estimatedDone?.toDate
          ? data.estimatedDone.toDate()
          : new Date(data.estimatedDone);
        if (!isNaN(d)) estimatedDone = d.toISOString();
      } catch {}
    }

    sessionStorage.setItem('lf_maint', JSON.stringify({
      message:       data.message || 'Sistem sedang dalam pemeliharaan.',
      estimatedDone,
      title:         data.title   || 'Sedang Maintenance',
    }));

    // FIX: replace agar tidak bisa back button kembali ke halaman yang di-block
    window.location.replace('maintenance.html');
    return true;
  } catch (err) {
    // Fail-open: jika Firestore rules belum diupdate (permission-denied), halaman tetap jalan
    console.warn('[checkMaintenance]', err.code || err.message);
    return false;
  }
}

export async function getMaintenanceStatus() {
  try {
    const snap = await getDoc(doc(db, 'config', 'maintenance'));
    if (!snap.exists()) return { active: false };
    return snap.data();
  } catch {
    return { active: false };
  }
}

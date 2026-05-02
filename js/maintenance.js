/**
 * LINKify — Maintenance Mode Checker (js/maintenance.js)
 * Import dan panggil checkMaintenance() di awal setiap halaman publik.
 * Admin (EMAIL_ADMIN) dan super-admin selalu bypass.
 */

import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const MAINTENANCE_DOC = 'config/maintenance';

/**
 * Cek status maintenance dari Firestore.
 * Jika aktif → redirect ke maintenance.html (kecuali halaman yg dikecualikan).
 *
 * @param {object} opts
 * @param {boolean} [opts.bypass=false]  - true = halaman ini tidak pernah kena redirect
 * @param {string}  [opts.adminEmail=''] - jika diisi, user dengan email ini bypass
 */
export async function checkMaintenance({ bypass = false, adminEmail = '' } = {}) {
  if (bypass) return false;

  // Sudah di halaman maintenance? Jangan loop redirect
  if (window.location.pathname.endsWith('maintenance.html')) return false;

  try {
    const snap = await getDoc(doc(db, 'config', 'maintenance'));
    if (!snap.exists()) return false;

    const data = snap.data();
    if (!data?.active) return false;

    // Bypass jika user ini adalah admin yang sedang login
    if (adminEmail && data.bypassEmails && Array.isArray(data.bypassEmails)) {
      if (data.bypassEmails.includes(adminEmail)) return false;
    }

    // Simpan info maintenance ke sessionStorage supaya halaman maintenance bisa baca
    sessionStorage.setItem('lf_maint', JSON.stringify({
      message:       data.message       || 'Sistem sedang dalam pemeliharaan.',
      estimatedDone: data.estimatedDone || null,
      title:         data.title         || 'Sedang Maintenance',
    }));

    window.location.href = 'maintenance.html';
    return true;
  } catch {
    // Gagal fetch = biarkan halaman tetap jalan (fail open utk publik)
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

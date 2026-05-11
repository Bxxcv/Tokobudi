/**
 * LINKify — Utils (utils.js)
 * PATCHED: XSS hardening, URL sanitize, input limits, safer toast, MIME validate
 */

// ── SECURITY: HTML ESCAPE ─────────────────────────────────────────────────────
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"'`]/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;', '`': '&#x60;'
  }[m]));
}

// ── SECURITY: URL SANITIZE ─────────────────────────────────────────────────────
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const t = url.trim();
  if (!t) return '#';
  if (/^(javascript|data|vbscript|file|blob)\s*:/i.test(t)) return '#';
  if (t.startsWith('//')) return '#';
  if (!/^(https?:\/\/|tel:|mailto:|#)/i.test(t)) return '#';
  if (t.length > 2048) return '#';
  return t;
}

// ── SECURITY: SAFE IMAGE URL ──────────────────────────────────────────────────
export function safeImgUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return '';
  if (t.length > 2048) return '';
  return t;
}

// ── SECURITY: SANITIZE TEXT INPUT ─────────────────────────────────────────────
export function sanitizeText(str, maxLen = 500) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ── SECURITY: VALIDATE IMAGE FILE ────────────────────────────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) return { ok: false, reason: 'Tidak ada file.' };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, reason: `Format tidak didukung (${file.type}). Gunakan JPG, PNG, atau WebP.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, reason: 'Ukuran file terlalu besar (maks. 5 MB).' };
  }
  if (file.size === 0) return { ok: false, reason: 'File kosong.' };
  return { ok: true };
}

// ── RUPIAH FORMAT ─────────────────────────────────────────────────────────────
export function rupiah(val) {
  return Number(val || 0).toLocaleString('id-ID');
}

// ── PLAN SYSTEM ───────────────────────────────────────────────────────────────
export function checkPlan(tokoData) {
  if (!tokoData) return 'free';
  const now = new Date();

  const plan    = tokoData.plan;
  const planEnd = tokoData.planEndDate;
  if (plan && planEnd) {
    try {
      const endTime = planEnd?.toDate ? planEnd.toDate() : new Date(planEnd);
      if (!isNaN(endTime) && endTime > now) return plan;
    } catch {}
  }

  if (tokoData.premium?.active) {
    const legEnd = tokoData.premium.endDate;
    if (legEnd) {
      try {
        const endTime = legEnd?.toDate ? legEnd.toDate() : new Date(legEnd);
        if (!isNaN(endTime) && endTime > now) return 'premium';
      } catch {}
    }
  }

  return 'free';
}

export function checkPremium(tokoData) {
  return checkPlan(tokoData) === 'premium';
}

// ── HEX TO RGB ────────────────────────────────────────────────────────────────
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return '255, 107, 53';
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '255, 107, 53';
  return `${parseInt(clean.slice(0,2),16)}, ${parseInt(clean.slice(2,4),16)}, ${parseInt(clean.slice(4,6),16)}`;
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
export const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return DAY_NAMES[d.getDay()] || '—';
  } catch { return '—'; }
}

// ── LISTS & CONSTANTS ─────────────────────────────────────────────────────────
export const KATEGORI_LIST = [
  'Semua', 'Pakaian', 'Makanan & Minuman', 'Elektronik', 'Kecantikan',
  'Rumah Tangga', 'Olahraga', 'Aksesoris', 'Lainnya'
];

export const TEMPLATE_LIST = [
  { id: 'default', label: 'Midnight City', desc: 'Gelap modern, aksen neon',   bg: '',   accent: '#FF6B35', preview: '#0d0d1a' },
  { id: 'forest',  label: 'Dark Forest',   desc: 'Hutan gelap misterius',      bg: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&q=80&fit=crop&auto=format', accent: '#4ADE80', preview: '#0d1a0f' },
  { id: 'ocean',   label: 'Deep Ocean',    desc: 'Lautan dalam yang tenang',   bg: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=80&fit=crop&auto=format', accent: '#38BDF8', preview: '#030e1a' },
  { id: 'aurora',  label: 'Aurora Night',  desc: 'Langit malam aurora',        bg: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&q=80&fit=crop&auto=format', accent: '#A78BFA', preview: '#080d1e' },
  { id: 'desert',  label: 'Golden Desert', desc: 'Padang pasir golden hour',   bg: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200&q=80&fit=crop&auto=format', accent: '#FBBF24', preview: '#1a0e00' },
  { id: 'sakura',  label: 'Sakura Bloom',  desc: 'Taman bunga sakura',         bg: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1200&q=80&fit=crop&auto=format', accent: '#F472B6', preview: '#1a0a10' },
];

export const ACCENT_COLORS = [
  { hex: '#FF6B35', label: 'Oranye' }, { hex: '#EE4D2D', label: 'Merah' },
  { hex: '#25D366', label: 'Hijau' },  { hex: '#3B82F6', label: 'Biru' },
  { hex: '#8B5CF6', label: 'Ungu' },   { hex: '#EC4899', label: 'Pink' },
  { hex: '#F59E0B', label: 'Kuning' }, { hex: '#111111', label: 'Hitam' },
];

export const PLAN_FEATURES = {
  basic: {
    label: 'Basic', color: '#3B82F6',
    features: ['Halaman toko publik','Upload produk unlimited','Tombol WA, Shopee, Tokopedia','Kategori produk','Social icons (IG, TikTok, dll)','Gallery foto toko'],
    locked: ['Analitik & statistik pengunjung','Tema foto eksklusif (6 tema)','Badge Terverifikasi','QR Code print-ready','Tombol kustom unlimited','Hapus branding LINKify','Accent color kustom']
  },
  premium: {
    label: 'Premium', color: '#FF6B35',
    features: ['Semua fitur Basic','Analitik & statistik pengunjung real-time','Tema foto eksklusif (6 tema)','Badge Terverifikasi ✓','QR Code print-ready','Tombol kustom unlimited + deskripsi','Hapus branding LINKify','Accent color kustom'],
    locked: []
  }
};

// ── TOAST (singleton, XSS-safe, bottom-center) ────────────────────────────────
let _toastTimer = null;
let _toastEl    = null;

export function showToast(msg, type = 'info', duration = 3200) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.id = 'global-toast';
    _toastEl.setAttribute('role', 'status');
    _toastEl.setAttribute('aria-live', 'polite');
    _toastEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);z-index:99999;color:#fff;padding:11px 20px;border-radius:10px;font-size:13.5px;font-weight:500;max-width:min(340px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);opacity:0;transition:opacity .22s,transform .22s;pointer-events:none;text-align:center;word-break:break-word;border:1px solid rgba(255,255,255,.1);font-family:Inter,sans-serif;';
    document.body.appendChild(_toastEl);
  }

  // SECURITY: textContent only — never innerHTML
  _toastEl.textContent = String(msg || '');

  const bg = { success:'#10B981', ok:'#10B981', error:'#EF4444', err:'#EF4444', warn:'#F59E0B', info:'#3B82F6' };
  _toastEl.style.background = bg[type] || '#1e2030';

  requestAnimationFrame(() => {
    _toastEl.style.opacity   = '1';
    _toastEl.style.transform = 'translateX(-50%) translateY(0)';
    _toastEl.style.pointerEvents = 'auto';
  });

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    _toastEl.style.opacity   = '0';
    _toastEl.style.transform = 'translateX(-50%) translateY(20px)';
    _toastEl.style.pointerEvents = 'none';
  }, duration);
}

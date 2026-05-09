export function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

export function safeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  if (/^(javascript|data|vbscript|file):/i.test(url.trim())) return '#';
  return url.trim();
}

export function rupiah(val) {
  return Number(val || 0).toLocaleString('id-ID');
}

/**
 * PLAN SYSTEM
 * Firestore structure:
 *   toko/{uid}.plan = 'basic' | 'premium' | null/undefined (no plan)
 *   toko/{uid}.planEndDate = Timestamp | ISO string
 *   toko/{uid}.premium = { active, endDate, ... }  (legacy, still supported)
 *
 * checkPlan(data) → 'premium' | 'basic' | 'free'
 */
export function checkPlan(tokoData) {
  if (!tokoData) return 'free';
  const now = new Date();

  // New plan system
  const plan    = tokoData.plan;
  const planEnd = tokoData.planEndDate;
  if (plan && planEnd) {
    const endTime = planEnd?.toDate ? planEnd.toDate() : new Date(planEnd);
    if (endTime > now) return plan; // 'basic' or 'premium'
  }

  // Legacy premium support
  if (tokoData.premium?.active) {
    const legEnd = tokoData.premium.endDate;
    if (legEnd) {
      const endTime = legEnd?.toDate ? legEnd.toDate() : new Date(legEnd);
      if (endTime > now) return 'premium';
    }
  }

  return 'free';
}

/** Backward compat — used by old code expecting boolean */
export function checkPremium(tokoData) {
  return checkPlan(tokoData) === 'premium';
}

export function hexToRgb(hex) {
  if (!hex || hex.length < 7) return '255, 107, 53';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

export const KATEGORI_LIST = [
  'Semua', 'Pakaian', 'Makanan & Minuman', 'Elektronik', 'Kecantikan',
  'Rumah Tangga', 'Olahraga', 'Aksesoris', 'Lainnya'
];

export const TEMPLATE_LIST = [
  { id: 'default', label: 'Midnight City', desc: 'Gelap modern, aksen neon', bg: '', accent: '#FF6B35', preview: '#0d0d1a' },
  { id: 'forest',  label: 'Dark Forest',   desc: 'Hutan gelap misterius',   bg: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&q=80&fit=crop&auto=format', accent: '#4ADE80', preview: '#0d1a0f' },
  { id: 'ocean',   label: 'Deep Ocean',    desc: 'Lautan dalam yang tenang', bg: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=80&fit=crop&auto=format', accent: '#38BDF8', preview: '#030e1a' },
  { id: 'aurora',  label: 'Aurora Night',  desc: 'Langit malam aurora',     bg: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&q=80&fit=crop&auto=format', accent: '#A78BFA', preview: '#080d1e' },
  { id: 'desert',  label: 'Golden Desert', desc: 'Padang pasir golden hour', bg: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200&q=80&fit=crop&auto=format', accent: '#FBBF24', preview: '#1a0e00' },
  { id: 'sakura',  label: 'Sakura Bloom',  desc: 'Taman bunga sakura',      bg: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1200&q=80&fit=crop&auto=format', accent: '#F472B6', preview: '#1a0a10' },
];

export const ACCENT_COLORS = [
  { hex: '#FF6B35', label: 'Oranye' },
  { hex: '#EE4D2D', label: 'Merah' },
  { hex: '#25D366', label: 'Hijau' },
  { hex: '#3B82F6', label: 'Biru' },
  { hex: '#8B5CF6', label: 'Ungu' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#F59E0B', label: 'Kuning' },
  { hex: '#111111', label: 'Hitam' },
];

/** Plan feature definitions — single source of truth */
export const PLAN_FEATURES = {
  basic: {
    label: 'Basic',
    color: '#3B82F6',
    features: [
      'Halaman toko publik',
      'Upload produk unlimited',
      'Tombol WA, Shopee, Tokopedia',
      'Kategori produk',
      'Social icons (IG, TikTok, dll)',
      'Gallery foto toko',
    ],
    locked: [
      'Analitik & statistik pengunjung',
      'Tema foto eksklusif (6 tema)',
      'Badge Terverifikasi',
      'QR Code print-ready',
      'Tombol kustom unlimited',
      'Hapus branding LINKify',
      'Accent color kustom',
    ]
  },
  premium: {
    label: 'Premium',
    color: '#FF6B35',
    features: [
      'Semua fitur Basic',
      'Analitik & statistik pengunjung real-time',
      'Tema foto eksklusif (6 tema)',
      'Badge Terverifikasi ✓',
      'QR Code print-ready',
      'Tombol kustom unlimited + deskripsi',
      'Hapus branding LINKify',
      'Accent color kustom',
    ],
    locked: []
  }
};

/** Centralized toast notification */
export function showToast(msg, type = 'info', duration = 3000) {
  // Create toast element if not exists
  let toastEl = document.getElementById('global-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'global-toast';
    toastEl.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      background: #333; color: white; padding: 12px 16px;
      border-radius: 8px; font-size: 14px; max-width: 300px;
      opacity: 0; transform: translateY(-10px);
      transition: all 0.3s ease; pointer-events: none;
    `;
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = msg;
  toastEl.style.background = type === 'success' || type === 'ok' ? '#10B981' : type === 'error' || type === 'err' ? '#EF4444' : type === 'warn' ? '#F59E0B' : '#333';
  toastEl.style.opacity = '1';
  toastEl.style.transform = 'translateY(0)';
  toastEl.style.pointerEvents = 'auto';

  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    }, 300);
  }, duration);
}

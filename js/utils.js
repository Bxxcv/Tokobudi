export function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

export function rupiah(val) {
  return Number(val || 0).toLocaleString('id-ID');
}

export function checkPremium(tokoData) {
  if (!tokoData?.premium?.active) return false;
  const end = tokoData.premium.endDate;
  if (!end) return false;
  const endTime = end?.toDate ? end.toDate() : new Date(end);
  return endTime > new Date();
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
  {
    id: 'default',
    label: 'Midnight City',
    desc: 'Gelap modern, aksen neon',
    bg: '',
    accent: '#FF6B35',
    preview: '#0d0d1a'
  },
  {
    id: 'forest',
    label: 'Dark Forest',
    desc: 'Hutan gelap misterius',
    bg: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&q=80&fit=crop&auto=format',
    accent: '#4ADE80',
    preview: '#0d1a0f'
  },
  {
    id: 'ocean',
    label: 'Deep Ocean',
    desc: 'Lautan dalam yang tenang',
    bg: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=80&fit=crop&auto=format',
    accent: '#38BDF8',
    preview: '#030e1a'
  },
  {
    id: 'aurora',
    label: 'Aurora Night',
    desc: 'Langit malam aurora borealis',
    bg: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&q=80&fit=crop&auto=format',
    accent: '#A78BFA',
    preview: '#080d1e'
  },
  {
    id: 'desert',
    label: 'Golden Desert',
    desc: 'Padang pasir saat golden hour',
    bg: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200&q=80&fit=crop&auto=format',
    accent: '#FBBF24',
    preview: '#1a0e00'
  },
  {
    id: 'sakura',
    label: 'Sakura Bloom',
    desc: 'Taman bunga sakura Jepang',
    bg: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1200&q=80&fit=crop&auto=format',
    accent: '#F472B6',
    preview: '#1a0a10'
  },
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

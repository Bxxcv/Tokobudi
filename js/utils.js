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
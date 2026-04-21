import { db, CONFIG } from './firebase.js';
import { collection, getDocs, query, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Helper: escape HTML ─────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } [m]));
}

// ── Helper: format rupiah ───────────────────────────────────
function rupiah(val) {
  return Number(val || 0).toLocaleString('id-ID');
}

// ── Ambil UID dari URL: index.html?uid=xxx ─────────────────
const urlParams = new URLSearchParams(window.location.search);
const USER_ID = urlParams.get('uid');

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!USER_ID) {
    document.body.innerHTML = '<div style="color:white;text-align:center;padding:40px;">Toko tidak ditemukan</div>';
    return;
  }
  applyTheme();
  setupScrollAnimations();
  setupJellyAnimations();
  await loadSettings();
  await loadProducts();
});

function applyTheme() {
  document.documentElement.style.setProperty('--text', CONFIG.theme.textColor);
  document.documentElement.style.setProperty('--card', CONFIG.theme.bgCard);
}

function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('show'); }), { threshold: 0.1 }
  );
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

function setupJellyAnimations() {
  document.querySelectorAll('.jelly-click').forEach(el => {
    el.addEventListener('pointerdown', () => el.classList.remove('bounce-back'));
    el.addEventListener('pointerup', () => {
      setTimeout(() => el.classList.add('bounce-back'), 50);
      setTimeout(() => el.classList.remove('bounce-back'), 300);
    });
    el.addEventListener('pointerleave', () => el.classList.remove('bounce-back'));
  });
}

// ── Load Settings ───────────────────────────────────────────
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'users', USER_ID, 'settings', 'toko'));
    if (!snap.exists()) return;
    const s = snap.data();

    document.getElementById('username').innerText = s.username || 'My Store';
    document.getElementById('bio').innerText = s.bio || '';
    if (s.logo) document.getElementById('profileImg').src = s.logo;

    const waUtama = s.wa || 'https://wa.me/';
    document.getElementById('waBtn').href = waUtama;
    document.getElementById('waBtn').dataset.wa = waUtama;
    document.getElementById('link-wa-main').href = waUtama;

    if (s.shopee) {
      const elShopee = document.getElementById('link-shopee');
      if (elShopee) { elShopee.href = s.shopee;
        elShopee.classList.remove('hidden'); }
    }

    const elTokped = document.getElementById('link-tokped');
    if (elTokped && CONFIG.links && CONFIG.links.tokopedia)
      elTokped.href = CONFIG.links.tokopedia;

    document.title = `${s.username || 'My Store'} - Link Bio`;
  } catch (err) {
    console.error('loadSettings error:', err);
  }
}

// ── Load Products ───────────────────────────────────────────
async function loadProducts() {
  const container = document.getElementById('productList');
  try {
    const q = query(collection(db, 'users', USER_ID, 'products'));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `
        <div class="col-span-2 text-center py-16 fade-up show" style="color:rgba(255,255,255,0.4);font-size:14px;">
          Belum ada produk
        </div>`;
      return;
    }

    const waUtama = document.getElementById('waBtn').dataset.wa || 'https://wa.me/';
    container.innerHTML = '';

    snap.forEach(ds => {
      const p = ds.data();
      const wa = p.wa || waUtama;
      const pesanWa = encodeURIComponent(
        `Halo, saya mau pesan:\n- Produk: ${p.nama}\n- Harga: Rp ${rupiah(p.harga)}`
      );

      let shopeeBtn = '';
      if (p.shopee) {
        shopeeBtn = `
          <a href="${escHtml(p.shopee)}" target="_blank" rel="noopener noreferrer"
             class="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600
                    text-center flex items-center justify-center gap-1.5
                    hover:bg-gray-200 transition jelly-click">
            <div class="w-4 h-4 bg-[#EE4D2D] rounded flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white">
                <path d="M19.793 7.507c0-2.075-.828-3.952-2.168-5.308a.675.675 0 00-.95-.014.664.664 0 00-.013.944 6.506 0 011.8 4.378 6.501 0 01-6.504 6.487 6.499 0 01-6.5-6.487 6.497 0 011.8-4.378.664.664 0 00-.013-.944.675.675 0 00-.95.014A7.824 7.824 0 004.127 7.507c0.332.022.659.063.98H2.672a1.354 1.354 0 00-1.348 1.214L.024 21.347A1.344 1.344 0 001.37 22.86h21.26a1.344 1.344 0 001.346-1.513l-1.3-11.646a1.354 1.354 0 00-1.348-1.214h-1.597a7.9 7.9 0 00.062-.98zM12 1.14a2.694 0 110 5.388A2.694 0 0112 1.14z"/>
              </svg>
            </div>
            Shopee
          </a>`;
      }

      container.innerHTML += `
        <div class="product-card overflow-hidden fade-up">
          <div class="relative">
            <img src="${escHtml(p.img)}" alt="${escHtml(p.nama)}"
                 class="w-full h-52 object-cover"
                 onerror="this.src='https://placehold.co/600x400/1a1a2e/ffffff?text=Foto+Error'">
            ${p.stok == 0
            ? `<div class="absolute inset-0 bg-black/60 flex items-center justify-center
                           text-white font-bold text-sm tracking-widest">HABIS</div>`
              : ''}
          </div>
          <div class="p-4">
            <h2 class="font-semibold text-sm leading-tight mb-1" style="color:rgba(255,255,255,0.9)">
              ${escHtml(p.nama)}
            </h2>
            <p class="font-bold text-lg mb-3" style="color:#FF6B35">Rp${rupiah(p.harga)}</p>
            <div class="flex gap-2">
              <a href="${escHtml(wa)}?text=${pesanWa}" target="_blank" rel="noopener noreferrer"
                 class="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[#25D366] text-white
                        text-center flex items-center justify-center gap-1.5
                        hover:bg-[#20BD5A] transition jelly-click">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0.16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Pesan WA
              </a>
              ${shopeeBtn}
            </div>
          </div>
        </div>`;
    });

    setTimeout(() => {
      document.querySelectorAll('#productList.fade-up').forEach(el => el.classList.add('show'));
    }, 100);

  } catch (err) {
    console.error('loadProducts error:', err);
    container.innerHTML = `
      <div class="col-span-2 text-center py-16 fade-up show" style="color:rgba(255,100,100,0.7);font-size:13px;">
        Gagal memuat produk. Cek Rules Firebase.
      </div>`;
  }
}

// ── Share ────────────────────────────────────────────────────
window.shareLink = () => {
  const title = document.getElementById('username')?.innerText || 'Tokobudi';
  if (navigator.share) {
    navigator.share({ title, url: window.location.href });
  } else {
    navigator.clipboard.writeText(window.location.href)
     .then(() => alert('Link berhasil disalin!'))
     .catch(() => alert('Gagal menyalin link.'));
  }
};

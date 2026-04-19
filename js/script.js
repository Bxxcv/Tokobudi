import { db, CONFIG } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function escapeHtml(unsafe) { if (!unsafe) return ''; return String(unsafe).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]; }); }

document.addEventListener('DOMContentLoaded', async () => { 
  applyTheme(); // TERAPKAN WARNA DARI CONFIG
  await loadSettings(); 
  await loadProducts(); 
});

// FUNGSI DINAMIS TEMA (BIAR BISA DIUBAH PEMBELI)
function applyTheme() {
  document.documentElement.style.setProperty('--text', CONFIG.theme.textColor);
  document.documentElement.style.setProperty('--card', CONFIG.theme.bgCard);
}

async function loadSettings() {
  const docSnap = await getDoc(doc(db, "settings", "toko"));
  if (docSnap.exists()) {
    const s = docSnap.data();
    document.getElementById('username').innerText = s.username || 'My Store';
    document.getElementById('bio').innerText = s.bio || '';
    if (s.logo) document.getElementById('profileImg').src = s.logo;
    
    const waUtama = s.wa || 'https://wa.me/';
    document.getElementById('waBtn').href = waUtama;
    document.getElementById('waBtn').dataset.wa = waUtama;
    
    if (s.wa) document.getElementById('link-wa-main').href = s.wa;
    
    // CEK CONFIG BUKAN DATABASE UNTUK PLATFORM (Karena ini statis)
    if (CONFIG.links.shopee) {
      document.getElementById('link-shopee').href = CONFIG.links.shopee;
      document.getElementById('link-shopee').classList.remove('hidden');
    }
    if (CONFIG.links.tokopedia) {
      document.getElementById('link-tokped').href = CONFIG.links.tokopedia;
    }
    
    // LINK SOSMED DARI CONFIG
    if(CONFIG.links.instagram) document.getElementById('soc-ig').href = CONFIG.links.instagram;
    if(CONFIG.links.facebook) document.getElementById('soc-fb').href = CONFIG.links.facebook;
    if(CONFIG.links.tiktok) document.getElementById('soc-tt').href = CONFIG.links.tiktok;
    
    document.title = `${s.username || 'My Store'} - Link Bio`;
  }
}

async function loadProducts() {
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  const container = document.getElementById('productList');
  if (querySnapshot.empty) { container.innerHTML = `<div class="text-center py-16 text-gray-300 text-sm">Belum ada produk</div>`; return; }
  const waUtama = document.getElementById('waBtn').dataset.wa || 'https://wa.me/';
  container.innerHTML = '';
  querySnapshot.forEach((docSnap) => {
    const p = docSnap.data();
    const linkWa = p.wa || waUtama;
    const pesanWa = `Halo, saya mau pesan:%0A- Produk: ${escapeHtml(p.nama)}%0A- Harga: Rp ${p.harga.toLocaleString('id-ID')}`;
    let shopeeButton = '';
    if (p.shopee) { shopeeButton = `<a href="${escapeHtml(p.shopee)}" target="_blank" rel="noopener noreferrer" class="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 text-center flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors"><div class="w-4 h-4 bg-[#EE4D2D] rounded text-white text-[8px] font-black flex items-center justify-center">S</div> Shopee</a>`; }
    container.innerHTML += `
      <div class="product-card earth-card overflow-hidden">
        <div class="relative">
          <img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.nama)}" class="w-full h-52 object-cover" onerror="this.src='https://placehold.co/600x400/F4F4F4/AAAAAA?text=Gambar+Error'">
          ${p.stok == 0? `<div class="absolute inset-0 bg-white/70 flex items-center justify-center text-gray-800 font-bold text-sm tracking-wide">HABIS</div>` : ''}
        </div>
        <div class="p-4">
          <h2 class="font-semibold text-sm leading-tight mb-1 text-gray-800">${escapeHtml(p.nama)}</h2>
          <p class="text-gray-900 font-bold text-lg mb-3">Rp${p.harga.toLocaleString('id-ID')}</p>
          <div class="flex gap-2">
            <a href="${linkWa}?text=${pesanWa}" target="_blank" rel="noopener noreferrer" class="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[#25D366] text-white text-center flex items-center justify-center gap-1.5 hover:bg-[#20BD5A] transition-colors">
              <div class="w-4 h-4 bg-white/30 rounded text-white text-[8px] font-black flex items-center justify-center">W</div> Pesan
            </a>
            ${shopeeButton}
          </div>
        </div>
      </div>`;
  });
}

window.shareLink = () => { if (navigator.share) { navigator.share({ title: document.getElementById('username').innerText, url: window.location.href }); } else { navigator.clipboard.writeText(window.location.href); alert('Link berhasil disalin!'); } };

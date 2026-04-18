import { db } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function escapeHtml(unsafe) { if (!unsafe) return ''; return String(unsafe).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]; }); }

document.addEventListener('DOMContentLoaded', async () => { await loadSettings(); await loadProducts(); lucide.createIcons(); });

async function loadSettings() {
  const docSnap = await getDoc(doc(db, "settings", "toko"));
  if (docSnap.exists()) {
    const s = docSnap.data();
    document.getElementById('username').innerText = s.username || '@tokobudi';
    document.getElementById('bio').innerText = s.bio || '';
    document.getElementById('profileImg').src = s.logo || 'https://picsum.photos/id/64/200/200';
    
    const waUtama = s.wa || 'https://wa.me/';
    document.getElementById('waBtn').href = waUtama;
    document.getElementById('waBtn').dataset.wa = waUtama;
    
    // HUBUNGKAN KE TOMBOL PLATFORM BARU
    if (s.wa) {
      document.getElementById('link-wa-main').href = s.wa;
    }
    if (s.shopee) {
      document.getElementById('link-shopee').href = s.shopee;
      document.getElementById('link-shopee').classList.remove('hidden');
    }
    // Opsional: kalau lu simpan link tokopedia/ig di firebase, bisa ditambah di sini
    
    document.title = `${s.username || '@tokobudi'} - Link Bio`;
  }
}

async function loadProducts() {
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  const container = document.getElementById('productList');
  if (querySnapshot.empty) { container.innerHTML = `<div class="text-center py-16"><i data-lucide="package-open" class="lucide w-16 h-16 mx-auto text-gray-200 mb-4"></i><p class="text-gray-300 text-sm">Belum ada produk</p></div>`; lucide.createIcons(); return; }
  const waUtama = document.getElementById('waBtn').dataset.wa || 'https://wa.me/';
  container.innerHTML = '';
  querySnapshot.forEach((docSnap) => {
    const p = docSnap.data();
    const linkWa = p.wa || waUtama;
    const pesanWa = `Halo, saya mau pesan:%0A- Produk: ${escapeHtml(p.nama)}%0A- Harga: Rp ${p.harga.toLocaleString('id-ID')}`;
    let shopeeButton = '';
    if (p.shopee) { shopeeButton = `<a href="${escapeHtml(p.shopee)}" target="_blank" rel="noopener noreferrer" class="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 text-center flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors"><i data-lucide="shopping-bag" class="w-3.5 h-3.5"></i> Shopee</a>`; }
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
              <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> Pesan
            </a>
            ${shopeeButton}
          </div>
        </div>
      </div>`;
  });
  lucide.createIcons();
}

window.shareLink = () => { if (navigator.share) { navigator.share({ title: document.getElementById('username').innerText, url: window.location.href }); } else { navigator.clipboard.writeText(window.location.href); alert('Link berhasil disalin!'); } };

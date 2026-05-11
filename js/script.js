/**
 * LINKify — Storefront Premium (script.js)
 * FIXED: blocked user check, duplicate kategori listener, merged observers
 */

import { db, CONFIG } from '../firebase.js';
import {
  collection, getDocs, query, orderBy,
  doc, getDoc, setDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { escHtml, rupiah, checkPlan, hexToRgb, safeUrl } from './utils.js';
import { applyTemplate as applyThemeTemplate } from './templates.js';

// ── STATE ────────────────────────────────────────────────────────────────────
const urlParams    = new URLSearchParams(window.location.search);
const _rawUID      = urlParams.get('uid') || '';
// SECURITY: validate UID format — Firebase UIDs are 28-char alphanumeric
const USER_ID      = /^[a-zA-Z0-9]{10,128}$/.test(_rawUID) ? _rawUID : null;
let allProducts    = [];
let activeKategori = 'Semua';
let waUtama        = 'https://wa.me/';
let katListenerSet = false; // prevent duplicate listener

// Single shared observer — created once, reused
let revealObserver = null;

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!USER_ID) {
    renderNoStore();
    return;
  }
  initRevealObserver();
  initJellyHandler();
  bootstrap();
});

function renderNoStore() {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:40px 20px;text-align:center;font-family:Inter,sans-serif;background:#0A0A0F;color:rgba(255,255,255,0.4);">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:16px;opacity:0.3">
        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px;color:rgba(255,255,255,0.6)">Toko tidak ditemukan</div>
      <div style="font-size:12px;">Pastikan URL mengandung <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">?uid=...</code></div>
    </div>`;
}

function renderBlockedStore() {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:40px 20px;text-align:center;font-family:Inter,sans-serif;background:#0A0A0F;color:rgba(255,255,255,0.4);">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:16px;opacity:0.5;color:#EF4444">
        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px;color:rgba(255,255,255,0.6)">Toko Tidak Tersedia</div>
      <div style="font-size:12px;">Toko ini sedang tidak aktif.</div>
    </div>`;
}

async function bootstrap() {
  await loadSettings();
  await loadProducts();
}

// ── OBSERVERS — created once ──────────────────────────────────────────────────
function initRevealObserver() {
  if (revealObserver) return;
  revealObserver = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        e.target.classList.add('show'); // covers both .reveal and .fade-up
        revealObserver.unobserve(e.target);
      });
    },
    { threshold: 0.06, rootMargin: '0px 0px -8px 0px' }
  );
}

// Observe both .fade-up and .reveal elements through single observer
function observeAll() {
  if (!revealObserver) return;
  document.querySelectorAll('.fade-up:not(.show), .reveal:not(.visible)').forEach(el => {
    revealObserver.observe(el);
  });
}

function observeNewCards(container) {
  if (!revealObserver || !container) return;
  container.querySelectorAll('.reveal:not(.visible)').forEach((el, i) => {
    el.className = el.className.replace(/reveal-delay-\d/g, '').trim();
    const step   = Math.min(i, 4);
    if (step > 0) el.classList.add('reveal-delay-' + step);
    revealObserver.observe(el);
  });
}

// ── JELLY — single delegated listener ────────────────────────────────────────
function initJellyHandler() {
  document.addEventListener('pointerdown', e => {
    e.target.closest('.jelly-click')?.classList.remove('bounce-back');
  }, { passive: true });

  document.addEventListener('pointerup', e => {
    const el = e.target.closest('.jelly-click');
    if (!el) return;
    requestAnimationFrame(() => {
      el.classList.add('bounce-back');
      setTimeout(() => el.classList.remove('bounce-back'), 240);
    });
  }, { passive: true });
}

// ── ANALYTICS ────────────────────────────────────────────────────────────────
async function trackEvent(field) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await setDoc(
      doc(db, 'toko', USER_ID, 'stats', today),
      { [field]: increment(1) },
      { merge: true }
    );
  } catch { /* non-critical — fail silent */ }
}

window.trackClick = type => trackEvent(type === 'wa' ? 'waClicks' : 'shopeeClicks');

// ── LOAD SETTINGS ─────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    // Check cache first (5 minutes)
    const cacheKey = `toko_${USER_ID}`;
    const cached = localStorage.getItem(cacheKey);
    let s;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.timestamp && parsed?.data &&
            Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          s = parsed.data;
        }
      } catch { localStorage.removeItem(cacheKey); } // discard corrupt cache
    }
    if (!s) {
      const snap = await getDoc(doc(db, 'toko', USER_ID));
      if (!snap.exists()) {
        document.getElementById('username').textContent = 'Toko tidak ditemukan';
        return;
      }
      s = snap.data();
      // Cache it
      localStorage.setItem(cacheKey, JSON.stringify({ data: s, timestamp: Date.now() }));
    }

    // SECURITY: check blocked status
    if (s.status === 'blokir') {
      renderBlockedStore();
      return;
    }

    const plan    = checkPlan(s);      // 'free' | 'basic' | 'premium'
    const isBasic = plan === 'basic' || plan === 'premium';
    const isPrem  = plan === 'premium';

    // ── TEMPLATE SYSTEM (unified, no conflict) ──────────────────
    // Remove any stale template classes first
    document.body.className = document.body.className
      .replace(/\btemplate-\S+/g, '').trim();

    // Apply premium theme class — only if valid known template
    const VALID_THEMES = ['fashion','kuliner','kecantikan','elektronik','kreator','reseller'];
    const themeId = isPrem ? (s.premium?.templateTheme || '') : '';
    if (themeId && VALID_THEMES.includes(themeId)) {
      applyThemeTemplate(themeId);
    }

    // Apply background image (independent of theme class)
    const tplBg  = isPrem ? (s.premium?.templateBg || '') : '';
    const tplAcc = isPrem ? (s.premium?.templateAccent || '') : '';
    applyBgLayer(tplBg);

    // 3. Accent color (Premium only)
    const accent = (isPrem && s.premium?.accentColor)
      ? s.premium.accentColor
      : (tplAcc || '#FF6B35');
    document.documentElement.style.setProperty('--idx-accent',     accent);
    document.documentElement.style.setProperty('--idx-accent-rgb', hexToRgb(accent));

    // 4. Verified badge (Premium only)
    const badge = document.getElementById('verified-badge');
    if (badge) badge.style.display = isPrem ? 'inline-flex' : 'none';

    // 5. Footer branding — hide if Premium
    const footerBrand = document.querySelector('.footer-brand');
    if (footerBrand) footerBrand.style.display = isPrem ? 'none' : '';

    // 5. Store info
    const storeName = s.namaToko || 'My Store';
    document.getElementById('username').textContent = storeName;
    document.title = storeName + ' — LINKify';
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', storeName + ' — Toko Online');
    document.querySelector('meta[name="description"]')?.setAttribute('content', 
      `${s.bio || 'Toko online premium'}. Belanja ${storeName} via WhatsApp, Shopee, Tokopedia. Buka di LINKify.`);

    const bioEl = document.getElementById('bio');
    if (bioEl) bioEl.textContent = s.bio || '';

    const profImg = document.getElementById('profileImg');
    if (profImg && s.logo) { profImg.src = s.logo; profImg.onerror = () => { profImg.style.display = 'none'; }; }

    const fsEl = document.getElementById('footer-store');
    if (fsEl) fsEl.textContent = '© 2025 ' + storeName;

    // 6. WA
    waUtama = safeUrl(s.wa || 'https://wa.me/');
    const waBtn  = document.getElementById('waBtn');
    const waMain = document.getElementById('link-wa-main');
    if (waBtn)  { waBtn.href = waUtama; waBtn.dataset.wa = waUtama; }
    if (waMain) waMain.href = waUtama;

    // 7. Shopee (Basic + Premium)
    if (isBasic && s.shopee) {
      const elShopee = document.getElementById('link-shopee');
      if (elShopee) { elShopee.href = safeUrl(s.shopee); elShopee.classList.remove('hidden'); }
    }

    // 8. Social icons (Basic + Premium)
    if (isBasic) renderSocialIcons(s);

    // 9. Tokopedia (Basic + Premium)
    const elTok = document.getElementById('link-tokped');
    if (elTok) {
      if (isBasic && s.tokopedia) {
        elTok.href = safeUrl(s.tokopedia);
        elTok.classList.remove('hidden');
      } else {
        elTok.classList.add('hidden');
      }
    }

    // 10. Custom buttons (Premium only)
    if (isPrem && Array.isArray(s.customButtons) && s.customButtons.length) {
      renderCustomButtons(s.customButtons);
    }

    // 11. Gallery (Basic + Premium)
    if (isBasic && Array.isArray(s.gallery) && s.gallery.length) {
      renderGalleryButton(s.gallery, USER_ID);
    }

    // 12. Observe fade-up elements
    observeAll();

    // 13. Track visit — once per session
    if (!sessionStorage.getItem('vf_' + USER_ID)) {
      sessionStorage.setItem('vf_' + USER_ID, '1');
      trackEvent('visits');
    }
  } catch (err) {
    console.error('[loadSettings]', err);
  }
}

function renderSocialIcons(s) {
  const container = document.getElementById('social-icons');
  const bar       = document.getElementById('social-bar');
  if (!container || !bar) return;

  const map = [
    { key: 'instagram', id: 'ico-instagram', label: 'Instagram', color: '#E1306C' },
    { key: 'tiktok',    id: 'ico-tiktok',    label: 'TikTok',    color: '#010101' },
    { key: 'twitter',   id: 'ico-twitter',   label: 'X',         color: '#000000' },
    { key: 'facebook',  id: 'ico-facebook',  label: 'Facebook',  color: '#1877F2' },
    { key: 'youtube',   id: 'ico-youtube',   label: 'YouTube',   color: '#FF0000' },
  ];

  const frag = document.createDocumentFragment();
  let has = false;
  map.forEach(({ key, id, label, color }) => {
    if (!s[key]) return;
    has = true;
    const a = document.createElement('a');
    a.href      = safeUrl(s[key]); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'social-icon-btn'; a.setAttribute('aria-label', label);
    a.style.setProperty('--social-color', color);
    a.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><use href="#${id}"/></svg>`;
    frag.appendChild(a);
  });
  if (has) { container.appendChild(frag); bar.style.display = ''; }
}

function renderCustomButtons(buttons) {
  const section = document.getElementById('custom-buttons-section');
  if (!section) return;
  const wrap = section.querySelector('.custom-btn-wrap');
  if (!wrap) return;

  const frag = document.createDocumentFragment();
  let count = 0;
  buttons.forEach(btn => {
    if (!btn.label || !btn.url) return;
    const a = document.createElement('a');
    a.href = safeUrl(btn.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'platform-btn custom-btn jelly-click';
    const bgColor = btn.color || '#3B82F6';
    a.style.cssText = `background:${bgColor};`;
    a.innerHTML = `
      <div class="icon-box" style="background:rgba(0,0,0,.15);">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true">
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
        </svg>
      </div>
      <div class="custom-btn-text">
        <span class="custom-btn-label">${escHtml(btn.label)}</span>
        ${btn.desc ? `<span class="custom-btn-desc">${escHtml(btn.desc)}</span>` : ''}
      </div>
      <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    frag.appendChild(a);
    count++;
  });
  if (count) { wrap.appendChild(frag); section.style.display = ''; }
}

function renderGalleryButton(photos, uid) {
  const wrap = document.getElementById('gallery-btn-wrap');
  const btn  = document.getElementById('gallery-btn');
  const prev = document.getElementById('gallery-previews');
  const cnt  = document.getElementById('gallery-count');
  if (!wrap || !btn) return;

  btn.href = `gallery.html?uid=${uid}`;

  if (prev) {
    prev.innerHTML = '';
    photos.slice(0, 3).forEach(item => {
      const url = typeof item === 'string' ? item : (item?.url || '');
      if (!url || !/^https?:\/\//.test(url)) return; // skip invalid URLs
      const img = document.createElement('img');
      img.src     = url;
      img.alt     = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => { img.style.display = 'none'; };
      prev.appendChild(img);
    });
  }
  if (cnt) cnt.textContent = photos.length + ' foto';
  wrap.style.display = '';
}

// ── LOAD PRODUCTS ─────────────────────────────────────────────────────────────
async function loadProducts() {
  const container = document.getElementById('productList');
  if (!container) return;

  try {
    const snap = await getDocs(
      query(collection(db, 'toko', USER_ID, 'produk'), orderBy('createdAt', 'desc'))
    );

    if (snap.empty) {
      container.innerHTML = `<div class="empty-state grid-span-all">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        Belum ada produk
      </div>`;
      return;
    }

    allProducts = [];
    snap.forEach(ds => allProducts.push({ id: ds.id, ...ds.data() }));

    renderKategoriFilter();

    // Unggulan
    const unggulan = allProducts.filter(p => p.unggulan);
    const secEl    = document.getElementById('unggulan-section');
    const ungEl    = document.getElementById('unggulanList');
    if (unggulan.length && secEl && ungEl) {
      secEl.style.display = '';
      ungEl.innerHTML = unggulan.map(buildProductCard).join('');
      observeNewCards(ungEl);
    } else if (secEl) { secEl.style.display = 'none'; }

    renderFilteredProducts();
  } catch (err) {
    console.error('[loadProducts]', err);
    container.innerHTML = `<div class="empty-state grid-span-all" style="color:rgba(255,100,100,0.55)">Gagal memuat produk. Refresh halaman.</div>`;
  }
}

// ── KATEGORI ──────────────────────────────────────────────────────────────────
function renderKategoriFilter() {
  const el = document.getElementById('kategori-filter');
  if (!el) return;
  const cats = new Set(allProducts.map(p => p.kategori).filter(Boolean));
  if (!cats.size) { el.style.display = 'none'; return; }

  el.style.display = '';
  el.innerHTML = ['Semua', ...cats].map(k =>
    `<button class="kat-btn${k === activeKategori ? ' active' : ''}" data-kat="${escHtml(k)}">${escHtml(k)}</button>`
  ).join('');

  // FIX: only attach listener once using a flag guard
  if (!katListenerSet) {
    katListenerSet = true;
    el.addEventListener('click', e => {
      const btn = e.target.closest('.kat-btn');
      if (!btn) return;
      activeKategori = btn.dataset.kat;
      el.querySelectorAll('.kat-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderFilteredProducts();
    });
  }
}

function renderFilteredProducts() {
  const container = document.getElementById('productList');
  if (!container) return;
  const list = activeKategori === 'Semua'
    ? allProducts
    : allProducts.filter(p => p.kategori === activeKategori);

  if (!list.length) {
    container.innerHTML = `<div class="empty-state grid-span-all">Tidak ada produk di kategori ini</div>`;
    return;
  }
  container.innerHTML = list.map(buildProductCard).join('');
  observeNewCards(container);
}

// ── PRODUCT CARD ──────────────────────────────────────────────────────────────
function buildProductCard(p) {
  const wa        = p.wa || waUtama;
  const nama      = p.nama || '';
  const stokNol   = Number(p.stok) === 0;
  const hasDiskon = p.hargaAsli && Number(p.hargaAsli) > Number(p.harga);
  const pct       = hasDiskon ? Math.round((1 - p.harga / p.hargaAsli) * 100) : 0;
  const pesanWa   = encodeURIComponent(
    'Halo, saya mau pesan:\n- Produk: ' + nama + '\n- Harga: Rp ' + rupiah(p.harga)
  );
  const shopeeBtn = p.shopee
    ? `<a href="${escHtml(safeUrl(p.shopee))}" target="_blank" rel="noopener noreferrer"
          class="prod-btn prod-btn-shopee jelly-click" onclick="trackClick('shopee')">
         <svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true"><use href="#ico-shopee"/></svg>Shopee
       </a>` : '';

  return `<div class="product-card reveal">
    <div class="prod-img-wrap">
      <img src="${escHtml(p.img || '')}" alt="${escHtml(nama)}"
           class="product-img" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='https://placehold.co/400x300/111/333?text=Foto'">
      ${stokNol   ? '<div class="badge-stok">HABIS</div>' : ''}
      ${hasDiskon ? `<div class="badge-diskon">-${pct}%</div>` : ''}
      ${p.unggulan ? '<div class="badge-unggulan">★</div>' : ''}
    </div>
    <div class="product-info">
      <p class="product-name">${escHtml(nama)}</p>
      <div class="price-row">
        <span class="product-price">Rp${rupiah(p.harga)}</span>
        ${hasDiskon ? `<span class="harga-coret">Rp${rupiah(p.hargaAsli)}</span>` : ''}
      </div>
      ${p.deskripsi ? `<p class="product-desc">${escHtml(p.deskripsi)}</p>` : ''}
      <div class="prod-btns">
        <a href="${escHtml(safeUrl(wa))}?text=${pesanWa}" target="_blank" rel="noopener noreferrer"
           class="prod-btn prod-btn-wa jelly-click" onclick="trackClick('wa')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true"><use href="#ico-wa"/></svg>
          Pesan WA
        </a>
        ${shopeeBtn}
      </div>
    </div>
  </div>`;
}

// ── BACKGROUND LAYER (background image only, no class conflict) ──────────────
function applyBgLayer(bgUrl) {
  let bgEl = document.getElementById('tpl-bg-layer');
  if (!bgEl) {
    bgEl = document.createElement('div');
    bgEl.id = 'tpl-bg-layer';
    bgEl.setAttribute('aria-hidden', 'true');
    bgEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;transition:opacity 0.4s;';
    document.body.prepend(bgEl);
  }
  if (bgUrl) {
    bgEl.style.backgroundImage = `url('${encodeURI(bgUrl)}')`;
    bgEl.style.opacity = '1';
    bgEl.classList.add('active');
  } else {
    bgEl.style.backgroundImage = 'none';
    bgEl.style.opacity = '0';
    bgEl.classList.remove('active');
  }
}
// Legacy alias
function applyTemplate(tpl, bgUrl) { applyBgLayer(bgUrl); }

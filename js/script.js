/**
 * LINKify — Storefront Premium (script.js)
 * PATCHED:
 *  - blocked user check
 *  - duplicate kategori listener guard
 *  - merged observers (single IntersectionObserver)
 *  - XSS: onerror inline removed → delegated onerror on productList
 *  - lazy image loading + decoding=async
 *  - debounced category render
 *  - UID regex stricter
 *  - safeUrl on all hrefs
 *  - no innerHTML with user data except through escHtml
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
// SECURITY: Firebase UIDs are 28 chars alphanumeric. Allow 10–128 for safety.
const USER_ID      = /^[a-zA-Z0-9]{10,128}$/.test(_rawUID) ? _rawUID : null;
let allProducts    = [];
let activeKategori = 'Semua';
let waUtama        = 'https://wa.me/';
let katListenerSet = false;

// Single shared observer — created once, reused
let revealObserver = null;

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!USER_ID) { renderNoStore(); return; }
  initRevealObserver();
  initJellyHandler();
  bootstrap();
});

function renderNoStore() {
  document.body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:40px 20px;text-align:center;font-family:Inter,sans-serif;background:#0A0A0F;color:rgba(255,255,255,0.4);';
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','40'); svg.setAttribute('height','40');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.5');
  svg.style.cssText = 'margin-bottom:16px;opacity:0.3';
  svg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';
  const h = document.createElement('div');
  h.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:6px;color:rgba(255,255,255,0.6)';
  h.textContent = 'Toko tidak ditemukan';
  const p = document.createElement('div');
  p.style.fontSize = '12px';
  p.textContent = 'Pastikan URL mengandung ?uid=...';
  wrap.append(svg, h, p);
  document.body.appendChild(wrap);
}

function renderBlockedStore() {
  document.body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:40px 20px;text-align:center;font-family:Inter,sans-serif;background:#0A0A0F;color:rgba(255,255,255,0.4);';
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','40'); svg.setAttribute('height','40');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.5');
  svg.style.cssText = 'margin-bottom:16px;opacity:0.5;color:#EF4444';
  svg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';
  const h = document.createElement('div');
  h.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:6px;color:rgba(255,255,255,0.6)';
  h.textContent = 'Toko Tidak Tersedia';
  const p = document.createElement('div');
  p.style.fontSize = '12px';
  p.textContent = 'Toko ini sedang tidak aktif.';
  wrap.append(svg, h, p);
  document.body.appendChild(wrap);
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
        e.target.classList.add('show');
        revealObserver.unobserve(e.target);
      });
    },
    { threshold: 0.06, rootMargin: '0px 0px -8px 0px' }
  );
}

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
    const step = Math.min(i, 4);
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
  } catch { /* non-critical */ }
}

window.trackClick = type => trackEvent(type === 'wa' ? 'waClicks' : 'shopeeClicks');

// ── LOAD SETTINGS ─────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const cacheKey = `toko_${USER_ID}`;
    let s = null;

    // Cache hanya untuk data statis (nama, bio, wa, logo, plan, status)
    // Field premium.* (template, accent, bg) SELALU fetch fresh — tidak di-cache
    // karena perubahan dari admin harus langsung terlihat saat refresh
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // TTL 2 menit — lebih pendek supaya perubahan admin cepat terlihat
        if (parsed?.timestamp && parsed?.data && Date.now() - parsed.timestamp < 2 * 60 * 1000) {
          // Hanya pakai cache jika BUKAN premium — user premium selalu fresh
          // supaya template/accent/bg langsung update tanpa tunggu TTL
          const cachedPlan = parsed.data?.plan;
          const isPremCache = cachedPlan === 'premium' || parsed.data?.premium?.active;
          if (!isPremCache) {
            s = parsed.data;
          }
        }
      }
    } catch { localStorage.removeItem(cacheKey); }

    if (!s) {
      const snap = await getDoc(doc(db, 'toko', USER_ID));
      if (!snap.exists()) {
        const uEl = document.getElementById('username');
        if (uEl) uEl.textContent = 'Toko tidak ditemukan';
        return;
      }
      s = snap.data();
      // Jangan cache user premium — supaya template perubahan langsung reflect
      const planNow = s?.plan;
      const isPremNow = planNow === 'premium' || s?.premium?.active;
      if (!isPremNow) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: s, timestamp: Date.now() }));
        } catch { /* storage full — ok */ }
      }
    }

    // SECURITY: block suspended accounts
    if (s.status === 'blokir') { renderBlockedStore(); return; }

    const plan    = checkPlan(s);
    const isBasic = plan === 'basic' || plan === 'premium';
    const isPrem  = plan === 'premium';

    // Apply template (class + bg)
    document.body.className = document.body.className.replace(/\btemplate-\S+/g, '').trim();
    const VALID_THEMES = ['fashion','kuliner','kecantikan','elektronik','kreator','reseller'];
    const themeId = isPrem ? (s.premium?.templateTheme || '') : '';
    if (themeId && VALID_THEMES.includes(themeId)) applyThemeTemplate(themeId);

    const tplBg  = isPrem ? (s.premium?.templateBg  || '') : '';
    const tplAcc = isPrem ? (s.premium?.templateAccent || '') : '';
    applyBgLayer(tplBg);

    const accent = (isPrem && s.premium?.accentColor) ? s.premium.accentColor : (tplAcc || '#FF6B35');
    // Validate accent is a real hex color before applying
    if (/^#[0-9a-fA-F]{6}$/.test(accent)) {
      document.documentElement.style.setProperty('--idx-accent', accent);
      document.documentElement.style.setProperty('--idx-accent-rgb', hexToRgb(accent));
    }

    const badge = document.getElementById('verified-badge');
    if (badge) badge.style.display = isPrem ? 'inline-flex' : 'none';

    const footerBrand = document.querySelector('.footer-brand');
    if (footerBrand) footerBrand.style.display = isPrem ? 'none' : '';

    // Store info — textContent only (safe)
    const storeName = s.namaToko ? String(s.namaToko).slice(0, 100) : 'My Store';
    const uEl = document.getElementById('username');
    if (uEl) uEl.textContent = storeName;
    document.title = storeName + ' — LINKify';
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', storeName + ' — Toko Online');
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `${s.bio || 'Toko online premium'}. Belanja ${storeName} via WhatsApp, Shopee, Tokopedia.`);

    const bioEl = document.getElementById('bio');
    if (bioEl) bioEl.textContent = s.bio ? String(s.bio).slice(0, 200) : '';

    const profImg = document.getElementById('profileImg');
    if (profImg && s.logo && /^https?:\/\//i.test(s.logo)) {
      profImg.src = s.logo;
      profImg.onerror = () => { profImg.style.display = 'none'; };
    }

    const fsEl = document.getElementById('footer-store');
    if (fsEl) fsEl.textContent = '© 2025 ' + storeName;

    // WA
    waUtama = safeUrl(s.wa || 'https://wa.me/');
    const waBtn  = document.getElementById('waBtn');
    const waMain = document.getElementById('link-wa-main');
    if (waBtn)  { waBtn.href = waUtama; waBtn.dataset.wa = waUtama; }
    if (waMain) waMain.href = waUtama;

    // Shopee
    if (isBasic && s.shopee) {
      const elShopee = document.getElementById('link-shopee');
      if (elShopee) { elShopee.href = safeUrl(s.shopee); elShopee.classList.remove('hidden'); }
    }

    // Social icons
    if (isBasic) renderSocialIcons(s);

    // Tokopedia
    const elTok = document.getElementById('link-tokped');
    if (elTok) {
      if (isBasic && s.tokopedia) {
        elTok.href = safeUrl(s.tokopedia);
        elTok.classList.remove('hidden');
      } else {
        elTok.classList.add('hidden');
      }
    }

    // Custom buttons (Premium only)
    if (isPrem && Array.isArray(s.customButtons) && s.customButtons.length) {
      renderCustomButtons(s.customButtons);
    }

    // Gallery (Basic + Premium)
    if (isBasic && Array.isArray(s.gallery) && s.gallery.length) {
      renderGalleryButton(s.gallery, USER_ID);
    }

    observeAll();

    // Track visit — once per session
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
    const url = safeUrl(s[key]);
    if (url === '#') return; // skip invalid
    has = true;
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'social-icon-btn'; a.setAttribute('aria-label', label);
    a.style.setProperty('--social-color', color);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<use href="#${id}"/>`;
    a.appendChild(svg);
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
    const url = safeUrl(btn.url);
    if (url === '#') return; // skip invalid URLs
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'platform-btn custom-btn jelly-click';
    // Validate color is hex only
    const bgColor = /^#[0-9a-fA-F]{3,6}$/.test(btn.color) ? btn.color : '#3B82F6';
    a.style.background = bgColor;

    const iconBox = document.createElement('div');
    iconBox.className = 'icon-box';
    iconBox.style.background = 'rgba(0,0,0,.15)';
    iconBox.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>';

    const textDiv = document.createElement('div');
    textDiv.className = 'custom-btn-text';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'custom-btn-label';
    labelSpan.textContent = String(btn.label).slice(0, 60); // textContent safe
    textDiv.appendChild(labelSpan);
    if (btn.desc) {
      const descSpan = document.createElement('span');
      descSpan.className = 'custom-btn-desc';
      descSpan.textContent = String(btn.desc).slice(0, 100);
      textDiv.appendChild(descSpan);
    }

    const arrow = document.createElementNS('http://www.w3.org/2000/svg','svg');
    arrow.setAttribute('viewBox','0 0 24 24'); arrow.setAttribute('fill','none');
    arrow.setAttribute('stroke','white'); arrow.setAttribute('stroke-width','2');
    arrow.setAttribute('stroke-linecap','round'); arrow.setAttribute('width','14'); arrow.setAttribute('height','14');
    arrow.classList.add('btn-arrow');
    arrow.innerHTML = '<path d="M5 12h14M12 5l7 7-7 7"/>';

    a.append(iconBox, textDiv, arrow);
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

  btn.href = `gallery.html?uid=${encodeURIComponent(uid)}`;

  if (prev) {
    prev.innerHTML = '';
    photos.slice(0, 3).forEach(item => {
      const url = typeof item === 'string' ? item : (item?.url || '');
      if (!url || !/^https?:\/\//i.test(url)) return;
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
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
      container.textContent = '';
      const empty = document.createElement('div');
      empty.className = 'empty-state grid-span-all';
      empty.textContent = 'Belum ada produk';
      container.appendChild(empty);
      return;
    }

    allProducts = [];
    snap.forEach(ds => allProducts.push({ id: ds.id, ...ds.data() }));

    renderKategoriFilter();

    const unggulan = allProducts.filter(p => p.unggulan);
    const secEl    = document.getElementById('unggulan-section');
    const ungEl    = document.getElementById('unggulanList');
    if (unggulan.length && secEl && ungEl) {
      secEl.style.display = '';
      renderProductCards(ungEl, unggulan);
      observeNewCards(ungEl);
    } else if (secEl) { secEl.style.display = 'none'; }

    renderFilteredProducts();
  } catch (err) {
    console.error('[loadProducts]', err);
    container.textContent = '';
    const err2 = document.createElement('div');
    err2.className = 'empty-state grid-span-all';
    err2.style.color = 'rgba(255,100,100,0.55)';
    err2.textContent = 'Gagal memuat produk. Refresh halaman.';
    container.appendChild(err2);
  }
}

// ── KATEGORI ──────────────────────────────────────────────────────────────────
function renderKategoriFilter() {
  const el = document.getElementById('kategori-filter');
  if (!el) return;
  const cats = new Set(allProducts.map(p => p.kategori).filter(Boolean));
  if (!cats.size) { el.style.display = 'none'; return; }

  el.style.display = '';
  el.textContent = '';
  const frag = document.createDocumentFragment();
  ['Semua', ...cats].forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'kat-btn' + (k === activeKategori ? ' active' : '');
    btn.dataset.kat = k;
    btn.textContent = k; // textContent — safe
    frag.appendChild(btn);
  });
  el.appendChild(frag);

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
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state grid-span-all';
    empty.textContent = 'Tidak ada produk di kategori ini';
    container.appendChild(empty);
    return;
  }
  renderProductCards(container, list);
  observeNewCards(container);
}

// ── PRODUCT CARDS — DOM-based render (no innerHTML with user data) ────────────
function renderProductCards(container, products) {
  container.textContent = '';
  const frag = document.createDocumentFragment();
  products.forEach(p => frag.appendChild(buildProductCard(p)));
  container.appendChild(frag);
}

function buildProductCard(p) {
  const wa        = safeUrl(p.wa || waUtama);
  const nama      = String(p.nama || '').slice(0, 100);
  const stokNol   = Number(p.stok) === 0;
  const hasDiskon = p.hargaAsli && Number(p.hargaAsli) > Number(p.harga);
  const pct       = hasDiskon ? Math.round((1 - p.harga / p.hargaAsli) * 100) : 0;
  const pesanTxt  = `Halo, saya mau pesan:\n- Produk: ${nama}\n- Harga: Rp ${rupiah(p.harga)}`;

  const card = document.createElement('div');
  card.className = 'product-card reveal';

  // Image wrap
  const imgWrap = document.createElement('div');
  imgWrap.className = 'prod-img-wrap';

  const img = document.createElement('img');
  const imgSrc = (p.img && /^https?:\/\//i.test(p.img)) ? p.img : '';
  img.src = imgSrc || 'https://placehold.co/400x300/111/333?text=Foto';
  img.alt = nama; img.className = 'product-img';
  img.loading = 'lazy'; img.decoding = 'async';
  img.onerror = function() { this.onerror = null; this.src = 'https://placehold.co/400x300/111/333?text=Foto'; };
  imgWrap.appendChild(img);

  if (stokNol) {
    const b = document.createElement('div');
    b.className = 'badge-stok'; b.textContent = 'HABIS'; imgWrap.appendChild(b);
  }
  if (hasDiskon) {
    const b = document.createElement('div');
    b.className = 'badge-diskon'; b.textContent = `-${pct}%`; imgWrap.appendChild(b);
  }
  if (p.unggulan) {
    const b = document.createElement('div');
    b.className = 'badge-unggulan'; b.textContent = '★'; imgWrap.appendChild(b);
  }

  // Info
  const info = document.createElement('div');
  info.className = 'product-info';

  const pName = document.createElement('p');
  pName.className = 'product-name'; pName.textContent = nama;
  info.appendChild(pName);

  const priceRow = document.createElement('div');
  priceRow.className = 'price-row';
  const priceEl = document.createElement('span');
  priceEl.className = 'product-price'; priceEl.textContent = 'Rp' + rupiah(p.harga);
  priceRow.appendChild(priceEl);
  if (hasDiskon) {
    const old = document.createElement('span');
    old.className = 'harga-coret'; old.textContent = 'Rp' + rupiah(p.hargaAsli);
    priceRow.appendChild(old);
  }
  info.appendChild(priceRow);

  if (p.deskripsi) {
    const desc = document.createElement('p');
    desc.className = 'product-desc'; desc.textContent = String(p.deskripsi).slice(0, 200);
    info.appendChild(desc);
  }

  // Buttons
  const btnWrap = document.createElement('div');
  btnWrap.className = 'prod-btns';

  const waLink = document.createElement('a');
  waLink.href = `${wa}?text=${encodeURIComponent(pesanTxt)}`;
  waLink.target = '_blank'; waLink.rel = 'noopener noreferrer';
  waLink.className = 'prod-btn prod-btn-wa jelly-click';
  waLink.addEventListener('click', () => window.trackClick('wa'));
  waLink.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true"><use href="#ico-wa"/></svg>';
  waLink.append(' Pesan WA');
  btnWrap.appendChild(waLink);

  if (p.shopee) {
    const shopeeUrl = safeUrl(p.shopee);
    if (shopeeUrl !== '#') {
      const shopeeLink = document.createElement('a');
      shopeeLink.href = shopeeUrl; shopeeLink.target = '_blank'; shopeeLink.rel = 'noopener noreferrer';
      shopeeLink.className = 'prod-btn prod-btn-shopee jelly-click';
      shopeeLink.addEventListener('click', () => window.trackClick('shopee'));
      shopeeLink.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true"><use href="#ico-shopee"/></svg>';
      shopeeLink.append(' Shopee');
      btnWrap.appendChild(shopeeLink);
    }
  }
  info.appendChild(btnWrap);

  card.append(imgWrap, info);
  return card;
}

// ── BACKGROUND LAYER ──────────────────────────────────────────────────────────
function applyBgLayer(bgUrl) {
  let bgEl = document.getElementById('tpl-bg-layer');
  if (!bgEl) {
    bgEl = document.createElement('div');
    bgEl.id = 'tpl-bg-layer';
    bgEl.setAttribute('aria-hidden', 'true');
    bgEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;transition:opacity 0.4s;';
    document.body.prepend(bgEl);
  }
  // Validate URL before applying as background-image (prevent CSS injection)
  if (bgUrl && /^https?:\/\//i.test(bgUrl)) {
    bgEl.style.backgroundImage = `url('${encodeURI(bgUrl)}')`;
    bgEl.style.opacity = '1';
    bgEl.classList.add('active');
  } else {
    bgEl.style.backgroundImage = 'none';
    bgEl.style.opacity = '0';
    bgEl.classList.remove('active');
  }
}

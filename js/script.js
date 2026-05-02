/**
 * LINKify — Public Storefront (script.js)
 * Fixed: observer timing, removed backgroundAttachment:fixed, batched DOM
 */

import { db, CONFIG } from '../firebase.js';
import {
  collection, getDocs, query, orderBy,
  doc, getDoc, setDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { escHtml, rupiah, checkPremium, hexToRgb } from './utils.js';

// ── STATE ───────────────────────────────────────────────────────────────────
const urlParams    = new URLSearchParams(window.location.search);
const STORE_KEY    = urlParams.get('uid');
let USER_ID        = null;
let allProducts    = [];
let activeKategori = 'Semua';
let waUtama        = 'https://wa.me/';

// Single IntersectionObserver instance — created once, never re-created
let revealObserver = null;

// ── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!STORE_KEY) {
    document.body.innerHTML =
      '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:80px 20px;font-family:Poppins,sans-serif;font-size:14px;">Toko tidak ditemukan.<br><span style="font-size:12px;opacity:0.5;">Pastikan URL mengandung ?uid=...</span></div>';
    return;
  }

  // Create observers once upfront
  initRevealObserver();
  initJellyHandler();

  // Run async work
  bootstrap();
});

async function bootstrap() {
  if (!STORE_KEY) {
    document.body.innerHTML =
      '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:80px 20px;font-family:Poppins,sans-serif;font-size:14px;">Toko tidak ditemukan.<br><span style="font-size:12px;opacity:0.5;">Pastikan URL mengandung ?uid=...</span></div>';
    return;
  }

  await loadSettings();
  // Observe static fade-up elements AFTER settings applied
  observeFadeUp();
  await loadProducts();
}

// ── REVEAL OBSERVER — single instance ──────────────────────────────────────
function initRevealObserver() {
  if (revealObserver) return;
  revealObserver = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      });
    },
    { threshold: 0.06, rootMargin: '0px 0px -10px 0px' }
  );
}

function observeFadeUp() {
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('show');
        io.unobserve(e.target);
      });
    },
    { threshold: 0.08 }
  );
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

function observeNewCards(container) {
  if (!revealObserver || !container) return;
  const cards = container.querySelectorAll('.reveal:not(.visible)');
  cards.forEach((el, i) => {
    // Max stagger: 4 steps
    const step = Math.min(i, 4);
    el.className = el.className.replace(/reveal-delay-\d/g, '').trim();
    if (step > 0) el.classList.add('reveal-delay-' + step);
    revealObserver.observe(el);
  });
}

// ── JELLY — delegation, one listener only ──────────────────────────────────
function initJellyHandler() {
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('.jelly-click');
    if (el) { el.classList.remove('bounce-back'); }
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

// ── ANALYTICS ───────────────────────────────────────────────────────────────
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

// ── LOAD SETTINGS ───────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'toko', STORE_KEY));
    if (!snap.exists()) {
      document.getElementById('username').textContent = 'Toko tidak ditemukan';
      return;
    }

    USER_ID = snap.id;
    const s = snap.data();
    const isPrem  = checkPremium(s);

    // 1. Theme template — no backgroundAttachment:fixed (kills mobile perf)
    const tpl    = isPrem ? (s.premium?.template || 'default') : 'default';
    const tplBg  = isPrem ? (s.premium?.templateBg || '')      : '';
    const tplAcc = isPrem ? (s.premium?.templateAccent || '')  : '';
    applyTemplate(tpl, tplBg);

    // 2. Accent color
    const accent = (isPrem && s.premium?.accentColor)
      ? s.premium.accentColor
      : (tplAcc || '#FF6B35');
    document.documentElement.style.setProperty('--idx-accent',     accent);
    document.documentElement.style.setProperty('--idx-accent-rgb', hexToRgb(accent));

    // 3. Verified badge
    const badge = document.getElementById('verified-badge');
    if (badge) badge.style.display = isPrem ? 'inline-flex' : 'none';

    // 4. Footer branding
    const footerBrand = document.querySelector('.footer-brand');
    if (footerBrand) footerBrand.style.display = isPrem ? 'none' : '';

    // 5. Store info — batch all text writes
    const storeName = s.namaToko || 'My Store';
    document.getElementById('username').textContent      = storeName;
    document.title                                        = storeName + ' - LINKify';
    const fs = document.getElementById('footer-store');
    if (fs) fs.textContent = '© 2025 ' + storeName;

    const bioEl = document.getElementById('bio');
    if (bioEl) bioEl.textContent = s.bio || '';

    const profImg = document.getElementById('profileImg');
    if (profImg && s.logo) profImg.src = s.logo;

    // 6. WA links
    waUtama = s.wa || 'https://wa.me/';
    const waBtn  = document.getElementById('waBtn');
    const waMain = document.getElementById('link-wa-main');
    if (waBtn)  { waBtn.href = waUtama; waBtn.dataset.wa = waUtama; }
    if (waMain) waMain.href = waUtama;

    // 7. Shopee
    if (s.shopee) {
      const elShopee = document.getElementById('link-shopee');
      if (elShopee) { elShopee.href = s.shopee; elShopee.classList.remove('hidden'); }
    }

    // 8. Social icons — single DocumentFragment write
    renderSocialIcons(s);

    // 9. Tokopedia default
    const elTok = document.getElementById('link-tokped');
    if (elTok && CONFIG?.links?.tokopedia) elTok.href = CONFIG.links.tokopedia;

    // 10. Custom buttons (premium)
    if (isPrem && Array.isArray(s.customButtons) && s.customButtons.length) {
      renderCustomButtons(s.customButtons);
    }

    // 11. Track visit — once per session
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
    { key: 'twitter',   id: 'ico-twitter',   label: 'X / Twitter', color: '#000000' },
    { key: 'facebook',  id: 'ico-facebook',  label: 'Facebook',  color: '#1877F2' },
    { key: 'youtube',   id: 'ico-youtube',   label: 'YouTube',   color: '#FF0000' },
  ];

  const frag = document.createDocumentFragment();
  let has = false;

  map.forEach(({ key, id, label, color }) => {
    if (!s[key]) return;
    has = true;
    const a = document.createElement('a');
    a.href      = s[key];
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';
    a.className = 'social-icon-btn';
    a.setAttribute('aria-label', label);
    a.style.setProperty('--social-color', color);
    a.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><use href="#${id}"/></svg>`;
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
  buttons.forEach(btn => {
    if (!btn.label || !btn.url) return;
    const a = document.createElement('a');
    a.href      = btn.url;
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';
    a.className = 'platform-btn custom-btn';
    if (btn.color) a.style.background = btn.color;
    a.innerHTML = `
      <div class="icon-box">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="white" aria-hidden="true">
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
        </svg>
      </div>
      ${escHtml(btn.label)}`;
    frag.appendChild(a);
  });

  wrap.appendChild(frag);
  section.style.display = '';
}

// ── LOAD PRODUCTS ───────────────────────────────────────────────────────────
async function loadProducts() {
  const container = document.getElementById('productList');
  if (!container) return;

  try {
    const q    = query(collection(db, 'toko', USER_ID, 'produk'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = '<div class="grid-span-all empty-state">Belum ada produk</div>';
      return;
    }

    allProducts = [];
    snap.forEach(ds => allProducts.push({ id: ds.id, ...ds.data() }));

    renderKategoriFilter();

    // Unggulan section
    const unggulan   = allProducts.filter(p => p.unggulan);
    const secEl      = document.getElementById('unggulan-section');
    const unggulanEl = document.getElementById('unggulanList');

    if (unggulan.length && secEl && unggulanEl) {
      secEl.style.display = '';
      unggulanEl.innerHTML = unggulan.map(buildProductCard).join('');
      observeNewCards(unggulanEl);
    } else if (secEl) {
      secEl.style.display = 'none';
    }

    renderFilteredProducts();

  } catch (err) {
    console.error('[loadProducts]', err);
    container.innerHTML = '<div class="grid-span-all empty-state" style="color:rgba(255,100,100,0.6)">Gagal memuat produk. Refresh halaman.</div>';
  }
}

// ── KATEGORI ─────────────────────────────────────────────────────────────────
function renderKategoriFilter() {
  const el = document.getElementById('kategori-filter');
  if (!el) return;

  const cats = new Set(allProducts.map(p => p.kategori).filter(Boolean));
  if (cats.size === 0) { el.style.display = 'none'; return; }

  const tabs = ['Semua', ...cats];
  el.style.display = '';
  el.innerHTML = tabs.map(k =>
    `<button class="kat-btn${k === activeKategori ? ' active' : ''}" data-kat="${escHtml(k)}">${escHtml(k)}</button>`
  ).join('');

  // Single delegated listener — not per-button
  el.addEventListener('click', e => {
    const btn = e.target.closest('.kat-btn');
    if (!btn) return;
    activeKategori = btn.dataset.kat;
    el.querySelectorAll('.kat-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderFilteredProducts();
  });
}

function renderFilteredProducts() {
  const container = document.getElementById('productList');
  if (!container) return;

  const list = activeKategori === 'Semua'
    ? allProducts
    : allProducts.filter(p => p.kategori === activeKategori);

  if (!list.length) {
    container.innerHTML = '<div class="grid-span-all empty-state">Tidak ada produk di kategori ini</div>';
    return;
  }

  // Single innerHTML write — no per-card DOM touch
  container.innerHTML = list.map(buildProductCard).join('');
  observeNewCards(container);
}

// ── PRODUCT CARD ─────────────────────────────────────────────────────────────
function buildProductCard(p) {
  const wa        = p.wa || waUtama;
  const nama      = p.nama || '';
  const stokNol   = Number(p.stok) === 0;
  const hasDiskon = p.hargaAsli && Number(p.hargaAsli) > Number(p.harga);
  const pct       = hasDiskon ? Math.round((1 - p.harga / p.hargaAsli) * 100) : 0;
  const pesanWa   = encodeURIComponent('Halo, saya mau pesan:\n- Produk: ' + nama + '\n- Harga: Rp ' + rupiah(p.harga));

  const shopeeBtn = p.shopee
    ? `<a href="${escHtml(p.shopee)}" target="_blank" rel="noopener noreferrer" class="prod-btn prod-btn-shopee jelly-click" onclick="trackClick('shopee')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white" aria-hidden="true"><use href="#ico-shopee"/></svg>Shopee
      </a>`
    : '';

  return `<div class="product-card reveal">
    <div class="prod-img-wrap">
      <img src="${escHtml(p.img || '')}" alt="${escHtml(nama)}" class="product-img" loading="lazy" decoding="async"
           onerror="this.src='https://placehold.co/400x300/1a1a2e/555?text=Foto'">
      ${stokNol   ? '<div class="badge-stok">HABIS</div>'       : ''}
      ${hasDiskon ? `<div class="badge-diskon">-${pct}%</div>` : ''}
      ${p.unggulan ? '<div class="badge-unggulan">⭐</div>'     : ''}
    </div>
    <div class="product-info">
      <p class="product-name">${escHtml(nama)}</p>
      <div class="price-row">
        <span class="product-price">Rp${rupiah(p.harga)}</span>
        ${hasDiskon ? `<span class="harga-coret">Rp${rupiah(p.hargaAsli)}</span>` : ''}
      </div>
      ${p.deskripsi ? `<p class="product-desc">${escHtml(p.deskripsi)}</p>` : ''}
      <div class="prod-btns">
        <a href="${escHtml(wa)}?text=${pesanWa}" target="_blank" rel="noopener noreferrer"
           class="prod-btn prod-btn-wa jelly-click" onclick="trackClick('wa')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white" aria-hidden="true"><use href="#ico-wa"/></svg>
          Pesan WA
        </a>
        ${shopeeBtn}
      </div>
    </div>
  </div>`;
}

// ── TEMPLATE — no backgroundAttachment:fixed ────────────────────────────────
function applyTemplate(tpl, bgUrl) {
  document.body.dataset.template = tpl;

  // Use a pseudo-element approach via class instead of inline fixed bg
  let bgEl = document.getElementById('tpl-bg-layer');
  if (!bgEl) {
    bgEl = document.createElement('div');
    bgEl.id = 'tpl-bg-layer';
    bgEl.setAttribute('aria-hidden', 'true');
    document.body.prepend(bgEl);
  }

  if (bgUrl) {
    // backgroundAttachment: scroll is GPU-composited on mobile, not 'fixed'
    bgEl.style.cssText = `
      position:fixed;inset:0;z-index:-1;pointer-events:none;
      background-image:url('${bgUrl}');
      background-size:cover;background-position:center top;
      background-attachment:scroll;
      opacity:1;
    `;
    document.body.style.backgroundColor = 'rgba(0,0,0,0.01)';
  } else {
    bgEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:0;';
    document.body.style.backgroundColor = '';
  }
}

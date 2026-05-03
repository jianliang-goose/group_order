/* =========================================================
   建良鵝肉 官方網站 - 共用腳本
   - 注入 Header / Footer
   - 行動版選單
   - 購物車數量徽章
   - Toast
   ========================================================= */

const SITE = {
  brandZh: '建良鵝肉',
  brandEn: 'JianLiang Goose',
  logo: '../brand_logo.png',
  address: '300 新竹市東區光復路一段230號',
  mapUrl: 'https://maps.google.com/?q=新竹市東區光復路一段230號',
  phone: '03 666 9219',
  phoneTel: 'tel:036669219',
  hours: '週二 ~ 週日 11:00 ~ 20:00（週一公休）',
  lineAdd: 'https://lin.ee/uLbdSkD',
  email: 'jianliang.goose@gmail.com',
};

const NAV = [
  { href: 'index.html',    label: '首頁',     match: ['index.html', ''] },
  { href: 'about.html',    label: '品牌故事', match: ['about.html'] },
  { href: 'products.html', label: '商品',     match: ['products.html', 'product.html'] },
  { href: 'news.html',     label: '消息',     match: ['news.html'] },
  { href: 'faq.html',      label: '常見問題', match: ['faq.html'] },
  { href: 'tracking.html', label: '訂單查詢', match: ['tracking.html'] },
  { href: 'contact.html',  label: '聯絡我們', match: ['contact.html'] },
];

function currentPage() {
  const p = location.pathname.split('/').pop() || 'index.html';
  return p;
}

function renderHeader() {
  const slot = document.getElementById('siteHeader');
  if (!slot) return;
  const cur = currentPage();
  const navItems = NAV.map(n => {
    const active = n.match.includes(cur) ? 'active' : '';
    return `<li><a href="${n.href}" class="${active}">${n.label}</a></li>`;
  }).join('');

  slot.innerHTML = `
    <header class="site-header" id="siteHeaderEl">
      <div class="container nav-wrap">
        <a href="index.html" class="brand-link">
          <img src="${SITE.logo}" alt="${SITE.brandZh}">
          <div>
            <span class="brand-zh">${SITE.brandZh}</span>
            <span class="brand-en">${SITE.brandEn}</span>
          </div>
        </a>
        <ul class="nav-menu" id="navMenu">
          ${navItems}
        </ul>
        <div class="nav-actions">
          <a href="cart.html" class="nav-icon-btn" aria-label="購物車">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <span class="cart-badge hidden" id="cartBadge">0</span>
          </a>
          <button class="nav-toggle" id="navToggle" aria-label="選單">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>
  `;

  const headerEl = document.getElementById('siteHeaderEl');
  const menuEl = document.getElementById('navMenu');
  const toggleEl = document.getElementById('navToggle');

  toggleEl.addEventListener('click', () => menuEl.classList.toggle('open'));
  menuEl.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => menuEl.classList.remove('open'));
  });

  const onScroll = () => {
    if (window.scrollY > 8) headerEl.classList.add('scrolled');
    else headerEl.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  refreshCartBadge();
}

function renderFooter() {
  const slot = document.getElementById('siteFooter');
  if (!slot) return;
  const year = new Date().getFullYear();
  slot.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="index.html" class="brand-link">
              <img src="${SITE.logo}" alt="${SITE.brandZh}">
              <div>
                <span class="brand-zh">${SITE.brandZh}</span>
                <span class="brand-en">${SITE.brandEn}</span>
              </div>
            </a>
            <p>嚴選優質白鵝，傳統茶燻工法，<br>四十年職人手藝，將最深層的香氣留在每一口鵝肉裡。</p>
          </div>
          <div class="footer-col">
            <h4>網站導覽</h4>
            <ul>
              <li><a href="index.html">首頁</a></li>
              <li><a href="about.html">品牌故事</a></li>
              <li><a href="products.html">商品列表</a></li>
              <li><a href="news.html">最新消息</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>顧客服務</h4>
            <ul>
              <li><a href="faq.html">常見問題</a></li>
              <li><a href="tracking.html">訂單查詢</a></li>
              <li><a href="cart.html">購物車</a></li>
              <li><a href="contact.html">聯絡我們</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>聯絡資訊</h4>
            <ul>
              <li><a href="${SITE.mapUrl}" target="_blank">${SITE.address}</a></li>
              <li><a href="${SITE.phoneTel}">${SITE.phone}</a></li>
              <li>${SITE.hours}</li>
              <li><a href="${SITE.lineAdd}" target="_blank" class="footer-line">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.105.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
                加入官方 LINE
              </a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          &copy; ${year} ${SITE.brandZh} JianLiang Goose. All Rights Reserved.
          ・想看限時團購？<a href="../index.html">前往團購頁面</a>
        </div>
      </div>
    </footer>
  `;
}

/* ----------- Cart helpers (localStorage based) ----------- */
const CART_KEY = 'jl_cart_v1';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  } catch (e) {
    return {};
  }
}
function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  refreshCartBadge();
  window.dispatchEvent(new Event('cart:change'));
}
function cartCount() {
  const cart = getCart();
  return Object.values(cart).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
}
function refreshCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = cartCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
function addToCart(productId, qty = 1) {
  const cart = getCart();
  cart[productId] = (parseInt(cart[productId]) || 0) + parseInt(qty);
  if (cart[productId] <= 0) delete cart[productId];
  setCart(cart);
}
function setCartItem(productId, qty) {
  const cart = getCart();
  qty = parseInt(qty) || 0;
  if (qty <= 0) delete cart[productId];
  else cart[productId] = qty;
  setCart(cart);
}
function removeFromCart(productId) {
  const cart = getCart();
  delete cart[productId];
  setCart(cart);
}
function clearCart() { setCart({}); }

/* ----------- Toast ----------- */
let _toastTimer = null;
function showToast(message, type = 'success') {
  let el = document.getElementById('siteToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'siteToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '·';
  el.innerHTML = `<span class="icon">${icon}</span><span>${message}</span>`;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ----------- Copy to clipboard ----------- */
function copyToClipboard(text, btn) {
  const done = () => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '已複製';
      setTimeout(() => (btn.innerHTML = orig), 1400);
    }
    showToast('已複製到剪貼簿');
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done, () => fallback());
  } else {
    fallback();
  }
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }
}

/* ----------- Number formatter ----------- */
function fmtPrice(n) {
  return '$' + Number(n || 0).toLocaleString('en-US');
}

/* ----------- DOMReady wiring ----------- */
document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
});

window.addEventListener('storage', (e) => {
  if (e.key === CART_KEY) refreshCartBadge();
});

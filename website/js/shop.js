/* =========================================================
   建良鵝肉 官方網站 - 商品 / 訂單 共用邏輯
   - 從 Google Sheet CSV 載入商品 (沿用團購頁 endpoint)
   - 失敗時 fallback 到 data.js 中的 PRELOADED_CONFIG
   - 提供商品 by id 查詢、分類列表
   - 提供 createOrder() 送單到 GAS_API_URL
   ========================================================= */

// 與團購頁共用相同 GAS endpoint
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwk9J3y6SC9xaZhWDk5Qle9s4bTIFgEDcxHZujeXW3npQKjEweHozG__ZOIPIsaiDq2/exec";
const PRODUCTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQd_Hya-NceMfrF79aibzVQ8SoUqHI5nL_DHpGhtG8lCDUT4y_iNA2XzS9R-uJqWJtNk2XaMfP86vvL/pub?gid=598932868&single=true&output=csv";
const SETTINGS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQd_Hya-NceMfrF79aibzVQ8SoUqHI5nL_DHpGhtG8lCDUT4y_iNA2XzS9R-uJqWJtNk2XaMfP86vvL/pub?gid=1252826992&single=true&output=csv";
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

const CATEGORY_LABEL = {
  main:   '主餐',
  addon:  '加購',
  snack:  '小菜 / 零嘴',
  sauce:  '醬料',
  other:  '其他',
};

let _shopCache = null;          // { products: [...], settings: {...} }
let _shopFetchPromise = null;

function getFallback() {
  if (typeof PRELOADED_CONFIG !== 'undefined' && PRELOADED_CONFIG) {
    return {
      products: PRELOADED_CONFIG.products || [],
      settings: PRELOADED_CONFIG.settings || {},
    };
  }
  return { products: [], settings: {} };
}

function parseCSV(text) {
  // Lightweight CSV parser supporting quoted fields w/ commas / newlines
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1)
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = (r[idx] !== undefined ? String(r[idx]).trim() : ''));
      return obj;
    });
}

async function fetchShop({ force = false } = {}) {
  if (_shopCache && !force) return _shopCache;
  if (_shopFetchPromise) return _shopFetchPromise;

  _shopFetchPromise = (async () => {
    try {
      const ts = Date.now();
      const fetchOne = async (url) => {
        try {
          const r = await fetch(url + `&t=${ts}`);
          if (!r.ok) throw new Error('Direct fetch failed');
          return await r.text();
        } catch (e) {
          const r = await fetch(CORS_PROXY + encodeURIComponent(url + `&t=${ts}`));
          if (!r.ok) throw new Error('Proxy fetch failed');
          return await r.text();
        }
      };

      const [pText, sText] = await Promise.all([
        fetchOne(PRODUCTS_CSV_URL),
        fetchOne(SETTINGS_CSV_URL),
      ]);

      const products = parseCSV(pText).map(p => ({
        ID: p.ID || '',
        Name: p.Name || '',
        Price: parseFloat(p.Price) || 0,
        Description: p.Description || '',
        Image: p.Image || '',
        Category: (p.Category || 'other').toLowerCase(),
        DiscountPrice: p.DiscountPrice ? parseFloat(p.DiscountPrice) : '',
        PromoTag: p.PromoTag || '',
        PromoDesc: p.PromoDesc || '',
        Stock: p.Stock !== '' && p.Stock !== undefined ? p.Stock : '',
      })).filter(p => p.ID && p.Name);

      const sObj = {};
      parseCSV(sText).forEach(row => {
        const keyCol = Object.keys(row).find(k => k.toLowerCase() === 'key');
        const valCol = Object.keys(row).find(k => k.toLowerCase() === 'value');
        if (keyCol && row[keyCol]) sObj[row[keyCol].trim()] = (valCol ? (row[valCol] || '').trim() : '');
      });

      if (!products.length) throw new Error('No products');

      _shopCache = { products, settings: sObj };
      return _shopCache;
    } catch (err) {
      console.warn('Shop CSV fetch failed, using fallback:', err);
      _shopCache = getFallback();
      return _shopCache;
    } finally {
      _shopFetchPromise = null;
    }
  })();

  return _shopFetchPromise;
}

/* ---------- Product helpers ---------- */

function imagePath(rel) {
  if (!rel) return '';
  if (/^https?:\/\//i.test(rel)) return rel;
  // Images are at parent ../images/...
  return '../' + rel.replace(/^\.?\//, '');
}

function effectivePrice(p) {
  const dp = p.DiscountPrice;
  if (dp !== '' && dp !== null && dp !== undefined && Number(dp) > 0) return Number(dp);
  return Number(p.Price) || 0;
}

function findProduct(products, id) {
  return products.find(p => String(p.ID) === String(id));
}

function categoriesIn(products) {
  const set = new Set(products.map(p => p.Category || 'other'));
  return Array.from(set);
}

/* ---------- Render helpers ---------- */

function renderProductCard(p) {
  const eff = effectivePrice(p);
  const orig = p.DiscountPrice && Number(p.DiscountPrice) > 0 ? p.Price : null;
  const badge = p.PromoTag ? `<span class="product-card-badge">${p.PromoTag}</span>` : '';
  return `
    <article class="product-card">
      <a href="product.html?id=${encodeURIComponent(p.ID)}" class="product-card-image">
        ${badge}
        <img src="${imagePath(p.Image)}" alt="${p.Name}" loading="lazy" onerror="this.style.opacity=0.3">
      </a>
      <div class="product-card-body">
        <h3><a href="product.html?id=${encodeURIComponent(p.ID)}">${p.Name}</a></h3>
        <div class="desc">${p.Description || ''}</div>
        <div class="product-card-bottom">
          <div class="product-price">
            <span class="currency">NT$</span>${Number(eff).toLocaleString()}
            ${orig ? `<span class="original">${Number(orig).toLocaleString()}</span>` : ''}
          </div>
          <button class="btn btn-primary btn-sm" onclick="quickAdd('${p.ID}', this)">加入購物車</button>
        </div>
      </div>
    </article>
  `;
}

function quickAdd(productId, btn) {
  addToCart(productId, 1);
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '已加入 ✓';
    btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 1200);
  }
  showToast('已加入購物車');
}

/* ---------- Submit Order to GAS ----------
 * 使用 no-cors 模式送單（與團購頁邏輯一致）。
 * no-cors 模式下無法讀取回應，因此 orderId 由 client 自行產生，
 * 假設網路成功送達 GAS（GAS 端會用相同 orderId 寫入 sheet）。
 */
function generateOrderId() {
  const now = new Date();
  const dateStr = now.getFullYear().toString().slice(-1)
    + (now.getMonth() + 1).toString().padStart(2, '0')
    + now.getDate().toString().padStart(2, '0');
  const timeStr = now.getHours().toString().padStart(2, '0')
    + now.getMinutes().toString().padStart(2, '0');
  const safe = "ABCDEFGHJKLMNPQRTUVWXY"; // 排除 I, O, S, Z
  const ch = safe.charAt(Math.floor(Math.random() * safe.length));
  return `${dateStr}-${timeStr}${ch}`;
}

async function submitOrderToGAS(payload) {
  await fetch(GAS_API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });
  // no-cors 無法判讀，視為已送達
  return { result: 'success', orderId: payload.orderId };
}

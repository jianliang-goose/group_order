// Config - PLEASE REPLACE WITH YOUR DEPLOYED WEB APP URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwk9J3y6SC9xaZhWDk5Qle9s4bTIFgEDcxHZujeXW3npQKjEweHozG__ZOIPIsaiDq2/exec";

// Global State
let products = {}; // Will be populated from Sheet
let settings = {}; // Will be populated from Sheet
let cart = {};

// Default Fallback Data (used if API fails or not set)
const fallbackProducts = [
    { ID: 'p1', Name: "茶香鵝肉 (1/4 隻)", Price: 420, Description: "嚴選優質鵝肉，獨家茶燻工法...", Image: "images/goose-quarter.png" },
    { ID: 'p2', Name: "肥仔鵝肉燥包", Price: 300, DiscountPrice: 250, PromoTag: "加購優惠", Description: "每買 2 盒「1/4 茶香鵝肉」，即可以 $250 加購 1 包！", Image: "images/goose-sauce.png" },
    { ID: 'p3', Name: "拜拜整隻茶鵝", Price: 1500, Description: "整隻全鵝，祭祀拜拜首選。", Image: "images/goose-whole.png" },
    { ID: 'p4', Name: "煙燻鵝腳 (1 包)", Price: 150, Description: "富含膠質，Q彈有嚼勁。", Image: "images/goose-feet.png" },
    { ID: 'p5', Name: "煙燻鵝舌 (17 隻)", Price: 300, Description: "精選鵝舌，滷製入味。", Image: "images/goose-tongue.png" }
];

const fallbackSettings = {
    shipping_threshold: 3000,
    shipping_fee: 120,
    close_date: "2026/02/10",
    shipping_date: "2026/02/09",
    pickup_date: "2026/02/15 (19:00 前)"
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Only run main shop logic if we are on the shop page
    if (document.getElementById('productList')) {
        await fetchConfig();
    }
});

// Google Sheet Published CSV URLs (Fast Loading)
const PRODUCTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQd_Hya-NceMfrF79aibzVQ8SoUqHI5nL_DHpGhtG8lCDUT4y_iNA2XzS9R-uJqWJtNk2XaMfP86vvL/pub?gid=598932868&single=true&output=csv";
const SETTINGS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQd_Hya-NceMfrF79aibzVQ8SoUqHI5nL_DHpGhtG8lCDUT4y_iNA2XzS9R-uJqWJtNk2XaMfP86vvL/pub?gid=1252826992&single=true&output=csv";

const CORS_PROXY = "https://api.allorigins.win/raw?url=";

async function fetchConfig(ignorePreload = false) {
    // Note: ignorePreload parameter is kept for compatibility but CSV is fast enough to replace it.

    try {
        console.log("Fetching data from Google CSV...");

        let prodRes, setRes;

        try {
            // Try direct fetch first (works in production usually)
            [prodRes, setRes] = await Promise.all([
                fetch(PRODUCTS_CSV_URL),
                fetch(SETTINGS_CSV_URL)
            ]);
            if (!prodRes.ok || !setRes.ok) throw new Error("Direct fetch failed");
        } catch (directError) {
            console.warn("Direct fetch failed (likely CORS on local), trying proxy...", directError);
            // Fallback to CORS Proxy for local testing
            [prodRes, setRes] = await Promise.all([
                fetch(CORS_PROXY + encodeURIComponent(PRODUCTS_CSV_URL)),
                fetch(CORS_PROXY + encodeURIComponent(SETTINGS_CSV_URL))
            ]);
        }

        if (!prodRes.ok || !setRes.ok) throw new Error("Failed to fetch CSV data even with proxy");

        const prodText = await prodRes.text();
        const setText = await setRes.text();

        // Parse CSVs
        const productsData = parseCSV(prodText);
        const settingsData = parseCSV(setText);

        // Transform Settings Array to Object {Key: Value}
        const settingsObj = {};
        settingsData.forEach(row => {
            if (row.Key) settingsObj[row.Key] = row.Value;
        });

        console.log("CSV Data Loaded Successfully");
        renderApp(productsData, settingsObj);

    } catch (e) {
        console.error("Failed to load CSV config:", e);
        alert("無法載入最新設定，將使用預設資料。(請檢查網路或稍後再試)");
        renderApp(fallbackProducts, fallbackSettings);
    }
}

// Simple CSV Parser
function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle simple CSV splitting (Note: doesn't handle commas inside quotes perfectly, but sufficient for simple data)
        // For better robustness with description text that might contain commas, we should use a regex or library.
        // Let's use a slightly better regex split for robustness.
        const currentLine = lines[i];
        if (!currentLine.trim()) continue;

        // Regex to match CSV values (handling quotes)
        const re = /(?:,|\n|^)("(?:(?:"")*|[^"]*)*"|[^",\n]*|(?:\n|$))/g;
        const matches = [];
        let match;
        while ((match = re.exec(currentLine)) !== null) {
            // Remove leading delimiter
            let val = match[1];
            if (val.startsWith(',')) val = val.substring(1);
            // Remove quotes if present
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1).replace(/""/g, '"');
            }
            matches.push(val.trim());
        }
        // The regex might produce one extra empty match at the end or begin depending on implementation details
        // A simpler approach for now to avoid regex complexity bugs in limited environment:
        // Use basic split if we assume descriptions don't have commas, OR just strictly column count.
        // Let's stick to a robust enough regex helper or simple split if complexity is high.
        // Actually, let's use a known simple parser snippet from StackOverflow for correctness.

        const row = {};
        const values = parseCSVLine(currentLine);

        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        result.push(row);
    }
    return result;
}

function parseCSVLine(text) {
    let ret = [''], i = 0, p = '', s = true;
    for (let l in text) {
        l = text[l];
        if ('"' === l) {
            s = !s;
            if ('"' === p) {
                ret[i] += '"';
                l = '-';
            } else if ('' === p)
                l = '-';
        } else if (s && ',' === l)
            l = ret[++i] = '';
        else
            ret[i] += l;
        p = l;
    }
    return ret;
}

function renderApp(productsArray, settingsMsg) {
    // 1. Process Settings
    settings = settingsMsg;
    renderNotices();

    // Check Global Open/Close status
    if (settings.is_open === 'false') {
        document.body.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; text-align:center; padding:20px;">
                <h1>⛔ 目前暫停接單</h1>
                <p>感謝您的支持，目前表單已關閉。</p>
                <p>若有疑問請聯繫管理員。</p>
            </div>
        `;
        return; // Stop rendering
    }

    // Render Group Leaders
    const leaderSelect = document.getElementById('groupLeader');
    if (leaderSelect && settings.group_leaders) {
        const leaders = settings.group_leaders.split(',');
        leaderSelect.innerHTML = ''; // Clear default
        leaders.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name.trim();
            opt.textContent = name.trim();
            leaderSelect.appendChild(opt);
        });
    }

    // 2. Process Products
    products = {};
    cart = {};
    const listEl = document.getElementById('productList');
    listEl.innerHTML = '';

    productsArray.forEach(p => {
        // Normalize keys (Sheet headers might be capitalized)
        const id = p.ID;
        products[id] = {
            name: p.Name,
            price: p.Price,
            discountPrice: p.DiscountPrice || null,
            image: p.Image || 'images/goose-whole.png' // Fallback image
        };
        cart[id] = 0;

        // Render Card
        const card = document.createElement('article');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${products[id].image}" alt="${p.Name}" class="product-image">
            <div class="product-info">
                ${p.PromoTag ? `<span class="promo-tag">${p.PromoTag}</span>` : ''}
                <h3 class="product-title">${p.Name}</h3>
                <div class="product-price">
                    $${p.Price} 
                    ${p.DiscountPrice ? `<span class="price-original"></span>` : ''}
                </div>
                <p class="product-desc">${p.Description || ''}</p>
                <div class="quantity-control">
                    <button class="qty-btn minus" onclick="updateQty('${id}', -1)">-</button>
                    <input type="number" class="qty-input" id="qty-${id}" value="0" readonly>
                    <button class="qty-btn plus" onclick="updateQty('${id}', 1)">+</button>
                </div>
            </div>
        `;
        listEl.appendChild(card);
    });

    calculateTotal();
}

function renderNotices() {
    const list = document.getElementById('noticeList');
    list.innerHTML = `
        <li>📅 最後寄貨日：<span class="highlight-date">${settings.shipping_date || 'TBD'}</span></li>
        <li>📅 最後接單日：<span class="highlight-date">${settings.close_date || 'TBD'}</span></li>
        <li>📅 最後自取日：<span class="highlight-date">${settings.pickup_date || 'TBD'}</span></li>
        <li style="margin-top: 10px;">🚚 <strong>運費規則</strong>：消費滿 <strong>$${settings.shipping_threshold || 3000}</strong> 免運費，未滿則運費 $${settings.shipping_fee || 120}。</li>
    `;
}

// Update Quantity
function updateQty(id, change) {
    const currentQty = cart[id];
    let newQty = currentQty + change;
    if (newQty < 0) newQty = 0;

    cart[id] = newQty;
    document.getElementById(`qty-${id}`).value = newQty;

    calculateTotal();
}

// Core Logic: Calculate Total with Discounts & Shipping
function calculateTotal() {
    let itemTotal = 0;
    const itemsListHtml = []; // To store summary HTML lines

    // 1. Calculate P1 (1/4 Goose)
    if (products.p1) {
        const count = cart.p1 || 0;
        if (count > 0) {
            const price = count * products.p1.price;
            itemTotal += price;
            itemsListHtml.push(`
                <div class="summary-item-row">
                    <span class="summary-item-name">${products.p1.name} x ${count}</span>
                    <span class="summary-item-price">$${price.toLocaleString()}</span>
                </div>
            `);
        }
    }

    // 2. Calculate P2 (Sauce) with Logic
    if (products.p2) {
        const p1Count = cart.p1 || 0;
        const discountableSauceCount = Math.floor(p1Count / 2); // Every 2 goose -> 1 cheap sauce
        const actualSauceCount = cart.p2 || 0;

        let discountedSauces = 0;
        let regularSauces = 0;

        if (actualSauceCount <= discountableSauceCount) {
            discountedSauces = actualSauceCount;
        } else {
            discountedSauces = discountableSauceCount;
            regularSauces = actualSauceCount - discountableSauceCount;
        }

        const sauceDataset = products.p2;
        const discountPrice = sauceDataset.discountPrice || sauceDataset.price;

        if (discountedSauces > 0) {
            const price = discountedSauces * discountPrice;
            itemTotal += price;
            itemsListHtml.push(`
                <div class="summary-item-row">
                    <span class="summary-item-name">${products.p2.name} (加購優惠) x ${discountedSauces}</span>
                    <span class="summary-item-price">$${price.toLocaleString()}</span>
                </div>
            `);
        }

        if (regularSauces > 0) {
            const price = regularSauces * products.p2.price;
            itemTotal += price;
            itemsListHtml.push(`
                <div class="summary-item-row">
                    <span class="summary-item-name">${products.p2.name} x ${regularSauces}</span>
                    <span class="summary-item-price">$${price.toLocaleString()}</span>
                </div>
            `);
        }
    }

    // 3. Other items
    Object.keys(cart).forEach(id => {
        if (id !== 'p1' && id !== 'p2' && cart[id] > 0) {
            const price = cart[id] * products[id].price;
            itemTotal += price;
            itemsListHtml.push(`
                <div class="summary-item-row">
                    <span class="summary-item-name">${products[id].name} x ${cart[id]}</span>
                    <span class="summary-item-price">$${price.toLocaleString()}</span>
                </div>
            `);
        }
    });

    // Update Items List UI
    const listContainer = document.getElementById('orderItemsList');
    if (listContainer) {
        if (itemTotal > 0) {
            listContainer.innerHTML = itemsListHtml.join('');
            listContainer.style.display = 'block';
        } else {
            listContainer.innerHTML = '<div class="summary-item-row" style="color:#999; justify-content:center;">尚未選擇商品</div>';
        }
    }

    // 4. Shipping Logic
    const deliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked').value;
    let shippingFee = 0;
    const threshold = parseInt(settings.shipping_threshold) || 3000;
    const baseFee = parseInt(settings.shipping_fee) || 120;

    if (deliveryMethod === 'shipping') {
        if (itemTotal >= threshold) {
            shippingFee = 0;
        } else {
            shippingFee = itemTotal > 0 ? baseFee : 0;
        }
    } else {
        shippingFee = 0; // Self pickup
    }

    const grandTotal = itemTotal + shippingFee;

    // Update UI
    document.getElementById('subTotalDisplay').innerText = `$${itemTotal.toLocaleString()}`;
    document.getElementById('shippingDisplay').innerText = shippingFee === 0 ? "免運費" : `$${shippingFee}`;
    document.getElementById('grandTotalDisplay').innerText = `$${grandTotal.toLocaleString()}`;
}

// Toggle Delivery Options visibility
function toggleDeliveryOptions() {
    const method = document.querySelector('input[name="deliveryMethod"]:checked').value;
    const shippingOptions = document.getElementById('shippingOptions');

    if (method === 'shipping') {
        shippingOptions.classList.add('active');
    } else {
        shippingOptions.classList.remove('active');
    }
    calculateTotal();
}

// Submit Order
async function submitOrder(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');

    // Validation
    const total = parseInt(document.getElementById('grandTotalDisplay').innerText.replace(/[$,]/g, ''));
    if (total === 0) {
        alert("購物車是空的，請先選擇商品！");
        return;
    }

    const deliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked').value;
    const storeInfo = document.getElementById('storeInfo').value;

    if (deliveryMethod === 'shipping' && !storeInfo.trim()) {
        alert("請填寫收件門市資訊！");
        return;
    }

    if (GAS_API_URL.includes("YOUR_GAS_WEB_APP_URL")) {
        alert("請先設定 Google Apps Script URL (見 script.js)");
        return; // Dev guard
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "處理中...";

    // Build Item String
    let itemsStr = [];
    Object.keys(cart).forEach(id => {
        if (cart[id] > 0) {
            itemsStr.push(`${products[id].name}x${cart[id]}`);
        }
    });

    const payload = {
        groupLeader: document.getElementById('groupLeader') ? document.getElementById('groupLeader').value : '無',
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        items: itemsStr.join(", "),
        totalAmount: parseInt(document.getElementById('subTotalDisplay').innerText.replace(/[$,]/g, '')),
        shippingFee: document.getElementById('shippingDisplay').innerText === "免運費" ? 0 : 120,
        grandTotal: total,
        paymentMethod: document.getElementById('paymentMethod').value,
        deliveryMethod: deliveryMethod === 'self' ? '現場自取' : '冷凍店到店',
        storeInfo: deliveryMethod === 'shipping' ?
            `${document.querySelector('input[name="storeType"]:checked').nextSibling.textContent.trim()} - ${storeInfo}` : '',
    };

    try {
        await fetch(GAS_API_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify(payload)
        });

        alert(`訂單已送出！\n應付總額: $${total}\n請依選擇的付款方式結帳。`);
        location.reload(); // Reset form

    } catch (err) {
        console.error(err);
        alert("訂單送出失敗，請聯絡客服。");
        submitBtn.disabled = false;
        submitBtn.innerText = "確認送出訂單";
    }
}

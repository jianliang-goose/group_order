// Config - PLEASE REPLACE WITH YOUR DEPLOYED WEB APP URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwk9J3y6SC9xaZhWDk5Qle9s4bTIFgEDcxHZujeXW3npQKjEweHozG__ZOIPIsaiDq2/exec";

// Global State
let products = {}; // Will be populated from Sheet
let settings = {}; // Will be populated from Sheet
let cart = {};

// Default Fallback Data (used if API fails or not set)
const fallbackProducts = [
    { ID: 'p1', Name: "茶香鵝肉 (1/4 隻)", Price: 420, Description: "嚴選優質鵝肉，獨家茶燻工法...", Image: "images/goose-quarter.png" },
    { ID: 'p2', Name: "肥仔鵝肉燥包", Price: 300, DiscountPrice: 250, PromoTag: "加購優惠", Description: "每買 2 盒「1/4 茶香鵝肉」，即可以 $250 加購 1 包！", Image: "images/goose-sauce.jpg" },
    { ID: 'p3', Name: "拜拜整隻茶鵝", Price: 1500, Description: "整隻全鵝，祭祀拜拜首選。", Image: "images/goose-whole.png" },
    { ID: 'p4', Name: "煙燻鵝腳 (1 包)", Price: 150, Description: "富含膠質，Q彈有嚼勁。", Image: "images/goose-feet.png" },
    { ID: 'p5', Name: "煙燻鵝舌 (17 隻)", Price: 300, Description: "精選鵝舌，滷製入味。", Image: "images/goose-tongue.png" }
];

const fallbackSettings = {
    shipping_threshold: 3000,
    shipping_fee: 120,
    close_date: "2026/02/10",
    shipping_date: "2026/02/09",
    pickup_date: "2026/02/15 (19:00 前)",
    group_leaders: "無(個人訂購),宛儒,Evelyn"
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
            const timestamp = Date.now();
            [prodRes, setRes] = await Promise.all([
                fetch(PRODUCTS_CSV_URL + `&t=${timestamp}`),
                fetch(SETTINGS_CSV_URL + `&t=${timestamp}`)
            ]);
            if (!prodRes.ok || !setRes.ok) throw new Error("Direct fetch failed");
        } catch (directError) {
            console.warn("Direct fetch failed (likely CORS on local), trying proxy...", directError);
            // Fallback to CORS Proxy for local testing
            const timestamp = Date.now();
            [prodRes, setRes] = await Promise.all([
                fetch(CORS_PROXY + encodeURIComponent(PRODUCTS_CSV_URL + `&t=${timestamp}`)),
                fetch(CORS_PROXY + encodeURIComponent(SETTINGS_CSV_URL + `&t=${timestamp}`))
            ]);
        }

        if (!prodRes.ok || !setRes.ok) throw new Error("Failed to fetch CSV data even with proxy");

        const prodText = await prodRes.text();
        const setText = await setRes.text();

        // Parse CSVs
        const productsData = parseCSV(prodText);
        const settingsData = parseCSV(setText);

        // Validation: Ensure we actually got data
        if (!productsData || productsData.length === 0) {
            console.error("Parsed Product CSV is empty:", prodText);
            throw new Error("Product data is empty");
        }

        // Transform Settings Array to Object {Key: Value}
        // Case-insensitive matching for Key/Value columns
        const settingsObj = {};
        settingsData.forEach(row => {
            // Find keys that match "Key" and "Value" case-insensitively
            const rowKeys = Object.keys(row);
            const keyCol = rowKeys.find(k => k.toLowerCase() === 'key');
            const valCol = rowKeys.find(k => k.toLowerCase() === 'value');

            if (keyCol && row[keyCol]) {
                const keyName = String(row[keyCol]).trim();
                const valData = valCol && row[valCol] ? String(row[valCol]).trim() : '';
                settingsObj[keyName] = valData;
            }
        });

        // HOTFIX: 強制更新圖片路徑 (Google Sheet 可能還沒改)
        productsData.forEach(p => {
            // 肉燥包改用 .jpg (加上 timestamp 強制刷新快取)
            if (p.ID === 'p2') p.Image = 'images/goose-sauce.jpg?v=2';
            // 為了保險起見，也可以強制更新其他新圖
            if (p.ID === 'p1') p.Image = 'images/goose-quarter.png?v=2';
            if (p.ID === 'p3') p.Image = 'images/goose-whole.png?v=2';
        });

        console.log("CSV Data Loaded Successfully");
        // Merge with fallback settings to ensure important keys exist (like group_leaders if missing in CSV)
        const finalSettings = { ...fallbackSettings, ...settingsObj };

        console.log("Settings Loaded:", finalSettings);

        renderApp(productsData, finalSettings);

    } catch (e) {
        console.error("Config Load Error:", e);
        // Let's use fallback but notify in console.
        // Also check if we should alert user.
        console.warn("Switching to fallback data due to load error.");
        renderApp(fallbackProducts, fallbackSettings);
    }
}

// Robust CSV Parser
function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine.trim()) continue;

        const values = parseCSVLine(currentLine);
        const row = {};

        headers.forEach((header, index) => {
            // Handle potential undefined values if row is short
            row[header] = (values[index] !== undefined) ? values[index].trim() : '';
        });
        result.push(row);
    }
    return result;
}

// State-machine based CSV line parser to handle quotes and commas correctly
function parseCSVLine(text) {
    const res = [];
    let entry = "";
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            // Check for escaped quote ("")
            if (insideQuote && text[i + 1] === '"') {
                entry += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            // Delimiter found (and not inside quotes)
            res.push(entry);
            entry = "";
        } else {
            entry += char;
        }
    }
    // Push the last entry
    res.push(entry);
    return res;
}

function renderApp(productsArray, settingsMsg) {
    // 1. Process Settings
    settings = settingsMsg;
    renderNotices();

    // Check Global Open/Close status
    const isOpenVal = String(settings.is_open).toLowerCase().trim();
    const isClosed = ['false', '0', 'off', 'no', 'close'].includes(isOpenVal);

    if (isClosed) {
        // 1. Add Class for Styling (disable inputs, opacity)
        document.body.classList.add('shop-closed-mode');

        // 2. Add Banner
        const banner = document.createElement('div');
        banner.className = 'shop-closed-banner';
        banner.innerHTML = '⛔ 目前暫停接單中，僅供瀏覽商品';
        document.body.prepend(banner);

        // 3. Update Submit Button Status immediately (though CSS handles interaction)
        // We wait for DOM ready basically, but renderApp is called after DOMContentLoaded usually.
        setTimeout(() => {
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) {
                submitBtn.innerText = "⛔ 此團暫停接單";
                submitBtn.disabled = true;
            }
        }, 100);
    } else {
        // Ensure no closed state if open (re-render safety)
        document.body.classList.remove('shop-closed-mode');
        // Remove banner if exists
        const oldBanner = document.querySelector('.shop-closed-banner');
        if (oldBanner) oldBanner.remove();
    }

    // Render Group Leaders
    const leaderSelect = document.getElementById('groupLeader');
    if (leaderSelect && settings.group_leaders) {
        // Support both half-width and full-width commas
        const leaders = settings.group_leaders.split(/[,，]/);

        // Only clear if we have valid leaders to add
        if (leaders.length > 0 && leaders[0].trim()) {
            leaderSelect.innerHTML = '';

            leaders.forEach(name => {
                const cleanName = name.trim();
                if (cleanName) {
                    const opt = document.createElement('option');
                    opt.value = cleanName;
                    opt.textContent = cleanName;
                    leaderSelect.appendChild(opt);
                }
            });

            // If the user didn't include "無" or "None", and the list isn't empty, 
            // we might want to ensure there is a default option or just trust the user.
            // But usually for "Group Leader", "None" is a valid choice.
            // Let's rely on the user adding it as per placeholder "例如: 無, 宛儒, 小明"
        }
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
            price: Number(p.Price), // Ensure number
            description: p.Description || '',
            category: p.Category || 'main',
            discountPrice: p.DiscountPrice ? Number(p.DiscountPrice) : null,
            image: p.Image || 'images/goose-whole.png',
            promoTag: p.PromoTag || '',
            promoDesc: p.PromoDesc || '',
            promoTargetQty: parseInt(p.PromoTargetQty) || 2
        };
        cart[id] = 0;

        // Render Card
        const card = document.createElement('article');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${products[id].image}" alt="${p.Name}" class="product-image">
            <div class="product-info">
                <h3 class="product-title">${p.Name}</h3>
                <div class="product-price-row">
                    <span class="product-price">$${p.Price}</span>
                    ${p.PromoTag ? `<span class="promo-tag">${p.PromoTag}</span>` : ''}
                </div>
                ${p.DiscountPrice ? `<span class="price-original"></span>` : ''} 
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
    // Clear list styles since we are switching to divs, but we'll attach to the parent container usually
    // Actually the parent is <ul class="notice-list" id="noticeList">. 
    // It's better if we replace the innerHTML with our new structure, but strict <ul> requires <li>.
    // Let's target the parent section instead for full control or just swap the UL to DIVs in JS?
    // The HTML has <ul class="notice-list" id="noticeList"> inside <section class="notice-board">.
    // Let's replace the whole innerHTML of notice-board to give us full freedom.

    const board = document.querySelector('.notice-board');
    if (!board) return;

    board.innerHTML = `
        <div class="notice-header">
            <h3 class="notice-title-text">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="notice-icon">
                    <path d="M8 2V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M16 2V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3.5 9.08997H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                訂購重要時程
            </h3>
        </div>
        
        <div class="notice-timeline">
            <div class="timeline-item">
                <span class="timeline-label">最後寄貨(冷凍)</span>
                <span class="timeline-date">${settings.shipping_date || '-'}</span>
            </div>
            <div class="timeline-divider"></div>
            <div class="timeline-item">
                <span class="timeline-label">最後接單</span>
                <span class="timeline-date">${settings.close_date || '-'}</span>
            </div>
             <div class="timeline-divider"></div>
            <div class="timeline-item">
                <span class="timeline-label">最後自取</span>
                <span class="timeline-date">${settings.pickup_date || '-'}</span>
            </div>
        </div>

        <div class="notice-shipping-banner">
            <div class="shipping-icon-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 18H8M8 18H19C20.1046 18 21 17.1046 21 16V9C21 7.89543 20.1046 7 19 7H16M5 18H3C2.44772 18 2 17.5523 2 17V17C2 16.4477 2.44772 16 3 16H5M5 18C5.55228 18 6 17.5523 6 17C6 16.4477 5.55228 16 5 16M8 18C7.44772 18 7 17.5523 7 17C7 16.4477 7.44772 16 8 16M16 7H14V4.5C14 3.67157 13.3284 3 12.5 3H5.5C4.67157 3 4 3.67157 4 4.5V16M16 7H11" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="7" cy="18" r="2"></circle>
                    <circle cx="17" cy="18" r="2"></circle>
                </svg>
            </div>
            <div class="shipping-text">
                <span class="shipping-title">運費規則：</span>
                消費滿 <span class="price-highlight">$${settings.shipping_threshold || 3000}</span> 免運費 <span class="sub-text">(未滿運費 $${settings.shipping_fee || 120})</span>
            </div>
        </div>
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

    // Helper to get total cart count for an ID
    const getCount = (id) => cart[id] || 0;

    // First pass: Calculate "Main" items cost that are not addons
    // Actually we iterate all products. 
    // We need to handle Discount Logic Dynamically.

    // Logic:
    // 1. Iterate all cart items.
    // 2. If an item has 'PromoDesc' (e.g., 'p1'), it means it is a CONDITIONAL ADDON.
    //    It checks count of 'p1'.
    //    Rule: Buy 2 'p1' get 1 'this' at discount.
    //    We calculate how many can be discounted.
    // 3. Else standard price.

    Object.keys(cart).forEach(id => {
        const count = cart[id];
        if (count <= 0) return;

        const product = products[id];
        let finalPrice = 0;

        // Dynamic Discount Logic
        // Check if this product has a "PromoDesc" which holds the Target ID (e.g. "p1")
        // And if it has a discount price.
        if (product.promoDesc && product.discountPrice) {
            const targetId = product.promoDesc.trim();
            // Check target count
            const targetCount = getCount(targetId);

            // Rule: N Targets -> 1 Discount
            // Default 2 if undefined (safety)
            const requiredQty = product.promoTargetQty || 2;
            const discountableCount = Math.floor(targetCount / requiredQty);

            let discountedQty = 0;
            let regularQty = 0;

            if (count <= discountableCount) {
                discountedQty = count;
            } else {
                discountedQty = discountableCount;
                regularQty = count - discountableCount;
            }

            // Calc
            if (discountedQty > 0) {
                const sub = discountedQty * product.discountPrice;
                finalPrice += sub;
                itemsListHtml.push(`
                    <div class="summary-item-row">
                        <span class="summary-item-name">${product.name} (${product.promoTag || '優惠'}) x ${discountedQty}</span>
                        <span class="summary-item-price">$${sub.toLocaleString()}</span>
                    </div>
                `);
            }
            if (regularQty > 0) {
                const sub = regularQty * product.price;
                finalPrice += sub;
                itemsListHtml.push(`
                    <div class="summary-item-row">
                        <span class="summary-item-name">${product.name} x ${regularQty}</span>
                        <span class="summary-item-price">$${sub.toLocaleString()}</span>
                    </div>
                `);
            }

            itemTotal += finalPrice;

        } else if (product.discountPrice && !product.promoDesc) {
            // Unconditional Discount (Direct Sale)
            const price = count * product.discountPrice;
            itemTotal += price;
            itemsListHtml.push(`
                <div class="summary-item-row">
                    <span class="summary-item-name">${product.name} (特價) x ${count}</span>
                    <span class="summary-item-price">$${price.toLocaleString()}</span>
                </div>
            `);
        } else {
            // Regular Price
            const price = count * product.price;
            itemTotal += price;
            itemsListHtml.push(`
                <div class="summary-item-row">
                    <span class="summary-item-name">${product.name} x ${count}</span>
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

    // Update Floating Cart
    const floatShipping = document.getElementById('floatingCartShipping');
    const floatBtn = document.getElementById('floatingCart');

    if (floatShipping && floatBtn) {
        if (deliveryMethod === 'self') {
            floatShipping.innerHTML = `🌟 現場自取免運費`;
            floatShipping.style.color = '#fff';
            floatBtn.classList.add('celebrate'); // Always celebrate self pickup (free)
        } else {
            // Shipping Mode
            const remaining = threshold - itemTotal;
            if (remaining > 0) {
                floatShipping.innerHTML = `差 <span style="font-weight:800; color:#FFD54F;">$${remaining}</span> 免運`;
                floatShipping.style.color = 'rgba(255,255,255,0.95)';
                floatBtn.classList.remove('celebrate');
            } else {
                floatShipping.innerHTML = `免運`;
                floatShipping.style.color = '#fff';
                floatBtn.classList.add('celebrate');
            }
        }

        // Bump animation on change
        // floatBtn.classList.remove('bump'); // Reset animation
        // void floatBtn.offsetWidth; // Trigger reflow
        // floatBtn.classList.add('bump'); // Add animation class if defined (or use transforms manually)
        floatBtn.style.transform = 'scale(1.1)';
        setTimeout(() => floatBtn.style.transform = '', 200);
    }
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

// Toggle Payment Options visibility
function togglePaymentOptions() {
    const method = document.querySelector('input[name="paymentMethod"]:checked').value;
    const atmOptions = document.getElementById('atmOptions');
    const jkoOptions = document.getElementById('jkoOptions');

    if (method === 'atm') {
        atmOptions.classList.add('active');
        jkoOptions.classList.remove('active');
    } else {
        atmOptions.classList.remove('active');
        jkoOptions.classList.add('active');
    }
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

    // Payment Validation
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    let paymentInfo = '';

    if (paymentMethod === 'atm') {
        const atmLast5 = document.getElementById('atmLast5').value;
        const atmDate = document.getElementById('atmDate').value;
        if (!atmLast5 || atmLast5.length !== 5) {
            alert("請填寫正確的轉帳帳號末5碼！");
            return;
        }
        if (!atmDate) {
            alert("請填寫轉帳日期！");
            return;
        }
        paymentInfo = `帳號末5碼: ${atmLast5}, 日期: ${atmDate}`;
    } else {
        const jkoAccount = document.getElementById('jkoAccount').value;
        const jkoDate = document.getElementById('jkoDate').value;
        if (!jkoAccount.trim()) {
            alert("請填寫您的街口帳號或暱稱！");
            return;
        }
        if (!jkoDate) {
            alert("請填寫付款日期！");
            return;
        }
        paymentInfo = `街口帳號: ${jkoAccount}, 日期: ${jkoDate}`;
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

    // Generate Order ID locally (YYMMDD-RRR)
    // Generate Order ID (YYMMDD-HHMMC)
    // C = Safe Character (avoiding I, O, S, Z to prevent confusion with 1, 0, 5, 2)
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-1) +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0');

    const timeStr = now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0');

    const safeChars = "ABCDEFGHJKLMNPQRTUVWXY"; // Excludes I, O, S, Z
    const randomChar = safeChars.charAt(Math.floor(Math.random() * safeChars.length));

    const orderId = `${dateStr}-${timeStr}${randomChar}`;

    const payload = {
        action: 'createOrder', // Explicit action for backend
        orderId: orderId, // Send generated ID
        groupLeader: document.getElementById('groupLeader') ? document.getElementById('groupLeader').value : '無',
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        items: itemsStr.join(", "),
        totalAmount: parseInt(document.getElementById('subTotalDisplay').innerText.replace(/[$,]/g, '')),
        shippingFee: document.getElementById('shippingDisplay').innerText === "免運費" ? 0 : 120,
        grandTotal: total,
        paymentMethod: paymentMethod === 'atm' ? 'ATM轉帳' : '街口支付',
        paymentInfo: paymentInfo,
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

        // Show Success Page & Hide Other Sections
        const hero = document.querySelector('.hero-section');
        hero.style.display = 'flex'; // Ensure it's visible
        hero.classList.add('compact'); // Switch to compact mode

        document.querySelector('.order-section').style.display = 'none';
        document.getElementById('productList').style.display = 'none';
        document.querySelector('.notice-board').style.display = 'none'; // Hide notice board too for cleaner look

        const successSection = document.getElementById('successSection');
        successSection.style.display = 'block';

        // Fill Data
        document.getElementById('successDate').innerText = now.toLocaleString('zh-TW', { hour12: false });
        document.getElementById('successOrderId').innerText = orderId;
        document.getElementById('successName').innerText = payload.name;
        document.getElementById('successTotal').innerText = `$${total.toLocaleString()}`;
        document.getElementById('successPayment').innerText = `${payload.paymentMethod}\n(${paymentInfo})`;
        document.getElementById('successDelivery').innerText = `${payload.deliveryMethod}\n${payload.storeInfo}`;

        // Format Items for better readability
        const itemsList = itemsStr.map(item => `• ${item}`).join('<br>'); // Add bullet points
        document.getElementById('successItems').innerHTML = itemsList;

        window.scrollTo(0, 0); // Scroll to top to see msg

        // Do NOT reload


    } catch (err) {
        console.error(err);
        alert("訂單送出失敗，請聯絡客服。");
        submitBtn.disabled = false;
        submitBtn.innerText = "確認送出訂單";
    }
}

// Function to Scroll to Order Summary
function scrollToOrderSummary() {
    // Target the summary section specifically
    const summarySection = document.querySelector('.order-summary');

    if (summarySection) {
        // Calculate position with offset (e.g. 80px from top)
        const yOffset = -80;
        const y = summarySection.getBoundingClientRect().top + window.pageYOffset + yOffset;

        window.scrollTo({
            top: y,
            behavior: 'smooth'
        });

        // Add a temporary highlight effect for better UX
        const originalTransition = summarySection.style.transition;
        const originalBg = summarySection.style.backgroundColor;

        summarySection.style.transition = 'background-color 0.5s ease';
        summarySection.style.backgroundColor = '#FFF8E1'; // Light yellow highlight

        setTimeout(() => {
            summarySection.style.backgroundColor = originalBg;
            setTimeout(() => {
                summarySection.style.transition = originalTransition;
            }, 500);
        }, 1500);
    }
}

// --- Tracking Page Logic ---
function initTrackingPage() {
    console.log("Tracking Page Initialized");
    const form = document.getElementById('trackingForm');
    const searchBtn = document.getElementById('searchBtn');
    const loading = document.getElementById('loading');
    const resultsList = document.getElementById('resultsList');
    const errorMsg = document.getElementById('errorMsg');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const phone = document.getElementById('trackPhone').value.trim();

        if (!phone) {
            alert("請輸入手機號碼");
            return;
        }

        // Reset UI
        resultsList.innerHTML = ''; // Clear previous results
        errorMsg.style.display = 'none';
        loading.style.display = 'block';
        searchBtn.disabled = true;
        searchBtn.innerText = "查詢中...";

        try {
            const payload = JSON.stringify({
                action: 'searchOrder',
                phone: phone
            });

            // GAS Web App POST request
            const res = await fetch(GAS_API_URL, {
                method: 'POST',
                body: payload,
            });

            if (!res.ok) throw new Error("Network response was not ok");

            const data = await res.json();

            if (data.result === 'success' && data.orders && data.orders.length > 0) {
                renderTrackingResults(data.orders);
            } else {
                errorMsg.style.display = 'block';
                errorMsg.innerText = data.error === "Missing Phone Number" ?
                    "請輸入手機號碼" : "查無此號碼的訂單，請確認輸入是否正確。";
            }

        } catch (err) {
            console.error(err);
            errorMsg.innerText = "系統連線錯誤，請稍後再試。";
            errorMsg.style.display = 'block';
        } finally {
            loading.style.display = 'none';
            searchBtn.disabled = false;
            searchBtn.innerText = "查詢訂單";
        }
    });

    function renderTrackingResults(orders) {
        const template = document.getElementById('resultTemplate');

        orders.forEach(order => {
            const card = template.cloneNode(true);
            card.style.display = 'block';
            card.removeAttribute('id'); // Remove duplicate ID
            card.style.marginBottom = '20px'; // Add space between cards

            // Populate fields
            card.querySelector('.res-id').innerText = order.orderId || '???';

            const dateObj = new Date(order.createdDate);
            const dateStr = !isNaN(dateObj) ? dateObj.toLocaleString('zh-TW', { hour12: false }) : order.createdDate;
            card.querySelector('.res-date').innerText = dateStr;

            card.querySelector('.res-total').innerText = '$' + Number(order.totalAmount).toLocaleString();

            // Status Badge
            const statusBadge = card.querySelector('.res-status-badge');
            statusBadge.className = 'status-badge res-status-badge'; // Reset classes
            let statusText = order.status || '未處理';

            if (statusText === '已確認' || statusText === '已付款' || statusText.includes('完成')) {
                statusBadge.classList.add('confirmed');
            } else if (statusText.includes('出貨') || statusText.includes('寄出') || statusText.includes('取貨')) {
                statusBadge.classList.add('shipped');
            } else {
                statusBadge.classList.add('pending');
            }
            statusBadge.innerText = statusText;

            // Payment Status
            const payStatusDiv = card.querySelector('.res-payment-status');
            let paymentDisplay = '';

            if (order.paymentStatus && (
                order.paymentStatus === 'Verify' ||
                order.paymentStatus.includes('已核對') ||
                order.paymentStatus.includes('已付款') ||
                order.paymentStatus.includes('已對帳') ||
                order.paymentStatus.includes('完成') ||
                order.paymentStatus.includes('ok') ||
                order.paymentStatus.toLowerCase() === 'true'
            )) {
                paymentDisplay = '<span style="color:green; font-weight:bold;">已付款 (核對成功)</span>';
            } else {
                paymentDisplay = `<span style="color:#e6a23c;">${order.paymentMethod} (未核對/待付款)</span>`;
                if (order.paymentInfo) {
                    paymentDisplay += `<br><small style="color:#888;">${order.paymentInfo}</small>`;
                }
                // DEBUG
                paymentDisplay += `<br><span style="font-size:10px; color:#ccc;">(系統狀態值: ${order.paymentStatus})</span>`;
            }
            payStatusDiv.innerHTML = paymentDisplay;

            // Delivery
            card.querySelector('.res-delivery').innerText = order.deliveryMethod + (order.storeInfo ? ` (${order.storeInfo})` : '');

            // Items
            if (order.items) {
                const itemsHtml = order.items.split(', ').map(item => `<div>• ${item}</div>`).join('');
                card.querySelector('.res-items').innerHTML = itemsHtml;
            } else {
                card.querySelector('.res-items').innerText = '-';
            }

            // Timeline
            const stepConfirmed = card.querySelector('.step-confirmed');
            const stepShipped = card.querySelector('.step-shipped');

            stepConfirmed.classList.remove('active');
            stepShipped.classList.remove('active');

            if (statusText !== '未處理' && statusText !== '取消') {
                stepConfirmed.classList.add('active');
            }
            if (statusText.includes('出貨') || statusText.includes('寄出') || statusText.includes('已取') || statusText.includes('完成')) {
                stepConfirmed.classList.add('active');
                stepShipped.classList.add('active');
            }

            resultsList.appendChild(card);
        });
    }
}

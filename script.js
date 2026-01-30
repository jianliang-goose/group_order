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
    is_open: "true"
};

// ...

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

        // HOTFIX: 強制更新圖片路徑 (Google Sheet 可能還沒改)
        productsData.forEach(p => {
            // 肉燥包改用 .jpg (加上 timestamp 強制刷新快取)
            if (p.ID === 'p2') p.Image = 'images/goose-sauce.jpg?v=2';
            // 為了保險起見，也可以強制更新其他新圖
            if (p.ID === 'p1') p.Image = 'images/goose-quarter.png?v=2';
            if (p.ID === 'p3') p.Image = 'images/goose-whole.png?v=2';
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
            image: p.Image || 'images/goose-whole.png', // Fallback image
            promoTag: p.PromoTag || '',
            promoDesc: p.PromoDesc || '', // This stores the Target Product ID for conditional discounts
            promoTargetQty: parseInt(p.PromoTargetQty) || 2 // Default 2 if not strict
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
                <span class="timeline-label">最後接單</span>
                <span class="timeline-date">${settings.close_date || '-'}</span>
            </div>
             <div class="timeline-divider"></div>
            <div class="timeline-item">
                <span class="timeline-label">最後寄貨</span>
                <span class="timeline-date">${settings.shipping_date || '-'}</span>
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

    const payload = {
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
        document.getElementById('successDate').innerText = new Date().toLocaleString('zh-TW', { hour12: false });
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

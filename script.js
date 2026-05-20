/**
 * 早餐點餐工具 - GAS API 版 (免登入)
 */

let state = {
    shops: [],
    menu: [],
    records: [],
    currentShop: null,
    order: [],
    currentItemWithOptions: null,
    adminPassword: null,
    currentUserRole: '一般人員'
};

function initApp() {
    initDateTime();
    initEventListeners();
    updateRoleUI();

    if (typeof CONFIG === 'undefined' || !CONFIG.GAS_URL) {
        showToast('⚠️ 系統錯誤：找不到 CONFIG 設定或未設定 GAS_URL。');
        return;
    }

    fetchData();

    // 自動喚醒更新時間
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (state.order.length === 0) {
                initDateTime();
            }
        }
    });
}

// 啟動應用程式
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function updateRoleUI() {
    const roleBadge = document.getElementById('user-role');
    const adminBtns = document.querySelectorAll('.btn-admin');
    const authBtn = document.getElementById('auth-btn');

    if (state.adminPassword) {
        roleBadge.textContent = '👑 管理員';
        roleBadge.className = 'badge admin';
        adminBtns.forEach(b => b.classList.remove('hidden'));
        authBtn.textContent = '登出管理員';
        authBtn.onclick = logoutAdmin;
        state.currentUserRole = '管理員';
    } else {
        roleBadge.textContent = '👤 一般人員';
        roleBadge.className = 'badge';
        adminBtns.forEach(b => b.classList.add('hidden'));
        authBtn.textContent = '👑 管理員登入';
        authBtn.onclick = () => document.getElementById('admin-login-modal').classList.remove('hidden');
        state.currentUserRole = '一般人員';
    }
    
    // 如果有選中店家，重新渲染選單以顯示/隱藏刪除按鈕
    if (state.currentShop) {
        renderMenu(state.currentShop);
    }
}

function logoutAdmin() {
    state.adminPassword = null;
    updateRoleUI();
    showToast('已登出管理員');
}

function fetchData() {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    window[callbackName] = function(data) {
        delete window[callbackName];
        
        state.shops = data.shops || [];
        state.menu = data.menu || [];
        state.records = data.records || [];

        state.menu.forEach(product => {
            const isDrink = ["紅茶", "豆漿", "奶茶", "咖啡", "拿鐵"].some(key => product.item.includes(key));
            product.hasTemp = isDrink;
            product.hasSugar = isDrink;
        });

        renderShops();
        renderRecords();
    };

    const script = document.createElement('script');
    script.src = CONFIG.GAS_URL + (CONFIG.GAS_URL.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    script.onerror = function() {
        console.error('Fetch error via JSONP');
        showToast('❌ 讀取資料失敗，請確認 GAS_URL 或網路');
    };
    document.body.appendChild(script);
}

async function sendPostRequest(params) {
    const response = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(params)
    });
    return await response.json();
}

function initDateTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    document.getElementById('pickup-date').value = `${y}-${m}-${d}`;
    const timeSelect = document.getElementById('pickup-time');
    timeSelect.innerHTML = '';
    for (let h = 6; h <= 11; h++) {
        ['00', '15', '30', '45'].forEach(m => {
            const time = `${h.toString().padStart(2, '0')}:${m}`;
            const opt = document.createElement('option');
            opt.value = time; opt.textContent = time;
            if (time === "06:45") opt.selected = true;
            timeSelect.appendChild(opt);
        });
    }
}

function initEventListeners() {
    document.getElementById('submit-order').addEventListener('click', submitOrder);
    document.getElementById('clear-order').addEventListener('click', clearOrder);
    document.getElementById('cancel-options').addEventListener('click', closeOptionsModal);
    document.getElementById('confirm-options').addEventListener('click', confirmOptions);

    // 管理員登入彈窗
    document.getElementById('cancel-admin-login').onclick = () => {
        document.getElementById('admin-login-modal').classList.add('hidden');
    };
    document.getElementById('confirm-admin-login').onclick = () => {
        const pwd = document.getElementById('admin-password-input').value;
        if (pwd === '496527') {
            state.adminPassword = pwd;
            document.getElementById('admin-login-modal').classList.add('hidden');
            document.getElementById('admin-password-input').value = '';
            updateRoleUI();
            showToast('✅ 管理員登入成功');
        } else {
            showToast('❌ 密碼錯誤');
        }
    };

    // 管理員按鈕
    document.getElementById('admin-add-shop').addEventListener('click', openAddShopModal);
    document.getElementById('cancel-add-shop').addEventListener('click', () => document.getElementById('add-shop-modal').classList.add('hidden'));
    document.getElementById('confirm-add-shop').addEventListener('click', confirmAddShop);

    document.getElementById('admin-add-meal').addEventListener('click', openAddMealModal);
    document.getElementById('cancel-add-meal').addEventListener('click', () => document.getElementById('add-meal-modal').classList.add('hidden'));
    document.getElementById('confirm-add-meal').addEventListener('click', confirmAddMeal);

    // 數量彈窗控制
    document.getElementById('modal-qty-minus').onclick = () => updateModalQty(-1);
    document.getElementById('modal-qty-plus').onclick = () => updateModalQty(1);
    document.querySelectorAll('.chip-qty').forEach(chip => {
        chip.onclick = () => {
            document.querySelectorAll('.chip-qty').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            document.getElementById('modal-qty-input').value = chip.dataset.val;
        };
    });

    // 選項 Chip 點擊
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const siblings = chip.parentElement.querySelectorAll('.chip');
            siblings.forEach(s => s.classList.remove('active'));
            chip.classList.add('active');
        });
    });
}

function renderShops() {
    const shopList = document.getElementById('shop-list');
    shopList.innerHTML = '';
    state.shops.forEach(shop => {
        const btn = document.createElement('button');
        btn.className = `btn-shop ${state.currentShop === shop ? 'active' : ''}`;
        btn.textContent = shop;
        btn.onclick = () => selectShop(shop);
        shopList.appendChild(btn);
    });
}

function selectShop(shopName) {
    state.currentShop = shopName;
    document.getElementById('current-shop-name').textContent = `🔍 ${shopName}`;
    renderShops();
    renderMenu(shopName);
}

function renderMenu(shopName) {
    const menuList = document.getElementById('menu-list');
    menuList.innerHTML = '';
    const items = state.menu.filter(m => m.shop === shopName);
    items.forEach(product => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        
        const isAdmin = state.currentUserRole === '管理員';
        const iconClass = isAdmin ? 'delete-icon' : 'add-icon';
        const iconEmoji = isAdmin ? '❌' : '➕';

        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${product.item}</span>
                <span class="item-price">$${product.price}</span>
            </div>
            <div class="${iconClass}">${iconEmoji}</div>
        `;

        // 點擊整個項目預設為加入點餐
        div.onclick = () => handleAddToOrder(product);

        // 如果是管理員，為 ❌ 圖示綁定刪除事件
        if (isAdmin) {
            const deleteBtn = div.querySelector('.delete-icon');
            deleteBtn.onclick = (e) => {
                e.stopPropagation(); // 防止觸發 handleAddToOrder
                deleteMeal(product);
            };
        }

        menuList.appendChild(div);
    });
}

async function deleteMeal(product) {
    if (!confirm(`確定要刪除「${product.item}」嗎？\n(此動作將直接從雲端試算表移除)`)) {
        return;
    }

    try {
        showToast('⏳ 正在刪除...');
        const res = await sendPostRequest({
            action: 'deleteMeal',
            password: state.adminPassword,
            rowIndex: product.rowIndex,
            item: product.item
        });
        if (res.status === 'success') {
            showToast(`✅ 已刪除：${product.item}`);
            fetchData();
        } else {
            showToast(`❌ 刪除失敗：${res.message}`);
        }
    } catch (err) {
        console.error('Delete error:', err);
        showToast('❌ 刪除失敗，請確認網路');
    }
}

function handleAddToOrder(product) {
    openOptionsModal(product);
}

function openOptionsModal(product) {
    state.currentItemWithOptions = product;
    document.getElementById('modal-item-name').textContent = product.item;

    document.getElementById('modal-qty-input').value = 1;
    document.querySelectorAll('.chip-qty').forEach(c => c.classList.remove('active'));

    document.getElementById('temp-options-group').style.display = product.hasTemp ? 'block' : 'none';
    document.getElementById('sugar-options-group').style.display = product.hasSugar ? 'block' : 'none';

    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.getElementById('options-modal').classList.remove('hidden');
}

function updateModalQty(delta) {
    const input = document.getElementById('modal-qty-input');
    let val = parseInt(input.value) || 1;
    val = Math.max(1, val + delta);
    input.value = val;
    document.querySelectorAll('.chip-qty').forEach(c => c.classList.remove('active'));
}

function closeOptionsModal() {
    document.getElementById('options-modal').classList.add('hidden');
    state.currentItemWithOptions = null;
}

function confirmOptions() {
    const qty = parseInt(document.getElementById('modal-qty-input').value) || 1;
    const activeChips = document.querySelectorAll('.chip.active');
    const options = { qty };
    activeChips.forEach(chip => {
        const type = chip.parentElement.id.includes('temp') ? 'temp' : 'sugar';
        options[type] = chip.dataset.val;
    });

    confirmAddToOrder(state.currentItemWithOptions, options);
    closeOptionsModal();
}

function confirmAddToOrder(product, options) {
    const qty = options.qty || 1;
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupTime = document.getElementById('pickup-time').value;

    const existing = state.order.find(o =>
        o.shop === product.shop &&
        o.item === product.item &&
        o.temp === (options.temp || '') &&
        o.sugar === (options.sugar || '') &&
        o.pickupDate === pickupDate &&
        o.pickupTime === pickupTime
    );

    if (existing) {
        existing.qty += qty;
    } else {
        state.order.push({
            ...product,
            qty: qty,
            temp: options.temp || '',
            sugar: options.sugar || '',
            pickupDate: pickupDate,
            pickupTime: pickupTime
        });
    }
    showToast(`已加入：${product.item} x${qty}`);
    renderOrder();
}

function updateQty(index, delta) {
    state.order[index].qty += delta;
    if (state.order[index].qty <= 0) state.order.splice(index, 1);
    renderOrder();
}

function clearOrder() {
    if (state.order.length === 0) return;
    if (confirm('確定要清空目前的點餐清單嗎？')) {
        state.order = [];
        renderOrder();
    }
}

function renderOrder() {
    const orderListEl = document.getElementById('order-list');
    const totalAmountEl = document.getElementById('total-amount');
    const submitBtn = document.getElementById('submit-order');

    if (state.order.length === 0) {
        orderListEl.innerHTML = '<p class="empty-msg">目前還沒有點餐喔～快去選購吧！</p>';
        totalAmountEl.textContent = '$0';
        submitBtn.disabled = true;
        return;
    }

    orderListEl.innerHTML = '';
    let totalOverall = 0;
    const groups = {};
    state.order.forEach((item, originalIndex) => {
        if (!groups[item.shop]) groups[item.shop] = [];
        groups[item.shop].push({ ...item, originalIndex });
    });

    Object.keys(groups).forEach(shopName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'shop-order-group';
        
        const timeGroups = {};
        groups[shopName].forEach(o => {
            if (!timeGroups[o.pickupTime]) timeGroups[o.pickupTime] = [];
            timeGroups[o.pickupTime].push(o);
        });

        let itemsHtml = '';
        Object.keys(timeGroups).sort().forEach(time => {
            itemsHtml += `<div class="time-group-header">⏰ ${time}</div>`;
            itemsHtml += timeGroups[time].map(o => {
                totalOverall += o.price * o.qty;
                const optionsLabel = (o.temp || o.sugar) ? `<div class="item-options-label">${[o.temp, o.sugar].filter(v => v).join(', ')}</div>` : '';
                return `
                    <div class="order-row">
                        <div class="order-item-detail">
                            <div class="item-name">${o.item}</div>
                            ${optionsLabel}
                            <div class="item-price">$${o.price}</div>
                        </div>
                        <div class="controls">
                            <button class="qty-btn minus" onclick="updateQty(${o.originalIndex}, -1)">-</button>
                            <span class="qty-val">${o.qty}</span>
                            <button class="qty-btn" onclick="updateQty(${o.originalIndex}, 1)">+</button>
                        </div>
                    </div>
                `;
            }).join('');
        });

        groupDiv.innerHTML = `
            <div class="shop-group-header">
                <span class="shop-group-title">🏪 ${shopName}</span>
                <button class="btn-copy-shop" onclick="copyOrderText('${shopName}')">📋 複製</button>
            </div>
            <div class="shop-items-grid">
                ${itemsHtml}
            </div>
        `;
        orderListEl.appendChild(groupDiv);
    });

    totalAmountEl.textContent = `$${totalOverall}`;
    submitBtn.disabled = false;
}

function copyOrderText(shopName) {
    const shopItems = state.order.filter(o => o.shop === shopName);
    if (shopItems.length === 0) return;
    
    const date = shopItems[0].pickupDate || document.getElementById('pickup-date').value;
    
    const timeGroups = {};
    shopItems.forEach(o => {
        const t = o.pickupTime || document.getElementById('pickup-time').value;
        if (!timeGroups[t]) timeGroups[t] = [];
        timeGroups[t].push(o);
    });

    let itemsText = '';
    Object.keys(timeGroups).sort().forEach(time => {
        itemsText += `⏰ 取餐時間：${time}\n`;
        itemsText += timeGroups[time].map(o => {
            const opts = [o.temp, o.sugar].filter(v => v).join(', ');
            return `內容：${o.item}${opts ? '(' + opts + ')' : ''} x${o.qty}`;
        }).join('\n') + '\n\n';
    });

    const shopTotal = shopItems.reduce((acc, o) => acc + (o.price * o.qty), 0);
    const text = `【訂餐資訊】毓琇\n\n日期：${date}\n\n${itemsText.trim()}\n\n總額：$${shopTotal}\n\n再麻煩您了，謝謝`;
    navigator.clipboard.writeText(text).then(() => showToast(`✅ 已複製 ${shopName} 的內容`));
}

function renderRecords() {
    const recordList = document.getElementById('records-list');
    recordList.innerHTML = '';
    if (state.records.length === 0) {
        recordList.innerHTML = '<p class="empty-msg">尚無紀錄</p>';
        return;
    }
    state.records.forEach(r => {
        const div = document.createElement('div');
        div.className = 'record-item';
        div.innerHTML = `
            <div class="record-header">
                <span class="record-pickup-meta">🗓️ ${r.pickupDate} ⏰ ${r.pickupTime}</span>
                <span class="record-total-header">總計: $${r.total}</span>
            </div>
            <div class="record-content">${r.items}</div>
        `;
        recordList.appendChild(div);
    });
}

async function submitOrder() {
    const submitBtn = document.getElementById('submit-order');
    submitBtn.disabled = true;
    submitBtn.textContent = '送出中...';
    
    const dates = [...new Set(state.order.map(o => o.pickupDate))].join(', ') || document.getElementById('pickup-date').value;
    const times = [...new Set(state.order.map(o => o.pickupTime))].sort().join(', ') || document.getElementById('pickup-time').value;
    
    const items = state.order.map(o => {
        const opts = [o.temp, o.sugar].filter(v => v).join(', ');
        return `[${o.pickupTime}] ${o.shop}-${o.item}${opts ? '(' + opts + ')' : ''} x${o.qty}`;
    }).join(', ');
    
    const total = state.order.reduce((acc, o) => acc + (o.price * o.qty), 0);
    
    try {
        const res = await sendPostRequest({
            action: 'submitOrder',
            pickupDate: dates,
            pickupTime: times,
            items: items,
            total: total
        });
        
        if (res.status === 'success') {
            showToast('✅ 點餐成功！');
            state.order = []; 
            renderOrder(); 
            fetchData();
        } else {
            showToast(`❌ 送出失敗：${res.message}`);
        }
    } catch (err) {
        console.error('Submit error:', err);
        showToast('❌ 送出失敗，請確認網路');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '確認送出';
    }
}

function openAddShopModal() {
    document.getElementById('new-shop-name').value = '';
    document.getElementById('add-shop-modal').classList.remove('hidden');
}

async function confirmAddShop() {
    const shopName = document.getElementById('new-shop-name').value.trim();
    if (!shopName) return showToast('⚠️ 請輸入店名');

    try {
        const res = await sendPostRequest({
            action: 'addShop',
            password: state.adminPassword,
            shopName: shopName
        });
        
        if (res.status === 'success') {
            showToast(`✅ 已新增：${shopName}`);
            document.getElementById('add-shop-modal').classList.add('hidden');
            fetchData();
        } else {
            showToast(`❌ 新增失敗：${res.message}`);
        }
    } catch (err) {
        showToast('❌ 新增失敗，請確認網路');
    }
}

function openAddMealModal() {
    if (!state.currentShop) return showToast('⚠️ 請先選擇一家店');
    document.getElementById('meal-modal-shop-name').textContent = `目標店家：${state.currentShop}`;
    document.getElementById('new-meal-name').value = '';
    document.getElementById('new-meal-price').value = '';
    document.getElementById('add-meal-modal').classList.remove('hidden');
}

async function confirmAddMeal() {
    const name = document.getElementById('new-meal-name').value.trim();
    const price = document.getElementById('new-meal-price').value.trim();
    if (!name || !price) return showToast('⚠️ 請填寫名稱與價格');

    const isDrink = ["紅茶", "豆漿", "奶茶", "咖啡", "拿鐵"].some(key => name.includes(key));
    const hasTemp = isDrink ? "v" : "";
    const hasSugar = isDrink ? "v" : "";

    try {
        const res = await sendPostRequest({
            action: 'addMeal',
            password: state.adminPassword,
            shop: state.currentShop,
            item: name,
            price: price,
            hasTemp: hasTemp,
            hasSugar: hasSugar
        });
        
        if (res.status === 'success') {
            showToast(`✅ 已新增：${name}`);
            document.getElementById('add-meal-modal').classList.add('hidden');
            fetchData();
        } else {
            showToast(`❌ 新增失敗：${res.message}`);
        }
    } catch (err) {
        showToast('❌ 新增失敗，請確認網路');
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
}

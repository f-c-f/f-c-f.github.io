// 全局变量
let assetRecords = []; // 资产记录数组
let periodStats = [];  // 期间统计数组
let pieChart = null;   // 饼图实例
let lineChart = null;  // 折线图实例
let currentPage = 1;   // 当前页码
const pageSize = 10;   // 每页显示记录数

// 页面加载完成后初始化
window.onload = function() {
    // 检查登录状态和会话超时
    if (!checkLoginStatus()) {
        // 未登录或会话超时，跳转到登录页面
        window.location.href = '/subsystem/login.html?next=accounting/';
        return;
    }
    
    // 初始化应用
    initApp();
    
    // 定期检查会话超时
    setInterval(checkLoginStatus, 60000); // 每分钟检查一次
};

// 检查登录状态和会话超时
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginTime = localStorage.getItem('loginTime');
    
    if (!isLoggedIn || !loginTime) {
        return false;
    }
    
    // 检查是否超过3分钟（180000毫秒）
    const currentTime = Date.now();
    const loginTimestamp = parseInt(loginTime);
    
    if (currentTime - loginTimestamp > 180000) {
        // 会话超时，清除登录状态
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        return false;
    }
    
    // 更新登录时间，重置超时计时器
    localStorage.setItem('loginTime', currentTime.toString());
    return true;
};

// 初始化应用
function initApp() {
    // 直接加载数据，不等待
    loadData();
    
    // 其他初始化操作
    setupFinanceTotalListener();
    setupHistoryTable();
    setupDataManagement();
    
    // 绑定事件监听器
    document.getElementById('saveBtn').addEventListener('click', saveRecord);
    
    // 初始化历史记录比较功能
    setupCompareFunctionality();
    
    // 初始化可收起模块
    setupCollapsibleModules();
    
    // 绑定退出登录事件
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        console.log('找到退出登录按钮，绑定点击事件');
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('点击退出登录按钮');
            logout();
        });
    } else {
        console.log('未找到退出登录按钮');
    }
    
    // 监听资产输入变化，实时更新计算
    const assetInputs = document.querySelectorAll('.asset-input');
    assetInputs.forEach(input => {
        input.addEventListener('input', function() {
            updateCalculations();
            updateWechatFinanceDetail();
        });
    });
    
    document.getElementById('inputIncome').addEventListener('input', updateCalculations);
};

// 退出登录
function logout() {
    // 使用window.confirm确保获取正确的返回值
    var result = window.confirm('确定要退出登录吗？');
    console.log('确认对话框返回值:', result);
    
    // 只有当用户点击确定时才执行退出操作
    if (result === true) {
        console.log('用户点击了确定，执行退出登录');
        // 清除登录状态
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        // 跳转到登录页面
        setTimeout(function() {
            window.location.href = '/subsystem/login.html';
        }, 100);
    } else {
        console.log('用户点击了取消，不执行退出登录');
        // 什么都不做，保持当前状态
    }
};

// 初始化可收起模块（历史记录比较、月度消费统计）
function setupCollapsibleModules() {
    document.querySelectorAll('.module-collapsible').forEach(module => {
        const header = module.querySelector('.module-header');
        const btn = module.querySelector('.collapse-btn');
        if (!header || !btn) return;
        
        const toggle = () => {
            const collapsed = module.dataset.collapsed === 'true';
            module.dataset.collapsed = collapsed ? 'false' : 'true';
            btn.textContent = collapsed ? '收起' : '展开';
        };
        
        header.addEventListener('click', (e) => {
            if (e.target === btn) return;
            toggle();
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });
    });
}

// 更新理财通明细（债券自动计算）
function updateWechatFinanceDetail() {
    // 获取理财通总额
    const financeTotalInput = document.querySelector('[data-platform="微信"][data-category="理财通"]:not([data-subcategory])');
    const financeTotal = parseFloat(financeTotalInput.value) || 0;
    
    // 获取理财通其他明细输入（活期+、定期、短期+）
    const otherInputs = document.querySelectorAll('[data-platform="微信"][data-category="理财通"][data-subcategory]:not([data-subcategory="债券"])');
    
    // 计算其他明细总额
    let otherTotal = 0;
    otherInputs.forEach(input => {
        otherTotal += parseFloat(input.value) || 0;
    });
    
    // 自动计算债券金额
    const bondInput = document.querySelector('[data-platform="微信"][data-category="理财通"][data-subcategory="债券"]');
    if (bondInput) {
        bondInput.value = Math.max(0, (financeTotal - otherTotal)).toFixed(2);
    }
}



// 设置总额输入监听器
function setupFinanceTotalListener() {
    // 理财通总额输入监听
    const financeTotalInput = document.querySelector('[data-platform="微信"][data-category="理财通"]:not([data-subcategory])');
    if (financeTotalInput) {
        financeTotalInput.addEventListener('input', function() {
            // 标记为用户已输入
            this.dataset.userInput = 'true';
            // 更新理财通明细（债券自动计算）
            updateWechatFinanceDetail();
        });
    }
}

// 本地存储 key
const CACHE_KEY_ASSET = 'assetRecords_cache';
const CACHE_KEY_STATS = 'periodStats_cache';

// 先从本地缓存加载并立即渲染，再从云端拉取并静默更新
function loadData() {
    // 1. 优先从 localStorage 读取，秒开
    const cachedAsset = localStorage.getItem(CACHE_KEY_ASSET);
    const cachedStats = localStorage.getItem(CACHE_KEY_STATS);
    if (cachedAsset) {
        try {
            assetRecords = Array.isArray(JSON.parse(cachedAsset)) ? JSON.parse(cachedAsset) : [];
        } catch (_) { assetRecords = []; }
    }
    if (cachedStats) {
        try {
            periodStats = Array.isArray(JSON.parse(cachedStats)) ? JSON.parse(cachedStats) : [];
        } catch (_) { periodStats = []; }
    }
    
    // 2. 立即更新界面（利用本地缓存）
    fillLatestAssetData();
    updateCalculations();
    updateAssetChanges();
    updateCharts();
    updateHistoryTable();
    updateMonthSelect();
    
    // 3. 无 Firebase 时不再请求
    if (!window.firebase) {
        return;
    }
    
    const { database, ref, get } = window.firebase;
    
    Promise.all([
        get(ref(database, 'assetRecords')).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                assetRecords = Array.isArray(data) ? data : [];
                localStorage.setItem(CACHE_KEY_ASSET, JSON.stringify(assetRecords));
            }
        }).catch((e) => { console.error('Error loading assetRecords:', e); }),
        get(ref(database, 'periodStats')).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                periodStats = Array.isArray(data) ? data : [];
                localStorage.setItem(CACHE_KEY_STATS, JSON.stringify(periodStats));
            }
        }).catch((e) => { console.error('Error loading periodStats:', e); })
    ]).finally(() => {
        fillLatestAssetData();
        updateCalculations();
        updateAssetChanges();
        updateCharts();
        updateHistoryTable();
        updateMonthSelect();
    });
}

// 保存数据到 localStorage 和 Firebase（本地+云端双写）
function saveData() {
    // 始终写入本地缓存，保证下次秒开
    localStorage.setItem(CACHE_KEY_ASSET, JSON.stringify(assetRecords));
    localStorage.setItem(CACHE_KEY_STATS, JSON.stringify(periodStats));
    
    if (!window.firebase) return;
    
    const { database, ref, set } = window.firebase;
    set(ref(database, 'assetRecords'), assetRecords).catch((e) => console.error('Error saving assetRecords:', e));
    set(ref(database, 'periodStats'), periodStats).catch((e) => console.error('Error saving periodStats:', e));
}



// 更新计算结果（基于已保存记录，当前=最近一次保存，上期=上上一次保存，消费实时计算）
function updateCalculations() {
    let assetLast = 0;
    let assetCurrent = 0;
    let assetDelta = 0;
    let consumption = 0;
    
    if (periodStats.length >= 2) {
        const lastStat = periodStats[periodStats.length - 1];
        const prevStat = periodStats[periodStats.length - 2];
        assetLast = prevStat.asset_current;   // 上期 = 上上一次保存的资产
        assetCurrent = lastStat.asset_current; // 当前 = 最近一次保存的资产
        assetDelta = assetCurrent - assetLast;
        consumption = lastStat.input_income - assetDelta;  // 消费实时计算
        consumption = Math.abs(consumption) < 0.01 ? 0 : consumption;
    } else if (periodStats.length === 1) {
        const lastStat = periodStats[0];
        assetLast = 0;
        assetCurrent = lastStat.asset_current;
        assetDelta = assetCurrent - assetLast;
        consumption = lastStat.input_income - assetDelta;
        consumption = Math.abs(consumption) < 0.01 ? 0 : consumption;
    }
    
    // 更新界面显示
    document.getElementById('assetLast').textContent = assetLast.toFixed(2);
    document.getElementById('assetCurrent').textContent = assetCurrent.toFixed(2);
    document.getElementById('assetDelta').textContent = assetDelta.toFixed(2);
    document.getElementById('consumption').textContent = consumption.toFixed(2);
    
    // 更新颜色
    updateResultColors(assetDelta, consumption);
}

// 根据上期资产实时计算消费（不依赖存储值）
function calcConsumption(stat, prevAssetCurrent) {
    const prev = prevAssetCurrent ?? 0;
    const delta = stat.asset_current - prev;
    let c = stat.input_income - delta;
    return Math.abs(c) < 0.01 ? 0 : c;
}

// 更新结果颜色
function updateResultColors(assetDelta, consumption) {
    const assetDeltaEl = document.getElementById('assetDelta');
    const consumptionEl = document.getElementById('consumption');
    
    // 资产净增长颜色
    assetDeltaEl.style.color = assetDelta >= 0 ? '#27ae60' : '#e74c3c';
    
    // 消费颜色
    consumptionEl.style.color = consumption >= 0 ? '#e74c3c' : '#27ae60';
}

// 计算详细资产变动
function calculateDetailedChanges(currentAssets) {
    const detailedChanges = [];
    
    // 如果没有历史记录，返回空数组
    if (periodStats.length === 0) {
        return detailedChanges;
    }
    
    // 获取上次的统计记录
    const lastStat = periodStats[periodStats.length - 1];
    
    // 获取上次的资产记录
    const lastAssets = assetRecords.filter(record => 
        record.record_time === lastStat.period
    );
    
    // 创建上次资产的映射，用于快速查找
    const lastAssetsMap = {};
    lastAssets.forEach(asset => {
        const key = `${asset.platform}-${asset.category}-${asset.sub_category || 'null'}`;
        lastAssetsMap[key] = asset.amount;
    });
    
    // 遍历当前资产，计算变动
    currentAssets.forEach(asset => {
        const key = `${asset.platform}-${asset.category}-${asset.sub_category || 'null'}`;
        const lastAmount = lastAssetsMap[key] || 0;
        const currentAmount = asset.amount;
        const delta = currentAmount - lastAmount;
        
        if (delta !== 0) {
            detailedChanges.push({
                platform: asset.platform,
                category: asset.category,
                sub_category: asset.sub_category,
                last_amount: lastAmount,
                current_amount: currentAmount,
                delta: delta
            });
        }
    });
    
    // 检查是否有资产被删除
    Object.keys(lastAssetsMap).forEach(key => {
        const [platform, category, subCategory] = key.split('-');
        const subCategoryClean = subCategory === 'null' ? null : subCategory;
        
        // 检查当前资产中是否存在该记录
        const exists = currentAssets.some(asset => 
            asset.platform === platform &&
            asset.category === category &&
            asset.sub_category === subCategoryClean
        );
        
        if (!exists) {
            const lastAmount = lastAssetsMap[key];
            detailedChanges.push({
                platform: platform,
                category: category,
                sub_category: subCategoryClean,
                last_amount: lastAmount,
                current_amount: 0,
                delta: -lastAmount
            });
        }
    });
    
    return detailedChanges;
}

// 更新资产变动明细
function updateAssetChanges() {
    const assetChangesEl = document.getElementById('assetChanges');
    assetChangesEl.innerHTML = '';
    
    if (periodStats.length < 2) {
        assetChangesEl.innerHTML = '<p>暂无变动记录</p>';
        return;
    }
    
    // 获取最近两次统计
    const lastStat = periodStats[periodStats.length - 1];
    const prevStat = periodStats[periodStats.length - 2];
    
    // 计算变动
    const changeItems = [];
    
    // 按平台分组计算变动
    const platforms = ['微信', '支付宝', '工资卡'];
    platforms.forEach(platform => {
        const lastAmount = getPlatformAmount(lastStat.period, platform);
        const prevAmount = getPlatformAmount(prevStat.period, platform);
        const delta = lastAmount - prevAmount;
        const percent = prevAmount > 0 ? (delta / prevAmount) * 100 : 0;
        
        if (delta !== 0) {
            changeItems.push({
                name: platform,
                lastAmount: lastAmount,
                prevAmount: prevAmount,
                delta: delta,
                percent: percent
            });
        }
    });
    
    // 生成变动明细HTML
    changeItems.forEach(item => {
        const changeEl = document.createElement('div');
        changeEl.className = `change-item ${item.delta >= 0 ? 'change-positive' : 'change-negative'}`;
        
        const deltaText = item.delta >= 0 ? `+${item.delta.toFixed(2)}` : item.delta.toFixed(2);
        const percentText = item.percent >= 0 ? `+${item.percent.toFixed(1)}%` : `${item.percent.toFixed(1)}%`;
        
        changeEl.innerHTML = `
            <strong>${item.name}：</strong>
            上次 ${item.prevAmount.toFixed(2)} 元 → 
            当前 ${item.lastAmount.toFixed(2)} 元 → 
            变动 ${deltaText} 元 (${percentText})
        `;
        
        assetChangesEl.appendChild(changeEl);
    });
    
    // 显示详细资产变动
    if (lastStat.detailed_changes && lastStat.detailed_changes.length > 0) {
        const detailedTitle = document.createElement('h3');
        detailedTitle.textContent = '详细资产变动';
        detailedTitle.style.marginTop = '15px';
        detailedTitle.style.marginBottom = '10px';
        assetChangesEl.appendChild(detailedTitle);
        
        lastStat.detailed_changes.forEach(change => {
            const changeEl = document.createElement('div');
            changeEl.className = `change-item ${change.delta >= 0 ? 'change-positive' : 'change-negative'}`;
            changeEl.style.fontSize = '14px';
            changeEl.style.padding = '5px 10px';
            
            const deltaText = change.delta >= 0 ? `+${change.delta.toFixed(2)}` : change.delta.toFixed(2);
            const name = change.sub_category ? `${change.category} - ${change.sub_category}` : change.category;
            
            changeEl.innerHTML = `
                <strong>${change.platform} - ${name}：</strong>
                上次 ${change.last_amount.toFixed(2)} 元 → 
                当前 ${change.current_amount.toFixed(2)} 元 → 
                变动 ${deltaText} 元
            `;
            
            assetChangesEl.appendChild(changeEl);
        });
    }
}

// 获取指定平台在指定时间的资产总额
function getPlatformAmount(time, platform) {
    const records = assetRecords.filter(record => 
        record.record_time === time && record.platform === platform
    );
    
    // 计算总额时，排除理财通的明细记录，只计算理财通总额
    return records.reduce((sum, record) => {
        if (record.platform === '微信' && record.category === '理财通' && record.sub_category) {
            return sum;
        }
        return sum + record.amount;
    }, 0);
}

// 更新图表
function updateCharts() {
    updatePieChart();
    updateLineChart();
}

// 更新饼图
function updatePieChart() {
    const ctx = document.getElementById('pieChart').getContext('2d');
    
    // 计算当前各平台资产
    const wechatAmount = getCurrentPlatformAmount('微信');
    const alipayAmount = getCurrentPlatformAmount('支付宝');
    const salaryCardAmount = getCurrentPlatformAmount('工资卡');
    
    const labels = ['微信', '支付宝', '工资卡'];
    const data = [wechatAmount, alipayAmount, salaryCardAmount];
    const backgroundColor = ['#3498db', '#e74c3c', '#27ae60'];
    
    // 销毁旧图表
    if (pieChart) {
        pieChart.destroy();
    }
    
    // 创建新饼图
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColor,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: '资产构成'
                }
            }
        }
    });
}

// 更新折线图
function updateLineChart() {
    const ctx = document.getElementById('lineChart').getContext('2d');
    
    // 准备数据
    const labels = periodStats.map(stat => {
        const date = new Date(stat.period);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    
    const assetData = periodStats.map(stat => stat.asset_current);
    
    // 销毁旧图表
    if (lineChart) {
        lineChart.destroy();
    }
    
    // 创建新折线图
    lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '总资产',
                data: assetData,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: '资产变化趋势'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '金额（元）'
                    }
                }
            }
        }
    });
}

// 获取当前各平台资产总额
function getCurrentPlatformAmount(platform) {
    let amount = 0;
    const assetInputs = document.querySelectorAll('.asset-input');
    assetInputs.forEach(input => {
        if (input.dataset.platform === platform) {
            // 排除理财通的明细记录，只计算理财通总额
            const category = input.dataset.category;
            const subcategory = input.dataset.subcategory;
            if (platform === '微信' && category === '理财通' && subcategory) {
                return;
            }
            amount += parseFloat(input.value) || 0;
        }
    });
    return amount;
}

// 设置历史记录表格
function setupHistoryTable() {
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    
    // 绑定分页按钮点击事件
    prevPageBtn.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            updateHistoryTable();
        }
    });
    
    nextPageBtn.addEventListener('click', function() {
        const totalPages = Math.ceil(periodStats.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            updateHistoryTable();
        }
    });
    
    // 初始更新表格
    updateHistoryTable();
}

// 更新历史记录表格（消费金额实时计算）
function updateHistoryTable() {
    const tableBody = document.querySelector('#historyTable tbody');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    // 清空表格内容
    tableBody.innerHTML = '';
    
    // 按时间倒序排序
    const sortedStats = [...periodStats].sort((a, b) => new Date(b.period) - new Date(a.period));
    
    // 计算分页
    const totalPages = Math.ceil(sortedStats.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = sortedStats.slice(startIndex, endIndex);
    
    // 填充表格数据（消费金额实时计算，对比上一条保存的资产）
    pageData.forEach((stat, index) => {
        const statIdx = startIndex + index;
        const prevStat = statIdx + 1 < sortedStats.length ? sortedStats[statIdx + 1] : null;
        const consumption = calcConsumption(stat, prevStat ? prevStat.asset_current : 0);
        
        const row = document.createElement('tr');
        const date = new Date(stat.period);
        const dateStr = date.toLocaleString('zh-CN');
        
        // 计算各平台金额
        const wechatAmount = getPlatformAmount(stat.period, '微信');
        const alipayAmount = getPlatformAmount(stat.period, '支付宝');
        const salaryCardAmount = getPlatformAmount(stat.period, '工资卡');
        
        // 获取元素在原始periodStats数组中的索引
        const originalIndex = periodStats.indexOf(stat);
        
        row.innerHTML = `
            <td>${dateStr}</td>
            <td>${stat.asset_current.toFixed(2)}</td>
            <td>${wechatAmount.toFixed(2)}</td>
            <td>${alipayAmount.toFixed(2)}</td>
            <td>${salaryCardAmount.toFixed(2)}</td>
            <td>${stat.input_income.toFixed(2)}</td>
            <td>${consumption.toFixed(2)}</td>
            <td>${stat.note || '-'}</td>
            <td>
                <button class="btn-expand" data-index="${originalIndex}">展开</button>
                <button class="btn-delete" data-index="${originalIndex}">删除</button>
            </td>
        `;
        
        tableBody.appendChild(row);
        
        // 创建展开的详细信息行
        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.style.display = 'none';
        detailRow.setAttribute('data-index', originalIndex);
        
        // 生成详细资产构成HTML
        let detailHTML = '<td colspan="9"><div class="asset-details">';
        
        // 显示备注信息
        if (stat.note) {
            detailHTML += `<div class="asset-note"><strong>备注：</strong>${stat.note}</div>`;
        }
        
        if (stat.asset_details && stat.asset_details.length > 0) {
            // 按平台分组显示
            const platforms = {};
            stat.asset_details.forEach(asset => {
                if (!platforms[asset.platform]) {
                    platforms[asset.platform] = [];
                }
                platforms[asset.platform].push(asset);
            });
            
            Object.keys(platforms).forEach(platform => {
                detailHTML += `<h4>${platform}</h4>`;
                detailHTML += '<div class="platform-details">';
                
                platforms[platform].forEach(asset => {
                    const category = asset.sub_category ? `${asset.category} - ${asset.sub_category}` : asset.category;
                    detailHTML += `<div class="asset-item-detail">${category}：${asset.amount.toFixed(2)} 元</div>`;
                });
                
                detailHTML += '</div>';
            });
        } else {
            detailHTML += '<p>暂无详细资产构成信息</p>';
        }
        
        detailHTML += '</div></td>';
        detailRow.innerHTML = detailHTML;
        tableBody.appendChild(detailRow);
    });
    
    // 绑定展开/收起按钮点击事件
    const expandBtns = document.querySelectorAll('.btn-expand');
    expandBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            const detailRow = document.querySelector(`.detail-row[data-index="${index}"]`);
            
            if (detailRow.style.display === 'none') {
                detailRow.style.display = 'table-row';
                this.textContent = '收起';
            } else {
                detailRow.style.display = 'none';
                this.textContent = '展开';
            }
        });
    });
    
    // 更新分页信息
    pageInfo.textContent = `第 ${currentPage} 页，共 ${totalPages} 页`;
    
    // 更新分页按钮状态
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // 绑定删除按钮点击事件
    const deleteBtns = document.querySelectorAll('.btn-delete');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            deleteRecord(index);
        });
    });
}

// 删除历史记录
function deleteRecord(index) {
    if (confirm('确定要删除这条记录吗？')) {
        const stat = periodStats[index];
        const recordTime = stat.period;
        
        // 删除对应的资产记录
        assetRecords = assetRecords.filter(record => record.record_time !== recordTime);
        
        // 删除统计记录
        periodStats.splice(index, 1);
        
        // 保存到localStorage
        saveData();
        
        // 更新界面
        updateCalculations();
        updateAssetChanges();
        updateCharts();
        updateHistoryTable();
        updateMonthSelect();
        
        alert('记录删除成功！');
    }
}

// 填充最新资产数据
function fillLatestAssetData() {
    console.log('开始填充最新资产数据');
    console.log('periodStats长度:', periodStats.length);
    console.log('assetRecords长度:', assetRecords.length);
    
    // 尝试从最近的periodStats记录中获取资产构成详细信息
    if (periodStats.length > 0) {
        console.log('有periodStats记录');
        // 按时间倒序排序，获取最新的记录
        const sortedStats = [...periodStats].sort((a, b) => new Date(b.period) - new Date(a.period));
        const latestStat = sortedStats[0];
        console.log('最新的periodStats记录:', latestStat);
        
        // 检查是否有资产构成详细信息
        if (latestStat.asset_details && latestStat.asset_details.length > 0) {
            console.log('有asset_details，长度:', latestStat.asset_details.length);
            console.log('asset_details内容:', latestStat.asset_details);
            // 遍历所有资产输入框
            const assetInputs = document.querySelectorAll('.asset-input');
            console.log('资产输入框数量:', assetInputs.length);
            assetInputs.forEach(input => {
                const platform = input.dataset.platform;
                const category = input.dataset.category;
                const subcategory = input.dataset.subcategory || null; // 与保存时保持一致，转换为null
                console.log('处理输入框:', platform, category, subcategory);
                
                // 查找匹配的资产记录
                const matchedRecord = latestStat.asset_details.find(record => {
                    const recordSubCategory = record.sub_category === undefined ? null : record.sub_category;
                    return record.platform === platform && 
                           record.category === category && 
                           recordSubCategory === subcategory;
                });
                
                console.log('匹配的记录:', matchedRecord);
                // 如果找到匹配的记录，填充金额；否则填充0
                if (matchedRecord) {
                    input.value = matchedRecord.amount.toFixed(2);
                    console.log('填充金额:', matchedRecord.amount.toFixed(2));
                } else {
                    input.value = '0.00';
                    console.log('填充0.00');
                }
            });
            
            // 更新计算
            updateWechatFinanceDetail();
            console.log('从periodStats填充完成');
            return;
        } else {
            console.log('没有asset_details');
        }
    }
    
    // 如果没有periodStats记录或没有asset_details，尝试从assetRecords中获取
    if (assetRecords.length > 0) {
        console.log('从assetRecords获取');
        // 按时间分组，获取所有唯一的记录时间
        const uniqueTimes = [...new Set(assetRecords.map(record => record.record_time))];
        console.log('唯一时间点:', uniqueTimes);
        
        // 按时间倒序排序，获取最新的记录时间
        uniqueTimes.sort((a, b) => new Date(b) - new Date(a));
        const latestTime = uniqueTimes[0];
        console.log('最新时间:', latestTime);
        
        // 获取最新时间点的所有资产记录
        const latestRecords = assetRecords.filter(record => record.record_time === latestTime);
        console.log('最新时间的记录:', latestRecords);
        
        // 遍历所有资产输入框
        const assetInputs = document.querySelectorAll('.asset-input');
        assetInputs.forEach(input => {
            const platform = input.dataset.platform;
            const category = input.dataset.category;
            const subcategory = input.dataset.subcategory || null; // 与保存时保持一致，转换为null
            
            // 查找匹配的资产记录
            const matchedRecord = latestRecords.find(record => {
                const recordSubCategory = record.sub_category === undefined ? null : record.sub_category;
                return record.platform === platform && 
                       record.category === category && 
                       recordSubCategory === subcategory;
            });
            
            // 如果找到匹配的记录，填充金额；否则填充0
            if (matchedRecord) {
                input.value = matchedRecord.amount.toFixed(2);
            } else {
                input.value = '0.00';
            }
        });
    } else {
        console.log('没有任何记录，填充0');
        // 如果没有任何记录，将所有输入框填充为0
        const assetInputs = document.querySelectorAll('.asset-input');
        assetInputs.forEach(input => {
            input.value = '0.00';
        });
    }
    
    // 更新计算
    updateWechatFinanceDetail();
    console.log('填充完成');
}

// 保存记录后更新历史记录下拉列表
function saveRecord() {
    const inputIncome = parseFloat(document.getElementById('inputIncome').value) || 0;
    const assetNote = document.getElementById('asset-note').value.trim();
    
    // 生成统一的时间戳，确保资产记录和统计记录使用相同的时间
    const recordTime = new Date().toISOString();
    
    // 收集当前资产数据
    const currentAssets = [];
    const assetInputs = document.querySelectorAll('.asset-input');
    
    assetInputs.forEach(input => {
        const platform = input.dataset.platform;
        const category = input.dataset.category;
        const subcategory = input.dataset.subcategory;
        const amount = parseFloat(input.value) || 0;
        
        // 跳过微信总额和支付宝总额（如果存在）
        if ((platform === '微信' && category === '微信总额') || 
            (platform === '支付宝' && category === '支付宝总额')) {
            return;
        }
        
        // 保存所有资产记录，包括金额为0的记录
        currentAssets.push({
            platform: platform,
            category: category,
            sub_category: subcategory || null,
            amount: amount,
            record_time: recordTime
        });
    });
    
    // 计算当前总资产（排除理财通明细，避免重复计算）
    const assetCurrent = currentAssets.reduce((sum, asset) => {
        // 跳过理财通的明细记录，只计算理财通总额
        if (asset.platform === '微信' && asset.category === '理财通' && asset.sub_category) {
            return sum;
        }
        return sum + asset.amount;
    }, 0);
    
    // 获取上次总资产
    let assetLast = 0;
    if (periodStats.length > 0) {
        const lastStat = periodStats[periodStats.length - 1];
        assetLast = lastStat.asset_current;
    }
    
    // 资产净增长（消费不保存，由界面实时计算）
    const assetDelta = assetCurrent - assetLast;
    
    // 保存资产记录
    assetRecords = [...assetRecords, ...currentAssets];
    
    // 计算详细资产变动
    const detailedChanges = calculateDetailedChanges(currentAssets);
    
    // 保存期间统计（consumption 不存储，由界面实时计算）
    periodStats.push({
        input_income: inputIncome,
        asset_last: assetLast,
        asset_current: assetCurrent,
        asset_delta: assetDelta,
        detailed_changes: detailedChanges,
        asset_details: currentAssets, // 存储完整的资产构成详细信息
        note: assetNote, // 资产备注信息
        period: recordTime
    });
    
    // 保存到localStorage
    saveData();
    
    // 更新界面
    updateCalculations();
    updateAssetChanges();
    updateCharts();
    updateHistoryTable(); // 更新历史记录表格
    updateMonthSelect();  // 更新月度统计
    
    alert('记录保存成功！');

}

// 设置数据管理功能
function setupDataManagement() {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    
    // 绑定导出按钮点击事件
    exportBtn.addEventListener('click', exportData);
    
    // 绑定导入按钮点击事件
    importBtn.addEventListener('click', function() {
        if (!importFile.files || importFile.files.length === 0) {
            alert('请选择要导入的JSON文件');
            return;
        }
        importData(importFile.files[0]);
    });
}

// 导出数据
function exportData() {
    // 准备导出的数据
    const exportData = {
        assetRecords: assetRecords,
        periodStats: periodStats,
        exportTime: new Date().toISOString()
    };
    
    // 转换为JSON字符串
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // 创建Blob对象
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asset-management-${new Date().toISOString().split('T')[0]}.json`;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    alert('数据导出成功！');
}

// 导入数据
function importData(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // 验证数据格式
            if (!importData.assetRecords || !importData.periodStats) {
                throw new Error('数据格式错误');
            }
            
            // 导入数据
            assetRecords = importData.assetRecords;
            periodStats = importData.periodStats;
            
            // 保存到localStorage
            saveData();
            
            // 更新界面
            updateCalculations();
            updateAssetChanges();
            updateCharts();
            updateHistoryTable(); // 更新历史记录表格
            
            alert('数据导入成功！');
        } catch (error) {
            alert('导入失败：' + error.message);
        }
    };
    
    reader.onerror = function() {
        alert('文件读取失败');
    };
    
    reader.readAsText(file);
}

// 初始化历史记录比较功能
function setupCompareFunctionality() {
    // 绑定比较按钮点击事件
    document.getElementById('compare-btn').addEventListener('click', compareRecords);
    
    // 填充历史记录选择框
    updateCompareSelects();
    
    // 初始化月度消费统计
    initMonthlyStats();
}

// 初始化月度消费统计
function initMonthlyStats() {
    const monthSelect = document.getElementById('month-select');
    if (!monthSelect) return;
    
    // 填充月份选择框（基于历史记录）
    updateMonthSelect();
    
    // 绑定月份切换事件
    monthSelect.addEventListener('change', updateMonthlyStats);
}

// 更新月份选择框
function updateMonthSelect() {
    const monthSelect = document.getElementById('month-select');
    if (!monthSelect) return;
    
    monthSelect.innerHTML = '';
    
    if (periodStats.length === 0) {
        monthSelect.innerHTML = '<option value="">暂无历史记录</option>';
        return;
    }
    
    // 收集所有月份（格式：YYYY-MM）
    const months = new Set();
    periodStats.forEach(stat => {
        const date = new Date(stat.period);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthKey);
    });
    
    // 转换为数组并倒序排列
    const sortedMonths = [...months].sort((a, b) => b.localeCompare(a));
    
    // 填充选择框
    sortedMonths.forEach(month => {
        const [year, m] = month.split('-');
        const option = document.createElement('option');
        option.value = month;
        option.textContent = `${year}年${m}月`;
        monthSelect.appendChild(option);
    });
    
    // 默认选中最近月份
    if (sortedMonths.length > 0) {
        monthSelect.value = sortedMonths[0];
    }
    
    // 显示当前月份的统计
    updateMonthlyStats();
}

// 更新月度统计显示
function updateMonthlyStats() {
    const monthSelect = document.getElementById('month-select');
    const resultEl = document.getElementById('monthly-stats-result');
    if (!monthSelect || !resultEl) return;
    
    const selectedMonth = monthSelect.value;
    if (!selectedMonth) {
        resultEl.innerHTML = '<p>暂无数据</p>';
        return;
    }
    
    // 筛选该月份的记录（按时间正序）
    const monthRecords = periodStats
        .filter(stat => {
            const date = new Date(stat.period);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            return monthKey === selectedMonth;
        })
        .sort((a, b) => new Date(a.period) - new Date(b.period));
    
    if (monthRecords.length === 0) {
        resultEl.innerHTML = '<p>该月份暂无记录</p>';
        return;
    }
    
    // 计算该月份的统计数据
    const firstRecord = monthRecords[0];
    const lastRecord = monthRecords[monthRecords.length - 1];
    const startAsset = firstRecord.asset_last;  // 月初资产（上月最后保存的）
    const endAsset = lastRecord.asset_current; // 月末资产
    
    // 该月份内所有新增收入之和
    const totalIncome = monthRecords.reduce((sum, r) => sum + r.input_income, 0);
    
    // 该月份的消费（使用实时计算函数）
    // 对该月份内的每条记录计算消费，然后求和
    let totalConsumption = 0;
    for (let i = 0; i < monthRecords.length; i++) {
        const stat = monthRecords[i];
        const prevAsset = i === 0 ? stat.asset_last : monthRecords[i - 1].asset_current;
        totalConsumption += calcConsumption(stat, prevAsset);
    }
    
    // 资产净增长
    const assetChange = endAsset - startAsset;
    
    // 构建结果HTML
    const [year, month] = selectedMonth.split('-');
    let html = `
        <div class="monthly-stats-result">
            <h3>${year}年${month}月 消费统计</h3>
            <div class="monthly-stats-item">
                <span class="label">记录次数：</span>
                <span class="value">${monthRecords.length} 次</span>
            </div>
            <div class="monthly-stats-item">
                <span class="label">月初总资产：</span>
                <span class="value">${startAsset.toFixed(2)} 元</span>
            </div>
            <div class="monthly-stats-item">
                <span class="label">月末总资产：</span>
                <span class="value">${endAsset.toFixed(2)} 元</span>
            </div>
            <div class="monthly-stats-item">
                <span class="label">资产净增长：</span>
                <span class="value" style="color: ${assetChange >= 0 ? '#27ae60' : '#e74c3c'}">
                    ${assetChange >= 0 ? '+' : ''}${assetChange.toFixed(2)} 元
                </span>
            </div>
            <div class="monthly-stats-item">
                <span class="label">新增收入合计：</span>
                <span class="value" style="color: #27ae60">+${totalIncome.toFixed(2)} 元</span>
            </div>
            <div class="monthly-stats-item">
                <span class="label">消费金额合计：</span>
                <span class="value" style="color: #e74c3c">-${totalConsumption.toFixed(2)} 元</span>
            </div>
        </div>
    `;
    
    resultEl.innerHTML = html;
}

// 填充历史记录选择框
function updateCompareSelects() {
    const fromSelect = document.getElementById('compare-from');
    const toSelect = document.getElementById('compare-to');
    
    // 清空选择框
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';
    
    // 按时间倒序排序
    const sortedStats = [...periodStats].sort((a, b) => new Date(b.period) - new Date(a.period));
    
    // 填充选择框
    sortedStats.forEach((stat, index) => {
        const date = new Date(stat.period);
        const dateStr = date.toLocaleString('zh-CN');
        
        // 创建选项
        const fromOption = document.createElement('option');
        fromOption.value = index;
        fromOption.textContent = dateStr;
        fromSelect.appendChild(fromOption);
        
        const toOption = document.createElement('option');
        toOption.value = index;
        toOption.textContent = dateStr;
        toSelect.appendChild(toOption);
    });
    
    // 默认选择最新的两条记录
    if (sortedStats.length >= 2) {
        fromSelect.value = 1; // 第二条记录
        toSelect.value = 0;   // 第一条记录
    } else if (sortedStats.length >= 1) {
        fromSelect.value = 0;
        toSelect.value = 0;
    }
}

// 比较两条历史记录
function compareRecords() {
    const fromIndex = parseInt(document.getElementById('compare-from').value);
    const toIndex = parseInt(document.getElementById('compare-to').value);
    
    // 按时间倒序排序
    const sortedStats = [...periodStats].sort((a, b) => new Date(b.period) - new Date(a.period));
    
    const fromStat = sortedStats[fromIndex];
    const toStat = sortedStats[toIndex];
    
    if (!fromStat || !toStat) {
        alert('请选择有效的历史记录');
        return;
    }
    
    const resultEl = document.getElementById('compare-result');
    
    // 计算总资产变化
    const totalAssetChange = toStat.asset_current - fromStat.asset_current;
    const totalAssetChangePercent = fromStat.asset_current > 0 ? (totalAssetChange / fromStat.asset_current) * 100 : 0;
    
    // 计算各平台资产变化
    const platforms = ['微信', '支付宝', '工资卡'];
    const platformChanges = [];
    
    platforms.forEach(platform => {
        const fromAmount = getPlatformAmount(fromStat.period, platform);
        const toAmount = getPlatformAmount(toStat.period, platform);
        const change = toAmount - fromAmount;
        const changePercent = fromAmount > 0 ? (change / fromAmount) * 100 : 0;
        
        platformChanges.push({
            name: platform,
            fromAmount: fromAmount,
            toAmount: toAmount,
            change: change,
            changePercent: changePercent
        });
    });
    
    // 生成比较结果HTML
    let resultHTML = `
        <div class="compare-result">
            <h3>比较结果</h3>
            <div class="compare-item">
                <strong>比较期间：</strong>
                ${new Date(fromStat.period).toLocaleString('zh-CN')} 到 ${new Date(toStat.period).toLocaleString('zh-CN')}
            </div>
            <div class="compare-item">
                <strong>总资产变化：</strong>
                从 ${fromStat.asset_current.toFixed(2)} 元 → 到 ${toStat.asset_current.toFixed(2)} 元 → 
                <span class="${totalAssetChange >= 0 ? 'change-positive' : 'change-negative'}">
                    ${totalAssetChange >= 0 ? '+' : ''}${totalAssetChange.toFixed(2)} 元 (${totalAssetChangePercent >= 0 ? '+' : ''}${totalAssetChangePercent.toFixed(1)}%)
                </span>
            </div>
    `;
    
    // 添加各平台变化
    platformChanges.forEach(change => {
        resultHTML += `
            <div class="compare-item">
                <strong>${change.name}变化：</strong>
                从 ${change.fromAmount.toFixed(2)} 元 → 到 ${change.toAmount.toFixed(2)} 元 → 
                <span class="${change.change >= 0 ? 'change-positive' : 'change-negative'}">
                    ${change.change >= 0 ? '+' : ''}${change.change.toFixed(2)} 元 (${change.changePercent >= 0 ? '+' : ''}${change.changePercent.toFixed(1)}%)
                </span>
            </div>
        `;
    });
    
    resultHTML += `</div>`;
    
    resultEl.innerHTML = resultHTML;
}

// 在更新历史记录表格后更新比较选择框
function updateHistoryTable() {
    const tableBody = document.querySelector('#historyTable tbody');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    // 清空表格内容
    tableBody.innerHTML = '';
    
    // 按时间倒序排序
    const sortedStats = [...periodStats].sort((a, b) => new Date(b.period) - new Date(a.period));
    
    // 计算分页
    const totalPages = Math.ceil(sortedStats.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = sortedStats.slice(startIndex, endIndex);
    
    // 填充表格数据（消费金额实时计算，对比上一条保存的资产）
    pageData.forEach((stat, index) => {
        const statIdx = startIndex + index;
        const prevStat = statIdx + 1 < sortedStats.length ? sortedStats[statIdx + 1] : null;
        const consumption = calcConsumption(stat, prevStat ? prevStat.asset_current : 0);
        
        const row = document.createElement('tr');
        const date = new Date(stat.period);
        const dateStr = date.toLocaleString('zh-CN');
        
        // 计算各平台金额
        const wechatAmount = getPlatformAmount(stat.period, '微信');
        const alipayAmount = getPlatformAmount(stat.period, '支付宝');
        const salaryCardAmount = getPlatformAmount(stat.period, '工资卡');
        
        // 获取元素在原始periodStats数组中的索引
        const originalIndex = periodStats.indexOf(stat);
        
        row.innerHTML = `
            <td>${dateStr}</td>
            <td>${stat.asset_current.toFixed(2)}</td>
            <td>${wechatAmount.toFixed(2)}</td>
            <td>${alipayAmount.toFixed(2)}</td>
            <td>${salaryCardAmount.toFixed(2)}</td>
            <td>${stat.input_income.toFixed(2)}</td>
            <td>${consumption.toFixed(2)}</td>
            <td>${stat.note || '-'}</td>
            <td>
                <button class="btn-expand" data-index="${originalIndex}">展开</button>
                <button class="btn-delete" data-index="${originalIndex}">删除</button>
            </td>
        `;
        
        tableBody.appendChild(row);
        
        // 创建展开的详细信息行
        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.style.display = 'none';
        detailRow.setAttribute('data-index', originalIndex);
        
        // 生成详细资产构成HTML
        let detailHTML = '<td colspan="9"><div class="asset-details">';
        
        // 显示备注信息
        if (stat.note) {
            detailHTML += `<div class="asset-note"><strong>备注：</strong>${stat.note}</div>`;
        }
        
        if (stat.asset_details && stat.asset_details.length > 0) {
            // 按平台分组显示
            const platforms = {};
            stat.asset_details.forEach(asset => {
                if (!platforms[asset.platform]) {
                    platforms[asset.platform] = [];
                }
                platforms[asset.platform].push(asset);
            });
            
            Object.keys(platforms).forEach(platform => {
                detailHTML += `<h4>${platform}</h4>`;
                detailHTML += '<div class="platform-details">';
                
                platforms[platform].forEach(asset => {
                    const category = asset.sub_category ? `${asset.category} - ${asset.sub_category}` : asset.category;
                    detailHTML += `<div class="asset-item-detail">${category}：${asset.amount.toFixed(2)} 元</div>`;
                });
                
                detailHTML += '</div>';
            });
        } else {
            detailHTML += '<p>暂无详细资产构成信息</p>';
        }
        
        detailHTML += '</div></td>';
        detailRow.innerHTML = detailHTML;
        tableBody.appendChild(detailRow);
    });
    
    // 绑定展开/收起按钮点击事件
    const expandBtns = document.querySelectorAll('.btn-expand');
    expandBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            const detailRow = document.querySelector(`.detail-row[data-index="${index}"]`);
            
            if (detailRow.style.display === 'none') {
                detailRow.style.display = 'table-row';
                this.textContent = '收起';
            } else {
                detailRow.style.display = 'none';
                this.textContent = '展开';
            }
        });
    });
    
    // 更新分页信息
    pageInfo.textContent = `第 ${currentPage} 页，共 ${totalPages} 页`;
    
    // 更新分页按钮状态
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // 绑定删除按钮点击事件
    const deleteBtns = document.querySelectorAll('.btn-delete');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            deleteRecord(index);
        });
    });
    
    // 更新比较选择框
    updateCompareSelects();
    updateMonthSelect();
}

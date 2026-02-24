// 全局变量
let assetRecords = []; // 资产记录数组
let periodStats = [];  // 期间统计数组
let pieChart = null;   // 饼图实例
let lineChart = null;  // 折线图实例
let currentPage = 1;   // 当前页码
const pageSize = 10;   // 每页显示记录数

// 页面加载完成后初始化
window.onload = function() {
    // 等待Firebase初始化
    setTimeout(() => {
        // 加载数据
        loadData();
    }, 1000);
    
    // 其他初始化操作
    setupFinanceTotalListener();
    setupHistoryTable();
    setupDataManagement();
    
    // 绑定事件监听器
    document.getElementById('saveBtn').addEventListener('click', saveRecord);
    document.getElementById('periodSelect').addEventListener('change', toggleCustomDate);
    
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

// 切换自定义日期显示
function toggleCustomDate() {
    const periodSelect = document.getElementById('periodSelect');
    const customDate = document.getElementById('customDate');
    
    if (periodSelect.value === 'custom') {
        customDate.style.display = 'inline-block';
    } else {
        customDate.style.display = 'none';
    }
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

// 从Firebase加载数据
function loadData() {
    if (!window.firebase) {
        console.error('Firebase not initialized');
        return;
    }
    
    const { database, ref, get } = window.firebase;
    
    // 加载资产记录
    const assetRecordsRef = ref(database, 'assetRecords');
    get(assetRecordsRef).then((snapshot) => {
        if (snapshot.exists()) {
            assetRecords = snapshot.val();
        } else {
            assetRecords = [];
        }
        
        // 加载期间统计
        const periodStatsRef = ref(database, 'periodStats');
        get(periodStatsRef).then((snapshot) => {
            if (snapshot.exists()) {
                periodStats = snapshot.val();
            } else {
                periodStats = [];
            }
            
            // 数据加载完成后更新界面
            fillLatestAssetData();
            updateCalculations();
            updateAssetChanges();
            updateCharts();
            updateHistoryTable();
        }).catch((error) => {
            console.error('Error loading periodStats:', error);
            periodStats = [];
            updateCalculations();
        });
    }).catch((error) => {
        console.error('Error loading assetRecords:', error);
        assetRecords = [];
        periodStats = [];
        updateCalculations();
    });
}

// 保存数据到Firebase
function saveData() {
    if (!window.firebase) {
        console.error('Firebase not initialized');
        return;
    }
    
    const { database, ref, set } = window.firebase;
    
    // 保存资产记录
    const assetRecordsRef = ref(database, 'assetRecords');
    set(assetRecordsRef, assetRecords).catch((error) => {
        console.error('Error saving assetRecords:', error);
    });
    
    // 保存期间统计
    const periodStatsRef = ref(database, 'periodStats');
    set(periodStatsRef, periodStats).catch((error) => {
        console.error('Error saving periodStats:', error);
    });
}



// 更新计算结果
function updateCalculations() {
    // 计算当前总资产
    let assetCurrent = 0;
    const assetInputs = document.querySelectorAll('.asset-input');
    
    // 标记是否已处理理财通总额
    let processedFinanceTotal = false;
    
    assetInputs.forEach(input => {
        const platform = input.dataset.platform;
        const category = input.dataset.category;
        const subcategory = input.dataset.subcategory;
        
        // 如果是理财通明细记录，跳过
        if (platform === '微信' && category === '理财通' && subcategory) {
            return;
        }
        
        // 如果是理财通总额，标记已处理
        if (platform === '微信' && category === '理财通' && !subcategory) {
            processedFinanceTotal = true;
        }
        
        // 跳过微信总额和支付宝总额（如果存在）
        if ((platform === '微信' && category === '微信总额') || 
            (platform === '支付宝' && category === '支付宝总额')) {
            return;
        }
        
        // 计算金额
        assetCurrent += parseFloat(input.value) || 0;
    });
    
    // 获取上次总资产
    let assetLast = 0;
    if (periodStats.length > 0) {
        const lastStat = periodStats[periodStats.length - 1];
        assetLast = lastStat.asset_current;
    }
    
    // 计算资产净增长和消费
    const assetDelta = assetCurrent - assetLast;
    const inputIncome = parseFloat(document.getElementById('inputIncome').value) || 0;
    const consumption = inputIncome - assetDelta;
    
    // 更新界面显示
    document.getElementById('assetLast').textContent = assetLast.toFixed(2);
    document.getElementById('assetCurrent').textContent = assetCurrent.toFixed(2);
    document.getElementById('assetDelta').textContent = assetDelta.toFixed(2);
    document.getElementById('consumption').textContent = consumption.toFixed(2);
    
    // 更新颜色
    updateResultColors(assetDelta, consumption);
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

// 更新历史记录表格
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
    
    // 填充表格数据
    pageData.forEach((stat, index) => {
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
            <td>${stat.consumption.toFixed(2)}</td>
            <td><button class="btn-delete" data-index="${originalIndex}">删除</button></td>
        `;
        
        tableBody.appendChild(row);
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
        
        alert('记录删除成功！');
    }
}

// 填充最新资产数据
function fillLatestAssetData() {
    if (assetRecords.length === 0) {
        return; // 没有资产记录，直接返回
    }
    
    // 按时间分组，获取所有唯一的记录时间
    const uniqueTimes = [...new Set(assetRecords.map(record => record.record_time))];
    
    // 按时间倒序排序，获取最新的记录时间
    uniqueTimes.sort((a, b) => new Date(b) - new Date(a));
    const latestTime = uniqueTimes[0];
    
    // 获取最新时间点的所有资产记录
    const latestRecords = assetRecords.filter(record => record.record_time === latestTime);
    
    // 遍历所有资产输入框
    const assetInputs = document.querySelectorAll('.asset-input');
    assetInputs.forEach(input => {
        const platform = input.dataset.platform;
        const category = input.dataset.category;
        const subcategory = input.dataset.subcategory;
        
        // 查找匹配的资产记录
        const matchedRecord = latestRecords.find(record => {
            return record.platform === platform && 
                   record.category === category && 
                   record.sub_category === subcategory;
        });
        
        // 如果找到匹配的记录，填充金额
        if (matchedRecord) {
            input.value = matchedRecord.amount.toFixed(2);
        }
    });
    
    // 更新计算
    updateWechatFinanceDetail();
}

// 保存记录后更新历史记录下拉列表
function saveRecord() {
    const inputIncome = parseFloat(document.getElementById('inputIncome').value) || 0;
    
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
        
        if (amount > 0) {
            currentAssets.push({
                platform: input.dataset.platform,
                category: input.dataset.category,
                sub_category: input.dataset.subcategory || null,
                amount: amount,
                record_time: new Date().toISOString()
            });
        }
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
    
    // 计算资产净增长和消费
    const assetDelta = assetCurrent - assetLast;
    const consumption = inputIncome - assetDelta;
    
    // 保存资产记录
    assetRecords = [...assetRecords, ...currentAssets];
    
    // 保存期间统计
    periodStats.push({
        input_income: inputIncome,
        asset_last: assetLast,
        asset_current: assetCurrent,
        asset_delta: assetDelta,
        consumption: consumption,
        period: new Date().toISOString()
    });
    
    // 保存到localStorage
    saveData();
    
    // 更新界面
    updateCalculations();
    updateAssetChanges();
    updateCharts();
    updateHistoryTable(); // 更新历史记录表格
    
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
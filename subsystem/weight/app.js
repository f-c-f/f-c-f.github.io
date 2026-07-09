// 全局变量
let weightRecords = [];
let goalWeight = null;  // 内部统一用公斤存储
let weightChart = null;
let weightUnit = '斤';  // 斤 或 公斤，默认斤

// 1 公斤 = 2 斤
const KG_TO_JIN = 2;

// 获取当前单位，公斤转显示值
function kgToDisplay(kg) {
    return weightUnit === '斤' ? kg * KG_TO_JIN : kg;
}
// 显示值转公斤存储
function displayToKg(displayVal) {
    return weightUnit === '斤' ? displayVal / KG_TO_JIN : displayVal;
}

// 将 Date 格式化为 datetime-local 所需的 YYYY-MM-DDTHH:MM（使用本地时区，24小时制）
function formatLocalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');   // getHours() 返回 0-23
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 初始化日期时间选择器（24小时制）
function initDateTimePickers() {
    const hourSelect = document.getElementById('weight-hour');
    const minuteSelect = document.getElementById('weight-minute');
    // 填充 00-23 小时
    for (let h = 0; h < 24; h++) {
        const opt = document.createElement('option');
        opt.value = String(h).padStart(2, '0');
        opt.textContent = String(h).padStart(2, '0');
        hourSelect.appendChild(opt);
    }
    // 填充 00-59 分钟
    for (let m = 0; m < 60; m++) {
        const opt = document.createElement('option');
        opt.value = String(m).padStart(2, '0');
        opt.textContent = String(m).padStart(2, '0');
        minuteSelect.appendChild(opt);
    }
    // 设置为当前时间
    const now = new Date();
    document.getElementById('weight-date').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    hourSelect.value = String(now.getHours()).padStart(2, '0');
    minuteSelect.value = String(now.getMinutes()).padStart(2, '0');
}

// 更新页面上所有单位标签
function updateUnitLabels() {
    ['goal-unit', 'current-goal-unit', 'weight-input-unit', 'table-unit', 'change-unit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = weightUnit;
    });
}

// 保存单位到 Firebase
function saveWeightUnitToFirebase() {
    if (window.firebase) {
        const db = window.firebase.database;
        const userRef = window.firebase.ref(db, 'users/user1');
        window.firebase.get(userRef).then((snapshot) => {
            const userData = snapshot.exists() ? snapshot.val() : {};
            userData.weightUnit = weightUnit;
            window.firebase.set(userRef, { ...userData, weightUnit }).catch(console.error);
        }).catch(console.error);
    }
}

// 格式化为显示的日期时间字符串（24小时制：YYYY/MM/DD HH:mm）
function formatDisplayDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

// 页面加载完成后初始化
window.onload = function() {
    // 检查登录状态
    if (!checkLoginStatus()) {
        window.location.href = '../login.html?next=weight/';
        return;
    }
    
    // 初始化应用
    initApp();
};

// 检查登录状态
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
}

// 初始化应用
function initApp() {
    // 绑定退出登录事件
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            logout();
        });
    }
    
    // 绑定单位切换事件
    document.querySelectorAll('input[name="weight-unit"]').forEach(radio => {
        radio.addEventListener('change', function() {
            weightUnit = this.value;
            localStorage.setItem('weightUnit', weightUnit);
            saveWeightUnitToFirebase();
            updateUnitLabels();
            updateWeightTable();
            updateChart();
            // 更新目标体重显示
            if (goalWeight !== null) {
                document.getElementById('current-goal').textContent = kgToDisplay(goalWeight).toFixed(1);
                document.getElementById('goal-weight').value = kgToDisplay(goalWeight);
            }
        });
    });
    
    // 加载单位偏好
    const savedUnit = localStorage.getItem('weightUnit');
    if (savedUnit === '公斤' || savedUnit === '斤') {
        weightUnit = savedUnit;
        document.querySelector(`input[name="weight-unit"][value="${weightUnit}"]`).checked = true;
    }
    updateUnitLabels();
    
    // 绑定保存目标体重事件
    document.getElementById('save-goal').addEventListener('click', saveGoalWeight);
    
    // 绑定保存体重记录事件
    document.getElementById('save-weight').addEventListener('click', saveWeightRecord);
    
    // 初始化日期时间选择器（24小时制）
    initDateTimePickers();
    
    // 加载数据
    loadData();
    
    // 初始化图表
    initChart();
}

// 退出登录
function logout() {
    if (window.confirm('确定要退出登录吗？')) {
        // 清除登录状态
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        // 跳转到登录页面
        setTimeout(function() {
            window.location.href = '../login.html';
        }, 100);
    }
}

// 加载数据（本地优先秒开，云端后台同步）
function loadData() {
    // 1. 先从本地存储加载，立即渲染
    loadFromLocalStorage();
    updateWeightTable();
    updateChart();
    
    // 2. 后台从 Firebase 拉取并同步
    if (!window.firebase) return;
    
    const db = window.firebase.database;
    const userRef = window.firebase.ref(db, 'users/user1');
    
    window.firebase.get(userRef).then((snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
                
                // 加载单位偏好
                if (userData.weightUnit === '公斤' || userData.weightUnit === '斤') {
                    weightUnit = userData.weightUnit;
                    const radio = document.querySelector(`input[name="weight-unit"][value="${weightUnit}"]`);
                    if (radio) radio.checked = true;
                    updateUnitLabels();
                }
                // 加载目标体重（存储为公斤）
                if (userData.weightGoal) {
                    goalWeight = parseFloat(userData.weightGoal);
                    document.getElementById('current-goal').textContent = kgToDisplay(goalWeight).toFixed(1);
                    document.getElementById('goal-weight').value = kgToDisplay(goalWeight);
                    // 同时更新本地存储
                    localStorage.setItem('goalWeight', goalWeight.toString());
                }
                
                // 加载体重记录
                if (userData.weightRecords) {
                    weightRecords = userData.weightRecords;
                    // 按日期排序
                    weightRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
                    // 同时更新本地存储
                    localStorage.setItem('weightRecords', JSON.stringify(weightRecords));
                }
            }
            updateWeightTable();
            updateChart();
        }).catch((error) => {
            console.error('Error loading data from Firebase:', error);
        });
}

// 从本地存储加载数据
function loadFromLocalStorage() {
    const savedUnit = localStorage.getItem('weightUnit');
    if (savedUnit === '公斤' || savedUnit === '斤') {
        weightUnit = savedUnit;
        const radio = document.querySelector(`input[name="weight-unit"][value="${weightUnit}"]`);
        if (radio) radio.checked = true;
        updateUnitLabels();
    }
    // 加载目标体重（存储为公斤）
    const savedGoal = localStorage.getItem('goalWeight');
    if (savedGoal) {
        goalWeight = parseFloat(savedGoal);
        document.getElementById('current-goal').textContent = kgToDisplay(goalWeight).toFixed(1);
        document.getElementById('goal-weight').value = kgToDisplay(goalWeight);
    }
    
    // 加载体重记录
    const savedRecords = localStorage.getItem('weightRecords');
    if (savedRecords) {
        weightRecords = JSON.parse(savedRecords);
        // 按日期排序
        weightRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
}

// 保存数据
function saveData() {
    // 保存到本地存储
    if (goalWeight) {
        localStorage.setItem('goalWeight', goalWeight.toString());
    }
    localStorage.setItem('weightRecords', JSON.stringify(weightRecords));
    
    // 保存到Firebase
    if (window.firebase) {
        const db = window.firebase.database;
        const userRef = window.firebase.ref(db, 'users/user1');
        
        const userData = {
            weightGoal: goalWeight,
            weightRecords: weightRecords,
            weightUnit: weightUnit
        };
        
        window.firebase.set(userRef, userData).then(() => {
            console.log('Data saved to Firebase successfully');
        }).catch((error) => {
            console.error('Error saving data to Firebase:', error);
        });
    }
}

// 保存目标体重（用户输入为当前单位，转为公斤存储）
function saveGoalWeight() {
    const goalInput = document.getElementById('goal-weight');
    const goalDisplay = parseFloat(goalInput.value);
    
    if (isNaN(goalDisplay) || goalDisplay <= 0) {
        alert('请输入有效的目标体重');
        return;
    }
    
    goalWeight = displayToKg(goalDisplay);
    document.getElementById('current-goal').textContent = kgToDisplay(goalWeight).toFixed(1);
    saveData();
    alert('目标体重保存成功！');
}

// 保存体重记录
function saveWeightRecord() {
    const dateInput = document.getElementById('weight-date');
    const hourSelect = document.getElementById('weight-hour');
    const minuteSelect = document.getElementById('weight-minute');
    const weightInput = document.getElementById('weight-value');
    const noteInput = document.getElementById('weight-note');
    
    const date = dateInput.value;
    const time = `${hourSelect.value}:${minuteSelect.value}`;
    const dateTime = date ? `${date}T${time}` : '';
    const weightDisplay = parseFloat(weightInput.value);
    const note = noteInput.value.trim();
    
    if (!date) {
        alert('请选择日期');
        return;
    }
    
    if (isNaN(weightDisplay) || weightDisplay <= 0) {
        alert('请输入有效的体重');
        return;
    }
    
    const weight = displayToKg(weightDisplay);  // 转为公斤存储
    
    // 检查是否已存在该日期时间的记录
    const existingIndex = weightRecords.findIndex(record => record.date === dateTime);
    
    if (existingIndex !== -1) {
        // 更新现有记录
        weightRecords[existingIndex] = {
            id: weightRecords[existingIndex].id,
            date: dateTime,
            weight: weight,
            note: note
        };
    } else {
        // 添加新记录
        weightRecords.push({
            id: Date.now().toString(),
            date: dateTime,
            weight: weight,
            note: note
        });
    }
    
    // 按日期排序
    weightRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 保存数据
    saveData();
    
    // 更新表格和图表
    updateWeightTable();
    updateChart();
    
    // 清空表单，重置为当前时间（24小时制）
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    document.getElementById('weight-hour').value = String(now.getHours()).padStart(2, '0');
    document.getElementById('weight-minute').value = String(now.getMinutes()).padStart(2, '0');
    weightInput.value = '';
    noteInput.value = '';
    
    alert('体重记录保存成功！');
}

// 更新体重表格
function updateWeightTable() {
    const tableBody = document.querySelector('#weightTable tbody');
    
    if (weightRecords.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无体重记录</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    weightRecords.forEach((record, index) => {
        const row = document.createElement('tr');
        
        // 计算体重变化（record.weight 为公斤，转换为当前单位显示）
        let changeKg = 0;
        if (index > 0) {
            changeKg = record.weight - weightRecords[index - 1].weight;
        }
        const changeDisplay = kgToDisplay(Math.abs(changeKg)) * (changeKg >= 0 ? 1 : -1);
        const changeClass = changeKg > 0 ? 'change-positive' : changeKg < 0 ? 'change-negative' : '';
        const changeText = changeKg > 0 ? `+${changeDisplay.toFixed(1)}` : changeDisplay.toFixed(1);
        
        // 格式化日期时间显示（24小时制）
        const dateTime = new Date(record.date);
        const formattedDateTime = formatDisplayDateTime(dateTime);
        
        const weightDisplay = kgToDisplay(record.weight);
        row.innerHTML = `
            <td>${formattedDateTime}</td>
            <td>${weightDisplay.toFixed(1)}</td>
            <td class="${changeClass}">${changeText}</td>
            <td>${record.note || '-'}</td>
            <td>
                <button class="delete-btn" onclick="deleteWeightRecord('${record.id}')">删除</button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// 删除体重记录
function deleteWeightRecord(id) {
    if (confirm('确定要删除这条记录吗？')) {
        weightRecords = weightRecords.filter(record => record.id !== id);
        saveData();
        updateWeightTable();
        updateChart();
        alert('记录删除成功！');
    }
}

// 初始化图表
function initChart() {
    const ctx = document.getElementById('weightChart').getContext('2d');
    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: `体重 (${weightUnit})`,
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: `体重 (${weightUnit})`
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '体重变化趋势'
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });
}

// 更新图表
function updateChart() {
    if (!weightChart) return;
    
    weightChart.options.scales.y.title.text = `体重 (${weightUnit})`;
    const labels = weightRecords.map(record => {
        const dateTime = new Date(record.date);
        return formatDisplayDateTime(dateTime);  // 24小时制
    });
    const data = weightRecords.map(record => kgToDisplay(record.weight));
    
    weightChart.data.labels = labels;
    weightChart.data.datasets[0].label = `体重 (${weightUnit})`;
    weightChart.data.datasets[0].data = data;
    
    // 如果有目标体重，添加目标体重线
    if (goalWeight) {
        const goalDisplay = kgToDisplay(goalWeight);
        // 检查是否已有目标体重数据集
        if (weightChart.data.datasets.length === 1) {
            weightChart.data.datasets.push({
                label: `目标体重 (${weightUnit})`,
                data: Array(labels.length).fill(goalDisplay),
                borderColor: '#e74c3c',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                pointRadius: 0
            });
        } else {
            weightChart.data.datasets[1].label = `目标体重 (${weightUnit})`;
            weightChart.data.datasets[1].data = Array(labels.length).fill(goalDisplay);
        }
    } else {
        // 如果没有目标体重，移除目标体重线
        if (weightChart.data.datasets.length > 1) {
            weightChart.data.datasets.pop();
        }
    }
    
    weightChart.update();
}

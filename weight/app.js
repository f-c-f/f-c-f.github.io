// 全局变量
let weightRecords = [];
let goalWeight = null;
let weightChart = null;

// 页面加载完成后初始化
window.onload = function() {
    // 检查登录状态
    if (!checkLoginStatus()) {
        window.location.href = '../login.html';
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
    
    // 绑定保存目标体重事件
    document.getElementById('save-goal').addEventListener('click', saveGoalWeight);
    
    // 绑定保存体重记录事件
    document.getElementById('save-weight').addEventListener('click', saveWeightRecord);
    
    // 设置默认日期为今天
    document.getElementById('weight-date').valueAsDate = new Date();
    
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

// 加载数据
function loadData() {
    // 先从Firebase加载数据
    if (window.firebase) {
        const db = window.firebase.database;
        const userRef = window.firebase.ref(db, 'users/user1');
        
        window.firebase.get(userRef).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                
                // 加载目标体重
                if (userData.weightGoal) {
                    goalWeight = parseFloat(userData.weightGoal);
                    document.getElementById('current-goal').textContent = goalWeight;
                    document.getElementById('goal-weight').value = goalWeight;
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
            } else {
                // 如果Firebase没有数据，从本地存储加载
                loadFromLocalStorage();
            }
            
            // 更新表格和图表
            updateWeightTable();
            updateChart();
        }).catch((error) => {
            console.error('Error loading data from Firebase:', error);
            // 加载失败时从本地存储加载
            loadFromLocalStorage();
            updateWeightTable();
            updateChart();
        });
    } else {
        // 如果Firebase不可用，从本地存储加载
        loadFromLocalStorage();
        updateWeightTable();
        updateChart();
    }
}

// 从本地存储加载数据
function loadFromLocalStorage() {
    // 加载目标体重
    const savedGoal = localStorage.getItem('goalWeight');
    if (savedGoal) {
        goalWeight = parseFloat(savedGoal);
        document.getElementById('current-goal').textContent = goalWeight;
        document.getElementById('goal-weight').value = goalWeight;
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
            weightRecords: weightRecords
        };
        
        window.firebase.set(userRef, userData).then(() => {
            console.log('Data saved to Firebase successfully');
        }).catch((error) => {
            console.error('Error saving data to Firebase:', error);
        });
    }
}

// 保存目标体重
function saveGoalWeight() {
    const goalInput = document.getElementById('goal-weight');
    const goalValue = parseFloat(goalInput.value);
    
    if (isNaN(goalValue) || goalValue <= 0) {
        alert('请输入有效的目标体重');
        return;
    }
    
    goalWeight = goalValue;
    document.getElementById('current-goal').textContent = goalWeight;
    saveData();
    alert('目标体重保存成功！');
}

// 保存体重记录
function saveWeightRecord() {
    const dateInput = document.getElementById('weight-date');
    const weightInput = document.getElementById('weight-value');
    const noteInput = document.getElementById('weight-note');
    
    const date = dateInput.value;
    const weight = parseFloat(weightInput.value);
    const note = noteInput.value.trim();
    
    if (!date) {
        alert('请选择日期');
        return;
    }
    
    if (isNaN(weight) || weight <= 0) {
        alert('请输入有效的体重');
        return;
    }
    
    // 检查是否已存在该日期的记录
    const existingIndex = weightRecords.findIndex(record => record.date === date);
    
    if (existingIndex !== -1) {
        // 更新现有记录
        weightRecords[existingIndex] = {
            id: weightRecords[existingIndex].id,
            date: date,
            weight: weight,
            note: note
        };
    } else {
        // 添加新记录
        weightRecords.push({
            id: Date.now().toString(),
            date: date,
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
    
    // 清空表单
    dateInput.valueAsDate = new Date();
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
        
        // 计算体重变化
        let change = 0;
        if (index > 0) {
            change = record.weight - weightRecords[index - 1].weight;
        }
        
        const changeClass = change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : '';
        const changeText = change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
        
        row.innerHTML = `
            <td>${record.date}</td>
            <td>${record.weight.toFixed(1)}</td>
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
                    label: '体重 (kg)',
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
                        text: '体重 (kg)'
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
    
    const labels = weightRecords.map(record => record.date);
    const data = weightRecords.map(record => record.weight);
    
    weightChart.data.labels = labels;
    weightChart.data.datasets[0].data = data;
    
    // 如果有目标体重，添加目标体重线
    if (goalWeight) {
        // 检查是否已有目标体重数据集
        if (weightChart.data.datasets.length === 1) {
            weightChart.data.datasets.push({
                label: '目标体重 (kg)',
                data: Array(labels.length).fill(goalWeight),
                borderColor: '#e74c3c',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                pointRadius: 0
            });
        } else {
            weightChart.data.datasets[1].data = Array(labels.length).fill(goalWeight);
        }
    } else {
        // 如果没有目标体重，移除目标体重线
        if (weightChart.data.datasets.length > 1) {
            weightChart.data.datasets.pop();
        }
    }
    
    weightChart.update();
}
// 全局变量
let diaries = [];
let currentEditIndex = -1;

// 页面加载完成后初始化
window.onload = function() {
    // 检查登录状态和会话超时
    if (!checkLoginStatus()) {
        // 未登录或会话超时，跳转到登录页面
        window.location.href = '../login.html';
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
}

// 初始化应用
function initApp() {
    // 加载日记数据
    loadDiaries();
    
    // 绑定事件监听器
    document.getElementById('save-diary').addEventListener('click', saveDiary);
    document.getElementById('update-diary').addEventListener('click', updateDiary);
    document.getElementById('cancel-edit').addEventListener('click', closeEditModal);
    document.querySelector('.close').addEventListener('click', closeEditModal);
    
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
    
    // 点击模态框外部关闭
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('edit-modal');
        if (e.target === modal) {
            closeEditModal();
        }
    });
    
    // 设置默认日期为今天
    document.getElementById('diary-date').valueAsDate = new Date();
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
            window.location.href = '../login.html';
        }, 100);
    } else {
        console.log('用户点击了取消，不执行退出登录');
        // 什么都不做，保持当前状态
    }
};

// 加载日记数据
function loadDiaries() {
    const savedDiaries = localStorage.getItem('diaries');
    if (savedDiaries) {
        diaries = JSON.parse(savedDiaries);
        // 按日期降序排序
        diaries.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    renderDiaryList();
}

// 保存日记数据到本地存储
function saveDiaries() {
    localStorage.setItem('diaries', JSON.stringify(diaries));
}

// 保存新日记
function saveDiary() {
    const title = document.getElementById('diary-title').value.trim();
    const content = document.getElementById('diary-content').value.trim();
    const date = document.getElementById('diary-date').value;
    
    if (!title || !content || !date) {
        alert('请填写完整的日记信息');
        return;
    }
    
    const newDiary = {
        id: Date.now().toString(),
        title: title,
        content: content,
        date: date
    };
    
    diaries.unshift(newDiary); // 添加到数组开头
    saveDiaries();
    renderDiaryList();
    
    // 清空输入表单
    document.getElementById('diary-title').value = '';
    document.getElementById('diary-content').value = '';
    document.getElementById('diary-date').valueAsDate = new Date();
    
    alert('日记保存成功！');
}

// 渲染日记列表
function renderDiaryList() {
    const diaryEntries = document.getElementById('diary-entries');
    
    if (diaries.length === 0) {
        diaryEntries.innerHTML = '<div class="empty-state">暂无日记，开始写第一篇吧！</div>';
        return;
    }
    
    diaryEntries.innerHTML = '';
    
    diaries.forEach((diary, index) => {
        const diaryEl = document.createElement('div');
        diaryEl.className = 'diary-entry';
        
        // 格式化日期显示
        const formattedDate = new Date(diary.date).toLocaleDateString('zh-CN');
        
        diaryEl.innerHTML = `
            <h4>${diary.title}</h4>
            <div class="date">${formattedDate}</div>
            <div class="content">${diary.content}</div>
            <div class="actions">
                <button class="edit-btn" onclick="editDiary(${index})">编辑</button>
                <button class="delete-btn" onclick="deleteDiary(${index})">删除</button>
            </div>
        `;
        
        diaryEntries.appendChild(diaryEl);
    });
}

// 编辑日记
function editDiary(index) {
    currentEditIndex = index;
    const diary = diaries[index];
    
    // 填充编辑表单
    document.getElementById('edit-title').value = diary.title;
    document.getElementById('edit-content').value = diary.content;
    document.getElementById('edit-date').value = diary.date;
    
    // 显示编辑模态框
    document.getElementById('edit-modal').style.display = 'block';
}

// 更新日记
function updateDiary() {
    const title = document.getElementById('edit-title').value.trim();
    const content = document.getElementById('edit-content').value.trim();
    const date = document.getElementById('edit-date').value;
    
    if (!title || !content || !date) {
        alert('请填写完整的日记信息');
        return;
    }
    
    diaries[currentEditIndex] = {
        ...diaries[currentEditIndex],
        title: title,
        content: content,
        date: date
    };
    
    // 重新排序
    diaries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    saveDiaries();
    renderDiaryList();
    closeEditModal();
    
    alert('日记更新成功！');
}

// 删除日记
function deleteDiary(index) {
    if (confirm('确定要删除这篇日记吗？')) {
        diaries.splice(index, 1);
        saveDiaries();
        renderDiaryList();
        alert('日记删除成功！');
    }
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    currentEditIndex = -1;
}

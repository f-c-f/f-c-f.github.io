// 全局变量
let diaries = [];
let currentEditIndex = -1;
let currentFilterDate = null;

// 页面加载完成后初始化
window.onload = async function() {
    // 检查登录状态和会话超时
    if (!checkLoginStatus()) {
        // 未登录或会话超时，跳转到登录页面
        window.location.href = '../login.html';
        return;
    }
    
    // 初始化应用
    await initApp();
    
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

// 加载万年历信息
async function loadCalendar() {
    const calendarContent = document.getElementById('calendar-content');
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1; // 月份是 1-12
    const day = currentDate.getDate();
    const dateStr = `${year}${month.toString().padStart(2, '0')}${day.toString().padStart(2, '0')}`;
    
    // 随机从 1-10 中选取 font
    const font = Math.floor(Math.random() * 10) + 1;
    console.log('随机选择的 font:', font);
    
    try {
        // 使用用户提供的 API 获取万年历图片
        const apiKey = 'ER3492DjqHxvWSN9VKxJf13NMR';
        const imageUrl = `https://api.shwgij.com/api/today/today?key=${apiKey}&date=${dateStr}&font=${font}&bg=`;
        console.log('万年历图片 URL:', imageUrl);
        
        // 清空日历内容
        calendarContent.innerHTML = '';
        
        // 创建图片元素
        const calendarImage = document.createElement('img');
        calendarImage.src = imageUrl;
        calendarImage.alt = '万年历';
        calendarImage.style.maxWidth = '100%';
        calendarImage.style.height = 'auto';
        calendarImage.style.borderRadius = '8px';
        
        // 添加图片到日历内容区域
        calendarContent.appendChild(calendarImage);
    } catch (error) {
        console.error('API 请求出错:', error);
        calendarContent.innerHTML = '<div class="empty-state">获取万年历信息失败</div>';
    }
}

// 初始化应用
async function initApp() {
    // 等待Firebase初始化
    setTimeout(() => {
        // 加载日记数据
        loadDiaries();
    }, 1000);
    
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
    const diaryDate = document.getElementById('diary-date');
    diaryDate.valueAsDate = new Date();
    
    // 加载万年历信息
    await loadCalendar();
    
    // 自动生成默认标题
    await updateDefaultTitle();
    
    // 监听日期变化，更新默认标题
    diaryDate.addEventListener('change', async function() {
        await updateDefaultTitle();
    });
    
    // 监听标题输入，当用户开始输入时不再自动填充
    const diaryTitle = document.getElementById('diary-title');
    diaryTitle.addEventListener('input', function() {
        this.dataset.userInput = 'true';
    });
    
    // 绑定日期过滤按钮点击事件
    document.getElementById('filter-btn').addEventListener('click', filterDiariesByDate);
    document.getElementById('reset-btn').addEventListener('click', resetFilter);
};

// 获取农历日期
function getLunarDate(date) {
    // 2026年的农历月份和日期（手动设置）
    const lunar2026 = {
        '01-01': '冬月廿二',
        '01-02': '冬月廿三',
        '01-03': '冬月廿四',
        '01-04': '冬月廿五',
        '01-05': '冬月廿六',
        '01-06': '冬月廿七',
        '01-07': '冬月廿八',
        '01-08': '冬月廿九',
        '01-09': '冬月三十',
        '01-10': '腊月初一',
        '01-11': '腊月初二',
        '01-12': '腊月初三',
        '01-13': '腊月初四',
        '01-14': '腊月初五',
        '01-15': '腊月初六',
        '01-16': '腊月初七',
        '01-17': '腊月初八',
        '01-18': '腊月初九',
        '01-19': '腊月初十',
        '01-20': '腊月十一',
        '01-21': '腊月十二',
        '01-22': '腊月十三',
        '01-23': '腊月十四',
        '01-24': '腊月十五',
        '01-25': '腊月十六',
        '01-26': '腊月十七',
        '01-27': '腊月十八',
        '01-28': '腊月十九',
        '01-29': '腊月二十',
        '01-30': '腊月廿一',
        '01-31': '腊月廿二',
        '02-01': '腊月廿三',
        '02-02': '腊月廿四',
        '02-03': '腊月廿五',
        '02-04': '腊月廿六',
        '02-05': '腊月廿七',
        '02-06': '腊月廿八',
        '02-07': '腊月廿九',
        '02-08': '腊月三十',
        '02-09': '正月初一',
        '02-10': '正月初二',
        '02-11': '正月初三',
        '02-12': '正月初四',
        '02-13': '正月初五',
        '02-14': '正月初六',
        '02-15': '正月初七',
        '02-16': '正月初八',
        '02-17': '正月初九',
        '02-18': '正月初十',
        '02-19': '正月十一',
        '02-20': '正月十二',
        '02-21': '正月十三',
        '02-22': '正月十四',
        '02-23': '正月十五',
        '02-24': '正月十六',
        '02-25': '正月十七',
        '02-26': '正月十八',
        '02-27': '正月十九',
        '02-28': '正月二十',
        '02-29': '正月廿一',
        '03-01': '正月廿二',
        '03-02': '正月廿三',
        '03-03': '正月廿四',
        '03-04': '正月廿五',
        '03-05': '正月廿六',
        '03-06': '正月廿七',
        '03-07': '正月廿八',
        '03-08': '正月廿九',
        '03-09': '正月三十',
        '03-10': '二月初一',
        '03-11': '二月初二',
        '03-12': '二月初三',
        '03-13': '二月初四',
        '03-14': '二月初五',
        '03-15': '二月初六',
        '03-16': '二月初七',
        '03-17': '二月初八',
        '03-18': '二月初九',
        '03-19': '二月初十',
        '03-20': '二月十一',
        '03-21': '二月十二',
        '03-22': '二月十三',
        '03-23': '二月十四',
        '03-24': '二月十五',
        '03-25': '二月十六',
        '03-26': '二月十七',
        '03-27': '二月十八',
        '03-28': '二月十九',
        '03-29': '二月二十',
        '03-30': '二月廿一',
        '03-31': '二月廿二'
    };
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 月份是 1-12
    const day = date.getDate();
    
    const dateKey = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    if (lunar2026[dateKey]) {
        console.log('使用手动设置的农历日期:', lunar2026[dateKey]);
        return lunar2026[dateKey];
    }
    
    // 如果没有手动设置的日期，使用简化的计算
    const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
    const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
                     '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
                     '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
    
    const lunarMonth = lunarMonths[Math.min(11, month - 2)];
    const lunarDay = lunarDays[Math.min(29, day - 1)];
    
    return `${lunarMonth}${lunarDay}`;
}

// 异步获取农历日期（使用API）
async function getLunarDateAsync(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 月份是 1-12
    const day = date.getDate();
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    try {
        // 使用用户提供的农历API获取准确的农历日期
        const apiKey = 'ER3492DjqHxvWSN9VKxJf13NMR';
        const response = await fetch(`https://api.shwgij.com/api/lunars/lunar?key=${apiKey}&date=${dateStr}`);
        const data = await response.json();
        
        if (data.code === 201 && data.data) {
            const lunarData = data.data;
            console.log('API 返回的农历数据:', lunarData);
            
            // 提取农历日期
            const lunarDate = lunarData.Lunar;
            console.log('提取的农历日期:', lunarDate);
            
            return lunarDate;
        } else {
            console.error('API 返回错误:', data);
            // API 出错时使用备用方案
            return getLunarDate(date);
        }
    } catch (error) {
        console.error('API 请求出错:', error);
        // 请求出错时使用备用方案
        return getLunarDate(date);
    }
}

// 更新默认标题
async function updateDefaultTitle() {
    console.log('开始更新默认标题');
    const diaryTitle = document.getElementById('diary-title');
    console.log('diaryTitle:', diaryTitle);
    console.log('diaryTitle.dataset.userInput:', diaryTitle.dataset.userInput);
    console.log('diaryTitle.value.trim():', diaryTitle.value.trim());
    
    // 只有当用户还没有输入标题时，才自动填充默认标题
    if (!diaryTitle.dataset.userInput && !diaryTitle.value.trim()) {
        console.log('满足条件，开始填充默认标题');
        const currentDate = new Date(); // 使用当前时间
        console.log('当前日期:', currentDate);
        
        // 获取周几
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekday = weekdays[currentDate.getDay()];
        console.log('周几:', weekday);
        
        // 获取农历日期
        console.log('开始获取农历日期');
        const lunarDate = await getLunarDateAsync(currentDate);
        console.log('农历日期:', lunarDate);
        
        const defaultTitle = currentDate.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) + ` (${weekday} ${lunarDate}) 的日记`;
        console.log('默认标题:', defaultTitle);
        diaryTitle.value = defaultTitle;
        console.log('标题设置完成');
    } else {
        console.log('不满足条件，不填充默认标题');
    }
}

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
    // 等待Firebase初始化
    setTimeout(() => {
        if (window.firebase) {
            const { database, ref, get } = window.firebase;
            const diariesRef = ref(database, 'diaries');
            
            get(diariesRef).then((snapshot) => {
                if (snapshot.exists()) {
                    diaries = snapshot.val();
                    // 确保diaries是数组
                    if (!Array.isArray(diaries)) {
                        diaries = [];
                    }
                    // 按日期降序排序
                    diaries.sort((a, b) => new Date(b.date) - new Date(a.date));
                } else {
                    diaries = [];
                }
                renderDiaryList();
            }).catch((error) => {
                console.error('Error loading diaries:', error);
                diaries = [];
                renderDiaryList();
            });
        } else {
            console.error('Firebase not initialized');
            diaries = [];
            renderDiaryList();
        }
    }, 1000);
}

// 保存日记数据到Firebase
function saveDiaries() {
    if (window.firebase) {
        const { database, ref, set } = window.firebase;
        const diariesRef = ref(database, 'diaries');
        
        set(diariesRef, diaries).catch((error) => {
            console.error('Error saving diaries:', error);
        });
    }
}

// 保存新日记
function saveDiary() {
    const title = document.getElementById('diary-title').value.trim();
    const content = document.getElementById('diary-content').innerHTML.trim();
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
    const diaryTitle = document.getElementById('diary-title');
    diaryTitle.value = '';
    delete diaryTitle.dataset.userInput; // 清除用户输入标记
    document.getElementById('diary-content').innerHTML = '';
    document.getElementById('diary-date').valueAsDate = new Date();
    
    // 重新生成默认标题
    updateDefaultTitle();
    
    alert('日记保存成功！');
}

// 渲染日记列表
function renderDiaryList() {
    const diaryEntries = document.getElementById('diary-entries');
    
    // 过滤日记列表
    let filteredDiaries = diaries;
    if (currentFilterDate) {
        filteredDiaries = diaries.filter(diary => diary.date === currentFilterDate);
    }
    
    if (filteredDiaries.length === 0) {
        if (currentFilterDate) {
            diaryEntries.innerHTML = `<div class="empty-state">${currentFilterDate} 暂无日记</div>`;
        } else {
            diaryEntries.innerHTML = '<div class="empty-state">暂无日记，开始写第一篇吧！</div>';
        }
        return;
    }
    
    diaryEntries.innerHTML = '';
    
    filteredDiaries.forEach((diary, index) => {
        // 找到原始索引，用于编辑和删除操作
        const originalIndex = diaries.findIndex(d => d.id === diary.id);
        const diaryEl = document.createElement('div');
        diaryEl.className = 'diary-entry';
        
        // 格式化日期显示
        const formattedDate = new Date(diary.date).toLocaleDateString('zh-CN');
        
        diaryEl.innerHTML = `
            <h4>${diary.title}</h4>
            <div class="date">${formattedDate}</div>
            <div class="content">${diary.content}</div>
            <div class="actions">
                <button class="edit-btn" onclick="editDiary(${originalIndex})">编辑</button>
                <button class="delete-btn" onclick="deleteDiary(${originalIndex})">删除</button>
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
    document.getElementById('edit-content').innerHTML = diary.content;
    document.getElementById('edit-date').value = diary.date;
    
    // 显示编辑模态框
    document.getElementById('edit-modal').style.display = 'block';
}

// 更新日记
function updateDiary() {
    const title = document.getElementById('edit-title').value.trim();
    const content = document.getElementById('edit-content').innerHTML.trim();
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

// 按日期过滤日记
function filterDiariesByDate() {
    const filterDate = document.getElementById('filter-date').value;
    if (!filterDate) {
        alert('请选择日期');
        return;
    }
    currentFilterDate = filterDate;
    renderDiaryList();
}

// 重置日期过滤
function resetFilter() {
    document.getElementById('filter-date').value = '';
    currentFilterDate = null;
    renderDiaryList();
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    currentEditIndex = -1;
}

// 全局变量
let diaries = [];
let currentEditIndex = -1;
let currentFilterDate = null;
let showCompletedTodos = false;
let draggedDiaryId = null;

// 页面加载完成后初始化
window.onload = async function() {
    // 检查登录状态和会话超时
    if (!checkLoginStatus()) {
        // 未登录或会话超时，跳转到登录页面
        window.location.href = '../login.html?next=diary/index.html';
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

// 初始化应用
async function initApp() {
    loadDiaries(); // 本地缓存立即可用
    if (!window.firebase) setTimeout(loadDiaries, 500); // 等待 Firebase 初始化后再同步云端
    
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
    
    // 绑定标签筛选事件
    document.getElementById('tag-filter').addEventListener('change', renderDiaryList);
    
    // 绑定显示/隐藏已完成待办事项按钮事件
    const toggleCompletedBtn = document.getElementById('toggle-completed');
    if (toggleCompletedBtn) {
        toggleCompletedBtn.addEventListener('click', function() {
            showCompletedTodos = !showCompletedTodos;
            this.textContent = showCompletedTodos ? '隐藏已完成待办' : '显示已完成待办';
            renderDiaryList();
        });
    }
};

// 获取农历日期
function getLunarDate(date) {
    // 使用简化的计算
    const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
    const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
                     '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
                     '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
    
    const month = date.getMonth() + 1; // 月份是 1-12
    const day = date.getDate();
    
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

const DIARIES_CACHE_KEY = 'diaries_cache';

function normalizeDiaries() {
    let changed = false;
    diaries = diaries.map((diary, index) => {
        const normalized = { ...diary };

        if (!normalized.id) {
            normalized.id = `${Date.now()}-${index}`;
            changed = true;
        }

        if (typeof normalized.pinned !== 'boolean') {
            normalized.pinned = false;
            changed = true;
        }

        if (!Number.isFinite(Number(normalized.order))) {
            normalized.order = index;
            changed = true;
        } else {
            normalized.order = Number(normalized.order);
        }

        return normalized;
    });

    sortDiaries();
    return changed;
}

function sortDiaries() {
    diaries.sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) {
            return a.pinned ? -1 : 1;
        }

        const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
        const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return new Date(b.date) - new Date(a.date);
    });
}

function reindexDiaries() {
    diaries.forEach((diary, index) => {
        diary.order = index;
    });
}

function getTopOrderForGroup(pinned) {
    const group = diaries.filter(diary => !!diary.pinned === pinned);
    if (group.length === 0) return 0;
    return Math.min(...group.map(diary => Number(diary.order) || 0)) - 1;
}

function getVisibleDiaries() {
    let filteredDiaries = [...diaries];

    if (currentFilterDate) {
        filteredDiaries = filteredDiaries.filter(diary => diary.date === currentFilterDate);
    }

    const tagFilter = document.getElementById('tag-filter').value;
    if (tagFilter !== 'all') {
        filteredDiaries = filteredDiaries.filter(diary => diary.tag === tagFilter);
    }

    if (!showCompletedTodos) {
        filteredDiaries = filteredDiaries.filter(diary => {
            if (diary.tag !== '待办') {
                return true;
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = diary.content;

            const textNodes = [];
            function getAllTextNodes(node) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                    textNodes.push(node);
                } else {
                    for (let child of node.childNodes) {
                        getAllTextNodes(child);
                    }
                }
            }
            getAllTextNodes(tempDiv);

            if (textNodes.length === 0) {
                return true;
            }

            const allStrikethrough = textNodes.every(node => {
                let parent = node.parentElement;
                while (parent) {
                    if (parent.style.textDecoration === 'line-through' ||
                        parent.style.textDecorationLine === 'line-through' ||
                        parent.tagName === 'S' ||
                        parent.tagName === 'STRIKE') {
                        return true;
                    }
                    parent = parent.parentElement;
                }
                return false;
            });

            return !allStrikethrough;
        });
    }

    return filteredDiaries;
}

// 加载日记数据（本地优先秒开，云端静默同步）
function loadDiaries() {
    // 1. 优先从本地缓存加载，立即渲染
    const cached = localStorage.getItem(DIARIES_CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            diaries = Array.isArray(data) ? data : [];
            const changed = normalizeDiaries();
            if (changed) saveDiaries();
            renderDiaryList();
        } catch (_) { diaries = []; }
    } else {
        diaries = [];
        renderDiaryList();
    }
    
    // 2. 后台从 Firebase 拉取并同步
    if (!window.firebase) return;
    
    const { database, ref, get } = window.firebase;
    get(ref(database, 'diaries')).then((snapshot) => {
        if (snapshot.exists()) {
            diaries = snapshot.val();
            if (!Array.isArray(diaries)) diaries = [];
            const changed = normalizeDiaries();
            localStorage.setItem(DIARIES_CACHE_KEY, JSON.stringify(diaries));
            if (changed) saveDiaries();
        }
        renderDiaryList();
    }).catch((e) => {
        console.error('Error loading diaries:', e);
    });
}

// 保存日记数据到本地+云端
function saveDiaries() {
    localStorage.setItem(DIARIES_CACHE_KEY, JSON.stringify(diaries));
    if (window.firebase) {
        const { database, ref, set } = window.firebase;
        set(ref(database, 'diaries'), diaries).catch((e) => console.error('Error saving diaries:', e));
    }
}

// 保存新日记
function saveDiary() {
    const title = document.getElementById('diary-title').value.trim();
    const content = document.getElementById('diary-content').innerHTML.trim();
    const date = document.getElementById('diary-date').value;
    const tag = document.querySelector('input[name="diary-tag"]:checked').value;
    
    if (!title || !content || !date) {
        alert('请填写完整的日记信息');
        return;
    }
    
    const newDiary = {
        id: Date.now().toString(),
        title: title,
        content: content,
        date: date,
        tag: tag,
        pinned: false,
        order: getTopOrderForGroup(false)
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
    document.querySelector('input[name="diary-tag"][value="待办"]').checked = true;
    
    // 重新生成默认标题
    updateDefaultTitle();
    
    alert('日记保存成功！');
}

// 渲染日记列表
function renderDiaryList() {
    const diaryEntries = document.getElementById('diary-entries');
    sortDiaries();

    const filteredDiaries = getVisibleDiaries();
    
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
        diaryEl.className = `diary-entry${diary.pinned ? ' pinned' : ''}`;
        diaryEl.draggable = true;
        diaryEl.dataset.id = diary.id;
        
        // 格式化日期显示
        const formattedDate = new Date(diary.date).toLocaleDateString('zh-CN');
        
        // 获取标签，如果没有标签则默认为"日记"
        const tag = diary.tag || '日记';
        
        diaryEl.innerHTML = `
            <h4>${diary.title}</h4>
            <span class="tag ${tag}">${tag}</span>
            ${diary.pinned ? '<span class="pin-badge">置顶</span>' : ''}
            <div class="date">${formattedDate}</div>
            <div class="content">${diary.content}</div>
            <div class="actions">
                <button class="pin-btn" onclick="togglePinDiary('${diary.id}')">${diary.pinned ? '取消置顶' : '置顶'}</button>
                <button class="edit-btn" onclick="editDiary(${originalIndex})">编辑</button>
                <button class="delete-btn" onclick="deleteDiary(${originalIndex})">删除</button>
            </div>
        `;

        diaryEl.addEventListener('dragstart', handleDiaryDragStart);
        diaryEl.addEventListener('dragover', handleDiaryDragOver);
        diaryEl.addEventListener('dragleave', handleDiaryDragLeave);
        diaryEl.addEventListener('drop', handleDiaryDrop);
        diaryEl.addEventListener('dragend', handleDiaryDragEnd);
        
        diaryEntries.appendChild(diaryEl);
    });
}

function handleDiaryDragStart(e) {
    draggedDiaryId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedDiaryId);
}

function handleDiaryDragOver(e) {
    e.preventDefault();
    if (this.dataset.id !== draggedDiaryId) {
        clearDropIndicators();
        this.classList.add('drop-before');
    }
}

function handleDiaryDragLeave() {
    this.classList.remove('drop-before');
}

function handleDiaryDrop(e) {
    e.preventDefault();
    this.classList.remove('drop-before');

    const targetId = this.dataset.id;
    const sourceId = draggedDiaryId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;

    moveDiaryBefore(sourceId, targetId);
}

function handleDiaryDragEnd() {
    draggedDiaryId = null;
    document.querySelectorAll('.diary-entry.dragging, .diary-entry.drop-before').forEach(entry => {
        entry.classList.remove('dragging', 'drop-before');
    });
}

function clearDropIndicators() {
    document.querySelectorAll('.diary-entry.drop-before').forEach(entry => {
        entry.classList.remove('drop-before');
    });
}

function moveDiaryBefore(sourceId, targetId) {
    sortDiaries();
    const sourceIndex = diaries.findIndex(diary => diary.id === sourceId);
    const targetIndex = diaries.findIndex(diary => diary.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const [sourceDiary] = diaries.splice(sourceIndex, 1);
    const nextTargetIndex = diaries.findIndex(diary => diary.id === targetId);
    diaries.splice(nextTargetIndex, 0, sourceDiary);

    reindexDiaries();
    saveDiaries();
    renderDiaryList();
}

function togglePinDiary(id) {
    const diary = diaries.find(item => item.id === id);
    if (!diary) return;

    diary.pinned = !diary.pinned;
    diary.order = getTopOrderForGroup(diary.pinned);

    sortDiaries();
    reindexDiaries();
    saveDiaries();
    renderDiaryList();
}

// 编辑日记
function editDiary(index) {
    currentEditIndex = index;
    const diary = diaries[index];
    
    // 填充编辑表单
    document.getElementById('edit-title').value = diary.title;
    document.getElementById('edit-content').innerHTML = diary.content;
    document.getElementById('edit-date').value = diary.date;
    
    // 设置标签
    const tag = diary.tag || '待办';
    document.querySelector(`input[name="edit-tag"][value="${tag}"]`).checked = true;
    
    // 显示编辑模态框
    document.getElementById('edit-modal').style.display = 'flex';
}

// 更新日记
function updateDiary() {
    const title = document.getElementById('edit-title').value.trim();
    const content = document.getElementById('edit-content').innerHTML.trim();
    const date = document.getElementById('edit-date').value;
    const tag = document.querySelector('input[name="edit-tag"]:checked').value;
    
    if (!title || !content || !date) {
        alert('请填写完整的日记信息');
        return;
    }
    
    diaries[currentEditIndex] = {
        ...diaries[currentEditIndex],
        title: title,
        content: content,
        date: date,
        tag: tag
    };
    
    sortDiaries();
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

// 重置过滤
function resetFilter() {
    document.getElementById('filter-date').value = '';
    currentFilterDate = null;
    document.getElementById('tag-filter').value = 'all';
    renderDiaryList();
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    currentEditIndex = -1;
}

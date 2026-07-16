// 全局变量
let diaries = [];
let currentEditIndex = -1;
let currentFilterDate = null;
let showCompletedTodos = true;
let draggedDiaryId = null;

// 页面加载完成后初始化
window.onload = async function() {
    // 检查登录状态和会话超时
    if (!checkLoginStatus()) {
        // 未登录或会话超时，跳转到登录页面
        window.location.href = '../?next=diary/index.html';
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
    initMarkdownEditors();
    
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
        }) + ` (${weekday} ${lunarDate}) 的Note`;
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
            window.location.href = '../';
        }, 100);
    } else {
        console.log('用户点击了取消，不执行退出登录');
        // 什么都不做，保持当前状态
    }
};

const DIARIES_CACHE_KEY = 'diaries_cache';
const DIARIES_BACKUP_KEY = 'diaries_cache_backup';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeHtml(html) {
    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option']
        });
    }

    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script, style, iframe, object, embed, form').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
        [...node.attributes].forEach(attribute => {
            if (attribute.name.startsWith('on') || /^(javascript|data):/i.test(attribute.value.trim())) {
                node.removeAttribute(attribute.name);
            }
        });
    });
    return template.innerHTML;
}

function renderMarkdown(markdown) {
    // GFM 要求任务框后有空格；这里兼容用户手写的 `- [ ]内容`。
    const source = String(markdown ?? '').replace(
        /^(\s*[-*+]\s+\[[ xX]\])(?=\S)/gm,
        '$1 '
    );
    if (!window.marked) {
        return escapeHtml(source).replace(/\n/g, '<br>');
    }

    const rendered = window.marked.parse(source, { gfm: true, breaks: true });
    return sanitizeHtml(rendered);
}

function htmlToMarkdown(html) {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(html || '');

    function convert(node, depth = 0) {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = node.tagName.toLowerCase();
        const children = [...node.childNodes].map(child => convert(child, depth)).join('');
        const clean = children.trim();
        const listItems = () => [...node.children]
            .filter(child => child.tagName === 'LI')
            .map((child, index) => {
                const marker = tag === 'ol' ? `${index + 1}. ` : '- ';
                return `${'  '.repeat(depth)}${marker}${convert(child, depth + 1).trim()}`;
            }).join('\n');

        if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${clean}\n\n`;
        if (tag === 'p' || tag === 'div') return `${clean}\n\n`;
        if (tag === 'br') return '\n';
        if (tag === 'strong' || tag === 'b') return `**${clean}**`;
        if (tag === 'em' || tag === 'i') return `*${clean}*`;
        if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${clean}~~`;
        if (tag === 'blockquote') return clean.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
        if (tag === 'ul' || tag === 'ol') return `${listItems()}\n\n`;
        if (tag === 'li') return children;
        if (tag === 'pre') return `\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
        if (tag === 'code') return `\`${node.textContent}\``;
        if (tag === 'a') return `[${clean || node.getAttribute('href')}](${node.getAttribute('href') || ''})`;
        return children;
    }

    return [...container.childNodes].map(node => convert(node)).join('').replace(/\n{3,}/g, '\n\n').trim();
}

function getDiaryMarkdown(diary) {
    return diary.contentFormat === 'markdown' ? String(diary.content || '') : htmlToMarkdown(diary.content || '');
}

function getDiaryRenderedContent(diary) {
    return diary.contentFormat === 'markdown'
        ? renderMarkdown(diary.content)
        : sanitizeHtml(diary.content || '');
}

function setEditorMode(editor, mode) {
    const source = editor.querySelector('.markdown-source');
    const preview = editor.querySelector('.markdown-preview');
    const toolbar = editor.querySelector('.editor-toolbar');
    const isPreview = mode === 'preview';

    editor.querySelectorAll('.markdown-tab').forEach(tab => {
        tab.classList.toggle('is-active', tab.dataset.mode === mode);
    });
    source.hidden = isPreview;
    toolbar.hidden = isPreview;
    preview.hidden = !isPreview;
    if (isPreview) {
        preview.innerHTML = source.value.trim()
            ? renderMarkdown(source.value)
            : '<p class="markdown-empty">还没有内容可预览。</p>';
    } else {
        source.focus();
    }
}

function wrapSelection(textarea, before, after = before, placeholder = '文字') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    textarea.setRangeText(`${before}${selected}${after}`, start, end, 'end');
    textarea.focus();
}

function prefixSelection(textarea, prefix, placeholder = '列表项') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    const replaced = selected.split('\n').map((line, index) =>
        `${typeof prefix === 'function' ? prefix(index) : prefix}${line}`
    ).join('\n');
    textarea.setRangeText(replaced, start, end, 'end');
    textarea.focus();
}

function applyMarkdownAction(textarea, action) {
    const actions = {
        'heading-1': () => prefixSelection(textarea, '# ', '一级标题'),
        'heading-2': () => prefixSelection(textarea, '## ', '二级标题'),
        bold: () => wrapSelection(textarea, '**', '**'),
        italic: () => wrapSelection(textarea, '*', '*'),
        strike: () => wrapSelection(textarea, '~~', '~~'),
        quote: () => prefixSelection(textarea, '> ', '引用内容'),
        'unordered-list': () => prefixSelection(textarea, '- '),
        'ordered-list': () => prefixSelection(textarea, index => `${index + 1}. `),
        task: () => prefixSelection(textarea, '- [ ] ', ''),
        link: () => wrapSelection(textarea, '[', '](https://)', '链接文字'),
        code: () => wrapSelection(textarea, '`', '`', '代码')
    };
    if (actions[action]) actions[action]();
}

function continueMarkdownMarker(textarea, event) {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) return;

    const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = textarea.value.slice(lineStart, start);
    const orderedMatch = currentLine.match(/^(\s*)(\d+)([.)]\s+)/);
    if (orderedMatch) {
        const nextNumber = Number(orderedMatch[2]) + 1;
        event.preventDefault();
        textarea.setRangeText(`\n${orderedMatch[1]}${nextNumber}${orderedMatch[3]}`, start, end, 'end');
        return;
    }

    const taskMatch = currentLine.match(/^(\s*[-*+]\s+)\[[ xX]\](\s+)/);
    if (taskMatch) {
        event.preventDefault();
        textarea.setRangeText(`\n${taskMatch[1]}[ ]${taskMatch[2]}`, start, end, 'end');
        return;
    }

    const markerMatch = currentLine.match(/^(\s*(?:[-*+]\s+|>\s+))/);
    if (!markerMatch) return;

    event.preventDefault();
    textarea.setRangeText(`\n${markerMatch[1]}`, start, end, 'end');
}

function handleMarkdownTab(textarea, event) {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    event.preventDefault();

    const indent = '    ';
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end && !event.shiftKey) {
        textarea.setRangeText(indent, start, end, 'end');
        return;
    }

    const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = textarea.value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? textarea.value.length : lineEndIndex;
    const selectedLines = textarea.value.slice(lineStart, lineEnd);

    if (!event.shiftKey) {
        const indented = selectedLines.replace(/^/gm, indent);
        textarea.setRangeText(indented, lineStart, lineEnd, 'select');
        textarea.selectionStart = start + indent.length;
        textarea.selectionEnd = end + (indented.length - selectedLines.length);
        return;
    }

    let removedBeforeStart = 0;
    let removedTotal = 0;
    const unindented = selectedLines.replace(/^( {1,4}|\t)/gm, (match, leading, offset) => {
        if (lineStart + offset < start) removedBeforeStart += leading.length;
        removedTotal += leading.length;
        return '';
    });

    textarea.setRangeText(unindented, lineStart, lineEnd, 'select');
    textarea.selectionStart = Math.max(lineStart, start - removedBeforeStart);
    textarea.selectionEnd = Math.max(textarea.selectionStart, end - removedTotal);
}

function handleMarkdownKeydown(textarea, event) {
    handleMarkdownTab(textarea, event);
    continueMarkdownMarker(textarea, event);
}

function initMarkdownEditors() {
    document.querySelectorAll('.markdown-editor').forEach(editor => {
        const textarea = editor.querySelector('.markdown-source');
        textarea.addEventListener('keydown', event => handleMarkdownKeydown(textarea, event));
        editor.querySelectorAll('.markdown-tab').forEach(tab => {
            tab.addEventListener('click', () => setEditorMode(editor, tab.dataset.mode));
        });
        editor.querySelectorAll('[data-md-action]').forEach(button => {
            button.addEventListener('click', () => applyMarkdownAction(textarea, button.dataset.mdAction));
        });
    });
}

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

        if (normalized.contentFormat !== 'markdown' && normalized.contentFormat !== 'html') {
            normalized.contentFormat = 'html';
            changed = true;
        }

        return normalized;
    });

    sortDiaries();
    return changed;
}

function getDiaryKey(diary) {
    if (!diary || typeof diary !== 'object') return '';
    return diary.id || [diary.date, diary.title, diary.content].join('|');
}

function mergeDiaryLists(primary, secondary) {
    const merged = [];
    const seen = new Set();

    [...primary, ...secondary].forEach(diary => {
        const key = getDiaryKey(diary);
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(diary);
    });

    return merged;
}

function coerceDiaryList(value) {
    const list = Array.isArray(value)
        ? value.filter(Boolean)
        : value && typeof value === 'object'
            ? Object.values(value).filter(Boolean)
            : [];
    return mergeDiaryLists(list, []);
}

function toDiaryRecordMap(list) {
    return list.reduce((records, diary) => {
        const key = getDiaryKey(diary);
        if (key) records[key] = diary;
        return records;
    }, {});
}

function saveLocalDiaries() {
    const previousCache = localStorage.getItem(DIARIES_CACHE_KEY);
    if (previousCache) {
        localStorage.setItem(DIARIES_BACKUP_KEY, previousCache);
    }
    localStorage.setItem(DIARIES_CACHE_KEY, JSON.stringify(diaries));
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

            if (diary.contentFormat === 'markdown') {
                const tasks = [...String(diary.content || '').matchAll(/^\s*[-*+]\s+\[([ xX])](?:[ \t]*)/gm)];
                if (tasks.length > 0 && tasks.every(task => task[1].toLowerCase() === 'x')) {
                    return false;
                }
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = getDiaryRenderedContent(diary);

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

// 加载Note数据（本地优先秒开，云端静默同步）
function loadDiaries() {
    // 1. 优先从本地缓存加载，立即渲染
    const cached = localStorage.getItem(DIARIES_CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            diaries = Array.isArray(data) ? data : [];
            const changed = normalizeDiaries();
            if (changed) saveLocalDiaries();
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
            const localDiaries = diaries;
            const cloudValue = snapshot.val();
            const cloudWasArray = Array.isArray(cloudValue);
            const cloudDiaries = coerceDiaryList(cloudValue);
            diaries = cloudDiaries;
            const changed = normalizeDiaries();

            if (localDiaries.length > diaries.length) {
                console.warn('Local diary cache has more entries than cloud; merging to avoid data loss.');
                diaries = mergeDiaryLists(localDiaries, diaries);
                normalizeDiaries();
                saveDiaries({ allowShrink: false });
            } else if (changed || cloudWasArray) {
                saveDiaries({ allowShrink: false });
            } else {
                localStorage.setItem(DIARIES_CACHE_KEY, JSON.stringify(diaries));
            }
        }
        renderDiaryList();
    }).catch((e) => {
        console.error('Error loading diaries:', e);
    });
}

// 保存Note数据到本地+云端
function saveDiaries(options = {}) {
    const { allowShrink = false } = options;
    saveLocalDiaries();
    if (window.firebase) {
        const { database, ref, set, get } = window.firebase;
        const diaryRef = ref(database, 'diaries');
        const writeDiaries = () => set(diaryRef, toDiaryRecordMap(diaries)).catch((e) => console.error('Error saving diaries:', e));

        if (allowShrink || typeof get !== 'function') {
            writeDiaries();
            return;
        }

        get(diaryRef).then((snapshot) => {
            if (!snapshot.exists()) {
                writeDiaries();
                return;
            }

            const cloudDiaries = coerceDiaryList(snapshot.val());
            if (cloudDiaries.length > diaries.length) {
                console.warn('Cloud has more diary entries than current state; merging before save.');
                diaries = mergeDiaryLists(diaries, cloudDiaries);
                normalizeDiaries();
                saveLocalDiaries();
            }

            writeDiaries();
        }).catch((e) => {
            console.error('Error checking cloud diaries before save:', e);
            writeDiaries();
        });
    }
}

function saveDiaryEntry(diary) {
    saveLocalDiaries();

    if (!window.firebase || !diary) return;

    const { database, ref, update } = window.firebase;
    if (typeof update !== 'function') {
        saveDiaries();
        return;
    }

    update(ref(database, `diaries/${getDiaryKey(diary)}`), diary)
        .catch((e) => {
            console.error('Error saving diary entry:', e);
            saveDiaries();
        });
}

function deleteDiaryEntryFromCloud(diary) {
    if (!window.firebase || !diary) return;

    const { database, ref, remove } = window.firebase;
    if (typeof remove !== 'function') {
        saveDiaries({ allowShrink: true });
        return;
    }

    remove(ref(database, `diaries/${getDiaryKey(diary)}`))
        .catch((e) => console.error('Error deleting diary entry:', e));
}

// 保存新Note
function saveDiary() {
    const title = document.getElementById('diary-title').value.trim();
    const content = document.getElementById('diary-content').value.trim();
    const date = document.getElementById('diary-date').value;
    const tag = document.querySelector('input[name="diary-tag"]:checked').value;
    
    if (!title || !content || !date) {
        alert('请填写完整的Note信息');
        return;
    }
    
    const newDiary = {
        id: Date.now().toString(),
        title: title,
        content: content,
        contentFormat: 'markdown',
        date: date,
        tag: tag,
        pinned: false,
        order: getTopOrderForGroup(false)
    };
    
    diaries.unshift(newDiary); // 添加到数组开头
    saveDiaryEntry(newDiary);
    renderDiaryList();
    
    // 清空输入表单
    const diaryTitle = document.getElementById('diary-title');
    diaryTitle.value = '';
    delete diaryTitle.dataset.userInput; // 清除用户输入标记
    document.getElementById('diary-content').value = '';
    setEditorMode(document.querySelector('[data-editor="diary-content"]'), 'write');
    document.getElementById('diary-date').valueAsDate = new Date();
    document.querySelector('input[name="diary-tag"][value="待办"]').checked = true;
    
    // 重新生成默认标题
    updateDefaultTitle();
    
    alert('Note保存成功！');
}

// 渲染Note列表
function renderDiaryList() {
    const diaryEntries = document.getElementById('diary-entries');
    sortDiaries();

    const filteredDiaries = getVisibleDiaries();
    
    if (filteredDiaries.length === 0) {
        if (currentFilterDate) {
            diaryEntries.innerHTML = `<div class="empty-state">${currentFilterDate} 暂无Note</div>`;
        } else {
            diaryEntries.innerHTML = '<div class="empty-state">暂无Note，开始写第一篇吧！</div>';
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
        
        // 获取标签，如果没有标签则默认为"Note"
        const tag = diary.tag || 'Note';
        
        diaryEl.innerHTML = `
            <h4>${escapeHtml(diary.title)}</h4>
            <span class="tag ${escapeHtml(tag)}">${escapeHtml(tag)}</span>
            ${diary.pinned ? '<span class="pin-badge">置顶</span>' : ''}
            <div class="date">${formattedDate}</div>
            <div class="content markdown-body">${getDiaryRenderedContent(diary)}</div>
            <div class="actions">
                <button class="pin-btn">${diary.pinned ? '取消置顶' : '置顶'}</button>
                <button class="edit-btn">编辑</button>
                <button class="delete-btn">删除</button>
            </div>
        `;

        diaryEl.querySelector('.pin-btn').addEventListener('click', () => togglePinDiary(diary.id));
        diaryEl.querySelector('.edit-btn').addEventListener('click', () => editDiary(originalIndex));
        diaryEl.querySelector('.delete-btn').addEventListener('click', () => deleteDiary(originalIndex));
        enableMarkdownTaskCheckboxes(diaryEl, diary);

        diaryEl.addEventListener('dragstart', handleDiaryDragStart);
        diaryEl.addEventListener('dragover', handleDiaryDragOver);
        diaryEl.addEventListener('dragleave', handleDiaryDragLeave);
        diaryEl.addEventListener('drop', handleDiaryDrop);
        diaryEl.addEventListener('dragend', handleDiaryDragEnd);
        
        diaryEntries.appendChild(diaryEl);
    });
}

function enableMarkdownTaskCheckboxes(diaryEl, diary) {
    if (diary.contentFormat !== 'markdown') return;

    const taskPattern = /^(\s*[-*+]\s+\[)([ xX])(\][ \t]*)/gm;
    const taskCount = [...String(diary.content || '').matchAll(taskPattern)].length;
    const checkboxes = [...diaryEl.querySelectorAll('.markdown-body input[type="checkbox"]')]
        .slice(0, taskCount);

    checkboxes.forEach((checkbox, taskIndex) => {
        checkbox.removeAttribute('disabled');
        checkbox.disabled = false;
        checkbox.draggable = false;
        checkbox.setAttribute('aria-label', '切换待办完成状态');
        checkbox.addEventListener('pointerdown', event => event.stopPropagation());
        checkbox.addEventListener('mousedown', event => event.stopPropagation());
        checkbox.addEventListener('click', event => event.stopPropagation());
        checkbox.addEventListener('change', () => {
            let currentTaskIndex = -1;
            diary.content = String(diary.content || '').replace(
                taskPattern,
                (match, before, state, after) => {
                    currentTaskIndex += 1;
                    return currentTaskIndex === taskIndex
                        ? `${before}${checkbox.checked ? 'x' : ' '}${after}`
                        : match;
                }
            );
            saveDiaryEntry(diary);
            renderDiaryList();
        });
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
    saveDiaryEntry(diary);
    renderDiaryList();
}

// 编辑Note
function editDiary(index) {
    currentEditIndex = index;
    const diary = diaries[index];
    
    // 填充编辑表单
    document.getElementById('edit-title').value = diary.title;
    document.getElementById('edit-content').value = getDiaryMarkdown(diary);
    document.getElementById('edit-date').value = diary.date;
    setEditorMode(document.querySelector('[data-editor="edit-content"]'), 'write');
    
    // 设置标签
    const tag = diary.tag || '待办';
    document.querySelector(`input[name="edit-tag"][value="${tag}"]`).checked = true;
    
    // 显示编辑模态框
    document.getElementById('edit-modal').style.display = 'block';
}

// 更新Note
function updateDiary() {
    const title = document.getElementById('edit-title').value.trim();
    const content = document.getElementById('edit-content').value.trim();
    const date = document.getElementById('edit-date').value;
    const tag = document.querySelector('input[name="edit-tag"]:checked').value;
    
    if (!title || !content || !date) {
        alert('请填写完整的Note信息');
        return;
    }
    
    const updatedDiary = {
        ...diaries[currentEditIndex],
        title: title,
        content: content,
        contentFormat: 'markdown',
        date: date,
        tag: tag
    };
    diaries[currentEditIndex] = updatedDiary;
    
    sortDiaries();
    saveDiaryEntry(updatedDiary);
    renderDiaryList();
    closeEditModal();
    
    alert('Note更新成功！');
}

// 删除Note
function deleteDiary(index) {
    if (confirm('确定要删除这篇Note吗？')) {
        const [deletedDiary] = diaries.splice(index, 1);
        saveLocalDiaries();
        deleteDiaryEntryFromCloud(deletedDiary);
        renderDiaryList();
        alert('Note删除成功！');
    }
}

// 按日期过滤Note
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

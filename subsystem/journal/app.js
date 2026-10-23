(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const carry = window.JournalCarryover;
  const ROOT = 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app/workJournal';
  const CACHE = 'work-journal-cache-v1', DRAFTS = 'work-journal-drafts-v1';
  const TEMPLATE = carry.template('');
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parse = value => new Date(`${value}T12:00:00`);
  const today = () => key(new Date());
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '9999-12-31' && key(parse(value)) === value;
  const valid = value => value && validDate(value.date) && typeof value.title === 'string' && typeof value.content === 'string' && Array.isArray(value.projects) && value.projects.every(item => typeof item === 'string');
  function read(name) {
    try {
      const value = JSON.parse(localStorage.getItem(name) || '{}');
      return Object.fromEntries(Object.entries(value || {}).filter(([date, record]) => valid(record) && record.date === date));
    } catch (_) { return {}; }
  }
  let records = read(CACHE), drafts = read(DRAFTS), selected = today(), month = parse(today());
  let editor = null, editorReady = false, changing = false, dirty = false, busy = false, loaded = false;
  let baseline = null, lastActivity = 0, carryover = null;
  let saving = false, autoPaused = false;
  const expandedHistory = new Set(), expandedWeek = new Set();
  const status = message => { $('journal-status').textContent = message; };
  function store(name, value) {
    try { localStorage.setItem(name, JSON.stringify(value)); return true; }
    catch (_) { status('本地存储不可用或已满，请及时导出当前日志。'); return false; }
  }
  function session() {
    if (window.subsystemSession?.isLoggedIn()) return true;
    $('journal-app').hidden = true;
    location.href = '../?next=journal/';
    return false;
  }
  function activity() {
    if (Date.now() - lastActivity < 30000) return;
    if (session()) { lastActivity = Date.now(); localStorage.setItem('loginTime', String(lastActivity)); }
  }
  const content = () => (editorReady ? editor.getValue() : $('journal-fallback').value).replace(/\u200b/g, '');
  function current() {
    return { date: selected, title: $('journal-title').value.trim(), content: content(),
      projects: [...new Set($('journal-projects').value.split(/[,，、]/).map(item => item.trim()).filter(Boolean))], updatedAt: new Date().toISOString(),
      ...(carryover ? { carryover } : {}) };
  }
  function remember() {
    if (!dirty) return true;
    drafts[selected] = current();
    return store(DRAFTS, drafts);
  }
  function changed() {
    if (changing || busy) return;
    dirty = true;
    if (remember()) status('草稿已保存在本机，尚未同步到云端。');
    render();
  }
  function putContent(value) {
    value = carry.asTaskLists(value);
    changing = true;
    if (editorReady) { editor.setValue(value, true); editor.clearStack(); }
    else $('journal-fallback').value = value;
    changing = false;
  }
  function select(date) {
    if (busy || !validDate(date)) return;
    if (!remember()) { $('journal-date').value = selected; return; }
    selected = date; month = parse(date);
    baseline = records[date] || null;
    const entry = drafts[date] || baseline;
    carryover = entry?.carryover || null;
    dirty = Boolean(drafts[date]);
    $('journal-date').value = date;
    $('journal-day').textContent = parse(date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    $('journal-title').value = entry?.title || '';
    $('journal-projects').value = entry?.projects.join('，') || '';
    putContent(entry?.content ?? '');
    status(dirty ? '已恢复本机草稿，保存后同步到云端。' : baseline ? '已载入当天日志，可在上方直接续写或修改。' : '新的一天，从一条进展开始。');
    // Wait for the cloud read before creating today's draft on this device.
    const untouched = !entry || (!entry.content.trim() && !entry.title.trim() && !entry.projects.length && !carryover);
    if (carry && loaded && date === today() && untouched) {
      const source = all()[carry.previousDay(date)];
      if (source) importPlan(source);
    }
    render();
  }
  function all() { return { ...records, ...drafts }; }
  function latestPlan() {
    if (!carry || !loaded || selected !== today() || carryover) return null;
    const entries = all();
    const yesterday = entries[carry.previousDay(selected)];
    if (yesterday) return carry.tasks(yesterday.content).length ? yesterday : null;
    const date = Object.keys(entries).filter(date => date < selected).sort().pop();
    return date && carry.tasks(entries[date].content).length ? entries[date] : null;
  }
  function importPlan(source) {
    if (!carry || busy || carryover) return;
    const items = carry.tasks(source.content);
    if (!items.length) return;
    carryover = { sourceDate: source.date, importedAt: new Date().toISOString() };
    putContent(carry.insert(content(), items));
    dirty = true;
    if (remember()) status(`已从 ${source.date} 带入未完成计划到“今日任务”，保存后同步到云端。`);
  }
  function openDate(date) {
    select(date);
    $('journal-day').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  function matching() {
    const project = $('project-filter').value, query = $('journal-search').value.trim().toLowerCase();
    return Object.values(all()).filter(entry => (!project || entry.projects.includes(project)) &&
      `${entry.title}\n${entry.content}\n${entry.projects.join(' ')}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
  }
  function weekDates() {
    const start = parse(selected); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return key(date); });
  }
  function render() {
    const source = latestPlan();
    $('journal-carry-panel').hidden = !source;
    $('journal-carry').disabled = busy || !source;
    const fromYesterday = source && source.date === carry.previousDay(selected);
    $('journal-carry').textContent = fromYesterday ? '从昨天日志带入' : '从最近一次日志带入';
    $('journal-carry-hint').textContent = source ? (fromYesterday ? `昨天（${source.date}）有未完成计划，可带入“今日任务”，保留当前正文。` : `昨天没有日志。最近一次日志为 ${source.date}，可手动带入其中的未完成计划。`) : '';
    const progress = carry.progress(content());
    $('journal-task-progress').textContent = `今日任务 · 已完成 ${progress.done} / ${progress.total}`;
    const entries = all(), project = $('project-filter').value;
    const projects = [...new Set(Object.values(entries).flatMap(entry => entry.projects))].sort();
    $('project-filter').replaceChildren(new Option('全部项目', ''), ...projects.map(value => new Option(value, value)));
    $('project-filter').value = projects.includes(project) ? project : '';
    $('month-label').textContent = `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;
    $('journal-calendar').replaceChildren();
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) $('journal-calendar').append(document.createElement('span'));
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const date = key(new Date(month.getFullYear(), month.getMonth(), day, 12)), button = document.createElement('button');
      button.type = 'button'; button.textContent = day; button.disabled = busy;
      button.classList.toggle('is-selected', date === selected); button.classList.toggle('is-today', date === today());
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${date}${drafts[date] ? '，有本地草稿' : records[date] ? '，已保存日志' : ''}`);
      if (entries[date]) button.dataset.marker = drafts[date] ? '◌' : '●';
      button.addEventListener('click', () => openDate(date)); $('journal-calendar').append(button);
    }
    const list = matching();
    $('journal-count').textContent = `${list.length} 篇记录`;
    $('journal-history').replaceChildren();
    if (!list.length) $('journal-history').textContent = '暂无记录，写下今天的第一条进展吧。';
    for (const entry of list) {
      $('journal-history').append(entryDetails(entry, expandedHistory));
    }
    const dates = weekDates(), weekly = dates.map(date => entries[date]).filter(Boolean);
    $('journal-week-label').textContent = `${dates[0]} — ${dates[6]} · 已记录 ${weekly.length} 天（含本机草稿）`;
    const completed = completedTasks(entries, dates);
    $('journal-week-completed-title').textContent = `本周已完成任务（${completed.length}）`;
    $('journal-week-completed').replaceChildren();
    if (!completed.length) $('journal-week-completed').textContent = '勾选完成的今日任务会自动汇总在这里。';
    for (const item of completed) {
      const line = document.createElement('li');
      line.textContent = `${item.date} · ${item.text}`;
      if (window.marked?.parseInline && window.DOMPurify?.sanitize) {
        // Older editor versions escaped a pair of strike-through delimiters.
        // Normalize only that pair for display; keep the saved Markdown intact.
        const markdown = completedMarkdown(item.text);
        const task = document.createElement('span');
        task.innerHTML = window.DOMPurify.sanitize(window.marked.parseInline(markdown, { gfm: true }), {
          ALLOWED_TAGS: ['del', 's', 'strong', 'em', 'code', 'a', 'br'],
          ALLOWED_ATTR: ['href', 'title']
        });
        const date = document.createElement('span');
        date.textContent = `${item.date} · `;
        line.textContent = '';
        line.append(date, task);
      }
      $('journal-week-completed').append(line);
    }
    $('journal-week').replaceChildren();
    if (!weekly.length) $('journal-week').textContent = '这一周还没有记录。日积月累，进展会在这里连成线。';
    for (const entry of weekly) {
      $('journal-week').append(entryDetails(entry, expandedWeek, true));
    }
  }
  function entryDetails(entry, expanded, weekly = false) {
    const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div'), edit = document.createElement('button');
    details.className = 'journal-week-entry'; details.open = expanded.has(entry.date);
    summary.textContent = weekly && !entry.projects.length ? entry.date
      : `${entry.date} · ${entry.projects.join(' / ') || '未设置项目'}${drafts[entry.date] ? ' · 草稿' : ''}`;
    body.className = 'journal-markdown vditor-reset'; body.textContent = '';
    const showBody = () => {
      if (body.dataset.rendered) return;
      if (window.marked?.parse && window.DOMPurify?.sanitize) {
        body.innerHTML = window.DOMPurify.sanitize(window.marked.parse(entry.content, { gfm: true, breaks: true }), {
          USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'iframe']
        });
        body.querySelectorAll?.('input').forEach(input => {
          input.disabled = true;
          if (input.type === 'checkbox') input.closest('li')?.classList.add('journal-task-item');
        });
      } else { body.textContent = entry.content; body.classList.toggle('is-plain', true); }
      body.dataset.rendered = 'true';
    };
    if (details.open) showBody();
    edit.textContent = '编辑这天的记录'; edit.type = 'button'; edit.disabled = busy; edit.className = 'journal-secondary';
    edit.addEventListener('click', () => openDate(entry.date));
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (details.open) { expanded.add(entry.date); showBody(); } else expanded.delete(entry.date);
    });
    details.append(summary, body, edit); return details;
  }
  const completedMarkdown = text => text.replace(/\\~\\~(.+?)\\~\\~/g, '~~$1~~');
  function completedTasks(entries, dates) {
    return dates.flatMap(date => entries[date] ? carry.progress(entries[date].content).completed.map(text => ({ date, text })) : []);
  }
  function controls() {
    ['journal-date', 'journal-title', 'journal-projects', 'journal-template', 'journal-reload', 'journal-today', 'month-prev', 'month-next'].forEach(id => { $(id).disabled = busy; });
    $('journal-save').disabled = busy || saving || !loaded;
    $('journal-reload').disabled = busy || saving;
    if (editorReady) { if (busy) editor.disabled(); else editor.enable(); }
    $('journal-fallback').disabled = busy;
  }
  async function request(date = '', options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${ROOT}${date ? '/' + date : ''}.json`, { ...options, signal: controller.signal });
      if (!response.ok) throw Object.assign(new Error(response.status === 412 ? '日志已被其他设备更新，请先导出本机草稿，再刷新查看云端记录。' : `云端请求失败（${response.status}）`), { conflict: response.status === 412 });
      return { value: await response.json(), etag: response.headers.get('ETag') };
    } finally { clearTimeout(timer); }
  }
  // Catch up on first open as well as at midnight. Use a conditional write so
  // another device's changes are never replaced by an older local snapshot.
  async function rollYesterday() {
    const date = carry.previousDay(today()), original = records[date];
    const source = drafts[date] || original;
    if (!source) return;
    const result = carry.toTomorrow(source.content);
    if (!result.added) return;
    const remote = await request(date, { headers: { 'X-Firebase-ETag': 'true' } });
    const actual = remote.value && { ...remote.value, projects: remote.value.projects ?? [] };
    if (!remote.etag || JSON.stringify(actual) !== JSON.stringify(original || null)) {
      throw new Error('昨天日志已有其他设备更新，请刷新后再同步未完成任务');
    }
    const entry = { ...source, content: result.content, updatedAt: new Date().toISOString() };
    await request(date, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': remote.etag }, body: JSON.stringify(entry) });
    records[date] = entry;
    delete drafts[date];
    if (selected === date) { baseline = entry; dirty = false; putContent(entry.content); }
    store(CACHE, records); store(DRAFTS, drafts);
  }
  async function load() {
    if (!session() || busy || saving) return;
    remember(); busy = true; controls();
    $('journal-sync').textContent = '正在读取云端…';
    try {
      const { value } = await request();
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('云端日志格式异常，请检查数据');
      const normalized = Object.fromEntries(Object.entries(value || {}).map(([date, entry]) => [date, entry && { ...entry, projects: entry.projects ?? [] }]));
      if (Object.entries(normalized).some(([date, entry]) => !valid(entry) || entry.date !== date)) throw new Error('云端日志格式异常，请检查数据');
      records = normalized;
      await rollYesterday();
      loaded = true; autoPaused = false; store(CACHE, records);
      $('journal-sync').textContent = '云端记录已更新';
    } catch (error) {
      $('journal-sync').textContent = `${error.message}；已保留本机记录，可稍后刷新重试。`;
    } finally { busy = false; controls(); select(selected); }
  }
  const fingerprint = entry => JSON.stringify([entry.title, entry.content, entry.projects, entry.carryover || null]);
  async function save({ automatic = false } = {}) {
    if (!session() || busy || saving || !loaded) return;
    if (automatic && (!dirty || autoPaused)) return;
    const entry = current(), date = entry.date, original = baseline;
    if (!entry.content.trim() || entry.content.trim() === TEMPLATE.trim()) {
      if (!automatic) status('先写下一条实际进展，再保存日志。');
      return;
    }
    dirty = true;
    if (!remember()) return;
    saving = true; if (!automatic) busy = true;
    controls(); status(automatic ? '正在自动保存到云端…' : '正在保存到云端…');
    try {
      const remote = await request(date, { headers: { 'X-Firebase-ETag': 'true' } });
      if (JSON.stringify(remote.value) !== JSON.stringify(original)) {
        const equal = remote.value && original && ['date', 'title', 'content', 'updatedAt'].every(field => remote.value[field] === original[field]) && JSON.stringify(remote.value.projects || []) === JSON.stringify(original.projects || []);
        if (!equal) throw Object.assign(new Error('云端已有更新。草稿已保留，请导出草稿后刷新云端，核对再保存。'), { conflict: true });
      }
      if (!remote.etag) throw new Error('无法取得云端版本号，请稍后重试');
      await request(date, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': remote.etag }, body: JSON.stringify(entry) });
      records[date] = entry;
      if (selected === date) {
        baseline = entry;
        if (fingerprint(current()) === fingerprint(entry)) { dirty = false; delete drafts[date]; }
        else remember();
        status(dirty ? '已同步此前内容，最新修改保留为草稿，将在下一次自动保存时同步。' : automatic ? '已自动保存到云端。' : '已保存到云端。');
      } else if (drafts[date] && fingerprint(drafts[date]) === fingerprint(entry)) delete drafts[date];
      store(CACHE, records); store(DRAFTS, drafts);
      $('journal-sync').textContent = `${date} 上次同步：` + new Date().toLocaleTimeString('zh-CN');
    } catch (error) {
      if (error.conflict) autoPaused = true;
      const message = `${error.message}。本机草稿仍保留。${error.conflict ? '自动保存已暂停，请先核对云端版本。' : '稍后可重试。'}`;
      if (selected === date) status(message); else $('journal-sync').textContent = `${date}：${message}`;
    } finally { saving = false; busy = false; controls(); render(); }
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function markdown(entry) { return `# ${entry.date} ${entry.title || '工作日志'}\n\n项目：${entry.projects.join('、') || '未分类'}\n\n${entry.content}\n`; }
  if (!session()) return;
  $('journal-app').hidden = false;
  $('journal-save').disabled = true;
  $('journal-fallback').hidden = false;
  $('journal-editor').hidden = true;
  select(selected);
  $('journal-fallback').addEventListener('input', changed);
  $('journal-fallback').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const field = $('journal-fallback');
    const next = carry.continueTask(field.value, field.selectionStart, field.selectionEnd);
    if (!next) return;
    event.preventDefault(); field.value = next.text;
    field.setSelectionRange(next.caret, next.caret); changed();
  });
  // Vditor sometimes continues a task as an ordinary list item. Preserve the
  // new item's caret and inline markup instead of replacing the whole editor.
  $('journal-editor').addEventListener('keydown', event => {
    if (!editorReady || busy || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const selection = window.getSelection();
    if (!selection?.isCollapsed) return;
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const previous = element?.closest('li');
    if (!previous || !$('journal-editor').contains(previous) || !previous.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]')) return;
    if (!previous.textContent.replace(/\u200b/g, '').trim()) {
      event.preventDefault(); event.stopPropagation();
      const list = previous.parentElement, paragraph = document.createElement('p');
      paragraph.setAttribute('data-block', '0'); paragraph.append(document.createElement('br'));
      list.parentNode.insertBefore(paragraph, list.nextSibling); previous.remove();
      if (!list.children.length) list.remove();
      const range = document.createRange(); range.setStart(paragraph, 0); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
      paragraph.dispatchEvent(new Event('input', { bubbles: true })); changed();
      return;
    }
    setTimeout(() => {
      const currentSelection = window.getSelection();
      const node = currentSelection?.anchorNode;
      const currentElement = node?.nodeType === 1 ? node : node?.parentElement;
      const item = currentElement?.closest('li');
      if (!item || item === previous || !$('journal-editor').contains(item)) return;
      const taskBody = item.querySelector(':scope > p') || item;
      let checkbox = item.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
      if (!checkbox) {
        checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        taskBody.insertBefore(checkbox, taskBody.firstChild);
      }
      checkbox.checked = false; checkbox.removeAttribute('checked');
      if (!item.textContent.trim()) taskBody.append(document.createTextNode('\u200b'));
      item.classList.add('vditor-task'); item.classList.remove('vditor-task--done');
      item.setAttribute('data-marker', '-');
      if (currentSelection.rangeCount && currentSelection.anchorNode === item && currentSelection.anchorOffset === 0) {
        const range = currentSelection.getRangeAt(0); range.setStartAfter(checkbox); range.collapse(true);
      }
      item.dispatchEvent(new Event('input', { bubbles: true }));
      changed();
    }, 0);
  }, true);
  ['journal-title', 'journal-projects'].forEach(id => $(id).addEventListener('input', changed));
  $('journal-date').addEventListener('change', event => { if (validDate(event.target.value)) openDate(event.target.value); else event.target.value = selected; });
  $('journal-today').addEventListener('click', () => openDate(today()));
  for (const [id, offset] of [['month-prev', -1], ['month-next', 1]]) $(id).addEventListener('click', () => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    if (next.getFullYear() >= 1900 && next.getFullYear() <= 9999) { month = next; render(); }
  });
  $('journal-save').addEventListener('click', save);
  $('journal-carry').addEventListener('click', () => {
    if (!session() || busy) return;
    const source = latestPlan();
    if (source) { importPlan(source); render(); }
  });
  $('journal-reload').addEventListener('click', load);
  $('journal-template').addEventListener('click', () => { putContent(carry.template(content())); changed(); });
  $('project-filter').addEventListener('change', render); $('journal-search').addEventListener('input', render);
  $('journal-export-day').addEventListener('click', () => download(`${selected}-工作日志.md`, markdown(current()), 'text/markdown;charset=utf-8'));
  $('journal-export-week').addEventListener('click', () => {
    remember(); const dates = weekDates(), entries = all();
    const completed = completedTasks(entries, dates);
    const summary = `# 每周回顾 ${dates[0]} — ${dates[6]}\n\n## 已完成任务\n${completed.map(item => `- ${item.date} · ${completedMarkdown(item.text)}`).join('\n') || '本周暂无勾选完成的任务。'}\n\n---\n\n`;
    download(`${dates[0]}-周回顾.md`, summary + (dates.filter(date => entries[date]).map(date => markdown(entries[date])).join('\n---\n\n') || '本周暂无记录。'), 'text/markdown;charset=utf-8');
  });
  $('journal-export-all').addEventListener('click', () => {
    remember(); download(`工作日志备份-${today()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records, drafts }, null, 2), 'application/json');
  });
  $('logout-btn')?.addEventListener('click', () => {
    remember(); localStorage.removeItem('isLoggedIn'); localStorage.removeItem('loginTime'); location.href = '../';
  });
  ['pointerdown', 'keydown'].forEach(event => $('journal-app').addEventListener(event, activity));
  let observedDay = today();
  async function checkMidnight() {
    if (today() === observedDay || busy || saving || !window.subsystemSession?.isLoggedIn()) return;
    const previous = observedDay, followToday = selected === previous;
    await load();
    observedDay = today();
    if (followToday && selected === previous) select(observedDay);
  }
  setInterval(checkMidnight, 15000);
  setInterval(session, 60000);
  setInterval(() => {
    if (!dirty || busy || saving || !loaded || autoPaused || !window.subsystemSession?.isLoggedIn()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    return save({ automatic: true });
  }, 30000);
  window.addEventListener('beforeunload', event => { if (dirty && !remember()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) remember(); else { session(); checkMidnight(); } });
  window.addEventListener('offline', () => { $('journal-sync').textContent = '当前离线，编辑内容仍会保存在本机草稿。'; });
  window.addEventListener('online', () => { $('journal-sync').textContent = '网络已恢复，可保存日志或刷新云端。'; });
  if (window.Vditor) {
    const fallbackNotice = setTimeout(() => { if (!editorReady) status('编辑器加载较慢，可先使用下方 Markdown 文本框记录。'); }, 8000);
    try {
      editor = new Vditor('journal-editor', {
        cdn: 'https://cdn.jsdelivr.net/npm/vditor@3.10.9', lang: 'zh_CN', mode: 'ir', minHeight: 390,
        cache: { enable: false }, value: content(), input: changed, placeholder: '写下今天的进展、遇到的问题，或下一步计划…',
        toolbar: ['headings', 'bold', 'italic', 'strike', '|', 'list', 'ordered-list', 'check', '|', 'quote', 'code', 'link', '|', 'undo', 'redo', 'edit-mode', 'fullscreen'],
        preview: { markdown: { sanitize: true } },
        after: () => {
          clearTimeout(fallbackNotice); editorReady = true;
          changing = true; editor.setValue($('journal-fallback').value, true); changing = false;
          $('journal-fallback').hidden = true; $('journal-editor').hidden = false; controls();
        }
      });
    } catch (_) { clearTimeout(fallbackNotice); status('编辑器暂不可用，已切换为 Markdown 文本框。'); }
  } else status('编辑器未加载，已切换为 Markdown 文本框。');
  load();
})();

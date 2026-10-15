(() => {
  'use strict';
  const dates = window.CountdownDates;
  const DATABASE_URL = 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app';
  const $ = id => document.getElementById(id);
  let records = [], editingId = null, ready = false, busy = false;
  function session() {
    if (window.subsystemSession.isLoggedIn()) return true;
    $('countdown-app').hidden = true;
    window.location.href = '/subsystem/?next=countdown/';
    return false;
  }
  function status(message) { $('countdown-status').textContent = message; }
  function controls() {
    $('countdown-save').disabled = !ready || busy;
    ['countdown-reload', 'countdown-cancel', 'countdown-name', 'countdown-date'].forEach(id => { $(id).disabled = busy; });
    document.querySelectorAll('#countdown-list button').forEach(button => { button.disabled = !ready || busy; });
  }
  async function request(path = '', method = 'GET', value) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${DATABASE_URL}/countdowns${path}.json`, {
        method, signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        ...(value === undefined ? {} : { body: JSON.stringify(value) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function reset() {
    editingId = null;
    $('countdown-form').reset();
    $('countdown-form-title').textContent = '添加日期倒数';
    $('countdown-save').textContent = '保存倒数';
    $('countdown-cancel').hidden = true;
  }
  function button(label, action) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'secondary'; element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }
  function render() {
    const list = $('countdown-list');
    list.replaceChildren();
    $('countdown-count').textContent = `（${records.length} 项）`;
    $('countdown-empty').hidden = records.length > 0;
    $('countdown-empty').textContent = '还没有日期记录，添加一个重要日子吧。';
    const current = dates.today();
    records.map(record => ({ ...record, days: dates.remaining(record.date, current) }))
      .sort((a, b) => Number(a.days < 0) - Number(b.days < 0) || (a.days < 0 ? b.days - a.days : a.days - b.days) || a.name.localeCompare(b.name, 'zh-CN'))
      .forEach(record => {
        const row = document.createElement('article'); row.className = 'birthday-row';
        const info = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = record.name;
        const detail = document.createElement('p'); detail.className = 'birthday-detail'; detail.textContent = `目标日期：${record.date}`;
        const count = document.createElement('span'); count.className = 'birthday-countdown';
        count.textContent = record.days === 0 ? '就是今天！' : record.days > 0 ? `还有 ${record.days} 天` : `已过去 ${-record.days} 天`;
        info.append(name, detail, count);
        const actions = document.createElement('div'); actions.className = 'birthday-actions';
        actions.append(button('编辑', () => {
          if (!session() || busy) return;
          editingId = record.id;
          $('countdown-name').value = record.name;
          $('countdown-date').value = record.date;
          $('countdown-form-title').textContent = '编辑日期倒数';
          $('countdown-save').textContent = '保存修改';
          $('countdown-cancel').hidden = false;
          $('countdown-name').focus();
        }), button('删除', () => remove(record)));
        row.append(info, actions); list.append(row);
      });
    controls();
  }
  async function load() {
    if (!session() || busy) return;
    busy = true; controls(); status('正在读取云端日期记录…');
    try {
      const data = await request();
      if (data !== null && (typeof data !== 'object' || Array.isArray(data))) throw new Error('Invalid countdown data');
      const entries = Object.entries(data || {});
      records = entries.filter(([, record]) => dates.valid(record)).map(([id, record]) => ({ ...record, id }));
      ready = true; render();
      const skipped = entries.length - records.length;
      status(skipped ? `已同步；${skipped} 条格式异常的记录未显示。` : '已与云端同步。另一站保存后可点击刷新读取。');
    } catch (error) {
      ready = false; status('云端读取失败，请检查网络和数据库访问权限后重试。');
      $('countdown-empty').textContent = '日期记录暂时无法加载。'; console.error(error);
    } finally { busy = false; controls(); }
  }
  async function save(event) {
    event.preventDefault();
    if (!session() || !ready || busy) return;
    const record = { name: $('countdown-name').value.trim(), date: $('countdown-date').value };
    if (!dates.valid(record)) { status('请输入事项名称和有效日期，过去或未来的日期均可。'); return; }
    if (!editingId) editingId = crypto.randomUUID();
    const id = editingId;
    busy = true; controls(); status('正在保存…');
    try {
      await request(`/${encodeURIComponent(id)}`, 'PUT', record);
      records = records.filter(item => item.id !== id).concat({ ...record, id });
      reset(); render(); status('日期倒数已保存，两边共用这条云端记录。');
    } catch (error) { status('保存未确认成功，输入已保留。请重试或刷新确认。'); console.error(error); }
    finally { busy = false; controls(); }
  }
  async function remove(record) {
    if (!session() || !ready || busy || !window.confirm(`确定删除“${record.name}”的日期记录吗？`)) return;
    busy = true; controls();
    try {
      await request(`/${encodeURIComponent(record.id)}`, 'DELETE');
      records = records.filter(item => item.id !== record.id);
      if (editingId === record.id) reset();
      render(); status('日期记录已删除。');
    } catch (error) { status('删除未确认成功，请刷新确认或重试。'); console.error(error); }
    finally { busy = false; controls(); }
  }
  if (!session()) return;
  $('countdown-app').hidden = false;
  $('countdown-form').addEventListener('submit', save);
  $('countdown-cancel').addEventListener('click', reset);
  $('countdown-reload').addEventListener('click', load);
  $('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn'); localStorage.removeItem('loginTime'); session();
  });
  ['input', 'click'].forEach(type => $('countdown-app').addEventListener(type, () => {
    if (session()) localStorage.setItem('loginTime', String(Date.now()));
  }));
  setInterval(() => { if (session() && ready) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session() && ready) render(); });
  load();
})();

(() => {
  'use strict';
  const dates = window.BirthdayDates;
  const DATABASE_URL = 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app';
  const $ = (id) => document.getElementById(id);
  let records = [], editingId = null, ready = false, busy = false;

  function session() {
    if (!window.subsystemSession.isLoggedIn()) {
      $('birthday-app').hidden = true;
      window.location.href = '../?next=birthday/';
      return false;
    }
    return true;
  }
  function status(message) { $('birthday-status').textContent = message; }
  function controls() {
    $('birthday-save').disabled = !ready || busy;
    $('birthday-reload').disabled = busy;
    $('birthday-calendar').disabled = !ready || busy || !records.some((record) => record.reminder);
    $('birthday-cancel').disabled = busy;
    ['birthday-name', 'birthday-date', 'birthday-reminder', 'birthday-calendar-type', 'birthday-lunar-year', 'birthday-lunar-month', 'birthday-lunar-day'].forEach((id) => { $(id).disabled = busy; });
    $('birthday-date').disabled = busy || $('birthday-calendar-type').value === 'lunar';
    document.querySelectorAll('#birthday-list button').forEach((button) => { button.disabled = !ready || busy; });
  }
  async function request(path = '', method = 'GET', value) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${DATABASE_URL}/birthdays${path}.json`, {
        method, signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        ...(value === undefined ? {} : { body: JSON.stringify(value) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function valid(record) {
    const base = record && typeof record.name === 'string' && record.name.trim().length > 0
      && record.name.length <= 80 && dates.parse(record.date) && record.date <= dates.today()
      && typeof record.reminder === 'boolean';
    if (!base) return false;
    if (record.calendar === 'lunar') {
      const lunar = record.lunar;
      return lunar && Number.isInteger(lunar.year) && lunar.year >= 1900 && lunar.year <= Number(dates.today().slice(0, 4))
        && Number.isInteger(lunar.month) && lunar.month >= 1 && lunar.month <= 12
        && Number.isInteger(lunar.day) && lunar.day >= 1 && lunar.day <= 30
        && typeof lunar.leap === 'boolean' && dates.lunarDate(lunar) === record.date;
    }
    return !record.calendar || record.calendar === 'solar';
  }
  const monthNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  function lunarInput() {
    const [month, leap] = $('birthday-lunar-month').value.split('-');
    return { year: Number($('birthday-lunar-year').value), month: Number(month), day: Number($('birthday-lunar-day').value), leap: leap === 'true' };
  }
  function updateMonths() {
    const select = $('birthday-lunar-month'), previous = select.value;
    select.replaceChildren();
    dates.lunarYear(Number($('birthday-lunar-year').value)).forEach((days, key) => {
      const [month, leap] = key.split('-');
      select.add(new Option(`${leap === 'true' ? '闰' : ''}${monthNames[Number(month) - 1]}`, key));
    });
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    updateDays();
  }
  function updateDays() {
    const select = $('birthday-lunar-day'), previous = Number(select.value) || 1;
    select.replaceChildren();
    const days = dates.lunarYear(Number($('birthday-lunar-year').value)).get($('birthday-lunar-month').value) || [];
    for (let day = 1; day <= days.length; day++) select.add(new Option(`${day} 日`, String(day)));
    select.value = String(Math.min(previous, days.length));
    conversion();
  }
  function conversion() {
    const lunar = $('birthday-calendar-type').value === 'lunar';
    $('birthday-solar-field').hidden = lunar;
    $('birthday-date').required = !lunar;
    $('birthday-date').disabled = busy || lunar;
    $('birthday-lunar-fields').hidden = !lunar;
    $('birthday-conversion').textContent = lunar ? `对应公历出生日期：${dates.lunarDate(lunarInput()) || '请选择有效日期'}` : '';
  }
  function reset() {
    editingId = null;
    $('birthday-form').reset();
    updateMonths(); conversion();
    $('form-title').textContent = '添加生日';
    $('birthday-save').textContent = '保存生日';
    $('birthday-cancel').hidden = true;
  }
  function button(label, action) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'secondary'; element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }
  function render() {
    const current = dates.today();
    $('birthday-date').max = current;
    const list = $('birthday-list');
    list.replaceChildren();
    $('birthday-count').textContent = `（${records.length} 人）`;
    $('birthday-empty').hidden = records.length > 0;
    $('birthday-empty').textContent = '还没有生日记录，添加第一位亲友吧。';
    records.map((record) => ({ ...record, next: dates.nextRecord(record, current) }))
      .sort((a, b) => a.next.days - b.next.days || a.name.localeCompare(b.name, 'zh-CN'))
      .forEach((record) => {
        const row = document.createElement('article'); row.className = 'birthday-row';
        const info = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = record.name;
        const detail = document.createElement('p'); detail.className = 'birthday-detail';
        const birth = record.calendar === 'lunar' ? `农历 ${record.lunar.year} 年${record.lunar.leap ? '闰' : ''}${monthNames[record.lunar.month - 1]} ${record.lunar.day} 日（公历 ${record.date}）` : `公历 ${record.date}`;
        detail.textContent = `出生日期：${birth} · ${record.reminder ? '日历提醒已选（需下载导入）' : '提醒未开启'}`;
        const countdown = document.createElement('span'); countdown.className = 'birthday-countdown';
        countdown.textContent = record.next.days === 0 ? '今天生日，记得送上祝福！' : `${record.next.date} · 还有 ${record.next.days} 天`;
        info.append(name, detail, countdown);
        const actions = document.createElement('div'); actions.className = 'birthday-actions';
        actions.append(button('编辑', () => {
          if (!session()) return;
          editingId = record.id;
          $('birthday-name').value = record.name;
          $('birthday-date').value = record.date;
          $('birthday-calendar-type').value = record.calendar || 'solar';
          if (record.calendar === 'lunar') {
            $('birthday-lunar-year').value = String(record.lunar.year); updateMonths();
            $('birthday-lunar-month').value = `${record.lunar.month}-${record.lunar.leap}`; updateDays();
            $('birthday-lunar-day').value = String(record.lunar.day);
          }
          conversion();
          $('birthday-reminder').checked = record.reminder;
          $('form-title').textContent = '编辑生日';
          $('birthday-save').textContent = '保存修改';
          $('birthday-cancel').hidden = false;
          $('birthday-name').focus();
        }), button('删除', () => remove(record)));
        row.append(info, actions); list.append(row);
      });
    controls();
  }
  async function load() {
    if (!session() || busy) return;
    busy = true; controls(); status('正在读取云端生日记录…');
    try {
      const data = await request();
      if (data !== null && (typeof data !== 'object' || Array.isArray(data))) throw new Error('Invalid birthday data');
      const entries = Object.entries(data || {});
      records = entries.filter(([, record]) => valid(record)).map(([id, record]) => ({ ...record, id }));
      ready = true;
      const skipped = entries.length - records.length;
      status(skipped ? `已加载；${skipped} 条格式异常的记录未显示。` : '已与云端同步。');
      render();
    } catch (error) {
      ready = false;
      status('云端读取失败，请检查网络后点击刷新。');
      $('birthday-empty').textContent = '生日记录暂时无法加载。';
      console.error(error);
    } finally { busy = false; controls(); }
  }
  async function save(event) {
    event.preventDefault();
    if (!session() || !ready || busy) return;
    const calendar = $('birthday-calendar-type').value;
    const lunar = calendar === 'lunar' ? lunarInput() : null;
    const record = { name: $('birthday-name').value.trim(), calendar, date: lunar ? dates.lunarDate(lunar) : $('birthday-date').value, reminder: $('birthday-reminder').checked, ...(lunar ? { lunar } : {}) };
    if (!valid(record)) { status('请输入姓名和有效的出生日期，日期不能晚于今天。'); return; }
    // Generate the ID before writing, so retries update the same entry after a lost response.
    if (!editingId) editingId = crypto.randomUUID();
    const id = editingId;
    busy = true; controls(); status('正在保存…');
    try {
      await request(`/${encodeURIComponent(id)}`, 'PUT', record);
      records = records.filter((item) => item.id !== id).concat({ ...record, id });
      reset(); render();
      status('生日已保存。修改提醒后，请重新下载并导入日历。');
    } catch (error) {
      status('保存未确认成功，输入已保留。请重试或刷新确认云端记录。'); console.error(error);
    } finally { busy = false; controls(); }
  }
  async function remove(record) {
    if (!session() || !ready || busy || !window.confirm(`确定删除“${record.name}”的生日记录吗？已导入的日历事件需在日历中另行删除。`)) return;
    busy = true; controls();
    try {
      await request(`/${encodeURIComponent(record.id)}`, 'DELETE');
      records = records.filter((item) => item.id !== record.id);
      if (editingId === record.id) reset();
      render(); status('生日已删除，请同时删除日历中的对应事件。');
    } catch (error) { status('删除未确认成功，请刷新确认或重试。'); console.error(error); }
    finally { busy = false; controls(); }
  }
  function download() {
    if (!session() || !ready || busy) return;
    const blob = new Blob([dates.calendar(records)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = '亲友生日提醒.ics';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('日历已下载，请导入日历应用并检查三次提醒。');
  }
  if (!session()) return;
  $('birthday-app').hidden = false;
  $('birthday-date').max = dates.today();
  for (let year = Number(dates.today().slice(0, 4)); year >= 1900; year--) $('birthday-lunar-year').add(new Option(`${year} 年`, String(year)));
  updateMonths(); conversion();
  $('birthday-calendar-type').addEventListener('change', conversion);
  $('birthday-lunar-year').addEventListener('change', updateMonths);
  $('birthday-lunar-month').addEventListener('change', updateDays);
  $('birthday-lunar-day').addEventListener('change', conversion);
  $('birthday-form').addEventListener('submit', save);
  $('birthday-cancel').addEventListener('click', reset);
  $('birthday-reload').addEventListener('click', load);
  $('birthday-calendar').addEventListener('click', download);
  $('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn'); localStorage.removeItem('loginTime'); session();
  });
  // Match the existing Tools session: user activity renews its three-minute expiry.
  $('birthday-app').addEventListener('input', () => { if (session()) localStorage.setItem('loginTime', String(Date.now())); });
  $('birthday-app').addEventListener('click', () => { if (session()) localStorage.setItem('loginTime', String(Date.now())); });
  setInterval(() => { if (session()) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session()) render(); });
  load();
})();

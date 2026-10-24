(() => {
  'use strict';
  const dates = window.BirthdayDates;
  const DATABASE_URL = 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app';
  const $ = (id) => document.getElementById(id);
  let records = [], editingId = null, editingSource = 'birthdays', ready = false, busy = false;
  const isCountdown = record => record?.kind === 'countdown';
  const formCountdown = () => $('birthday-kind').value === 'countdown';
  function displayDate(value) {
    const parts = dates.parse(value);
    if (!parts) return '';
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    return `${value}（周${'日一二三四五六'[weekday]}）`;
  }

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
    ['birthday-kind', 'birthday-name', 'birthday-date', 'birthday-reminder', 'birthday-email-reminder', 'birthday-calendar-type', 'birthday-lunar-year', 'birthday-lunar-month', 'birthday-lunar-day'].forEach((id) => { $(id).disabled = busy; });
    $('birthday-kind').disabled = busy || editingId !== null;
    $('birthday-date').disabled = busy || (!formCountdown() && $('birthday-calendar-type').value === 'lunar');
    document.querySelectorAll('#birthday-list button').forEach((button) => { button.disabled = !ready || busy; });
  }
  async function request(path = '', method = 'GET', value, source = 'birthdays') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${DATABASE_URL}/${source}${path}.json`, {
        method, signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        ...(value === undefined ? {} : { body: JSON.stringify(value) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function valid(record) {
    if (isCountdown(record)) return window.CountdownDates.valid(record) && (record.emailReminder === undefined || typeof record.emailReminder === 'boolean');
    const base = record && typeof record.name === 'string' && record.name.trim().length > 0
      && record.name.length <= 80 && dates.parse(record.date) && record.date <= dates.today()
      && typeof record.reminder === 'boolean'
      && (record.emailReminder === undefined || typeof record.emailReminder === 'boolean');
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
    const countdown = formCountdown();
    const lunar = !countdown && $('birthday-calendar-type').value === 'lunar';
    $('birthday-calendar-field').hidden = countdown;
    $('birthday-calendar-reminder-field').hidden = countdown;
    $('birthday-repeat-hint').hidden = countdown;
    $('birthday-name-label').textContent = countdown ? '事项名称' : '姓名';
    $('birthday-name').placeholder = countdown ? '例如：旅行、考试、截止日' : '输入亲友姓名';
    $('birthday-date-label').textContent = countdown ? '目标日期（公历）' : '出生日期（公历）';
    $('birthday-date').max = countdown ? '9999-12-31' : dates.today();
    $('form-title').textContent = `${editingId ? '编辑' : '添加'}${countdown ? '日期倒数' : '生日'}`;
    $('birthday-save').textContent = editingId ? '保存修改' : countdown ? '保存倒数' : '保存生日';
    $('birthday-solar-field').hidden = lunar;
    $('birthday-date').required = !lunar;
    $('birthday-date').disabled = busy || lunar;
    $('birthday-lunar-fields').hidden = !lunar;
    const selectedDate = lunar ? dates.lunarDate(lunarInput()) : $('birthday-date').value;
    $('birthday-conversion').textContent = lunar ? `对应公历出生日期：${displayDate(selectedDate) || '请选择有效日期'}` : displayDate(selectedDate);
  }
  function reset() {
    editingId = null; editingSource = 'birthdays';
    $('birthday-form').reset();
    updateMonths(); conversion(); controls();
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
    $('birthday-date').max = formCountdown() ? '9999-12-31' : current;
    const list = $('birthday-list');
    list.replaceChildren();
    $('birthday-count').textContent = `（${records.length} 项）`;
    $('birthday-empty').hidden = records.length > 0;
    $('birthday-empty').textContent = '还没有记录，添加一个生日或重要日期吧。';
    records.map((record) => ({ ...record, next: isCountdown(record) ? { date: record.date, days: window.CountdownDates.remaining(record.date, current) } : dates.nextRecord(record, current) }))
      .sort((a, b) => Number(a.next.days < 0) - Number(b.next.days < 0) || (a.next.days < 0 ? b.next.days - a.next.days : a.next.days - b.next.days) || a.name.localeCompare(b.name, 'zh-CN'))
      .forEach((record) => {
        const row = document.createElement('article'); row.className = 'birthday-row';
        const info = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = `${isCountdown(record) ? '【倒数】' : '【生日】'}${record.name}`;
        const detail = document.createElement('p'); detail.className = 'birthday-detail';
        const birth = !isCountdown(record) && record.calendar === 'lunar' ? `农历 ${record.lunar.year} 年${record.lunar.leap ? '闰' : ''}${monthNames[record.lunar.month - 1]} ${record.lunar.day} 日（公历 ${displayDate(record.date)}）` : `公历 ${displayDate(record.date)}`;
        const email = isCountdown(record) ? record.emailReminder === true : record.emailReminder !== false;
        detail.textContent = isCountdown(record) ? `目标日期：${displayDate(record.date)} · ${email ? '邮件提醒已开启' : '邮件提醒已关闭'}` : `出生日期：${birth} · ${email ? '邮件提醒已开启' : '邮件提醒已关闭'} · ${record.reminder ? '日历提醒已选（需下载导入）' : '日历提醒未开启'}`;
        const countdown = document.createElement('span'); countdown.className = 'birthday-countdown';
        countdown.textContent = `${displayDate(record.next.date)} · ${record.next.days < 0 ? `已过去 ${-record.next.days} 天` : record.next.days === 0 ? (isCountdown(record) ? '就是今天！' : '今天生日，记得送上祝福！') : `还有 ${record.next.days} 天`}`;
        info.append(name, detail, countdown);
        const actions = document.createElement('div'); actions.className = 'birthday-actions';
        actions.append(button('编辑', () => {
          if (!session()) return;
          editingId = record.id; editingSource = record.source;
          $('birthday-kind').value = isCountdown(record) ? 'countdown' : 'birthday';
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
          $('birthday-email-reminder').checked = isCountdown(record) ? record.emailReminder === true : record.emailReminder !== false;
          controls();
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
    busy = true; controls(); status('正在读取云端记录…');
    try {
      const [data, legacy] = await Promise.all([request(), request('', 'GET', undefined, 'countdowns')]);
      for (const value of [data, legacy]) {
        if (value !== null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Invalid records');
      }
      const entries = [...Object.entries(data || {}).map(([id, record]) => ({ id, record, source: 'birthdays' })),
        ...Object.entries(legacy || {}).map(([id, record]) => ({ id, record: { ...record, kind: 'countdown' }, source: 'countdowns' }))];
      records = entries.filter(({ record }) => valid(record)).map(({ id, record, source }) => ({ ...record, id, source }));
      ready = true;
      const skipped = entries.length - records.length;
      status(skipped ? `已加载；${skipped} 条格式异常的记录未显示。` : '已与云端同步。');
      render();
    } catch (error) {
      ready = false;
      status('云端读取失败，请检查网络后点击刷新。');
      $('birthday-empty').textContent = '记录暂时无法加载。';
      console.error(error);
    } finally { busy = false; controls(); }
  }
  async function save(event) {
    event.preventDefault();
    if (!session() || !ready || busy) return;
    const countdown = formCountdown();
    const calendar = countdown ? 'solar' : $('birthday-calendar-type').value;
    const lunar = calendar === 'lunar' ? lunarInput() : null;
    const record = { ...(countdown ? { kind: 'countdown' } : {}), name: $('birthday-name').value.trim(), calendar, date: lunar ? dates.lunarDate(lunar) : $('birthday-date').value, reminder: !countdown && $('birthday-reminder').checked, emailReminder: $('birthday-email-reminder').checked, ...(lunar ? { lunar } : {}) };
    if (!valid(record)) { status('请输入姓名和有效的出生日期，生日不能晚于今天，倒数可选未来日期。'); return; }
    // Generate the ID before writing, so retries update the same entry after a lost response.
    if (!editingId) editingId = crypto.randomUUID();
    const id = editingId;
    busy = true; controls(); status('正在保存…');
    try {
      await request(`/${encodeURIComponent(id)}`, 'PUT', record, editingSource);
      records = records.filter((item) => item.id !== id || item.source !== editingSource).concat({ ...record, id, source: editingSource });
      reset(); render();
      status('记录已保存，邮件设置将在下一次每日检查时生效。日历设置修改后需重新下载并导入。');
    } catch (error) {
      status('保存未确认成功，输入已保留。请重试或刷新确认云端记录。'); console.error(error);
    } finally { busy = false; controls(); }
  }
  async function remove(record) {
    if (!session() || !ready || busy || !window.confirm(`确定删除“${record.name}”的记录吗？已导入的日历事件需在日历中另行删除。`)) return;
    busy = true; controls();
    try {
      await request(`/${encodeURIComponent(record.id)}`, 'DELETE', undefined, record.source);
      records = records.filter((item) => item.id !== record.id || item.source !== record.source);
      if (editingId === record.id && editingSource === record.source) reset();
      render(); status('记录已删除，若已导入日历，请同时删除对应事件。');
    } catch (error) { status('删除未确认成功，请刷新确认或重试。'); console.error(error); }
    finally { busy = false; controls(); }
  }
  function download() {
    if (!session() || !ready || busy) return;
    const blob = new Blob([dates.calendar(records.filter(record => !isCountdown(record)))], { type: 'text/calendar;charset=utf-8' });
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
  if (new URLSearchParams(window.location.search).get('kind') === 'countdown') $('birthday-kind').value = 'countdown';
  updateMonths(); conversion();
  $('birthday-kind').addEventListener('change', () => { conversion(); controls(); });
  $('birthday-calendar-type').addEventListener('change', conversion);
  $('birthday-date').addEventListener('input', conversion);
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

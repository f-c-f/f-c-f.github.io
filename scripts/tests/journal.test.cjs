const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise page events with a small DOM and an isolated Firebase transport.
function setup({ cloud = null, fail = false, storageFailure = false, initialStorage = {}, beforePut, markdownRenderer, htmlSanitizer, clock } = {}) {
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.isConnected = true; this.value = ''; this.children = []; this.events = {}; this.dataset = {}; this.classList = { toggle() {} }; }
    addEventListener(event, action) { this.events[event] = action; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    remove() {}
    click() {}
    fire(event) { return this.events[event]?.({ target: this }); }
  }
  const elements = new Map(), storage = new Map(Object.entries(initialStorage)), requests = [], timers = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  let remote = cloud;
  const context = {
    document: { getElementById: el, createElement: tag => new Element(tag), body: new Element(), addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem(key, value) { if (storageFailure) throw Error('quota'); storage.set(key, value); }, removeItem: key => storage.delete(key) },
    location: {}, Option: function(text, value) { this.text = text; this.value = value; },
    setInterval(fn, ms) { timers.set(ms, fn); }, setTimeout: () => 1, clearTimeout() {}, AbortController,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (fail) throw Error('offline');
      const date = url.match(/\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
      const value = date ? remote?.[date] ?? null : remote;
      if (options.method === 'PUT') { if (beforePut) await beforePut(); remote = { ...remote, [date]: JSON.parse(options.body) }; }
      return { ok: true, headers: { get: () => '"test-version"' }, json: async () => value };
    }
  };
  if (clock) context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [clock()])); } static now() { return clock(); } };
  context.window = { marked: markdownRenderer, DOMPurify: htmlSanitizer, JournalCarryover: require('../../subsystem/journal/carryover.js'), subsystemSession: { isLoggedIn: () => true }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../../subsystem/journal/app.js', 'utf8'), context);
  return { el, storage, requests, setRemote(value) { remote = value; }, getRemote: () => remote, tick: ms => timers.get(ms)?.(), setFail(value) { fail = value; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const localDay = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

test('draft survives date navigation and Firebase saves only the selected day', async () => {
  const app = setup(); await settle();
  const date = app.el('journal-date').value;
  assert.equal(date, localDay());
  assert.equal(app.el('journal-fallback').value, '');
  app.el('journal-fallback').value = '## 今日完成\n- 完成实验'; app.el('journal-fallback').fire('input');
  app.el('journal-projects').value = '科研，科研,代码'; app.el('journal-projects').fire('input');
  app.el('journal-date').value = '2024-02-29'; app.el('journal-date').fire('change');
  app.el('journal-date').value = date; app.el('journal-date').fire('change');
  assert.match(app.el('journal-fallback').value, /完成实验/);
  await app.el('journal-save').fire('click');
  const writes = app.requests.filter(item => item.options.method === 'PUT');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options.headers['if-match'], '"test-version"');
  assert.deepEqual(app.getRemote()[date].projects, ['科研', '代码']);
  assert.deepEqual(JSON.parse(app.storage.get('work-journal-drafts-v1')), {});
  app.el('journal-fallback').value += '\n- 下午继续完成联调'; app.el('journal-fallback').fire('input');
  await app.el('journal-save').fire('click');
  assert.equal(Object.keys(app.getRemote()).length, 1);
  assert.match(app.getRemote()[date].content, /下午继续完成联调/);
});

test('a concurrent cloud edit is not overwritten and the local draft remains', async () => {
  const app = setup(); await settle();
  const date = app.el('journal-date').value;
  app.el('journal-fallback').value = '本机内容'; app.el('journal-fallback').fire('input');
  app.setRemote({ [date]: { date, title: '', content: '另一台设备', updatedAt: 'later' } });
  await app.el('journal-save').fire('click');
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 0);
  assert.match(app.el('journal-status').textContent, /云端已有更新/);
  assert.equal(JSON.parse(app.storage.get('work-journal-drafts-v1'))[date].content, '本机内容');
});

test('offline first load permits local drafts but does not allow a blind cloud write', async () => {
  const app = setup({ fail: true }); await settle();
  assert.equal(app.el('journal-save').disabled, true);
  app.el('journal-fallback').value = '离线进展'; app.el('journal-fallback').fire('input');
  assert.match(app.storage.get('work-journal-drafts-v1'), /离线进展/);
  assert.match(app.el('journal-sync').textContent, /offline/);
});

test('Firebase omitted empty project arrays remain readable and editable', async () => {
  const date = localDay(), app = setup({ cloud: { [date]: { date, title: '旧记录', content: '已完成', updatedAt: 'earlier' } } });
  await settle();
  assert.equal(app.el('journal-title').value, '旧记录');
  assert.equal(app.el('journal-projects').value, '');
  app.el('journal-fallback').value = '补充内容'; app.el('journal-fallback').fire('input');
  await app.el('journal-save').fire('click');
  assert.equal(app.getRemote()[date].content, '补充内容');
});

test('leap day calendar and Monday week boundaries are correct', async () => {
  const app = setup(); await settle();
  app.el('journal-date').value = '2024-02-29'; app.el('journal-date').fire('change');
  assert.equal(app.el('journal-calendar').children.filter(item => item.events.click).length, 29);
  assert.match(app.el('journal-week-label').textContent, /2024-02-26 — 2024-03-03/);
  app.el('journal-date').value = '2024-02-30'; app.el('journal-date').fire('change');
  assert.equal(app.el('journal-date').value, '2024-02-29');
});

test('storage failure blocks navigation away from an unsaved draft', async () => {
  const app = setup({ storageFailure: true }); await settle();
  const date = app.el('journal-date').value;
  app.el('journal-fallback').value = '重要进展'; app.el('journal-fallback').fire('input');
  app.el('journal-date').value = '2024-02-29'; app.el('journal-date').fire('change');
  assert.match(app.el('journal-status').textContent, /本地存储不可用/);
  assert.equal(app.el('journal-fallback').value, '重要进展');
  await app.el('journal-save').fire('click');
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 0);
});

const carry = require('../../subsystem/journal/carryover.js');
test('30-second autosave writes changed content once and skips unchanged content', async () => {
  const app = setup(); await settle();
  await app.tick(30000); assert.equal(app.requests.length, 1);
  app.el('journal-fallback').value = '自动保存内容'; app.el('journal-fallback').fire('input');
  await app.tick(30000);
  assert.equal(app.getRemote()[localDay()].content, '自动保存内容');
  assert.match(app.el('journal-status').textContent, /已自动保存/);
  await app.tick(30000);
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 1);
});
test('typing during an autosave is retained for the next save and the editor stays enabled', async () => {
  let release;
  const app = setup({ beforePut: () => new Promise(resolve => { release = resolve; }) }); await settle();
  app.el('journal-fallback').value = '第一版'; app.el('journal-fallback').fire('input');
  const pending = app.tick(30000); await settle();
  assert.equal(app.el('journal-fallback').disabled, false);
  app.el('journal-fallback').value = '第二版'; app.el('journal-fallback').fire('input');
  await app.tick(30000);
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 1);
  release(); await pending;
  assert.equal(app.getRemote()[localDay()].content, '第一版');
  assert.equal(JSON.parse(app.storage.get('work-journal-drafts-v1'))[localDay()].content, '第二版');
  const next = app.tick(30000); await settle(); release(); await next;
  assert.equal(app.getRemote()[localDay()].content, '第二版');
});
test('switching dates during autosave cannot write the old content into the new date', async () => {
  let release;
  const app = setup({ beforePut: () => new Promise(resolve => { release = resolve; }) }); await settle();
  const original = localDay();
  app.el('journal-fallback').value = '今天的内容'; app.el('journal-fallback').fire('input');
  const pending = app.tick(30000); await settle();
  app.el('journal-date').value = '2024-02-29'; app.el('journal-date').fire('change');
  app.el('journal-fallback').value = '另一天的内容'; app.el('journal-fallback').fire('input');
  release(); await pending;
  assert.equal(app.getRemote()[original].content, '今天的内容');
  assert.equal(app.getRemote()['2024-02-29'], undefined);
  assert.equal(app.el('journal-fallback').value, '另一天的内容');
});
test('autosave preserves failed drafts and retries network failures, but pauses on conflict', async () => {
  const app = setup(); await settle();
  app.el('journal-fallback').value = '本机内容'; app.el('journal-fallback').fire('input');
  app.setFail(true); await app.tick(30000);
  assert.match(app.storage.get('work-journal-drafts-v1'), /本机内容/);
  app.setFail(false); await app.tick(30000);
  assert.equal(app.getRemote()[localDay()].content, '本机内容');
  app.el('journal-fallback').value = '本机再修改'; app.el('journal-fallback').fire('input');
  app.setRemote({ [localDay()]: record(localDay(), '其他设备内容') });
  await app.tick(30000); const count = app.requests.length;
  await app.tick(30000); assert.equal(app.requests.length, count);
  assert.match(app.el('journal-status').textContent, /自动保存已暂停/);
});
test('weekly and historical records start collapsed and retain explicit expansion across renders', async () => {
  const date = localDay(), app = setup({ cloud: { [date]: record(date, '详细正文') } }); await settle();
  const history = app.el('journal-history').children[0], week = app.el('journal-week').children[0];
  assert.equal(history.tagName, 'details'); assert.equal(history.open, false); assert.equal(week.open, false);
  assert.equal(week.children[0].tagName, 'summary');
  assert.doesNotMatch(week.children[0].textContent, /详细正文/);
  assert.equal(week.children[1].textContent, '');
  week.open = true; week.fire('toggle');
  assert.equal(week.children[1].textContent, '详细正文');
  app.el('journal-title').value = '新标题'; app.el('journal-title').fire('input');
  assert.equal(app.el('journal-week').children[0].open, true);
  assert.equal(app.el('journal-history').children[0].open, false);
});
test('expanded journal bodies render sanitized Markdown lazily and label missing project tags clearly', async () => {
  const parsed = [], sanitized = [], date = localDay();
  const app = setup({ cloud: { [date]: record(date, '## 任务\n**重点**') },
    markdownRenderer: { parse(text) { parsed.push(text); return '<h2>任务</h2><strong>重点</strong><script>bad()</script>'; } },
    htmlSanitizer: { sanitize(html) { sanitized.push(html); return '<h2>任务</h2><strong>重点</strong>'; } } });
  await settle();
  const week = app.el('journal-week').children[0];
  assert.equal(week.children[0].textContent, date);
  assert.match(app.el('journal-history').children[0].children[0].textContent, /未设置项目/);
  assert.equal(parsed.length, 0);
  week.open = true; week.fire('toggle');
  assert.equal(parsed[0], '## 任务\n**重点**'); assert.equal(sanitized.length, 1);
  assert.equal(week.children[1].innerHTML, '<h2>任务</h2><strong>重点</strong>');
  week.fire('toggle'); assert.equal(parsed.length, 1);
});
const record = (date, content) => ({ date, title: '', projects: [], content, updatedAt: '2026-01-01T00:00:00Z' });
test('yesterday plans initialize today once and remain independent after saving', async () => {
  const date = localDay(), yesterday = carry.previousDay(date);
  const source = record(yesterday, '## 明日计划\n- [ ] 阅读论文\n- [x] 已完成\n- [ ] 跑实验');
  const app = setup({ cloud: { [yesterday]: source } }); await settle();
  assert.equal(app.el('journal-fallback').value, '## 今日任务\n- [ ] 阅读论文\n- [ ] 跑实验\n');
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 0);
  app.el('journal-today').fire('click');
  assert.equal(app.el('journal-fallback').value.match(/阅读论文/g).length, 1);
  app.el('journal-fallback').value = app.el('journal-fallback').value.replace('- [ ] 阅读论文', '- [x] 阅读论文');
  app.el('journal-fallback').fire('input');
  await app.el('journal-save').fire('click');
  assert.equal(app.getRemote()[yesterday].content, source.content);
  assert.equal(app.getRemote()[date].carryover.sourceDate, yesterday);
  const reopened = setup({ cloud: app.getRemote() }); await settle();
  assert.match(reopened.el('journal-fallback').value, /\[x\] 阅读论文/);
  assert.equal(reopened.el('journal-fallback').value.match(/跑实验/g).length, 1);
});
test('existing cloud entries and local drafts are never replaced by automatic carryover', async () => {
  const date = localDay(), yesterday = carry.previousDay(date), source = record(yesterday, '## 明日计划\n- [ ] 跑实验');
  const app = setup({ cloud: { [yesterday]: source, [date]: record(date, '已经写好的内容') } }); await settle();
  assert.equal(app.el('journal-fallback').value, '已经写好的内容');
  const draftApp = setup({ cloud: { [yesterday]: source }, initialStorage: { 'work-journal-drafts-v1': JSON.stringify({ [date]: record(date, '尚未保存的内容') }) } });
  await settle(); assert.equal(draftApp.el('journal-fallback').value, '尚未保存的内容');
});
test('offline cached plans do not initialize today before the cloud has been checked', async () => {
  const yesterday = carry.previousDay(localDay());
  const app = setup({ fail: true, initialStorage: { 'work-journal-cache-v1': JSON.stringify({ [yesterday]: record(yesterday, '## 明日计划\n- [ ] 跑实验') }) } });
  await settle(); assert.equal(app.el('journal-fallback').value, '');
  assert.equal(app.el('journal-carry-panel').hidden, true);
});
test('missing yesterday offers a manual import from the most recent journal, only once', async () => {
  const date = localDay(), prior = carry.previousDay(carry.previousDay(date));
  const app = setup({ cloud: { [prior]: record(prior, '## 明日计划\n- [ ] 跑实验') } }); await settle();
  assert.equal(app.el('journal-fallback').value, '');
  assert.equal(app.el('journal-carry-panel').hidden, false);
  app.el('journal-fallback').value = '## 今日完成\n已有内容'; app.el('journal-fallback').fire('input');
  app.el('journal-carry').fire('click'); app.el('journal-carry').fire('click');
  assert.match(app.el('journal-fallback').value, /今日任务/);
  assert.match(app.el('journal-fallback').value, /已有内容/);
  assert.equal(app.el('journal-fallback').value.match(/跑实验/g).length, 1);
  assert.equal(app.el('journal-carry-panel').hidden, true);
});
test('an empty or completed tomorrow section does not create a new draft', async () => {
  const yesterday = carry.previousDay(localDay());
  const app = setup({ cloud: { [yesterday]: record(yesterday, '## 明日计划\n- [ ] 填写明日计划\n- [x] 已完成') } }); await settle();
  assert.equal(app.el('journal-fallback').value, '');
  assert.equal(app.storage.get('work-journal-drafts-v1'), undefined);
});
test('an untouched blank draft can initialize but clearing imported tasks does not re-import', async () => {
  const date = localDay(), yesterday = carry.previousDay(date);
  const cloud = { [yesterday]: record(yesterday, '## 明日计划\n- [ ] 跑实验') };
  const app = setup({ cloud, initialStorage: { 'work-journal-drafts-v1': JSON.stringify({ [date]: record(date, '') }) } });
  await settle(); assert.match(app.el('journal-fallback').value, /跑实验/);
  app.el('journal-fallback').value = ''; app.el('journal-fallback').fire('input');
  const reopened = setup({ cloud, initialStorage: { 'work-journal-drafts-v1': app.storage.get('work-journal-drafts-v1') } });
  await settle(); assert.equal(reopened.el('journal-fallback').value, '');
});
test('plain yesterday plans initialize today and can also be imported into an existing draft', async () => {
  const date = localDay(), yesterday = carry.previousDay(date);
  const cloud = { [yesterday]: record(yesterday, '## 明日计划\n- 阅读论文\n- 跑实验\n- [x] 已完成') };
  const app = setup({ cloud }); await settle();
  assert.equal(app.el('journal-fallback').value, '## 今日任务\n- [ ] 阅读论文\n- [ ] 跑实验\n');
  const draftApp = setup({ cloud, initialStorage: { 'work-journal-drafts-v1': JSON.stringify({ [date]: record(date, '已有正文') }) } });
  await settle(); assert.equal(draftApp.el('journal-fallback').value, '已有正文');
  assert.equal(draftApp.el('journal-carry-panel').hidden, false);
  assert.equal(draftApp.el('journal-carry').textContent, '从昨天日志带入');
  draftApp.el('journal-carry').fire('click'); draftApp.el('journal-carry').fire('click');
  assert.match(draftApp.el('journal-fallback').value, /已有正文/);
  assert.equal(draftApp.el('journal-fallback').value.match(/阅读论文/g).length, 1);
});
test('daily progress and weekly completion summary reflect checked today tasks only', async () => {
  const date = localDay();
  const app = setup({ cloud: { [date]: record(date, '## 今日任务\n- [x] 阅读论文\n- [ ] 跑实验\n## 明日计划\n- [x] 明天事项') } });
  await settle();
  assert.equal(app.el('journal-task-progress').textContent, '今日任务 · 已完成 1 / 2');
  assert.equal(app.el('journal-week-completed-title').textContent, '本周已完成任务（1）');
  assert.equal(app.el('journal-week-completed').children[0].textContent, `${date} · 阅读论文`);
  app.el('journal-fallback').value = app.el('journal-fallback').value.replace('- [ ] 跑实验', '- [x] 跑实验'); app.el('journal-fallback').fire('input');
  assert.equal(app.el('journal-task-progress').textContent, '今日任务 · 已完成 2 / 2');
  assert.equal(app.el('journal-week-completed').children.length, 2);
});

test('completed task summaries render inline Markdown and old escaped strike-through without changing records', async () => {
  const date = localDay(), calls = [];
  const content = '## 今日任务\n- [x] \\~\\~办牌照\\~\\~\n- [x] **论文报销**';
  const app = setup({
    cloud: { [date]: record(date, content) },
    markdownRenderer: { parseInline(text) { calls.push(text); return '<del>办牌照</del>'; } },
    htmlSanitizer: { sanitize(html, options) {
      assert.deepEqual(Array.from(options.ALLOWED_TAGS), ['del', 's', 'strong', 'em', 'code', 'a', 'br']);
      return html;
    } }
  });
  await settle();
  assert.ok(calls.includes('~~办牌照~~'));
  assert.ok(calls.includes('**论文报销**'));
  const line = app.el('journal-week-completed').children[0];
  assert.equal(line.children[0].textContent, `${date} · `);
  assert.equal(line.children[1].innerHTML, '<del>办牌照</del>');
  assert.equal(app.getRemote()[date].content, content);
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 0);
});

test('first open after midnight merges yesterday pending tasks then imports them today', async () => {
  const date = localDay(), yesterday = require('../../subsystem/journal/carryover.js').previousDay(date);
  const original = '## 今日任务\n- [ ] 阅读论文\n- [x] 完成实验\n## 明日计划\n- 跑实验';
  const app = setup({ cloud: { [yesterday]: record(yesterday, original) } }); await settle(); await settle();
  assert.match(app.getRemote()[yesterday].content, /## 明日计划\n- \[ \] 阅读论文/);
  assert.match(app.el('journal-fallback').value, /阅读论文/);
  assert.match(app.el('journal-fallback').value, /跑实验/);
  assert.doesNotMatch(app.el('journal-fallback').value, /完成实验/);
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 1);
  await app.el('journal-reload').fire('click');
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 1);
});

test('an open page crossing midnight saves unfinished tasks and switches to the new day', async () => {
  let now = new Date('2026-10-22T23:59:59').getTime();
  const date = '2026-10-22', app = setup({ clock: () => now, cloud: { [date]: record(date, '## 今日任务\n- [ ] 阅读') } });
  await settle();
  app.el('journal-fallback').value += '\n- [ ] 新增任务'; app.el('journal-fallback').fire('input');
  now = new Date('2026-10-23T00:00:01').getTime();
  await app.tick(15000);
  assert.equal(app.el('journal-date').value, '2026-10-23');
  assert.match(app.getRemote()[date].content, /## 明日计划\n- \[ \] 阅读\n- \[ \] 新增任务/);
  assert.match(app.el('journal-fallback').value, /新增任务/);
  await app.tick(15000);
  assert.equal(app.requests.filter(item => item.options.method === 'PUT').length, 1);
});

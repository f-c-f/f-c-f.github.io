const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise page events with a small DOM and an isolated Firebase transport.
function setup({ cloud = null, fail = false, storageFailure = false, initialStorage = {} } = {}) {
  class Element {
    constructor() { this.value = ''; this.children = []; this.events = {}; this.dataset = {}; this.classList = { toggle() {} }; }
    addEventListener(event, action) { this.events[event] = action; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    remove() {}
    click() {}
    fire(event) { return this.events[event]?.({ target: this }); }
  }
  const elements = new Map(), storage = new Map(Object.entries(initialStorage)), requests = [];
  const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  let remote = cloud;
  const context = {
    document: { getElementById: el, createElement: () => new Element(), body: new Element(), addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem(key, value) { if (storageFailure) throw Error('quota'); storage.set(key, value); }, removeItem: key => storage.delete(key) },
    location: {}, Option: function(text, value) { this.text = text; this.value = value; },
    setInterval() {}, setTimeout: () => 1, clearTimeout() {}, AbortController,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (fail) throw Error('offline');
      const date = url.match(/\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
      const value = date ? remote?.[date] ?? null : remote;
      if (options.method === 'PUT') remote = { ...remote, [date]: JSON.parse(options.body) };
      return { ok: true, headers: { get: () => '"test-version"' }, json: async () => value };
    }
  };
  context.window = { JournalCarryover: require('../../subsystem/journal/carryover.js'), subsystemSession: { isLoggedIn: () => true }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../../subsystem/journal/app.js', 'utf8'), context);
  return { el, storage, requests, setRemote(value) { remote = value; }, getRemote: () => remote };
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

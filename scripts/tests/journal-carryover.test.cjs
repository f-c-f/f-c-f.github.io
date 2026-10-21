const { test } = require('node:test');
const assert = require('node:assert/strict');
const carry = require('../../subsystem/journal/carryover.js');

test('previous date respects leap days and year boundaries', () => {
  assert.equal(carry.previousDay('2024-03-01'), '2024-02-29');
  assert.equal(carry.previousDay('2026-01-01'), '2025-12-31');
});
test('only actual unfinished tomorrow tasks are extracted', () => {
  const markdown = '## 今日待办\n- [ ] 不应带入\n## 明日计划\n- [ ] 阅读论文\n- [x] 已完成\n- [X] 已完成二\n- [ ] 填写明日计划\n- [ ] \n* [ ] 阅读论文\n+ [ ] 整理 [实验](https://example.com)\n### 子项目\n- [ ] 跑实验\n```md\n- [ ] 示例代码任务\n```\n## 思考\n- [ ] 其他事项';
  assert.deepEqual(carry.tasks(markdown), ['阅读论文', '整理 [实验](https://example.com)', '跑实验']);
});
test('code examples cannot introduce a tomorrow section', () => {
  assert.deepEqual(carry.tasks('~~~md\n## 明日计划\n- [ ] 示例\n~~~\n## 今日完成\n- [ ] 完成'), []);
});
test('ordinary bullet and numbered plans become pending tasks while checked items stay excluded', () => {
  assert.deepEqual(carry.tasks('## 明日计划\n- 阅读论文\n* 整理结果\n1. 跑实验\n2) 写总结\n- [x] 已完成\n- [ ] 检查数据\n- [ ]\n## 今日完成\n- 其他事项'), ['阅读论文', '整理结果', '跑实验', '写总结', '检查数据']);
});
test('today section insertion preserves user notes and completed task states', () => {
  const before = '## 今日待办\n- [x] 阅读论文\n\n## 今日完成\n保留正文';
  assert.equal(carry.insert(before, ['阅读论文', '跑实验']), '## 今日待办\n- [ ] 跑实验\n- [x] 阅读论文\n\n## 今日完成\n保留正文');
  assert.equal(carry.insert(before, ['阅读论文']), before);
});
test('example today headings are ignored when inserting', () => {
  const example = '```md\n## 今日待办\n```';
  assert.equal(carry.insert(example, ['跑实验']), '## 今日任务\n- [ ] 跑实验\n\n' + example);
});
test('progress counts only today tasks and supports the legacy heading', () => {
  const markdown = '## 今日任务\n- [x] 阅读论文\n- [ ] 跑实验\n- [ ] 填写今日任务\n```md\n- [x] 示例\n```\n## 进展与记录\n- [x] 记录里的复选框\n## 明日计划\n- [x] 明天事项';
  assert.deepEqual(carry.progress(markdown), { total: 2, done: 1, completed: ['阅读论文'] });
  assert.deepEqual(carry.progress('## 今日待办\n- [X] 已完成\n- 尚未完成'), { total: 2, done: 1, completed: ['已完成'] });
});
test('the three-section template is repeatable and does not duplicate imported or legacy tasks', () => {
  const empty = carry.template('');
  assert.match(empty, /## 今日任务/); assert.match(empty, /## 进展与记录/); assert.match(empty, /## 明日计划/);
  assert.doesNotMatch(empty, /## 今日完成/); assert.equal(carry.template(empty), empty);
  const imported = carry.insert('', ['阅读论文']);
  const combined = carry.template(imported);
  assert.equal(combined.match(/## 今日任务/g).length, 1);
  assert.equal(carry.progress(combined).total, 1);
  const legacy = '## 今日待办\n- [x] 历史任务\n\n## 今日完成\n原记录';
  const upgraded = carry.template(legacy);
  assert.equal(upgraded.startsWith(legacy), true); assert.doesNotMatch(upgraded, /## 今日任务/);
  assert.equal(upgraded.match(/## 今日完成/g).length, 1);
});

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
test('today section insertion preserves user notes and completed task states', () => {
  const before = '## 今日待办\n- [x] 阅读论文\n\n## 今日完成\n保留正文';
  assert.equal(carry.insert(before, ['阅读论文', '跑实验']), '## 今日待办\n- [ ] 跑实验\n- [x] 阅读论文\n\n## 今日完成\n保留正文');
  assert.equal(carry.insert(before, ['阅读论文']), before);
});
test('example today headings are ignored when inserting', () => {
  const example = '```md\n## 今日待办\n```';
  assert.equal(carry.insert(example, ['跑实验']), '## 今日待办\n- [ ] 跑实验\n\n' + example);
});

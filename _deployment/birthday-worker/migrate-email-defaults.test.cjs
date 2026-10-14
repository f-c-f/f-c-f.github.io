const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('./migrate-email-defaults.cjs');
const url = 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app';
test('只补齐缺失邮件字段，保留关闭状态和其他生日字段', async () => {
  const data = { old: { name: '测试', date: '2000-01-01', reminder: false }, off: { name: '关闭', date: '2000-01-01', emailReminder: false } };
  let writes = 0;
  const fetchImpl = async (address, options) => {
    if (address.endsWith('/birthdays.json')) return { ok: true, json: async () => data };
    const id = address.split('/').pop().replace('.json', '');
    if (options.method === 'PUT') {
      assert.equal(id, 'old'); assert.equal(options.headers['If-Match'], 'record-etag');
      assert.deepEqual(JSON.parse(options.body), { ...data.old, emailReminder: true }); writes++;
      return { ok: true, status: 200 };
    }
    return { ok: true, json: async () => data[id], headers: { get: () => 'record-etag' } };
  };
  const summary = await migrate(url, fetchImpl);
  assert.deepEqual(summary.updated, ['old']); assert.equal(summary.preserved, 1); assert.equal(writes, 1);
});
test('并发编辑产生412时不覆盖新选择', async () => {
  const data = { old: { name: '测试', date: '2000-01-01' } };
  const summary = await migrate(url, async (address, options) => {
    if (options.method === 'PUT') return { ok: false, status: 412 };
    return { ok: true, json: async () => address.endsWith('/birthdays.json') ? data : data.old, headers: { get: () => 'old-etag' } };
  });
  assert.equal(summary.conflicts, 1); assert.equal(summary.updated.length, 0);
});

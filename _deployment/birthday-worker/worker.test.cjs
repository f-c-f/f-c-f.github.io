const test = require('node:test');
const assert = require('node:assert/strict');
const { dueReminders, deliveryKey } = require('./worker.cjs');
const { main } = require('./worker.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const dates = require('./dates.js');
const solar = (date, enabled = true) => ({ name: '测试亲友', date, calendar: 'solar', emailReminder: enabled });
test('只有明确开启邮件提醒的记录会进入7/1/0天提醒', () => {
  const result = dueReminders({ seven: solar('2000-10-21'), one: solar('2000-10-15'), today: solar('2000-10-14'), none: solar('2000-10-16'), off: solar('2000-10-14', false), calendarOnly: { name: '仅日历', date: '2000-10-14', reminder: true } }, '2026-10-14');
  assert.deepEqual(result.due.map((item) => item.days), [7, 1, 0]);
  assert.equal(result.enabled, 4);
});
test('跨年和2027年农历春节提前7/1/0天', () => {
  assert.equal(dueReminders({ x: solar('2000-01-01') }, '2026-12-25').due[0].days, 7);
  const lunar = { name: '农历测试', date: '2023-01-22', calendar: 'lunar', lunar: { year: 2023, month: 1, day: 1, leap: false }, emailReminder: true };
  for (const [current, days] of [['2027-01-30', 7], ['2027-02-05', 1], ['2027-02-06', 0]]) assert.equal(dueReminders({ x: lunar }, current).due[0].days, days);
});
test('无效记录被标记；提醒阶段和年度拥有不同的去重键', () => {
  assert.equal(dueReminders({ x: solar('2000-02-31') }, '2026-10-14').invalid, 1);
  const item = { id: 'test', birthday: '2027-02-06', days: 7 };
  assert.equal(deliveryKey(item, 'test@example.com'), deliveryKey(item, 'test@example.com'));
  assert.notEqual(deliveryKey(item, 'test@example.com'), deliveryKey({ ...item, days: 1 }, 'test@example.com'));
  assert.notEqual(deliveryKey(item, 'test@example.com'), deliveryKey({ ...item, birthday: '2028-01-26' }, 'test@example.com'));
});

async function harness(mode, run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'birthday-worker-test-'));
  const configPath = path.join(directory, 'config.json');
  const stateDir = path.join(directory, 'state');
  await fs.writeFile(configPath, JSON.stringify({ databaseUrl: 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app', recipient: 'test@example.com', from: 'Birthday <test@example.com>', mode, stateDir }));
  const previous = { fetch: global.fetch, config: process.env.BIRTHDAY_CONFIG, key: process.env.RESEND_API_KEY, log: console.log };
  process.env.BIRTHDAY_CONFIG = configPath; process.env.RESEND_API_KEY = 'fake-test-key';
  console.log = () => {};
  const today = dates.today();
  const data = { sample: solar(`2000-${today.slice(5)}`) };
  try { await run({ data, stateDir }); }
  finally {
    global.fetch = previous.fetch; console.log = previous.log;
    for (const [name, value] of [['BIRTHDAY_CONFIG', previous.config], ['RESEND_API_KEY', previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('birthday-worker-test-')) throw new Error('Unexpected test cleanup directory');
    await fs.rm(directory, { recursive: true, force: true });
  }
}
test('预览模式只读数据库，不发送邮件或记录已发送', async () => {
  await harness('dry-run', async ({ data, stateDir }) => {
    let calls = 0;
    global.fetch = async (url) => { assert.ok(url.endsWith('/birthdays.json')); calls++; return { ok: true, json: async () => data }; };
    await main([]);
    assert.equal(calls, 1);
    const result = JSON.parse(await fs.readFile(path.join(stateDir, 'last-run.json'), 'utf8'));
    assert.equal(result.due, 1); assert.equal(result.sent, 0); assert.equal(result.mode, 'dry-run');
    await assert.rejects(fs.readFile(path.join(stateDir, 'sent.json')), { code: 'ENOENT' });
  });
});
test('邮件成功后写入去重记录，重复运行不重复发送', async () => {
  await harness('send', async ({ data, stateDir }) => {
    let emails = 0;
    global.fetch = async (url, options) => {
      if (url.endsWith('/birthdays.json')) return { ok: true, json: async () => data };
      assert.equal(url, 'https://api.resend.com/emails'); assert.equal(options.method, 'POST');
      assert.ok(options.headers['Idempotency-Key']);
      assert.deepEqual(JSON.parse(options.body).to, ['test@example.com']);
      emails++; return { ok: true, json: async () => ({ id: 'fake-receipt' }) };
    };
    await main([]); await main([]);
    assert.equal(emails, 1);
    assert.equal(Object.keys(JSON.parse(await fs.readFile(path.join(stateDir, 'sent.json'), 'utf8'))).length, 1);
  });
});
test('发送失败不误记成功，稍后重试使用相同幂等键', async () => {
  await harness('send', async ({ data, stateDir }) => {
    const keys = [];
    global.fetch = async (url, options) => {
      if (url.endsWith('/birthdays.json')) return { ok: true, json: async () => data };
      keys.push(options.headers['Idempotency-Key']);
      return keys.length === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ id: 'fake-retry-receipt' }) };
    };
    await assert.rejects(main([]), /HTTP 503/);
    await assert.rejects(fs.readFile(path.join(stateDir, 'sent.json')), { code: 'ENOENT' });
    await main([]);
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  });
});
test('测试邮件可独立发送，每日任务仍保持预览模式', async () => {
  await harness('dry-run', async ({ stateDir }) => {
    let calls = 0;
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(JSON.parse(options.body).subject, '生日提醒部署测试');
      calls++; return { ok: true, json: async () => ({ id: 'fake-test-email' }) };
    };
    await main(['--test-email']); assert.equal(calls, 1);
    await assert.rejects(fs.readFile(path.join(stateDir, 'sent.json')), { code: 'ENOENT' });
    await assert.rejects(main(['--test-email', '--dry-run']), /Cannot combine/);
  });
});

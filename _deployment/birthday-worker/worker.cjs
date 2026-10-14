'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dates = require('./dates.js');

function dueReminders(data, current = dates.today()) {
  if (data === null) return { due: [], total: 0, enabled: 0, invalid: 0 };
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid birthdays database response');
  const due = [];
  let enabled = 0, invalid = 0;
  for (const [id, record] of Object.entries(data)) {
    if (!record || record.emailReminder !== true) continue;
    enabled++;
    try {
      if (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80 || !dates.parse(record.date) || record.date > current) throw new Error('Invalid birthday');
      if (record.calendar === 'lunar') {
        const lunar = record.lunar;
        if (!lunar || !Number.isInteger(lunar.year) || lunar.year < 1900 || !Number.isInteger(lunar.month) || lunar.month < 1 || lunar.month > 12 || !Number.isInteger(lunar.day) || lunar.day < 1 || lunar.day > 30 || typeof lunar.leap !== 'boolean' || dates.lunarDate(lunar) !== record.date) throw new Error('Invalid lunar birthday');
      } else if (record.calendar && record.calendar !== 'solar') throw new Error('Invalid calendar');
      const next = dates.nextRecord(record, current);
      if ([7, 1, 0].includes(next.days)) due.push({ id, name: record.name.trim(), calendar: record.calendar || 'solar', birthday: next.date, days: next.days });
    } catch (_) { invalid++; }
  }
  return { due, total: Object.keys(data).length, enabled, invalid };
}
function message(item) {
  const when = item.days === 0 ? '今天' : `${item.days} 天后`;
  return { subject: `生日提醒：${item.name}${when}过生日`, text: `${item.name}的${item.calendar === 'lunar' ? '农历' : '公历'}生日${when}到来。\n本次对应公历日期：${item.birthday}\n记得提前准备祝福。\n\n此提醒来自你的亲友生日工具（北京时间）。` };
}
function deliveryKey(item, recipient) {
  return crypto.createHash('sha256').update(JSON.stringify([item.id, item.birthday, item.days, recipient])).digest('hex');
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}
async function main(args = process.argv.slice(2)) {
  const configPath = process.env.BIRTHDAY_CONFIG || '/etc/birthday-reminder/config.json';
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const testEmail = args.includes('--test-email');
  const dryRun = args.includes('--dry-run') || config.mode !== 'send';
  if (testEmail && args.includes('--dry-run')) throw new Error('Cannot combine --test-email and --dry-run');
  if (!/^https:\/\/[a-z0-9-]+\.asia-southeast1\.firebasedatabase\.app\/?$/i.test(config.databaseUrl)) throw new Error('Unexpected Firebase database URL');
  const stateDir = config.stateDir || '/var/lib/birthday-reminder';
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  let state;
  try { state = JSON.parse(await fs.readFile(path.join(stateDir, 'sent.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = {}; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid delivery state');
  const recipients = config.recipient;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipients || '')) throw new Error('Missing/invalid recipient');
  let apiKey;
  if (!dryRun || testEmail) {
    apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey || !config.from) throw new Error('Missing RESEND_API_KEY or verified sender');
  }
  async function send(mail, key) {
    return request('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'PersonalBirthdayReminder/1.0', Authorization: `Bearer ${apiKey}`, 'Idempotency-Key': key }, body: JSON.stringify({ from: config.from, to: [recipients], ...mail }) });
  }
  if (testEmail) {
    const result = await send({ subject: '生日提醒部署测试', text: '这是一封来自新 VPS 的生日提醒测试邮件。若你收到它，表示邮件 API 已接受发送请求。' }, `test-${crypto.randomUUID()}`);
    console.log(JSON.stringify({ event: 'test_email_accepted', id: result.id })); return;
  }
  const headers = { Accept: 'application/json' };
  if (process.env.FIREBASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.FIREBASE_ACCESS_TOKEN}`;
  const data = await request(`${config.databaseUrl.replace(/\/$/, '')}/birthdays.json`, { headers });
  const current = dates.today();
  const result = dueReminders(data, current);
  let sent = 0, alreadySent = 0;
  for (const item of result.due) {
    const key = deliveryKey(item, recipients);
    if (state[key]) { alreadySent++; continue; }
    if (dryRun) continue;
    const receipt = await send(message(item), key);
    if (typeof receipt.id !== 'string') throw new Error('Unexpected email API receipt');
    state[key] = { sentAt: new Date().toISOString(), id: receipt.id };
    const temporary = path.join(stateDir, 'sent.json.tmp');
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(temporary, path.join(stateDir, 'sent.json'));
    sent++;
  }
  const summary = { event: 'birthday_check', time: new Date().toISOString(), beijingDate: current, mode: dryRun ? 'dry-run' : 'send', total: result.total, enabled: result.enabled, invalid: result.invalid, due: result.due.length, alreadySent, sent };
  await fs.writeFile(path.join(stateDir, 'last-run.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary));
  if (result.invalid) throw new Error('Some enabled birthdays are invalid; review those records');
}
module.exports = { dueReminders, message, deliveryKey, main };
if (require.main === module) main().catch((error) => { console.error(JSON.stringify({ event: 'failure', error: error.message })); process.exitCode = 1; });

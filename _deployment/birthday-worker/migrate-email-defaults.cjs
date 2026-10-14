'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { dueReminders } = require('./worker.cjs');

async function migrate(databaseUrl, fetchImpl = fetch, accessToken) {
  if (!/^https:\/\/[a-z0-9-]+\.asia-southeast1\.firebasedatabase\.app\/?$/i.test(databaseUrl)) throw new Error('Unexpected database URL');
  const headers = { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
  const base = `${databaseUrl.replace(/\/$/, '')}/birthdays`;
  const list = await fetchImpl(`${base}.json`, { headers, signal: AbortSignal.timeout(20000) });
  if (!list.ok) throw new Error(`Database listing failed: HTTP ${list.status}`);
  const data = await list.json();
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) throw new Error('Invalid database response');
  const summary = { total: Object.keys(data || {}).length, updated: [], preserved: 0, invalid: 0, conflicts: 0 };
  for (const id of Object.keys(data || {})) {
    const url = `${base}/${encodeURIComponent(id)}.json`;
    const response = await fetchImpl(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Record read failed: HTTP ${response.status}`);
    const record = await response.json();
    if (record === null) continue;
    if (typeof record !== 'object' || Array.isArray(record)) { summary.invalid++; continue; }
    if (record.emailReminder !== undefined) { summary.preserved++; continue; }
    if (dueReminders({ [id]: { ...record, emailReminder: true } }).invalid) { summary.invalid++; continue; }
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Missing Firebase ETag; refusing an unconditional write');
    const result = await fetchImpl(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify({ ...record, emailReminder: true }), signal: AbortSignal.timeout(20000) });
    if (result.status === 412) { summary.conflicts++; continue; }
    if (!result.ok) throw new Error(`Record update failed: HTTP ${result.status}`);
    summary.updated.push(id);
  }
  return summary;
}
async function main() {
  const config = JSON.parse(await fs.readFile(process.env.BIRTHDAY_CONFIG || '/etc/birthday-reminder/config.json', 'utf8'));
  const summary = await migrate(config.databaseUrl, fetch, process.env.FIREBASE_ACCESS_TOKEN);
  const file = path.join(config.stateDir || '/var/lib/birthday-reminder', `email-default-migration-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify({ time: new Date().toISOString(), ...summary }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ event: 'email_defaults_migrated', ...summary, updated: summary.updated.length }));
  if (summary.conflicts || summary.invalid) throw new Error('Some entries need review before activation');
}
module.exports = { migrate };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

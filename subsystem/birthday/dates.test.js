const test = require('node:test');
const assert = require('node:assert/strict');
const dates = require('./dates');

test('公历验证、跨年、当天、闰日及北京时间', () => {
  assert.equal(dates.parse('2025-02-29'), null);
  assert.equal(dates.parse('2026-04-31'), null);
  assert.equal(dates.next('2000-01-01', '2026-12-25').days, 7);
  assert.equal(dates.next('2000-10-14', '2026-10-14').days, 0);
  assert.equal(dates.next('2000-02-29', '2027-01-01').date, '2027-02-28');
  assert.equal(dates.next('2000-02-29', '2028-01-01').date, '2028-02-29');
  assert.equal(dates.today(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
});

// Reference: Hong Kong Observatory Gregorian–Lunar conversion tables.
// https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/2027e.pdf
test('农历春节、闰二月及下次生日逐年转换', () => {
  const lunar = { year: 2023, month: 1, day: 1, leap: false };
  assert.equal(dates.lunarDate(lunar), '2023-01-22');
  assert.equal(dates.lunarDate(lunar, 2026), '2026-02-17');
  assert.equal(dates.lunarDate(lunar, 2027), '2027-02-06');
  assert.equal(dates.lunarDate({ year: 2023, month: 2, day: 1, leap: true }), '2023-03-22');
  assert.equal(dates.lunarDate({ year: 2026, month: 2, day: 1, leap: true }), null);
  assert.equal(dates.nextRecord({ calendar: 'lunar', lunar }, '2026-10-14').date, '2027-02-06');
  assert.equal(dates.nextRecord({ calendar: 'lunar', lunar }, '2027-02-06').days, 0);
  const twelfthMonth = { year: 2023, month: 12, day: 15, leap: false };
  assert.equal(dates.nextRecord({ calendar: 'lunar', lunar: twelfthMonth }, '2027-01-01').year, 2026);
});

test('闰月缺失回退普通月，三十缺失回退廿九', () => {
  const leap = { year: 2023, month: 2, day: 1, leap: true };
  assert.equal(dates.lunarDate(leap, 2026, true), dates.lunarDate({ ...leap, leap: false }, 2026));
  assert.equal(dates.lunarDate({ year: 2023, month: 1, day: 30, leap: false }), null);
  assert.equal(dates.lunarDate({ year: 2023, month: 1, day: 30, leap: false }, 2023, true), '2023-02-19');
});

test('边界年份及闰月的每一天均可往返换算', () => {
  for (const year of [1900, 1950, 2000, 2023, 2026, 2027, 2033, 2036]) {
    for (const [key, days] of dates.lunarYear(year)) {
      const [month, leap] = key.split('-');
      days.forEach((date, index) => {
        assert.deepEqual(dates.lunarParts(date), { year, month: Number(month), leap: leap === 'true', day: index + 1 });
      });
    }
  }
});

test('日历逐年转换，三次提醒，北京时间9点，文本转义和UTF-8折行', () => {
  const lunar = { id: 'lunar', name: '张三,;\\\n' + '亲友'.repeat(50), date: '2023-01-22', calendar: 'lunar', lunar: { year: 2023, month: 1, day: 1, leap: false }, reminder: true };
  const calendar = dates.calendar([lunar, { ...lunar, id: 'disabled', reminder: false }], new Date('2026-10-14T00:00:00Z'));
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 10);
  assert.equal((calendar.match(/BEGIN:VALARM/g) || []).length, 30);
  assert.equal((calendar.match(/TRIGGER:-P7D/g) || []).length, 10);
  assert.equal((calendar.match(/TRIGGER:-P1D/g) || []).length, 10);
  assert.equal((calendar.match(/TRIGGER:PT0S/g) || []).length, 10);
  assert.ok(unfolded.includes('DTSTART:20270206T010000Z'));
  assert.ok(unfolded.includes('SUMMARY:张三\\,\\;\\\\\\n'));
  assert.ok(!calendar.includes('birthday-disabled'));
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});

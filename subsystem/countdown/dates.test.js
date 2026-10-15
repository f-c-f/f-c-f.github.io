const test = require('node:test');
const assert = require('node:assert/strict');
const dates = require('./dates');

test('未来年份按完整目标日期计算，不按每年周年循环', () => {
  assert.equal(dates.remaining('2028-01-01', '2026-10-15'), 443);
  assert.ok(dates.valid({ name: '旅行', date: '2035-06-01' }));
  assert.ok(dates.valid({ name: '纪念日', date: '2000-01-01' }));
});
test('当天、到期后、跨年和闰年', () => {
  assert.equal(dates.remaining('2026-10-15', '2026-10-15'), 0);
  assert.equal(dates.remaining('2026-10-14', '2026-10-15'), -1);
  assert.equal(dates.remaining('2027-01-01', '2026-12-31'), 1);
  assert.equal(dates.remaining('2028-03-01', '2028-02-28'), 2);
  assert.equal(dates.remaining('2027-03-01', '2027-02-28'), 1);
  assert.equal(dates.today(new Date('2026-10-15T16:00:00Z')), '2026-10-16');
});
test('拦截无效日期、空名称，支持日期选择器边界', () => {
  for (const date of ['2027-02-29', '2026-04-31', '', null, '1899-12-31']) {
    assert.equal(dates.parse(date), null);
    assert.equal(dates.valid({ name: '事项', date }), false);
  }
  assert.ok(dates.valid({ name: '日期边界', date: '9999-12-31' }));
  assert.equal(dates.valid({ name: '  ', date: '2027-01-01' }), false);
  assert.throws(() => dates.remaining('无效日期'));
});

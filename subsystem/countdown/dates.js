(function (root) {
  'use strict';
  function parse(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
  }
  function today(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  }
  function remaining(target, current = today()) {
    const end = parse(target), start = parse(current);
    if (end === null || start === null) throw new Error('无效日期');
    return Math.round((end - start) / 86400000);
  }
  function valid(record) {
    return !!record && typeof record.name === 'string' && record.name.trim().length > 0
      && record.name.length <= 80 && parse(record.date) !== null;
  }
  const api = { parse, today, remaining, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CountdownDates = api;
})(typeof window !== 'undefined' ? window : globalThis);

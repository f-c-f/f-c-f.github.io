(function (root) {
  'use strict';
  const DAY = 86400000;
  const lunarLibrary = typeof module !== 'undefined' && module.exports ? require('./lunar.js') : root;
  const pad = (value) => String(value).padStart(2, '0');
  function parse(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { year, month, day } : null;
  }
  function today(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type) => parts.find((item) => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function occurrence(birthday, year) {
    const { month, day } = parse(birthday);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${pad(month)}-${pad(Math.min(day, lastDay))}`;
  }
  const lunarCache = new Map();
  function lunarParts(date) {
    const { year, month, day } = parse(date);
    const lunar = lunarLibrary.Solar.fromYmd(year, month, day).getLunar();
    return { year: lunar.getYear(), month: Math.abs(lunar.getMonth()), day: lunar.getDay(), leap: lunar.getMonth() < 0 };
  }
  function lunarYear(year) {
    if (!lunarCache.has(year)) {
      const months = new Map();
      lunarLibrary.LunarYear.fromYear(year).getMonths().filter((month) => month.getYear() === year).forEach((month) => {
        const days = [];
        for (let day = 0; day < month.getDayCount(); day++) days.push(lunarLibrary.Solar.fromJulianDay(month.getFirstJulianDay() + day).toYmd());
        months.set(`${Math.abs(month.getMonth())}-${month.getMonth() < 0}`, days);
      });
      lunarCache.set(year, months);
    }
    return lunarCache.get(year);
  }
  function lunarDate(lunar, year = lunar.year, anniversary = false) {
    const months = lunarYear(year);
    let days = months.get(`${lunar.month}-${lunar.leap}`);
    if (!days && anniversary && lunar.leap) days = months.get(`${lunar.month}-false`);
    if (!days) return null;
    return days[anniversary ? Math.min(lunar.day, days.length) - 1 : lunar.day - 1] || null;
  }
  function nextRecord(record, current = today()) {
    if (record.calendar !== 'lunar') {
      const result = next(record.date, current);
      return { ...result, year: Number(result.date.slice(0, 4)) };
    }
    let year = lunarParts(current).year;
    let date = lunarDate(record.lunar, year, true);
    if (date < current) date = lunarDate(record.lunar, ++year, true);
    if (!date) throw new Error('农历日期无法换算');
    return { date, year, days: Math.round((Date.parse(date) - Date.parse(current)) / DAY) };
  }
  function next(birthday, current = today()) {
    let year = Number(current.slice(0, 4));
    let date = occurrence(birthday, year);
    if (date < current) date = occurrence(birthday, ++year);
    return { date, days: Math.round((Date.parse(date) - Date.parse(current)) / DAY) };
  }
  const escapeText = (text) => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  // RFC 5545 content lines must be folded at 75 octets, without splitting UTF-8 characters.
  function fold(line) {
    let result = '', length = 0;
    for (const character of line) {
      const bytes = new TextEncoder().encode(character).length;
      if (length + bytes > 75) { result += '\r\n '; length = 1; }
      result += character; length += bytes;
    }
    return result;
  }
  function calendar(records, now = new Date()) {
    const current = today(now);
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Personal Tools//Birthdays//ZH', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:亲友生日'];
    records.filter((record) => record.reminder).forEach((record) => {
      const firstYear = nextRecord(record, current).year;
      for (let year = firstYear; year < firstYear + 10; year++) {
        const date = (record.calendar === 'lunar' ? lunarDate(record.lunar, year, true) : occurrence(record.date, year)).replace(/-/g, '');
        lines.push('BEGIN:VEVENT', `UID:birthday-${record.id}-${year}@personal-tools`, `DTSTAMP:${stamp}`, `DTSTART:${date}T010000Z`, `DTEND:${date}T013000Z`, `SUMMARY:${escapeText(record.name)}的生日`, 'TRANSP:TRANSPARENT', `DESCRIPTION:${record.calendar === 'lunar' ? '农历生日逐年换算。无对应闰月时按同名普通月；无三十时按廿九。' : '公历生日。2月29日在非闰年按2月28日。'}北京时间上午9点。`);
        ['-P7D', '-P1D', 'PT0S'].forEach((trigger) => {
          lines.push('BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(record.name)}的生日提醒`, 'END:VALARM');
        });
        lines.push('END:VEVENT');
      }
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  const api = { parse, today, occurrence, next, calendar, lunarParts, lunarYear, lunarDate, nextRecord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BirthdayDates = api;
})(typeof window !== 'undefined' ? window : globalThis);

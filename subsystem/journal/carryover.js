(function (root) {
  'use strict';
  function previousDay(value) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function tasks(markdown) {
    const result = [], seen = new Set();
    let section = 0, fence = null;
    for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        continue;
      }
      if (fence) continue;
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        if (heading[2].replace(/[*_`]/g, '').trim() === '明日计划') section = heading[1].length;
        else if (section && heading[1].length <= section) section = 0;
        continue;
      }
      const task = section && line.match(/^\s*[-*+]\s+\[ \]\s+(.+?)\s*$/);
      if (!task) continue;
      const text = task[1].trim(), normalized = text.replace(/\s+/g, ' ');
      if (!text || text === '填写明日计划' || seen.has(normalized)) continue;
      seen.add(normalized); result.push(text);
    }
    return result;
  }
  function insert(markdown, items) {
    let fence = null, at = -1, offset = 0;
    const existing = new Set();
    for (const line of markdown.split('\n')) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      } else if (!fence) {
        if (at < 0 && /^#{1,6}[ \t]+今日待办[ \t]*#*[ \t]*\r?$/.test(line)) at = offset + line.length;
        const task = line.match(/^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$/);
        if (task) existing.add(task[1].trim().replace(/\s+/g, ' '));
      }
      offset += line.length + 1;
    }
    const lines = [...new Set(items)].filter(text => !existing.has(text.replace(/\s+/g, ' '))).map(text => `- [ ] ${text}`).join('\n');
    if (!lines) return markdown;
    // Insert into a real Today section, retaining the user's text and task states.
    if (at >= 0) {
      return `${markdown.slice(0, at)}\n${lines}${markdown.slice(at)}`;
    }
    return `## 今日待办\n${lines}\n${markdown.trim() ? '\n' + markdown : ''}`;
  }
  const api = { previousDay, tasks, insert };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JournalCarryover = api;
})(typeof window === 'undefined' ? globalThis : window);

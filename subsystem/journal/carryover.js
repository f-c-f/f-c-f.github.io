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
      const item = section && line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
      if (!item) continue;
      const checkbox = item[1].match(/^\[([ xX])\](?:\s+|$)(.*)$/);
      if (checkbox && checkbox[1] !== ' ') continue;
      const text = (checkbox ? checkbox[2] : item[1]).replace(/\u200b/g, '').trim(), normalized = text.replace(/\s+/g, ' ');
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
        if (at < 0 && /^#{1,6}[ \t]+(?:今日任务|今日待办)[ \t]*#*[ \t]*\r?$/.test(line)) at = offset + line.length;
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
    return `## 今日任务\n${lines}\n${markdown.trim() ? '\n' + markdown : ''}`;
  }
  function progress(markdown, includePending = false) {
    const items = new Map();
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
        if (['今日任务', '今日待办'].includes(heading[2].replace(/[*_`]/g, '').trim())) section = heading[1].length;
        else if (section && heading[1].length <= section) section = 0;
        continue;
      }
      const item = section && line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
      if (!item) continue;
      const checkbox = item[1].match(/^\[([ xX])\](?:\s+|$)(.*)$/);
      const text = (checkbox ? checkbox[2] : item[1]).replace(/\u200b/g, '').trim(), normalized = text.replace(/\s+/g, ' ');
      if (!text || ['填写今日任务', '填写今日待办'].includes(text)) continue;
      items.set(normalized, { text, done: Boolean(checkbox && checkbox[1] !== ' ') || Boolean(items.get(normalized)?.done) });
    }
    const completed = [...items.values()].filter(item => item.done).map(item => item.text);
    return { total: items.size, done: completed.length, completed,
      ...(includePending ? { pending: [...items.values()].filter(item => !item.done).map(item => item.text) } : {}) };
  }
  function toTomorrow(markdown) {
    const pending = progress(markdown, true).pending;
    let fence = null, section = 0, at = -1, offset = 0;
    const existing = new Set();
    const normalize = text => text.replace(/\u200b/g, '').trim().replace(/\s+/g, ' ');
    for (const line of markdown.split('\n')) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      } else if (!fence) {
        const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (heading) {
          if (heading[2].replace(/[*_`]/g, '').trim() === '明日计划') {
            section = heading[1].length;
            if (at < 0) at = offset + line.length;
          } else if (section && heading[1].length <= section) section = 0;
        } else if (section) {
          const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
          if (item) existing.add(normalize(item[1].replace(/^\[[ xX]\](?:\s+|$)/, '')));
        }
      }
      offset += line.length + 1;
    }
    const items = pending.filter(text => !existing.has(normalize(text)));
    if (!items.length) return { content: markdown, added: 0 };
    // Do not append a new heading inside an unfinished code block.
    if (at < 0 && fence) return { content: markdown, added: 0, blocked: true };
    const lines = items.map(text => `- [ ] ${text}`).join('\n');
    return { content: at < 0 ? `${markdown.trimEnd()}\n\n## 明日计划\n${lines}\n`
      : `${markdown.slice(0, at)}\n${lines}${markdown.slice(at)}`, added: items.length };
  }
  function template(markdown) {
    let fence = null;
    const headings = new Set();
    for (const line of markdown.split('\n')) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      } else if (!fence) {
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
        if (heading) headings.add(heading[1].replace(/[*_`]/g, '').trim());
      }
    }
    const missing = [];
    if (!headings.has('今日任务') && !headings.has('今日待办')) missing.push('## 今日任务\n- [ ] 填写今日任务');
    if (!headings.has('进展与记录')) missing.push('## 进展与记录\n');
    if (!headings.has('明日计划')) missing.push('## 明日计划\n- [ ] 填写明日计划');
    return missing.length ? [markdown.trimEnd(), ...missing].filter(Boolean).join('\n\n') + '\n' : markdown;
  }
  function asTaskLists(markdown) {
    let section = 0, fence = null;
    return markdown.split('\n').map(line => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        return line;
      }
      if (fence) return line;
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        if (['今日任务', '今日待办'].includes(heading[2].replace(/[*_`]/g, '').trim())) section = heading[1].length;
        else if (section && heading[1].length <= section) section = 0;
        return line;
      }
      const item = section && line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
      if (!item) return line;
      if (/^\[ \]\s*$/.test(item[2])) return `${item[1]}- [ ] \u200b`;
      if (/^\[[ xX]\](?:\s|$)/.test(item[2])) return line;
      return `${item[1]}- [ ] ${item[2]}`;
    }).join('\n');
  }
  function continueTask(markdown, start, end = start) {
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    let fence = null;
    for (const line of markdown.slice(0, lineStart).split('\n')) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      }
    }
    if (fence) return null;
    const before = markdown.slice(lineStart, start);
    const task = before.match(/^(\s*)[-*+]\s+\[[ xX]\]\s+(.*)$/);
    if (!task || start !== end) return null;
    const hasText = task[2].replace(/\u200b/g, '').trim();
    const prefix = hasText ? `\n${task[1]}- [ ] ` : '\n';
    const replaceFrom = hasText ? start : lineStart;
    return { text: markdown.slice(0, replaceFrom) + prefix + markdown.slice(end), caret: replaceFrom + prefix.length };
  }
  const api = { previousDay, tasks, insert, progress, template, asTaskLists, continueTask, toTomorrow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JournalCarryover = api;
})(typeof window === 'undefined' ? globalThis : window);

import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(process.argv[2] || '_site');
const output = path.resolve(process.argv[3] || '_tools_site');
const required = [
  'subsystem/index.html', 'subsystem/accounting/index.html',
  'subsystem/diary/index.html', 'subsystem/weight/index.html',
  'subsystem/journal/index.html',
  'subsystem/video/index.html', 'subsystem/birthday/index.html', 'subsystem/countdown/index.html',
  'subsystem/session.js', 'assets/css/main.css',
];
if (output === source || output.startsWith(source + path.sep) || source.startsWith(output + path.sep)) {
  throw new Error('Build and export directories must be separate.');
}
for (const file of required) {
  const content = await readFile(path.join(source, file), 'utf8');
  if (file.endsWith('.html') && (content.startsWith('---') || content.includes('{%'))) {
    throw new Error(`Unbuilt Jekyll template: ${file}`);
  }
}
try {
  await access(output);
  throw new Error('Export directory already exists; choose a new empty output path.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });
for (const directory of ['subsystem', 'assets', 'images']) {
  await cp(path.join(source, directory), path.join(output, directory), { recursive: true });
}
await writeFile(path.join(output, 'index.html'), await readFile(path.join(output, 'subsystem/index.html'), 'utf8'));
console.log(`Tools exported to ${output}`);

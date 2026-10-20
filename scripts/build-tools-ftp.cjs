// Build only Tools, without requiring Ruby/Jekyll on the build machine.
// npm install --prefix local/tools-builder --no-save sass@1.77.8 liquidjs yaml
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const dependencies = createRequire(path.resolve('local/tools-builder/package.json'));
const sass = dependencies('sass');
const { Liquid } = dependencies('liquidjs');
const YAML = dependencies('yaml');

function splitPage(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('Missing page front matter');
  return { page: YAML.parse(match[1]), body: match[2] };
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function main() {
  const output = path.resolve(process.argv[2] || '_tools_site_ftp');
  try { await fs.access(output); throw new Error('Output already exists; choose a new directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const engine = new Liquid({ root: path.resolve('_includes'), dynamicPartials: false, extname: '' });
  engine.registerFilter('relative_url', value => value);
  const site = { title: 'Tools', baseurl: '', url: '', github: { url: '' }, tools_standalone: true, data: { navigation: { main: [] } } };
  const layout = splitPage(await fs.readFile('_layouts/subsystem.html', 'utf8')).body;
  const masthead = await fs.readFile('_includes/masthead.html', 'utf8');
  const sources = ['_pages/subsystem.html', 'subsystem/index.html', 'subsystem/login.html', ...['diary','journal','weight','video','birthday','countdown'].map(name => `subsystem/${name}/index.html`)];
  await fs.mkdir(output, { recursive: true });
  for (const directory of ['subsystem', 'assets', 'images']) {
    await fs.cp(directory, path.join(output, directory), {
      recursive: true,
      filter: file => !file.endsWith('.html') && !/\.(?:scss|md)$/.test(file) && !file.endsWith('.test.js'),
    });
  }
  const scss = (await fs.readFile('assets/css/main.scss', 'utf8')).replace(/^---\r?\n---\r?\n/, '');
  const css = sass.compileString(scss, { loadPaths: [path.resolve('_sass')], style: 'compressed', logger: sass.Logger.silent }).css;
  await fs.writeFile(path.join(output, 'assets/css/main.css'), css);
  for (const source of sources) {
    const { page, body } = splitPage(await fs.readFile(source, 'utf8'));
    const context = { site, page };
    let html = await engine.parseAndRender(body, context);
    if (page.layout) {
      html = await engine.parseAndRender(layout, { ...context, content: html });
      const nav = await engine.parseAndRender(masthead, context);
      const styles = (page.styles || []).map(url => `<link rel="stylesheet" href="${escape(url)}">`).join('\n');
      const scripts = (page.head_scripts || []).map(url => `<script src="${escape(url)}"></script>`).join('\n');
      html = `<!doctype html><html lang="zh-CN" class="js"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(page.title)} | Tools</title>
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/main.css">${styles}${scripts}
<script type="module" src="/assets/js/main.min.js"></script>
</head><body>${nav}${html}<div class="page__footer"><footer><a href="https://f-c-f.github.io/">个人主页</a></footer></div></body></html>`;
    }
    if (html.includes('{%') || html.includes('{{')) throw new Error(`Unresolved template: ${source}`);
    const relative = page.permalink.replace(/^\//, '') + (page.permalink.endsWith('/') ? 'index.html' : '');
    const target = path.resolve(output, relative);
    if (!target.startsWith(output + path.sep)) throw new Error('Invalid output path');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, html);
  }
  await fs.copyFile(path.join(output, 'subsystem/index.html'), path.join(output, 'index.html'));
  console.log(`FTP upload directory: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

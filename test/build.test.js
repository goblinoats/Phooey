import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseAllDocuments } from 'yaml';
import { build } from '../src/index.js';

async function fixture(t, files) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tonk-builder-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), content);
  }
  return cwd;
}

function documents(yaml) {
  return parseAllDocuments(yaml, { uniqueKeys: false }).map((doc) => {
    assert.deepEqual(doc.errors, []);
    return doc.toJS();
  });
}

test('bundles modules, TS, CSS imports and assets, preserving Tonk template syntax', async (t) => {
  const cwd = await fixture(t, {
    'card.html': '<link rel="stylesheet" href="./styles.css" media="screen"><tonk-display entity={this} model=person /><b html:content={body}>{name}</b><img src="./icon.svg"><script type="module" src="./main.ts"></script>',
    'main.ts': 'import { value } from "./value"; import "./extra.css"; globalThis.answer = value;',
    'value.ts': 'export const value: number = 42;',
    'extra.css': '.extra { color: blue }',
    'styles.css': '@import "./tokens.css"; .card { background-image: url("./icon.svg") }',
    'tokens.css': '.card { color: red }',
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1"/></svg>',
  });
  const config = { name: 'app', entries: [{ name: 'card', entry: 'card.html', model: 'person' }] };
  const result = await build({ cwd, config });
  const row = documents(result.yaml)[0]['view!'];
  assert.equal(row.this, 'id:app/card');
  assert.equal(row.model, 'person');
  assert.match(row.display, /<tonk-display entity=\{this\} model=person \/>/);
  assert.match(row.display, /<b html:content=\{body\}>\{name\}<\/b>/);
  assert.match(row.display, /<tonk-component><script type="tonk\/module">/);
  assert.match(row.display, /answer = value/);
  assert.match(row.display, /value = 42/);
  assert.match(row.display, /media="screen"/);
  assert.match(row.display, /color: red/);
  assert.match(row.display, /color: blue/);
  assert.match(row.display, /src="data:image\/svg\+xml;base64,/);
  assert.match(row.display, /url\(["']?data:image\/svg\+xml/);
  assert.doesNotMatch(row.display, /src="\.\/|href="\.\/|@import/);
  assert.ok(result.files.includes(path.join(cwd, 'tokens.css')));
  assert.equal(await readFile(result.outFile, 'utf8'), result.yaml);
  assert.equal((await build({ cwd, config, write: false })).yaml, result.yaml, 'rebuild is deterministic');
});

test('inline JavaScript is safe against HTML script terminators and survives YAML', async (t) => {
  const value = '</ScRiPt><script>bad()</script>\n{interpolation}: # 😀';
  const cwd = await fixture(t, {
    'index.html': '<script type="module" src="main.js"></script>',
    'main.js': `globalThis.terminator = ${JSON.stringify(value)};`,
  });
  const result = await build({ cwd, config: { name: 'x', entries: [{ name: 'x', kind: 'view', model: 'person', entry: 'index.html' }] }, write: false });
  const html = documents(result.yaml)[0]['view!'].display;
  assert.equal((html.match(/<\/script>/gi) ?? []).length, 1);
  const js = html.match(/<script type="tonk\/module">([\s\S]*?)<\/script>/)[1];
  await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  assert.equal(globalThis.terminator, value);
  delete globalThis.terminator;
});

test('raw imports and standalone component modules are portable', async (t) => {
  const cwd = await fixture(t, {
    'component.js': 'import html from "./template.html"; import css from "./style.css?raw"; globalThis.template = html + css;',
    'template.html': '<p>hello: # {name}</p>', 'style.css': ':host { color: red; }',
  });
  const result = await build({ cwd, config: { name: 'app', entries: [{ name: 'widget', kind: 'component', entry: 'component.js' }] }, write: false });
  const module = documents(result.yaml)[0]['component!'].module;
  assert.match(module, /:host \{ color: red; \}/);
  assert.doesNotMatch(module, new RegExp(cwd));
  assert.ok(result.files.includes(path.join(cwd, 'style.css')));
  await import(`data:text/javascript;base64,${Buffer.from(module).toString('base64')}`);
  assert.equal(globalThis.template, '<p>hello: # {name}</p>:host { color: red; }');
  delete globalThis.template;
});

test('notation files preserve duplicate assertions and custom tags; view kinds stay distinct', async (t) => {
  const notation = 'concept!: &person\n  with: {}\nperson!: &a\n  this: id:a\nperson!: &b\n  this: id:b\nview!:\n  model: person\n  display: !text/html |\n    <p>Hi</p>\n';
  const cwd = await fixture(t, { 'schema.yaml': notation, 'card.html': '<b>{name}</b>' });
  const result = await build({ cwd, config: {
    name: 'app', notation: ['schema.yaml'],
    entries: ['view', 'view/directory', 'view/title', 'view/label'].map((kind, i) => ({ name: `card${i}`, entry: 'card.html', model: 'person', kind })),
  }, write: false });
  assert.ok(result.yaml.includes(notation));
  const docs = documents(result.yaml);
  assert.equal(docs.length, 5);
  assert.ok(docs[2]['view/directory!']);
  assert.ok(docs[3]['view/title!']);
  assert.ok(docs[4]['view/label!']);
});

test('srcset, root-relative paths and external URLs resolve correctly', async (t) => {
  const cwd = await fixture(t, {
    'pages/card.html': '<img src="/pic.svg" srcset="/pic.svg 1x, ../pic.svg 2x"><img src="https://example.com/a.png"><img src={photo}><img src="data:image/png;base64,AA==">',
    'pic.svg': '<svg/>',
  });
  const result = await build({ cwd, config: { name: 'app', entries: [{ name: 'card', entry: 'pages/card.html', model: 'person' }] }, write: false });
  const html = result.entries[0].content;
  assert.match(html, /base64,PHN2Zy8\+ 1x, data:image\/svg\+xml;base64,PHN2Zy8\+ 2x/);
  assert.match(html, /src="https:\/\/example.com\/a.png"/);
  assert.match(html, /src=\{photo\}/);
  assert.match(html, /src="data:image\/png;base64,AA=="/);
});

test('failed builds preserve the last successful output', async (t) => {
  const cwd = await fixture(t, { 'card.html': '<b>{name}</b>' });
  const config = { name: 'app', entries: [{ name: 'card', entry: 'card.html', model: 'person' }] };
  const before = await build({ cwd, config });
  await writeFile(path.join(cwd, 'card.html'), '<script src="missing.js"></script>');
  await assert.rejects(build({ cwd, config }), /resolve|missing/);
  assert.equal(await readFile(before.outFile, 'utf8'), before.yaml);
});

test('validates config, YAML and unsupported browser entry shapes', async (t) => {
  const cwd = await fixture(t, {
    'ok.html': 'hello',
    'scripts.html': '<script>console.log(1)</script><script>console.log(2)</script>',
    'remote.html': '<script src="https://example.com/main.js"></script>',
    'bad.yaml': 'foo: [',
  });
  const entry = { name: 'card', model: 'person', entry: 'ok.html' };
  const run = (config) => build({ cwd, config, write: false });
  await assert.rejects(run({ name: 'app', entries: [entry], typo: true }), /unknown option/);
  await assert.rejects(run({ name: 'app', entries: [entry, entry] }), /duplicate anchor/);
  await assert.rejects(run({ name: 'app', entries: [{ ...entry, kind: 'wat' }] }), /invalid kind/);
  await assert.rejects(run({ name: 'app', entries: [{ ...entry, kind: 'portal' }] }), /portals are discontinued/);
  await assert.rejects(run({ name: 'app', entries: [{ ...entry, model: undefined }] }), /require a model/);
  await assert.rejects(run({ name: 'app', entries: [{ ...entry, entry: 'scripts.html' }] }), /one script entry/);
  await assert.rejects(run({ name: 'app', entries: [{ ...entry, entry: 'remote.html' }] }), /local entry/);
  await assert.rejects(run({ name: 'app', notation: ['bad.yaml'], entries: [entry] }), /bad.yaml/);
  await assert.rejects(run({ name: 'app', entries: [entry], outFile: 'ok.html' }), /\.yaml/);
});

test('minification and inline source maps are available', async (t) => {
  const cwd = await fixture(t, { 'main.js': 'const value = 42; console.log(value);', 'card.html': '<script src="main.js"></script>' });
  const result = await build({ cwd, config: { name: 'a', entries: [{ name: 'c', entry: 'card.html', model: 'person' }] }, minify: true, sourcemap: true, write: false });
  assert.match(result.entries[0].content, /console\.log\(42\)/);
  assert.match(result.entries[0].content, /sourceMappingURL=data:application\/json;base64,/);
});

test('config paths resolve relative to config and local config imports refresh', async (t) => {
  const cwd = await fixture(t, {
    'project/tonk.config.ts': 'import name from "./name.js"; export default { name, entries: [{ name: "card", kind: "view", model: "person", entry: "card.html" }] };',
    'project/name.js': 'export default "before";', 'project/card.html': '<b>Hi</b>',
  });
  const options = { cwd, configFile: 'project/tonk.config.ts', write: false };
  assert.match((await build(options)).yaml, /id:before\/card/);
  await writeFile(path.join(cwd, 'project/name.js'), 'export default "after";');
  const result = await build(options);
  assert.match(result.yaml, /id:after\/card/);
  assert.equal(result.outFile, path.join(cwd, 'project/dist/app.yaml'));
});

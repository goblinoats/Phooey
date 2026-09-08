import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { watch } from '../src/index.js';

async function until(predicate) {
  const deadline = Date.now() + 8000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for watcher');
    await delay(30);
  }
}

test('watch rebuilds imports/config, recovers from errors and avoids output loops', { timeout: 15000 }, async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tonk-watch-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(cwd, 'tonk.config.js'), 'export default { name: "watch", outFile: "build.yaml", entries: [{ name: "page", kind: "view", model: "person", entry: "page.html" }] };');
  await writeFile(path.join(cwd, 'page.html'), '<script src="main.js"></script>');
  await writeFile(path.join(cwd, 'main.js'), 'import { value } from "./value.js"; console.log(value);');
  await writeFile(path.join(cwd, 'value.js'), 'export const value = 1;');
  const results = [];
  const errors = [];
  const watcher = await watch({ cwd, onBuild: (result) => { results.push(result); }, onError: (error) => { errors.push(error); } });
  t.after(() => watcher.close());
  assert.equal(results.length, 1);
  await writeFile(path.join(cwd, 'value.js'), 'export const value = 2;');
  await until(() => results.some((result) => result.yaml.includes('value = 2')));
  const good = await readFile(path.join(cwd, 'build.yaml'), 'utf8');
  await writeFile(path.join(cwd, 'value.js'), 'export const = ;');
  await until(() => errors.length > 0);
  assert.equal(await readFile(path.join(cwd, 'build.yaml'), 'utf8'), good);
  await writeFile(path.join(cwd, 'value.js'), 'export const value = 3;');
  await until(() => results.some((result) => result.yaml.includes('value = 3')));
  await writeFile(path.join(cwd, 'tonk.config.js'), 'export default { name: "renamed", outFile: "build.yaml", entries: [{ name: "page", kind: "view", model: "person", entry: "page.html" }] };');
  await until(() => results.some((result) => result.yaml.includes('id:renamed/page')));
  const count = results.length;
  await delay(500);
  assert.equal(results.length, count, 'generated YAML does not retrigger builds');
  await watcher.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, symlink, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'bin/tonk-build.js');
const run = (args, cwd = root) => exec(process.execPath, [cli, ...args], { cwd });

test('CLI help, version and invalid flags', async () => {
  assert.match((await run(['--help'])).stdout, /tonk-build init/);
  assert.match((await run(['--version'])).stdout, /0\.1\.0/);
  await assert.rejects(run(['build', '--wat']), /Unknown option/);
  await assert.rejects(run(['build', '--space', 'my-space']), /require --eval/);
  await assert.rejects(run(['init', 'unused', '--template', 'portal']), /Portals are discontinued/);
});

for (const template of ['view', 'react']) {
  test(`scaffolds and builds a ${template} project, protecting existing files`, async (t) => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'tonk-init-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    await run(['init', 'my-app', '--template', template], cwd);
    const project = path.join(cwd, 'my-app');
    await mkdir(path.join(project, 'node_modules'));
    await symlink(root, path.join(project, 'node_modules/tonk-builder'), 'dir');
    if (template === 'react') {
      for (const dependency of ['react', 'react-dom', 'scheduler']) {
        await symlink(path.join(root, 'node_modules', dependency), path.join(project, 'node_modules', dependency), 'dir');
      }
    }
    assert.match((await run(['build'], project)).stdout, /Built/);
    assert.match(await readFile(path.join(project, 'dist/app.yaml'), 'utf8'), /view!:/);
    assert.doesNotMatch(await readFile(path.join(project, 'tonk.config.js'), 'utf8'), /__APP_NAME__/);
    await assert.rejects(run(['init', 'my-app'], cwd), /Refusing to overwrite/);
  });
}

test('--eval passes explicit destination without shell interpolation, propagating failures', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tonk-eval-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const log = path.join(cwd, 'args.json');
  await writeFile(path.join(cwd, 'tonk.config.js'), 'export default { name: "eval", entries: [{ name: "page", kind: "view", model: "person", entry: "page.html" }] };');
  await writeFile(path.join(cwd, 'page.html'), '<h1>ready</h1>');
  await mkdir(path.join(cwd, 'bin'));
  await writeFile(path.join(cwd, 'bin/tonk'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.TONK_BUILDER_TEST_LOG, JSON.stringify(process.argv.slice(2)));\nprocess.exit(Number(process.env.TONK_BUILDER_TEST_EXIT ?? 0));\n', { mode: 0o755 });
  const env = { ...process.env, PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH, TONK_BUILDER_TEST_LOG: log };
  const args = [cli, 'build', '--eval', '--space', 'literal;space', '--no-sync'];
  await exec(process.execPath, args, { cwd, env });
  const passed = JSON.parse(await readFile(log, 'utf8'));
  assert.equal(passed[0], 'eval');
  assert.equal(path.basename(passed[1]), 'app.yaml');
  assert.deepEqual(passed.slice(2), ['--space', 'literal;space', '--no-sync']);
  await assert.rejects(exec(process.execPath, args, { cwd, env: { ...env, TONK_BUILDER_TEST_EXIT: '3' } }), /tonk eval failed \(exit 3\)/);
  assert.match(await readFile(path.join(cwd, 'dist/app.yaml'), 'utf8'), /ready/);
});

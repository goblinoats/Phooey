#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, watch } from '../src/index.js';

const help = `tonk-build — HTML, CSS and JavaScript → Tonk YAML

Usage:
  tonk-build init <directory> [--template view|react]
  tonk-build build [options]
  tonk-build watch [options]

Options:
  -c, --config <file>   Config file (default: tonk.config.js/.mjs/.ts)
  -o, --out <file>      Output YAML path, relative to the config
      --minify         Minify JavaScript and CSS
      --sourcemap      Include inline JavaScript/CSS source maps
      --eval           Run tonk eval after each successful build
      --space <name>   Select the Tonk space for --eval
      --no-sync        Pass --no-sync to tonk eval
  -h, --help           Show this help
  -v, --version        Show version

Native views use {} template bindings and load scripts through <tonk-component>.
Watch mode rebuilds the YAML. The --eval option loads the YAML into Tonk.
Reload the Tonk browser after changes to registered components.
`;

async function evaluate(result, values) {
  const args = ['eval', result.outFile];
  if (values.space) args.push('--space', values.space);
  if (values['no-sync']) args.push('--no-sync');
  await new Promise((resolve, reject) => {
    const child = spawn('tonk', args, { stdio: 'inherit', cwd: result.root });
    child.on('error', (error) => reject(new Error(`Could not run tonk: ${error.message}`)));
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`tonk eval failed (${signal ?? `exit ${code}`}). YAML remains at ${result.outFile}.`)));
  });
}

async function init(directory, template) {
  if (template === 'portal') throw new Error('Portals are discontinued. Use --template view or react.');
  if (!['view', 'react'].includes(template)) throw new Error('--template must be view or react.');
  if (!directory) throw new Error('Supply a directory: tonk-build init my-app');
  const destination = path.resolve(directory);
  try {
    if ((await readdir(destination)).length) throw new Error(`Refusing to overwrite non-empty directory ${destination}.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(destination, { recursive: true });
  const source = fileURLToPath(new URL(`../templates/${template}/`, import.meta.url));
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
  const name = path.basename(destination).toLowerCase().replace(/[^a-z0-9._-]/g, '-') || 'my-app';
  for (const file of ['package.json', 'tonk.config.js']) {
    const target = path.join(destination, file);
    await writeFile(target, (await readFile(target, 'utf8')).replaceAll('__APP_NAME__', name));
  }
  await writeFile(path.join(destination, '.gitignore'), 'node_modules/\ndist/\n*.tonk-build-*.mjs\n');
  console.log(`Created ${destination}\nFollow README.md to install the builder.\nThen run npm run build.`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      config: { type: 'string', short: 'c' }, out: { type: 'string', short: 'o' },
      minify: { type: 'boolean' }, sourcemap: { type: 'boolean' }, eval: { type: 'boolean' },
      space: { type: 'string' }, 'no-sync': { type: 'boolean' }, template: { type: 'string' },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) { console.log(help); return; }
  if (values.version) { console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version); return; }
  const command = positionals[0] ?? 'build';
  if (command === 'init') {
    if (positionals.length > 2) throw new Error('init takes one directory.');
    return init(positionals[1], values.template ?? 'view');
  }
  if (!['build', 'watch'].includes(command) || positionals.length > 1) throw new Error('Expected build, watch, or init. Run tonk-build --help.');
  if (values.template) throw new Error('--template is only available with init.');
  if ((values.space || values['no-sync']) && !values.eval) throw new Error('--space and --no-sync require --eval.');
  const options = { configFile: values.config, outFile: values.out, minify: values.minify, sourcemap: values.sourcemap };
  const onBuild = async (result) => {
    console.log(`Built ${result.entries.length} ${result.entries.length === 1 ? 'entry' : 'entries'} → ${path.relative(process.cwd(), result.outFile)} (${Buffer.byteLength(result.yaml).toLocaleString()} bytes)`);
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    if (values.eval) await evaluate(result, values);
  };
  if (command === 'build') return onBuild(await build(options));
  const watcher = await watch({ ...options, onBuild, onError: (error) => console.error(`Build failed: ${error.message}`) });
  console.log('Watching source files. Press Ctrl-C to stop.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await watcher.close(); process.exit(0); });
}

main().catch((error) => { console.error(`tonk-build: ${error.message}`); process.exitCode = 1; });

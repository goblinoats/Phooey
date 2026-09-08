import { access, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

export const defineConfig = (config) => config;
const names = ['tonk.config.js', 'tonk.config.mjs', 'tonk.config.ts'];
const token = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const heads = new Set(['view', 'view/directory', 'view/label', 'view/title', 'component']);

export async function findConfig(cwd, supplied) {
  if (supplied) return path.resolve(cwd, supplied);
  for (const name of names) {
    const file = path.join(cwd, name);
    try { await access(file); return file; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`No tonk.config.js, .mjs or .ts in ${cwd}. Run tonk-build init my-app.`);
}

// Bundle local configuration imports so watch mode can load their changes.
export async function loadConfig(file) {
  const root = path.dirname(file);
  const temporary = path.join(root, `.config.tonk-build-${randomUUID()}.mjs`);
  const compiled = await build({
    absWorkingDir: root, entryPoints: [file], bundle: true, platform: 'node',
    format: 'esm', packages: 'external', write: false, logLevel: 'silent',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(file).href), 'import.meta.dirname': JSON.stringify(root) },
  });
  try {
    await writeFile(temporary, compiled.outputFiles[0].text, { flag: 'wx' });
    return (await import(pathToFileURL(temporary).href)).default;
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label}: unknown option ${JSON.stringify(key)}.`);
  }
}

export function normalizeConfig(config, root, overrides = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Config must export an object.');
  onlyKeys(config, ['name', 'outFile', 'entries', 'notation', 'minify', 'sourcemap', 'target', 'define', 'alias', 'tsconfig', 'plugins'], 'Config');
  if (typeof config.name !== 'string' || !token.test(config.name)) throw new Error('Config name must be a non-empty identifier (letters, numbers, ., _, / or -).');
  if (!Array.isArray(config.entries) || !config.entries.length) throw new Error('Config entries must be a non-empty array.');
  if (config.notation !== undefined && (!Array.isArray(config.notation) || config.notation.some((x) => typeof x !== 'string' || !x))) {
    throw new Error('Config notation must be an array of file paths.');
  }
  for (const option of ['minify', 'sourcemap']) {
    if (config[option] !== undefined && typeof config[option] !== 'boolean') throw new Error(`${option} must be a boolean.`);
  }
  const anchors = new Set();
  const entities = new Set();
  const entries = config.entries.map((entry, i) => {
    const label = `entries[${i}]`;
    if (!entry || typeof entry !== 'object') throw new Error(`${label} must be an object.`);
    onlyKeys(entry, ['name', 'kind', 'entry', 'model', 'entity', 'anchor'], label);
    const kind = entry.kind ?? 'view';
    if (kind === 'portal') throw new Error(`${label}: portals are discontinued. Use a native view.`);
    if (!heads.has(kind)) throw new Error(`${label}: invalid kind ${JSON.stringify(kind)}.`);
    if (typeof entry.name !== 'string' || !token.test(entry.name)) throw new Error(`${label}: name must be an identifier.`);
    if (typeof entry.entry !== 'string' || !entry.entry) throw new Error(`${label}: entry must be a file path.`);
    if (kind.startsWith('view') && (typeof entry.model !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9._:/+-]*$/.test(entry.model) || /^(null|true|false)$/i.test(entry.model))) throw new Error(`${label}: views require a model identifier or URI.`);
    if (!kind.startsWith('view') && entry.model !== undefined) throw new Error(`${label}: only views have a model.`);
    const anchor = entry.anchor ?? `${config.name}/${entry.name}`;
    const entity = entry.entity ?? `id:${config.name}/${entry.name}`;
    if (typeof anchor !== 'string' || !token.test(anchor)) throw new Error(`${label}: invalid anchor.`);
    if (typeof entity !== 'string' || !/^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]+$/.test(entity)) throw new Error(`${label}: entity must be a URI such as id:my-app/card.`);
    if (anchors.has(anchor)) throw new Error(`${label}: duplicate anchor ${anchor}.`);
    if (entities.has(`${kind}:${entity}`)) throw new Error(`${label}: duplicate entity ${entity} for ${kind}.`);
    anchors.add(anchor); entities.add(`${kind}:${entity}`);
    return { ...entry, kind, anchor, entity, entry: path.resolve(root, entry.entry) };
  });
  const outFile = overrides.outFile ?? config.outFile ?? 'dist/app.yaml';
  if (typeof outFile !== 'string' || !/\.ya?ml$/i.test(outFile)) throw new Error('outFile must end in .yaml or .yml.');
  return {
    ...config, ...overrides, root, entries, outFile: path.resolve(root, outFile),
    notation: (config.notation ?? []).map((file) => path.resolve(root, file)),
  };
}

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Document, Scalar, parseAllDocuments } from 'yaml';
import { findConfig, loadConfig, normalizeConfig } from './config.js';
import { compileHtml } from './html.js';
import { bundle } from './bundle.js';

export { defineConfig } from './config.js';
export { watch } from './watch.js';

function assertion(entry, content) {
  const document = new Document();
  const fields = document.createNode({ this: entry.entity });
  if (entry.model) fields.add({ key: 'model', value: new Scalar(entry.model) });
  const text = new Scalar(content);
  text.type = Scalar.BLOCK_LITERAL;
  fields.add({ key: entry.kind === 'component' ? 'module' : 'display', value: text });
  fields.anchor = entry.anchor;
  document.set(`${entry.kind}!`, fields);
  return document.toString({ lineWidth: 0 });
}

export async function build(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configFile = options.config ? null : await findConfig(cwd, options.configFile);
  const rawConfig = options.config ?? await loadConfig(configFile);
  const root = configFile ? path.dirname(configFile) : cwd;
  const overrides = Object.fromEntries(['outFile', 'minify', 'sourcemap'].filter((key) => options[key] !== undefined).map((key) => [key, options[key]]));
  const config = normalizeConfig(rawConfig, root, overrides);
  const files = new Set(configFile ? [configFile] : []);
  const documents = [];
  const warnings = [];
  for (const file of config.notation) {
    files.add(file);
    const text = await readFile(file, 'utf8');
    const errors = parseAllDocuments(text, { uniqueKeys: false }).flatMap((doc) => doc.errors);
    if (errors.length) throw new Error(`${file}: ${errors.map((error) => error.message).join('\n')}`);
    if (text.trim()) documents.push(`# Source: ${path.relative(root, file).replace(/[\r\n]/g, '')}\n${text.replace(/\s+$/, '')}\n`);
  }
  const entries = [];
  for (const entry of config.entries) {
    let content;
    if (entry.kind === 'component') {
      const compiled = await bundle(config, files, { entryPoints: [entry.entry] });
      if (compiled.css) throw new Error(`${entry.entry}: a standalone component cannot carry global CSS. Import CSS with ?raw into a shadow root, or import this module from a view's script entry.`);
      content = compiled.js;
      warnings.push(...compiled.warnings);
    } else {
      const compiled = await compileHtml(entry.entry, config, files);
      content = compiled.html;
      warnings.push(...compiled.warnings);
    }
    documents.push(assertion(entry, content));
    entries.push({ ...entry, content });
  }
  const yaml = '# tonk-builder generated this file. To make changes, edit the source files. Then rebuild the YAML.\n' + documents.join('\n---\n');
  if (files.has(config.outFile) || config.entries.some((entry) => entry.entry === config.outFile)) throw new Error(`Output would overwrite an input: ${config.outFile}`);
  if (options.write !== false) {
    await mkdir(path.dirname(config.outFile), { recursive: true });
    const temporary = `${config.outFile}.tonk-build-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, yaml, { flag: 'wx' });
      await rename(temporary, config.outFile);
    } finally {
      await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  return { yaml, outFile: config.outFile, root, files: [...files], entries, warnings };
}

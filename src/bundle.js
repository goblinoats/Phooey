import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

export const mimeTypes = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.vtt': 'text/vtt', '.pdf': 'application/pdf',
};

export function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url) || url.includes('{');
}

export function localPath(url, importer, root) {
  const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  return pathname.startsWith('/') ? path.resolve(root, `.${pathname}`) : path.resolve(path.dirname(importer), pathname);
}

export async function assetUrl(url, importer, config, files) {
  if (!url || isExternal(url)) return url;
  const file = localPath(url, importer, config.root);
  files.add(file);
  const data = await readFile(file);
  const fragment = url.includes('#') ? url.slice(url.indexOf('#')) : '';
  return `data:${mimeTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream'};base64,${data.toString('base64')}${fragment}`;
}

function rawPlugin(config, files, realRoot) {
  return {
    name: 'tonk-raw',
    setup(builder) {
      builder.onResolve({ filter: /\?raw$/ }, async (args) => {
        const resolved = await builder.resolve(args.path.slice(0, -4), {
          kind: args.kind, resolveDir: args.resolveDir, importer: args.importer,
        });
        if (resolved.errors.length) return { errors: resolved.errors };
        return { path: path.relative(realRoot, resolved.path), namespace: 'tonk-raw' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'tonk-raw' }, async ({ path: relative }) => {
        const file = path.resolve(config.root, relative);
        files.add(file);
        return { contents: await readFile(file, 'utf8'), loader: 'text', watchFiles: [file] };
      });
    },
  };
}

export async function bundle(config, files, input, extension = 'js') {
  const result = await build({
    absWorkingDir: config.root, ...input,
    bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm',
    outfile: path.join(config.root, `.tonk-output.${extension}`),
    target: config.target ?? 'es2022', minify: config.minify ?? false,
    sourcemap: config.sourcemap ? 'inline' : false, charset: 'utf8',
    legalComments: 'inline', logLevel: 'silent',
    define: config.define, alias: config.alias,
    tsconfig: config.tsconfig ? path.resolve(config.root, config.tsconfig) : undefined,
    loader: { '.html': 'text', ...Object.fromEntries(Object.keys(mimeTypes).map((ext) => [ext, 'dataurl'])) },
    plugins: [rawPlugin(config, files, await realpath(config.root)), ...(config.plugins ?? [])],
  });
  for (const file of Object.keys(result.metafile.inputs)) {
    if (!file.startsWith('<') && !file.startsWith('tonk-raw:')) files.add(path.resolve(config.root, file));
  }
  const extra = result.outputFiles.find((file) => !/\.(js|css)$/.test(file.path));
  if (extra) throw new Error(`Plugin emitted a separate asset (${path.basename(extra.path)}). Use a dataurl or text loader so the YAML is self-contained.`);
  // Tonk cannot resolve relative imports from an inline module.
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports) {
      if (imported.external && !isExternal(imported.path)) throw new Error(`Unbundled import ${imported.path}. All local and npm imports must be bundled for Tonk.`);
    }
  }
  return {
    js: result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '',
    css: result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? '',
    warnings: result.warnings.map((warning) => `${warning.location ? `${warning.location.file}:${warning.location.line}: ` : ''}${warning.text}`),
  };
}

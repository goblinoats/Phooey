import path from 'node:path';
import { watch as watchFiles } from 'chokidar';
import { build } from './index.js';
import { findConfig } from './config.js';

export async function watch(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configFile = options.config ? undefined : await findConfig(cwd, options.configFile);
  const root = configFile ? path.dirname(configFile) : cwd;
  let outFile;
  let closed = false;
  let timer;
  let pending = false;
  let running = Promise.resolve();
  const watcher = watchFiles(root, {
    ignoreInitial: true,
    ignored: (file) => {
      const parts = path.relative(root, file).split(path.sep);
      return parts.some((part) => ['node_modules', '.git', 'dist'].includes(part)) || file === outFile || /\.tonk-build-/.test(file);
    },
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });
  async function rebuild() {
    pending = true;
    running = running.then(async () => {
      while (pending && !closed) {
        pending = false;
        try {
          const result = await build({ ...options, configFile });
          outFile = result.outFile;
          watcher.add(result.files);
          await options.onBuild?.(result);
        } catch (error) {
          if (options.onError) await options.onError(error);
          else console.error(error.message);
        }
      }
    });
    return running;
  }
  watcher.on('all', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { void rebuild(); }, 80);
  });
  watcher.on('error', (error) => {
    if (options.onError) void options.onError(error);
    else console.error(error.message);
  });
  await new Promise((resolve, reject) => { watcher.once('ready', resolve); watcher.once('error', reject); });
  await rebuild();
  return { async close() { closed = true; clearTimeout(timer); await watcher.close(); await running; } };
}

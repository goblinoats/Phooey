import type { Plugin } from 'esbuild';

export type EntryKind = 'view' | 'view/directory' | 'view/label' | 'view/title' | 'component';
export interface Entry {
  /** This name identifies the entry within the project. */
  name: string;
  /** The default kind is view. */
  kind?: EntryKind;
  /** The source is an HTML template, or a JavaScript or TypeScript module for kind: component. Paths are relative to the configuration file. */
  entry: string;
  /** Views require a concept name or URI. The concept must exist in the space or the notation files. */
  model?: string;
  /** The default entity is id:<config.name>/<entry.name>. */
  entity?: string;
  /** The default anchor is <config.name>/<entry.name>. */
  anchor?: string;
}
export interface Config {
  name: string;
  entries: Entry[];
  outFile?: string;
  /** The builder includes these notation files before the views, in the specified order. */
  notation?: string[];
  minify?: boolean;
  sourcemap?: boolean;
  target?: string | string[];
  define?: Record<string, string>;
  alias?: Record<string, string>;
  tsconfig?: string;
  plugins?: Plugin[];
}
export interface BuildOptions {
  cwd?: string;
  configFile?: string;
  /** This object supplies the configuration directly. Paths are relative to cwd. */
  config?: Config;
  outFile?: string;
  minify?: boolean;
  sourcemap?: boolean;
  write?: boolean;
}
export interface BuildResult {
  yaml: string;
  outFile: string;
  root: string;
  files: string[];
  entries: (Entry & { kind: EntryKind; entity: string; anchor: string; content: string })[];
  warnings: string[];
}
export interface WatchOptions extends BuildOptions {
  onBuild?: (result: BuildResult) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}
export function defineConfig(config: Config): Config;
export function build(options?: BuildOptions): Promise<BuildResult>;
export function watch(options?: WatchOptions): Promise<{ close(): Promise<void> }>;

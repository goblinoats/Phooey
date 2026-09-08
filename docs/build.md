# Build reference

[Back to the README](../README.md)

The builder reads a configuration file and writes Tonk notation as YAML.
It uses esbuild to combine JavaScript modules, CSS, and local assets.
Tonk evaluates the output with `tonk eval`.

## Configuration file

The builder searches for `tonk.config.js`, `tonk.config.mjs`, and `tonk.config.ts`, in that order.
Paths in the configuration are relative to the directory that contains this file.

```js
import { defineConfig } from 'tonk-builder';

export default defineConfig({
  name: 'my-app',
  outFile: 'dist/app.yaml',
  notation: ['src/schema.yaml'],
  entries: [
    { name: 'counter-card', model: 'builder-counter', entry: 'src/card.html' },
  ],
});
```

The `notation` files define data concepts, commands, and rules.
The builder includes them in order, before the generated views.
It preserves custom YAML tags and repeated assertions.
It checks YAML syntax but does not validate the data model against a Tonk space.

To validate the output against a space, run:

```sh
tonk eval dist/app.yaml --space my-space --dry-run
```

### View and component entries

| Entry field | Meaning | Default |
| --- | --- | --- |
| `name` | Name of this entry within the project | Required |
| `kind` | Type of Tonk assertion | `view` |
| `entry` | Path to the HTML or module source | Required |
| `model` | Concept name or URI for a view | Required for views |
| `entity` | Entity that receives the generated code | `id:<project>/<entry>` |
| `anchor` | YAML anchor for the assertion | `<project>/<entry>` |

In these defaults, `<project>` means the configuration `name`.
`<entry>` means the entry `name`.
Each view needs a concept from the notation files or the destination space.

| Entry kind | Source | Generated assertion |
| --- | --- | --- |
| `view` | HTML | `view!` with `model` and `display` |
| `view/directory` | HTML | `view/directory!` with `model` and `display` |
| `view/label` | HTML | `view/label!` with `model` and `display` |
| `view/title` | HTML | `view/title!` with `model` and `display` |
| `component` | JavaScript or TypeScript module | `component!` with `module` |

Stable entity names let later evaluations update the same view.
A renamed or removed entry does not remove the previous entity from the space.
An explicit `entity` can target an existing view, as in the React example.

### Build options

| Option | Purpose | Default |
| --- | --- | --- |
| `outFile` | Destination YAML path | `dist/app.yaml` |
| `notation` | Ordered list of notation files | Empty list |
| `minify` | Reduce JavaScript and CSS size | `false` |
| `sourcemap` | Include inline source maps | `false` |
| `target` | JavaScript target for esbuild | `es2022` |
| `define` | Replace specified expressions during the build | No replacements |
| `alias` | Map import paths to replacements | No aliases |
| `tsconfig` | Path to a TypeScript configuration file | esbuild discovery |
| `plugins` | Additional esbuild plugins | Empty list |

TypeScript compilation removes type syntax. It does not check application types.
To check application types, run `tsc --noEmit` with your project configuration.
The TypeScript configuration can also specify JSX options.

## HTML, CSS, and JavaScript

An HTML entry can link its stylesheet and one script:

```html
<link rel="stylesheet" href="./styles.css">
<article>
  <h1>{name}</h1>
</article>
<script type="module" src="./main.js"></script>
```

The script can import other modules, npm packages, CSS, and assets.
The builder supports JavaScript, TypeScript, JSX, and TSX.
Each HTML entry accepts one executable script.
Scripts that contain data, such as JSON, remain in place.

The builder embeds CSS and JavaScript in the generated `display` field.
It places the script inside the native component loader:

```html
<tonk-component>
  <script type="tonk/module">/* Bundled JavaScript */</script>
</tonk-component>
```

Tonk uses this loader to execute code from an otherwise inert HTML template.
The builder preserves `{field}` bindings, `html:` attributes, and native custom elements.

A separate `component` entry produces a `module` field.
A native view must load the component, for example through `<tonk-display model=component />`.
Standalone components can import CSS as text for a shadow root.
They cannot emit a separate global stylesheet.

## Assets and text imports

The builder embeds local images, fonts, and media as data URLs.
The following source locations support local assets:

- CSS URLs, including files reached through `@import`.
- HTML image and media `src` attributes.
- Video `poster` attributes.
- Icon links and SVG `href` attributes.
- Image `srcset` attributes.
- JavaScript imports for supported asset types.

HTML paths that start with `/` resolve from the configuration directory.
Explicit remote asset URLs remain remote.
Attributes with `{field}` bindings remain under Tonk control.

HTML imports and `?raw` imports return text:

```js
import template from './fragment.html';
import styles from './controls.css?raw';
```

These text imports preserve their contents.
They do not compile nested HTML assets or adjust CSS URLs.

## CLI commands

These commands assume that the project has `tonk-build` on its command path.
The generated npm scripts provide that path automatically.

```sh
tonk-build init ./my-app
tonk-build init ./my-react-app --template react
tonk-build build
tonk-build build --config tonk.config.ts --minify --sourcemap
tonk-build watch
tonk-build watch --eval --space my-space --no-sync
```

| Option | Effect |
| --- | --- |
| `--config`, `-c` | Select a configuration file. |
| `--out`, `-o` | Override the output path, relative to the configuration directory. |
| `--minify` | Reduce JavaScript and CSS size. |
| `--sourcemap` | Include inline source maps. |
| `--eval` | Run `tonk eval` after each successful build. |
| `--space` | Select the destination for `--eval`. |
| `--no-sync` | Pass `--no-sync` to `tonk eval`. |
| `--help`, `-h` | Show command help. |
| `--version`, `-v` | Show the builder version. |

`--space` and `--no-sync` require `--eval`.
Without `--space`, Tonk resolves the destination from its environment and directory binding.
Evaluation uses the configuration directory as the working directory.
The normal Tonk sync policy applies unless `--no-sync` is present.

Watch mode rebuilds after source or configuration changes.
A failed build preserves the previous YAML and skips evaluation.
Later changes can start a new build after an error.
Watch mode does not replace a registered browser component.

After changes to installed packages, restart watch mode.
After changes to registered component code, reload the Tonk browser.

## JavaScript API

The package exports `defineConfig`, `build`, and `watch`.

```js
import { build, watch } from 'tonk-builder';

const result = await build({ configFile: 'tonk.config.js', write: false });
console.log(result.yaml);

const watcher = await watch({
  configFile: 'tonk.config.js',
  onBuild(result) { console.log(result.outFile); },
  onError(error) { console.error(error.message); },
});

// Call this method when the application stops its watcher.
await watcher.close();
```

`write: false` returns the YAML without a file write.
The result includes `yaml`, `outFile`, `root`, `files`, `entries`, and `warnings`.
Each entry includes its compiled `content`.

A caller can supply `config` and `cwd` instead of `configFile`.
For this form, paths in the configuration are relative to `cwd`.
The [type declarations](../src/index.d.ts) define the complete API.

## Build errors and limits

| Condition | Action |
| --- | --- |
| More than one executable HTML script | Import the other modules from one script entry. |
| Remote script entry | Use a local entry that imports its dependencies. |
| `async` or `nomodule` script | Use one `type="module"` script. |
| Disabled or alternate stylesheet | Use a normal linked stylesheet. |
| Plugin emits separate assets or leaves local imports | Configure the plugin to produce embeddable JavaScript and CSS. |
| Portal entry | Use a native view or component. |

Runtime fetches, workers, and computed imports do not become embedded assets.
The builder also leaves `new URL('./asset', import.meta.url)` and CSS in HTML style attributes unprocessed.
For these cases, use an asset import or an explicit remote URL.

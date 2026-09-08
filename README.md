# Tonk Builder

Write Tonk views in separate HTML, CSS, and JavaScript files.
Tonk Builder combines these files into one YAML file for `tonk eval`.
It supports TypeScript, npm packages, and optional React components.

```text
HTML + CSS + JavaScript + schema → tonk-build → app.yaml → tonk eval
```

Your HTML uses the native Tonk `{field}` templates.
Dialog stores application data, such as a counter value.
JavaScript adds event handlers and temporary controls, such as an open help panel.

## Build and open the example

You need Node.js 22 or later, npm, and the Tonk CLI.
The example also needs a Tonk browser to operate its buttons.

1. Open a terminal in this checkout.
2. Install the dependencies:

   ```sh
   npm install
   ```

3. Build the counter example:

   ```sh
   npm run build
   ```

   The builder writes `examples/counter/dist/app.yaml`.
   This file contains the schema, command, rule, styles, scripts, and views.

4. If the `builder-demo` space does not exist, create it:

   ```sh
   tonk space new builder-demo
   ```

5. Load the application into that space:

   ```sh
   tonk eval examples/counter/dist/app.yaml --space builder-demo
   ```

6. Create the sample counter once:

   ```sh
   tonk eval examples/counter/seed.yaml --space builder-demo
   ```

   The seed sets the count to `0`.
   Later builds exclude the seed, so they preserve the stored count.

7. In the Tonk browser, open `/space/builder-demo/builder-counter`.

   The view shows **My first counter**, a count of **0**, and two buttons.

8. Select **Add one**.

   The count changes to **1** after Tonk processes the command.

9. Select **How it works**.

   The help panel opens. This panel uses local component state.

To inspect the HTML in a terminal, run:

```sh
tonk render id:builder-demo/counter@builder-counter --space builder-demo
```

`tonk render` resolves the templates. It does not execute the JavaScript for the buttons.

## Change the view

The example keeps each type of source in its own file.

| File in `examples/counter/` | Purpose |
| --- | --- |
| `src/card.html` | Page structure and `{field}` templates |
| `src/styles.css` | CSS imports |
| `src/counter.css` | Counter styles |
| `src/main.js` | JavaScript imports |
| `src/counter.js` | Button events and local state |
| `src/schema.yaml` | Data fields, command, and update rule |
| `tonk.config.js` | Build inputs and view names |
| `seed.yaml` | Initial sample data |

1. In `examples/counter/src/card.html`, replace the heading with:

   ```html
   <h1>Counter: {name}</h1>
   ```

2. From this checkout, apply the changed view:

   ```sh
   npm run build -- --eval --space builder-demo
   ```

3. Reload the Tonk browser.

   The heading now shows **Counter: My first counter**.
   The stored count keeps its current value.

For automatic builds, start watch mode from this checkout:

```sh
npm run dev -- --eval --space builder-demo
```

Watch mode builds and loads the YAML after each source change.
Reload the Tonk browser after changes to registered JavaScript components.
Press `Ctrl-C` to stop watch mode.

## Create your own project

The builder supports installation from a local checkout.
The following procedure creates a project inside this checkout.

1. From this checkout, create the project:

   ```sh
   node bin/tonk-build.js init ./my-app
   ```

2. Open the project directory:

   ```sh
   cd my-app
   ```

3. Install the builder from the parent directory:

   ```sh
   npm install --save-dev ..
   ```

4. Build the project:

   ```sh
   npm run build
   ```

5. Follow the generated `README.md` to load `dist/app.yaml` into Tonk.

For a project outside this checkout, install the builder with its absolute path.
To create a React project, add `--template react` to the `init` command.
Both project templates include a working counter and a separate seed file.

## Understand the counter state

The counter has stored state and local state.
Dialog stores the name and count.
The component keeps the help panel state in memory.

| Value | Owner | How the value changes |
| --- | --- | --- |
| Counter name and count | Dialog | A command and rule, or a session transaction, update the data. |
| Visible name and count | Tonk template system | `{name}` and `{count}` receive the current data. |
| Component inputs | Tonk template system | `html:subject={this}` and `html:count={count}` supply values that the component can read. |
| Help panel state | Component | `state(false)` and its setter control the panel. |

The button sends an event to the declared `builder-counter/bump` command.
The rule reads the current count and adds the requested amount.
Tonk then updates `{count}` from the resulting data.

The component does not need a second copy of the stored count.
Local state lasts until the component unmounts or its entity key changes.
The helpers do not save local state to `localStorage` or restore it on mount.

The [state guide](docs/state.md) explains this sequence with matching HTML, JavaScript, and YAML examples.
The [React guide](docs/react.md) shows the same data flow with `useState`, `useDialogProps`, and `useCommand`.
For controls that need additional data, `useQuery()` supplies a live native query.
`useTransaction()` submits claims and returns the host transaction result.

## Next steps

- [State and component lifecycle](docs/state.md): inputs, commands, effects, and cleanup.
- [React controls](docs/react.md): temporary state and native templates in one view.
- [Queries and transactions](docs/session.md): session providers, live queries, and confirmed writes.
- [Build reference](docs/build.md): configuration, assets, CLI options, and build errors.
- [Development](docs/development.md): checks and Tonk source references.

Portals are discontinued. The builder accepts native views and components.

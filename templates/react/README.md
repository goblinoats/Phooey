# Tonk project with React controls

This project contains a counter with native Tonk templates and React controls.
Dialog stores the count. React keeps the amount input in local state.

## Build and open the counter

You need Node.js 22 or later, npm, the Tonk CLI, and a Tonk browser.
Run the commands from this project directory.

1. Replace `/absolute/path/to/tonk-builder` with the builder checkout path in the following command:

   ```sh
   npm install --save-dev /absolute/path/to/tonk-builder
   ```

2. Run that command to install the builder and the declared React dependencies.

   If this project is directly inside the builder checkout, `npm install --save-dev ..` uses the parent directory.

3. Build the project:

   ```sh
   npm run build
   ```

   The builder writes the application to `dist/app.yaml`.

4. If the `my-app` space does not exist, create it:

   ```sh
   tonk space new my-app
   ```

5. Load the application:

   ```sh
   tonk eval dist/app.yaml --space my-app
   ```

6. Create the sample counter once:

   ```sh
   tonk eval seed.yaml --space my-app
   ```

   The seed sets the count to `0`. Later builds exclude the seed and preserve the count.

7. In the Tonk browser, open `/space/my-app/builder-counter`.
8. Set **Amount** to `2`.
9. Select **Add 2**.

   The count changes from **0** to **2** after Tonk processes the command.

10. Enter a unique name under **Create another counter**.
11. Select **Create counter**.

    The form confirms the completed transaction. Its live query then updates the number of counters.

## Change the application

| File | Purpose |
| --- | --- |
| `src/card.html` | Page structure and native `{field}` templates |
| `src/styles.css` | CSS imports for the native view |
| `src/counter.css` | Native counter styles |
| `src/controls.jsx` | React controls and component registration |
| `src/counter-library.jsx` | Creation form with query and transaction hooks |
| `src/counters.js` | Native query and transaction definitions |
| `src/controls.css` | CSS for the React shadow root |
| `src/schema.yaml` | Data fields, command, and update rule |
| `tonk.config.js` | Build inputs and view names |
| `seed.yaml` | Initial sample data |

1. Change the heading in `src/card.html`:

   ```html
   <h1>Counter: {name}</h1>
   ```

2. Apply the changed view:

   ```sh
   npm run build -- --eval --space my-app
   ```

3. Reload the Tonk browser.

   The heading now shows **Counter: My first counter**.

For automatic builds and evaluation, run:

```sh
npm run dev -- --eval --space my-app
```

Reload the Tonk browser after changes to registered component code.
Press `Ctrl-C` to stop watch mode.

## Understand the state

`src/card.html` displays the stored name and count through native `{field}` templates.
The `html:subject={this}` and `html:count={count}` bindings supply read-only inputs to `useDialogProps()`.
The `useCommand('bump')` function sends the requested amount to the declared command.
The rule in `src/schema.yaml` adds that amount to the current count.

`useState(1)` keeps the amount input in memory.
`key: 'subject'` resets the React component when the entity changes.
React renders the controls inside a shadow root. Tonk controls the native template elements.

`useQuery(counters)` reads the live counter selection through the native Tonk host.
`useTransaction()` submits the creation request and returns the host result promise.
The form keeps its unsaved name and pending state in React memory.
The component session closes its subscriptions when the entity changes or the component unmounts.

## Make a separate application

The project starts with the example identifiers.
To keep separate applications in the same space, give each application its own identifiers.

| Identifier | Files that must agree |
| --- | --- |
| Concept and command names | `src/schema.yaml`, `src/card.html`, `tonk.config.js`, and `seed.yaml` |
| Attribute URIs | Field declarations in `src/schema.yaml` and `src/counters.js` |
| Custom element name | `src/card.html`, `src/controls.jsx`, and CSS selectors |
| Seed entity and anchor | `seed.yaml` |

The builder checkout contains the complete guides in `docs/`.

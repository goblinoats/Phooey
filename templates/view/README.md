# Tonk view project

This project contains a counter with native Tonk templates and JavaScript controls.
Dialog stores the name and count. The component keeps the help panel state in memory.

## Build and open the counter

You need Node.js 22 or later, npm, the Tonk CLI, and a Tonk browser.
Run the commands from this project directory.

1. Replace `/absolute/path/to/tonk-builder` with the builder checkout path in the following command:

   ```sh
   npm install --save-dev /absolute/path/to/tonk-builder
   ```

2. Run that command to install the builder.

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
8. Select **Add one**.

   The count changes from **0** to **1** after Tonk processes the command.

## Change the application

| File | Purpose |
| --- | --- |
| `src/card.html` | Page structure and `{name}` and `{count}` bindings |
| `src/title.html` | Native title view |
| `src/styles.css` | CSS imports |
| `src/counter.css` | Counter styles |
| `src/main.js` | JavaScript imports |
| `src/counter.js` | Events, effects, and local state |
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
The `html:subject={this}` and `html:count={count}` bindings supply read-only component inputs.
The command requests an increment. The rule in `src/schema.yaml` applies it to the current count.

`state(false)` controls the temporary help panel.
`key: 'subject'` resets local state when the entity changes.
The helper removes event listeners and runs effect cleanup when the component unmounts.

## Make a separate application

The project starts with the example identifiers.
To keep separate applications in the same space, give each application its own identifiers.

| Identifier | Files that must agree |
| --- | --- |
| Concept and command names | `src/schema.yaml`, `src/card.html`, `tonk.config.js`, and `seed.yaml` |
| Attribute URIs | Field declarations in `src/schema.yaml` |
| Custom element name | `src/card.html`, `src/counter.js`, and CSS selectors |
| Seed entity and anchor | `seed.yaml` |

The builder checkout contains the complete guides in `docs/`.

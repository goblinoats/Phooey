# React controls

[Back to the README](../README.md)

React components can add controls to a native Tonk view.
Tonk templates continue to display stored data.
React receives that data through read-only inputs and keeps temporary control state with its usual hooks.
The session hooks also provide live queries and transactions through the native Tonk host.

## Try the React example

This procedure uses the counter and space from the README.

1. From the builder checkout, build the React example:

   ```sh
   npm run build:react
   ```

2. Load the view into the example space:

   ```sh
   tonk eval examples/react/dist/app.yaml --space builder-demo
   ```

3. Reload `/space/builder-demo/builder-counter` in the Tonk browser.

   The view shows the stored count and an **Amount** input.
   The existing count remains in Dialog.

4. Set **Amount** to `2`.
5. Select **Add 2**.

   The rule adds `2` to the stored count.
   Tonk updates the visible count from the new query result.

6. Enter a unique name under **Create another counter**.
7. Select **Create counter**.

   The form shows **Counter created.** after the transaction completes.
   The live query updates the number of counters in the space.

The React example uses the same view entity as the native example.
Thus, evaluation replaces that view instead of adding a second view.
To return to the native controls, build and evaluate the native example again:

```sh
npm run build -- --eval --space builder-demo
```

## Create a React project

From the builder checkout, create the project with the React template:

```sh
node bin/tonk-build.js init ./my-react-app --template react
```

The generated `README.md` gives the installation and build steps.
The project declares `react` and `react-dom` as dependencies.

For an existing project, install these packages from its directory:

```sh
npm install react react-dom
```

## Connect the HTML and React controls

The native template displays stored values and supplies the component inputs:

```html
<h1>{name}</h1>
<output>{count}</output>
<react-counter-controls html:subject={this} html:count={count} onbump=builder-counter/bump>
  <p>Tonk displays the stored count above.</p>
</react-counter-controls>
<script type="module" src="./controls.jsx"></script>
```

The following `controls.jsx` registers the custom element:

```jsx
import React, { useState } from 'react';
import { defineReactComponent, useDialogProps, useCommand } from 'tonk-builder/react';
import styles from './controls.css?raw';

function CounterControls() {
  const { subject, count } = useDialogProps();
  const bump = useCommand('bump');
  const [step, setStep] = useState(1);
  const validStep = Number.isSafeInteger(step) && step > 0;

  return <div className="controls">
    <label>
      Amount
      <input type="number" min="1" step="1" value={step}
        onChange={(event) => setStep(event.target.valueAsNumber)} />
    </label>
    <button type="button" disabled={!validStep || count === undefined}
      onClick={() => bump({ builderCounter: subject, amount: step })}>
      Add {validStep ? step : '…'}
    </button>
  </div>;
}

defineReactComponent('react-counter-controls', {
  props: { subject: 'entity', count: 'number' },
  key: 'subject',
  component: CounterControls,
  styles,
});
```

The `controls.css` file supplies styles for these controls:

```css
.controls { display: flex; align-items: end; gap: 1rem; }
label { display: grid; gap: 0.25rem; }
input, button { font: inherit; }
```

The `?raw` import loads the CSS as a string.
The `styles` option places that CSS inside the component shadow root.
The [state guide](state.md#change-stored-data-with-a-command) contains the matching command and rule.

## Choose the state owner

`useDialogProps()` reads the current template inputs with `useSyncExternalStore`.
New inputs cause React to render the controls again.
For the same entity, React preserves the local `step` value.

`useCommand('bump')` returns a function that sends the command event.
It uses the same event detail and return value as the native `command()` method.
Its boolean return value does not confirm a saved change.

| React feature | Use in a Tonk view |
| --- | --- |
| `useDialogProps()` | Read values supplied by native template bindings. |
| `useState` or `useReducer` | Keep temporary values, such as an unsaved amount or open panel. |
| `useCommand()` | Request a stored data change through a declared command. |
| `useQuery()` | Subscribe to additional data through the native Tonk host. |
| `useTransaction()` | Submit claims and await the host transaction result. |
| `useSession()` | Read the session supplied to this React tree. |
| `useEffect` | Manage effects and their cleanup within the component lifecycle. |
| `key: 'subject'` | Reset the React component when the entity changes. |

The adapter creates a React root in a separate shadow root container.
A slot displays the native child elements.
Tonk retains control of those elements and their template bindings.
React does not hydrate the native HTML.

An entity key change or disconnect unmounts the React root.
React then runs hook cleanup and removes the input subscription.
The adapter runs in the browser and provides no server rendering snapshot.

The [state guide](state.md#read-component-inputs) defines the input types and missing values.

## Use hooks in child components

`defineReactComponent` supplies one context for the complete React tree of that custom element.
Child components can call `useDialogProps()` and `useCommand()` directly.
Each custom element instance has its own inputs and command source.

For example, a child component can use the existing counter bindings and command:

```jsx
function AddOneButton() {
  const { subject, count } = useDialogProps();
  const bump = useCommand('bump');

  return <button type="button" disabled={count === undefined}
    onClick={() => bump({ builderCounter: subject, amount: 1 })}>
    Add one
  </button>;
}
```

## Use live queries and transactions

The example separates the form from its data operations:

| File | Purpose |
| --- | --- |
| `controls.jsx` | Registers the component and displays the original counter controls. |
| `counter-library.jsx` | Uses query and transaction hooks for the creation form. |
| `counters.js` | Defines the native query and creation request. |

`defineReactComponent` supplies a session automatically.
The [session guide](session.md) explains the hooks, query results, transactions, and explicit providers.
The [design note](react-design.md) records the design decisions from the original Dialog library.

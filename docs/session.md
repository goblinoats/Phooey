# Queries and transactions

[React guide](react.md) · [State guide](state.md)

A session connects component code to the current Tonk space and branch.
It uses the native host events for queries and transactions.
The host owns the database connection, routing, and subscription transport.

Native `{field}` templates remain the main path for display data.
A live query supplies additional data that a control needs.
A transaction supplies a result when a control must confirm a stored change.

## Use the component session

`defineReactComponent` supplies a session to its React tree automatically.
Descendants use that session through these hooks:

```jsx
import { useQuery, useTransaction } from 'tonk-builder/react';
import { counters, addCounter } from './counters.js';

function CreateCounterButton() {
  const { data, status, error } = useQuery(counters);
  const transact = useTransaction();

  async function create() {
    try {
      const result = await transact(addCounter('Another counter'));
      console.log(result.revision_after);
    } catch (error) {
      console.error(error.message);
    }
  }

  if (error) return <p role="alert">{error.message}</p>;
  return <button disabled={status !== 'ready'} onClick={create}>
    Create counter ({data.length} available)
  </button>;
}
```

The complete React example includes a name input, duplicate detection, and a pending state.
Its form reports success after the transaction resolves.
The query then receives the stored data through the native subscription.

## Keep data operations in a separate file

The `counters.js` module defines the query and transaction request.
Its descriptor matches the attributes in the example schema.

```js
const counter = {
  with: {
    name: { the: 'example.builder-counter/name', as: 'Text', cardinality: 'one' },
    count: { the: 'example.builder-counter/count', as: 'UnsignedInteger', cardinality: 'one' },
  },
};

export const counters = {
  predicate: counter,
  terms: {
    this: { '?': { name: 'this' } },
    name: { '?': { name: 'name' } },
    count: { '?': { name: 'count' } },
  },
};

export function addCounter(name) {
  return { claims: [{
    op: 'assert',
    application: {
      predicate: { kind: 'durable', concept: counter },
      parameters: { name, count: 0 },
    },
  }] };
}
```

`predicate` describes the concept. Each variable in `terms` selects a result field.
A constant term filters that field, for example `name: 'My first counter'`.
These objects use the current Tonk query and transaction formats.
They do not use the older Dialog predicate classes.

This creation request omits `this`, so Tonk derives the entity from the predicate and values.
Identical creation requests identify the same entity.
The example form checks the live names before it creates another counter.
That check helps the user; it is not an atomic uniqueness constraint.

## Read a live query

`useQuery(query, session?)` returns `{ data, status, error }`.

| Property | Meaning |
| --- | --- |
| `data` | An immutable array of `{ this, fields }` conclusions. |
| `status: 'loading'` | The query waits for its first frame. |
| `status: 'ready'` | The query has a result. An empty array is a valid result. |
| `status: 'error'` | The host or adapter reported an error. |
| `status: 'idle'` | The query argument is `null`. No subscription is open. |
| `error` | The current `Error`, or `null`. |

Equivalent JSON queries share one subscription within a session.
The hook accepts inline query objects. Property order does not change query identity.
A changed query or session starts with empty data and a loading status.
Frames from the previous subscription cannot replace the new result.

The host supplies complete snapshots and incremental changes.
The session applies these changes to its current result.
It preserves separate rows for the same entity when their fields differ.
A reconnect snapshot replaces the result completely.

A transport error preserves the last data with an error status.
The Tonk host owns retries. A later valid frame clears the error.
The last hook cleanup closes the native subscription and clears its data.

To wait for a required input, pass `null` until the input exists:

```jsx
const { subject } = useDialogProps();
const result = useQuery(subject ? {
  ...counters,
  terms: { ...counters.terms, this: subject },
} : null);
```

## Await a transaction

`useTransaction(session?)` returns a stable function that accepts a transaction request.
It sends `tonk-claim` and awaits the result promise from the host.
The result contains `revision_before`, `revision_after`, and `commits`.
The transaction request can contain assertions and retractions in one `claims` array.

`useCommand(event)` continues to send an event to a command declared in the HTML.
Its boolean return value describes event dispatch only.
These two APIs have different completion behavior:

| API | Input | Result |
| --- | --- | --- |
| `useCommand('bump')` | Event detail for a declared command | Event dispatch boolean |
| `useTransaction()` | Structured Tonk claims | Promise for the host transaction result |

The session does not replace query data before a transaction completes.
The native subscription supplies the resulting data independently.
An awaited result confirms the host transaction, not synchronization to another device.

When the session closes, pending result promises reject with `AbortError`.
A transaction already sent to Tonk can still commit.
Closing a session does not roll back that transaction.

## Supply an explicit provider

A React tree outside `defineReactComponent` can use an explicit session.
The host element must be connected under the intended Tonk routing context.

```jsx
import { createRoot } from 'react-dom/client';
import { createSession } from 'tonk-builder/session';
import { Provider } from 'tonk-builder/react';
import { App } from './app.jsx';

const host = document.querySelector('#react-controls');
const session = createSession(host);
const container = document.createElement('div');
host.attachShadow({ mode: 'open' }).append(container);
const root = createRoot(container);
root.render(<Provider value={session}><App /></Provider>);

function dispose() {
  root.unmount();
  session.close();
}
```

`useSession()` reads the nearest provider.
An explicit session argument overrides the provider for `useQuery` and `useTransaction`.
Provider changes update those hooks without conditional hook calls.
An explicit provider does not create or close the session.
Its owner must call `session.close()` during cleanup.

`Provider` supplies query and transaction access.
Template inputs and `useCommand` still require the context from `defineReactComponent`.
Those APIs refer to bindings and events on that registered custom element.

## Use a session without React

The native `setup` context also supplies a session:

```js
setup({ session, cleanup }) {
  const query = session.observe(counters);
  const unsubscribe = query.subscribe(() => {
    console.log(query.getSnapshot());
  });
  cleanup(unsubscribe);
}
```

`session.query(query)` performs a single read.
`session.observe(query)` supplies `getSnapshot()` and `subscribe(listener)`.
The first subscriber opens the native subscription.
`session.transact(request)` returns the same promise as the React transaction hook.

The component session closes on unmount or entity key change.
An explicit `createSession(host, { signal })` can use another lifecycle signal.
The session rejects new operations after it closes.

The [type declarations](../src/session.d.ts) define the session API.

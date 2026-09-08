# React binding design

[React guide](react.md) · [Session guide](session.md)

The React adapter now has a public session layer for live queries and transactions.
This layer follows the provider and hook design of the original Dialog React library.
It connects that design to the current native Tonk host.

## Authoring model

An application separates its data operations from its React controls.
A data module exports reusable query objects and transaction functions.
Components use `useQuery()` to read results and `useTransaction()` to submit changes.
`Provider` selects the session for a React tree.

`defineReactComponent` supplies this provider automatically.
The component session follows the native host routing context.
The session closes when the component unmounts or its entity key changes.
An author can also supply an explicit session to a provider or hook.

Most display data still uses native `{field}` templates.
`useDialogProps()` reads the fields already supplied to the custom element.
`useQuery()` reads additional data for controls such as the counter creation form.
React local state holds unsaved inputs and temporary operation status.

## Query lifecycle

`useQuery()` reads an immutable result through React's `useSyncExternalStore`.
The result separates loading, empty data, errors, and a paused query.
A `null` query pauses the subscription without conditional hook calls.
The [React subscription contract](https://react.dev/reference/react/useSyncExternalStore) requires stable snapshots between changes.

The session gives equivalent JSON queries the same identity.
Multiple readers share one native subscription for the same query.
An inline object with unchanged values does not start another subscription.
A changed query or provider session replaces the subscription and clears the previous result.

The native host supplies snapshots, deltas, errors, and reconnect snapshots.
The adapter follows native Tonk row equality and recovery behavior when it applies deltas.
Rows with the same entity and different field values remain separate.
The final reader cleanup cancels the subscription and clears its data.
The session retains query handles until it closes, so a later reader can reuse the handle.

Each subscription run has a separate identity.
A frame from an ended run has no effect, even if cancellation and delivery overlap.
A transport error retains the last data with an error status.
A valid later frame restores the ready status.

## Transactions and command events

`useTransaction()` submits structured claims through `tonk-claim`.
The returned promise resolves with the host transaction result or rejects with the host error.
The example form awaits this promise before it confirms creation.

`useCommand()` still sends events to commands declared in native HTML.
Its dispatch boolean does not confirm a stored change.
The transaction hook provides completion when a control needs that behavior.
Both paths leave subsequent query updates to Tonk.

Closing a session rejects pending results and prevents new operations.
It does not undo transactions that the host already received.
This rule also applies when an entity change ends a component lifecycle.

## Native host integration

The session uses the same consumer protocol as native Tonk elements:

| Operation | Host interface |
| --- | --- |
| Single query | `tonk-query`, with `detail.query` and a result promise |
| Live query | `tonk-subscribe`, with `detail.query` and a cancellation handle |
| Query frames | Consumer `reset`, `update`, and `error` methods |
| Transaction | `tonk-claim`, with `detail.request` and a result promise |

Each live query uses a hidden consumer element under the session host.
For React components, that element sits in the shadow root outside the React container.
Native template elements remain under Tonk control.
The host supplies space routing, transport, and reconnection.

## Original design references

The reference implementation is in the adjacent `dialog-db` checkout:

| File | Design contribution |
| --- | --- |
| `typescript/dialog-experimental/src/react.ts` | Public provider, session hook, live queries, and explicit transactions |
| `typescript/dialog-experimental/src/session.ts` | Session lifetime and subscription cancellation |
| `typescript/dialog-experimental/test/react.spec.web.tsx` | Components that react to stored changes and submit transactions |

Commits `87a7d0f0`, `8f0c5ec0`, `be4aabef`, and `e9084657` introduced that design in May 2025.
The current adapter preserves those authoring concepts with the current Tonk transport and data formats.

## Verification

Tests cover shared subscriptions, query changes, provider changes, explicit sessions, and React Strict Mode.
They also cover snapshots, deltas, reconnects, cancellation, transaction results, and host errors.
Native component tests check session closure on entity changes and unmount.
The example query and claims also pass validation with the adjacent Tonk Rust libraries.

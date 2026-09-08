# State and component lifecycle

[Back to the README](../README.md)

Dialog stores application data. Tonk templates display that data through `{field}` bindings.
A component reads selected fields and adds event handlers or local state.
This guide follows the counter from the README.

## Display stored data

The counter template displays the name and count directly:

```html
<h1>{name}</h1>
<output>{count}</output>
```

Tonk updates these elements when the query result changes.
The JavaScript component does not need to format or replace this text.
Collections and repeated rows can also remain in native templates.

## Supply inputs to a component

The component receives the fields that its behavior needs.
The following element supplies the entity and count:

```html
<builder-counter html:subject={this} html:count={count} onbump=builder-counter/bump>
  <button type="button" data-action="bump">Add one</button>
  <button type="button" data-action="help">Help</button>
  <p data-help hidden>Dialog stores the count.</p>
</builder-counter>
<script type="module" src="./main.js"></script>
```

`{this}` identifies the current entity.
The native `html:` prefix tells Tonk to set an HTML attribute.
The helper observes these attributes and converts their text to the declared input types.
It can thus receive changed values and detect removed fields.

The helper requires `html:prop={field}` for its inputs.
Ordinary bindings can set JavaScript properties for some value types.
Those property changes do not notify the attribute observer.

## Add behavior and local state

The following `main.js` registers the element from the HTML example:

```js
import { defineComponent } from 'tonk-builder/runtime';

defineComponent('builder-counter', {
  props: { subject: 'entity', count: 'number' },
  key: 'subject',
  setup({ host, props, state, effect, on, command }) {
    const [helpOpen, setHelpOpen] = state(false);

    on('click', '[data-action="bump"]', () => {
      command('bump', { builderCounter: props.subject, amount: 1 });
    });
    on('click', '[data-action="help"]', () => setHelpOpen((open) => !open));

    effect(() => {
      host.querySelector('[data-help]').hidden = !helpOpen();
    }, () => [helpOpen()]);

    effect(() => {
      host.querySelector('[data-action="bump"]').disabled = props.count === undefined;
    }, () => [props.count]);
  },
});
```

`props` supplies the current inputs as read-only values.
`state(false)` creates a local value for the help panel.
The first effect changes the panel visibility when that local value changes.
The second effect disables the command button when the count is unavailable.

`key: 'subject'` connects the component lifecycle to the entity.
The helper waits for this input before it calls `setup`.
If the entity changes, the helper discards the old local state and calls `setup` again.

## Change stored data with a command

The HTML attribute `onbump=builder-counter/bump` connects the `bump` event to a declared command.
The component sends the entity and requested amount in the event detail.
The command fields describe that detail. The rule specifies the data change.

The following declarations come from the counter schema:

```yaml
command!: &builder-counter/bump
  description: Add the requested amount to this counter
  with:
    subject:
      the: dom.event.detail/builder-counter
      description: Counter entity
      as: entity
    amount:
      the: dom.event.detail/amount
      description: Amount to add
      as: unsigned-integer

rule!:
  assert!: builder-counter
  when:
    - assert: builder-counter/bump
      where: { subject: ?this, amount: ?amount }
    - assert: builder-counter
      where: { this: ?this, name: ?name, count: ?old }
    - assert: math/sum
      where: { of: ?old, with: ?amount, is: ?count }
```

The rule reads the current count from Dialog and adds the requested amount.
The next query result supplies the updated `{count}` binding.
The component sends an operation, so it does not need to maintain a separate stored count.

The JavaScript detail key `builderCounter` corresponds to `dom.event.detail/builder-counter`.
The example declares the `builder-counter` concept in the same schema file.
These command and rule declarations require that concept.

`command()` returns the boolean result of event dispatch.
This result does not confirm that Tonk saved the change.
The command event API provides no transaction receipt.
For a result promise, use the separate [session transaction API](session.md#await-a-transaction).
Incoming template values do not cause the helper to send a command.

## Read component inputs

The `props` declaration selects the conversion for each input.

| Type | Component value | Missing value |
| --- | --- | --- |
| `string` | Attribute text | `undefined` |
| `entity` | Entity URI | `undefined` |
| `number` | Finite JavaScript number | `undefined` |
| `boolean` | `true` when the attribute exists | `false` |
| `json` | Parsed JSON with frozen objects and arrays | `undefined` |

Unresolved entity, number, and JSON bindings also produce `undefined`.
Invalid number or JSON text causes an error.
A boolean input uses attribute presence, so it cannot distinguish a missing field from `false`.
The `json` type accepts a field that contains one JSON value.

A property name such as `displayName` uses the attribute `display-name` by default.
An explicit attribute name overrides that conversion:

```js
props: {
  displayName: { type: 'string', attribute: 'name' },
}
```

`props.count` reads the current value each time.
A destructured value in `setup` keeps the value from that call.
To receive later values, read `props.count` inside the event handler or effect.

```js
effect(() => {
  console.log(props.count);
}, () => [props.count]);
```

The `bindings` interface supplies input subscriptions for other adapters.
`bindings.getSnapshot()` returns an immutable object that stays stable until an input changes.
`bindings.subscribe(listener)` returns a function that removes the subscription.

## Use the lifecycle API

The helper calls `setup(context)` once for each mount.
Register state, effects, event handlers, and cleanup functions synchronously inside `setup`.

| API | Behavior |
| --- | --- |
| `state(initial)` | Returns `[getValue, setValue]` for a local value. |
| `setValue(next)` | Replaces the local value. A function receives the previous value. |
| `effect(run, () => [values])` | Runs after mount and after a listed value changes. |
| `effect(run, () => [])` | Runs once for each mount. |
| `effect(run)` | Runs after mount and after each batch of input or local state changes. |
| `on(type, selector, handler)` | Handles matching events through the host element. |
| `on(type, handler)` | Adds an event listener to the host element. |
| `command(event, detail)` | Sends a bubbling command event from the host element. |
| `cleanup(callback)` | Registers a callback for unmount. |
| `signal` | Aborts when the component unmounts or its entity key changes. |
| `session` | Supplies native queries and transactions for this component lifecycle. |

The helper compares local values with `Object.is`.
To signal an object change, pass a replacement object to its setter.
The setter changes local state in memory. It does not save data or send a command.

An effect can return a cleanup function.
The helper calls that function before the effect repeats and when the component unmounts.
The effect also receives an `AbortSignal` for asynchronous work.
The helper aborts this signal before each repeat and on unmount.

Effect callbacks must return synchronously.
Start asynchronous work inside the callback.
Pass its signal to operations that accept an `AbortSignal`.
The `setup` function can also return a cleanup function.

The helper processes synchronous input changes together at a microtask boundary.
A synchronous DOM move preserves the component lifecycle.
A disconnect that lasts until the microtask check causes an unmount.
A later connection starts a new lifecycle.
Setters and command functions from an old lifecycle have no effect.

## Keep template elements under Tonk control

The native helper leaves the template elements in place.
Effects can control properties that have no template binding, such as the example help panel visibility.
Tonk continues to control the elements and properties with `{field}` bindings.

The helper keeps an existing custom element registration when the same name registers again.
To load changed component code, reload the Tonk browser.

Setup and effect errors end the current lifecycle.
The helper sends a cancelable `tonk-builder:error` event with `detail.error`.
It also logs the error unless an event handler calls `preventDefault()`.

The [React guide](react.md) uses this lifecycle with React controls.
The [session guide](session.md) explains additional queries and transactions that return a host result.

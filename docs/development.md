# Development

[Back to the README](../README.md)

## Check the builder

From the builder checkout, run:

```sh
npm test
npm run check
npm run build
npm run build:react
```

The tests check module builds, YAML output, native template syntax, project creation, and watch mode.
They also check input changes, commands, local state, entity changes, and cleanup.
The React tests check hooks and preservation of native child elements.

The lifecycle tests use Happy DOM.
They do not execute a complete Tonk browser session or a real command transaction.
The example builds verify that the native and React sources compile into YAML.

The [React design note](react-design.md) compares this adapter with the older bindings in the adjacent `dialog-db` checkout.

## Package the builder

To inspect the package contents, run:

```sh
npm pack --dry-run
```

To create an installable package, run:

```sh
npm pack
```

The package contains the CLI, build API, component helpers, project templates, and documentation.
The package excludes development tests and example build output.

## Tonk source references

The adjacent `../tonk` checkout defines the loader behavior.
The following paths are relative to that checkout:

| Source | Behavior |
| --- | --- |
| `rust/tonk-display/src/template.rs` | Template bindings, attribute and property updates, and missing fields |
| `rust/tonk-display/src/component.rs` | Module execution and duplicate detection |
| `rust/tonk-display/src/events/delegate.rs` | Event detail and command processing |
| `rust/tonk-cli/src/guide-events.md` | Command and rule examples |
| `rust/tonk-template/src/lib.rs` | Native template planning |
| `rust/tonk-notation/src/parse.rs` | YAML document streams and repeated assertions |
| `rust/tonk-host/src/consumer.rs` | Native query and transaction events |
| `rust/tonk-host/src/ops.rs` | Subscription frames, cancellation, routing, and result promises |
| `rust/tonk-template/src/resolve.rs` | Native query construction and field projection |
| `rust/tonk-core/src/claim.rs` | Structured transaction requests and claim validation |
| `rust/tonk-worker-api/src/conclusion.rs` | Query conclusions and subscription frame types |

## Documentation terms

The documentation uses these terms consistently:

| Term | Meaning |
| --- | --- |
| Binding | A native template expression that supplies a field value. |
| Command | A declared Tonk operation that receives an event. |
| Component | A custom element with JavaScript behavior. |
| Entity key | An input that selects the component lifecycle identity. |
| Local state | Temporary data in component memory. |
| Mount | The start of a component lifecycle. |
| Rule | A Tonk declaration that determines data from matching inputs. |
| Seed | Notation that creates initial example data. |
| Stored state | Data in Dialog that remains after a component unmounts. |
| Unmount | The end of a component lifecycle, including cleanup. |
| View | A native Tonk presentation for a model. |

ASD-STE100 refers to the writing standard.
The [official standard](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf) defines its writing rules and vocabulary.

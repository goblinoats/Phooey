import { build, defineConfig, watch } from '../src/index.js';
import { defineComponent } from '../src/runtime.js';
import { defineReactComponent, useDialogProps, useCommand, useQuery, useSession, useTransaction, Provider } from '../src/react.js';
import { createSession, type Query, type Transaction } from '../src/session.js';
import { createElement } from 'react';

const config = defineConfig({
  name: 'typed-app',
  entries: [{ name: 'card', kind: 'view', entry: 'card.html', model: 'person' }],
  plugins: [{ name: 'test-plugin', setup() {} }],
});

const query: Query = { predicate: 'tree/node', terms: {} };
const transaction: Transaction = { claims: [{ op: 'assert', application: {
  predicate: { kind: 'durable', concept: { with: { name: { the: 'example/name', as: 'Text', cardinality: 'one' } } } },
  parameters: { name: 'Example' },
} }] };
function QueryControls() {
  const session = useSession();
  const { data, status, error } = useQuery<{ name: string }>(query, session);
  const transact = useTransaction();
  const name: string | undefined = data[0]?.fields.name;
  // @ts-expect-error Query results are read-only.
  data[0].fields.name = 'Changed';
  void transact(transaction).then((result) => result.revision_after);
  void useQuery(null);
  void status; void error; void name;
  return null;
}
const session = createSession(document.body);
void createElement(Provider, { value: session }, createElement(QueryControls));
void session.query<{ name: string }>(query).then((rows) => rows[0].fields.name);
session.close();
void build({ config, write: false }).then((result) => result.entries[0].content.toUpperCase());
void watch({ config, onBuild(result) { console.log(result.outFile); } }).then((handle) => handle.close());

defineComponent('typed-component', {
  props: { subject: 'entity', count: 'number', active: 'boolean', firstName: { type: 'string', attribute: 'first-name' } },
  key: 'subject',
  setup({ props, state, effect, command, on }) {
    const [getOpen, setOpen] = state(false);
    const count: number | undefined = props.count;
    // @ts-expect-error Tonk template inputs are read-only.
    props.count = 5;
    effect(() => { console.log(count, props.firstName, getOpen()); }, () => [props.count]);
    on('click', 'button', () => { setOpen((open) => !open); command('bump', { subject: props.subject }); });
  },
});
defineReactComponent('typed-react', {
  props: { subject: 'entity', count: 'number' }, key: 'subject',
  component() {
    const props = useDialogProps<{ subject: string; count: number }>();
    const command = useCommand<{ subject: string }>('bump');
    void props.count.toFixed();
    void command({ subject: props.subject });
    return null;
  },
});

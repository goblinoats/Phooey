import './helpers/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flush } from './helpers/dom.js';
import { defineReactComponent, Provider, useQuery, useSession, useTransaction, useCommand, useDialogProps } from '../src/react.js';
import { createSession } from '../src/session.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('React subscribes to Tonk template inputs, preserves Tonk-rendered DOM, and keeps local control state', async () => {
  const frames = [];
  let cleanups = 0;
  function Controls() {
    const { subject, count } = useDialogProps();
    const bump = useCommand('bump');
    const [open, setOpen] = useState(false);
    useEffect(() => { frames.push([subject, count]); return () => { cleanups++; }; }, [subject, count]);
    return h('div', null,
      h('p', { id: 'bound' }, `Bound ${count}`),
      h('button', { id: 'command', onClick: () => bump({ subject, amount: 1 }) }, 'Add one'),
      h('button', { id: 'local', onClick: () => setOpen((previous) => !previous) }, String(open)));
  }
  defineReactComponent('test-react-controls', {
    props: { subject: 'entity', count: 'number' }, key: 'subject', component: Controls,
  });
  const host = document.createElement('test-react-controls');
  host.innerHTML = '<h2>Tonk-rendered title</h2><output>0</output>';
  const native = host.querySelector('h2');
  let detail;
  host.addEventListener('bump', (event) => { detail = event.detail; });
  await act(async () => {
    host.setAttribute('subject', 'id:one');
    host.setAttribute('count', '0');
    document.body.append(host);
    await flush();
  });
  assert.equal(host.shadowRoot.querySelector('#bound').textContent, 'Bound 0');
  assert.equal(host.querySelector('h2'), native);
  assert.equal(host.querySelector('output').textContent, '0');
  await act(async () => { host.shadowRoot.querySelector('#local').click(); });
  assert.equal(host.shadowRoot.querySelector('#local').textContent, 'true');
  await act(async () => { host.shadowRoot.querySelector('#command').click(); });
  assert.deepEqual(detail, { subject: 'id:one', amount: 1 });
  assert.equal(host.shadowRoot.querySelector('#bound').textContent, 'Bound 0', 'dispatch does not optimistically replace Tonk template inputs');

  await act(async () => { host.setAttribute('count', '5'); await flush(); });
  assert.equal(host.shadowRoot.querySelector('#bound').textContent, 'Bound 5');
  assert.equal(host.shadowRoot.querySelector('#local').textContent, 'true');
  assert.deepEqual(frames, [['id:one', 0], ['id:one', 5]]);

  await act(async () => { host.setAttribute('subject', 'id:two'); host.setAttribute('count', '9'); await flush(); });
  assert.equal(host.shadowRoot.querySelector('#local').textContent, 'false', 'a new entity gets fresh useState');
  assert.equal(host.shadowRoot.querySelector('#bound').textContent, 'Bound 9');
  assert.equal(host.querySelector('h2'), native);
  await act(async () => { host.remove(); await flush(); });
  assert.equal(cleanups, 3);
  assert.equal(host.shadowRoot.childNodes.length, 0);
});

test('descendant hooks use their own host context and reject commands from an ended lifecycle', async (t) => {
  const commands = new Map();
  const events = [];
  const hosts = [];
  t.after(async () => {
    await act(async () => { for (const host of hosts) host.remove(); await flush(); });
  });

  function Readout() {
    const { subject, count } = useDialogProps();
    return h('output', null, `${subject}:${count ?? 'missing'}`);
  }
  function Action() {
    const { subject, count } = useDialogProps();
    const bump = useCommand('bump');
    useEffect(() => { commands.set(subject, bump); }, [subject, bump]);
    return h('button', {
      disabled: count === undefined,
      onClick: () => bump({ subject, amount: 1 }),
    }, 'Add one');
  }
  function Controls() {
    return h('section', null, h(Readout), h('div', null, h(Action)));
  }
  defineReactComponent('test-react-scoped', {
    props: { subject: 'entity', count: 'number' }, key: 'subject', component: Controls,
  });
  await act(async () => {
    for (const [subject, count] of [['id:first', '1'], ['id:second', '20']]) {
      const host = document.createElement('test-react-scoped');
      host.setAttribute('subject', subject);
      host.setAttribute('count', count);
      host.addEventListener('bump', (event) => events.push([host, event.detail]));
      hosts.push(host);
      document.body.append(host);
    }
    await flush();
  });
  const [first, second] = hosts;
  const output = (host) => host.shadowRoot.querySelector('output').textContent;
  const button = (host) => host.shadowRoot.querySelector('button');
  const firstCommand = commands.get('id:first');
  assert.equal(output(first), 'id:first:1');
  assert.equal(output(second), 'id:second:20');

  await act(async () => { first.setAttribute('count', '2'); await flush(); });
  assert.equal(output(first), 'id:first:2');
  assert.equal(output(second), 'id:second:20');
  assert.equal(commands.get('id:first'), firstCommand);
  await act(async () => { button(first).click(); button(second).click(); });
  assert.deepEqual(events, [
    [first, { subject: 'id:first', amount: 1 }],
    [second, { subject: 'id:second', amount: 1 }],
  ]);

  await act(async () => { first.removeAttribute('count'); await flush(); });
  assert.equal(output(first), 'id:first:missing');
  assert.equal(button(first).disabled, true);
  assert.equal(output(second), 'id:second:20');
  assert.equal(button(second).disabled, false);

  await act(async () => {
    first.setAttribute('subject', 'id:third');
    first.setAttribute('count', '3');
    await flush();
  });
  assert.equal(output(first), 'id:third:3');
  assert.equal(firstCommand({ subject: 'id:third', amount: 100 }), false);
  assert.equal(events.length, 2);
  const thirdCommand = commands.get('id:third');
  await act(async () => { first.remove(); await flush(); });
  assert.equal(thirdCommand({ subject: 'id:third', amount: 100 }), false);
  await act(async () => { second.setAttribute('count', '21'); await flush(); button(second).click(); });
  assert.equal(output(second), 'id:second:21');
  assert.deepEqual(events.slice(2), [[second, { subject: 'id:second', amount: 1 }]]);
});

test('query hooks share subscriptions and follow changed queries and provider sessions in StrictMode', async (t) => {
  const host = document.createElement('div');
  const otherHost = document.createElement('div');
  const container = document.createElement('div');
  document.body.append(host, otherHost, container);
  const first = createSession(host);
  const second = createSession(otherHost);
  const subscriptions = [];
  for (const parent of [host, otherHost]) {
    parent.addEventListener('tonk-subscribe', (event) => {
      event.preventDefault();
      const record = { parent, consumer: event.composedPath()[0], query: event.detail.query, active: true };
      event.detail.subscription = { cancel() { record.active = false; } };
      subscriptions.push(record);
    });
  }
  const active = () => subscriptions.filter((record) => record.active);
  let context;
  function Reader({ query, source }) {
    const result = useQuery(query, source);
    context = { session: useSession(source), transact: useTransaction(source) };
    return h('output', null, `${result.status}:${result.data.map((row) => row.fields.name).join(',')}`);
  }
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    first.close(); second.close();
    host.remove(); otherHost.remove(); container.remove();
  });
  async function render(query, provider = first, source) {
    await act(async () => {
      root.render(h(StrictMode, null, h(Provider, { value: provider },
        h(Reader, { query, source }), h(Reader, { query, source }))));
    });
  }
  const query = { predicate: 'tree/node', terms: { path: 'first' } };
  await render(query);
  assert.equal(active().length, 1);
  assert.equal(context.session, first);
  assert.equal(context.transact, first.transact);
  const old = active()[0];
  await act(async () => old.consumer.reset([{ this: 'id:a', fields: { name: 'A' } }]));
  assert.deepEqual([...container.querySelectorAll('output')].map((node) => node.textContent), ['ready:A', 'ready:A']);
  const opened = subscriptions.length;
  await render({ terms: { path: 'first' }, predicate: 'tree/node' });
  assert.equal(subscriptions.length, opened);

  await render({ ...query, terms: { path: 'second' } });
  assert.equal(old.active, false);
  assert.equal(active().length, 1);
  assert.equal(container.querySelector('output').textContent, 'loading:');
  await act(async () => old.consumer.reset([{ this: 'id:late', fields: { name: 'Late' } }]));
  assert.equal(container.querySelector('output').textContent, 'loading:');
  await render(null);
  assert.equal(active().length, 0);
  assert.equal(container.querySelector('output').textContent, 'idle:');

  await render(query, second);
  assert.equal(context.session, second);
  assert.equal(active()[0].parent, otherHost);
  await render(query, second, first);
  assert.equal(context.session, first);
  assert.equal(context.transact, first.transact);
  assert.equal(active().length, 1);
  assert.equal(active()[0].parent, host);
});

test('native component sessions close their queries on entity changes and unmount', async (t) => {
  const sessions = [];
  const subscriptions = [];
  function Controls() {
    const session = useSession();
    useQuery({ predicate: 'tree/node', terms: {} });
    useEffect(() => { sessions.push(session); }, [session]);
    return h('button', null, 'Control');
  }
  defineReactComponent('test-react-session', {
    props: { subject: 'entity' }, key: 'subject', component: Controls,
  });
  const host = document.createElement('test-react-session');
  host.innerHTML = '<h2>Native title</h2>';
  const title = host.firstChild;
  host.addEventListener('tonk-subscribe', (event) => {
    event.preventDefault();
    const record = { consumer: event.composedPath()[0], active: true };
    event.detail.subscription = { cancel() { record.active = false; } };
    subscriptions.push(record);
  });
  t.after(async () => { await act(async () => { host.remove(); await flush(); }); });
  await act(async () => { host.setAttribute('subject', 'id:one'); document.body.append(host); await flush(); });
  assert.equal(subscriptions[0].consumer.parentNode, host.shadowRoot);
  assert.equal(host.firstChild, title);
  await act(async () => { host.setAttribute('subject', 'id:two'); await flush(); });
  assert.equal(sessions[0].signal.aborted, true);
  assert.equal(subscriptions[0].active, false);
  assert.equal(subscriptions[1].active, true);
  assert.notEqual(sessions[0], sessions[1]);
  await act(async () => { host.remove(); await flush(); });
  assert.equal(sessions[1].signal.aborted, true);
  assert.equal(subscriptions[1].active, false);
});

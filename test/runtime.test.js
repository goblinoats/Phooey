import './helpers/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { flush } from './helpers/dom.js';
import { defineComponent } from '../src/runtime.js';

let sequence = 0;
function component(t, definition, attributes = {}) {
  const tag = `test-dialog-${++sequence}`;
  defineComponent(tag, definition);
  const host = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) host.setAttribute(key, value);
  document.body.append(host);
  t.after(async () => { host.remove(); await flush(); });
  return host;
}

test('Tonk template inputs batch into read-only snapshots; commands leave them unchanged', async (t) => {
  let context;
  const frames = [];
  const signals = [];
  let cleaned = 0;
  const host = component(t, {
    props: { subject: 'entity', count: 'number', title: 'string' }, key: 'subject',
    setup(ctx) {
      context = ctx;
      ctx.effect((signal) => {
        signals.push(signal);
        frames.push([ctx.props.count, ctx.props.title]);
        return () => { cleaned++; };
      }, () => [ctx.props.count, ctx.props.title]);
    },
  }, { subject: '{this}', count: '{count}' });
  await flush();
  assert.equal(context, undefined, 'waits for Tonk template entity identity');
  host.setAttribute('subject', 'id:one');
  host.setAttribute('count', '0');
  host.setAttribute('title', 'First');
  await flush();
  assert.deepEqual(frames, [[0, 'First']]);
  assert.throws(() => { context.props.count = 4; }, TypeError);
  const snapshot = context.bindings.getSnapshot();
  assert.equal(context.bindings.getSnapshot(), snapshot);
  assert.ok(Object.isFrozen(snapshot));

  let detail;
  host.addEventListener('bump', (event) => { detail = event.detail; });
  context.command('bump', { subject: context.props.subject, amount: 1 });
  assert.deepEqual(detail, { subject: 'id:one', amount: 1 });
  assert.equal(context.props.count, 0, 'dispatch is not a local state mutation');
  host.setAttribute('count', '1');
  host.setAttribute('title', 'Remote update');
  await flush();
  assert.deepEqual(frames, [[0, 'First'], [1, 'Remote update']]);
  assert.equal(cleaned, 1);
  assert.ok(signals[0].aborted);
  assert.notEqual(context.bindings.getSnapshot(), snapshot);
  assert.equal(snapshot.count, 0, 'previous snapshots remain immutable');

  host.removeAttribute('count');
  await flush();
  assert.equal(context.props.count, undefined, 'an absent Tonk template field clears the input');
});

test('UI state survives incoming data and DOM moves, resets on entity changes/unmount', async (t) => {
  const contexts = [];
  let mounts = 0;
  let unmounts = 0;
  const host = component(t, {
    props: { subject: 'entity', count: 'number' }, key: 'subject',
    setup(ctx) {
      mounts++;
      const [get, set] = ctx.state(0);
      contexts.push({ ...ctx, get, set });
      ctx.on('click', () => set((value) => value + 1));
      return () => { unmounts++; };
    },
  }, { subject: 'id:one', count: '1' });
  await flush();
  contexts[0].set(3);
  host.setAttribute('count', '2');
  await flush();
  assert.equal(contexts[0].get(), 3);
  host.remove();
  document.body.append(host);
  await flush();
  assert.equal(mounts, 1);
  assert.equal(contexts[0].get(), 3);

  host.setAttribute('subject', 'id:two');
  await flush();
  assert.equal(mounts, 2);
  assert.equal(unmounts, 1);
  assert.ok(contexts[0].signal.aborted);
  assert.equal(contexts[1].get(), 0);
  contexts[0].set(10);
  assert.equal(contexts[0].get(), 3, 'stale async UI setters do nothing');
  assert.equal(contexts[0].command('bump'), false, 'a stale entity cannot dispatch commands');
  host.click();
  await flush();
  assert.equal(contexts[1].get(), 1, 'old event listeners were removed');

  host.remove();
  await flush();
  assert.equal(unmounts, 2);
  document.body.append(host);
  await flush();
  assert.equal(mounts, 3);
  assert.equal(contexts[2].get(), 0);
});

test('effects observe local state, honor dependencies and clean up on unmount', async (t) => {
  let local;
  const records = [];
  const signals = [];
  let once = 0;
  let cleaned = 0;
  const host = component(t, {
    props: {},
    setup({ state, effect }) {
      const [get, set] = state(false);
      local = set;
      effect(() => { once++; }, () => []);
      effect((signal) => {
        records.push(get()); signals.push(signal);
        return () => { cleaned++; };
      }, () => [get()]);
    },
  });
  await flush();
  local(true);
  local(true);
  await flush();
  assert.deepEqual(records, [false, true]);
  assert.equal(once, 1);
  assert.equal(cleaned, 1);
  host.remove();
  await flush();
  assert.equal(cleaned, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('JSON/boolean props follow html: bindings; snapshots are stable and deeply immutable', async (t) => {
  let context;
  const host = component(t, {
    props: { settings: 'json', enabled: 'boolean', firstName: { type: 'string', attribute: 'first-name' } },
    setup(ctx) { context = ctx; },
  }, { settings: '{"nested":{"count":1}}', enabled: '', 'first-name': 'Literal {braces}' });
  await flush();
  assert.equal(context.props.enabled, true);
  host.setAttribute('enabled', 'false');
  await flush();
  assert.equal(context.props.enabled, true, 'HTML boolean attributes use presence, even when the literal text is false');
  assert.equal(context.props.firstName, 'Literal {braces}');
  assert.deepEqual(context.props.settings, { nested: { count: 1 } });
  assert.throws(() => { context.props.settings.nested.count = 2; }, TypeError);
  const before = context.bindings.getSnapshot();
  host.setAttribute('settings', '{"nested":{"count":1}}');
  await flush();
  assert.equal(context.bindings.getSnapshot(), before);
  host.removeAttribute('enabled');
  host.setAttribute('settings', '{}');
  await flush();
  assert.equal(context.props.enabled, false);
  assert.deepEqual(context.props.settings, {});
  host.removeAttribute('settings');
  await flush();
  assert.equal(context.props.settings, undefined);
});

test('Tonk controls the light DOM; instances stay independent', async (t) => {
  const contexts = [];
  const definition = { props: { subject: 'entity' }, key: 'subject', setup(ctx) {
    contexts.push(ctx);
    ctx.on('click', '[data-action]', () => ctx.command('choose', { subject: ctx.props.subject }));
  } };
  const first = component(t, definition, { subject: 'id:first' });
  const second = component(t, definition, { subject: 'id:second' });
  first.innerHTML = '<strong>Tonk-rendered text</strong><button data-action><span>Choose</span></button>';
  const before = first.innerHTML;
  const strong = first.querySelector('strong');
  await flush();
  let detail;
  first.addEventListener('choose', (event) => { detail = event.detail; });
  first.querySelector('span').click();
  assert.deepEqual(detail, { subject: 'id:first' });
  assert.equal(first.innerHTML, before);
  assert.equal(first.querySelector('strong'), strong);
  assert.equal(contexts[1].props.subject, 'id:second');
  second.removeAttribute('subject');
  await flush();
  assert.ok(contexts[1].signal.aborted);
});

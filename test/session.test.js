import './helpers/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/session.js';
import { counters, addCounter } from '../examples/react/src/counters.js';

const row = (id, name, count = 0) => ({ this: id, fields: { name, count } });

function fixture(t) {
  const host = document.createElement('div');
  host.setAttribute('with', 'main@test-space');
  document.body.append(host);
  const session = createSession(host);
  const subscriptions = [];
  host.addEventListener('tonk-subscribe', (event) => {
    event.preventDefault();
    const consumer = event.composedPath()[0];
    const record = { consumer, query: event.detail.query, cancellations: 0 };
    event.detail.subscription = { cancel() { record.cancellations++; } };
    subscriptions.push(record);
  });
  t.after(() => { session.close(); host.remove(); });
  return { host, session, subscriptions };
}

test('a session shares queries and applies native snapshots, deltas, and reconnects', (t) => {
  const { session, subscriptions } = fixture(t);
  const store = session.observe(counters);
  const same = session.observe({ terms: counters.terms, predicate: counters.predicate });
  assert.equal(store, same);
  assert.equal(subscriptions.length, 0);
  const values = [];
  const off = store.subscribe(() => values.push(store.getSnapshot()));
  const offOther = same.subscribe(() => {});
  assert.equal(subscriptions.length, 1);
  const { consumer } = subscriptions[0];
  const a = row('id:a', 'A', 1);
  const b = row('id:a', 'B', 2);
  consumer.reset([a, b]);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().data, [a, b]);
  assert.throws(() => { store.getSnapshot().data[0].fields.count = 99; }, TypeError);
  const snapshot = store.getSnapshot();
  assert.equal(store.getSnapshot(), snapshot);
  const next = row('id:a', 'A', 3);
  consumer.update({ retracted: [a], asserted: [next] });
  assert.deepEqual(store.getSnapshot().data, [b, next]);
  consumer.error({ kind: 'network', message: 'Retrying' });
  assert.equal(store.getSnapshot().error.message, 'Retrying');
  assert.deepEqual(store.getSnapshot().data, [b, next]);
  consumer.reset([next], { reconnect: true });
  assert.equal(store.getSnapshot().status, 'ready');
  assert.equal(store.getSnapshot().error, null);
  consumer.update({ retracted: [row('id:a', 'A', 2)], asserted: [row('id:a', 'A', 4)] });
  assert.deepEqual(store.getSnapshot().data, [row('id:a', 'A', 4)]);
  off();
  assert.equal(subscriptions[0].cancellations, 0);
  offOther();
  offOther();
  assert.equal(subscriptions[0].cancellations, 1);
  assert.equal(consumer.isConnected, false);
  const delivered = values.length;
  consumer.reset([row('id:late', 'Late')]);
  assert.equal(values.length, delivered);
  const again = store.subscribe(() => {});
  assert.equal(subscriptions.length, 2);
  assert.equal(store.getSnapshot().status, 'loading');
  consumer.error({ message: 'Late error' });
  assert.equal(store.getSnapshot().status, 'loading');
  again();
});

test('native transactions wait for host results and reject host errors or ended sessions', async (t) => {
  const { host, session } = fixture(t);
  const requests = [];
  let complete;
  host.addEventListener('tonk-claim', (event) => {
    event.preventDefault();
    requests.push(event.detail.request);
    event.detail.result = new Promise((resolve, reject) => { complete = { resolve, reject }; });
  });
  let finished = false;
  const receipt = { revision_before: null, revision_after: { tree: 'test' }, commits: { claims: 1 } };
  const pending = session.transact(addCounter('Second')).then((result) => { finished = true; return result; });
  assert.deepEqual(requests, [addCounter('Second')]);
  await Promise.resolve();
  assert.equal(finished, false);
  complete.resolve(receipt);
  assert.equal(await pending, receipt);
  const rejected = session.transact(addCounter('Third'));
  complete.reject({ kind: 'validation', message: 'Invalid name' });
  await assert.rejects(rejected, { name: 'validation', message: 'Invalid name' });
  const abandoned = session.transact(addCounter('Fourth'));
  session.close();
  await assert.rejects(abandoned, { name: 'AbortError' });
  complete.resolve(receipt);
  await assert.rejects(session.transact(addCounter('Fifth')), { name: 'AbortError' });
  assert.equal(requests.length, 3);
});

test('sessions report missing hosts and close subscriptions on abort', async (t) => {
  const { host, subscriptions } = fixture(t);
  const controller = new AbortController();
  const session = createSession(host, { signal: controller.signal });
  await assert.rejects(session.query(counters), /No Tonk host handled tonk-query/);
  host.addEventListener('tonk-query', (event) => {
    event.preventDefault();
    event.detail.result = Promise.resolve([row('id:one', 'One')]);
  });
  assert.deepEqual(await session.query(counters), [row('id:one', 'One')]);
  const store = session.observe(counters);
  const off = store.subscribe(() => {});
  controller.abort();
  assert.equal(subscriptions[0].cancellations, 1);
  assert.equal(store.getSnapshot().error.name, 'AbortError');
  subscriptions[0].consumer.reset([row('id:late', 'Late')]);
  assert.deepEqual(store.getSnapshot().data, []);
  off();
  await assert.rejects(session.query(counters), { name: 'AbortError' });
  assert.throws(() => session.observe({ terms: { bad: undefined }, predicate: 'tree/node' }), /JSON/);
});

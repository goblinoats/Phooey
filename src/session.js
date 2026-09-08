const empty = Object.freeze([]);
export const idleQuery = Object.freeze({ status: 'idle', data: empty, error: null });
const loading = Object.freeze({ status: 'loading', data: empty, error: null });

/** Give equivalent JSON requests the same key. Reject values that JSON would lose. */
export function queryKey(value) {
  const seen = new Set();
  function encode(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('Requests must contain JSON values without cycles.');
    seen.add(value);
    let encoded;
    if (Array.isArray(value)) encoded = '[' + Array.from(value, encode).join(',') + ']';
    else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Requests must use plain JSON objects.');
      encoded = '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + encode(value[key])).join(',') + '}';
    }
    seen.delete(value);
    return encoded;
  }
  return encode(value);
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function rows(value) {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row.this !== 'string' || !row.fields || Array.isArray(row.fields) || typeof row.fields !== 'object')) {
    throw new TypeError('A query frame must contain conclusions with this and fields.');
  }
  return freeze(JSON.parse(queryKey(value)));
}

function errorFrom(value) {
  if (value instanceof Error) return value;
  const error = new Error(value?.message ?? String(value));
  if (value?.kind) error.name = value.kind;
  return error;
}

const aborted = () => new DOMException('The Tonk session is closed.', 'AbortError');

function dispatch(host, type, detail) {
  if (!host.isConnected) throw new Error('Connect the session host before a Tonk operation.');
  const event = new CustomEvent(type, { bubbles: true, composed: true, cancelable: true, detail });
  host.dispatchEvent(event);
  if (!event.defaultPrevented) throw new Error(`No Tonk host handled ${type}.`);
  return detail;
}

/** Open a session in the routing context of a native Tonk element. */
export function createSession(host, { signal } = {}) {
  if (!host?.ownerDocument || typeof host.dispatchEvent !== 'function') throw new TypeError('A session requires a host element.');
  const controller = new AbortController();
  const queries = new Map();

  function close() {
    if (controller.signal.aborted) return;
    controller.abort();
    for (const store of queries.values()) store.dispose();
    queries.clear();
    signal?.removeEventListener('abort', close);
  }
  if (signal?.aborted) close();
  else signal?.addEventListener('abort', close, { once: true });

  async function request(type, field, body) {
    if (controller.signal.aborted) throw aborted();
    const detail = { [field]: JSON.parse(queryKey(body)) };
    const result = dispatch(host, type, detail).result;
    if (!result || typeof result.then !== 'function') throw new Error(`${type} did not return a result promise.`);
    return new Promise((resolve, reject) => {
      const cancel = () => reject(aborted());
      controller.signal.addEventListener('abort', cancel, { once: true });
      Promise.resolve(result).then(
        (value) => controller.signal.aborted ? reject(aborted()) : resolve(value),
        (error) => reject(errorFrom(error)),
      ).finally(() => controller.signal.removeEventListener('abort', cancel));
      if (controller.signal.aborted) cancel();
    });
  }

  function observe(query) {
    const key = queryKey(query);
    if (queries.has(key)) return queries.get(key);
    const listeners = new Set();
    let snapshot = loading;
    let run;
    const publish = (next) => {
      snapshot = Object.freeze(next);
      for (const listener of [...listeners]) listener();
    };
    const stop = () => {
      const previous = run;
      run = undefined;
      try { previous?.handle?.cancel(); }
      finally { previous?.consumer.remove(); }
    };
    const start = () => {
      if (controller.signal.aborted) {
        publish({ status: 'error', data: empty, error: aborted() });
        return;
      }
      snapshot = loading;
      const consumer = host.ownerDocument.createElement('span');
      consumer.hidden = true;
      consumer.setAttribute('data-tonk-query', '');
      const current = { consumer };
      run = current;
      const accept = (callback) => (payload) => {
        if (run !== current || controller.signal.aborted) return;
        try { callback(payload); }
        catch (error) { publish({ status: 'error', data: snapshot.data, error: errorFrom(error) }); }
      };
      consumer.reset = accept((value) => publish({ status: 'ready', data: rows(value), error: null }));
      consumer.update = accept((delta) => {
        const asserted = rows(delta.asserted ?? []);
        const retracted = rows(delta.retracted ?? []);
        const removed = new Set(retracted.map(queryKey));
        const drifted = new Set(retracted.map((row) => row.this));
        let data = snapshot.data.filter((row) => {
          if (!removed.has(queryKey(row))) return true;
          drifted.delete(row.this);
          return false;
        });
        // Match native Tonk recovery when a retraction refers to a missed value.
        const changed = new Set(asserted.map((row) => row.this));
        data = data.filter((row) => !(drifted.has(row.this) && changed.has(row.this)));
        publish({ status: 'ready', data: Object.freeze([...data, ...asserted]), error: null });
      });
      consumer.error = accept((error) => publish({ status: 'error', data: snapshot.data, error: errorFrom(error) }));
      try {
        (host.shadowRoot ?? host).append(consumer);
        current.handle = dispatch(consumer, 'tonk-subscribe', { query: JSON.parse(key) }).subscription;
        if (typeof current.handle?.cancel !== 'function') {
          throw snapshot.error ?? new Error('tonk-subscribe did not return a subscription handle.');
        }
        if (run !== current) { current.handle.cancel(); consumer.remove(); }
      } catch (error) {
        if (run === current) {
          stop();
          publish({ status: 'error', data: snapshot.data, error: errorFrom(error) });
        }
      }
    };
    const store = Object.freeze({
      getSnapshot: () => snapshot,
      subscribe(listener) {
        const notify = () => listener();
        listeners.add(notify);
        if (listeners.size === 1) start();
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          listeners.delete(notify);
          if (!listeners.size) { stop(); snapshot = loading; }
        };
      },
      dispose() {
        stop();
        publish({ status: 'error', data: empty, error: aborted() });
        listeners.clear();
      },
    });
    queries.set(key, store);
    return store;
  }

  return Object.freeze({
    host,
    signal: controller.signal,
    observe,
    query: (query) => request('tonk-query', 'query', query).then(rows),
    transact: (requestBody) => request('tonk-claim', 'request', requestBody),
    close,
  });
}

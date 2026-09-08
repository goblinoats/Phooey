// These helpers run in the browser. Dialog stores application data.
// Tonk template bindings supply component inputs. Events request changes to stored data.

import { createSession } from './session.js';

const types = new Set(['string', 'entity', 'number', 'boolean', 'json']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function decode(raw, type, name) {
  if (type === 'boolean') return raw !== null;
  if (raw === null) return undefined;
  if (type === 'string') return raw;
  if (type === 'entity') return /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]+$/.test(raw) ? raw : undefined;
  // A number or JSON binding can be unresolved when the component mounts.
  if (/^\{[a-zA-Z_][a-zA-Z0-9._:/-]*\}$/.test(raw)) return undefined;
  if (type === 'number') {
    if (!raw.trim()) return undefined;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  } else if (type === 'json') {
    if (!raw.trim()) return undefined;
    return freeze(JSON.parse(raw));
  }
  throw new TypeError(`Invalid ${type} input for ${name}: ${JSON.stringify(raw)}`);
}

function normalizeProps(props) {
  const used = new Set();
  return Object.entries(props ?? {}).map(([name, value]) => {
    const { type, attribute = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`) } = typeof value === 'string' ? { type: value } : value;
    if (!types.has(type)) throw new TypeError(`Unknown prop type for ${name}: ${type}`);
    if (!/^[a-z][a-z0-9-]*$/.test(attribute) || used.has(attribute)) throw new TypeError(`Invalid or duplicate prop attribute: ${attribute}`);
    used.add(attribute);
    return { name, type, attribute };
  });
}

function sameDeps(a, b) {
  return a !== undefined && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/** Register a component with template inputs and a local lifecycle. */
export function defineComponent(name, definition) {
  if (typeof HTMLElement === 'undefined') throw new Error('defineComponent runs in the browser, through Tonk’s component loader.');
  if (!name.includes('-')) throw new Error('Custom element names must contain a hyphen.');
  if (!definition || typeof definition.setup !== 'function') throw new TypeError('A component requires setup(context).');
  const schema = normalizeProps(definition.props);
  if (definition.key && !schema.some((prop) => prop.name === definition.key)) throw new TypeError('key must name a declared prop.');
  const existing = customElements.get(name);
  if (existing) return existing;

  class DialogComponent extends HTMLElement {
    static observedAttributes = schema.map((prop) => prop.attribute);
    #snapshot = Object.freeze({});
    #raw = new Map();
    #subscribers = new Set();
    #queued = false;
    #session;
    #store = Object.freeze({
      getSnapshot: () => this.#snapshot,
      subscribe: (listener) => {
        this.#subscribers.add(listener);
        return () => this.#subscribers.delete(listener);
      },
    });

    connectedCallback() { this.#schedule(); }
    attributeChangedCallback() { this.#schedule(); }
    disconnectedCallback() {
      // A synchronous DOM move must preserve the component lifecycle.
      queueMicrotask(() => { if (!this.isConnected) this.#dispose(); });
    }

    #report(error) {
      const event = new CustomEvent('tonk-builder:error', { bubbles: true, composed: true, cancelable: true, detail: { error } });
      if (this.dispatchEvent(event)) console.error(error);
    }

    #schedule = () => {
      if (this.#queued) return;
      this.#queued = true;
      queueMicrotask(() => {
        this.#queued = false;
        if (!this.isConnected) return;
        try { this.#refresh(); } catch (error) { this.#dispose(); this.#report(error); }
      });
    };

    #refresh() {
      const next = {};
      let changed = false;
      for (const { name: prop, attribute, type } of schema) {
        const raw = this.getAttribute(attribute);
        // Keep the parsed JSON object stable for React's useSyncExternalStore hook.
        next[prop] = this.#raw.has(attribute) && this.#raw.get(attribute) === raw
          ? this.#snapshot[prop] : decode(raw, type, prop);
        if (!own(this.#snapshot, prop) || !Object.is(next[prop], this.#snapshot[prop])) changed = true;
      }
      for (const { attribute } of schema) this.#raw.set(attribute, this.getAttribute(attribute));
      if (changed) this.#snapshot = Object.freeze(next);

      const key = definition.key ? this.#snapshot[definition.key] : null;
      if (this.#session && !Object.is(this.#session.key, key)) this.#dispose();
      // Wait for the entity key before the component mounts.
      if (definition.key && (key === undefined || key === null || key === '')) return;
      if (!this.#session) this.#mount(key);
      if (changed) for (const subscriber of [...this.#subscribers]) subscriber();
      this.#runEffects();
    }

    #mount(key) {
      const session = { key, active: true, effects: [], cleanups: [], controller: new AbortController() };
      this.#session = session;
      const props = Object.freeze(Object.defineProperties({}, Object.fromEntries(schema.map(({ name: prop }) => [prop, { enumerable: true, get: () => this.#snapshot[prop] }]))));
      let settingUp = true;
      const register = () => { if (!settingUp) throw new Error('Register state/effects/listeners during setup.'); };
      const context = Object.freeze({
        host: this,
        props,
        bindings: this.#store,
        session: createSession(this, { signal: session.controller.signal }),
        signal: session.controller.signal,
        state: (initial) => {
          register();
          let value = typeof initial === 'function' ? initial() : initial;
          return [() => value, (update) => {
            if (!session.active) return;
            const next = typeof update === 'function' ? update(value) : update;
            if (!Object.is(value, next)) { value = next; this.#schedule(); }
          }];
        },
        effect: (run, dependencies) => {
          register();
          if (typeof run !== 'function' || (dependencies !== undefined && typeof dependencies !== 'function')) throw new TypeError('effect takes a callback and an optional dependency getter.');
          session.effects.push({ run, dependencies });
        },
        on: (type, selector, listener) => {
          register();
          if (typeof selector === 'function') { listener = selector; selector = undefined; }
          const handler = (event) => {
            if (!session.active) return;
            const target = selector ? event.target?.closest?.(selector) : this;
            if (target && (target === this || this.contains(target))) listener(event, target);
          };
          this.addEventListener(type, handler);
          session.cleanups.push(() => this.removeEventListener(type, handler));
        },
        command: (event, detail = {}) => {
          if (!session.active) return false;
          if (!/^[a-z][a-z0-9-]*$/.test(event)) throw new TypeError('Command event names must be lowercase.');
          return this.dispatchEvent(new CustomEvent(event, { bubbles: true, composed: true, detail }));
        },
        cleanup: (callback) => { register(); session.cleanups.push(callback); },
      });
      try {
        const cleanup = definition.setup(context);
        if (cleanup !== undefined && typeof cleanup !== 'function') throw new TypeError('setup must be synchronous and may return a cleanup function.');
        if (cleanup) session.cleanups.push(cleanup);
      } catch (error) { this.#dispose(); throw error; }
      finally { settingUp = false; }
    }

    #runEffects() {
      for (const effect of this.#session?.effects ?? []) {
        const next = effect.dependencies?.();
        if (next !== undefined && !Array.isArray(next)) throw new TypeError('Effect dependency getters must return an array.');
        if (next && sameDeps(effect.previous, next)) continue;
        effect.controller?.abort();
        const cleanup = effect.cleanup;
        effect.cleanup = undefined;
        cleanup?.();
        effect.controller = new AbortController();
        effect.previous = next?.slice();
        const result = effect.run(effect.controller.signal);
        if (result !== undefined && typeof result !== 'function') throw new TypeError('Effects may return a cleanup function; start asynchronous work inside the effect.');
        effect.cleanup = result;
      }
    }

    #dispose() {
      const session = this.#session;
      if (!session) return;
      this.#session = undefined;
      session.active = false;
      session.controller.abort();
      for (const effect of session.effects) effect.controller?.abort();
      for (const cleanup of [...session.effects.map((effect) => effect.cleanup), ...session.cleanups].reverse()) {
        try { cleanup?.(); } catch (error) { this.#report(error); }
      }
    }
  }
  customElements.define(name, DialogComponent);
  return DialogComponent;
}

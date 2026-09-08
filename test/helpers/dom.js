import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'ShadowRoot', 'customElements', 'Event', 'CustomEvent', 'MutationObserver']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? browser : browser[name] });
}
export const flush = () => new Promise((resolve) => setImmediate(resolve));

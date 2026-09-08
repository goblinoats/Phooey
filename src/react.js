import { createContext, createElement, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { defineComponent } from './runtime.js';
import { idleQuery, queryKey } from './session.js';

const DialogContext = createContext(null);
const SessionContext = createContext(null);
const idleStore = { subscribe: () => () => {}, getSnapshot: () => idleQuery };

/** Supply a Tonk session to a React tree. The caller owns the session lifetime. */
export const Provider = SessionContext.Provider;

/** Read the provider session, or use an explicit session. */
export function useSession(source) {
  const provided = useContext(SessionContext);
  const session = source ?? provided;
  if (!session) throw new Error('Supply a Tonk session through Provider or defineReactComponent.');
  return session;
}

/** Read a live query. A null query stays idle until its inputs are available. */
export function useQuery(query, source) {
  const session = useSession(source);
  const key = query == null ? null : queryKey(query);
  const store = useMemo(() => key === null ? idleStore : session.observe(JSON.parse(key)), [session, key]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** Submit a transaction through the session and return its result promise. */
export function useTransaction(source) {
  return useSession(source).transact;
}

function useBindingContext() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('Use these hooks inside a component registered with defineReactComponent.');
  return context;
}

/** Read the current inputs from Tonk template bindings. Subscribe to input changes. */
export function useDialogProps() {
  const { bindings } = useBindingContext();
  return useSyncExternalStore(bindings.subscribe, bindings.getSnapshot);
}

/** Send an event to a Tonk command declared in the HTML template. */
export function useCommand(event) {
  const context = useBindingContext();
  return useCallback((detail) => context.command(event, detail), [context, event]);
}

/** Register React controls in a shadow root. Tonk controls the native child elements. */
export function defineReactComponent(name, definition) {
  const { component, styles = '', ...options } = definition;
  if (typeof component !== 'function') throw new TypeError('component must be a React component.');
  return defineComponent(name, {
    ...options,
    setup(context) {
      const shadow = context.host.shadowRoot ?? context.host.attachShadow({ mode: 'open' });
      const document = context.host.ownerDocument;
      const style = document.createElement('style');
      style.textContent = styles;
      const slot = document.createElement('slot');
      const container = document.createElement('div');
      container.setAttribute('part', 'react');
      shadow.replaceChildren(style, slot, container);
      const root = createRoot(container);
      root.render(createElement(DialogContext.Provider, { value: context },
        createElement(Provider, { value: context.session }, createElement(component))));
      return () => { root.unmount(); shadow.replaceChildren(); };
    },
  });
}

import type { Session } from './session.js';

export type PropType = 'string' | 'entity' | 'number' | 'boolean' | 'json';
export type PropDefinition = PropType | { type: PropType; attribute?: string };
export type PropSchema = Record<string, PropDefinition>;
type Value<D> = D extends { type: infer T } ? Value<T>
  : D extends 'number' ? number | undefined
  : D extends 'boolean' ? boolean
  : D extends 'json' ? unknown
  : string | undefined;
export type Props<S extends PropSchema> = { readonly [K in keyof S]: Value<S[K]> };
export interface Bindings<P> {
  getSnapshot(): Readonly<P>;
  subscribe(listener: () => void): () => void;
}
export interface ComponentContext<P> {
  readonly host: HTMLElement;
  /** These getters return the current inputs from template bindings. The inputs are read-only. */
  readonly props: Readonly<P>;
  readonly bindings: Bindings<P>;
  /** This session follows the host routing context and closes when the component unmounts. */
  readonly session: Session;
  /** The helper aborts this signal on unmount or entity key change. */
  readonly signal: AbortSignal;
  /** Create local state in memory. The helper discards it on unmount or entity key change. */
  state<T>(initial: T | (() => T)): [() => T, (update: T | ((previous: T) => T)) => void];
  /** Effects run after input or local state changes. Cleanup runs before each repeat and on unmount. */
  effect(run: (signal: AbortSignal) => void | (() => void), dependencies?: () => readonly unknown[]): void;
  on(type: string, listener: (event: Event, target: Element) => void): void;
  on(type: string, selector: string, listener: (event: Event, target: Element) => void): void;
  /** Send a command event. The return value does not confirm a change to stored data. */
  command(event: string, detail?: Record<string, unknown>): boolean;
  cleanup(callback: () => void): void;
}
export interface ComponentOptions<S extends PropSchema> {
  props: S;
  /** Wait for this input before mount. Reset the local lifecycle when the input changes. */
  key?: keyof S & string;
}
export function defineComponent<const S extends PropSchema>(
  name: string,
  definition: ComponentOptions<S> & { setup(context: ComponentContext<Props<S>>): void | (() => void) },
): CustomElementConstructor;

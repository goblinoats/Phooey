import type { ComponentType, Provider as ReactProvider } from 'react';
import type { ComponentOptions, PropSchema } from './runtime.js';
import type { JsonObject, Query, QueryResult, Session } from './session.js';

export const Provider: ReactProvider<Session | null>;
export function useSession(source?: Session): Session;
/** Subscribe to a native query. Null pauses the subscription without conditional hooks. */
export function useQuery<F extends object = JsonObject>(query: Query | null, source?: Session): QueryResult<F>;
/** Return a stable transaction function that resolves with the Tonk host result. */
export function useTransaction(source?: Session): Session['transact'];

/** Read the current inputs from html:prop={field} bindings on the host element. */
export function useDialogProps<P extends object = Record<string, unknown>>(): Readonly<P>;
/** Send a command event. The return value does not confirm a change to stored data. */
export function useCommand<D extends Record<string, unknown> = Record<string, unknown>>(event: string): (detail: D) => boolean;
export function defineReactComponent<const S extends PropSchema>(
  name: string,
  definition: ComponentOptions<S> & { component: ComponentType; styles?: string },
): CustomElementConstructor;

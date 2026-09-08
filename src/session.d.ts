export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };
export interface Query {
  readonly predicate: string | JsonObject;
  readonly terms: JsonObject;
}
export interface Conclusion<F extends object = JsonObject> {
  readonly this: string;
  readonly fields: Readonly<F>;
}
export interface QueryResult<F extends object = JsonObject> {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly data: readonly Conclusion<F>[];
  readonly error: Error | null;
}
export interface QueryStore<F extends object = JsonObject> {
  getSnapshot(): QueryResult<F>;
  subscribe(listener: () => void): () => void;
}
export interface Claim {
  readonly op: 'assert' | 'retract';
  readonly application: {
    readonly predicate: { readonly kind: 'durable' | 'transient'; readonly concept: JsonObject };
    readonly parameters: JsonObject;
    readonly name?: string;
  };
}
export interface Transaction {
  readonly claims: readonly Claim[];
}
export interface TransactionResult {
  readonly revision_before: Json;
  readonly revision_after: Json;
  readonly commits: JsonObject;
}
export interface Session {
  readonly host: Element;
  readonly signal: AbortSignal;
  /** Read a query once through the native Tonk host. */
  query<F extends object = JsonObject>(query: Query): Promise<readonly Conclusion<F>[]>;
  /** Share a live query within this session. The first subscriber opens the native subscription. */
  observe<F extends object = JsonObject>(query: Query): QueryStore<F>;
  /** Submit a transaction and return the host result. */
  transact(request: Transaction): Promise<TransactionResult>;
  /** End subscriptions and reject pending results. A submitted write can still complete in Tonk. */
  close(): void;
}
export function createSession(host: Element, options?: { signal?: AbortSignal }): Session;
export function queryKey(value: unknown): string;
export const idleQuery: QueryResult;

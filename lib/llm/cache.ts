import { createHash } from 'node:crypto';
const store: Map<string, unknown> = (globalThis as any).__llmCache ?? new Map();
(globalThis as any).__llmCache = store;
export function cacheKey(model: string, prompt: string): string {
  return createHash('sha256').update(`${model} ${prompt}`).digest('hex');
}
export function cacheGet<T>(key: string): T | undefined { return store.get(key) as T | undefined; }
export function cacheSet<T>(key: string, val: T): void { store.set(key, val); }

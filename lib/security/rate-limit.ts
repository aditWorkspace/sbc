// Single-instance LRU bucket — good enough for 10-30 consultants on Vercel
// (which can cold-start multiple instances, so this is best-effort NOT strict).
// For true distributed limiting, swap for Upstash or Supabase-backed counter.

interface Bucket { count: number; resetAt: number }
const buckets = (globalThis as unknown as { __rateBuckets?: Map<string, Bucket> }).__rateBuckets
  ?? new Map<string, Bucket>();
(globalThis as unknown as { __rateBuckets?: Map<string, Bucket> }).__rateBuckets = buckets;

export function checkRateLimit(key: string, maxPerHour: number): { allowed: boolean; resetIn: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 3_600_000 });
    return { allowed: true, resetIn: 3600 };
  }
  bucket.count++;
  if (bucket.count > maxPerHour) {
    return { allowed: false, resetIn: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, resetIn: Math.ceil((bucket.resetAt - now) / 1000) };
}

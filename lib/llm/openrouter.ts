import { type ZodType } from 'zod';
import { cacheKey, cacheGet, cacheSet } from './cache';
import { chargeTokens } from './budget';
import { env } from '@/lib/env';

const MODEL_CHAIN = [
  'google/gemini-flash-1.5-8b',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.1-8b-instruct:free',
];

interface Args<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
}

export async function openrouterJson<T>({ system, user, schema, maxTokens = 512 }: Args<T>): Promise<T | null> {
  const prompt = `SYS:${system}\n\nUSR:${user}`;
  for (const model of MODEL_CHAIN) {
    const key = cacheKey(model, prompt);
    const cached = cacheGet<T>(key);
    if (cached !== undefined) return cached;
    if (!chargeTokens(maxTokens)) return null;

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env().OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
          max_tokens: maxTokens,
          temperature: 0,
        }),
      });
    } catch { continue; }

    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) continue;

    let body: unknown;
    try { body = await res.json(); } catch { continue; }
    const content = (body as any)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') continue;
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return null; }
    const result = schema.safeParse(parsed);
    if (!result.success) return null;
    cacheSet(key, result.data);
    return result.data;
  }
  return null;
}

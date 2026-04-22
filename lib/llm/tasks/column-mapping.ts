import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  company: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function mapColumnsLlm(
  headers: string[], sampleRows: string[][]
): Promise<z.infer<typeof Schema> | null> {
  const user = `Headers: ${JSON.stringify(headers)}\nSample rows:\n${sampleRows.map(r => JSON.stringify(r)).join('\n')}\n\nReturn {"first_name":<header-or-null>,"last_name":<header-or-null>,"company":<header-or-null>,"confidence":0-1}.`;
  const res = await openrouterJson({
    system: 'You map CSV headers to fields for a sourcing tool. Return strict JSON. If unsure, return null.',
    user, schema: Schema,
  });
  if (!res || res.confidence < 0.6) return null;
  return res;
}

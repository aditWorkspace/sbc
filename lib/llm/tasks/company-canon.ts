import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  same_as: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function companyCanonLlm(newName: string, candidates: string[]): Promise<string | null> {
  if (!candidates.length) return null;
  const user = `Is "${newName}" the same company as any of these? Candidates: ${JSON.stringify(candidates)}. Return {"same_as":<matching-candidate-or-null>,"confidence":0-1}.`;
  const res = await openrouterJson({
    system: 'You decide if two company names refer to the same entity. "Google", "Google LLC", "Google Inc." are the same.',
    user, schema: Schema,
  });
  if (!res || res.confidence < 0.75) return null;
  return res.same_as;
}

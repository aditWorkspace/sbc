import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  domain: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function guessDomainLlm(companyName: string): Promise<string | null> {
  const user = `What is the work-email domain for "${companyName}"? Return {"domain":<likely-domain-or-null>,"confidence":0-1}.`;
  const res = await openrouterJson({
    system: 'You guess corporate email domains from company names. Return the root domain only, e.g. "palantir.com" not "apollo.palantir.com".',
    user, schema: Schema,
  });
  if (!res || !res.domain || res.confidence < 0.6) return null;
  return res.domain.toLowerCase();
}

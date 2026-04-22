import { env } from '@/lib/env';

export class ApolloCreditsExhausted extends Error { constructor() { super('Apollo credits exhausted'); } }
export class ApolloRateLimit extends Error { constructor() { super('Apollo rate limit'); } }
export class ApolloError extends Error {}

export interface BulkMatchDetail {
  first_name: string;
  last_name?: string | null;
  organization_name: string;
  domain?: string;
}

export interface BulkMatchPerson {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  email_status?: 'verified' | 'guessed' | 'unavailable' | 'bounced' | string;
  organization?: { name?: string; website_url?: string };
}

export interface BulkMatchResponse {
  matches: (BulkMatchPerson | null)[];
  missing_records?: number;
}

export async function apolloBulkMatch(details: BulkMatchDetail[]): Promise<BulkMatchResponse> {
  if (details.length === 0) return { matches: [] };
  if (details.length > 10) throw new Error('apolloBulkMatch: max 10 details per call');
  const res = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': env().APOLLO_API_KEY,
    },
    body: JSON.stringify({ details, reveal_personal_emails: false }),
  });
  if (res.status === 402) throw new ApolloCreditsExhausted();
  if (res.status === 429) throw new ApolloRateLimit();
  if (!res.ok) throw new ApolloError(`Apollo ${res.status}: ${await res.text()}`);
  return res.json() as Promise<BulkMatchResponse>;
}

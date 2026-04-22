import { env } from '@/lib/env';

export class IcypeasCreditsExhausted extends Error { constructor() { super('Icypeas credits exhausted'); } }
export class IcypeasRateLimit extends Error { constructor() { super('Icypeas rate limit'); } }
export class IcypeasError extends Error {}

export interface BulkMatchDetail {
  first_name: string;
  last_name?: string | null;
  organization_name: string;
}

export interface BulkMatchPerson {
  email?: string | null;
  email_status?: 'verified' | 'guessed' | string;
  organization?: { name?: string };
  first_name?: string;
  last_name?: string;
}

export interface BulkMatchResponse {
  matches: (BulkMatchPerson | null)[];
}

const BASE = 'https://app.icypeas.com/api';
const POLL_INTERVAL_MS = 2000;
const TOTAL_TIMEOUT_MS = 35_000;

function certaintyToStatus(c: string | undefined): 'verified' | 'guessed' {
  return ['ultra_sure', 'very_sure', 'sure'].includes(c ?? '') ? 'verified' : 'guessed';
}

async function submitSingle(detail: BulkMatchDetail): Promise<string | null> {
  const res = await fetch(`${BASE}/email-search`, {
    method: 'POST',
    headers: {
      'Authorization': env().ICYPEAS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      firstname: detail.first_name,
      lastname: detail.last_name ?? '',
      domainOrCompany: detail.organization_name,
    }),
  });
  if (res.status === 402) throw new IcypeasCreditsExhausted();
  if (res.status === 429) throw new IcypeasRateLimit();
  if (!res.ok) throw new IcypeasError(`Icypeas submit ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { success?: boolean; item?: { _id?: string } };
  return body?.item?._id ?? null;
}

async function readItem(id: string): Promise<{ item?: { status?: string; emails?: { email?: string; certainty?: string }[]; firstname?: string; lastname?: string; company_name?: string; domain?: string } }> {
  const res = await fetch(`${BASE}/bulk-single-searchs/read`, {
    method: 'POST',
    headers: {
      'Authorization': env().ICYPEAS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });
  if (res.status === 402) throw new IcypeasCreditsExhausted();
  if (res.status === 429) throw new IcypeasRateLimit();
  if (!res.ok) throw new IcypeasError(`Icypeas read ${res.status}: ${await res.text()}`);
  return res.json();
}

function personFromItem(item: { emails?: { email?: string; certainty?: string }[]; firstname?: string; lastname?: string; company_name?: string; domain?: string } | undefined): BulkMatchPerson | null {
  if (!item) return null;
  const primary = item.emails?.[0];
  if (!primary?.email) return null;
  return {
    email: primary.email,
    email_status: certaintyToStatus(primary.certainty),
    organization: { name: item.company_name ?? item.domain },
    first_name: item.firstname,
    last_name: item.lastname,
  };
}

const NON_TERMINAL_STATUSES = new Set(['NONE', 'SCHEDULED', 'IN_PROGRESS', '']);

export async function icypeasBulkMatch(details: BulkMatchDetail[]): Promise<BulkMatchResponse> {
  if (details.length === 0) return { matches: [] };
  if (details.length > 10) throw new Error('icypeasBulkMatch: max 10 details per call');

  // Submit all in parallel
  const ids: (string | null)[] = await Promise.all(details.map(async d => {
    try { return await submitSingle(d); }
    catch (e) {
      if (e instanceof IcypeasRateLimit || e instanceof IcypeasCreditsExhausted) throw e;
      return null;
    }
  }));

  const results: (BulkMatchPerson | null)[] = ids.map(() => null);
  const pending = new Set<number>();
  ids.forEach((id, i) => { if (id) pending.add(i); });

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    await Promise.all([...pending].map(async (i) => {
      try {
        const body = await readItem(ids[i]!);
        const status = body.item?.status;
        if (status && !NON_TERMINAL_STATUSES.has(status)) {
          results[i] = personFromItem(body.item);
          pending.delete(i);
        }
      } catch (e) {
        if (e instanceof IcypeasRateLimit || e instanceof IcypeasCreditsExhausted) throw e;
        pending.delete(i);  // any other error = give up on this one
      }
    }));
  }

  return { matches: results };
}

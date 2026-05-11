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

// Tristate per index:
//   BulkMatchPerson  — Icypeas returned a verified/guessed email
//   null             — Icypeas reached a terminal status with no email (definite no-match — delete per policy)
//   undefined        — transient: poll deadline hit, network blip, or non-fatal IcypeasError (caller should keep contact pending and retry next tick)
export type BulkMatchResult = BulkMatchPerson | null | undefined;

export interface BulkMatchResponse {
  matches: BulkMatchResult[];
}

const BASE = 'https://app.icypeas.com/api';
const POLL_INTERVAL_MS = 1500;
// On Vercel functions, polls take ~2x as long to terminal status as on a local
// laptop (observed: 35s laptop ≈ 70s Vercel for the same 10-contact batch).
// We have 300s of function budget via maxDuration, so be generous.
const TOTAL_TIMEOUT_MS = 90_000;

function certaintyToStatus(c: string | undefined): 'verified' | 'guessed' {
  return ['ultra_sure', 'very_sure', 'sure'].includes(c ?? '') ? 'verified' : 'guessed';
}

async function submitSingle(detail: BulkMatchDetail): Promise<string> {
  const res = await fetch(`${BASE}/email-search`, {
    method: 'POST',
    cache: 'no-store',
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
  const id = body?.item?._id;
  if (!id) throw new IcypeasError(`Icypeas submit returned no id: ${JSON.stringify(body)}`);
  return id;
}

// Actual Icypeas response shape (verified empirically 2026-04-22):
//   { success: true, items: [ { _id, status: 'FOUND'|'NOT_FOUND'|'FAILED'|...,
//                               results: { firstname, lastname, emails: [{email, certainty}] } } ] }
// The docs' `item.emails` shape was wrong; real data has `items[0].results.emails`.
interface IcypeasResultItem {
  _id?: string;
  status?: string;
  results?: {
    firstname?: string;
    lastname?: string;
    fullname?: string;
    emails?: { email?: string; certainty?: string }[];
    company_name?: string;
    domain?: string;
  };
}
interface IcypeasReadResponse {
  success?: boolean;
  items?: IcypeasResultItem[];
  // legacy/alternate shape (some endpoints return item singular)
  item?: IcypeasResultItem;
}

async function readItem(id: string): Promise<IcypeasResultItem | null> {
  const res = await fetch(`${BASE}/bulk-single-searchs/read`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Authorization': env().ICYPEAS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });
  if (res.status === 402) throw new IcypeasCreditsExhausted();
  if (res.status === 429) throw new IcypeasRateLimit();
  if (!res.ok) throw new IcypeasError(`Icypeas read ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as IcypeasReadResponse;
  // Prefer `items[0]` (current API), fall back to singular `item`
  return body.items?.[0] ?? body.item ?? null;
}

function personFromItem(item: IcypeasResultItem | null): BulkMatchPerson | null {
  if (!item) return null;
  const r = item.results;
  const primary = r?.emails?.[0];
  if (!primary?.email) return null;
  // The real Icypeas response (verified empirically 2026-05-10) does not carry
  // a company_name OR domain inside `results` — only firstname/lastname/emails/
  // phones/saasServices. The previous `r?.company_name ?? r?.domain` was a typo
  // bait: when a hypothetical domain ever did sneak in, it ended up being treated
  // as a company name by downstream callers and the contact got dropped. We just
  // leave organization undefined.
  return {
    email: primary.email,
    email_status: certaintyToStatus(primary.certainty),
    organization: { name: r?.company_name },
    first_name: r?.firstname,
    last_name: r?.lastname,
  };
}

const NON_TERMINAL_STATUSES = new Set(['NONE', 'SCHEDULED', 'IN_PROGRESS', '']);

export async function icypeasBulkMatch(details: BulkMatchDetail[]): Promise<BulkMatchResponse> {
  if (details.length === 0) return { matches: [] };
  if (details.length > 10) throw new Error('icypeasBulkMatch: max 10 details per call');

  // Submit all in parallel. A submit failure is transient — undefined for that index.
  const ids: (string | undefined)[] = await Promise.all(details.map(async d => {
    try { return await submitSingle(d); }
    catch (e) {
      if (e instanceof IcypeasRateLimit || e instanceof IcypeasCreditsExhausted) throw e;
      // Submit-time IcypeasError or network blip — transient, retry next tick
      return undefined;
    }
  }));

  // Default every slot to undefined (= transient / unknown). Only flip to a definite
  // value (BulkMatchPerson or null) once we get a terminal status from Icypeas.
  const results: BulkMatchResult[] = ids.map(() => undefined);
  const pending = new Set<number>();
  ids.forEach((id, i) => { if (id) pending.add(i); });

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    await Promise.all([...pending].map(async (i) => {
      try {
        const item = await readItem(ids[i]!);
        const status = item?.status;
        if (status && !NON_TERMINAL_STATUSES.has(status)) {
          // Terminal: either we have an email (BulkMatchPerson) or definite no-match (null).
          results[i] = personFromItem(item);
          pending.delete(i);
        }
      } catch (e) {
        if (e instanceof IcypeasRateLimit || e instanceof IcypeasCreditsExhausted) throw e;
        // Read-time error — leave as undefined (transient). Drop from poll set so we
        // don't burn the whole deadline retrying a failing item; it'll get re-attempted
        // next tick when the contact is still pending.
        pending.delete(i);
      }
    }));
  }
  // Anything still in `pending` at deadline stays undefined — caller treats as transient.

  return { matches: results };
}

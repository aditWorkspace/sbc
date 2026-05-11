import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://t.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'p';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
process.env.ICYPEAS_API_KEY = 'ic';
process.env.ICYPEAS_SECRET_API_KEY = 'sk';
process.env.ICYPEAS_USER_ID = 'u';
process.env.OPENROUTER_API_KEY = 'o';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'cs';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3010/oauth/callback';
process.env.CRON_SECRET = 'x'.repeat(32);

vi.mock('@/lib/icypeas/client', () => ({
  IcypeasCreditsExhausted: class extends Error {},
  IcypeasRateLimit: class extends Error {},
  icypeasBulkMatch: vi.fn(),
}));

import { processEnrichmentJob } from '@/lib/enrichment/process-job';
import { icypeasBulkMatch } from '@/lib/icypeas/client';

// Lightweight Supabase chain mock that records every operation the code calls.
function makeSupa(state: {
  company: any;
  contacts: any[];
  samples?: any[];
}) {
  const ops: { table: string; op: string; payload?: any; ids?: any[] }[] = [];

  const builder = (table: string) => {
    const filters: Record<string, any> = {};
    let selectOpts: any = null;
    let insertPayload: any = null;
    let updatePayload: any = null;
    let isDelete = false;
    let limitN: number | null = null;
    let inField: string | null = null;
    let inValues: any[] | null = null;

    const chain: any = {
      select: (cols?: string, opts?: any) => { selectOpts = { cols, opts }; return chain; },
      eq: (k: string, v: any) => { filters[k] = v; return chain; },
      in: (k: string, vs: any[]) => { inField = k; inValues = vs; return chain; },
      limit: (n: number) => { limitN = n; return chain; },
      order: () => chain,
      single: async () => {
        if (table === 'companies') return { data: state.company };
        return { data: null };
      },
      insert: (payload: any) => { insertPayload = payload; ops.push({ table, op: 'insert', payload }); return chain; },
      update: (payload: any) => { updatePayload = payload; return chain; },
      delete: () => { isDelete = true; return chain; },
      then: (resolve: any) => {
        // Terminal — execute the recorded op
        if (isDelete) {
          if (inField === 'id' && inValues) {
            ops.push({ table, op: 'delete-in', ids: inValues });
            state.contacts = state.contacts.filter(c => !inValues!.includes(c.id));
          } else if (filters.id) {
            ops.push({ table, op: 'delete', ids: [filters.id] });
            state.contacts = state.contacts.filter(c => c.id !== filters.id);
          }
          return Promise.resolve({ data: null }).then(resolve);
        }
        if (updatePayload) {
          ops.push({ table, op: 'update', ids: filters.id ? [filters.id] : undefined, payload: updatePayload });
          return Promise.resolve({ data: null }).then(resolve);
        }
        // Read path
        if (selectOpts?.opts?.head && selectOpts.opts.count === 'exact') {
          // count query
          const matches = state.contacts.filter(c =>
            Object.entries(filters).every(([k, v]) => (c as any)[k] === v),
          );
          return Promise.resolve({ count: matches.length }).then(resolve);
        }
        if (table === 'companies') {
          return Promise.resolve({ data: state.company }).then(resolve);
        }
        if (table === 'contacts') {
          let rows = state.contacts.filter(c =>
            Object.entries(filters).every(([k, v]) => (c as any)[k] === v),
          );
          if (limitN != null) rows = rows.slice(0, limitN);
          return Promise.resolve({ data: rows }).then(resolve);
        }
        if (table === 'apollo_samples') {
          return Promise.resolve({ data: state.samples ?? [] }).then(resolve);
        }
        if (table === 'enrichment_jobs') {
          return Promise.resolve({ data: null }).then(resolve);
        }
        return Promise.resolve({ data: null }).then(resolve);
      },
    };
    return chain;
  };

  return {
    ops,
    supa: { from: (t: string) => builder(t) } as any,
  };
}

const baseCompany = {
  id: 'co1',
  name_normalized: 'acme',
  template_confidence: null,
  template_pattern: null,
  domain: null,
  apollo_credits_spent: 0,
  sample_size: 0,
  matching_samples: 0,
};

const mkContact = (id: string, fn: string, ln: string, co = 'Acme') => ({
  id, first_name: fn, last_name: ln, company_id: 'co1',
  company_display: co, enrichment_status: 'pending',
});

beforeEach(() => {
  vi.mocked(icypeasBulkMatch).mockReset();
});

describe('processEnrichmentJob — tristate handling', () => {
  it('undefined match leaves contact pending (no delete, no update)', async () => {
    const { supa, ops } = makeSupa({
      company: baseCompany,
      contacts: [mkContact('c1', 'A', 'A')],
    });
    vi.mocked(icypeasBulkMatch).mockResolvedValue({ matches: [undefined] } as any);

    await processEnrichmentJob(supa, 'co1');

    const contactWrites = ops.filter(o => o.table === 'contacts' && (o.op === 'delete' || o.op === 'update'));
    expect(contactWrites).toHaveLength(0);
  });

  it('null match deletes contact AND records a not_found apollo_samples row', async () => {
    const { supa, ops } = makeSupa({
      company: baseCompany,
      contacts: [mkContact('c1', 'A', 'A')],
    });
    vi.mocked(icypeasBulkMatch).mockResolvedValue({ matches: [null] } as any);

    await processEnrichmentJob(supa, 'co1');

    const deletes = ops.filter(o => o.table === 'contacts' && o.op === 'delete');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.ids).toEqual(['c1']);
    // The audit row is the whole point of the fix — without it, NOT_FOUND deletes
    // are invisible and the consultant has no way to tell that 252 contacts
    // disappeared because Icypeas couldn't find them.
    const sampleInserts = ops.filter(o => o.table === 'apollo_samples' && o.op === 'insert');
    expect(sampleInserts).toHaveLength(1);
    expect(sampleInserts[0]?.payload).toMatchObject({
      company_id: 'co1',
      person_first_name: 'A',
      person_last_name: 'A',
      email_returned: null,
      email_ignored_reason: 'no_email_found',
    });
  });

  it('mixed batch: undefined kept, null deleted, found enriched', async () => {
    const { supa, ops } = makeSupa({
      company: baseCompany,
      contacts: [
        mkContact('c1', 'Sundar', 'Pichai'),
        mkContact('c2', 'Tim', 'Cook'),
        mkContact('c3', 'Slow', 'One'),
      ],
    });
    vi.mocked(icypeasBulkMatch).mockResolvedValue({
      matches: [
        { email: 'sundar@acme.com', email_status: 'verified', organization: { name: 'Acme' } },
        null,
        undefined,
      ],
    } as any);

    await processEnrichmentJob(supa, 'co1');

    const deletes = ops.filter(o => o.table === 'contacts' && o.op === 'delete').flatMap(o => o.ids ?? []);
    expect(deletes).toContain('c2');           // null → deleted
    expect(deletes).not.toContain('c3');       // undefined → kept pending
    const updates = ops.filter(o => o.table === 'contacts' && o.op === 'update').flatMap(o => o.ids ?? []);
    expect(updates).toContain('c1');           // found → updated to enriched
  });

  it('non-rate-limit, non-credit Icypeas throw does not delete contacts (rethrows)', async () => {
    const { supa, ops } = makeSupa({
      company: baseCompany,
      contacts: [mkContact('c1', 'A', 'A'), mkContact('c2', 'B', 'B')],
    });
    vi.mocked(icypeasBulkMatch).mockRejectedValue(new Error('icypeas exploded'));

    await expect(processEnrichmentJob(supa, 'co1')).rejects.toThrow(/exploded/);
    const deletes = ops.filter(o => o.table === 'contacts' && (o.op === 'delete' || o.op === 'delete-in'));
    expect(deletes).toHaveLength(0);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { validateRow, type RawRow } from './validate-row';
import { findOrCreateCompany } from '@/lib/companies/canon';
import { buildNormalizedKey, normalize } from '@/lib/csv/normalize';
import { renderTemplate, type Pattern } from '@/lib/apollo/patterns';

export interface IngestResult {
  uploadId: string;
  raw: number; deduped: number; alreadyInPool: number; archived: number; previouslyAttempted: number;
  rejected: number; admitted: number;
  enrichedInstantly: number; pending: number;
}

export async function ingestUpload(
  supa: SupabaseClient,
  consultantId: string,
  filename: string | null,
  rows: RawRow[]
): Promise<IngestResult> {
  const { data: upload, error: upErr } = await supa
    .from('uploads')
    .insert({ consultant_id: consultantId, filename, row_count_raw: rows.length })
    .select('id')
    .single();
  if (upErr || !upload) throw upErr;
  const uploadId = upload.id;

  // Stage A: intra-file dedup + row validation
  const seen = new Set<string>();
  const valid: (ReturnType<typeof validateRow> & { normalized_key: string })[] = [];
  let rejected = 0;
  for (const r of rows) {
    const v = validateRow(r);
    if (!v) { rejected++; continue; }
    const key = buildNormalizedKey(v.first_name_normalized, v.last_name_normalized, v.company_normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ ...v, normalized_key: key });
  }
  const deduped = valid.length;

  // Stage B: archive dedup (people the club has already emailed)
  let archivedKeys = new Set<string>();
  if (valid.length) {
    const { data: archived } = await supa
      .from('dedup_archive').select('normalized_key')
      .in('normalized_key', valid.map(v => v.normalized_key));
    archivedKeys = new Set((archived ?? []).map(r => r.normalized_key));
  }
  const afterArchive = valid.filter(v => !archivedKeys.has(v.normalized_key));
  const archivedCount = valid.length - afterArchive.length;

  // Stage C: pool dedup (already in active pool)
  let poolKeys = new Set<string>();
  if (afterArchive.length) {
    const { data: inPool } = await supa
      .from('contacts').select('normalized_key')
      .in('normalized_key', afterArchive.map(v => v.normalized_key));
    poolKeys = new Set((inPool ?? []).map(r => r.normalized_key));
  }
  const afterPool = afterArchive.filter(v => !poolKeys.has(v.normalized_key));
  const alreadyInPool = afterArchive.length - afterPool.length;

  // Company canonicalization (need company_id before Stage D, which checks apollo_samples per company)
  const companyMap = new Map<string, string>();
  for (const v of afterPool) {
    if (!companyMap.has(v!.company_normalized)) {
      const id = await findOrCreateCompany(supa, v!.company_display, v!.company_normalized);
      companyMap.set(v!.company_normalized, id);
    }
  }

  // Stage D: apollo_samples dedup — if we already called Icypeas on this exact
  // (normalized first, normalized last, company_id) tuple (whether it succeeded,
  // failed, was ignored as guessed/personal_domain, etc.), skip — we already spent
  // the credit. This prevents re-burning credits when the same CSV is re-uploaded
  // or when a name was previously deleted due to low certainty.
  const perCompanyKeys = new Map<string, Set<string>>();
  for (const v of afterPool) {
    const cid = companyMap.get(v!.company_normalized)!;
    if (!perCompanyKeys.has(cid)) perCompanyKeys.set(cid, new Set());
    perCompanyKeys.get(cid)!.add(`${v!.first_name_normalized}|${v!.last_name_normalized}`);
  }
  const attemptedKeys = new Set<string>();  // `${company_id}|${fn_norm}|${ln_norm}`
  for (const [cid, nameKeys] of perCompanyKeys) {
    const { data: attempts } = await supa
      .from('apollo_samples')
      .select('person_first_name, person_last_name')
      .eq('company_id', cid);
    for (const a of (attempts ?? [])) {
      const fn = normalize((a as { person_first_name: string | null }).person_first_name ?? '');
      const ln = normalize((a as { person_last_name: string | null }).person_last_name ?? '');
      if (nameKeys.has(`${fn}|${ln}`)) {
        attemptedKeys.add(`${cid}|${fn}|${ln}`);
      }
    }
  }
  const admitted = afterPool.filter(v => {
    const cid = companyMap.get(v!.company_normalized)!;
    return !attemptedKeys.has(`${cid}|${v!.first_name_normalized}|${v!.last_name_normalized}`);
  });
  const previouslyAttempted = afterPool.length - admitted.length;

  // Pre-fetch templates for all companies touched by this upload
  const companyIds = [...new Set(companyMap.values())];
  let templateMap = new Map<string, { template_confidence: string; template_pattern: string | null; domain: string | null }>();
  if (companyIds.length) {
    const { data: companiesData } = await supa
      .from('companies').select('id, template_confidence, template_pattern, domain').in('id', companyIds);
    templateMap = new Map((companiesData ?? []).map(c => [c.id as string, c]));
  }

  // Build contact rows
  let enrichedInstantly = 0, pending = 0;
  const contactRows = admitted.map(v => {
    const companyId = companyMap.get(v!.company_normalized)!;
    const co = templateMap.get(companyId);
    let email: string | null = null;
    let source: 'template' | null = null;
    let status: 'pending' | 'enriched' = 'pending';
    if (co && ['HIGH','MEDIUM','LOW'].includes(co.template_confidence) && co.template_pattern && co.domain) {
      const rendered = renderTemplate(v!.first_name, v!.last_name, co.template_pattern as Pattern, co.domain);
      if (rendered) {
        email = rendered; source = 'template'; status = 'enriched'; enrichedInstantly++;
      } else {
        pending++;
      }
    } else {
      pending++;
    }
    return {
      first_name: v!.first_name,
      last_name: v!.last_name,
      first_name_normalized: v!.first_name_normalized,
      last_name_normalized: v!.last_name_normalized,
      company_id: companyId,
      company_display: v!.company_display,
      normalized_key: v!.normalized_key,
      email,
      email_source: source,
      enrichment_status: status,
      enriched_at: status === 'enriched' ? new Date().toISOString() : null,
      uploaded_by: consultantId,
      upload_id: uploadId,
    };
  });

  if (contactRows.length) {
    const { error } = await supa.from('contacts').insert(contactRows);
    if (error) throw error;
  }

  // Enqueue one enrichment_job per company with pending contacts; partial unique index
  // prevents stampede. We attempt insert per company and silently swallow conflicts.
  const pendingCompanyIds = [...new Set(
    contactRows.filter(r => r.enrichment_status === 'pending').map(r => r.company_id)
  )];
  for (const cid of pendingCompanyIds) {
    // Note: ON CONFLICT DO NOTHING via upsert won't help here because the unique index is
    // partial (status in 'queued','running'). We just swallow error at the JS level.
    await supa.from('enrichment_jobs').insert({ company_id: cid }).then(() => {}, () => {});
  }

  await supa.from('uploads').update({
    row_count_deduped: deduped,
    row_count_archived: archivedCount,
    row_count_already_in_pool: alreadyInPool,
    row_count_previously_attempted: previouslyAttempted,
    row_count_rejected: rejected,
    row_count_admitted: admitted.length,
    status: 'complete',
    completed_at: new Date().toISOString(),
  }).eq('id', uploadId);

  return {
    uploadId,
    raw: rows.length,
    deduped,
    alreadyInPool,
    archived: archivedCount,
    previouslyAttempted,
    rejected,
    admitted: admitted.length,
    enrichedInstantly,
    pending,
  };
}

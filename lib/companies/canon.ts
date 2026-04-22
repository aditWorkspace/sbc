import type { SupabaseClient } from '@supabase/supabase-js';
import { companyCanonLlm } from '@/lib/llm/tasks/company-canon';

const LEGAL_SUFFIXES = ['inc','llc','corp','corporation','co','ltd','group','holdings','technologies','tech'];

function stripSuffix(normalized: string): string {
  for (const s of LEGAL_SUFFIXES) {
    if (normalized.endsWith(s)) return normalized.slice(0, -s.length);
  }
  return normalized;
}

export async function findOrCreateCompany(
  supa: SupabaseClient, displayName: string, normalized: string
): Promise<string> {
  const { data: exact } = await supa
    .from('companies').select('id').eq('name_normalized', normalized).maybeSingle();
  if (exact?.id) return exact.id;

  const base = stripSuffix(normalized);
  const candidateNormalized = [base, `${base}inc`, `${base}llc`, `${base}corp`].filter(s => s !== normalized);
  let candidates: { id: string; name_normalized: string; display_name: string }[] = [];
  if (candidateNormalized.length) {
    const { data } = await supa
      .from('companies')
      .select('id, name_normalized, display_name')
      .in('name_normalized', candidateNormalized);
    candidates = data ?? [];
  }
  if (candidates.length) {
    const canonical = await companyCanonLlm(displayName, candidates.map(c => c.display_name));
    if (canonical) {
      const hit = candidates.find(c => c.display_name === canonical);
      if (hit) return hit.id;
    }
  }

  const { data: inserted, error } = await supa
    .from('companies')
    .insert({ name_normalized: normalized, display_name: displayName })
    .select('id')
    .single();
  if (!error && inserted) return inserted.id;

  // Lost race — read back
  const { data: after } = await supa
    .from('companies').select('id').eq('name_normalized', normalized).single();
  if (!after) throw error ?? new Error('findOrCreateCompany: race + read-back both failed');
  return after.id;
}

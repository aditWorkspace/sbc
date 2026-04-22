import type { SupabaseClient } from '@supabase/supabase-js';

export async function audit(
  supa: SupabaseClient,
  actorId: string,
  action: string,
  target?: { type?: string; id?: string; metadata?: Record<string, unknown> }
) {
  await supa.from('audit_log').insert({
    actor_consultant_id: actorId,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    metadata: target?.metadata ?? null,
  }).then(() => {}, () => {});  // Never fail the caller because of audit failure
}

import { supabaseServer } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type Consultant = Database['public']['Tables']['consultants']['Row'];

export async function currentConsultant(): Promise<Consultant | null> {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('consultants')
    .select('*')
    .eq('auth_user_id', user.id)
    .is('deactivated_at', null)
    .maybeSingle();
  return data;
}

export type AuthOutcome<T = { consultant: Consultant }> =
  | (T & { error?: never })
  | { error: 'unauthenticated' | 'pending_approval' | 'forbidden' };

export async function requireApprovedConsultant(): Promise<AuthOutcome> {
  const c = await currentConsultant();
  if (!c) return { error: 'unauthenticated' };
  if (!c.is_approved) return { error: 'pending_approval' };
  return { consultant: c };
}

export async function requireAdmin(): Promise<AuthOutcome> {
  const r = await requireApprovedConsultant();
  if ('error' in r) return r;
  if (!r.consultant.is_admin) return { error: 'forbidden' };
  return { consultant: r.consultant };
}

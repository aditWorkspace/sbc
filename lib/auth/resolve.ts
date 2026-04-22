import type { User } from '@supabase/supabase-js';
import { supabaseService } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/types';

type Consultant = Database['public']['Tables']['consultants']['Row'];

export async function resolveConsultantForSession(user: User): Promise<Consultant | null> {
  const email = user.email;
  if (!email) return null;
  const displayName = (user.user_metadata?.full_name as string | undefined) ?? email;
  const { data, error } = await supabaseService().rpc('resolve_consultant', {
    p_auth_user_id: user.id,
    p_email: email,
    p_display_name: displayName,
  });
  if (error) return null;
  return data as unknown as Consultant | null;
}

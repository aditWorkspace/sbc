import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { resolveConsultantForSession } from '@/lib/auth/resolve';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await resolveConsultantForSession(data.user);
    }
  }
  return NextResponse.redirect(new URL('/', url));
}

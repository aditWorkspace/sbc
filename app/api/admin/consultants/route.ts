import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

const Body = z.object({ email: z.string().email().regex(/@berkeley\.edu$/i) });

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  const supa = supabaseService();
  const { error } = await supa.from('consultants').insert({
    email: parsed.data.email, is_approved: true,
    approved_at: new Date().toISOString(), approved_by: auth.consultant.id,
  });
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}

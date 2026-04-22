import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

const Body = z.object({ make_admin: z.boolean().optional(), role: z.enum(['owner', 'admin', 'consultant', 'jr_consultant']).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireOwner();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const supa = supabaseService();

  // If role is being changed, apply business rules
  if (parsed.data.role !== undefined) {
    const newRole = parsed.data.role;
    const targetId = params.id;
    const viewerId = auth.consultant.id;

    // Cannot change own role
    if (targetId === viewerId) {
      return NextResponse.json({ error: 'cannot_change_own_role' }, { status: 403 });
    }

    // Cannot demote another owner
    const { data: target } = await supa.from('consultants').select('role').eq('id', targetId).single();
    if (target?.role === 'owner' && newRole !== 'owner') {
      return NextResponse.json({ error: 'cannot_demote_owner' }, { status: 403 });
    }

    const isAdmin = newRole === 'admin' || newRole === 'owner';
    await supa.from('consultants').update({ role: newRole, is_admin: isAdmin }).eq('id', targetId);
  } else if (parsed.data.make_admin !== undefined) {
    await supa.from('consultants').update({ is_admin: parsed.data.make_admin }).eq('id', params.id);
  }

  return NextResponse.json({ ok: true });
}

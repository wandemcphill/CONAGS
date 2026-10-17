import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data, error } = await db()
    .from('laurem_staff_notifications')
    .select('id,category,title,body,action_url,read_at,created_at')
    .eq('staff_id', session.staff_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: 'Unable to load notifications.' }, { status: 500 });

  return NextResponse.json({
    notifications: data || [],
    unreadCount: (data || []).filter((item: any) => !item.read_at).length,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as { id?: string; all?: boolean } | null;
  const client = db();
  const now = new Date().toISOString();

  if (body?.all) {
    const { error } = await client
      .from('laurem_staff_notifications')
      .update({ read_at: now })
      .eq('staff_id', session.staff_id)
      .is('read_at', null);
    if (error) return NextResponse.json({ error: 'Unable to mark notifications as read.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const { error } = await client
    .from('laurem_staff_notifications')
    .update({ read_at: now })
    .eq('id', id)
    .eq('staff_id', session.staff_id);

  if (error) return NextResponse.json({ error: 'Unable to mark notification as read.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

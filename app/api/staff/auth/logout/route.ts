import { NextRequest, NextResponse } from 'next/server';
import { clearStaffSession, getStaffSession } from '@/lib/laurem-staff-auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (session) {
    const client = db();
    await client.from('laurem_staff_portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', session.token_hash).eq('staff_id', session.staff_id).is('revoked_at', null);
    await client.from('laurem_staff_security_events').insert({ staff_id: session.staff_id, event_type: 'staff.logout', actor: session.email, ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, user_agent: req.headers.get('user-agent'), details: {} });
  }
  const response = NextResponse.json({ ok: true });
  clearStaffSession(response);
  return response;
}

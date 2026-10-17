import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';

function latestByStaff(rows: any[]) {
  const latest = new Map<string, any>();
  for (const row of rows) if (!latest.has(row.staff_id)) latest.set(row.staff_id, row);
  return [...latest.values()];
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const staffId = params.get('staffId');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

  let query = db().from('staff_availability')
    .select('id,staff_id,effective_from,full_time,part_time,days,nights,weekends,notes,created_at')
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(staffId ? 50 : 1000);
  if (staffId) query = query.eq('staff_id', staffId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load staff availability.' }, { status: 500 });

  return NextResponse.json({ availability: latestByStaff(data || []) });
}
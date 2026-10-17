import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data, error } = await db().from('laurem_payroll_entries')
    .select('id,payroll_period_id,approved_hours,hourly_rate,gross_amount,status,notes,created_at,updated_at,laurem_payroll_periods(period_start,period_end,pay_date,status)')
    .eq('staff_id', session.staff_id)
    .order('created_at', { ascending: false })
    .limit(24);
  if (error) return NextResponse.json({ error: 'Unable to load payroll information.' }, { status: 500 });

  return NextResponse.json({ entries: data || [] });
}

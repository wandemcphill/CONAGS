import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';

function validDate(value: string | null) {
  return Boolean(value && /^\\d{4}-\\d{2}-\\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const applicationId = params.get('applicationId');
  const staffId = params.get('staffId');
  const area = params.get('area');
  const action = params.get('action');
  const from = validDate(params.get('from')) ? params.get('from')! : null;
  const to = validDate(params.get('to')) ? params.get('to')! : null;
  const requestedLimit = Number(params.get('limit') || 200);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 200;

  try {
    let query = db().from('laurem_audit_events')
      .select('id,lifecycle_area,entity_type,entity_id,application_id,staff_id,actor_type,actor,action,previous_state,new_state,reason,metadata,occurred_at,source_table')
      .or('source_table.is.null,source_table.ilike.laurem_%')
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (applicationId) query = query.eq('application_id', applicationId);
    if (staffId) query = query.eq('staff_id', staffId);
    if (area && ['recruitment', 'evidence', 'contract', 'onboarding', 'workforce', 'payroll'].includes(area)) query = query.eq('lifecycle_area', area);
    if (action) query = query.ilike('action', '%' + action.slice(0, 80) + '%');
    if (from) query = query.gte('occurred_at', from + 'T00:00:00.000Z');
    if (to) query = query.lte('occurred_at', to + 'T23:59:59.999Z');

    const { data, error } = await query;
    if (error) throw error;

    const events = data || [];
    const staffIds = [...new Set(events.map((event: any) => event.staff_id).filter(Boolean))];
    const applicationIds = [...new Set(events.map((event: any) => event.application_id).filter(Boolean))];

    const [{ data: staff }, { data: applications }] = await Promise.all([
      staffIds.length ? db().from('staff_profiles').select('id,full_name,employee_number,job_title').in('id', staffIds) : Promise.resolve({ data: [] as any[] }),
      applicationIds.length ? db().from('recruitment_applications').select('id,full_name,role_applied,status').in('id', applicationIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const staffById = new Map((staff || []).map((row: any) => [row.id, row]));
    const applicationById = new Map((applications || []).map((row: any) => [row.id, row]));

    return NextResponse.json({
      events: events.map((event: any) => ({
        ...event,
        staff: event.staff_id ? staffById.get(event.staff_id) || null : null,
        application: event.application_id ? applicationById.get(event.application_id) || null : null,
      })),
      filters: { applicationId, staffId, area, action, from, to, limit },
      generatedAt: new Date().toISOString(),
      actor: session.email,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.audit.load_failed',
      actor: session.email,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to load audit history.' }, { status: 500 });
  }
}
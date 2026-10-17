import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { PAYROLL_PERIOD_TRANSITIONS, transitionAllowed } from '@/lib/laurem-workforce-policy';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';

const statuses = new Set(['open','processing','closed']);

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const periodsQuery = await db().from('payroll_periods')
    .select('id,period_start,period_end,pay_date,status,notes,created_by,created_at,updated_at')
    .order('period_start',{ascending:false}).limit(50);
  if (periodsQuery.error) return NextResponse.json({ error: 'Unable to load payroll periods.' }, { status: 500 });
  const periodId = new URL(request.url).searchParams.get('periodId');
  let entriesQuery = db().from('payroll_entries')
    .select('id,payroll_period_id,staff_id,approved_hours,hourly_rate,gross_amount,status,notes,created_at,updated_at,staff_profiles(employee_number,full_name,job_title)');
  if (periodId) entriesQuery = entriesQuery.eq('payroll_period_id', periodId);
  const entries = await entriesQuery.order('created_at',{ascending:false}).limit(1000);
  if (entries.error) return NextResponse.json({ error: 'Unable to load payroll entries.' }, { status: 500 });
  return NextResponse.json({ periods: periodsQuery.data || [], entries: entries.data || [] });
}

async function validatePayrollPeriodCompleteness(
  client: ReturnType<typeof db>,
  periodId: string,
  start: string,
  end: string,
) {
  const [{ data: approvedTimesheets, error: timesheetError }, { data: entries, error: entryError }] = await Promise.all([
    client.from('staff_timesheets').select('staff_id,total_hours').gte('work_date', start).lte('work_date', end).eq('status', 'approved'),
    client.from('payroll_entries').select('staff_id,approved_hours,hourly_rate,gross_amount').eq('payroll_period_id', periodId),
  ]);

  if (timesheetError || entryError) {
    return { ok: false as const, error: 'Unable to validate payroll entries.' };
  }

  const approvedByStaff = new Map<string, number>();
  for (const row of approvedTimesheets || []) {
    const hours = Number(row.total_hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    approvedByStaff.set(row.staff_id, Number(((approvedByStaff.get(row.staff_id) || 0) + hours).toFixed(2)));
  }

  const entryByStaff = new Map<string, { hours: number; rate: number | null; gross: number | null }>();
  for (const row of entries || []) {
    const hours = Number(row.approved_hours);
    const rate = row.hourly_rate == null ? null : Number(row.hourly_rate);
    const gross = row.gross_amount == null ? null : Number(row.gross_amount);
    entryByStaff.set(row.staff_id, {
      hours: Number.isFinite(hours) ? Number(hours.toFixed(2)) : 0,
      rate: Number.isFinite(rate ?? NaN) ? rate : null,
      gross: Number.isFinite(gross ?? NaN) ? gross : null,
    });
  }

  const staffIds = new Set([...approvedByStaff.keys(), ...entryByStaff.keys()]);
  const mismatches = [...staffIds].filter((staffId) => {
    const approvedHours = approvedByStaff.get(staffId) || 0;
    const entry = entryByStaff.get(staffId);
    if (!entry) return approvedHours !== 0;
    const grossExpected = entry.rate == null ? null : Number((entry.hours * entry.rate).toFixed(2));
    return entry.hours !== approvedHours || entry.rate == null || entry.gross == null || entry.gross !== grossExpected;
  });

  if (mismatches.length) {
    return {
      ok: false as const,
      error: 'Payroll entries are out of date or incomplete. Regenerate the open payroll period before processing.',
      mismatches,
    };
  }

  return { ok: true as const };
}

async function generateEntries(client: ReturnType<typeof db>, periodId: string, start: string, end: string, actor: string) {
  const { data: timesheets, error: tsError } = await client.from('staff_timesheets')
    .select('staff_id,total_hours').gte('work_date',start).lte('work_date',end).eq('status','approved');
  if (tsError) throw new Error('Approved timesheets could not be read.');

  const totals = new Map<string, number>();
  for (const row of timesheets || []) {
    const hours = Number(row.total_hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    totals.set(row.staff_id, (totals.get(row.staff_id) || 0) + hours);
  }

  const staffIds = [...totals.keys()];
  const staffById = new Map<string, { id: string; contract_id: string | null }>();
  if (staffIds.length) {
    const { data: staffRows, error: staffError } = await client.from('staff_profiles').select('id,contract_id').in('id',staffIds);
    if (staffError) throw new Error('Staff payroll records could not be read.');
    for (const row of staffRows || []) staffById.set(row.id, row as { id:string; contract_id:string|null });
  }

  const contractIds = [...staffById.values()].map(s=>s.contract_id).filter((v): v is string=>Boolean(v));
  const rateByContract = new Map<string, number>();
  if (contractIds.length) {
    const { data: contracts, error: contractError } = await client.from('recruitment_contracts').select('id,hourly_rate').in('id',contractIds);
    if (contractError) throw new Error('Contract pay rates could not be read.');
    for (const contract of contracts || []) {
      const rate = Number(contract.hourly_rate);
      if (Number.isFinite(rate) && rate > 0) rateByContract.set(contract.id, rate);
    }
  }

  for (const staffId of staffIds) {
    const hours = Number((totals.get(staffId)||0).toFixed(2));
    const contractId = staffById.get(staffId)?.contract_id || null;
    const rate = contractId ? Number((rateByContract.get(contractId)||0).toFixed(2)) : 0;
    const { error: entryError } = await client.from('payroll_entries').upsert({
      payroll_period_id:periodId,
      staff_id:staffId,
      approved_hours:hours,
      hourly_rate:rate || null,
      gross_amount:rate ? Number((hours*rate).toFixed(2)) : null,
      status:'draft',
    }, { onConflict:'payroll_period_id,staff_id' });
    if (entryError) throw new Error('One or more payroll entries could not be generated.');
  }

  const missingRates = staffIds.filter((staffId) => {
    const contractId = staffById.get(staffId)?.contract_id;
    return !contractId || !rateByContract.has(contractId);
  });

  await client.from('workforce_audit_events').insert({
    entity_type: 'payroll_period',
    entity_id: periodId,
    event_type:'payroll.entries_generated',
    actor,
    details:{ periodId, periodStart:start, periodEnd:end, generatedStaffCount:staffIds.length, missingRates },
  });

  return { generatedEntries: staffIds.length, missingRates };
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const requestedPeriodId = typeof body?.periodId === 'string' ? body.periodId : null;
  const start = typeof body?.periodStart === 'string' ? body.periodStart : '';
  const end = typeof body?.periodEnd === 'string' ? body.periodEnd : '';
  const payDate = typeof body?.payDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.payDate) ? body.payDate : null;
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

  const client = db();
  let periodId = requestedPeriodId;
  let period: Record<string, unknown> | null = null;

  if (requestedPeriodId) {
    const { data, error } = await client.from('payroll_periods')
      .select('id,period_start,period_end,pay_date,status,notes,created_by,created_at,updated_at')
      .eq('id', requestedPeriodId).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to load payroll period.' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Payroll period not found.' }, { status: 404 });
    if (data.status !== 'open') return NextResponse.json({ error: 'Only open payroll periods can be regenerated.' }, { status: 409 });
    period = data as Record<string, unknown>;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
      return NextResponse.json({ error: 'Valid period start and end dates are required.' }, { status: 400 });
    }
    const { data: created, error: periodError } = await client.from('payroll_periods').insert({
      period_start:start,
      period_end:end,
      pay_date:payDate,
      notes:notes||null,
      created_by:session.email,
    }).select('id,period_start,period_end,pay_date,status,notes,created_by,created_at,updated_at').single();
    if (periodError || !created) {
      if (periodError?.code === '23P01') return NextResponse.json({ error: 'That payroll period overlaps an existing payroll period.' }, { status: 409 });
      if (periodError?.code === '23505') return NextResponse.json({ error: 'That payroll period already exists.' }, { status: 409 });
      return NextResponse.json({ error: 'Unable to create payroll period.' }, { status: 500 });
    }
    period = created as Record<string, unknown>;
    periodId = created.id;
  }

  try {
    const generated = await generateEntries(client, periodId!, String(period.period_start), String(period.period_end), session.email);
    return NextResponse.json({ period, ...generated }, { status: requestedPeriodId ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate payroll entries.';
    await client.from('workforce_audit_events').insert({
      entity_type: 'payroll_period',
      entity_id: periodId,
      event_type:'payroll.generation_failed',
      actor:session.email,
      details:{ periodId, reason:message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Payroll period id is required.' }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!statuses.has(status)) return NextResponse.json({ error:'Invalid payroll period status.' }, { status:400 });

  const client = db();
  const { data: current, error: readError } = await client.from('payroll_periods')
    .select('id,period_start,period_end,status').eq('id',id).maybeSingle();
  if (readError) return NextResponse.json({ error:'Unable to load payroll period.' }, { status:500 });
  if (!current) return NextResponse.json({ error:'Payroll period not found.' }, { status:404 });
  if (!transitionAllowed(PAYROLL_PERIOD_TRANSITIONS, current.status, status)) {
    return NextResponse.json({ error:`Transition from ${current.status} to ${status} is not allowed.` }, { status:409 });
  }

  if (status === 'processing') {
    const { count, error: countError } = await client.from('payroll_entries').select('id', { count: 'exact', head: true }).eq('payroll_period_id', id);
    if (countError) return NextResponse.json({ error:'Unable to validate payroll entries.' }, { status:500 });
    if ((count || 0) === 0) return NextResponse.json({ error:'A payroll period cannot enter processing without payroll entries.' }, { status:409 });

    const validation = await validatePayrollPeriodCompleteness(client, id, String(current.period_start), String(current.period_end));
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await client.from('payroll_periods').update({ status, updated_at:now }).eq('id',id).eq('status',current.status)
    .select('id,period_start,period_end,pay_date,status,notes,created_by,created_at,updated_at').single();
  if (error || !data) {
    if (error?.message?.includes('PAYROLL_PERIOD')) return NextResponse.json({ error:'Payroll period is locked and cannot be changed.' }, { status:409 });
    if (error?.message?.includes('PAYROLL_ENTRIES_OUT_OF_DATE')) return NextResponse.json({ error:'Payroll entries are out of date. Regenerate the open payroll period before processing.' }, { status:409 });
    if (error?.message?.includes('PAYROLL_ENTRIES_INVALID')) return NextResponse.json({ error:'Payroll entries contain an invalid rate or gross amount.' }, { status:409 });
    return NextResponse.json({ error:'Unable to update payroll period.' }, { status:500 });
  }
  await client.from('workforce_audit_events').insert({
    entity_type:'payroll_period', entity_id:id, event_type:'payroll.period_status_changed', actor:session.email,
    details:{ periodId:id, from:current.status, to:status },
  });
  if (status === 'processing' || status === 'closed') {
    const { data: entries } = await client.from('payroll_entries').select('staff_id').eq('payroll_period_id', id).limit(1000);
    const uniqueStaffIds = [...new Set((entries || []).map((entry: any) => entry.staff_id).filter(Boolean))];
    for (const staffId of uniqueStaffIds) {
      await createLauremStaffNotification(client, {
        staffId,
        category: 'payroll',
        title: status === 'processing' ? 'Payroll is being processed' : 'Payroll period closed',
        body: status === 'processing'
          ? `Your CONAGS payroll period for ${current.period_start} to ${current.period_end} has entered processing.`
          : `Your CONAGS payroll period for ${current.period_start} to ${current.period_end} is now closed.`,
        actionUrl: '/staff/payroll',
      });
    }
  }
  return NextResponse.json({ period:data });
}

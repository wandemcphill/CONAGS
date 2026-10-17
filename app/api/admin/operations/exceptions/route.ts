import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { buildLauremOperationalExceptions, type ExceptionCandidate } from '@/lib/laurem-operational-exceptions';

type ExceptionRow = ExceptionCandidate & {
  id: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  detected_at: string;
  first_detected_at: string;
  last_detected_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function auth(request: NextRequest) {
  return readAdminSession(request);
}

async function collectDetected(client: ReturnType<typeof db>) {
  const [
    applicationsResult,
    contractsResult,
    staffResult,
    onboardingResult,
    assignmentsResult,
    timesheetsResult,
    leaveResult,
    payrollPeriodsResult,
    payrollEntriesResult,
  ] = await Promise.all([
    client.from('recruitment_applications').select('id,full_name,role_applied,status,updated_at,start_date').limit(500),
    client.from('recruitment_contracts').select('id,application_id,status,accepted_at,job_title,updated_at').limit(500),
    client.from('staff_profiles').select('id,application_id,contract_id,full_name,employee_number,job_title,employment_status,start_date,updated_at').limit(500),
    client.from('staff_onboarding_packages').select('id,staff_id,status,updated_at').limit(500),
    client.from('staff_assignments').select('id,staff_id,location,status').limit(1000),
    client.from('staff_timesheets').select('id,staff_id,assignment_id,work_date,status').limit(1000),
    client.from('staff_leave_requests').select('id,staff_id,start_date,status,created_at').limit(1000),
    client.from('payroll_periods').select('id,status,period_start,period_end').limit(1000),
    client.from('payroll_entries').select('id,staff_id,payroll_period_id,approved_hours,hourly_rate,gross_amount,status').limit(2000),
  ]);

  const failed = [
    applicationsResult,
    contractsResult,
    staffResult,
    onboardingResult,
    assignmentsResult,
    timesheetsResult,
    leaveResult,
    payrollPeriodsResult,
    payrollEntriesResult,
  ].find((item) => item.error);

  if (failed?.error) throw failed.error;

  return buildLauremOperationalExceptions({
    applications: applicationsResult.data || [],
    contracts: contractsResult.data || [],
    staff: staffResult.data || [],
    onboarding: onboardingResult.data || [],
    assignments: assignmentsResult.data || [],
    timesheets: timesheetsResult.data || [],
    leaveRequests: leaveResult.data || [],
    payrollPeriods: payrollPeriodsResult.data || [],
    payrollEntries: payrollEntriesResult.data || [],
  });
}

async function syncExceptions(client: ReturnType<typeof db>, detected: ExceptionCandidate[], actor: string) {
  const now = new Date().toISOString();
  const detectedKeys = new Set(detected.map((item) => item.dedupeKey));

  const { data: existing, error: existingError } = await client
    .from('laurem_operational_exceptions')
    .select('id,dedupe_key,status')
    .like('dedupe_key', 'mb13:%')
    .in('status', ['open', 'acknowledged']);

  if (existingError) throw existingError;

  for (const item of detected) {
    const { data: prior, error: priorError } = await client
      .from('laurem_operational_exceptions')
      .select('id,status,first_detected_at')
      .eq('dedupe_key', item.dedupeKey)
      .maybeSingle();
    if (priorError) throw priorError;

    const { data: row, error } = await client
      .from('laurem_operational_exceptions')
      .upsert({
        dedupe_key: item.dedupeKey,
        area: item.area,
        severity: item.severity,
        code: item.code,
        title: item.title,
        detail: item.detail,
        application_id: item.applicationId || null,
        staff_id: item.staffId || null,
        entity_type: item.entityType || null,
        entity_id: item.entityId || null,
        last_detected_at: now,
        detected_at: now,
        metadata: item.metadata || {},
        updated_at: now,
      }, { onConflict: 'dedupe_key' })
      .select('*')
      .single();

    if (error || !row) throw error || new Error('Unable to persist operational exception.');

    if (!prior) {
      const { error: eventError } = await client
        .from('laurem_operational_exception_events')
        .insert({
          exception_id: row.id,
          event_type: 'detected',
          actor: actor || 'system',
          reason: 'Detected by the CONAGS operational exception scanner.',
          metadata: item.metadata || {},
        });
      if (eventError) throw eventError;
    }
  }

  for (const item of existing || []) {
    if (detectedKeys.has(item.dedupe_key)) continue;

    const { error } = await client
      .from('laurem_operational_exceptions')
      .update({
        status: 'resolved',
        resolved_by: 'system',
        resolved_at: now,
        resolution_note: 'No longer detected by the operational exception scanner.',
        updated_at: now,
      })
      .eq('id', item.id)
      .in('status', ['open', 'acknowledged']);
    if (error) throw error;

    const { error: eventError } = await client
      .from('laurem_operational_exception_events')
      .insert({
        exception_id: item.id,
        event_type: 'resolved',
        actor: 'system',
        reason: 'Exception is no longer detected by the scanner.',
      });
    if (eventError) throw eventError;
  }
}

export async function GET(request: NextRequest) {
  const session = auth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const detected = await collectDetected(client);
    await syncExceptions(client, detected, session.email);

    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const area = params.get('area');
    const severity = params.get('severity');

    let query = client
      .from('laurem_operational_exceptions')
      .select('*')
      .order('status', { ascending: true })
      .order('severity', { ascending: true })
      .order('last_detected_at', { ascending: false })
      .limit(500);

    if (status && ['open', 'acknowledged', 'resolved', 'dismissed'].includes(status)) query = query.eq('status', status);
    if (area) query = query.eq('area', area);
    if (severity && ['critical', 'high', 'medium', 'low'].includes(severity)) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      exceptions: data || [],
      scanner: {
        detected: detected.length,
        scannedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.operational_exceptions.load_failed',
      actor: session.email,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to load operational exceptions.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = auth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.json({ error: 'Exception id is required.' }, { status: 400 });

  const body = await request.json().catch(() => null) as { status?: string; reason?: string } | null;
  const nextStatus = typeof body?.status === 'string' ? body.status : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';

  if (!['open', 'acknowledged', 'resolved', 'dismissed'].includes(nextStatus)) {
    return NextResponse.json({ error: 'Invalid exception status.' }, { status: 400 });
  }
  if (['resolved', 'dismissed'].includes(nextStatus) && !reason) {
    return NextResponse.json({ error: 'A reason is required when resolving or dismissing an exception.' }, { status: 400 });
  }
  if (nextStatus === 'open' && !reason) {
    return NextResponse.json({ error: 'A reason is required when reopening an exception.' }, { status: 400 });
  }

  try {
    const client = db();
    const { data: current, error: currentError } = await client
      .from('laurem_operational_exceptions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'Exception not found.' }, { status: 404 });
    if (current.status === nextStatus && !['open','acknowledged'].includes(nextStatus)) {
      return NextResponse.json({ exception: current });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: nextStatus,
      updated_at: now,
      resolution_note: reason || current.resolution_note,
    };

    if (nextStatus === 'acknowledged') {
      patch.acknowledged_by = session.email;
      patch.acknowledged_at = now;
    }
    if (nextStatus === 'resolved' || nextStatus === 'dismissed') {
      patch.resolved_by = session.email;
      patch.resolved_at = now;
      patch.resolution_note = reason;
    }
    if (nextStatus === 'open') {
      patch.resolved_by = null;
      patch.resolved_at = null;
      patch.resolution_note = null;
      patch.acknowledged_by = null;
      patch.acknowledged_at = null;
    }

    const { data: updated, error: updateError } = await client
      .from('laurem_operational_exceptions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (updateError || !updated) throw updateError || new Error('Unable to update exception.');

    const eventType = nextStatus === 'open' ? 'reopened' : nextStatus;
    const { error: eventError } = await client
      .from('laurem_operational_exception_events')
      .insert({
        exception_id: id,
        event_type: eventType,
        actor: session.email,
        reason: reason || null,
      });
    if (eventError) throw eventError;

    if (updated.application_id) {
      await client.from('recruitment_audit_log').insert({
        application_id: updated.application_id,
        event_type: `operational_exception.${eventType}`,
        actor: session.email,
        metadata: { exceptionId: id, code: updated.code, reason: reason || null },
      });
    }
    if (updated.staff_id) {
      await client.from('workforce_audit_events').insert({
        staff_id: updated.staff_id,
        entity_type: 'operational_exception',
        entity_id: id,
        event_type: `operational_exception.${eventType}`,
        actor: session.email,
        details: { code: updated.code, reason: reason || null },
      });
    }

    return NextResponse.json({ exception: updated });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.operational_exceptions.update_failed',
      actor: session.email,
      exceptionId: id,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to update operational exception.' }, { status: 500 });
  }
}

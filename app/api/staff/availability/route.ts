import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

function cleanNotes(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : '';
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function bool(value: unknown) { return value === true; }

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data, error } = await db().from('laurem_staff_availability')
    .select('id,effective_from,full_time,part_time,days,nights,weekends,notes,created_at')
    .eq('staff_id', session.staff_id)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: 'Unable to load your availability.' }, { status: 500 });
  return NextResponse.json({ current: (data || [])[0] || null, history: data || [] });
}

export async function PATCH(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const effectiveFrom = parseDate(body?.effectiveFrom) || today;
  if (effectiveFrom < today) {
    return NextResponse.json({ error: 'Availability changes cannot be backdated. Choose today or a future effective date.' }, { status: 400 });
  }
  const payload = {
    effective_from: effectiveFrom,
    full_time: bool(body?.fullTime),
    part_time: bool(body?.partTime),
    days: bool(body?.days),
    nights: bool(body?.nights),
    weekends: bool(body?.weekends),
    notes: cleanNotes(body?.notes) || null,
  };

  if (!payload.full_time && !payload.part_time) return NextResponse.json({ error: 'Select full-time or part-time availability.' }, { status: 400 });
  if (!payload.days && !payload.nights && !payload.weekends) return NextResponse.json({ error: 'Select at least one preferred working pattern.' }, { status: 400 });

  const client = db();
  const { data: existing } = await client.from('laurem_staff_availability')
    .select('id')
    .eq('staff_id', session.staff_id)
    .eq('effective_from', effectiveFrom)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let saved;
  let error;
  if (existing?.id) {
    const result = await client.from('laurem_staff_availability').update(payload).eq('id', existing.id)
      .select('id,effective_from,full_time,part_time,days,nights,weekends,notes,created_at').single();
    saved = result.data; error = result.error;
  } else {
    const result = await client.from('laurem_staff_availability').insert({ staff_id: session.staff_id, ...payload })
      .select('id,effective_from,full_time,part_time,days,nights,weekends,notes,created_at').single();
    saved = result.data; error = result.error;
  }

  if (error || !saved) return NextResponse.json({ error: 'Unable to save your availability.' }, { status: 500 });

  await client.from('laurem_workforce_audit_events').insert({
    staff_id: session.staff_id,
    event_type: 'staff.availability_updated',
    actor: session.email,
    details: payload,
  });



  await recordLauremAuditEvent({
    lifecycleArea: 'workforce',
    entityType: 'laurem_staff_availability',
    entityId: saved.id,
    staffId: session.staff_id,
    actorType: 'staff',
    actor: session.email,
    action: 'availability_updated',
    newState: effectiveFrom,
    metadata: { effectiveFrom, fullTime: payload.full_time, partTime: payload.part_time, days: payload.days, nights: payload.nights, weekends: payload.weekends },
  });  return NextResponse.json({ availability: saved });
}
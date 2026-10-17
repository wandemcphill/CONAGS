import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

const PHOTO_BUCKET = 'laurem-staff-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PROFILE_FIELDS = [
  'id,laurem_id,employee_number,full_name,email,phone,job_title,employment_status,start_date,location',
  'portal_handle,portal_address,address_line_1,address_line_2,city,county,postcode,country',
  'profile_photo_path,profile_photo_updated_at',
].join(',');

function withPhotoUrl(staff: any) {
  if (!staff.profile_photo_path) return staff;
  const version = staff.profile_photo_updated_at
    ? encodeURIComponent(String(staff.profile_photo_updated_at))
    : 'current';
  return { ...staff, profile_photo_url: `/api/staff/me/photo?v=${version}` };
}

function clean(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function hasValidImageSignature(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (type === 'image/webp') {
    return bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: staff, error } = await db().from('laurem_staff_profiles')
    .select(PROFILE_FIELDS)
    .eq('id', session.staff_id)
    .maybeSingle();

  if (error || !staff) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 });
  return NextResponse.json({ staff: withPhotoUrl(staff) });
}

export async function PATCH(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const editable = [
    'phone',
    'address_line_1',
    'address_line_2',
    'city',
    'county',
    'postcode',
    'country',
  ] as const;

  const update: Record<string, unknown> = {};
  for (const key of editable) {
    if (key in (body || {})) update[key] = clean(body?.[key]);
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No editable profile fields supplied.' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const client = db();
  const { data, error } = await client.from('laurem_staff_profiles')
    .update(update)
    .eq('id', session.staff_id)
    .select(PROFILE_FIELDS)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 500 });

  await client.from('laurem_workforce_audit_events').insert({
    staff_id: session.staff_id,
    entity_type: 'staff_profile',
    entity_id: session.staff_id,
    event_type: 'staff.self_service_profile_updated',
    actor: session.email,
    details: { fields: Object.keys(update).filter((key) => key !== 'updated_at') },
  });

  await recordLauremAuditEvent({
    lifecycleArea: 'staff_account', entityType: 'staff_profile', entityId: session.staff_id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'self_service_profile_updated',
    metadata: { fields: Object.keys(update).filter((key) => key !== 'updated_at') },
  });

  return NextResponse.json({ staff: withPhotoUrl(data) });
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A photograph is required.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Use a JPG, PNG or WebP photograph.' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'Photograph must be between 1 byte and 5 MB.' }, { status: 400 });
  }

  const signatureBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasValidImageSignature(file.type, signatureBytes)) {
    return NextResponse.json({ error: 'The uploaded file is not a valid JPG, PNG or WebP image.' }, { status: 400 });
  }

  const client = db();
  const bucket = await client.storage.getBucket(PHOTO_BUCKET);
  if (bucket.error) {
    const created = await client.storage.createBucket(PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: [...ALLOWED_TYPES],
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message || '')) {
      return NextResponse.json({ error: 'Unable to initialise private photograph storage.' }, { status: 500 });
    }
  }

  const { data: current } = await client.from('laurem_staff_profiles')
    .select('profile_photo_path')
    .eq('id', session.staff_id)
    .maybeSingle();

  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const path = `${session.staff_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const upload = await client.storage.from(PHOTO_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ error: 'Unable to save the photograph.' }, { status: 500 });

  const now = new Date().toISOString();
  const { data, error } = await client.from('laurem_staff_profiles')
    .update({
      profile_photo_path: path,
      profile_photo_updated_at: now,
      updated_at: now,
    })
    .eq('id', session.staff_id)
    .select(PROFILE_FIELDS)
    .single();

  if (error || !data) {
    await client.storage.from(PHOTO_BUCKET).remove([path]);
    return NextResponse.json({ error: 'Unable to save the photograph.' }, { status: 500 });
  }

  if (current?.profile_photo_path) {
    await client.storage.from(PHOTO_BUCKET).remove([current.profile_photo_path]);
  }

  await client.from('laurem_workforce_audit_events').insert({
    staff_id: session.staff_id,
    entity_type: 'staff_profile',
    entity_id: session.staff_id,
    event_type: 'staff_photo_updated',
    actor: session.email,
    details: { content_type: file.type, bytes: file.size },
  });

  await recordLauremAuditEvent({
    lifecycleArea: 'staff_account', entityType: 'staff_profile', entityId: session.staff_id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'staff_photo_updated',
    metadata: { contentType: file.type, bytes: file.size },
  });

  return NextResponse.json({ staff: withPhotoUrl(data) });
}

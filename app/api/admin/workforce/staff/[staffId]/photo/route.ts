import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';

const PHOTO_BUCKET = 'laurem-staff-photos';

export async function GET(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { staffId } = await params;
  if (!staffId) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });

  const client = db();
  const { data: staff, error } = await client.from('staff_profiles')
    .select('profile_photo_path')
    .eq('id', staffId)
    .maybeSingle();

  if (error || !staff?.profile_photo_path) {
    return NextResponse.json({ error: 'Staff photograph not found.' }, { status: 404 });
  }

  const { data, error: downloadError } = await client.storage
    .from(PHOTO_BUCKET)
    .download(staff.profile_photo_path);

  if (downloadError || !data) {
    return NextResponse.json({ error: 'Unable to load staff photograph.' }, { status: 404 });
  }

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff } = await client.from('laurem_staff_profiles')
    .select('id,application_id')
    .eq('id', session.staff_id)
    .maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 });

  const { data, error } = await client.from('laurem_staff_documents')
    .select('id,staff_id,category,title,description,original_filename,mime_type,file_size_bytes,status,requires_signature,signature_status,signature_name,signed_at,issuer_name,issuer_title,employer_name,issued_at,first_viewed_at,last_viewed_at,viewed_count')
    .eq('staff_id', session.staff_id)
    .eq('status', 'issued')
    .order('issued_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load employment documents.' }, { status: 500 });

  let documents = data || [];
  const visaDocuments = documents.filter((document: any) => document.category === 'visa_sponsorship');
  if (visaDocuments.length) {
    const { data: visaCase } = await client.from('laurem_staff_visa_cases')
      .select('status')
      .eq('staff_id', session.staff_id)
      .not('status', 'in', '(declined,withdrawn)')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const cosIsActive = Boolean(visaCase && ['cos_assigned', 'completed'].includes(visaCase.status));
    if (!cosIsActive) {
      documents = documents.filter((document: any) => document.category !== 'visa_sponsorship');
    }
  }

  return NextResponse.json({ documents });
}

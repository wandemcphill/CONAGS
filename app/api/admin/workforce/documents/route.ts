import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status')?.trim();
  const categoryParam = url.searchParams.get('category')?.trim();
  const staffIdParam = url.searchParams.get('staffId')?.trim();
  const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
  const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);

  const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
  const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 50 : limitParam));
  const offset = (page - 1) * limit;

  const client = db();

  let query = client.from('staff_documents')
    .select(`
      id,
      staff_id,
      category,
      title,
      description,
      mime_type,
      file_size_bytes,
      source_type,
      source_key,
      status,
      requires_signature,
      signature_status,
      signature_name,
      signed_at,
      issuer_name,
      issuer_title,
      employer_name,
      issued_by_actor,
      issued_at,
      viewed_count,
      superseded_at,
      superseded_by,
      created_at,
      updated_at
    `, { count: 'exact' });

  if (staffIdParam) {
    query = query.eq('staff_id', staffIdParam);
  }

  if (categoryParam) {
    query = query.eq('category', categoryParam);
  }

  if (statusParam) {
    if (['issued', 'superseded', 'revoked'].includes(statusParam)) {
      query = query.eq('status', statusParam);
    } else if (['pending', 'signed', 'declined', 'not_required'].includes(statusParam)) {
      query = query.eq('signature_status', statusParam);
    }
  }

  query = query.order('issued_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data: rawDocs, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Unable to load workforce documents.' }, { status: 500 });
  }

  const docList = rawDocs || [];

  const staffIds = Array.from(new Set(docList.map((d) => d.staff_id).filter(Boolean))) as string[];
  let staffMap: Record<string, { id: string; full_name: string; employee_number: string; job_title: string }> = {};
  if (staffIds.length > 0) {
    const { data: staffMembers } = await client.from('staff_profiles')
      .select('id, full_name, employee_number, job_title')
      .in('id', staffIds);
    if (staffMembers) {
      staffMap = Object.fromEntries(staffMembers.map((s) => [s.id, s]));
    }
  }

  const enrichedDocs = docList.map((doc) => {
    const staff = staffMap[doc.staff_id] || null;

    let displayStatus = 'Issued';
    if (doc.status === 'superseded') displayStatus = 'Superseded';
    else if (doc.status === 'revoked') displayStatus = 'Withdrawn';
    else if (doc.requires_signature && doc.signature_status === 'pending') displayStatus = 'Awaiting signature';
    else if (doc.requires_signature && doc.signature_status === 'signed') displayStatus = 'Signed';

    return {
      ...doc,
      staff,
      displayStatus,
    };
  });

  const total = count ?? enrichedDocs.length;
  const totalPages = Math.ceil(total / limit) || 1;

  return NextResponse.json({
    documents: enrichedDocs,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const { data: cases, error: caseError } = await client
      .from('staff_visa_cases')
      .select('id,staff_id,application_id,pathway,status,requested_at,updated_at')
      .not('status', 'in', '(declined,withdrawn,completed)')
      .order('requested_at', { ascending: false })
      .limit(100);
    if (caseError) throw caseError;

    const rows = cases || [];
    const staffIds = [...new Set(rows.map((row: any) => row.staff_id))];
    const caseIds = rows.map((row: any) => row.id);

    const [{ data: staff }, { data: invoices }, { data: documents }] = await Promise.all([
      staffIds.length
        ? client.from('staff_profiles').select('id,full_name,employee_number,laurem_id,job_title,email,employment_status').in('id', staffIds)
        : Promise.resolve({ data: [] }),
      caseIds.length
        ? client.from('staff_visa_invoices').select('visa_case_id,invoice_number,status,amount_pence,issue_date').in('visa_case_id', caseIds)
        : Promise.resolve({ data: [] }),
      staffIds.length
        ? client.from('staff_documents').select('id,staff_id,title,original_filename,issued_at').in('staff_id', staffIds).eq('category','visa_sponsorship').eq('status','issued').order('issued_at',{ascending:false})
        : Promise.resolve({ data: [] }),
    ]);

    const output = rows.map((item: any) => ({
      ...item,
      staff: (staff || []).find((person: any) => person.id === item.staff_id) || null,
      invoice: (invoices || []).find((invoice: any) => invoice.visa_case_id === item.id) || null,
      cosDocument: (documents || []).find((document: any) => document.staff_id === item.staff_id) || null,
    }));

    return NextResponse.json({
      requests: output,
      counts: {
        newRequests: output.filter((item: any) => ['requested','admin_review','awaiting_payment'].includes(item.status)).length,
        processing: output.filter((item: any) => ['preparing_sms','submitted_to_sms','cos_pending'].includes(item.status)).length,
        active: output.filter((item: any) => item.cosDocument && ['cos_assigned','completed'].includes(item.status)).length,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'admin.visa_requests.load_failed', reason:error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load visa support requests.' }, { status: 500 });
  }
}

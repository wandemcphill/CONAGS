import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();

    const [
      leaveResult,
      rotaResult,
      complianceResult,
      visaResult,
      visaHelpCaseResult,
      visaHelpTasksResult,
      documentsResult,
    ] = await Promise.all([
      client.from('laurem_staff_leave_requests')
        .select('id,leave_type,start_date,end_date,status,review_note,reviewed_at,created_at,updated_at')
        .eq('staff_id', session.staff_id)
        .order('created_at', { ascending: false })
        .limit(50),
      client.from('laurem_staff_rota_requests')
        .select('id,effective_from,preferred_training_location,status,review_note,reviewed_at,created_at,updated_at')
        .eq('staff_id', session.staff_id)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),
      client.from('laurem_staff_compliance_cases')
        .select('id,compliance_type,status,requested_at,reviewed_at,created_at,updated_at')
        .eq('staff_id', session.staff_id)
        .order('requested_at', { ascending: false })
        .limit(20),
      client.from('laurem_staff_visa_cases')
        .select('id,pathway,status,requested_at,updated_at,created_at')
        .eq('staff_id', session.staff_id)
        .not('status', 'in', '(declined,withdrawn)')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from('laurem_staff_visa_help_cases')
        .select('id,status,created_at,updated_at')
        .eq('staff_id', session.staff_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from('laurem_staff_visa_help_tasks')
        .select('id,status,visibility,created_at,updated_at')
        .eq('staff_id', session.staff_id)
        .eq('visibility', 'staff')
        .order('created_at', { ascending: false })
        .limit(100),
      client.from('laurem_staff_documents')
        .select('id,title,signature_status,category,issued_at')
        .eq('staff_id', session.staff_id)
        .eq('status', 'issued')
        .order('issued_at', { ascending: false })
        .limit(100),
    ]);

    const failed = [
      leaveResult,
      rotaResult,
      complianceResult,
      visaResult,
      visaHelpCaseResult,
      visaHelpTasksResult,
      documentsResult,
    ].find((result) => result.error);

    if (failed?.error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'staff.request_centre.load_failed',
        staffId: session.staff_id,
        reason: failed.error.message,
      }));
      return NextResponse.json({ error: 'Unable to load your request centre.' }, { status: 500 });
    }

    let visaHelpMilestoneCount = 0;
    if (visaHelpCaseResult.data?.id) {
      const milestoneResult = await client.from('laurem_staff_visa_help_milestones')
        .select('id', { count: 'exact', head: true })
        .eq('visa_help_case_id', visaHelpCaseResult.data.id);
      if (milestoneResult.error) {
        console.error(JSON.stringify({
          level: 'warn',
          event: 'staff.request_centre.milestones_unavailable',
          staffId: session.staff_id,
          reason: milestoneResult.error.message,
        }));
      } else {
        visaHelpMilestoneCount = milestoneResult.count || 0;
      }
    }

    const visaDocuments = (documentsResult.data || []).filter((document) => document.category === 'visa_sponsorship');
    const cosActive = Boolean(
      visaResult.data &&
      ['cos_assigned', 'completed'].includes(String(visaResult.data.status)) &&
      visaDocuments.length,
    );

    return NextResponse.json({
      leave: leaveResult.data || [],
      rota: { current: (rotaResult.data || [])[0] || null },
      compliance: {
        current: (complianceResult.data || []).filter((row) => !['completed', 'declined', 'cancelled'].includes(String(row.status))),
      },
      sponsorship: {
        case: visaResult.data || null,
        cosStatus: !visaResult.data
          ? { key: 'not_requested', label: 'COS not requested', canDownload: false }
          : cosActive
            ? { key: 'active', label: 'Active', canDownload: true }
            : ['preparing_sms', 'submitted_to_sms', 'cos_pending'].includes(String(visaResult.data.status))
              ? { key: 'processing', label: 'Processing COS', canDownload: false }
              : { key: 'invoice_requested', label: 'Invoice requested', canDownload: false },
      },
      visaHelp: {
        case: visaHelpCaseResult.data || null,
        tasks: visaHelpTasksResult.data || [],
        milestoneCount: visaHelpMilestoneCount,
      },
      documents: {
        documents: documentsResult.data || [],
        pendingSignatures: (documentsResult.data || []).filter((document) => document.signature_status === 'pending'),
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'staff.request_centre.unexpected_error',
      staffId: session.staff_id,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to load your request centre.' }, { status: 500 });
  }
}

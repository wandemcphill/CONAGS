import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { lauremRoleSlug } from '@/lib/laurem-role-policy';
import { LAUREM_STAFF_LIFECYCLE_READINESS_KEYS } from '@/lib/laurem-onboarding-readiness';
import { getRequestId, logOperationalError, operationalError, withRequestId } from '@/lib/laurem-operational';

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    try { return JSON.stringify(error); } catch { return 'unserializable_error'; }
  }
  return String(error);
}

async function checked<T extends { data: any; error: any }>(label: string, query: any): Promise<T> {
  const result = await query as T;
  if (result.error) throw new Error(`${label}: ${describeError(result.error)}`);
  return result;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');

  const { id } = await params;
  if (!id) return operationalError(requestId, 'Application id is required.', 400, 'APPLICATION_ID_REQUIRED');

  try {
    const client = db();
    const applicationResult = await checked(
      'application',
      client.from('recruitment_applications').select('*').eq('id', id).maybeSingle(),
    );
    const application = applicationResult.data;
    if (!application) return operationalError(requestId, 'Application not found.', 404, 'APPLICATION_NOT_FOUND');

    const inviteResult = application.invite_id
      ? await checked(
          'invite',
          client.from('recruitment_invites').select('id,candidate_name,candidate_email,role,expires_at,used_at,created_at').eq('id', application.invite_id).maybeSingle(),
        )
      : { data: null };

    const [interviewResult, secondResult, assessmentResult, nurseResult, documentRequestResult, documentResult, evidenceResult, readinessResult, contractResult, statusHistoryResult, adminActionResult, staffResult] = await Promise.all([
      checked('interviews', client.from('recruitment_interviews').select('id,scheduled_at,duration_minutes,location,meeting_link,interviewer,candidate_instructions,status,reschedule_count,cancelled_at,cancellation_reason,created_at,updated_at').eq('application_id', id).order('scheduled_at', { ascending: false }).limit(20)),
      checked('second_interviews', client.from('recruitment_second_interviews').select('id,status,answers,sent_by,sent_at,completed_at,expires_at,created_at').eq('application_id', id).order('created_at', { ascending: false }).limit(20)),
      checked('assessments', client.from('interview_attempts').select('id,round,role,pathway,question_ids,question_snapshot,answers,status,score,total_questions,pass_percent,percent,second_interview_id,started_at,submitted_at,created_at,updated_at').eq('application_id', id).order('round', { ascending: true })),
      checked('nurse_interview', client.from('recruitment_nurse_interview_responses').select('id,invite_id,application_id,pathway,answers,created_at').eq('application_id', id).maybeSingle()),
      checked('document_requests', client.from('recruitment_document_requests').select('id,document_type,description,required,status,requested_by,requested_at,reviewed_by,reviewed_at,review_note,required_for_readiness,readiness_item_key,expires_at,created_at').eq('application_id', id).order('created_at', { ascending: false })),
      checked('documents', client.from('recruitment_documents').select('id,application_id,document_request_id,document_type,original_filename,mime_type,file_size_bytes,status,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_note,superseded_at,superseded_by,checksum_sha256').eq('application_id', id).order('uploaded_at', { ascending: false })),
      checked('evidence_reviews', client.from('recruitment_evidence_reviews').select('id,evidence_type,document_id,status,reviewed_by,reviewed_at,review_note,metadata,created_at,updated_at').eq('application_id', id).order('created_at', { ascending: false }).limit(100)),
      checked('readiness', client.from('recruitment_onboarding_checklist').select('id,item_key,title,description,required,status,completed_at,completed_by,notes,created_at,updated_at').eq('application_id', id).order('created_at', { ascending: true })),
      checked('contracts', client.from('recruitment_contracts').select('id,application_id,version,job_title,start_date,contract_end_date,minimum_weekly_hours,hourly_rate,work_locations,client_or_assignment_details,notice_period_employee,notice_period_employer,holiday_entitlement,pension_scheme,status,issued_at,viewed_at,accepted_at,accepted_by_name,declined_at,decline_reason,created_by,contract_type,annual_salary,weekly_hours,visa_route,sponsorship_occupation_code,nmc_status,registration_deadline,pre_registration_salary,post_registration_salary,relocation_support,repayable_costs,repayment_schedule,contract_source,created_at,updated_at').eq('application_id', id).order('version', { ascending: false })),
      checked('status_history', client.from('recruitment_status_history').select('id,from_status,to_status,changed_by,note,created_at').eq('application_id', id).order('created_at', { ascending: false }).limit(100)),
      checked('admin_actions', client.from('recruitment_admin_actions').select('id,actor,action_type,from_status,to_status,outcome,reason,metadata,created_at').eq('application_id', id).order('created_at', { ascending: false }).limit(100)),
      checked('staff', client.from('staff_profiles').select('*').eq('application_id', id).maybeSingle()),
    ]);

    const auditQuery = staffResult.data?.id
      ? client.from('laurem_audit_events').select('id,lifecycle_area,entity_type,entity_id,application_id,staff_id,actor_type,actor,action,previous_state,new_state,reason,metadata,occurred_at').or(`application_id.eq.${id},staff_id.eq.${staffResult.data.id}`).order('occurred_at', { ascending: false }).limit(150)
      : client.from('laurem_audit_events').select('id,lifecycle_area,entity_type,entity_id,application_id,staff_id,actor_type,actor,action,previous_state,new_state,reason,metadata,occurred_at').eq('application_id', id).order('occurred_at', { ascending: false }).limit(150);
    const auditResult = await checked('canonical_audit', auditQuery);
    const audit = (auditResult.data || []).map((event: any) => ({
      id: event.id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      event_type: event.action,
      actor: event.actor,
      details: {
        lifecycleArea: event.lifecycle_area,
        actorType: event.actor_type,
        previousState: event.previous_state,
        newState: event.new_state,
        reason: event.reason,
        metadata: event.metadata,
      },
      created_at: event.occurred_at,
    }));

    const acceptedContract = (contractResult.data || []).find((contract: any) =>
      contract.status === 'accepted' && contract.accepted_at
    ) || null;
    const contractRoleMatches = Boolean(
      acceptedContract &&
      lauremRoleSlug(application.role_applied) &&
      lauremRoleSlug(acceptedContract.job_title) &&
      lauremRoleSlug(application.role_applied) === lauremRoleSlug(acceptedContract.job_title)
    );

    const lifecyclePolicy: Record<string, any> = {
      prepareOnboarding: null,
      markHired: null,
      portalProvision: null,
      portalActivate: null,
    };
    const transitionsToCheck: Array<[keyof typeof lifecyclePolicy, string]> = [];
    if (['Offer', 'Onboarding', 'Hired'].includes(application.status)) {
      transitionsToCheck.push(['prepareOnboarding', 'prepare_onboarding']);
    }
    if (['Onboarding', 'Hired'].includes(application.status)) {
      transitionsToCheck.push(['markHired', 'mark_hired']);
    }
    if (application.status === 'Hired') {
      transitionsToCheck.push(['portalProvision', 'portal_provision']);
      transitionsToCheck.push(['portalActivate', 'portal_activate']);
    }
    for (const [key, transition] of transitionsToCheck) {
      const result = await client.rpc('laurem_evaluate_staff_lifecycle', {
        p_application_id: id,
        p_transition: transition,
        p_reentry_override: false,
      });
      if (result.error) throw new Error('lifecycle policy: ' + describeError(result.error));
      lifecyclePolicy[key] = result.data;
    }

    return withRequestId(NextResponse.json({
      application,
      invite: inviteResult.data,
      interviews: interviewResult.data || [],
      secondInterviews: secondResult.data || [],
      assessments: assessmentResult.data || [],
      nurseInterview: nurseResult.data,
      documentRequests: documentRequestResult.data || [],
      documents: documentResult.data || [],
      evidenceReviews: evidenceResult.data || [],
      readiness: readinessResult.data || [],
      contracts: contractResult.data || [],
      statusHistory: statusHistoryResult.data || [],
      adminActions: adminActionResult.data || [],
      staff: staffResult.data,
      audit,
      recruiter: session.email,
      lifecyclePolicy,
      workspaceContext: {
        acceptedContractId: acceptedContract?.id || null,
        contractAccepted: Boolean(acceptedContract),
        contractRoleMatches,
        requiredReadinessOpen: (readinessResult.data || []).filter((item: any) =>
          item.required
          && LAUREM_STAFF_LIFECYCLE_READINESS_KEYS.has(item.item_key)
          && !['completed', 'waived'].includes(item.status)
        ).length,
        staffExists: Boolean(staffResult.data),
        staffContractBound: Boolean(staffResult.data && acceptedContract && (!staffResult.data.contract_id || staffResult.data.contract_id === acceptedContract.id)),
        staffStatus: staffResult.data?.employment_status || null,
        staffActivatedAt: staffResult.data?.activated_at || null,
      },
    }), requestId);
  } catch (error) {
    const reason = describeError(error);
    logOperationalError({ requestId, event: 'admin.application.detail_failed', actor: session.email, reason, metadata: { applicationId: id } });
    return operationalError(requestId, 'Unable to load candidate record.', 500, 'APPLICATION_DETAIL_FAILED');
  }
}

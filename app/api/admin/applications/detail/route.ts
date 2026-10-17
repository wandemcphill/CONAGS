import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { getLauremOnboardingReadiness } from '@/lib/laurem-onboarding-readiness';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!applicationId) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });

  try {
    const client = db();
    const { data: application, error: applicationError } = await client.from('recruitment_applications').select('*').eq('id', applicationId).maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const [history, interviews, secondInterviews, assessments, documents, requests, evidence, contract, staff] = await Promise.all([
      client.from('recruitment_status_history').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }).limit(100),
      client.from('recruitment_interviews').select('*').eq('application_id', applicationId).order('scheduled_at', { ascending: false }),
      client.from('recruitment_second_interviews').select('id,status,sent_by,sent_at,completed_at,expires_at,created_at').eq('application_id', applicationId).order('created_at', { ascending: false }),
      client.from('interview_attempts').select('id,round,role,pathway,question_ids,status,score,total_questions,pass_percent,percent,second_interview_id,started_at,submitted_at,created_at,updated_at').eq('application_id', applicationId).order('round', { ascending: true }),
      client.from('recruitment_documents').select('id,application_id,document_request_id,document_type,original_filename,mime_type,file_size_bytes,status,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_note,superseded_at,superseded_by,checksum_sha256').eq('application_id', applicationId).order('uploaded_at', { ascending: false }),
      client.from('recruitment_document_requests').select('*').eq('application_id', applicationId).order('created_at', { ascending: true }),
      client.from('recruitment_evidence_reviews').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }),
      client.from('recruitment_contracts').select('id,version,job_title,start_date,contract_end_date,minimum_weekly_hours,hourly_rate,status,issued_at,viewed_at,accepted_at,accepted_by_name,declined_at,decline_reason,created_by,created_at,updated_at').eq('application_id', applicationId).maybeSingle(),
      client.from('staff_profiles').select('id,employee_number,laurem_id,email,phone,job_title,employment_status,start_date,end_date,location,nmc_number,right_to_work_verified,dbs_verified,contract_id,activated_at,last_login_at,portal_handle,department_namespace,portal_address,created_at,updated_at').eq('application_id', applicationId).maybeSingle(),
    ]);

    const queries = [history, interviews, secondInterviews, assessments, documents, requests, evidence, contract, staff];
    const failed = queries.find((query) => query.error);
    if (failed?.error) throw failed.error;

    const readiness = await getLauremOnboardingReadiness(client, application);
    const onboarding = staff?.data ? (await client.from('staff_onboarding_packages').select('*').eq('staff_id', staff.data.id).maybeSingle()).data : null;

    const blockers = [
      ...readiness.missing.map((item) => `Readiness: ${item.title}`),
      ...(contract.data?.status === 'accepted' && contract.data.accepted_at ? [] : ['Accepted employment contract required']),
      ...(staff.data && staff.data.contract_id && contract.data && staff.data.contract_id !== contract.data.id ? ['Staff profile is bound to a different contract'] : []),
    ];

    return NextResponse.json({
      application,
      history: history.data || [],
      interviews: interviews.data || [],
      secondInterviews: secondInterviews.data || [],
      assessments: assessments.data || [],
      documents: documents.data || [],
      documentRequests: requests.data || [],
      evidence: evidence.data || [],
      contract: contract.data || null,
      staff: staff.data || null,
      onboarding,
      readiness,
      blockers,
      viewer: session.email,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.application.detail_failed', actor: session.email, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to load the candidate workspace.' }, { status: 500 });
  }
}

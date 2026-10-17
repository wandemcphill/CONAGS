import { NextRequest, NextResponse } from 'next/server';
import { buildOnboardingTasks, inferLauremOnboardingAudience } from '@/lib/laurem-onboarding';
import { readAdminSession } from '@/lib/admin-auth';
import { hashToken, makeToken } from '@/lib/token';
import { LauremLifecycleError, validateLauremStaffTransition, type LauremLifecycleErrorCode } from '@/lib/laurem-lifecycle';
import { db } from '@/lib/db';
import { getRequestId, logOperationalError, operationalError, withRequestId } from '@/lib/laurem-operational';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const applicationId = typeof body?.applicationId === 'string' ? body.applicationId : '';
  if (!applicationId) return operationalError(requestId, 'Application id is required.', 400, 'APPLICATION_ID_REQUIRED');
  try {
    const client = db();
    const { application } = await validateLauremStaffTransition(client, applicationId);
    const applicationData = (application.application_data && typeof application.application_data === 'object') ? application.application_data as Record<string, unknown> : {};
    const nmc = typeof applicationData.nmc_number === 'string' ? applicationData.nmc_number : null;
    const location = typeof body?.location === 'string' ? body.location.trim() : null;
    const audience = inferLauremOnboardingAudience(String(application.role_applied || ''), application.living_in_uk);
    const tasks = buildOnboardingTasks(audience);
    const packageTitle = audience === 'international_nurse'
      ? 'International Nurse Onboarding & Welcome Programme'
      : audience === 'sponsored_hca'
        ? 'Sponsored Healthcare Assistant Onboarding Programme'
        : 'Conags Staff Onboarding Programme';

    const rawAccessToken = makeToken();
    const accessTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: atomicRows, error: atomicError } = await client.rpc('laurem_prepare_staff_onboarding_atomic', {
      p_application_id: applicationId,
      p_actor: session.email,
      p_audience: audience,
      p_package_title: packageTitle,
      p_tasks: tasks,
      p_location: location,
      p_nmc_number: nmc || (typeof application.nmc_number === 'string' ? application.nmc_number : null),
      p_dbs_verified: Boolean(body?.dbsVerified),
      p_access_token_hash: hashToken(rawAccessToken),
      p_access_token_expires_at: accessTokenExpiresAt,
    });
    if (atomicError) throw atomicError;

    const atomic = Array.isArray(atomicRows) ? atomicRows[0] : atomicRows;
    if (!atomic) throw new Error('Atomic onboarding preparation returned no result.');

    const { data: preparedStaff, error: staffReadError } = await client
      .from('staff_profiles')
      .select('*')
      .eq('id', atomic.staff_id)
      .single();
    if (staffReadError || !preparedStaff) throw staffReadError || new Error('Staff profile not found after atomic preparation.');

    // Portal activation is intentionally deferred until the recruiter changes
    // the application status to Hired. Invalidate any legacy activation token
    // that may have been created by an older flow.
    if (!preparedStaff.activated_at && preparedStaff.activation_token_hash) {
      const { error: clearActivationError } = await client
        .from('staff_profiles')
        .update({ activation_token_hash: null, activation_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', preparedStaff.id);
      if (clearActivationError) throw clearActivationError;
    }

    const { data: updatedPackage, error: packageError } = await client
      .from('staff_onboarding_packages')
      .select('*')
      .eq('id', atomic.package_id)
      .single();
    if (packageError || !updatedPackage) throw packageError || new Error('Onboarding package not found after atomic preparation.');

    const { data: finalTasks } = await client
      .from('staff_onboarding_tasks')
      .select('*')
      .eq('package_id', atomic.package_id)
      .order('sort_order', { ascending: true });

    const onboardingLink = atomic.access_token_issued && rawAccessToken
      ? (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '') + '/onboarding/' + rawAccessToken
      : null;

    return withRequestId(NextResponse.json({
      staff: { id: preparedStaff.id, employee_number: preparedStaff.employee_number, contract_id: preparedStaff.contract_id },
      audience,
      package: updatedPackage,
      tasks: finalTasks || [],
      onboardingLink,
      portal: null,
      activationDeferredUntilHired: true,
      employmentDocumentsIssuedAtHired: true,
      alreadyOnboarded: !atomic.created_staff,
    }, { status: atomic.created_staff ? 201 : 200 }), requestId);
  } catch (error) {
    if (error instanceof LauremLifecycleError) {
      const statusByCode: Record<LauremLifecycleErrorCode, number> = { APPLICATION_NOT_FOUND: 404, CONTRACT_REQUIRED: 409, CONTRACT_ROLE_MISMATCH: 409, READINESS_INCOMPLETE: 409, STAFF_CONTRACT_MISMATCH: 409 };
      const details = error.details?.readiness ? { readiness: error.details.readiness } : undefined;
      return operationalError(requestId, error.message, statusByCode[error.code], error.code);
    }
    logOperationalError({ requestId, event: 'admin.onboarding.create_failed', actor: session.email, reason: error, metadata: { applicationId } });
    return operationalError(requestId, 'Unable to complete onboarding.', 500, 'ONBOARDING_FAILED');
  }
}
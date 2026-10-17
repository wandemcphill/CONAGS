import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { buildOnboardingTasks, inferLauremOnboardingAudience } from '@/lib/laurem-onboarding';
import { renderLauremJobDescription } from '@/lib/laurem-job-description';
import { provisionLauremStaffPortal } from '@/lib/laurem-staff-provision';
import { hashActivationToken, makeActivationToken } from '@/lib/laurem-staff-auth';
import { sendLauremStaffActivation } from '@/lib/laurem-staff-email';
import { LauremLifecycleError, validateLauremStaffTransition, type LauremLifecycleErrorCode } from '@/lib/laurem-lifecycle';
import { getRequestId, logOperationalError, operationalError, withRequestId } from '@/lib/laurem-operational';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');

  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!id) return operationalError(requestId, 'Application id is required.', 400, 'APPLICATION_ID_REQUIRED');

  try {
    const client = db();
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return operationalError(requestId, 'Application not found.', 404, 'APPLICATION_NOT_FOUND');

    await validateLauremStaffTransition(client, id);

    if (!['Onboarding', 'Hired'].includes(application.status)) {
      return NextResponse.json({ error: 'A candidate must be in Onboarding before they can be marked Hired.' }, { status: 409 });
    }

    const applicationData = application.application_data && typeof application.application_data === 'object'
      ? application.application_data as Record<string, unknown>
      : {};
    const audience = inferLauremOnboardingAudience(String(application.role_applied || ''), application.living_in_uk);
    const tasks = buildOnboardingTasks(audience);
    const packageTitle = audience === 'international_nurse'
      ? 'International Nurse Onboarding & Welcome Programme'
      : audience === 'sponsored_hca'
        ? 'Sponsored Healthcare Assistant Onboarding Programme'
        : 'Conags Staff Onboarding Programme';

    let transitioned = application;
    let staff: any = null;
    let activation: { status: string; deliveryId?: string | null; error?: string } | null = null;

    let rawActivationToken: string | null = null;
    let activationExpiresAt: string | null = null;

    if (application.status === 'Onboarding') {
      const preparedResult = await client.rpc('laurem_prepare_staff_onboarding_atomic', {
        p_application_id: id,
        p_actor: session.email,
        p_audience: audience,
        p_package_title: packageTitle,
        p_tasks: tasks,
        p_location: null,
        p_nmc_number: typeof applicationData.nmc_number === 'string'
          ? applicationData.nmc_number
          : (typeof application.nmc_number === 'string' ? application.nmc_number : null),
        p_dbs_verified: Boolean(applicationData.dbs_verified),
        p_access_token_hash: null,
        p_access_token_expires_at: null,
      });
      if (preparedResult.error) throw preparedResult.error;
      const prepared = Array.isArray(preparedResult.data) ? preparedResult.data[0] : preparedResult.data;
      if (!prepared?.staff_id) throw new Error('Unable to prepare the workforce identity for hire.');

      const { data: preparedStaff, error: staffError } = await client.from('staff_profiles')
        .select('*')
        .eq('id', prepared.staff_id)
        .single();
      if (staffError || !preparedStaff) throw staffError || new Error('Staff profile not found after hire preparation.');

      const jobDescription = renderLauremJobDescription(
        preparedStaff.job_title || application.role_applied || 'Care Worker',
        preparedStaff.full_name,
      );
      const jobHash = createHash('sha256').update(jobDescription, 'utf8').digest('hex');

      const preactivatedPortal = Boolean(preparedStaff.activated_at && preparedStaff.password_hash);
      let atomicHire;
      if (preactivatedPortal) {
        // A candidate may have activated the Staff Portal after accepting the
        // contract and before the employment Hired boundary. Preserve that
        // account and promote employment_status from pending to active.
        atomicHire = await client.rpc('laurem_hire_preprovisioned_staff_atomic', {
          p_application_id: id,
          p_actor: session.email,
          p_job_title: preparedStaff.job_title || application.role_applied || 'Care Worker',
          p_job_description: jobDescription,
          p_job_description_sha256: jobHash,
        });
      } else {
        rawActivationToken = makeActivationToken();
        activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        atomicHire = await client.rpc('laurem_hire_application_atomic', {
          p_application_id: id,
          p_actor: session.email,
          p_job_title: preparedStaff.job_title || application.role_applied || 'Care Worker',
          p_job_description: jobDescription,
          p_job_description_sha256: jobHash,
          p_activation_token_hash: hashActivationToken(rawActivationToken),
          p_activation_expires_at: activationExpiresAt,
        });
      }

      if (atomicHire.error) throw atomicHire.error;
      if (!atomicHire.data?.ok) throw new Error('Atomic hire workflow returned no successful result.');

      transitioned = atomicHire.data.application;
      const { data: hiredStaff, error: hiredStaffError } = await client.from('staff_profiles')
        .select('*')
        .eq('id', preparedStaff.id)
        .single();
      if (hiredStaffError || !hiredStaff) throw hiredStaffError || new Error('Staff profile not found after atomic hire.');
      staff = hiredStaff;

      if (preactivatedPortal) {
        activation = { status: 'already_activated', deliveryId: null };
      } else {
        if (!rawActivationToken) throw new Error('Activation token was not prepared for the new staff account.');
        try {
          const activationEmail = await sendLauremStaffActivation(client, staff, rawActivationToken);
          activation = {
            status: activationEmail.status,
            deliveryId: activationEmail.deliveryId || null,
            ...(activationEmail.status === 'failed' ? { error: activationEmail.error } : {}),
          };
          if (activationEmail.status === 'failed') {
            logOperationalError({
              requestId,
              event: 'admin.application.hire_activation_delivery_failed',
              actor: session.email,
              reason: activationEmail.error || 'Activation email delivery failed.',
              metadata: { applicationId: id, staffId: staff.id },
            });
          }
        } catch (emailError) {
          activation = {
            status: 'failed',
            deliveryId: null,
            error: emailError instanceof Error ? emailError.message : String(emailError),
          };
          logOperationalError({
            requestId,
            event: 'admin.application.hire_activation_delivery_failed',
            actor: session.email,
            reason: emailError,
            metadata: { applicationId: id, staffId: staff.id },
          });
        }
      }
    } else {
      const { data: existingStaff, error: staffError } = await client.from('staff_profiles')
        .select('*')
        .eq('application_id', id)
        .single();
      if (staffError || !existingStaff) throw staffError || new Error('Staff profile not found for Hired application.');
      staff = existingStaff;

      if (staff.activated_at) {
        activation = { status: 'already_activated', deliveryId: null };
      } else if (!staff.activation_token_hash) {
        const portal = await provisionLauremStaffPortal(id, session.email);
        activation = {
          status: portal.activation.status,
          deliveryId: portal.activation.deliveryId || null,
          ...(portal.activation.status === 'failed' ? { error: portal.activation.error } : {}),
        };
      } else {
        activation = { status: 'activation_already_issued', deliveryId: null };
      }
    }

    const { data: currentDocs, error: docsError } = await client.from('staff_documents')
      .select('id,title,category,requires_signature,signature_status,issuer_name,issuer_title,employer_name,issued_at')
      .eq('staff_id', staff.id)
      .eq('status', 'issued')
      .order('issued_at', { ascending: true });
    if (docsError) {
      logOperationalError({
        requestId,
        event: 'admin.application.hire_document_read_failed',
        actor: session.email,
        reason: docsError,
        metadata: { applicationId: id, staffId: staff.id },
      });
    }

    return withRequestId(NextResponse.json({
      application: transitioned,
      staff: {
        id: staff.id,
        employee_number: staff.employee_number,
        laurem_id: staff.laurem_id || staff.employee_number,
        employment_status: staff.employment_status,
      },
      documents: currentDocs || [],
      activation,
    }, { status: application.status === 'Hired' ? 200 : 201 }), requestId);
  } catch (error) {
    if (error instanceof LauremLifecycleError) {
      const statusByCode: Record<LauremLifecycleErrorCode, number> = {
        APPLICATION_NOT_FOUND: 404,
        CONTRACT_REQUIRED: 409,
        CONTRACT_ROLE_MISMATCH: 409,
        READINESS_INCOMPLETE: 409,
        STAFF_CONTRACT_MISMATCH: 409,
      };
      const details = error.details?.readiness ? { readiness: error.details.readiness } : undefined;
      return operationalError(requestId, error.message, statusByCode[error.code], error.code);
    }
    logOperationalError({ requestId, event: 'admin.application.hire_failed', actor: session.email, reason: error, metadata: { applicationId: id } });
    return operationalError(requestId, 'Unable to complete the hire workflow.', 500, 'HIRE_WORKFLOW_FAILED');
  }
}
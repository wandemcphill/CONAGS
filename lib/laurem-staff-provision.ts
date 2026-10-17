import { createHash } from 'node:crypto';
import { db } from './db';
import { makeActivationToken, hashActivationToken } from './laurem-staff-auth';
import { ensureLauremMailbox } from './laurem-messaging';
import { sendLauremStaffActivation } from './laurem-staff-email';
import { getLauremOnboardingReadiness } from './laurem-onboarding-readiness';
import { lauremRoleSlug } from './laurem-role-policy';
import { renderLauremJobDescription } from './laurem-job-description';

/**
 * Provisions portal identity only after the admin onboarding route has already
 * enforced contract + role + readiness gates. This helper repeats the critical
 * gates as defence in depth and never activates a staff account by itself.
 */
export async function provisionLauremStaffPortal(applicationId: string, actor = 'staff_portal_provisioning') {
  const client = db();
  const { data: app, error: appError } = await client.from('recruitment_applications')
    .select('id,full_name,email,phone,role_applied,start_date,living_in_uk,nmc_number,application_data')
    .eq('id', applicationId).single();
  if (appError || !app) throw appError || new Error('Application not found.');

  const { data: contract, error: contractError } = await client.from('recruitment_contracts')
    .select('id,status,accepted_at,job_title,start_date').eq('application_id', applicationId).maybeSingle();
  if (contractError) throw contractError;
  if (!contract || contract.status !== 'accepted' || !contract.accepted_at) throw new Error('Accepted employment contract required.');

  const applicationRole = lauremRoleSlug(app.role_applied);
  const contractRole = lauremRoleSlug(contract.job_title);
  if (!applicationRole || !contractRole || applicationRole !== contractRole) throw new Error('Application and contract roles must match.');

  const readiness = await getLauremOnboardingReadiness(client, app);
  if (!readiness.ready) throw new Error(`Onboarding readiness incomplete: ${readiness.missing.map((item) => item.item_key).join(', ')}`);

  const { data: staff, error: staffError } = await client.from('staff_profiles').select('*').eq('application_id', applicationId).maybeSingle();
  if (staffError) throw staffError;
  if (!staff) throw new Error('Staff profile must be created by the gated onboarding flow before portal provisioning.');

  const { data: lifecyclePolicy, error: lifecyclePolicyError } = await client.rpc('laurem_evaluate_staff_lifecycle', {
    p_application_id: applicationId,
    p_transition: 'portal_provision',
    p_reentry_override: false,
  });
  if (lifecyclePolicyError) throw lifecyclePolicyError;
  if (!lifecyclePolicy?.ok) throw new Error(lifecyclePolicy?.reason || 'Canonical lifecycle policy blocked portal provisioning.');

  const mailbox = await ensureLauremMailbox(client, staff);
  const rawToken = makeActivationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: issued, error: issueError } = await client.rpc('laurem_issue_staff_activation_token', {
    p_staff_id: staff.id,
    p_token_hash: hashActivationToken(rawToken),
    p_expires_at: expiresAt,
    p_actor: actor,
  });
  if (issueError || !issued) throw issueError || new Error('Unable to create staff activation token.');

  const activation = await sendLauremStaffActivation(client, issued, rawToken);
  return { staff: issued, mailbox, activation, expiresAt };
}


/**
 * Completes a stale pending hire that already has a workforce identity.
 *
 * This recovery path keeps the canonical lifecycle boundary intact:
 * the atomic hire RPC performs the Hired transition, employment document
 * package, mailbox identity and one-time activation credential. It never
 * activates the staff account itself.
 */
export async function completePendingLauremHireAndIssueActivation(
  applicationId: string,
  actor = 'staff_portal_recovery',
) {
  const client = db();

  const { data: app, error: appError } = await client
    .from('recruitment_applications')
    .select('id,status,full_name,email,role_applied,start_date,living_in_uk,nmc_number,application_data')
    .eq('id', applicationId)
    .maybeSingle();

  if (appError || !app) throw appError || new Error('Application not found.');
  if (app.status !== 'Onboarding') {
    throw new Error('Pending hire recovery is only available while the application is in Onboarding.');
  }

  const { data: staff, error: staffError } = await client
    .from('staff_profiles')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (staffError || !staff) {
    throw staffError || new Error('Staff profile not found for pending hire recovery.');
  }

  if (
    staff.employment_status !== 'pending'
    || staff.activated_at
    || staff.password_hash
  ) {
    throw new Error('Only a pending, not-yet-activated staff account can be recovered.');
  }

  const jobDescription = renderLauremJobDescription(
    staff.job_title || app.role_applied || 'Care Worker',
    staff.full_name || app.full_name,
  );
  const jobHash = createHash('sha256').update(jobDescription, 'utf8').digest('hex');
  const rawActivationToken = makeActivationToken();
  const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const atomicHire = await client.rpc('laurem_hire_application_atomic', {
    p_application_id: applicationId,
    p_actor: actor,
    p_job_title: staff.job_title || app.role_applied || 'Care Worker',
    p_job_description: jobDescription,
    p_job_description_sha256: jobHash,
    p_activation_token_hash: hashActivationToken(rawActivationToken),
    p_activation_expires_at: activationExpiresAt,
  });

  if (atomicHire.error) throw atomicHire.error;
  if (!atomicHire.data?.ok) {
    throw new Error('Atomic hire recovery returned no successful result.');
  }

  const { data: hiredStaff, error: hiredStaffError } = await client
    .from('staff_profiles')
    .select('*')
    .eq('id', staff.id)
    .single();

  if (hiredStaffError || !hiredStaff) {
    throw hiredStaffError || new Error('Staff profile not found after pending hire recovery.');
  }

  const activation = await sendLauremStaffActivation(client, hiredStaff, rawActivationToken);
  return {
    staff: hiredStaff,
    activation,
    expiresAt: activationExpiresAt,
  };
}

/**
 * Provisions a pending Staff Portal identity as soon as the candidate accepts
 * the employment contract. This deliberately does not mark the application
 * Hired and does not require canonical onboarding-readiness completion.
 *
 * The pending identity can be used for portal onboarding/access. The separate
 * Hired transition remains responsible for employment activation and readiness.
 */
export async function provisionLauremPendingStaffPortalAfterContract(
  applicationId: string,
  actor = 'contract_acceptance',
) {
  const client = db();

  const { data: application, error: applicationError } = await client
    .from('recruitment_applications')
    .select('id,full_name,email,phone,role_applied,start_date,living_in_uk,nmc_number,application_data,status')
    .eq('id', applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    throw applicationError || new Error('Application not found.');
  }

  if (!['Offer', 'Onboarding', 'Hired'].includes(String(application.status))) {
    throw new Error(`Application status ${application.status} cannot receive Staff Portal provisioning.`);
  }

  const { data: contract, error: contractError } = await client
    .from('recruitment_contracts')
    .select('id,status,accepted_at,job_title,start_date')
    .eq('application_id', applicationId)
    .eq('status', 'accepted')
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contractError || !contract || !contract.accepted_at) {
    throw contractError || new Error('Accepted employment contract required.');
  }

  const applicationRole = lauremRoleSlug(application.role_applied);
  const contractRole = lauremRoleSlug(contract.job_title);
  if (!applicationRole || !contractRole || applicationRole !== contractRole) {
    throw new Error('Application and contract roles must match.');
  }

  const { data: prepared, error: prepareError } = await client.rpc(
    'laurem_prepare_staff_portal_after_contract_atomic',
    {
      p_application_id: applicationId,
      p_actor: actor,
    },
  );
  if (prepareError) throw prepareError;

  const preparedRow = Array.isArray(prepared) ? prepared[0] : prepared;
  if (!preparedRow?.staff_id) {
    throw new Error('Unable to prepare the Staff Portal identity.');
  }

  const { data: preparedStaff, error: preparedStaffError } = await client
    .from('staff_profiles')
    .select('*')
    .eq('id', preparedRow.staff_id)
    .single();

  if (preparedStaffError || !preparedStaff) {
    throw preparedStaffError || new Error('Staff profile not found after portal preparation.');
  }

  const mailbox = await ensureLauremMailbox(client, preparedStaff);
  const rawToken = makeActivationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: issued, error: issueError } = await client.rpc('laurem_issue_staff_activation_token', {
    p_staff_id: preparedStaff.id,
    p_token_hash: hashActivationToken(rawToken),
    p_expires_at: expiresAt,
    p_actor: actor,
  });

  if (issueError || !issued) {
    throw issueError || new Error('Unable to issue the Staff Portal activation token.');
  }

  const activation = await sendLauremStaffActivation(
    client,
    { ...issued, ...preparedStaff, ...(mailbox || {}) },
    rawToken,
    application.status === 'Hired',
  );

  return {
    staff: issued,
    mailbox,
    activation,
    expiresAt,
  };
}

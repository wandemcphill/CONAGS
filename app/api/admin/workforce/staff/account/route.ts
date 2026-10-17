import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { makeActivationToken, hashActivationToken } from '@/lib/laurem-staff-auth';
import { sendLauremStaffActivation } from '@/lib/laurem-staff-email';
import { provisionLauremPendingStaffPortalAfterContract, provisionLauremStaffPortal } from '@/lib/laurem-staff-provision';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

function describeError(value: unknown): string {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
    const parts = [candidate.details, candidate.hint, candidate.code]
      .filter((part) => typeof part === 'string' && part.trim())
      .map(String);
    if (parts.length) return parts.join(' ');
  }
  if (typeof value === 'string' && value.trim()) return value;
  return 'Unable to reissue the activation link.';
}

function accountState(staff: { employment_status: string; activated_at: string | null; activation_expires_at: string | null }) {
  if (staff.employment_status === 'active' && staff.activated_at) return 'active';
  if (staff.employment_status === 'suspended' && staff.activated_at) return 'suspended';
  if (staff.employment_status === 'leaver' && staff.activated_at) return 'leaver';
  if (staff.employment_status === 'pending' && staff.activated_at) return 'activation_recovery_needed';
  if (staff.employment_status === 'pending' && staff.activation_expires_at && new Date(staff.activation_expires_at).getTime() > Date.now()) return 'activation_pending';
  if (staff.employment_status === 'pending') return 'activation_needed';
  return 'state_review';
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const { data, error } = await client.from('staff_profiles')
    .select('id,application_id,employee_number,laurem_id,full_name,email,job_title,employment_status,activated_at,activation_expires_at,activation_used_at,session_version,created_at,updated_at')
    .order('full_name', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: 'Unable to load staff account state.' }, { status: 500 });

  const staff = (data || []).map((row) => ({ ...row, account_state: accountState(row) }));
  return NextResponse.json({ staff });
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const staffId = typeof body?.staffId === 'string' ? body.staffId.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';

  if (!staffId || action !== 'reissue_activation') {
    return NextResponse.json({ error: 'A valid staffId and reissue_activation action are required.' }, { status: 400 });
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: 'A reason of at least 5 characters is required for activation recovery.' }, { status: 400 });
  }

  const client = db();
  const { data: staff, error } = await client.from('staff_profiles')
    .select('id,application_id,employee_number,laurem_id,full_name,email,employment_status,activated_at,activation_expires_at,password_hash,activation_used_at,session_version')
    .eq('id', staffId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Unable to load staff account.' }, { status: 500 });
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  if (staff.employment_status !== 'pending') {
    return NextResponse.json({ error: 'Only a pending staff account can receive activation recovery.' }, { status: 409 });
  }
  if (!staff.application_id) return NextResponse.json({ error: 'This staff record is not linked to a recruitment application.' }, { status: 409 });

  const { data: application, error: applicationError } = await client
    .from('recruitment_applications')
    .select('id,status')
    .eq('id', staff.application_id)
    .maybeSingle();

  if (applicationError) return NextResponse.json({ error: 'Unable to load the linked recruitment application.' }, { status: 500 });
  if (!application) return NextResponse.json({ error: 'The linked recruitment application could not be found.' }, { status: 409 });

  try {
    if (staff.activated_at) {
      // Narrow exception: only recover an already-activated portal identity when
      // the linked application is still Onboarding and staff employment is Pending.
      // The database RPC locks the profile, revokes sessions, consumes reset tokens,
      // resets the old credentials and installs the replacement activation hash atomically.
      if (application.status !== 'Onboarding' || !staff.password_hash) {
        return NextResponse.json({
          error: 'This activated account is not eligible for onboarding activation recovery. No changes were made.',
        }, { status: 409 });
      }

      const rawToken = makeActivationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recoveryResult, error: recoveryError } = await client.rpc(
        'laurem_recover_activated_pending_onboarding_staff_portal',
        {
          p_staff_id: staff.id,
          p_token_hash: hashActivationToken(rawToken),
          p_expires_at: expiresAt,
          p_actor: session.email,
          p_reason: reason,
        },
      );

      const recovered = Array.isArray(recoveryResult) ? recoveryResult[0] : recoveryResult;
      if (recoveryError || !recovered) {
        throw recoveryError || new Error('The database did not confirm activation recovery. No replacement email was sent.');
      }

      const activation = await sendLauremStaffActivation(client, recovered, rawToken, false);
      await recordLauremAuditEvent({
        lifecycleArea: 'staff_account',
        entityType: 'staff_profile',
        entityId: staff.id,
        staffId: staff.id,
        applicationId: staff.application_id,
        actorType: 'admin',
        actor: session.email,
        action: 'activation_reissued',
        reason,
        metadata: {
          recoveryMode: 'activated_pending_onboarding_recovery',
          previousActivationRevoked: true,
          deliveryStatus: activation.status,
          replacementDeliveryId: activation.deliveryId,
          applicationStatusBefore: application.status,
          employmentStatusPreserved: 'pending',
        },
      });

      return NextResponse.json({
        ok: true,
        staff: {
          id: staff.id,
          employee_number: recovered.employee_number || staff.employee_number,
          laurem_id: recovered.laurem_id || staff.laurem_id,
          full_name: recovered.full_name || staff.full_name,
          email: recovered.email || staff.email,
        },
        activation: {
          status: activation.status,
          deliveryId: activation.deliveryId,
          expiresAt,
        },
        recovery: 'activated_pending_onboarding_recovered',
      });
    }

    // Standard reissue path for an account that has never completed activation.
    const portal = application.status === 'Onboarding'
      ? await provisionLauremPendingStaffPortalAfterContract(staff.application_id, session.email)
      : await provisionLauremStaffPortal(staff.application_id, session.email);

    await recordLauremAuditEvent({
      lifecycleArea: 'staff_account',
      entityType: 'staff_profile',
      entityId: staff.id,
      staffId: staff.id,
      applicationId: staff.application_id,
      actorType: 'admin',
      actor: session.email,
      action: 'activation_reissued',
      reason,
      metadata: {
        deliveryStatus: portal.activation.status,
        replacementDeliveryId: portal.activation.deliveryId,
        recoveryMode: application.status === 'Onboarding' ? 'onboarding_portal_activation_reissue' : 'activation_reissue',
        applicationStatusBefore: application.status,
      },
    });

    return NextResponse.json({
      ok: true,
      staff: {
        id: staff.id,
        employee_number: portal.staff.employee_number,
        laurem_id: portal.staff.laurem_id,
        full_name: portal.staff.full_name,
        email: portal.staff.email,
      },
      activation: {
        status: portal.activation.status,
        deliveryId: portal.activation.deliveryId,
        expiresAt: portal.expiresAt,
      },
      recovery: application.status === 'Onboarding' ? 'portal_activation_reissued' : 'activation_reissued',
    });
  } catch (caught) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.staff.activation_recovery_failed',
      actor: session.email,
      staffId,
      reason: describeError(caught),
    }));
    return NextResponse.json({ error: describeError(caught) }, { status: 409 });
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureLauremMailbox } from './laurem-messaging';
import { hashActivationToken } from './laurem-staff-auth';
import { sendLauremEmail } from './laurem-email';

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendLauremStaffActivation(client: SupabaseClient, staff: Record<string, any>, token: string, employmentConfirmed = true) {
  const mailbox = await ensureLauremMailbox(client, { id: staff.id, full_name: staff.full_name, job_title: staff.job_title });
  const address = `${mailbox.handle}@${mailbox.namespace}`;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
  const activationUrl = `${appUrl}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(staff.email)}`;

  const from = process.env.RESEND_FROM_EMAIL || 'CONAGS Care <onboarding@resend.dev>';
  const payload = {
    from,
    to: [staff.email],
    subject: 'Activate your CONAGS Care Personal Portal',
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><p style="color:#0f766e;font-weight:800">CONAGS CARE</p><h1>Your Personal Portal is ready</h1><p>Hello ${esc(staff.full_name)},</p><p>${employmentConfirmed ? 'Your employment has been confirmed by CONAGS Care. Your private staff portal is ready for activation.' : 'Your employment contract has been accepted by CONAGS Care. Your private Staff Portal account is now ready for activation while your onboarding continues.'}</p><p><strong>CONAGS ID:</strong> ${esc(staff.laurem_id || staff.employee_number)}<br><strong>CONAGS address:</strong> ${esc(address)}</p><p>Your Staff Portal provides access to your onboarding and staff documents. Final employment activation remains subject to completion of the CONAGS onboarding and hiring process where applicable.</p><p><a href="${activationUrl}" style="background:#0f766e;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:800">Activate portal</a></p><p>After activation, you will be taken to <strong>My Documents</strong> to review documents available to you online.</p></div>`,
    text: `Your CONAGS Care Staff Portal is ready. CONAGS ID: ${staff.laurem_id || staff.employee_number}. Address: ${address}. ${employmentConfirmed ? 'Your employment has been confirmed.' : 'Your employment contract has been accepted and your portal account is ready while onboarding continues.'} Activate: ${activationUrl}`,
  };

  if (!process.env.RESEND_API_KEY) {
    return { status: 'not_configured' as const, address, url: activationUrl, deliveryId: null };
  }

  const result = await sendLauremEmail(client, {
    eventType: 'staff.activation',
    entityId: staff.id,
    idempotencyKey: `staff.activation/${staff.id}/${hashActivationToken(token)}`,
    payload,
  });

  if (result.status === 'sent') return { status: 'sent' as const, address, url: activationUrl, error: null, deliveryId: result.deliveryId };
  if (result.status === 'not_configured') return { status: 'not_configured' as const, address, url: activationUrl, deliveryId: result.deliveryId };
  return { status: 'failed' as const, address, url: activationUrl, error: result.error, deliveryId: result.deliveryId };
}


export async function sendLauremStaffPasswordReset(client: SupabaseClient, staff: Record<string, any>, token: string) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
  const resetUrl = `${appUrl}/staff/password-reset?token=${encodeURIComponent(token)}`;
  const displayName = esc(staff.preferred_name || staff.full_name || 'Colleague');
  const from = process.env.RESEND_FROM_EMAIL || 'CONAGS Care <onboarding@resend.dev>';
  const payload = {
    from,
    to: [staff.email],
    reply_to: 'recruitment@conagscare.com',
    subject: 'Reset your CONAGS Care Staff Portal password',
    text: `Hello ${staff.preferred_name || staff.full_name},\n\nWe received a request to reset your CONAGS Care Staff Portal password. Use this secure link within 30 minutes:\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\nKind regards,\nCONAGS Care Staff Portal`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#173a31"><p style="color:#0f766e;font-weight:800;letter-spacing:1px">CONAGS CARE</p><h1>Reset your Staff Portal password</h1><p>Hello ${displayName},</p><p>We received a request to reset your CONAGS Care Staff Portal password.</p><p><a href="${resetUrl}" style="background:#0f766e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:800">Reset password</a></p><p>This secure link expires in <strong>30 minutes</strong> and can only be used once.</p><p>If you did not request this, you can ignore this email and your current password will remain unchanged.</p><p>Kind regards,<br>CONAGS Care Staff Portal</p></div>`,
  };
  const result = await sendLauremEmail(client, {
    eventType: 'staff.password_reset',
    entityId: staff.id,
    idempotencyKey: `staff.password_reset/${staff.id}/${hashActivationToken(token)}`,
    payload,
  });
  return result;
}

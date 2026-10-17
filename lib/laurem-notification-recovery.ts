import type { SupabaseClient } from '@supabase/supabase-js';
import { makeToken, hashToken } from '@/lib/token';
import { provisionLauremStaffPortal } from '@/lib/laurem-staff-provision';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';
import { selectRound2Questions } from '@/lib/laurem-interview-engine';
import { lauremCompany } from '@/lib/laurem-company-config';
import { sendLauremEmail } from '@/lib/laurem-email';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

export const RECOVERABLE_NOTIFICATION_EVENTS = ['contract_issued', 'staff.activation', 'second_interview_reissue'] as const;

export type RecoverableNotificationEvent = typeof RECOVERABLE_NOTIFICATION_EVENTS[number];

export function isRecoverableNotificationEvent(value: string): value is RecoverableNotificationEvent {
  return (RECOVERABLE_NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

function escapeHtml(value: string) {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/,'');
}

async function recoverContract(client: SupabaseClient, delivery: any, actor: string) {
  const { data: current, error } = await client.from('recruitment_contracts').select('id,application_id,job_title,contract_type,status,accepted_at').eq('id', delivery.entity_id).maybeSingle();
  if (error) throw error;
  if (!current) throw new Error('Contract record not found.');
  if (current.accepted_at || current.status === 'accepted') throw new Error('Accepted contracts cannot be reissued from notification recovery.');
  if (current.contract_type !== 'international_nurse' || current.job_title !== 'Registered Nurse') throw new Error('This contract type is not supported by notification recovery.');
  const { data: app, error: appError } = await client.from('recruitment_applications').select('id,full_name,email,role_applied,living_in_uk').eq('id', current.application_id).maybeSingle();
  if (appError || !app) throw appError || new Error('Contract application not found.');
  if (normalizeLauremRole(app.role_applied || '') !== 'Registered Nurse' || app.living_in_uk !== 'No') throw new Error('Contract application is not eligible for recovery.');
  const token = makeToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const issued = await client.rpc('laurem_issue_recruitment_contract_with_token', { p_contract_id: current.id, p_token_hash: hashToken(token), p_expires_at: expiresAt, p_actor: actor });
  if (issued.error || !issued.data?.contract) throw issued.error || new Error('Unable to reissue contract access.');
  const link = `${appUrl()}/contracts/accept/${token}`;
  const safeName = escapeHtml(app.full_name);
  const safeLink = escapeHtml(link);
  const email = await sendLauremEmail(client, {
    eventType: 'contract_issued',
    entityId: current.id,
    idempotencyKey: `contract:issued:${current.id}:${issued.data.contract.issued_at}`,
    payload: {
      from: lauremCompany.candidateCommunications.senderAddress,
      to: [app.email],
      reply_to: lauremCompany.candidateCommunications.replyToAddress,
      subject: `Your employment contract from ${lauremCompany.tradingName}`,
      text: `Dear ${app.full_name},\n\nYour international Registered Nurse employment contract is ready for review.\n\nReview and respond here:\n${link}\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">Your employment contract is ready</h1><p>Dear ${safeName},</p><p>Your international Registered Nurse employment contract is ready for review.</p><p><a href="${safeLink}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Review contract</a></p><p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`,
    },
  });
  return { email, entityId: current.id, applicationId: current.application_id };
}

async function recoverStaffActivation(client: SupabaseClient, delivery: any, actor: string) {
  const { data: staff, error } = await client.from('staff_profiles').select('id,application_id,employment_status,activated_at').eq('id', delivery.entity_id).maybeSingle();
  if (error || !staff) throw error || new Error('Staff record not found.');
  if (staff.activated_at) throw new Error('This staff portal is already activated.');
  if (staff.employment_status !== 'pending') throw new Error('Staff portal recovery requires a pending staff record.');
  const portal = await provisionLauremStaffPortal(staff.application_id, actor);
  if (portal.activation.status !== 'sent' && portal.activation.status !== 'not_configured') throw new Error(portal.activation.error || 'Staff activation email could not be recovered.');
  return { email: portal.activation, entityId: staff.id, applicationId: staff.application_id };
}

async function recoverSecondInterview(client: SupabaseClient, delivery: any, actor: string) {
  const { data: previous, error: previousError } = await client.from('recruitment_second_interviews').select('id,application_id,status').eq('id', delivery.entity_id).maybeSingle();
  if (previousError || !previous) throw previousError || new Error('Second-stage invitation not found.');
  const { data: app, error: appError } = await client.from('recruitment_applications').select('id,full_name,email,role_applied,living_in_uk').eq('id', previous.application_id).maybeSingle();
  if (appError || !app) throw appError || new Error('Application not found.');
  const role = normalizeLauremRole(app.role_applied || '');
  if (!role) throw new Error('Application role is invalid.');
  const { data: attempt, error: attemptError } = await client.from('interview_attempts').select('id,status').eq('application_id', app.id).eq('round',2).maybeSingle();
  if (attemptError) throw attemptError;
  if (attempt?.status === 'submitted') throw new Error('Completed second-stage assessments cannot be replayed.');
  await client.from('recruitment_second_interviews').update({ status: 'expired' }).eq('id', previous.id).eq('status', 'sent');
  const token = makeToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const created = await client.rpc('laurem_create_second_interview_invitation', { p_application_id: app.id, p_token_hash: hashToken(token), p_sent_by: actor, p_expires_at: expiresAt });
  if (created.error) throw created.error;
  const invitation = Array.isArray(created.data) ? created.data[0] : created.data;
  if (!invitation?.id) throw new Error('Unable to create replacement second-stage invitation.');
  const selected = selectRound2Questions(role);
  const snapshot = selected.map(q => ({ id:q.id, category:q.category, text:q.text, guidance:q.guidance }));
  const pathway = app.living_in_uk === 'No' ? 'international' : 'uk';
  if (attempt) {
    const { error: updateError } = await client.from('interview_attempts').update({ second_interview_id: invitation.id, role, pathway, question_ids: selected.map(q=>q.id), question_snapshot: snapshot, answers: {}, status: 'in_progress', started_at: new Date().toISOString(), submitted_at: null, score: null, total_questions: 20, updated_at: new Date().toISOString() }).eq('id', attempt.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await client.from('interview_attempts').insert({ application_id: app.id, second_interview_id: invitation.id, round: 2, role, pathway, question_ids: selected.map(q=>q.id), question_snapshot: snapshot, answers: {}, status: 'in_progress', total_questions: 20 });
    if (insertError) throw insertError;
  }
  const link = `${appUrl()}/second-interview/${token}`;
  const safeName = escapeHtml(app.full_name);
  const safeRole = escapeHtml(role);
  const safeLink = escapeHtml(link);
  const email = await sendLauremEmail(client, {
    eventType: 'second_interview_reissue',
    entityId: invitation.id,
    idempotencyKey: `second-interview:reissue:${invitation.id}`,
    payload: {
      from: lauremCompany.candidateCommunications.senderAddress,
      to: [app.email],
      reply_to: lauremCompany.candidateCommunications.replyToAddress,
      subject: `Your second-stage assessment with ${lauremCompany.tradingName}`,
      text: `Dear ${app.full_name},\n\nYour second-stage assessment for ${role} is ready.\n\nUse your private link:\n${link}\n\nThis link expires on ${new Date(expiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">Your second stage is ready</h1><p>Dear ${safeName},</p><p>Your practical and theory assessment for <strong>${safeRole}</strong> is ready.</p><p><a href="${safeLink}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Continue to second stage</a></p><p style="font-size:13px;color:#5c6c67">This private link expires on ${new Date(expiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.</p><p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`,
    },
  });
  return { email, entityId: invitation.id, applicationId: app.id };
}

export async function recoverLauremNotification(client: SupabaseClient, delivery: { id: string; event_type: string; entity_id: string | null }, actor: string) {
  if (!delivery.entity_id) throw new Error('This notification has no recoverable workflow entity.');
  if (!isRecoverableNotificationEvent(delivery.event_type)) throw new Error('This notification type does not support safe replay.');
  const result = delivery.event_type === 'contract_issued'
    ? await recoverContract(client, delivery, actor)
    : delivery.event_type === 'staff.activation'
      ? await recoverStaffActivation(client, delivery, actor)
      : await recoverSecondInterview(client, delivery, actor);
  await recordLauremAuditEvent({ lifecycleArea: 'notifications', entityType: 'notification_delivery', entityId: delivery.id, applicationId: result.applicationId, staffId: delivery.event_type === 'staff.activation' ? result.entityId : null, actorType: 'admin', actor, action: result.email.status === 'sent' || result.email.status === 'not_configured' ? 'notification_recovered' : 'notification_recovery_failed', reason: result.email.status === 'sent' ? 'Failed critical notification replayed through the event-aware recovery path.' : 'Notification recovery attempt completed without confirmed delivery.', metadata: { eventType: delivery.event_type, replacementEntityId: result.entityId, replacementDeliveryId: result.email.deliveryId, previousDeliveryId: delivery.id, outcome: result.email.status } });
  return result;
}

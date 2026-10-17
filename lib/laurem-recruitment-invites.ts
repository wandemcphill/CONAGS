import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { normalizeLauremRole, type LauremCanonicalRole } from '@/lib/laurem-role-policy';
import { lauremCompany } from '@/lib/laurem-company-config';
import { sendLauremEmail, type LauremEmailResult } from '@/lib/laurem-email';

export type LauremInviteInput = {
  candidateName: string;
  candidateEmail: string;
  role: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatExpiry(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

export async function createAndSendLauremInvite(
  input: LauremInviteInput,
  actor: string,
  client?: SupabaseClient,
): Promise<{
  invite: Record<string, unknown>;
  link: string;
  email: LauremEmailResult;
  role: LauremCanonicalRole;
}> {
  const supabase = client || db();
  const role = normalizeLauremRole(input.role);
  if (!role) throw new Error('Invalid CONAGS recruitment role.');

  const candidateName = input.candidateName.trim();
  const candidateEmail = input.candidateEmail.trim().toLowerCase();
  if (!candidateName || !candidateEmail) throw new Error('Candidate name and email are required.');

  const token = makeToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await supabase
    .from('recruitment_invites')
    .insert({
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      role,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    })
    .select('id,candidate_name,candidate_email,role,expires_at')
    .single();

  if (error || !invite) throw new Error(error?.message || 'Unable to create invitation.');

  const link = `${appUrl()}/apply/${token}`;
  const safeName = escapeHtml(candidateName);
  const safeRole = escapeHtml(role);
  const safeLink = escapeHtml(link);
  const expiryLabel = formatExpiry(expiresAt);

  console.info(JSON.stringify({
    level: 'info',
    event: 'admin.invite.created',
    actor,
    inviteId: invite.id,
    candidateEmail,
    role,
    expiresAt,
  }));

  const email = await sendLauremEmail(supabase, {
    eventType: 'recruitment_invitation',
    entityId: invite.id,
    idempotencyKey: `recruitment-invite:${invite.id}`,
    payload: {
      from: lauremCompany.candidateCommunications.senderAddress,
      to: [candidateEmail],
      reply_to: lauremCompany.candidateCommunications.replyToAddress,
      subject: `Your ${lauremCompany.tradingName} recruitment invitation`,
      text: `Dear ${candidateName},\n\nYou have been invited to continue your recruitment process with ${lauremCompany.tradingName} for the ${role} position.\n\nUse your private recruitment link:\n${link}\n\nThis invitation expires on ${expiryLabel}. Do not forward the private link.\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">Your recruitment invitation</h1><p>Dear ${safeName},</p><p>You have been invited to continue your recruitment process with ${escapeHtml(lauremCompany.tradingName)} for the <strong>${safeRole}</strong> position.</p><p>Your recruitment application is private and can only be accessed through your invitation link:</p><p><a href="${safeLink}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Open your recruitment application</a></p><p style="font-size:13px;color:#5c6c67">Invitation expiry: ${expiryLabel}. Please do not forward this private link.</p><p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`,
    },
  });

  return { invite, link, email, role };
}

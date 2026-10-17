import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';

export const metadata = { robots: { index: false, follow: false } };

export default async function NurseInterviewPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token?.trim() || '';
  if (!token) notFound();

  const client = db();
  const { data: invite, error: inviteError } = await client
    .from('recruitment_invites')
    .select('id,expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (inviteError || !invite) notFound();
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) notFound();

  redirect(`/interview/${token}`);
}

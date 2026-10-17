import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession, requestIp } from '@/lib/laurem-staff-auth';
import { ensureLauremMailbox, findLauremStaffByAddress, getOrCreateConversation, getOrCreateAdminConversation, participantConversationIds, getLauremMessageTarget, LAUREM_MESSAGE_TEAM_TARGETS } from '@/lib/laurem-messaging';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { readLauremIdempotencyKey } from '@/lib/laurem-message-idempotency';

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: me } = await client.from('laurem_staff_profiles').select('id,full_name,job_title,employment_status').eq('id', session.staff_id).maybeSingle();
  if (!me || !['pending', 'active'].includes(me.employment_status)) return NextResponse.json({ error: 'Messaging unavailable.' }, { status: 403 });

  const mailbox = await ensureLauremMailbox(client, me);
  const ids = await participantConversationIds(client, session.staff_id);
  const base = {
    mailbox: { ...mailbox, address: `${mailbox.handle}@${mailbox.namespace}` },
    messageTargets: LAUREM_MESSAGE_TEAM_TARGETS,
  };

  if (!ids.length) return NextResponse.json({ ...base, conversations: [] });

  const { data: conversations } = await client.from('laurem_staff_message_conversations')
    .select('id,updated_at,last_message_at,inbox_team')
    .in('id', ids)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  const out: any[] = [];
  for (const conversation of conversations || []) {
    const { data: participants } = await client.from('laurem_staff_message_participants').select('staff_id,last_read_at').eq('conversation_id', conversation.id);
    const otherId = (participants || []).map((p: any) => p.staff_id).find((id: string) => id !== session.staff_id);
    const [{ data: other }, { data: latest }] = await Promise.all([
      otherId ? client.from('laurem_staff_profiles').select('id,full_name,laurem_id,employee_number,job_title').eq('id', otherId).maybeSingle() : Promise.resolve({ data: null }),
      client.from('laurem_staff_messages').select('id,body,sender_staff_id,sender_admin_email,created_at').eq('conversation_id', conversation.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const { data: otherMailbox } = otherId ? await client.from('laurem_staff_internal_mailboxes').select('handle,namespace').eq('staff_id', otherId).maybeSingle() : { data: null };
    const ownParticipant = (participants || []).find((p: any) => p.staff_id === session.staff_id);
    const isAdminThread = (participants || []).length === 1;

    out.push({
      ...conversation,
      other: other
        ? { ...other, address: otherMailbox ? `${otherMailbox.handle}@${otherMailbox.namespace}` : null }
        : (() => {
            const target = getLauremMessageTarget(conversation.inbox_team);
            return {
              display: target?.label || 'CONAGS Admin',
              address: target ? `__laurem_${target.key}__` : '__laurem_admin__',
              team: target?.key || 'admin',
              description: target?.description || 'CONAGS staff support',
            };
          })(),
      isAdminThread,
      latest,
      unread: Boolean(latest && latest.sender_staff_id !== session.staff_id && (!ownParticipant?.last_read_at || new Date(latest.created_at).getTime() > new Date(ownParticipant.last_read_at).getTime())),
    });
  }
  return NextResponse.json({ ...base, conversations: out });
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const requestedTeam = typeof body?.team === 'string' ? body.team.trim().toLowerCase() : '';
  const legacyTeamMap: Record<string, 'admin' | 'management' | 'recruitment'> = {
    __laurem_admin__: 'admin',
    __laurem_management__: 'management',
    __laurem_recruitment__: 'recruitment',
  };
  const team = (getLauremMessageTarget(requestedTeam)?.key || legacyTeamMap[to] || null) as 'admin' | 'management' | 'recruitment' | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if ((!team && !to) || !message || message.length > 10000) return NextResponse.json({ error: 'Choose a CONAGS team and enter a message.' }, { status: 400 });
  const idempotencyKey = readLauremIdempotencyKey(req);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key header is required.' }, { status: 400 });

  const client = db();
  const { data: me } = await client.from('laurem_staff_profiles').select('id,full_name,job_title,employment_status').eq('id', session.staff_id).maybeSingle();
  if (!me || !['pending', 'active'].includes(me.employment_status)) return NextResponse.json({ error: 'Messaging unavailable.' }, { status: 403 });

  const ip = requestIp(req) || 'unknown';
  const bucket = `staff-message:${session.staff_id}:${ip}`;
  const { data: limiter, error: limiterError } = await client.rpc('laurem_consume_staff_auth_attempt', { p_bucket_key: bucket, p_max_attempts: 60, p_window_seconds: 3600, p_lock_seconds: 300 });
  if (limiterError) return NextResponse.json({ error: 'Unable to process message.' }, { status: 503 });
  if (!limiter?.allowed) return NextResponse.json({ error: 'Messaging rate limit reached. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retry_after || 300) } });

  let conversation;
  let recipientStaffId: string | null = null;
  if (team) {
    conversation = await getOrCreateAdminConversation(client, session.staff_id, team);
  } else {
    const recipient = await findLauremStaffByAddress(client, to);
    if (!recipient || recipient.id === session.staff_id) return NextResponse.json({ error: 'Unable to start a conversation with that CONAGS address.' }, { status: 404 });
    if (!['pending', 'active'].includes(recipient.employment_status)) return NextResponse.json({ error: 'That staff member is not available for messaging.' }, { status: 403 });
    recipientStaffId = recipient.id;
    conversation = await getOrCreateConversation(client, session.staff_id, recipient.id);
  }

  const { data: duplicate } = await client.from('laurem_staff_messages')
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at')
    .eq('sender_staff_id', session.staff_id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (duplicate) {
    if (duplicate.conversation_id !== conversation.id || duplicate.body !== message) {
      return NextResponse.json({ error: 'This Idempotency-Key was already used for a different message.' }, { status: 409 });
    }
    return NextResponse.json({ conversation, message: duplicate }, { status: 200 });
  }

  const { data: created, error } = await client.from('laurem_staff_messages')
    .insert({ conversation_id: conversation.id, sender_staff_id: session.staff_id, body: message, idempotency_key: idempotencyKey })
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await client.from('laurem_staff_messages')
        .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key')
        .eq('sender_staff_id', session.staff_id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (retry) {
        if (retry.conversation_id !== conversation.id || retry.body !== message) {
          return NextResponse.json({ error: 'This Idempotency-Key was already used for a different message.' }, { status: 409 });
        }
        return NextResponse.json({ conversation, message: retry }, { status: 200 });
      }
    }
    return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  }
  if (!created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });

  await client.from('laurem_staff_message_conversations').update({ last_message_at: created.created_at, updated_at: created.created_at }).eq('id', conversation.id);
  await client.from('laurem_staff_security_events').insert({ staff_id: session.staff_id, event_type: 'staff.message.sent', actor: session.email, ip_address: ip, user_agent: req.headers.get('user-agent'), details: { conversation_id: conversation.id, recipient_staff_id: recipientStaffId, inbox_team: team } });

  await recordLauremAuditEvent({
    lifecycleArea: 'messaging', entityType: 'staff_message', entityId: created.id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'message_sent',
    metadata: { conversationId: conversation.id, recipientStaffId, inboxTeam: team },
  });

  if (recipientStaffId) {
    await createLauremStaffNotification(client, {
      staffId: recipientStaffId,
      category: 'message',
      title: `New message from ${me.full_name}`,
      body: message.length > 80 ? `${message.slice(0, 80)}…` : message,
      actionUrl: '/staff/messages',
    });
  }

  return NextResponse.json({ conversation, message: created }, { status: 201 });
}

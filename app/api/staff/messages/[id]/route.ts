import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession, requestIp } from '@/lib/laurem-staff-auth';
import { participantConversationIds } from '@/lib/laurem-messaging';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { readLauremIdempotencyKey } from '@/lib/laurem-message-idempotency';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const ids = await participantConversationIds(client, session.staff_id);
  if (!ids.includes(id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const [{ data: messages }, { data: participants }] = await Promise.all([
    client.from('laurem_staff_messages').select('id,sender_staff_id,sender_admin_email,body,created_at').eq('conversation_id', id).is('deleted_at', null).order('created_at', { ascending: true }),
    client.from('laurem_staff_message_participants').select('staff_id').eq('conversation_id', id),
  ]);

  const otherId = (participants || []).map((p: any) => p.staff_id).find((staffId: string) => staffId !== session.staff_id);
  const [{ data: other }, { data: otherMailbox }] = await Promise.all([
    otherId ? client.from('laurem_staff_profiles').select('id,full_name,laurem_id,employee_number,job_title').eq('id', otherId).maybeSingle() : Promise.resolve({ data: null }),
    otherId ? client.from('laurem_staff_internal_mailboxes').select('handle,namespace').eq('staff_id', otherId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  await client.from('laurem_staff_message_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('staff_id', session.staff_id);

  return NextResponse.json({
    conversation: {
      id,
      other: other ? { ...other, address: otherMailbox ? `${otherMailbox.handle}@${otherMailbox.namespace}` : null } : { display: 'CONAGS Admin / HR', address: '__laurem_admin__' },
      isAdminThread: !otherId,
    },
    messages: messages || [],
  });
}

export async function POST(req: NextRequest, context: Context) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 10000) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  const idempotencyKey = readLauremIdempotencyKey(req);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key header is required.' }, { status: 400 });

  const client = db();
  const { data: me } = await client.from('laurem_staff_profiles').select('id,full_name,job_title,employment_status').eq('id', session.staff_id).maybeSingle();
  if (!me || !['pending', 'active'].includes(me.employment_status)) return NextResponse.json({ error: 'Messaging unavailable.' }, { status: 403 });

  const ids = await participantConversationIds(client, session.staff_id);
  if (!ids.includes(id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const ip = requestIp(req) || 'unknown';
  const bucket = `staff-message:${session.staff_id}:${ip}`;
  const { data: limiter, error: limiterError } = await client.rpc('laurem_consume_staff_auth_attempt', { p_bucket_key: bucket, p_max_attempts: 60, p_window_seconds: 3600, p_lock_seconds: 300 });
  if (limiterError) return NextResponse.json({ error: 'Unable to process message.' }, { status: 503 });
  if (!limiter?.allowed) return NextResponse.json({ error: 'Messaging rate limit reached. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retry_after || 300) } });

  const { data: duplicate } = await client.from('laurem_staff_messages')
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key')
    .eq('sender_staff_id', session.staff_id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (duplicate) {
    if (duplicate.conversation_id !== id || duplicate.body !== message) {
      return NextResponse.json({ error: 'This Idempotency-Key was already used for a different message.' }, { status: 409 });
    }
    return NextResponse.json({ message: duplicate }, { status: 200 });
  }

  const { data: created, error } = await client.from('laurem_staff_messages').insert({ conversation_id: id, sender_staff_id: session.staff_id, body: message, idempotency_key: idempotencyKey })
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key').single();
  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await client.from('laurem_staff_messages')
        .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key')
        .eq('sender_staff_id', session.staff_id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (retry) {
        if (retry.conversation_id !== id || retry.body !== message) {
          return NextResponse.json({ error: 'This Idempotency-Key was already used for a different message.' }, { status: 409 });
        }
        return NextResponse.json({ message: retry }, { status: 200 });
      }
    }
    return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  }
  if (!created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });

  await client.from('laurem_staff_message_conversations').update({ last_message_at: created.created_at, updated_at: created.created_at }).eq('id', id);

  await recordLauremAuditEvent({
    lifecycleArea: 'messaging', entityType: 'staff_message', entityId: created.id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'message_sent',
    metadata: { conversationId: id },
  });

  const { data: participants } = await client.from('laurem_staff_message_participants').select('staff_id').eq('conversation_id', id);
  const recipientStaffId = (participants || []).map((p: any) => p.staff_id).find((staffId: string) => staffId !== session.staff_id);

  if (recipientStaffId) {
    await createLauremStaffNotification(client, {
      staffId: recipientStaffId,
      category: 'message',
      title: `New message from ${me.full_name}`,
      body: message.length > 80 ? `${message.slice(0, 80)}…` : message,
      actionUrl: '/staff/messages',
    });
  }

  return NextResponse.json({ message: created }, { status: 201 });
}

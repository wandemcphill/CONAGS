import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { readLauremIdempotencyKey } from '@/lib/laurem-message-idempotency';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const session = readAdminSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const [{ data: conversation, error: conversationError }, { data: messages, error: messageError }, { data: participants }] = await Promise.all([
    client.from('laurem_staff_message_conversations').select('id,inbox_team').eq('id', id).maybeSingle(),
    client.from('laurem_staff_messages').select('id,sender_staff_id,sender_admin_email,body,created_at').eq('conversation_id', id).is('deleted_at', null).order('created_at', { ascending: true }),
    client.from('laurem_staff_message_participants').select('staff_id').eq('conversation_id', id),
  ]);
  if (conversationError || messageError) return NextResponse.json({ error: 'Unable to load conversation.' }, { status: 500 });
  const ids = (participants || []).map((participant: any) => participant.staff_id);
  if (!ids.length) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const [{ data: staff }, { data: mailboxes }] = await Promise.all([
    client.from('laurem_staff_profiles').select('id,full_name,laurem_id,employee_number,job_title,employment_status').in('id', ids),
    client.from('laurem_staff_internal_mailboxes').select('staff_id,handle,namespace').in('staff_id', ids),
  ]);

  const adminReadAt = new Date().toISOString();
  await client.from('laurem_staff_message_conversations').update({ admin_last_read_at: adminReadAt }).eq('id', id);

  const participantProfiles = (staff || []).map((person: any) => {
    const mailbox = (mailboxes || []).find((item: any) => item.staff_id === person.id);
    return { ...person, address: mailbox ? `${mailbox.handle}@${mailbox.namespace}` : null };
  });

  return NextResponse.json({ conversation: { id, inbox_team: conversation?.inbox_team || 'admin', participants: participantProfiles }, messages: messages || [] });
}

export async function POST(req: NextRequest, context: Context) {
  const session = readAdminSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 10000) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  const idempotencyKey = readLauremIdempotencyKey(req);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key header is required.' }, { status: 400 });

  const client = db();
  const { data: participant } = await client.from('laurem_staff_message_participants')
    .select('staff_id')
    .eq('conversation_id', id)
    .limit(1)
    .maybeSingle();
  if (!participant) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: duplicate } = await client.from('laurem_staff_messages')
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key')
    .eq('sender_admin_email', session.email)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (duplicate) {
    if (duplicate.conversation_id !== id || duplicate.body !== message) {
      return NextResponse.json({ error: 'This Idempotency-Key was already used for a different message.' }, { status: 409 });
    }
    return NextResponse.json({ message: duplicate }, { status: 200 });
  }

  const { data: created, error } = await client.from('laurem_staff_messages').insert({
    conversation_id: id,
    sender_admin_email: session.email,
    body: message,
    idempotency_key: idempotencyKey,
  }).select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key').single();

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await client.from('laurem_staff_messages')
        .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,idempotency_key')
        .eq('sender_admin_email', session.email)
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

  await client.from('laurem_staff_message_conversations').update({
    last_message_at: created.created_at,
    updated_at: created.created_at,
    admin_last_read_at: created.created_at,
  }).eq('id', id);

  await recordLauremAuditEvent({
    lifecycleArea: 'messaging',
    entityType: 'staff_message',
    entityId: created.id,
    staffId: participant.staff_id,
    actorType: 'admin',
    actor: session.email,
    action: 'admin_message_sent',
    metadata: { conversationId: id, recipientStaffId: participant.staff_id },
  });

  await createLauremStaffNotification(client, {
    staffId: participant.staff_id,
    category: 'message',
    title: 'New CONAGS message',
    body: `CONAGS Admin / HR sent you a new message: ${message.length > 60 ? `${message.slice(0, 60)}…` : message}`,
    actionUrl: '/staff/messages',
  });

  return NextResponse.json({ message: created }, { status: 201 });
}

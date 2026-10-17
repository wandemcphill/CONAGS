import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { getLauremMessageTarget } from '@/lib/laurem-messaging';

export async function GET(req: NextRequest) {
  const session = readAdminSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: conversations, error } = await client.from('laurem_staff_message_conversations')
    .select('id,created_at,updated_at,last_message_at,admin_last_read_at,inbox_team')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: 'Unable to load message centre.' }, { status: 500 });

  const output: any[] = [];
  for (const conversation of conversations || []) {
    const { data: participants } = await client.from('laurem_staff_message_participants')
      .select('staff_id')
      .eq('conversation_id', conversation.id);
    const ids = (participants || []).map((p: any) => p.staff_id);
    const [{ data: staff }, { data: mailboxes }, { data: latest }] = await Promise.all([
      ids.length ? client.from('laurem_staff_profiles').select('id,full_name,laurem_id,employee_number,job_title,employment_status').in('id', ids) : Promise.resolve({ data: [] }),
      ids.length ? client.from('laurem_staff_internal_mailboxes').select('staff_id,handle,namespace').in('staff_id', ids) : Promise.resolve({ data: [] }),
      client.from('laurem_staff_messages').select('id,body,sender_staff_id,sender_admin_email,created_at').eq('conversation_id', conversation.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const unreadByAdmin = Boolean(
      latest &&
      latest.sender_staff_id &&
      !latest.sender_admin_email &&
      (!conversation.admin_last_read_at || new Date(latest.created_at).getTime() > new Date(conversation.admin_last_read_at).getTime())
    );

    output.push({
      ...conversation,
      team: ids.length === 1 ? getLauremMessageTarget(conversation.inbox_team) : null,
      participants: (staff || []).map((person: any) => {
        const mailbox = (mailboxes || []).find((item: any) => item.staff_id === person.id);
        return { ...person, address: mailbox ? `${mailbox.handle}@${mailbox.namespace}` : null };
      }),
      latest,
      unreadByAdmin,
    });
  }

  return NextResponse.json({
    conversations: output,
    unreadCount: output.filter((conversation) => conversation.unreadByAdmin).length,
  });
}

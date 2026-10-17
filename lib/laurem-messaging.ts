import type { SupabaseClient } from '@supabase/supabase-js';

export const LAUREM_MESSAGE_NAMESPACES = ['conagscare', 'conagsnurse', 'conagsstaff'] as const;

export const LAUREM_MESSAGE_TEAM_TARGETS = [
  { key: 'admin', label: 'CONAGS Admin', description: 'HR, portal access, policies and general staff support.' },
  { key: 'management', label: 'Management', description: 'Assignments, shifts, workplace matters and operational support.' },
  { key: 'recruitment', label: 'Recruitment', description: 'Recruitment, onboarding, contracts and hiring questions.' },
] as const;

export type LauremMessageTeam = (typeof LAUREM_MESSAGE_TEAM_TARGETS)[number]['key'];

export function getLauremMessageTarget(value: string | null | undefined) {
  return LAUREM_MESSAGE_TEAM_TARGETS.find((target) => target.key === value) || null;
}

export function namespaceForRole(role: string | null | undefined) {
  const value = (role || '').toLowerCase();
  if (value.includes('nurse')) return 'conagsnurse';
  if (value.includes('care') || value.includes('support') || value.includes('assistant')) return 'conagscare';
  return 'conagsstaff';
}

export function handleBase(name: string) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim()
    .split(/\s+/).join('.')
    .replace(/[^a-z0-9.]/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
  return base || 'staff';
}

export async function ensureLauremMailbox(client: SupabaseClient, staff: { id: string; full_name: string; job_title?: string | null }) {
  const existing = await client.from('laurem_staff_internal_mailboxes')
    .select('id,staff_id,handle,namespace,enabled')
    .eq('staff_id', staff.id).maybeSingle();
  if (existing.data) return existing.data;

  const namespace = namespaceForRole(staff.job_title);
  const base = handleBase(staff.full_name);
  for (let i = 1; i <= 100; i += 1) {
    const handle = i === 1 ? base : `${base}${i}`;
    const clash = await client.from('laurem_staff_internal_mailboxes').select('id').eq('handle', handle).eq('namespace', namespace).maybeSingle();
    if (clash.data) continue;
    const { data, error } = await client.from('laurem_staff_internal_mailboxes')
      .insert({ staff_id: staff.id, handle, namespace })
      .select('id,staff_id,handle,namespace,enabled').single();
    if (!error && data) {
      await client.from('laurem_staff_profiles').update({
        portal_handle: handle,
        department_namespace: namespace,
        portal_address: `${handle}@${namespace}`,
        updated_at: new Date().toISOString(),
      }).eq('id', staff.id);
      return data;
    }
  }
  throw new Error('Unable to allocate CONAGS internal address.');
}

export async function findLauremStaffByAddress(client: SupabaseClient, address: string) {
  const value = address.trim().toLowerCase().replace(/\s+/g, '');
  const at = value.lastIndexOf('@');
  if (at <= 0) return null;
  const handle = value.slice(0, at);
  const namespace = value.slice(at + 1);
  if (!LAUREM_MESSAGE_NAMESPACES.includes(namespace as (typeof LAUREM_MESSAGE_NAMESPACES)[number])) return null;
  const { data: mailbox, error } = await client.from('laurem_staff_internal_mailboxes')
    .select('staff_id,handle,namespace,enabled')
    .eq('handle', handle).eq('namespace', namespace).eq('enabled', true).maybeSingle();
  if (error || !mailbox) return null;
  const { data: staff } = await client.from('laurem_staff_profiles')
    .select('id,laurem_id,employee_number,full_name,email,job_title,employment_status')
    .eq('id', mailbox.staff_id).maybeSingle();
  if (!staff || !['pending', 'active'].includes(staff.employment_status)) return null;
  return { ...staff, mailbox };
}

export function directKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

export async function getOrCreateConversation(client: SupabaseClient, a: string, b: string) {
  const key = directKey(a, b);
  const existing = await client.from('laurem_staff_message_conversations')
    .select('id,direct_key,inbox_team,created_at,updated_at,last_message_at').eq('direct_key', key).maybeSingle();
  if (existing.data) return existing.data;

  const { data: conversation, error } = await client.from('laurem_staff_message_conversations')
    .insert({ direct_key: key, created_by_staff_id: a })
    .select('id,direct_key,created_at,updated_at,last_message_at').single();
  if (error || !conversation) {
    const retry = await client.from('laurem_staff_message_conversations')
      .select('id,direct_key,inbox_team,created_at,updated_at,last_message_at').eq('direct_key', key).maybeSingle();
    if (retry.data) return retry.data;
    throw error || new Error('Unable to create conversation.');
  }
  const { error: participantError } = await client.from('laurem_staff_message_participants').insert([
    { conversation_id: conversation.id, staff_id: a },
    { conversation_id: conversation.id, staff_id: b },
  ]);
  if (participantError) throw participantError;
  return conversation;
}

export async function getOrCreateAdminConversation(client: SupabaseClient, staffId: string, team: LauremMessageTeam = 'admin') {
  const key = `${team}:${staffId}`;
  const existing = await client.from('laurem_staff_message_conversations')
    .select('id,direct_key,inbox_team,created_at,updated_at,last_message_at').eq('direct_key', key).maybeSingle();
  if (existing.data) return existing.data;

  const { data: conversation, error } = await client.from('laurem_staff_message_conversations')
    .insert({ direct_key: key, created_by_staff_id: null, inbox_team: team })
    .select('id,direct_key,inbox_team,created_at,updated_at,last_message_at').single();
  if (error || !conversation) {
    const retry = await client.from('laurem_staff_message_conversations')
      .select('id,direct_key,inbox_team,created_at,updated_at,last_message_at').eq('direct_key', key).maybeSingle();
    if (retry.data) return retry.data;
    throw error || new Error('Unable to create CONAGS admin conversation.');
  }

  const { error: participantError } = await client.from('laurem_staff_message_participants')
    .insert({ conversation_id: conversation.id, staff_id: staffId });
  if (participantError) throw participantError;
  return conversation;
}

export async function participantConversationIds(client: SupabaseClient, staffId: string) {
  const { data, error } = await client.from('laurem_staff_message_participants').select('conversation_id').eq('staff_id', staffId);
  if (error) throw error;
  return (data || []).map((row) => row.conversation_id);
}


export async function getStaffConversationSummaries(client: SupabaseClient, staffId: string, limit = 6) {
  const conversationIds = await participantConversationIds(client, staffId);
  if (!conversationIds.length) return [];

  const { data: conversations, error: conversationError } = await client
    .from('laurem_staff_message_conversations')
    .select('id,updated_at,last_message_at,inbox_team')
    .in('id', conversationIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (conversationError) throw conversationError;

  const ids = (conversations || []).map((row) => row.id);
  if (!ids.length) return [];

  const [{ data: messages, error: messageError }, { data: participants, error: participantError }] = await Promise.all([
    client.from('laurem_staff_messages')
      .select('conversation_id,body,sender_staff_id,sender_admin_email,created_at')
      .in('conversation_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit * 12),
    client.from('laurem_staff_message_participants')
      .select('conversation_id,staff_id,last_read_at')
      .in('conversation_id', ids),
  ]);
  if (messageError) throw messageError;
  if (participantError) throw participantError;

  const otherIds = [...new Set((participants || [])
    .map((row: any) => row.staff_id)
    .filter((id: string | null) => id && id !== staffId))];

  const { data: otherStaff, error: otherStaffError } = otherIds.length
    ? await client.from('laurem_staff_profiles')
      .select('id,full_name,job_title')
      .in('id', otherIds)
    : { data: [], error: null };
  if (otherStaffError) throw otherStaffError;

  const latestByConversation = new Map<string, any>();
  for (const message of messages || []) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  const staffById = new Map((otherStaff || []).map((row: any) => [row.id, row]));
  const participantsByConversation = new Map<string, any[]>();
  for (const participant of participants || []) {
    const list = participantsByConversation.get(participant.conversation_id) || [];
    list.push(participant);
    participantsByConversation.set(participant.conversation_id, list);
  }

  return (conversations || []).map((conversation: any) => {
    const latest = latestByConversation.get(conversation.id) || null;
    const rows = participantsByConversation.get(conversation.id) || [];
    const own = rows.find((row: any) => row.staff_id === staffId);
    const otherId = rows.map((row: any) => row.staff_id).find((id: string) => id !== staffId) || null;
    const other = otherId ? staffById.get(otherId) : null;
    const unread = Boolean(
      latest &&
      latest.sender_staff_id !== staffId &&
      (!own?.last_read_at || new Date(latest.created_at).getTime() > new Date(own.last_read_at).getTime())
    );

    return {
      ...conversation,
      other: other
        ? { name: other.full_name, jobTitle: other.job_title }
        : {
            name: getLauremMessageTarget(conversation.inbox_team)?.label || 'CONAGS Admin',
            jobTitle: getLauremMessageTarget(conversation.inbox_team)?.description || 'CONAGS staff support',
            team: conversation.inbox_team || 'admin',
          },
      latest,
      unread,
    };
  });
}


export async function getOrCreateVisaHelpConversation(client: SupabaseClient, staffId: string, caseId: string) {
  const key = `visa-help:${caseId}`;
  const existing = await client.from('laurem_staff_message_conversations')
    .select('id,direct_key,created_at,updated_at,last_message_at')
    .eq('direct_key', key).maybeSingle();
  if (existing.data) return existing.data;

  const { data: conversation, error } = await client.from('laurem_staff_message_conversations')
    .insert({ direct_key: key, created_by_staff_id: staffId })
    .select('id,direct_key,created_at,updated_at,last_message_at').single();
  if (error || !conversation) {
    const retry = await client.from('laurem_staff_message_conversations')
      .select('id,direct_key,created_at,updated_at,last_message_at')
      .eq('direct_key', key).maybeSingle();
    if (retry.data) return retry.data;
    throw error || new Error('Unable to create Visa Help conversation.');
  }

  const { error: participantError } = await client.from('laurem_staff_message_participants')
    .insert({ conversation_id: conversation.id, staff_id: staffId });
  if (participantError) throw participantError;
  return conversation;
}

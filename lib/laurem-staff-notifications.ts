import type { SupabaseClient } from '@supabase/supabase-js';

export type LauremStaffNotificationInput = {
  staffId: string;
  category: string;
  title: string;
  body: string;
  actionUrl?: string | null;
};

export async function createLauremStaffNotification(
  client: SupabaseClient,
  input: LauremStaffNotificationInput,
) {
  const { data, error } = await client
    .from('laurem_staff_notifications')
    .insert({
      staff_id: input.staffId,
      category: input.category,
      title: input.title,
      body: input.body,
      action_url: input.actionUrl || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'staff_notification.create_failed',
      staff_id: input.staffId,
      category: input.category,
      reason: error.message,
    }));
    return null;
  }

  return data;
}

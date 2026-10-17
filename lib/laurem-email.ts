import type { SupabaseClient } from '@supabase/supabase-js';

export type LauremEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
};

export type LauremEmailResult =
  | { status: 'sent'; providerId: string | null; attempts: number; deliveryId: string }
  | { status: 'failed'; providerId: string | null; attempts: number; deliveryId: string; error: string }
  | { status: 'not_configured'; providerId: null; attempts: 0; deliveryId: string };

function normaliseRecipients(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function backoff(attempt: number) {
  return Math.min(4000, 250 * 2 ** Math.max(0, attempt - 1));
}

export async function sendLauremEmail(
  client: SupabaseClient,
  input: {
    eventType: string;
    entityId: string;
    idempotencyKey: string;
    payload: LauremEmailPayload;
  },
): Promise<LauremEmailResult> {
  const to = normaliseRecipients(input.payload.to);
  const recipientKey = to.join(',');

  const { data: existing, error: existingError } = await client
    .from('notification_deliveries')
    .select('id,status,provider_id,attempt_count,last_error')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.status === 'sent') {
    return { status: 'sent', providerId: existing.provider_id, attempts: existing.attempt_count, deliveryId: existing.id };
  }

  const { data: delivery, error: deliveryError } = await client
    .from('notification_deliveries')
    .upsert({
      event_type: input.eventType,
      entity_id: input.entityId,
      recipient_key: recipientKey,
      idempotency_key: input.idempotencyKey,
      channel: 'email',
      status: existing?.status === 'failed' ? 'retrying' : 'pending',
      attempt_count: existing?.attempt_count || 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'idempotency_key' })
    .select('id,attempt_count')
    .single();
  if (deliveryError || !delivery) throw deliveryError || new Error('Unable to create notification delivery record.');

  if (!process.env.RESEND_API_KEY) {
    await client.from('notification_deliveries').update({ status: 'not_configured', updated_at: new Date().toISOString() }).eq('id', delivery.id);
    return { status: 'not_configured', providerId: null, attempts: 0, deliveryId: delivery.id };
  }

  let lastError = 'Unable to send email.';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const attemptNumber = Number(delivery.attempt_count || 0) + attempt;
    await client.from('notification_deliveries').update({ status: 'sending', attempt_count: attemptNumber, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', delivery.id);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({ ...input.payload, to }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        const providerId = typeof result?.id === 'string' ? result.id : null;
        await client.from('notification_deliveries').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', delivery.id);
        return { status: 'sent', providerId, attempts: attemptNumber, deliveryId: delivery.id };
      }
      lastError = typeof result?.message === 'string' ? result.message : `Resend rejected the email (${response.status}).`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unable to reach email provider.';
    }

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, backoff(attempt)));
  }

  await client.from('notification_deliveries').update({ status: 'failed', last_error: lastError, updated_at: new Date().toISOString() }).eq('id', delivery.id);
  return { status: 'failed', providerId: null, attempts: Number(delivery.attempt_count || 0) + 3, deliveryId: delivery.id, error: lastError };
}

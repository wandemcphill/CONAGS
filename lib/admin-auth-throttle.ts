import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminAuthThrottleResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  failedAttempts: number;
};

function throttleDigest(value: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('ADMIN_SESSION_SECRET must be configured.');
  return createHash('sha256').update(`${secret}:admin-auth:${value}`).digest('hex');
}

export async function consumeAdminAuthAttempt(
  client: SupabaseClient,
  requestIdentity: string,
  success = false,
): Promise<AdminAuthThrottleResult> {
  const { data, error } = await client.rpc('laurem_consume_admin_auth_attempt', {
    p_throttle_key: throttleDigest(requestIdentity),
    p_success: success,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    retryAfterSeconds: Number(row?.retry_after_seconds || 0),
    failedAttempts: Number(row?.failed_attempts || 0),
  };
}

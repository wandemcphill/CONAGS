import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isRecoverableNotificationEvent } from '@/lib/laurem-notification-recovery';

describe('Mega-Build 20 notification recovery', () => {
  it('limits replay to event types with safe replacement-token paths', () => {
    expect(isRecoverableNotificationEvent('contract_issued')).toBe(true);
    expect(isRecoverableNotificationEvent('staff.activation')).toBe(true);
    expect(isRecoverableNotificationEvent('second_interview_reissue')).toBe(true);
    expect(isRecoverableNotificationEvent('application_status_change')).toBe(false);
  });

  it('does not expose notification payloads or idempotency secrets in the admin listing', () => {
    const route = readFileSync('app/api/admin/notifications/route.ts', 'utf8');
    expect(route).toContain("select('id,event_type,entity_id,channel,status,attempt_count,provider_id,last_error,last_attempt_at,sent_at,created_at,updated_at')");
    expect(route).not.toContain('recipient_key,idempotency_key');
    expect(route).toContain("body?.action !== 'retry'");
  });

  it('records notification recovery through the canonical audit path', () => {
    const source = readFileSync('lib/laurem-notification-recovery.ts', 'utf8');
    expect(source).toContain('recordLauremAuditEvent');
    expect(source).toContain("notification_recovered");
    expect(source).toContain('replacementDeliveryId');
    expect(source).not.toContain('rawToken');
  });
});

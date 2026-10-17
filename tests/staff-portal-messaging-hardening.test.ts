import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readLauremIdempotencyKey } from '@/lib/laurem-message-idempotency';

const root = process.cwd();
const migration = readFileSync(resolve(root, 'supabase/migrations/20260925133000_staff_message_idempotency.sql'), 'utf8');
const staffNewRoute = readFileSync(resolve(root, 'app/api/staff/messages/route.ts'), 'utf8');
const staffReplyRoute = readFileSync(resolve(root, 'app/api/staff/messages/[id]/route.ts'), 'utf8');
const adminReplyRoute = readFileSync(resolve(root, 'app/api/admin/messages/[id]/route.ts'), 'utf8');

describe('staff messaging idempotency hardening', () => {
  it('accepts bounded safe idempotency keys and rejects invalid keys', () => {
    const request = new Request('https://example.test', { headers: { 'Idempotency-Key': '9e0f7d4c-9a7c-4d6c-8e6f-123456789abc' } });
    expect(readLauremIdempotencyKey(request)).toBe('9e0f7d4c-9a7c-4d6c-8e6f-123456789abc');
    expect(readLauremIdempotencyKey(new Request('https://example.test'))).toBeNull();
    expect(readLauremIdempotencyKey(new Request('https://example.test', { headers: { 'Idempotency-Key': 'bad key' } }))).toBeNull();
    expect(readLauremIdempotencyKey(new Request('https://example.test', { headers: { 'Idempotency-Key': 'x'.repeat(129) } }))).toBeNull();
  });

  it('adds a database uniqueness boundary for staff and admin senders', () => {
    expect(migration).toContain('add column if not exists idempotency_key text');
    expect(migration).toContain('staff_messages_staff_idempotency_idx');
    expect(migration).toContain('staff_messages_admin_idempotency_idx');
    expect(migration).toContain('lower(sender_admin_email)');
  });

  it('requires the idempotency key and persists it on every message send route', () => {
    for (const source of [staffNewRoute, staffReplyRoute, adminReplyRoute]) {
      expect(source).toContain("readLauremIdempotencyKey(req)");
      expect(source).toContain("idempotency_key: idempotencyKey");
      expect(source).toContain(".eq('idempotency_key', idempotencyKey)");
      expect(source).toContain("error.code === '23505'");
    }
  });
});

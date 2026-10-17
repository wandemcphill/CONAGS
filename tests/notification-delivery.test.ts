import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260910_notification_delivery.sql'), 'utf8');

describe('notification delivery persistence contract', () => {
  it('uses an idempotency key and tracks delivery lifecycle', () => {
    expect(migration).toContain('idempotency_key text not null unique');
    expect(migration).toContain("status text not null default 'pending'");
    expect(migration).toContain('attempt_count integer not null default 0');
  });

  it('stores provider results without storing email bodies', () => {
    expect(migration).toContain('provider_id text');
    expect(migration).toContain('last_error text');
    expect(migration).not.toContain('html text');
    expect(migration).not.toContain('payload jsonb');
  });
});

describe('email delivery retry semantics', () => {
  it('uses the same idempotency key for all retry attempts', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/laurem-email.ts'), 'utf8');
    expect(source).toContain("'Idempotency-Key': input.idempotencyKey");
    expect((source.match(/for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/g) || []).length).toBe(1);
  });

  it('does not treat a previously sent delivery as sendable work', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/laurem-email.ts'), 'utf8');
    expect(source).toContain("if (existing?.status === 'sent')");
  });
});

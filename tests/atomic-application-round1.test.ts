import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS atomic application submission', () => {
  it('keeps application creation and round-one assessment inside one RPC', () => {
    const route = readFileSync('app/api/applications/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260919_atomic_application_round1.sql', 'utf8');

    expect(route).toContain("rpc('laurem_create_application_with_round1'");
    expect(route).not.toContain(".from('interview_attempts').insert");
    expect(route).not.toContain(".from('recruitment_applications').update({ status:'Interview'");
    expect(migration).toContain('laurem_create_recruitment_application');
    expect(migration).toContain('laurem_transition_application_status');
    expect(migration).toContain('round = 1');
    expect(migration).toContain('for update');
    expect(migration).toContain('grant execute on function public.laurem_create_application_with_round1');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS application submission lifecycle', () => {
  it('allows the atomic submission RPC to advance a newly-created application to Interview', () => {
    const migration = readFileSync(
      'supabase/migrations/20260923_allow_application_to_interview.sql',
      'utf8',
    );

    // The canonical transition rule explicitly includes Interview in the allowed
    // destinations from the newly-created Application status.
    expect(migration).toContain(
      "app_row.status='Application' and p_to_status in('Screening','Interview','Rejected','Withdrawn')",
    );
    expect(migration).toContain('laurem_recruitment_status_history');
  });
});

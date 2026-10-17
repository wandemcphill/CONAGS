import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS final placement contract workflow', () => {
  it('stores assignment-specific terms separately from the original recruitment contract', () => {
    const migration = readFileSync('supabase/migrations/20261003183000_staff_final_assignment_contract.sql','utf8');
    const api = readFileSync('app/api/admin/workforce/staff/[staffId]/placement/route.ts','utf8');
    expect(migration).toContain('create table if not exists public.laurem_staff_placement_terms');
    expect(migration).toContain('contract_document_id uuid references public.laurem_staff_documents(id)');
    expect(migration).toContain('alter table public.laurem_staff_placement_terms enable row level security');
    expect(migration).toContain('revoke all on public.laurem_staff_placement_terms from anon,authenticated');
    expect(api).toContain("from('laurem_staff_placement_terms')");
    expect(api).toContain(".eq('category','contract')");
    expect(api).toContain("category: 'contract'");
  });

  it('requires concrete placement terms before issue', () => {
    const api = readFileSync('app/api/admin/workforce/staff/[staffId]/placement/route.ts','utf8');
    expect(api).toContain('principalWorkLocation');
    expect(api).toContain('hourlyRate');
    expect(api).toContain('weeklyHours');
    expect(api).toContain('effectiveFrom');
    expect(api).toContain("requires_signature: true");
  });

  it('makes the issued final contract visible through the existing staff document centre', () => {
    const api = readFileSync('app/api/admin/workforce/staff/[staffId]/placement/route.ts','utf8');
    expect(api).toContain("title: 'Final Assignment Contract'");
    expect(api).toContain("status: 'issued'");
    expect(api).toContain("actionUrl:'/staff/documents/' + document.id");
    expect(api).toContain("source_type: 'contract'");
  });

  it('does not overwrite the original accepted contract', () => {
    const renderer = readFileSync('lib/laurem-final-assignment-contract.ts','utf8');
    expect(renderer).toContain('does not erase');
    expect(renderer).toContain('original employment agreement');
  });
});

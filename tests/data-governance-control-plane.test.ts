import { describe, expect, it } from 'vitest';

describe('CONAGS data governance control plane', () => {
  it('defines explicit ownership, recoverable findings and controlled requests', async () => {
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile('supabase/migrations/20260920245000_data_governance_control_plane.sql', 'utf8');
    const fix = await fs.readFile('supabase/migrations/20260920245500_data_governance_scan_fix.sql', 'utf8');
    const route = await fs.readFile('app/api/admin/data-governance/route.ts', 'utf8');
    const page = await fs.readFile('app/admin/data-governance/page.tsx', 'utf8');
    const docs = await fs.readFile('docs/DATA-GOVERNANCE.md', 'utf8');

    expect(sql).toContain('laurem_data_governance_policies');
    expect(sql).toContain('owner_role');
    expect(sql).toContain('retention_days');
    expect(sql).toContain('laurem_data_governance_findings');
    expect(sql).toContain('laurem_data_access_requests');
    expect(sql).toContain('laurem_data_governance_scan');
    expect(fix).toContain('p.conversation_id is null');

    expect(route).toContain('readAdminSession');
    expect(route).toContain('laurem_data_governance_scan');
    expect(route).toContain('metadataManifest');
    expect(route).toContain('deletion_review');
    expect(route).toContain('laurem_record_audit_event');

    expect(page).toContain('Data Governance Center');
    expect(page).toContain('Destructive deletion is never automatic.');
    expect(page).toContain('New metadata export request');
    expect(page).toContain('New deletion review request');
    expect(docs).toContain('Recruitment Operations');
    expect(docs).toContain('laurem-private-documents');
    expect(docs).toContain('metadata-only');
    expect(docs).toContain('No automatic destructive deletion');
  });

  it('keeps metadata exports intentionally content-free', async () => {
    const fs = await import('node:fs/promises');
    const route = await fs.readFile('app/api/admin/data-governance/route.ts', 'utf8');
    expect(route).toContain("scope: 'metadata-only'");
    expect(route).not.toContain('content_text');
    expect(route).not.toContain('signedUrl');
    expect(route).not.toContain('storage_path');
  });
});

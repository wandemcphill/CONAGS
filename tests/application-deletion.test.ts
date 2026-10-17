import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiRoute = readFileSync(resolve(process.cwd(), 'app/api/admin/applications/route.ts'), 'utf8');
const candidatePage = readFileSync(resolve(process.cwd(), 'app/admin/applications/[id]/page.tsx'), 'utf8');

describe('admin application deletion', () => {
  it('provides an admin-only DELETE endpoint with explicit confirmation', () => {
    expect(apiRoute).toContain('export async function DELETE');
    expect(apiRoute).toContain('readAdminSession(request)');
    expect(apiRoute).toContain("body.confirmation!=='DELETE APPLICATION'");
    expect(apiRoute).toContain("client.from('recruitment_applications').delete().eq('id',id)");
  });

  it('protects active workforce records from permanent deletion', () => {
    expect(apiRoute).toContain("client.from('staff_profiles').select('id,employment_status').eq('application_id',id).maybeSingle()");
    expect(apiRoute).toContain("['active','on_leave','suspended'].includes(String(staff.employment_status||'').toLowerCase())");
    expect(apiRoute).toContain('cannot be permanently deleted');
  });

  it('requires a deliberate recruiter confirmation in the UI', () => {
    expect(candidatePage).toContain('Delete application');
    expect(candidatePage).toContain('DELETE APPLICATION');
    expect(candidatePage).toContain("method: 'DELETE'");
    expect(candidatePage).toContain('Permanent deletion will remove');
  });
});

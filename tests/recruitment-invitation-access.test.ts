import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('CONAGS invitation-only recruitment access', () => {
  it('does not expose the nursing interview from the public homepage', () => {
    expect(read('app/page.tsx')).not.toContain('href="/nurse-interview"');
  });

  it('protects the legacy nursing interview route by validating the private invite before redirecting to universal assessment', () => {
    const page = read('app/nurse-interview/page.tsx');
    expect(page).toContain("if (!token) notFound();");
    expect(page).toContain("eq('token_hash', hashToken(token))");
    expect(page).toContain('if (inviteError || !invite) notFound();');
    expect(page).toContain('if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) notFound();');
    expect(page).toContain('redirect(`/interview/${token}`);');
  });

  it('keeps vacancy pages informational instead of sending candidates to admin', () => {
    expect(read('app/jobs/[id]/page.tsx')).not.toContain('/admin?inviteRole=');
    expect(read('app/jobs/[id]/page.tsx')).toContain('Applications are by invitation only');
  });

  it('provides the admin invitation action and sends the private application URL by email', () => {
    const admin = read('app/admin/page.tsx');
    const route = read('app/api/admin/invites/route.ts');
    const service = read('lib/laurem-recruitment-invites.ts');
    expect(admin).toContain('Create and email invitation');
    expect(admin).toContain('Candidate name');
    expect(admin).toContain('Candidate email');
    expect(admin).toContain('Role');
    expect(route).toContain('createAndSendLauremInvite');
    expect(service).toContain('sendLauremEmail');
    expect(service).toContain('recruitment-invite:${invite.id}');
    expect(service).toContain('/apply/${token}');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

describe('CONAGS staff portal hardening', () => {
  it('marks every staff API response private and non-cacheable', () => {
    const middleware = readFileSync('middleware.ts', 'utf8');
    expect(middleware).toContain("request.nextUrl.pathname.startsWith('/api/staff/')");
    expect(middleware).toContain("Cache-Control");
    expect(middleware).toContain("private, no-store, max-age=0");
  });

  it('requires a real CONAGS assignment for manual timesheets', () => {
    const route = readFileSync('app/api/staff/timesheets/route.ts', 'utf8');
    const page = readFileSync('app/staff/timesheets/page.tsx', 'utf8');
    expect(route).toContain("A valid CONAGS assignment is required for every staff timesheet.");
    expect(route).toContain('validateAssignedTimesheet(assignment');
    expect(page).toContain('Select a CONAGS assignment');
    expect(page).toContain('assignmentId');
    expect(page).toContain('workDate');
    expect(page).toContain('clockIn');
    expect(page).toContain('clockOut');
  });

  it('adds account-level throttling to staff login attempts', () => {
    const route = readFileSync('app/api/staff/auth/login/route.ts', 'utf8');
    expect(route).toContain('staff-login-account:');
    expect(route).toContain('p_max_attempts: 20');
    expect(route).toContain('p_lock_seconds: 900');
  });

  it('does not allow staff to backdate availability', () => {
    const route = readFileSync('app/api/staff/availability/route.ts', 'utf8');
    expect(route).toContain('effectiveFrom < today');
    expect(route).toContain('cannot be backdated');
  });

  it('keeps approved leave cancellation out of reviewer fields and blocks cancellation once started', () => {
    const route = readFileSync('app/api/staff/leave/route.ts', 'utf8');
    expect(route).toContain("current.status === 'approved' && current.start_date <= today");
    expect(route).toContain("status: 'cancelled'");
    expect(route).not.toContain('reviewed_by: session.staff_id');
    expect(route).not.toContain('reviewed_at: now');
  });

  it('minimizes recruitment data returned to the staff visa workspace', () => {
    const route = readFileSync('app/api/staff/visa-sponsorship/route.ts', 'utf8');
    expect(route).toContain("select('id,full_name,email,phone,date_of_birth,nationality,country_of_residence,address,role_applied,start_date,living_in_uk,current_country,work_permission,requires_sponsorship')");
    expect(route).not.toContain('qualifications,training,professional_experience,employment_history');
    expect(route).not.toContain('supporting_documents,application_data');
  });

  it('checks image magic bytes before storing staff photographs', () => {
    const route = readFileSync('app/api/staff/me/route.ts', 'utf8');
    expect(route).toContain('hasValidImageSignature');
    expect(route).toContain('file.slice(0, 12)');
    expect(route).toContain('The uploaded file is not a valid JPG, PNG or WebP image.');
  });
});



describe('CONAGS staff portal follow-up hardening', () => {
  it('keeps DBS/PVG outside the staff lifecycle gate', () => {
    const migration = readFileSync(
      'supabase/migrations/20260930170000_dbs_pvg_nonblocking_staff_activation.sql',
      'utf8',
    );
    const readiness = readFileSync('lib/laurem-onboarding-readiness.ts', 'utf8');
    const lifecycle = readFileSync(
      'supabase/migrations/20260929120000_staff_lifecycle_document_gate_hardening.sql',
      'utf8',
    );

    expect(migration).toContain('DBS/PVG is a workforce compliance item, not a staff portal lifecycle gate');
    expect(migration).toContain("in ('dbs', 'dbs_pvg', 'dbs_pvg_verified', 'dbs_pvg_check', 'dbs_pvg_check_verified')");
    expect(readiness).not.toContain("'dbs_pvg_verified'");
    expect(lifecycle).toContain('public.laurem_is_staff_lifecycle_readiness_key(item_key)');
    expect(lifecycle).not.toContain("when 'dbs' then 'dbs_pvg_verified'");
  });

  it('does not let staff self-service mark DBS/PVG as CONAGS-verified', () => {
    const route = readFileSync('app/api/staff/compliance/route.ts', 'utf8');
    const page = readFileSync('app/staff/compliance/page.tsx', 'utf8');
    expect(route).toContain("const allowed=['missing','expiring_soon','expired','pending',''];");
    expect(route).toContain("Verified compliance details can only be changed by CONAGS.");
    expect(page).toContain('<option value="current" disabled>Current (CONAGS verified)</option>');
    expect(page).toContain('<option value="under_review" disabled>Under review (CONAGS verified)</option>');
    expect(page).toContain('This is your self-reported record');
    expect(page).toContain('Current');
    expect(page).toContain("const verified= status==='current'||status==='under_review';");
    expect(page).toContain('disabled={verified}');
    expect(page).toContain('busy||verified');
  });

  it('retires the legacy recruitment-document download route', () => {
    expect(existsSync('app/api/staff/documents/download/route.ts')).toBe(false);
  });

  it('does not let staff overwrite a reviewed rota request', () => {
    const route = readFileSync('app/api/staff/rota/route.ts', 'utf8');
    expect(route).toContain("select('id,status')");
    expect(route).toContain("ex.data.status!=='requested'");
    expect(route).toContain('This effective date has already been reviewed by CONAGS.');
    const page = readFileSync('app/staff/availability/page.tsx', 'utf8');
    expect(page).toContain('const reviewedCurrent=Boolean(current&&current.status!==\'requested\');');
    expect(page).toContain('Create new rota request');
    expect(page).toContain('min={localDate()}');
  });
});

describe('CONAGS activation recovery regression coverage', () => {
  it('documents the atomic hire RPC repair so it cannot reintroduce stale staff-id and composite assignment bugs', () => {
    const migration = readFileSync(
      'supabase/migrations/20260930183000_fix_atomic_hire_portal_provisioning.sql',
      'utf8',
    );
    expect(migration).toContain('staff_row.id,');
    expect(migration).toContain('select *');
    expect(migration).toContain('into transitioned');
    expect(migration).toContain('from public.laurem_transition_application_status(');
    expect(migration).not.toContain('p_staff_id,');
    expect(migration).toContain('application_status_before');
  });

  it('keeps DBS/PVG visible as a follow-up without making it a blocking compliance status', () => {
    const source = readFileSync('lib/laurem-hr-workforce.ts', 'utf8');
    const page = readFileSync('app/admin/workforce/[staffId]/page.tsx', 'utf8');
    expect(source).toContain('complianceFollowUps');
    expect(source).toContain('DBS/PVG: ${dbs.detail}');
    expect(source).not.toContain('if (dbs.statusCategory !== \'Current\') attentionItems.push');
    expect(source).toContain('const categories = [rtw.statusCategory');
    expect(page).toContain('Non-blocking compliance follow-up:');
    expect(page).toContain('do not block contract issuance, Hired status, portal provisioning, or staff activation');
  });

  it('surfaces structured Supabase activation errors instead of hiding them behind a generic message', () => {
    const route = readFileSync('app/api/admin/workforce/staff/account/route.ts', 'utf8');
    expect(route).toContain('function describeError(value: unknown)');
    expect(route).toContain('candidate.message');
    expect(route).toContain('return NextResponse.json({ error: describeError(caught) }');
  });
});

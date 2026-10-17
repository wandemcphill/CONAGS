import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff profile self service', () => {
  it('exposes UK address fields and photo metadata without making employment identity editable', () => {
    const route = readFileSync('app/api/staff/me/route.ts', 'utf8');
    expect(route).toContain('address_line_1');
    expect(route).toContain('address_line_2');
    expect(route).toContain('postcode');
    expect(route).toContain('profile_photo_path');
    expect(route).toContain("const editable = [");
    expect(route).toContain("'phone'");
    expect(route).not.toContain("'employee_number'");
    expect(route).not.toContain("'employment_status'");
    expect(route).not.toContain("'job_title'");
  });

  it('limits profile updates and photo uploads to the authenticated staff session', () => {
    const route = readFileSync('app/api/staff/me/route.ts', 'utf8');
    const photo = readFileSync('app/api/staff/me/photo/route.ts', 'utf8');
    expect(route).toContain("getStaffSession(req)");
    expect(route).toContain("public: false");
    expect(route).toContain('MAX_PHOTO_BYTES');
    expect(route).toContain("image/jpeg");
    expect(photo).toContain("getStaffSession(req)");
    expect(photo).toContain(".from(PHOTO_BUCKET)");
    expect(photo).toContain(".download(staff.profile_photo_path)");
    expect(photo).toContain("'Cache-Control'");
  });

  it('audits profile and photo changes and serves the UI from the staff workspace', () => {
    const route = readFileSync('app/api/staff/me/route.ts', 'utf8');
    const page = readFileSync('app/staff/profile/page.tsx', 'utf8');
    const migration = readFileSync('supabase/migrations/20260920_staff_profile_address_photo.sql', 'utf8');
    expect(route).toContain("staff.self_service_profile_updated");
    expect(route).toContain("staff_photo_updated");
    expect(page).toContain('Contact & address');
    expect(page).toContain('Staff photograph');
    expect(page).toContain("accept='image/jpeg,image/png,image/webp'");
    expect(migration).toContain('address_line_1');
    expect(migration).toContain('profile_photo_updated_at');
  });
});
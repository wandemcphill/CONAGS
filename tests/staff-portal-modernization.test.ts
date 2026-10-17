import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source=(path:string)=>readFileSync(path,'utf8');

describe('CONAGS modern staff portal foundation',()=>{
  it('uses a shared authenticated staff shell with responsive navigation',()=>{
    const shell=source('components/StaffShell.tsx');
    const layout=source('app/staff/layout.tsx');
    const css=source('app/globals.css');
    expect(layout).toContain("StaffShell");
    expect(shell).toContain('/staff/shifts');
    expect(shell).toContain('/staff/timesheets');
    expect(shell).toContain('/staff/messages');
    expect(shell).toContain('/staff/documents');
    expect(shell).toContain('/staff/profile');
    expect(shell).toContain('staff-bottom-nav');
    expect(css).toContain('.staff-sidebar');
    expect(css).toContain('.staff-bottom-nav');
    expect(css).toContain('@media (max-width: 900px)');
  });

  it('does not wrap public staff authentication routes in the authenticated navigation',()=>{
    const shell=source('components/StaffShell.tsx');
    expect(shell).toContain("'/staff/login'");
    expect(shell).toContain("'/staff/activate'");
    expect(shell).toContain("'/staff/password-reset'");
    expect(shell).toContain('return <>{children}</>;');
  });

  it('provides route-level loading and recovery states',()=>{
    const loading=source('app/staff/loading.tsx');
    const error=source('app/staff/error.tsx');
    const home=source('app/staff/page.tsx');
    const dashboard=source('components/StaffHomeDashboard.tsx');
    expect(loading).toContain('Loading staff workspace');
    expect(loading).toContain('staff-skeleton');
    expect(error).toContain('Try again');
    expect(error).toContain('Staff home');
    expect(home).toContain('StaffHomeDashboard');
    expect(dashboard).toContain('MY DAY');
    expect(dashboard).toContain('What needs your attention');
    expect(dashboard).toContain('Open attendance');
  });

  it('provides keyboard focus and skip navigation for the staff shell',()=>{
    const shell=source('components/StaffShell.tsx');
    const css=source('app/globals.css');
    expect(shell).toContain('Skip to content');
    expect(shell).toContain('id="staff-main-content"');
    expect(css).toContain('.staff-skip-link:focus');
    expect(css).toContain(':focus-visible');
  });

  it('modernizes the core workforce screens without changing their API contracts',()=>{
    const attendance=source('app/staff/attendance/page.tsx');
    const shifts=source('app/staff/shifts/page.tsx');
    const timesheets=source('app/staff/timesheets/page.tsx');
    expect(attendance).toContain('/api/staff/attendance');
    expect(attendance).toContain('Clock in');
    expect(attendance).toContain('Clock out');
    expect(shifts).toContain('/api/staff/shifts');
    expect(shifts).toContain('Next shift');
    expect(shifts).toContain('Open attendance');
    expect(timesheets).toContain('/api/staff/timesheets');
    expect(timesheets).toContain('My Timesheets');
    expect(timesheets).toContain('Edit & resubmit');
    expect(timesheets).toContain('Approved or paid records are locked.');
    for(const file of [attendance,shifts,timesheets]) expect(file).toContain('staff-page--workforce');
  });

  it('modernizes staff communication without changing private API contracts',()=>{
    const messages=source('app/staff/messages/page.tsx');
    const notifications=source('app/staff/notifications/page.tsx');
    expect(messages).toContain('/api/staff/messages');
    expect(messages).toContain('Message a CONAGS team');
    expect(messages).toContain('Send message');
    expect(messages).toContain('staff-message-stream');
    expect(notifications).toContain('/api/staff/notifications');
    expect(notifications).toContain('Mark all as read');
    expect(notifications).toContain('Unread');
    expect(notifications).toContain('staff-notification-list');
  });

});

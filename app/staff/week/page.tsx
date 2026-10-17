'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  StaffAction,
  StaffBadge,
  StaffLoading,
  StaffMetric,
  StaffNotice,
  StaffPage,
  StaffPageHeader,
  StaffPageInner,
  StaffPanel,
  StaffSectionHeader,
} from '@/components/StaffPortalUI';

type Shift = {
  id: string;
  client_name: string | null;
  location: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  notes: string | null;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  status: string;
  review_note: string | null;
};

type PayrollCurrent = {
  status: string | null;
  approvedHours: number | null;
  hourlyRate: number | null;
  grossAmount: number | null;
  period: {
    period_start?: string | null;
    period_end?: string | null;
    pay_date?: string | null;
    status?: string | null;
  } | null;
} | null;

type WeekData = {
  staff: { full_name: string | null; job_title: string | null; location: string | null };
  shifts: Shift[];
  leave: LeaveRequest[];
  payroll?: { current: PayrollCurrent };
  summary: {
    upcomingShifts: number;
    rejectedTimesheets: number;
    pendingLeave: number;
    unreadMessages: number;
    unreadNotifications: number;
    signaturePending: number;
    approvedHours: number;
    profileCompleteness: number;
    onboardingProgress: number;
  };
  readiness?: { score: number; status: string; label?: string; reasons?: string[] };
  visaSupport?: { available: boolean; label: string | null; cosStatus?: { label: string } };
};

const TZ = 'Europe/London';

function londonDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(typeof value === 'string' ? new Date(value) : value);
}

function addDays(key: string, days: number) {
  const date = new Date(key + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monday(key: string) {
  const date = new Date(key + 'T12:00:00Z');
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function weekKeys(anchor: string) {
  const start = monday(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function dateLabel(key: string) {
  return new Date(key + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  });
}

function shortDate(key: string) {
  return new Date(key + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  });
}

function time(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function duration(start: string, end: string) {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
}

function statusTone(value: string) {
  if (value === 'confirmed' || value === 'approved' || value === 'active' || value === 'completed') return 'live' as const;
  if (value === 'rejected' || value === 'cancelled' || value === 'declined') return 'danger' as const;
  return 'attention' as const;
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return 'Not set';
  return '£' + Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StaffWeekPage() {
  const router = useRouter();
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const today = londonDate(new Date());
  const [anchor, setAnchor] = useState(today);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const response = await fetch('/api/staff/workforce-dashboard', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/staff/login');
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load your week.');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your week.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, [router]);

  const keys = useMemo(() => weekKeys(anchor), [anchor]);
  const shiftByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of data?.shifts || []) {
      const key = londonDate(shift.scheduled_start);
      const current = map.get(key) || [];
      current.push(shift);
      map.set(key, current);
    }
    return map;
  }, [data?.shifts]);

  const leaveByDay = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    for (const request of data?.leave || []) {
      for (const key of keys) {
        if (request.start_date <= key && request.end_date >= key) {
          const current = map.get(key) || [];
          current.push(request);
          map.set(key, current);
        }
      }
    }
    return map;
  }, [data?.leave, keys]);

  const weekShifts = useMemo(() => keys.flatMap((key) => shiftByDay.get(key) || []), [keys, shiftByDay]);
  const weekHours = useMemo(
    () => weekShifts.reduce((total, shift) => total + (new Date(shift.scheduled_end).getTime() - new Date(shift.scheduled_start).getTime()) / 3600000, 0),
    [weekShifts]
  );
  const todayShifts = shiftByDay.get(today) || [];
  const todayLeave = leaveByDay.get(today) || [];

  if (loading) return <StaffLoading label="Loading your weekly workspace…"/>;

  return <StaffPage className="staff-page--week"><StaffPageInner>
    <StaffPageHeader
      eyebrow="Workforce workspace"
      title="My Week"
      subtitle={data?.staff?.full_name ? data.staff.full_name + ' · ' + (data.staff.job_title || 'CONAGS staff') : 'Your shifts, leave, hours and follow-up actions in one place.'}
      actions={<><StaffAction href="/staff/shifts">Full shift calendar</StaffAction><StaffAction onClick={() => void load(false)} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</StaffAction></>}
    />

    {error && <StaffNotice tone="danger"><strong>Weekly workspace unavailable</strong><p>{error}</p><StaffAction onClick={() => void load(false)}>Try again</StaffAction></StaffNotice>}

    <div className="staff-week-toolbar">
      <div>
        <p className="staff-eyebrow">Current week</p>
        <strong>{shortDate(keys[0])} to {shortDate(keys[6])}</strong>
      </div>
      <div className="staff-week-controls">
        <StaffAction onClick={() => setAnchor(addDays(monday(anchor), -7))}>Previous week</StaffAction>
        <StaffAction onClick={() => setAnchor(today)}>This week</StaffAction>
        <StaffAction onClick={() => setAnchor(addDays(monday(anchor), 7))}>Next week</StaffAction>
      </div>
    </div>

    <div className="staff-stat-grid">
      <StaffMetric label="Shifts this week" value={weekShifts.length}/>
      <StaffMetric label="Scheduled hours" value={Math.round(weekHours * 10) / 10}/>
      <StaffMetric label="Leave days" value={new Set((data?.leave || []).filter((request) => request.start_date <= keys[6] && request.end_date >= keys[0]).flatMap((request) => [request.id])).size}/>
      <StaffMetric label="Approved hours" value={data?.summary.approvedHours || 0}/>
    </div>

    <div className="staff-week-grid">
      <StaffPanel className="staff-week-focus">
        <StaffSectionHeader title="Today" copy={dateLabel(today)}/>
        {todayLeave.length > 0 && <div className="staff-week-focus-item"><StaffBadge tone="attention">Leave</StaffBadge><div><strong>{titleCase(todayLeave[0].leave_type)}</strong><span>{todayLeave[0].status}</span></div><StaffAction href="/staff/leave">View leave</StaffAction></div>}
        {todayShifts.length === 0 && todayLeave.length === 0 && <div className="staff-empty">No shift or leave event is scheduled for today.</div>}
        {todayShifts.map((shift) => <div className="staff-week-focus-item" key={shift.id}><StaffBadge tone={statusTone(shift.status)}>{titleCase(shift.status)}</StaffBadge><div><strong>{shift.client_name || 'CONAGS Assignment'}</strong><span>{time(shift.scheduled_start)} to {time(shift.scheduled_end)} · {duration(shift.scheduled_start, shift.scheduled_end)}</span><small>{shift.location || 'Location to be confirmed'}</small></div><StaffAction href="/staff/attendance" primary>Attendance</StaffAction></div>)}
      </StaffPanel>

      <StaffPanel className="staff-week-actions">
        <StaffSectionHeader title="Action centre" copy="Items that may need your attention before the week gets away."/>
        <div className="staff-week-action-list">
          {data?.summary.rejectedTimesheets ? <a href="/staff/timesheets"><strong>{data.summary.rejectedTimesheets}</strong><span>Rejected timesheet{data.summary.rejectedTimesheets === 1 ? '' : 's'} to review</span></a> : null}
          {data?.summary.signaturePending ? <a href="/staff/documents"><strong>{data.summary.signaturePending}</strong><span>Document{data.summary.signaturePending === 1 ? '' : 's'} awaiting signature</span></a> : null}
          {data?.summary.pendingLeave ? <a href="/staff/leave"><strong>{data.summary.pendingLeave}</strong><span>Leave request{data.summary.pendingLeave === 1 ? '' : 's'} still pending</span></a> : null}
          {data?.summary.unreadMessages ? <a href="/staff/messages"><strong>{data.summary.unreadMessages}</strong><span>Unread message{data.summary.unreadMessages === 1 ? '' : 's'}</span></a> : null}
          {data?.summary.unreadNotifications ? <a href="/staff/notifications"><strong>{data.summary.unreadNotifications}</strong><span>Unread notification{data.summary.unreadNotifications === 1 ? '' : 's'}</span></a> : null}
          {!data?.summary.rejectedTimesheets && !data?.summary.signaturePending && !data?.summary.pendingLeave && !data?.summary.unreadMessages && !data?.summary.unreadNotifications && <div className="staff-week-clear"><strong>All caught up</strong><span>No open staff-portal follow-up items were returned by the workspace.</span></div>}
        </div>
      </StaffPanel>
    </div>

    <StaffPanel>
      <StaffSectionHeader title="Your week at a glance" copy="A single operational view of scheduled work and approved or pending leave."/>
      <div className="staff-week-days">
        {keys.map((key) => {
          const shifts = shiftByDay.get(key) || [];
          const leave = leaveByDay.get(key) || [];
          const isToday = key === today;
          return <article key={key} className={'staff-week-day' + (isToday ? ' is-today' : '')}>
            <header><div><span>{new Date(key + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: TZ })}</span><strong>{new Date(key + 'T12:00:00Z').getUTCDate()}</strong></div><StaffBadge tone={shifts.length || leave.length ? 'attention' : 'neutral'}>{shifts.length + leave.length} event{shifts.length + leave.length === 1 ? '' : 's'}</StaffBadge></header>
            {leave.map((request) => <a key={'leave-' + request.id} className="staff-week-event is-leave" href="/staff/leave"><StaffBadge tone="attention">Leave</StaffBadge><div><strong>{titleCase(request.leave_type)}</strong><span>{request.status}</span></div></a>)}
            {shifts.map((shift) => <a key={shift.id} className="staff-week-event" href="/staff/attendance"><StaffBadge tone={statusTone(shift.status)}>{time(shift.scheduled_start)}</StaffBadge><div><strong>{shift.client_name || 'CONAGS Assignment'}</strong><span>{time(shift.scheduled_end)} · {shift.location || 'Location pending'}</span></div></a>)}
            {!shifts.length && !leave.length && <div className="staff-week-free">Open</div>}
          </article>;
        })}
      </div>
    </StaffPanel>

    <div className="staff-week-grid">
      <StaffPanel>
        <StaffSectionHeader title="Pay pulse" copy="The latest payroll record currently visible to you."/>
        {!data?.payroll?.current ? <div className="staff-empty">No payroll entry is currently available.</div> : <div className="staff-week-pay">
          <div><span>Status</span><strong>{titleCase(data.payroll.current.status || 'Unknown')}</strong></div>
          <div><span>Approved hours</span><strong>{data.payroll.current.approvedHours ?? 'Not set'}</strong></div>
          <div><span>Rate</span><strong>{money(data.payroll.current.hourlyRate)}</strong></div>
          <div><span>Gross</span><strong>{money(data.payroll.current.grossAmount)}</strong></div>
        </div>}
        <div className="staff-form-actions"><StaffAction href="/staff/timesheets">Review hours</StaffAction><StaffAction href="/staff/payroll">Open payroll</StaffAction></div>
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Readiness & records" copy="Quick links into the parts of your portal that protect a clean workforce record."/>
        <div className="staff-week-links">
          <a href="/staff/documents"><span>Documents</span><strong>{data?.summary.signaturePending || 0} pending</strong></a>
          <a href="/staff/onboarding"><span>Onboarding</span><strong>{data?.summary.onboardingProgress || 0}% complete</strong></a>
          <a href="/staff/profile"><span>Profile</span><strong>{data?.summary.profileCompleteness || 0}% complete</strong></a>
          <a href="/staff/compliance"><span>DBS & PVG</span><strong>View status</strong></a>
          {data?.visaSupport?.available && <a href="/staff/visa-sponsorship"><span>Visa & COS</span><strong>{data.visaSupport.cosStatus?.label || data.visaSupport.label || 'Open'}</strong></a>}
        </div>
      </StaffPanel>
    </div>
  </StaffPageInner></StaffPage>;
}

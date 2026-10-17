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

type RequestState = 'action' | 'review' | 'complete' | 'closed' | 'neutral';

type CaseItem = {
  id: string;
  title: string;
  eyebrow: string;
  detail: string;
  status: string;
  state: RequestState;
  updatedAt: string | null;
  href: string;
  action: string;
  meta?: string;
};

type RequestCentreResponse = {
  leave: any[];
  rota: { current: any | null };
  compliance: { current: any[] };
  sponsorship: {
    case: any | null;
    cosStatus: { key: string; label: string; canDownload: boolean };
  };
  visaHelp: {
    case: any | null;
    tasks: any[];
    milestoneCount: number;
  };
  documents: {
    documents: any[];
    pendingSignatures: any[];
  };
};

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return null;
  if (start && end && start !== end) return formatDate(start) + ' to ' + formatDate(end);
  return formatDate(start || end);
}

function badgeTone(state: RequestState): 'live' | 'attention' | 'danger' | 'neutral' {
  if (state === 'complete') return 'live';
  if (state === 'action') return 'danger';
  if (state === 'review') return 'attention';
  return 'neutral';
}

function stateFor(value: unknown): RequestState {
  const status = String(value || '').toLowerCase();
  if (['approved', 'completed', 'paid', 'current', 'active', 'fully_registered', 'confirmed', 'cos_assigned'].includes(status)) return 'complete';
  if (['rejected', 'declined', 'cancelled', 'withdrawn', 'expired', 'closed'].includes(status)) return 'closed';
  if (['missing', 'overdue', 'needs_action', 'resubmission_required', 'unpaid'].includes(status)) return 'action';
  if (['pending', 'requested', 'processing', 'under_review', 'under review', 'in_progress', 'invoice_requested', 'cos_pending', 'preparing_sms', 'submitted_to_sms'].includes(status)) return 'review';
  return 'neutral';
}

function caseStatus(value: unknown) {
  return titleCase(String(value || 'Not set'));
}

function latestDate(...values: Array<string | null | undefined>) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter(Number.isFinite);
  if (!dates.length) return null;
  return new Date(Math.max(...dates)).toISOString();
}

export default function StaffRequestsPage() {
  const router = useRouter();
  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const response = await fetch('/api/staff/requests', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/staff/login');
        return;
      }

      const body = (await response.json().catch(() => ({}))) as Partial<RequestCentreResponse> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load your request centre.');

      const data = body as RequestCentreResponse;
      const next: CaseItem[] = [];

      for (const row of data.leave || []) {
        next.push({
          id: 'leave-' + row.id,
          title: titleCase(row.leave_type || 'Leave request'),
          eyebrow: 'Leave',
          detail: formatDateRange(row.start_date, row.end_date) || 'Dates not set',
          status: caseStatus(row.status),
          state: row.status === 'pending' ? 'review' : stateFor(row.status),
          updatedAt: latestDate(row.updated_at, row.reviewed_at, row.created_at),
          href: '/staff/leave',
          action: row.status === 'pending' ? 'Track request' : 'View request',
          meta: row.review_note ? 'CONAGS has added a review note' : undefined,
        });
      }

      const rota = data.rota?.current;
      if (rota) {
        next.push({
          id: 'rota-' + rota.id,
          title: 'Work preferences',
          eyebrow: 'Rota',
          detail: rota.preferred_training_location
            ? 'Effective ' + formatDate(rota.effective_from) + ' · Training: ' + rota.preferred_training_location
            : 'Effective ' + formatDate(rota.effective_from),
          status: caseStatus(rota.status),
          state: rota.status === 'requested' ? 'review' : stateFor(rota.status),
          updatedAt: latestDate(rota.updated_at, rota.reviewed_at, rota.created_at),
          href: '/staff/availability',
          action: rota.status === 'requested' ? 'View request' : 'Review preferences',
          meta: rota.review_note ? 'CONAGS has left a note' : undefined,
        });
      }

      for (const row of data.compliance?.current || []) {
        const label = String(row.compliance_type || row.type || 'Compliance').toUpperCase();
        next.push({
          id: 'compliance-' + row.id,
          title: label + ' check',
          eyebrow: 'DBS & PVG',
          detail: row.requested_at ? 'Requested ' + formatDate(row.requested_at) : 'Compliance request',
          status: caseStatus(row.status),
          state: row.status === 'pending' ? 'review' : stateFor(row.status),
          updatedAt: latestDate(row.updated_at, row.reviewed_at, row.requested_at, row.created_at),
          href: '/staff/compliance',
          action: row.status === 'pending' ? 'Track check' : 'Open compliance',
          meta: row.status === 'pending' ? 'CONAGS is processing this check' : undefined,
        });
      }

      const visaCase = data.sponsorship?.case;
      if (visaCase || data.sponsorship?.cosStatus?.key !== 'not_requested') {
        const visaState = visaCase?.status
          ? stateFor(visaCase.status)
          : stateFor(data.sponsorship.cosStatus.key);
        next.push({
          id: 'visa-' + (visaCase?.id || visaCase?.pathway || 'support'),
          title: 'Visa & Sponsorship',
          eyebrow: 'Immigration',
          detail: visaCase?.pathway === 'visa_switch'
            ? 'UK visa switch support'
            : visaCase?.pathway === 'international_sponsorship'
              ? 'International sponsorship support'
              : 'Sponsorship workspace',
          status: data.sponsorship.cosStatus.label,
          state: visaState,
          updatedAt: latestDate(visaCase?.updated_at, visaCase?.requested_at, visaCase?.created_at),
          href: '/staff/visa-sponsorship',
          action: data.sponsorship.cosStatus.canDownload ? 'Open COS & visa' : 'Track sponsorship',
        });
      }

      const helpCase = data.visaHelp?.case;
      const helpTasks = Array.isArray(data.visaHelp?.tasks) ? data.visaHelp.tasks : [];
      const openStaffTasks = helpTasks.filter(
        (task: any) => !['completed', 'waived'].includes(String(task.status || '').toLowerCase()),
      );
      if (helpCase || data.visaHelp?.milestoneCount || openStaffTasks.length) {
        const helpStatus = helpCase?.status || (openStaffTasks.length ? 'in_progress' : 'active');
        next.push({
          id: 'visa-help-' + (helpCase?.id || 'workspace'),
          title: 'Visa Help Centre',
          eyebrow: 'Case support',
          detail: openStaffTasks.length
            ? openStaffTasks.length + ' action item' + (openStaffTasks.length === 1 ? '' : 's') + ' visible to you'
            : data.visaHelp.milestoneCount
              ? data.visaHelp.milestoneCount + ' guided milestone' + (data.visaHelp.milestoneCount === 1 ? '' : 's') + ' being tracked'
              : 'Visa route screening and support',
          status: caseStatus(helpStatus),
          state: openStaffTasks.length ? 'action' : stateFor(helpStatus),
          updatedAt: latestDate(helpCase?.updated_at, helpCase?.created_at),
          href: '/staff/visa-help',
          action: openStaffTasks.length ? 'Open action plan' : 'Open Visa Help',
        });
      }

      const pendingSignatures = data.documents?.pendingSignatures || [];
      if (pendingSignatures.length) {
        next.push({
          id: 'documents-signature',
          title: pendingSignatures.length + ' document' + (pendingSignatures.length === 1 ? '' : 's') + ' awaiting signature',
          eyebrow: 'Documents',
          detail: 'Employment or workforce documents need your acknowledgement.',
          status: 'Awaiting signature',
          state: 'action',
          updatedAt: latestDate(...pendingSignatures.map((document: any) => document.issued_at)),
          href: '/staff/documents',
          action: 'Review & sign',
        });
      }

      setItems(
        next.sort((a, b) => {
          const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return right - left;
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your request centre.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [router]);

  const counts = useMemo(() => ({
    open: items.filter((item) => item.state === 'action' || item.state === 'review').length,
    action: items.filter((item) => item.state === 'action').length,
    review: items.filter((item) => item.state === 'review').length,
    complete: items.filter((item) => item.state === 'complete').length,
  }), [items]);

  if (loading) return <StaffLoading label="Loading your request centre…"/>;

  return (
    <StaffPage className="staff-page--requests">
      <StaffPageInner>
        <StaffPageHeader
          eyebrow="STAFF SELF-SERVICE"
          title="My Requests"
          subtitle="One place to track requests you have sent to CONAGS, what is being reviewed, and anything still waiting for you."
          actions={<><StaffAction onClick={() => void load(false)} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</StaffAction><StaffAction href="/staff/messages">Message CONAGS</StaffAction></>}
        />

        {error && (
          <StaffNotice tone="danger">
            <strong>Request centre unavailable</strong>
            <p>{error}</p>
            <StaffAction onClick={() => void load(false)}>Try again</StaffAction>
          </StaffNotice>
        )}

        <div className="staff-stat-grid">
          <StaffMetric label="Open requests" value={counts.open} detail="Still moving through a CONAGS workflow"/>
          <StaffMetric label="Action needed" value={counts.action} detail="Something is waiting on you"/>
          <StaffMetric label="In review" value={counts.review} detail="With CONAGS / Admin now"/>
          <StaffMetric label="Completed" value={counts.complete} detail="Resolved records in this view"/>
        </div>

        <StaffPanel>
          <StaffSectionHeader
            title="Your request timeline"
            copy={items.length ? 'The newest request activity appears first. Use the action on each card to jump directly into the source workflow.' : 'No request or action records are currently visible for your staff account.'}
          />
          {items.length ? (
            <div className="staff-request-list">
              {items.map((item) => (
                <article key={item.id} className="staff-request-item">
                  <div className="staff-request-item-main">
                    <div className="staff-request-item-top">
                      <span className="staff-document-category">{item.eyebrow}</span>
                      <StaffBadge tone={badgeTone(item.state)}>{item.status}</StaffBadge>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="staff-card-copy">{item.detail}</p>
                    {item.meta && <p className="staff-request-meta">{item.meta}</p>}
                    {item.updatedAt && <p className="staff-request-updated">Last recorded update: {formatDate(item.updatedAt)}</p>}
                  </div>
                  <StaffAction href={item.href} primary={item.state === 'action'}>{item.action}</StaffAction>
                </article>
              ))}
            </div>
          ) : (
            <div className="staff-empty">There is nothing to action here right now. New leave, rota, compliance and visa activity will appear automatically.</div>
          )}
        </StaffPanel>

        <div className="staff-workforce-grid">
          <StaffPanel>
            <StaffSectionHeader title="How the states work" copy="The request centre is a navigation layer. The source workflow remains the authoritative place to submit information, receive decisions and complete actions."/>
            <div className="staff-request-state-list">
              <StateRow tone="danger" title="Action needed" text="Something in the source workflow needs your attention, correction, payment or signature."/>
              <StateRow tone="attention" title="In review" text="Your request has been submitted and is moving through a CONAGS review or processing stage."/>
              <StateRow tone="live" title="Completed" text="The source workflow currently reports a completed, approved, active or current state."/>
            </div>
          </StaffPanel>

          <StaffPanel>
            <StaffSectionHeader title="Open a source workflow" copy="Jump straight to the area where the record is managed."/>
            <div className="staff-week-links">
              <a href="/staff/leave"><span>Leave</span><strong>Requests</strong></a>
              <a href="/staff/availability"><span>Work preferences</span><strong>Rota</strong></a>
              <a href="/staff/compliance"><span>DBS & PVG</span><strong>Checks</strong></a>
              <a href="/staff/documents"><span>Documents</span><strong>Sign & view</strong></a>
              <a href="/staff/visa-help"><span>Visa Help</span><strong>Case centre</strong></a>
              <a href="/staff/visa-sponsorship"><span>Visa & COS</span><strong>Sponsorship</strong></a>
            </div>
          </StaffPanel>
        </div>
      </StaffPageInner>
    </StaffPage>
  );
}

function StateRow({ tone, title, text }: { tone: 'danger' | 'attention' | 'live'; title: string; text: string }) {
  return (
    <div className="staff-request-state-row">
      <StaffBadge tone={tone}>{title}</StaffBadge>
      <span>{text}</span>
    </div>
  );
}

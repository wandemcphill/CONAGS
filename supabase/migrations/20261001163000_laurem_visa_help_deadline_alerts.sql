-- Proactive daily Visa Help deadline alerts.
create or replace function public.laurem_send_visa_help_deadline_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  case_row record;
  task_row record;
  alert_title text;
  alert_body text;
  created_count integer := 0;
begin
  for case_row in
    select
      c.id,
      c.staff_id,
      c.status,
      c.current_visa_end_date,
      c.legal_team_requested,
      c.recommendation,
      c.legal_review_completed
    from public.laurem_staff_visa_help_cases c
    where c.status not in ('closed', 'submitted')
  loop
    alert_title := null;
    alert_body := null;

    if case_row.current_visa_end_date is not null
       and case_row.current_visa_end_date < current_date then
      alert_title := 'Visa Help: current visa recorded as expired';
      alert_body := 'Your Visa Help case records a current visa expiry date that has passed. Review the case and contact CONAGS through the Visa Help Centre.';
    elsif case_row.current_visa_end_date is not null
       and case_row.current_visa_end_date <= current_date + 7 then
      alert_title := 'Visa Help: current visa expires within 7 days';
      alert_body := 'Your Visa Help case records a current visa expiry date within 7 days. Review outstanding case actions promptly in the Visa Help Centre.';
    elsif exists (
      select 1
      from public.laurem_staff_visa_help_tasks t
      where t.visa_help_case_id = case_row.id
        and t.staff_id = case_row.staff_id
        and t.visibility = 'staff'
        and t.required = true
        and t.status not in ('verified', 'cancelled')
        and t.due_at is not null
        and t.due_at < now()
    ) then
      select t.title
      into task_row
      from public.laurem_staff_visa_help_tasks t
      where t.visa_help_case_id = case_row.id
        and t.staff_id = case_row.staff_id
        and t.visibility = 'staff'
        and t.required = true
        and t.status not in ('verified', 'cancelled')
        and t.due_at is not null
        and t.due_at < now()
      order by t.due_at asc
      limit 1;

      alert_title := 'Visa Help: required request is overdue';
      alert_body := 'CONAGS is waiting for: ' || coalesce(task_row.title, 'a required case request') || '. Open the Visa Help Centre and submit the outstanding response.';
    elsif case_row.legal_team_requested = true
       and coalesce(case_row.legal_review_completed, false) = false then
      alert_title := 'Visa Help: legal/support review is pending';
      alert_body := 'Your Visa Help case is awaiting CONAGS legal/support review. Check the case workspace for requests or messages.';
    elsif case_row.current_visa_end_date is not null
       and case_row.current_visa_end_date <= current_date + 30 then
      alert_title := 'Visa Help: current visa expires within 30 days';
      alert_body := 'Your Visa Help case records a current visa expiry date within 30 days. Review the case timeline and outstanding actions.';
    end if;

    if alert_title is not null
       and not exists (
         select 1
         from public.laurem_staff_notifications n
         where n.staff_id = case_row.staff_id
           and n.category = 'compliance'
           and n.title = alert_title
           and n.action_url = '/staff/visa-help'
           and n.created_at >= date_trunc('day', now())
       )
    then
      insert into public.laurem_staff_notifications (
        staff_id, category, title, body, action_url
      )
      values (
        case_row.staff_id, 'compliance', alert_title, alert_body, '/staff/visa-help'
      );
      created_count := created_count + 1;
    end if;
  end loop;

  return created_count;
end;
$$;

revoke all on function public.laurem_send_visa_help_deadline_alerts() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'laurem-visa-help-deadline-alerts';

select cron.schedule(
  'laurem-visa-help-deadline-alerts',
  '0 8 * * *',
  'select public.laurem_send_visa_help_deadline_alerts();'
);

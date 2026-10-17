create or replace function public.laurem_data_governance_scan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,application_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:recruitment_document:'||d.id,'orphan','critical','recruitment_documents','recruitment_document',d.id,d.application_id,null,
    'Recruitment document has no application record','The document remains stored but its application reference cannot be resolved.',
    jsonb_build_object('storage_path',d.storage_path,'status',d.status),clock_timestamp(),clock_timestamp()
  from public.laurem_recruitment_documents d
  left join public.laurem_recruitment_applications a on a.id=d.application_id
  where a.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;
  get diagnostics inserted_count = row_count;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,application_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:staff_document:'||d.id,'orphan','critical','superseded_staff_documents','staff_document',d.id,null,d.staff_id,
    'Staff document has no staff record','The document remains stored but its staff reference cannot be resolved.',
    jsonb_build_object('storage_path',d.storage_path,'status',d.status),clock_timestamp(),clock_timestamp()
  from public.laurem_staff_documents d
  left join public.laurem_staff_profiles s on s.id=d.staff_id
  where s.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,application_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:contract:'||c.id,'orphan','high','unsuccessful_candidates','contract',c.id,c.application_id,
    'Employment contract has no application record','The contract cannot be tied to a current recruitment application.',
    jsonb_build_object('status',c.status,'version',c.version),clock_timestamp(),clock_timestamp()
  from public.laurem_recruitment_contracts c
  left join public.laurem_recruitment_applications a on a.id=c.application_id
  where a.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:onboarding:'||p.id,'orphan','high','inactive_staff','onboarding_package',p.id,p.staff_id,
    'Onboarding package has no staff record','The onboarding package cannot be tied to a current staff profile.',
    jsonb_build_object('status',p.status),clock_timestamp(),clock_timestamp()
  from public.laurem_staff_onboarding_packages p
  left join public.laurem_staff_profiles s on s.id=p.staff_id
  where s.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:message_conversation:'||c.id,'orphan','medium','staff_messages','message_conversation',c.id,c.created_by_staff_id,
    'Message conversation has no participants','A message conversation exists without a participant record and is not safely discoverable through the staff portal.',
    '{}'::jsonb,clock_timestamp(),clock_timestamp()
  from public.laurem_staff_message_conversations c
  left join public.laurem_staff_message_participants p on p.conversation_id=c.id
  where p.conversation_id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:message:'||m.id,'orphan','medium','staff_messages','message',m.id,
    'Staff message has no conversation record','The message cannot be tied to a current conversation.',
    '{}'::jsonb,clock_timestamp(),clock_timestamp()
  from public.laurem_staff_messages m
  left join public.laurem_staff_message_conversations c on c.id=m.conversation_id
  where c.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:visa_case:'||v.id,'orphan','high','inactive_staff','visa_case',v.id,v.staff_id,
    'Visa case has no staff record','The visa case cannot be tied to a current staff profile.',
    jsonb_build_object('status',v.status),clock_timestamp(),clock_timestamp()
  from public.laurem_staff_visa_cases v
  left join public.laurem_staff_profiles s on s.id=v.staff_id
  where s.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  update public.laurem_data_governance_findings f
  set status='resolved',resolved_by='system',resolved_at=clock_timestamp(),
      resolution_note='No longer detected by the governance scan.',updated_at=clock_timestamp()
  where f.status in ('open','acknowledged','held')
    and f.finding_type='orphan'
    and f.last_detected_at < clock_timestamp() - interval '1 minute';

  return jsonb_build_object(
    'ok',true,'scanned_at',clock_timestamp(),
    'finding_count',(select count(*) from public.laurem_data_governance_findings where status in ('open','acknowledged','held')),
    'critical_count',(select count(*) from public.laurem_data_governance_findings where severity='critical' and status in ('open','acknowledged','held'))
  );
end;
$$;

revoke all on function public.laurem_data_governance_scan() from public, anon, authenticated;
create extension if not exists pgcrypto;

alter table recruitment_contracts
  add column if not exists contract_type text not null default 'standard',
  add column if not exists annual_salary numeric,
  add column if not exists weekly_hours numeric,
  add column if not exists visa_route text,
  add column if not exists sponsorship_occupation_code text,
  add column if not exists nmc_status text,
  add column if not exists registration_deadline text,
  add column if not exists pre_registration_salary numeric,
  add column if not exists post_registration_salary numeric,
  add column if not exists relocation_support text,
  add column if not exists repayable_costs text,
  add column if not exists repayment_schedule text,
  add column if not exists contract_source text;

alter table recruitment_contracts
  drop constraint if exists recruitment_contracts_contract_type_check;

alter table recruitment_contracts
  add constraint recruitment_contracts_contract_type_check
  check (contract_type in ('standard','international_nurse'));

create index if not exists recruitment_contracts_type_idx
  on recruitment_contracts(contract_type);

create or replace function create_international_nurse_contract_template_meta()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'default_role', 'Registered Nurse',
    'default_pathway', 'international',
    'default_visa_route', 'Health and Care Worker visa / applicable sponsored work route',
    'default_soc_family', '2231-2237',
    'default_weekly_hours', 37.5,
    'salary_note', 'Use the salary stated in the approved offer and ensure it satisfies the applicable immigration and employment requirements at the point of sponsorship.',
    'nmc_note', 'Where the worker is sponsored before full NMC registration, use the exact lawful pre-registration arrangement and applicable salary/duty restrictions.',
    'ethical_recruitment_note', 'Do not charge recruitment fees or reclaim employer-liable recruitment, sponsor licence, immigration skills charge, Certificate of Sponsorship, interview or agency costs.'
  );
$$;

revoke all on function create_international_nurse_contract_template_meta() from anon, authenticated;

comment on column recruitment_contracts.contract_type is 'Contract template family. international_nurse is used for overseas registered nurse recruitment.';
comment on column recruitment_contracts.repayable_costs is 'Only genuine, evidenced, auditable employer-funded expenses that may lawfully be reclaimed.';
comment on column recruitment_contracts.repayment_schedule is 'Itemised, transparent, proportionate and time-limited repayment schedule.';

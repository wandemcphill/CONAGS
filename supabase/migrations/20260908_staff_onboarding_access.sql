alter table staff_onboarding_packages add column if not exists access_token_hash text unique;
alter table staff_onboarding_packages add column if not exists access_token_expires_at timestamptz;
create index if not exists staff_onboarding_packages_access_idx on staff_onboarding_packages(access_token_hash);

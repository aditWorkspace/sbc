create table apollo_samples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  person_first_name text,
  person_last_name text,
  email_returned text,
  email_ignored_reason text check (email_ignored_reason in (
    'personal_domain','no_email_found','no_pattern_match','wrong_company','guessed_status'
  )),
  detected_pattern text,
  detected_domain text,
  credits_spent int not null default 1,
  apollo_response jsonb,
  sampled_at timestamptz not null default now()
);
create index apollo_samples_company_idx on apollo_samples(company_id, sampled_at desc);

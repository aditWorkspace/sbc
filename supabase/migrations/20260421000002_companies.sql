create table companies (
  id uuid primary key default gen_random_uuid(),
  name_normalized text unique not null,
  display_name text not null,
  domain text,
  template_pattern text check (template_pattern in (
    'first.last','first_last','firstlast','flast','f.last','first','firstl','last.first','last'
  )),
  template_confidence text not null default 'UNKNOWN'
    check (template_confidence in ('UNKNOWN','SAMPLING','HIGH','MEDIUM','LOW','UNRESOLVED')),
  sample_size int not null default 0,
  matching_samples int not null default 0,
  apollo_credits_spent int not null default 0,
  locked_at timestamptz,
  last_sampled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_confidence_idx on companies(template_confidence);

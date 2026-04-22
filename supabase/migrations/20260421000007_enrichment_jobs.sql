create table enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  status text not null default 'queued'
    check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index enrichment_jobs_queue_idx
  on enrichment_jobs(status, created_at) where status in ('queued','running');
create unique index enrichment_jobs_per_company_unique
  on enrichment_jobs(company_id) where status in ('queued','running');

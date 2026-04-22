create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  first_name_normalized text not null,
  last_name_normalized text,
  company_id uuid not null references companies(id),
  company_display text not null,
  normalized_key text not null,
  email text,
  email_source text check (email_source in ('template','apollo_direct','manual')),
  enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending','enriched','failed')),
  uploaded_by uuid not null references consultants(id),
  upload_id uuid not null,
  created_at timestamptz not null default now(),
  enriched_at timestamptz,
  unique (first_name_normalized, last_name_normalized, company_id)
);
create index contacts_company_status_idx on contacts(company_id, enrichment_status);
create index contacts_uploader_idx on contacts(uploaded_by);
create index contacts_status_created_idx on contacts(enrichment_status, created_at);
create index contacts_normalized_key_idx on contacts(normalized_key);

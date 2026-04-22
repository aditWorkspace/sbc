create table dedup_archive (
  normalized_key text primary key,
  original_first_name text,
  original_last_name text,
  original_company text,
  first_uploaded_by uuid references consultants(id) on delete set null,
  pulled_in_sheet uuid,
  archived_at timestamptz not null default now()
);

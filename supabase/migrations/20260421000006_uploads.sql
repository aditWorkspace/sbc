create table uploads (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(id),
  filename text,
  row_count_raw int not null default 0,
  row_count_deduped int not null default 0,
  row_count_already_in_pool int not null default 0,
  row_count_archived int not null default 0,
  row_count_rejected int not null default 0,
  row_count_admitted int not null default 0,
  status text not null default 'processing'
    check (status in ('processing','complete','failed')),
  error_message text,
  uploaded_at timestamptz not null default now(),
  completed_at timestamptz
);
create index uploads_consultant_idx on uploads(consultant_id, uploaded_at desc);

alter table contacts
  add constraint contacts_upload_fk foreign key (upload_id) references uploads(id);

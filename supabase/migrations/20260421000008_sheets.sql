create table sheets (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(id),
  google_sheet_id text,
  google_sheet_url text,
  row_count int not null,
  from_own_sourcing int not null default 0,
  from_shared_pool int not null default 0,
  status text not null default 'active'
    check (status in ('active','fallback_csv','deleted')),
  created_at timestamptz not null default now(),
  scheduled_delete_at timestamptz,
  deleted_at timestamptz
);

create or replace function sheets_set_scheduled_delete()
returns trigger language plpgsql as $$
begin
  new.scheduled_delete_at := new.created_at + interval '90 days';
  return new;
end $$;

create trigger sheets_scheduled_delete_trg
  before insert on sheets
  for each row execute function sheets_set_scheduled_delete();
create index sheets_consultant_idx on sheets(consultant_id, created_at desc);
create index sheets_cleanup_idx on sheets(scheduled_delete_at) where deleted_at is null;

alter table dedup_archive
  add constraint dedup_archive_sheet_fk foreign key (pulled_in_sheet) references sheets(id);

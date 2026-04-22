create or replace function is_admin() returns boolean language sql stable as $$
  select exists (
    select 1 from consultants
    where auth_user_id = auth.uid()
      and is_admin = true
      and deactivated_at is null
  );
$$;

alter table consultants enable row level security;
create policy consultants_self_read on consultants for select using (auth_user_id = auth.uid());
create policy consultants_admin_all on consultants for all using (is_admin()) with check (is_admin());

alter table companies enable row level security;
create policy companies_read on companies for select using (true);
create policy companies_admin_write on companies for all using (is_admin()) with check (is_admin());

alter table apollo_samples enable row level security;
create policy apollo_samples_admin on apollo_samples for all using (is_admin()) with check (is_admin());

alter table contacts enable row level security;
create policy contacts_admin_read on contacts for select using (is_admin());

alter table dedup_archive enable row level security;
create policy dedup_archive_admin on dedup_archive for all using (is_admin()) with check (is_admin());

alter table uploads enable row level security;
create policy uploads_self_read on uploads for select
  using (consultant_id in (select id from consultants where auth_user_id = auth.uid()));
create policy uploads_admin on uploads for all using (is_admin()) with check (is_admin());

alter table enrichment_jobs enable row level security;
create policy enrichment_jobs_admin on enrichment_jobs for all using (is_admin()) with check (is_admin());

alter table sheets enable row level security;
create policy sheets_self_read on sheets for select
  using (consultant_id in (select id from consultants where auth_user_id = auth.uid()));
create policy sheets_admin on sheets for all using (is_admin()) with check (is_admin());

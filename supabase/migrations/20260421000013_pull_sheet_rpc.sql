create or replace function pull_sheet(p_consultant_id uuid, p_max_rows int)
returns table (
  id uuid, first_name text, last_name text, company_display text, email text,
  uploaded_by uuid, normalized_key text
) language plpgsql security definer as $$
begin
  return query
    with chosen as (
      select c.* from contacts c
      where c.enrichment_status = 'enriched'
      order by (c.uploaded_by = p_consultant_id) desc, c.created_at asc
      limit p_max_rows
      for update skip locked
    ),
    archived as (
      insert into dedup_archive (normalized_key, original_first_name, original_last_name, original_company, first_uploaded_by)
      select c.normalized_key, c.first_name, c.last_name, c.company_display, c.uploaded_by
      from chosen c
      on conflict (normalized_key) do nothing
      returning normalized_key
    ),
    deleted as (
      delete from contacts c using chosen where c.id = chosen.id
      returning c.id, c.first_name, c.last_name, c.company_display, c.email, c.uploaded_by, c.normalized_key
    )
    select * from deleted;
end $$;

grant execute on function pull_sheet(uuid, int) to service_role;

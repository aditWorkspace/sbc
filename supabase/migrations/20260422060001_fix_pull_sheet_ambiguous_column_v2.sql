-- Fix: plpgsql RETURNS TABLE output columns become variables in scope, making
-- any bare reference to e.g. `normalized_key` ambiguous (PL/pgSQL variable vs
-- table column). Rewrite as a plain SQL function — SQL functions don't have
-- that scoping issue, so bare column names inside the query are unambiguous.
create or replace function pull_sheet(p_consultant_id uuid, p_max_rows int)
returns table (
  id uuid, first_name text, last_name text, company_display text, email text,
  uploaded_by uuid, normalized_key text
) language sql security definer as $$
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
  ),
  deleted as (
    delete from contacts c using chosen where c.id = chosen.id
    returning c.id, c.first_name, c.last_name, c.company_display, c.email, c.uploaded_by, c.normalized_key
  )
  select * from deleted;
$$;

grant execute on function pull_sheet(uuid, int) to service_role;

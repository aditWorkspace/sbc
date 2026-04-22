-- Diagnostic: explicitly check the role column exists, and if not, re-create.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consultants' and column_name = 'role'
  ) then
    raise notice '[diagnostic] role column does not exist — creating it now';
    alter table consultants add column role text not null default 'consultant'
      check (role in ('owner', 'admin', 'consultant', 'jr_consultant'));
  else
    raise notice '[diagnostic] role column exists';
  end if;
end $$;

-- Re-apply role assignments (idempotent)
update consultants set role = 'owner'
 where lower(email) = 'aditmittal@berkeley.edu' and role <> 'owner';
update consultants set role = 'admin'
 where lower(email) in (
   'marisaikeda1@berkeley.edu', 'nnatalietrann@berkeley.edu',
   'lwang07@berkeley.edu', 'etran124@berkeley.edu'
 ) and role = 'consultant';

notify pgrst, 'reload schema';

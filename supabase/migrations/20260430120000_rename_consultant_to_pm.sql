-- Rename role values: 'consultant' → 'pm', 'jr_consultant' → 'senior_consultant'.
-- The consultants table itself keeps its name (renaming the table would break
-- every URL, every FK, and every existing migration); this only changes what
-- string is stored in the `role` column.

-- 1. Drop the old check constraint so we can rewrite values
alter table consultants drop constraint if exists consultants_role_check;

-- 2. Rewrite existing rows
update consultants set role = 'pm'                where role = 'consultant';
update consultants set role = 'senior_consultant' where role = 'jr_consultant';

-- 3. Update the column default for new rows
alter table consultants alter column role set default 'pm';

-- 4. Re-add the check constraint with the new allowed values
alter table consultants add constraint consultants_role_check
  check (role in ('owner', 'admin', 'pm', 'senior_consultant'));

notify pgrst, 'reload schema';

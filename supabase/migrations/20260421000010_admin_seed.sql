-- Placeholder; the user will update this to their real admin email before push.
insert into consultants (email, display_name, is_admin, is_approved, approved_at)
values ('TO_BE_REPLACED@berkeley.edu', 'Admin', true, true, now())
on conflict do nothing;

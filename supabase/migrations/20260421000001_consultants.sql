create table consultants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null check (lower(email) like '%@berkeley.edu'),
  display_name text,
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references consultants(id),
  deactivated_at timestamptz,
  deactivated_by uuid references consultants(id),
  sessions_revoked_at timestamptz,
  last_active_at timestamptz default now(),
  created_at timestamptz not null default now()
);
create unique index consultants_email_active_unique
  on consultants (lower(email)) where deactivated_at is null;
create index consultants_auth_user_idx on consultants(auth_user_id);

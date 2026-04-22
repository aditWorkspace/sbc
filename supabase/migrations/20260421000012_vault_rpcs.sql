-- We use a simple app_secrets table since enabling the full pgsodium vault extension
-- can be involved on hosted Supabase. service_role only.
create table if not exists app_secrets (name text primary key, value text not null);
alter table app_secrets enable row level security;
-- No policies = nobody except service_role can access.

create or replace function vault_write_secret(secret_name text, secret_value text)
returns void language plpgsql security definer as $$
begin
  insert into app_secrets (name, value) values (secret_name, secret_value)
  on conflict (name) do update set value = excluded.value;
end $$;

create or replace function vault_read_secret(secret_name text)
returns text language plpgsql security definer as $$
declare v text;
begin
  select value into v from app_secrets where name = secret_name;
  return v;
end $$;

revoke all on function vault_write_secret(text, text) from public;
revoke all on function vault_read_secret(text) from public;
grant execute on function vault_write_secret(text, text) to service_role;
grant execute on function vault_read_secret(text) to service_role;

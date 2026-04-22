create or replace function resolve_consultant(
  p_auth_user_id uuid, p_email text, p_display_name text
) returns consultants language plpgsql security definer as $$
declare
  c consultants%rowtype;
begin
  select * into c from consultants
   where lower(email) = lower(p_email)
     and deactivated_at is null
   order by created_at desc limit 1;

  if found then
    update consultants set
      auth_user_id = coalesce(auth_user_id, p_auth_user_id),
      display_name = coalesce(display_name, p_display_name),
      last_active_at = now()
      where id = c.id
      returning * into c;
  else
    insert into consultants (auth_user_id, email, display_name, is_approved)
      values (p_auth_user_id, p_email, p_display_name, false)
      returning * into c;
  end if;
  return c;
end $$;

grant execute on function resolve_consultant to service_role;

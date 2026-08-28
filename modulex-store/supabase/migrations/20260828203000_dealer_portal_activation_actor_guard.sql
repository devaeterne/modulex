create or replace function private.set_customer_portal_user_updated_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  new.updated_at := now();

  if v_auth_user_id is not null then
    if exists (
      select 1
      from public.profiles as p
      where p.id = v_auth_user_id
    ) then
      new.updated_by := v_auth_user_id;
    else
      new.updated_by := null;
    end if;
  elsif new.updated_by is not null and not exists (
    select 1
    from public.profiles as p
    where p.id = new.updated_by
  ) then
    new.updated_by := null;
  end if;

  return new;
end;
$$;

revoke all on function private.set_customer_portal_user_updated_metadata() from public;
revoke execute on function private.set_customer_portal_user_updated_metadata() from anon, authenticated;

drop trigger if exists trg_customer_portal_users_updated on public.customer_portal_users;
create trigger trg_customer_portal_users_updated
before update on public.customer_portal_users
for each row
execute function private.set_customer_portal_user_updated_metadata();

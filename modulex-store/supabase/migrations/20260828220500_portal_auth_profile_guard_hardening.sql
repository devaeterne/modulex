-- P1.4 hotfix: Supabase Admin createUser can insert auth.users before custom
-- app_metadata is observable by the auth.users AFTER INSERT trigger. Treat an
-- already provisioned, portal-enabled login email as external during that gap.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') in ('dealer_portal', 'customer_portal') then
    return new;
  end if;

  if new.email is not null and exists (
    select 1
    from public.customer_portal_users as cpu
    join public.customers as c on c.id = cpu.customer_id
    where lower(cpu.login_email) = lower(new.email)
      and c.portal_enabled = true
      and c.status = 'active'
      and cpu.status in ('never_invited', 'invited', 'active', 'suspended')
  ) then
    return new;
  end if;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    is_active
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'sales',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

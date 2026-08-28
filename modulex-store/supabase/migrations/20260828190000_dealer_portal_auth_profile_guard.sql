create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') = 'dealer_portal' then
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

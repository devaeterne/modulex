-- RBS-A1/A5 follow-up: restore only the internal dependencies required by
-- SECURITY INVOKER public wrappers after the global grant cleanup.
-- Keep internal schemas outside the exposed public API boundary and remove accidental
-- anon execution from private Admin/warehouse wrappers.

revoke execute on function public.delete_location_if_empty(uuid) from public, anon;
revoke execute on function public.delete_zone_if_empty(uuid) from public, anon;
revoke execute on function public.get_customer_shipping_directory(uuid) from public, anon;
grant execute on function public.delete_location_if_empty(uuid) to authenticated;
grant execute on function public.delete_zone_if_empty(uuid) to authenticated;
grant execute on function public.get_customer_shipping_directory(uuid) to authenticated;

grant usage on schema private to authenticated;
grant usage on schema store_api_private to anon, authenticated;

do $rbs$
declare
  dep record;
begin
  for dep in
    with wrappers as (
      select p.oid,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
             pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and not p.prosecdef
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ), refs as (
      select m[1] as schema_name,
             m[2] as function_name,
             bool_or(w.anon_exec) as needed_anon,
             bool_or(w.auth_exec) as needed_auth
      from wrappers w
      cross join lateral regexp_matches(
        w.def,
        '(private|store_api_private)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',
        'g'
      ) m
      group by m[1], m[2]
    )
    select p.oid, refs.schema_name, refs.needed_anon, refs.needed_auth
    from refs
    join pg_namespace n on n.nspname = refs.schema_name
    join pg_proc p on p.pronamespace = n.oid and p.proname = refs.function_name
    where p.prokind = 'f'
  loop
    if dep.schema_name = 'private' then
      if dep.needed_auth then
        execute format('grant execute on function %s to authenticated', dep.oid::regprocedure);
      end if;
    else
      if dep.needed_anon then
        execute format('grant execute on function %s to anon', dep.oid::regprocedure);
      end if;
      if dep.needed_auth then
        execute format('grant execute on function %s to authenticated', dep.oid::regprocedure);
      end if;
    end if;
  end loop;
end
$rbs$;

do $rbs$
begin
  if has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'RBS dependency repair failed: anon private schema usage is open';
  end if;
  if not has_schema_privilege('authenticated', 'private', 'USAGE')
     or not has_schema_privilege('anon', 'store_api_private', 'USAGE')
     or not has_schema_privilege('authenticated', 'store_api_private', 'USAGE') then
    raise exception 'RBS dependency repair failed: required wrapper schema usage missing';
  end if;
  if has_function_privilege('anon', 'public.delete_location_if_empty(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.delete_zone_if_empty(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_customer_shipping_directory(uuid)', 'EXECUTE') then
    raise exception 'RBS dependency repair failed: accidental anon wrapper remains executable';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
    where n.nspname in ('private','store_api_private')
      and a.grantee=0 and a.privilege_type='EXECUTE'
  ) then
    raise exception 'RBS dependency repair failed: internal PUBLIC EXECUTE restored';
  end if;
  if exists (
    with wrappers as (
      select p.oid,
             has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
             has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
             pg_get_functiondef(p.oid) def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and not p.prosecdef
    ), refs as (
      select distinct m[1] schema_name,m[2] function_name,w.anon_exec,w.auth_exec
      from wrappers w cross join lateral regexp_matches(w.def,'(private|store_api_private)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(','g') m
    ), internal as (
      select p.oid,n.nspname,p.proname
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('private','store_api_private')
    )
    select 1 from internal i
    where (has_function_privilege('authenticated',i.oid,'EXECUTE') and not exists (
             select 1 from refs rr where rr.schema_name=i.nspname and rr.function_name=i.proname and rr.auth_exec))
       or (has_function_privilege('anon',i.oid,'EXECUTE') and not exists (
             select 1 from refs rr where rr.schema_name=i.nspname and rr.function_name=i.proname and rr.anon_exec))
  ) then
    raise exception 'RBS dependency repair failed: internal client EXECUTE exceeds wrapper dependency allowlist';
  end if;
end
$rbs$;

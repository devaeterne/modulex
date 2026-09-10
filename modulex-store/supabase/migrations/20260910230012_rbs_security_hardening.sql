-- RBS-A1/A2/A5 — RBAC & security hardening closeout.
-- Production version: 20260910230012
-- Scope: SECURITY DEFINER execution boundaries, internal schema reachability,
-- RLS/no-policy direct grants and fixed search_path normalization.
-- Intentionally excludes performance-only index cleanup.

alter function public.create_support_request(text, text, text)
  set search_path = pg_catalog, public;
alter function public.update_support_request_status(uuid, text, text)
  set search_path = pg_catalog, public;

revoke usage on schema private from anon, authenticated;
revoke usage on schema store_api_private from anon, authenticated;

-- Internal schemas are implementation details. Preserve service_role execution only
-- where it was already effective, then remove all client/PUBLIC execution paths.
do $rbs$
declare
  r record;
  had_service boolean;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('private', 'store_api_private')
      and p.prokind = 'f'
  loop
    had_service := has_function_privilege('service_role', r.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon, authenticated', r.oid::regprocedure);
    if had_service then
      execute format('grant execute on function %s to service_role', r.oid::regprocedure);
    end if;
  end loop;
end
$rbs$;

-- Public SECURITY DEFINER wrappers remain the API boundary. Remove implicit PUBLIC
-- execution while preserving exactly the client/service roles that already had it.
do $rbs$
declare
  r record;
  had_anon boolean;
  had_authenticated boolean;
  had_service boolean;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
  loop
    had_anon := has_function_privilege('anon', r.oid, 'EXECUTE');
    had_authenticated := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    had_service := has_function_privilege('service_role', r.oid, 'EXECUTE');

    execute format('revoke execute on function %s from public', r.oid::regprocedure);
    if had_anon then
      execute format('grant execute on function %s to anon', r.oid::regprocedure);
    end if;
    if had_authenticated then
      execute format('grant execute on function %s to authenticated', r.oid::regprocedure);
    end if;
    if had_service then
      execute format('grant execute on function %s to service_role', r.oid::regprocedure);
    end if;
  end loop;
end
$rbs$;

-- RLS-enabled/no-policy relations in this inventory are RPC/internal-only. Do not add
-- permissive policies merely to silence the Advisor; remove direct client table grants.
do $rbs$
declare
  r record;
begin
  for r in
    select c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and not exists (select 1 from pg_policy pol where pol.polrelid = c.oid)
  loop
    execute format(
      'revoke select, insert, update, delete, truncate, references, trigger on table %s from anon, authenticated',
      r.oid::regclass
    );
  end loop;
end
$rbs$;

-- Fail closed if any intended hardening invariant is not true.
do $rbs$
begin
  if has_schema_privilege('anon', 'private', 'USAGE')
     or has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_schema_privilege('anon', 'store_api_private', 'USAGE')
     or has_schema_privilege('authenticated', 'store_api_private', 'USAGE') then
    raise exception 'RBS hardening failed: internal schema usage remains client-accessible';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('private', 'store_api_private')
      and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then
    raise exception 'RBS hardening failed: internal SECURITY DEFINER remains client-executable';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'public'
      and p.prosecdef
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'RBS hardening failed: public SECURITY DEFINER retains PUBLIC EXECUTE';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and not exists (select 1 from pg_policy pol where pol.polrelid = c.oid)
      and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  ) then
    raise exception 'RBS hardening failed: RLS/no-policy table retains direct client grants';
  end if;
end
$rbs$;

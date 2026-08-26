-- Performance hardening for helper-based RLS policies.
--
-- Helper functions such as current_user_has_any_role(), is_admin(), and the stock
-- permission helpers are STABLE for the lifetime of a request. When they are used
-- directly in an RLS predicate PostgreSQL may still evaluate them once per candidate
-- row. Wrapping the helper call in a scalar SELECT lets PostgreSQL promote it to an
-- InitPlan and evaluate it once per statement.
--
-- This migration preserves the existing authorization semantics. It only changes the
-- query-planning shape of known helper-based predicates.

begin;

do $performance_rls$
declare
  policy_row record;
  optimized_using text;
  optimized_check text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    optimized_using := policy_row.qual;
    optimized_check := policy_row.with_check;

    case optimized_using
      when 'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text, ''sales''::text])' then
        optimized_using := '(select public.current_user_has_any_role(ARRAY[''super_admin'', ''admin'', ''sales'']::text[]))';
      when 'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text])' then
        optimized_using := '(select public.current_user_has_any_role(ARRAY[''super_admin'', ''admin'']::text[]))';
      when 'is_admin()' then
        optimized_using := '(select public.is_admin())';
      when 'is_super_admin()' then
        optimized_using := '(select public.is_super_admin())';
      when 'can_manage_inventory()' then
        optimized_using := '(select public.can_manage_inventory())';
      when 'can_operate_stock()' then
        optimized_using := '(select public.can_operate_stock())';
      when 'can_manage_warehouses()' then
        optimized_using := '(select public.can_manage_warehouses())';
      when '((is_base_price = false) AND current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text]))' then
        optimized_using := '((is_base_price = false) AND (select public.current_user_has_any_role(ARRAY[''super_admin'', ''admin'']::text[])))';
      else
        null;
    end case;

    case optimized_check
      when 'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text, ''sales''::text])' then
        optimized_check := '(select public.current_user_has_any_role(ARRAY[''super_admin'', ''admin'', ''sales'']::text[]))';
      when 'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text])' then
        optimized_check := '(select public.current_user_has_any_role(ARRAY[''super_admin'', ''admin'']::text[]))';
      when 'is_admin()' then
        optimized_check := '(select public.is_admin())';
      when 'is_super_admin()' then
        optimized_check := '(select public.is_super_admin())';
      when 'can_manage_inventory()' then
        optimized_check := '(select public.can_manage_inventory())';
      when 'can_operate_stock()' then
        optimized_check := '(select public.can_operate_stock())';
      when 'can_manage_warehouses()' then
        optimized_check := '(select public.can_manage_warehouses())';
      else
        null;
    end case;

    if optimized_using is distinct from policy_row.qual
       or optimized_check is distinct from policy_row.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        case
          when optimized_using is not null then format(' using (%s)', optimized_using)
          else ''
        end,
        case
          when optimized_check is not null then format(' with check (%s)', optimized_check)
          else ''
        end
      );
    end if;
  end loop;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        qual in (
          'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text, ''sales''::text])',
          'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text])',
          'is_admin()',
          'is_super_admin()',
          'can_manage_inventory()',
          'can_operate_stock()',
          'can_manage_warehouses()',
          '((is_base_price = false) AND current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text]))'
        )
        or with_check in (
          'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text, ''sales''::text])',
          'current_user_has_any_role(ARRAY[''super_admin''::text, ''admin''::text])',
          'is_admin()',
          'is_super_admin()',
          'can_manage_inventory()',
          'can_operate_stock()',
          'can_manage_warehouses()'
        )
      )
  ) then
    raise exception 'performance-rls.sql left an unoptimized helper-based RLS predicate';
  end if;
end
$performance_rls$;

commit;

notify pgrst, 'reload schema';

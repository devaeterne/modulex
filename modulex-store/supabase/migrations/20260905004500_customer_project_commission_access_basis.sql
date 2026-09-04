-- PB-6 follow-up: internal tab access is Finance/Admin/Super Admin only.
-- Percentage commission basis is derived from canonical active Project Orders and snapshotted at creation.

create or replace function private.can_view_project_commission(p_project_id uuid, p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select public.current_user_has_any_role(array['super_admin','admin','finance']);
$$;

drop policy if exists project_participant_roles_internal_read on public.project_participant_roles;
create policy project_participant_roles_internal_read on public.project_participant_roles
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','finance']));

drop policy if exists project_participants_internal_read on public.project_participants;
create policy project_participants_internal_read on public.project_participants
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','finance']));

create or replace function public.get_customer_project_participants(p_project_id uuid)
returns table(
  id uuid,
  role_key text,
  role_label text,
  subject_type text,
  subject_id uuid,
  display_name text,
  is_active boolean,
  source text,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    pp.id,
    pr.role_key,
    pr.label,
    case
      when pp.employee_id is not null then 'employee'
      when pp.customer_contact_id is not null then 'customer_contact'
      else 'profile'
    end,
    coalesce(pp.employee_id, pp.customer_contact_id, pp.profile_id),
    coalesce(
      nullif(btrim(concat_ws(' ', he.first_name, he.last_name)), ''),
      nullif(btrim(cc.first_name || ' ' || cc.last_name), ''),
      nullif(btrim(p.full_name), ''),
      p.email,
      'Unnamed participant'
    ) as display_name,
    pp.is_active,
    pp.source,
    pp.started_at,
    pp.ended_at
  from public.project_participants pp
  join public.project_participant_roles pr on pr.id = pp.role_id
  left join public.hr_employees he on he.id = pp.employee_id
  left join public.customer_contacts cc on cc.id = pp.customer_contact_id
  left join public.profiles p on p.id = pp.profile_id
  where pp.project_id = p_project_id
    and public.current_user_has_any_role(array['super_admin','admin','finance'])
  order by pp.is_active desc, pr.sort_order, display_name;
$$;

create or replace function private.project_commission_scope_basis(
  p_project_id uuid,
  p_scope_type text,
  p_currency_code text,
  p_product_category_id uuid default null,
  p_product_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_scope text := lower(btrim(coalesce(p_scope_type, 'project')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_currency_count integer := 0;
  v_detected_currency text;
  v_basis numeric := 0;
begin
  if not exists (select 1 from public.customer_projects where id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'PROJECT_COMMISSION_CURRENCY_INVALID';
  end if;

  if v_scope = 'project' then
    if p_product_category_id is not null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_PROJECT_SCOPE_INVALID';
    end if;

    select
      count(distinct upper(co.currency_code::text)),
      min(upper(co.currency_code::text)),
      coalesce(sum(co.grand_total), 0)
    into v_currency_count, v_detected_currency, v_basis
    from public.customer_orders co
    where co.project_id = p_project_id
      and co.status <> 'cancelled';
  elsif v_scope = 'category' then
    if p_product_category_id is null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_CATEGORY_SCOPE_INVALID';
    end if;

    select
      count(distinct upper(co.currency_code::text)),
      min(upper(co.currency_code::text)),
      coalesce(sum(oi.line_total), 0)
    into v_currency_count, v_detected_currency, v_basis
    from public.customer_orders co
    join public.customer_order_items oi on oi.order_id = co.id
    join public.products p on p.id = oi.product_id
    where co.project_id = p_project_id
      and co.status <> 'cancelled'
      and p.category_id = p_product_category_id;
  elsif v_scope = 'product' then
    if p_product_id is null or p_product_category_id is not null then
      raise exception 'PROJECT_COMMISSION_PRODUCT_SCOPE_INVALID';
    end if;

    select
      count(distinct upper(co.currency_code::text)),
      min(upper(co.currency_code::text)),
      coalesce(sum(oi.line_total), 0)
    into v_currency_count, v_detected_currency, v_basis
    from public.customer_orders co
    join public.customer_order_items oi on oi.order_id = co.id
    where co.project_id = p_project_id
      and co.status <> 'cancelled'
      and oi.product_id = p_product_id;
  else
    raise exception 'PROJECT_COMMISSION_SCOPE_INVALID';
  end if;

  if v_currency_count = 0 or coalesce(v_basis, 0) <= 0 then
    raise exception 'PROJECT_COMMISSION_BASIS_EMPTY';
  end if;
  if v_currency_count > 1 then
    raise exception 'PROJECT_COMMISSION_SCOPE_MIXED_CURRENCY';
  end if;
  if v_detected_currency is distinct from v_currency then
    raise exception 'PROJECT_COMMISSION_CURRENCY_MISMATCH: scope is %, requested %', v_detected_currency, v_currency;
  end if;

  return round(v_basis, 2);
end;
$$;

create or replace function public.get_customer_project_commission_basis_preview(
  p_project_id uuid,
  p_scope_type text default 'project',
  p_currency_code text default 'USD',
  p_product_category_id uuid default null,
  p_product_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_VIEW_FORBIDDEN';
  end if;

  return private.project_commission_scope_basis(
    p_project_id,
    p_scope_type,
    p_currency_code,
    p_product_category_id,
    p_product_id
  );
end;
$$;

create or replace function public.create_customer_project_commission_obligation(
  p_project_id uuid,
  p_participant_id uuid,
  p_basis_type text,
  p_currency_code text,
  p_scope_type text default 'project',
  p_basis_amount numeric default null,
  p_rate numeric default null,
  p_flat_amount numeric default null,
  p_order_id uuid default null,
  p_product_category_id uuid default null,
  p_product_id uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
  v_scope text := lower(btrim(coalesce(p_scope_type, 'project')));
  v_basis_type text := lower(btrim(coalesce(p_basis_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_basis_amount numeric := null;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;
  if not exists (
    select 1
    from public.project_participants
    where id = p_participant_id
      and project_id = p_project_id
      and is_active
  ) then
    raise exception 'PROJECT_COMMISSION_PARTICIPANT_INVALID';
  end if;
  if p_order_id is not null and not exists (
    select 1
    from public.customer_orders
    where id = p_order_id
      and project_id = p_project_id
      and status <> 'cancelled'
  ) then
    raise exception 'PROJECT_COMMISSION_ORDER_PROJECT_MISMATCH';
  end if;

  if v_scope = 'category' then
    if p_product_category_id is null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_CATEGORY_SCOPE_INVALID';
    end if;
    if not exists (
      select 1
      from public.customer_orders co
      join public.customer_order_items oi on oi.order_id = co.id
      join public.products p on p.id = oi.product_id
      where co.project_id = p_project_id
        and co.status <> 'cancelled'
        and p.category_id = p_product_category_id
    ) then
      raise exception 'PROJECT_COMMISSION_CATEGORY_NOT_IN_PROJECT';
    end if;
  elsif v_scope = 'product' then
    if p_product_id is null or p_product_category_id is not null then
      raise exception 'PROJECT_COMMISSION_PRODUCT_SCOPE_INVALID';
    end if;
    if not exists (
      select 1
      from public.customer_orders co
      join public.customer_order_items oi on oi.order_id = co.id
      where co.project_id = p_project_id
        and co.status <> 'cancelled'
        and oi.product_id = p_product_id
    ) then
      raise exception 'PROJECT_COMMISSION_PRODUCT_NOT_IN_PROJECT';
    end if;
  elsif v_scope = 'project' then
    if p_product_category_id is not null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_PROJECT_SCOPE_INVALID';
    end if;
  else
    raise exception 'PROJECT_COMMISSION_SCOPE_INVALID';
  end if;

  if v_basis_type = 'percentage' then
    if p_rate is null or p_rate <= 0 or p_rate > 100 then
      raise exception 'PROJECT_COMMISSION_RATE_INVALID';
    end if;
    v_basis_amount := private.project_commission_scope_basis(
      p_project_id,
      v_scope,
      v_currency,
      case when v_scope = 'category' then p_product_category_id else null end,
      case when v_scope = 'product' then p_product_id else null end
    );
  elsif v_basis_type = 'fixed' then
    if p_flat_amount is null or p_flat_amount <= 0 then
      raise exception 'PROJECT_COMMISSION_FIXED_AMOUNT_INVALID';
    end if;
  else
    raise exception 'PROJECT_COMMISSION_BASIS_TYPE_INVALID';
  end if;

  insert into public.project_commission_obligations(
    project_id,
    participant_id,
    order_id,
    scope_type,
    product_category_id,
    product_id,
    basis_type,
    basis_amount,
    rate,
    flat_amount,
    currency_code,
    description,
    created_by
  ) values (
    p_project_id,
    p_participant_id,
    p_order_id,
    v_scope,
    case when v_scope = 'category' then p_product_category_id else null end,
    case when v_scope = 'product' then p_product_id else null end,
    v_basis_type,
    case when v_basis_type = 'percentage' then v_basis_amount else null end,
    case when v_basis_type = 'percentage' then p_rate else null end,
    case when v_basis_type = 'fixed' then p_flat_amount else null end,
    v_currency,
    nullif(btrim(p_description), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.can_view_project_commission(uuid,uuid) from public;
revoke all on function private.project_commission_scope_basis(uuid,text,text,uuid,uuid) from public;
revoke all on function public.get_customer_project_commission_basis_preview(uuid,text,text,uuid,uuid) from public;
revoke all on function public.get_customer_project_participants(uuid) from public;
revoke all on function public.create_customer_project_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) from public;

grant execute on function public.get_customer_project_commission_basis_preview(uuid,text,text,uuid,uuid) to authenticated;
grant execute on function public.get_customer_project_participants(uuid) to authenticated;
grant execute on function public.create_customer_project_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) to authenticated;

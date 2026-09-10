-- PB-6 follow-up: Sales may manage only their own external-service intake.
-- Finance/Admin/Super Admin retain full commission visibility and gain participant mutation.
-- Commission history stays append-only; Pending corrections use atomic cancel-and-replace.

begin;

-- Sales may discover only the external-service role taxonomy they are allowed to assign.
drop policy if exists project_participant_roles_internal_read on public.project_participant_roles;
drop policy if exists project_participant_roles_bounded_read on public.project_participant_roles;
create policy project_participant_roles_bounded_read
on public.project_participant_roles
for select
to authenticated
using (
  public.current_user_has_any_role(array['super_admin','admin','finance'])
  or (
    public.current_user_has_any_role(array['sales'])
    and role_key in ('designer','installer','contractor','referral_partner')
  )
);

-- Direct participant reads follow the same boundary as the RPC projection.
drop policy if exists project_participants_internal_read on public.project_participants;
drop policy if exists project_participants_bounded_read on public.project_participants;
create policy project_participants_bounded_read
on public.project_participants
for select
to authenticated
using (
  public.current_user_has_any_role(array['super_admin','admin','finance'])
  or (
    public.current_user_has_any_role(array['sales'])
    and created_by = auth.uid()
    and exists (
      select 1
      from public.project_participant_roles pr
      where pr.id = project_participants.role_id
        and pr.role_key in ('designer','installer','contractor','referral_partner')
    )
  )
);

create or replace function private.can_view_project_commission(
  p_project_id uuid,
  p_participant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    public.current_user_has_any_role(array['super_admin','admin','finance'])
    or (
      public.current_user_has_any_role(array['sales'])
      and exists (
        select 1
        from public.project_participants pp
        join public.project_participant_roles pr on pr.id = pp.role_id
        where pp.id = p_participant_id
          and pp.project_id = p_project_id
          and pp.created_by = auth.uid()
          and pr.role_key in ('designer','installer','contractor','referral_partner')
      )
    );
$$;

revoke all on function private.can_view_project_commission(uuid, uuid) from public;
revoke all on function private.can_view_project_commission(uuid, uuid) from anon;
revoke all on function private.can_view_project_commission(uuid, uuid) from authenticated;

-- Sales may read their own external-service obligations, but event history remains internal.
drop policy if exists project_commission_events_bounded_read on public.project_commission_events;
drop policy if exists project_commission_events_internal_read on public.project_commission_events;
create policy project_commission_events_internal_read
on public.project_commission_events
for select
to authenticated
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
    and (
      public.current_user_has_any_role(array['super_admin','admin','finance'])
      or (
        public.current_user_has_any_role(array['sales'])
        and pp.created_by = auth.uid()
        and pr.role_key in ('designer','installer','contractor','referral_partner')
      )
    )
  order by pp.is_active desc, pr.sort_order, display_name;
$$;

create or replace function public.set_customer_project_participant(
  p_project_id uuid,
  p_role_key text,
  p_employee_id uuid default null,
  p_customer_contact_id uuid default null,
  p_profile_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role public.project_participant_roles;
  v_id uuid;
  v_customer_id uuid;
  v_internal boolean := public.current_user_has_any_role(array['super_admin','admin','finance']);
  v_sales boolean := public.current_user_has_any_role(array['sales']);
begin
  if not v_internal and not v_sales then
    raise exception 'PROJECT_PARTICIPANT_MANAGE_FORBIDDEN';
  end if;
  if num_nonnulls(p_employee_id, p_customer_contact_id, p_profile_id) <> 1 then
    raise exception 'PROJECT_PARTICIPANT_SUBJECT_REQUIRED';
  end if;

  select * into v_role
  from public.project_participant_roles
  where role_key = lower(btrim(coalesce(p_role_key, '')))
    and is_active;
  if not found then raise exception 'PROJECT_PARTICIPANT_ROLE_INVALID'; end if;

  if v_role.role_key = 'sales_rep' then
    raise exception 'PROJECT_SALES_REP_CANONICAL: update customer_projects.sales_rep_id instead';
  end if;
  if not v_internal and v_role.role_key not in ('designer','installer','contractor','referral_partner') then
    raise exception 'PROJECT_PARTICIPANT_SALES_ROLE_FORBIDDEN';
  end if;

  select customer_id into v_customer_id
  from public.customer_projects
  where id = p_project_id;
  if v_customer_id is null then raise exception 'PROJECT_NOT_FOUND'; end if;

  if p_employee_id is not null and not exists (
    select 1 from public.hr_employees
    where id = p_employee_id and employment_status = 'active'
  ) then
    raise exception 'PROJECT_PARTICIPANT_EMPLOYEE_INACTIVE_OR_MISSING';
  end if;

  if p_customer_contact_id is not null and not exists (
    select 1 from public.customer_contacts
    where id = p_customer_contact_id
      and customer_id = v_customer_id
      and is_active
  ) then
    raise exception 'PROJECT_PARTICIPANT_CONTACT_CUSTOMER_MISMATCH_OR_INACTIVE';
  end if;

  if p_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = p_profile_id and is_active
  ) then
    raise exception 'PROJECT_PARTICIPANT_PROFILE_INACTIVE_OR_MISSING';
  end if;

  insert into public.project_participants(
    project_id, role_id, employee_id, customer_contact_id, profile_id,
    notes, created_by, updated_by
  ) values (
    p_project_id, v_role.id, p_employee_id, p_customer_contact_id, p_profile_id,
    nullif(btrim(p_notes), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.deactivate_customer_project_participant(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_PARTICIPANT_MANAGE_FORBIDDEN';
  end if;
  if exists(
    select 1 from public.project_participants
    where id = p_participant_id and source = 'project_sales_rep'
  ) then
    raise exception 'PROJECT_SALES_REP_CANONICAL: update customer_projects.sales_rep_id instead';
  end if;
  update public.project_participants
  set is_active = false,
      ended_at = coalesce(ended_at, now()),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_participant_id and is_active;
end;
$$;

-- Sales percentage preview is revenue-only by design. It cannot enter the gross-profit path.
create or replace function public.get_customer_project_external_service_commission_preview(
  p_project_id uuid,
  p_scope_type text default 'project',
  p_currency_code text default 'USD',
  p_product_category_id uuid default null,
  p_product_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_revenue numeric;
begin
  if not public.current_user_has_any_role(array['sales']) then
    raise exception 'PROJECT_COMMISSION_VIEW_FORBIDDEN';
  end if;

  v_revenue := private.project_commission_scope_basis(
    p_project_id,
    p_scope_type,
    v_currency,
    p_product_category_id,
    p_product_id
  );

  return jsonb_build_object(
    'available', true,
    'mode', 'revenue',
    'revenue_amount', v_revenue,
    'cost_amount', null,
    'basis_amount', v_revenue,
    'missing_cost_line_count', 0,
    'currency_code', v_currency,
    'error_code', null
  );
end;
$$;

create or replace function public.create_customer_project_external_service_commission_obligation(
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
  if not public.current_user_has_any_role(array['sales']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;

  if v_basis_type = 'gross_profit_percentage' then
    raise exception 'PROJECT_COMMISSION_SALES_GROSS_PROFIT_FORBIDDEN';
  end if;
  if v_basis_type not in ('fixed','percentage') then
    raise exception 'PROJECT_COMMISSION_BASIS_TYPE_INVALID';
  end if;

  if not exists (
    select 1
    from public.project_participants pp
    join public.project_participant_roles pr on pr.id = pp.role_id
    where pp.id = p_participant_id
      and pp.project_id = p_project_id
      and pp.is_active
      and pp.created_by = auth.uid()
      and pr.role_key in ('designer','installer','contractor','referral_partner')
  ) then
    raise exception 'PROJECT_COMMISSION_SALES_PARTICIPANT_FORBIDDEN';
  end if;

  if p_order_id is not null and not exists (
    select 1 from public.customer_orders
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
  else
    if p_flat_amount is null or p_flat_amount <= 0 then
      raise exception 'PROJECT_COMMISSION_FIXED_AMOUNT_INVALID';
    end if;
  end if;

  insert into public.project_commission_obligations(
    project_id, participant_id, order_id, scope_type, product_category_id, product_id,
    basis_type, basis_amount, rate, flat_amount, currency_code, description, created_by
  ) values (
    p_project_id, p_participant_id, p_order_id, v_scope,
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

-- Finance/Admin/Super Admin correct Pending terms without rewriting the old obligation.
create or replace function public.replace_customer_project_commission_obligation(
  p_obligation_id uuid,
  p_basis_type text,
  p_currency_code text,
  p_scope_type text default 'project',
  p_rate numeric default null,
  p_flat_amount numeric default null,
  p_order_id uuid default null,
  p_product_category_id uuid default null,
  p_product_id uuid default null,
  p_description text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old public.project_commission_obligations;
  v_new_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'PROJECT_COMMISSION_REPLACEMENT_REASON_REQUIRED';
  end if;

  select * into v_old
  from public.project_commission_obligations
  where id = p_obligation_id
  for update;
  if not found then raise exception 'PROJECT_COMMISSION_NOT_FOUND'; end if;
  if private.current_project_commission_status(v_old.id) <> 'pending' then
    raise exception 'PROJECT_COMMISSION_REPLACE_PENDING_ONLY';
  end if;

  perform public.append_customer_project_commission_event(
    v_old.id,
    'cancelled',
    null,
    concat('Replaced: ', btrim(p_reason)),
    null
  );

  v_new_id := public.create_customer_project_commission_obligation(
    v_old.project_id,
    v_old.participant_id,
    p_basis_type,
    p_currency_code,
    p_scope_type,
    null,
    p_rate,
    p_flat_amount,
    p_order_id,
    p_product_category_id,
    p_product_id,
    p_description
  );

  return v_new_id;
end;
$$;

revoke all on function public.get_customer_project_external_service_commission_preview(uuid,text,text,uuid,uuid) from public;
revoke all on function public.get_customer_project_external_service_commission_preview(uuid,text,text,uuid,uuid) from anon;
grant execute on function public.get_customer_project_external_service_commission_preview(uuid,text,text,uuid,uuid) to authenticated;

revoke all on function public.create_customer_project_external_service_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) from public;
revoke all on function public.create_customer_project_external_service_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) from anon;
grant execute on function public.create_customer_project_external_service_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) to authenticated;

revoke all on function public.replace_customer_project_commission_obligation(uuid,text,text,text,numeric,numeric,uuid,uuid,uuid,text,text) from public;
revoke all on function public.replace_customer_project_commission_obligation(uuid,text,text,text,numeric,numeric,uuid,uuid,uuid,text,text) from anon;
grant execute on function public.replace_customer_project_commission_obligation(uuid,text,text,text,numeric,numeric,uuid,uuid,uuid,text,text) to authenticated;

-- Existing guarded RPCs stay authenticated-only.
revoke all on function public.get_customer_project_participants(uuid) from public;
revoke all on function public.get_customer_project_participants(uuid) from anon;
grant execute on function public.get_customer_project_participants(uuid) to authenticated;
revoke all on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) from public;
revoke all on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) from anon;
grant execute on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) to authenticated;
revoke all on function public.deactivate_customer_project_participant(uuid) from public;
revoke all on function public.deactivate_customer_project_participant(uuid) from anon;
grant execute on function public.deactivate_customer_project_participant(uuid) to authenticated;

commit;

-- PB-6 hardening: fail-closed Project scope validation, Finance currency safety, role configurability and private-function execute lockdown.

alter table public.project_commission_obligations
  drop constraint if exists project_commission_scope_shape;

alter table public.project_commission_obligations
  add constraint project_commission_scope_shape check (
    (scope_type = 'project' and product_category_id is null and product_id is null)
    or (scope_type = 'category' and product_category_id is not null and product_id is null)
    or (scope_type = 'product' and product_category_id is null and product_id is not null)
  );

create or replace function private.can_view_project_commission(p_project_id uuid, p_participant_id uuid)
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
        left join public.hr_employees he on he.id = pp.employee_id
        where pp.id = p_participant_id
          and pp.project_id = p_project_id
          and (pp.profile_id = auth.uid() or he.user_id = auth.uid())
      )
    );
$$;

create or replace function public.upsert_customer_project_participant_role(
  p_role_key text,
  p_label text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_key text := lower(btrim(coalesce(p_role_key, '')));
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'PROJECT_PARTICIPANT_ROLE_MANAGE_FORBIDDEN';
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'PROJECT_PARTICIPANT_ROLE_KEY_INVALID';
  end if;
  if length(v_label) = 0 then
    raise exception 'PROJECT_PARTICIPANT_ROLE_LABEL_REQUIRED';
  end if;

  insert into public.project_participant_roles(role_key, label, is_system, is_active, created_by)
  values (v_key, v_label, false, coalesce(p_is_active, true), auth.uid())
  on conflict (role_key) do update
  set label = excluded.label,
      is_active = excluded.is_active,
      updated_at = now()
  returning id into v_id;

  return v_id;
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
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.project_participants
    where id = p_participant_id and project_id = p_project_id and is_active
  ) then
    raise exception 'PROJECT_COMMISSION_PARTICIPANT_INVALID';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.customer_orders where id = p_order_id and project_id = p_project_id
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

  insert into public.project_commission_obligations(
    project_id, participant_id, order_id, scope_type, product_category_id, product_id,
    basis_type, basis_amount, rate, flat_amount, currency_code, description, created_by
  ) values (
    p_project_id, p_participant_id, p_order_id, v_scope,
    case when v_scope = 'category' then p_product_category_id else null end,
    case when v_scope = 'product' then p_product_id else null end,
    lower(p_basis_type), p_basis_amount, p_rate, p_flat_amount,
    upper(p_currency_code), nullif(btrim(p_description), ''), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.get_customer_project_commissions(uuid);

create function public.get_customer_project_commissions(p_project_id uuid)
returns table(
  obligation_id uuid,
  participant_id uuid,
  participant_name text,
  role_label text,
  scope_type text,
  basis_type text,
  basis_amount numeric,
  rate numeric,
  flat_amount numeric,
  currency_code text,
  base_amount numeric,
  current_amount numeric,
  status text,
  paid_amount numeric,
  payout_currency_state text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    o.id,
    o.participant_id,
    coalesce(
      nullif(btrim(concat_ws(' ', he.first_name, he.last_name)), ''),
      nullif(btrim(cc.first_name || ' ' || cc.last_name), ''),
      nullif(btrim(p.full_name), ''),
      p.email,
      'Unnamed participant'
    ),
    pr.label,
    o.scope_type,
    o.basis_type,
    o.basis_amount,
    o.rate,
    o.flat_amount,
    o.currency_code::text,
    o.base_amount,
    o.base_amount + coalesce((
      select sum(e.amount_delta)
      from public.project_commission_events e
      where e.obligation_id = o.id
    ), 0),
    private.current_project_commission_status(o.id),
    case
      when not public.current_user_has_any_role(array['super_admin','admin','finance']) then null
      when exists (
        select 1
        from public.finance_transaction_links l
        join public.finance_transactions ft on ft.id = l.transaction_id and ft.status = 'posted'
        where l.source_document_type = 'project_commission_obligation'
          and l.source_document_id = o.id
          and upper(ft.currency_code::text) <> upper(o.currency_code::text)
      ) then null
      else coalesce((
        select sum(l.allocated_amount)
        from public.finance_transaction_links l
        join public.finance_transactions ft on ft.id = l.transaction_id and ft.status = 'posted'
        where l.source_document_type = 'project_commission_obligation'
          and l.source_document_id = o.id
          and upper(ft.currency_code::text) = upper(o.currency_code::text)
      ), 0)
    end,
    case
      when not public.current_user_has_any_role(array['super_admin','admin','finance']) then 'restricted'
      when exists (
        select 1
        from public.finance_transaction_links l
        join public.finance_transactions ft on ft.id = l.transaction_id and ft.status = 'posted'
        where l.source_document_type = 'project_commission_obligation'
          and l.source_document_id = o.id
          and upper(ft.currency_code::text) <> upper(o.currency_code::text)
      ) then 'mixed_currency'
      else 'ok'
    end,
    o.created_at
  from public.project_commission_obligations o
  join public.project_participants pp on pp.id = o.participant_id
  join public.project_participant_roles pr on pr.id = pp.role_id
  left join public.hr_employees he on he.id = pp.employee_id
  left join public.customer_contacts cc on cc.id = pp.customer_contact_id
  left join public.profiles p on p.id = pp.profile_id
  where o.project_id = p_project_id
    and private.can_view_project_commission(o.project_id, o.participant_id)
  order by o.created_at desc;
$$;

revoke all on function public.upsert_customer_project_participant_role(text,text,boolean) from public;
revoke all on function public.get_customer_project_commissions(uuid) from public;
grant execute on function public.upsert_customer_project_participant_role(text,text,boolean) to authenticated;
grant execute on function public.get_customer_project_commissions(uuid) to authenticated;

revoke all on function private.reject_project_commission_history_rewrite() from public;
revoke all on function private.current_project_commission_status(uuid) from public;
revoke all on function private.can_view_project_commission(uuid,uuid) from public;
revoke all on function private.sync_project_sales_rep_participant() from public;

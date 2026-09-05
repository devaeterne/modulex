-- PB-7 — Project Change Orders
-- Change Orders authorize Project business changes but never mutate canonical Order,
-- Procurement, Invoice, Inventory, or Finance truth on approval.

create table if not exists public.customer_project_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  change_order_number integer not null check (change_order_number > 0),
  title text not null check (length(btrim(title)) > 0),
  reason text null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled')),
  correction_of_change_order_id uuid null references public.customer_project_change_orders(id) on update cascade on delete restrict,
  created_by uuid null references public.profiles(id) on delete set null,
  submitted_by uuid null references public.profiles(id) on delete set null,
  submitted_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  review_note text null,
  cancelled_by uuid null references public.profiles(id) on delete set null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint customer_project_change_orders_number_uq unique (project_id, change_order_number),
  constraint customer_project_change_orders_correction_not_self check (correction_of_change_order_id is null or correction_of_change_order_id <> id)
);

create index if not exists customer_project_change_orders_project_idx
  on public.customer_project_change_orders(project_id, created_at desc);
create index if not exists customer_project_change_orders_status_idx
  on public.customer_project_change_orders(project_id, status, created_at desc);

create table if not exists public.customer_project_change_order_lines (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.customer_project_change_orders(id) on update cascade on delete restrict,
  line_no integer not null check (line_no > 0),
  effect_type text not null check (effect_type in ('add_scope','remove_scope','quantity_change','price_adjustment','customer_credit','vendor_credit','other')),
  target_order_id uuid null references public.customer_orders(id) on update cascade on delete restrict,
  target_order_item_id uuid null references public.customer_order_items(id) on update cascade on delete restrict,
  product_id uuid null references public.products(id) on update cascade on delete restrict,
  description text not null check (length(btrim(description)) > 0),
  quantity_delta numeric(18,4) null,
  sell_amount_delta numeric(18,2) not null default 0,
  sell_currency_code varchar(3) not null check (sell_currency_code = upper(sell_currency_code) and sell_currency_code ~ '^[A-Z]{3}$'),
  expected_cost_delta numeric(18,2) null,
  cost_currency_code varchar(3) null check (cost_currency_code is null or (cost_currency_code = upper(cost_currency_code) and cost_currency_code ~ '^[A-Z]{3}$')),
  vendor_code text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint customer_project_change_order_lines_no_uq unique (change_order_id, line_no),
  constraint customer_project_change_order_lines_target_shape check (target_order_item_id is null or target_order_id is not null),
  constraint customer_project_change_order_lines_cost_shape check (
    (expected_cost_delta is null and cost_currency_code is null)
    or (expected_cost_delta is not null and cost_currency_code is not null)
  )
);

create index if not exists customer_project_change_order_lines_change_idx
  on public.customer_project_change_order_lines(change_order_id, line_no);
create index if not exists customer_project_change_order_lines_order_idx
  on public.customer_project_change_order_lines(target_order_id)
  where target_order_id is not null;

create table if not exists public.customer_project_change_order_events (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.customer_project_change_orders(id) on update cascade on delete restrict,
  event_type text not null check (event_type in ('created','submitted','approved','rejected','cancelled','application_linked')),
  status_after text not null check (status_after in ('draft','submitted','approved','rejected','cancelled')),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_project_change_order_events_change_idx
  on public.customer_project_change_order_events(change_order_id, created_at, id);

create table if not exists public.customer_project_change_order_applications (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.customer_project_change_orders(id) on update cascade on delete restrict,
  order_id uuid not null references public.customer_orders(id) on update cascade on delete restrict,
  order_revision_id uuid not null unique references public.customer_order_revisions(id) on update cascade on delete restrict,
  canonical_sell_delta numeric(18,2) not null,
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and currency_code ~ '^[A-Z]{3}$'),
  linked_by uuid null references public.profiles(id) on delete set null,
  linked_at timestamptz not null default now(),
  constraint customer_project_change_order_applications_change_revision_uq unique (change_order_id, order_revision_id)
);

create index if not exists customer_project_change_order_applications_change_idx
  on public.customer_project_change_order_applications(change_order_id, linked_at, id);

create or replace function private.can_view_customer_project_change_orders()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin','sales','finance']);
$$;

create or replace function private.can_manage_customer_project_change_orders()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin','sales']);
$$;

create or replace function private.can_review_customer_project_change_orders()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin']);
$$;

create or replace function private.can_view_customer_project_change_order_cost()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin','finance']);
$$;

create or replace function private.guard_customer_project_change_order_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PROJECT_CHANGE_ORDER_IMMUTABLE: Change Order history cannot be deleted';
  end if;

  if old.status <> 'draft' and (
    new.title is distinct from old.title
    or new.reason is distinct from old.reason
    or new.correction_of_change_order_id is distinct from old.correction_of_change_order_id
  ) then
    raise exception 'PROJECT_CHANGE_ORDER_IMMUTABLE: submitted commercial content cannot be rewritten';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('submitted','cancelled'))
    or (old.status = 'submitted' and new.status in ('approved','rejected','cancelled'))
  ) then
    raise exception 'PROJECT_CHANGE_ORDER_STATE_INVALID: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customer_project_change_orders_guard on public.customer_project_change_orders;
create trigger trg_customer_project_change_orders_guard
before update or delete on public.customer_project_change_orders
for each row execute function private.guard_customer_project_change_order_update();

create or replace function private.guard_customer_project_change_order_line()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_change_order_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_change_order_id := old.change_order_id;
  else
    v_change_order_id := new.change_order_id;
  end if;

  select co.status into v_status
  from public.customer_project_change_orders co
  where co.id = v_change_order_id;

  if v_status is null then
    raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND';
  end if;
  if v_status <> 'draft' then
    raise exception 'PROJECT_CHANGE_ORDER_LINE_IMMUTABLE: lines can change only while Draft';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_customer_project_change_order_lines_guard on public.customer_project_change_order_lines;
create trigger trg_customer_project_change_order_lines_guard
before insert or update or delete on public.customer_project_change_order_lines
for each row execute function private.guard_customer_project_change_order_line();

create or replace function private.reject_customer_project_change_order_event_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'PROJECT_CHANGE_ORDER_EVENT_APPEND_ONLY: lifecycle events cannot be rewritten';
end;
$$;

drop trigger if exists trg_customer_project_change_order_events_append_only on public.customer_project_change_order_events;
create trigger trg_customer_project_change_order_events_append_only
before update or delete on public.customer_project_change_order_events
for each row execute function private.reject_customer_project_change_order_event_rewrite();

create or replace function private.reject_customer_project_change_order_application_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_APPEND_ONLY: application links cannot be rewritten';
end;
$$;

drop trigger if exists trg_customer_project_change_order_applications_append_only on public.customer_project_change_order_applications;
create trigger trg_customer_project_change_order_applications_append_only
before update or delete on public.customer_project_change_order_applications
for each row execute function private.reject_customer_project_change_order_application_rewrite();

create or replace function private.append_customer_project_change_order_event(
  p_change_order_id uuid,
  p_event_type text,
  p_status_after text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  insert into public.customer_project_change_order_events(
    change_order_id, event_type, status_after, note, metadata, created_by
  ) values (
    p_change_order_id, p_event_type, p_status_after, nullif(btrim(p_note),''), coalesce(p_metadata,'{}'::jsonb), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.customer_project_change_order_application_state(p_change_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_status text;
  v_approved_sell numeric(18,2);
  v_line_currency_count integer;
  v_line_currency text;
  v_application_count integer;
  v_linked_sell numeric(18,2);
  v_application_currency_count integer;
  v_application_currency text;
  v_application_status text;
  v_reconciliation_state text;
begin
  select status into v_status
  from public.customer_project_change_orders
  where id = p_change_order_id;

  select
    round(coalesce(sum(l.sell_amount_delta),0),2),
    count(distinct l.sell_currency_code),
    min(l.sell_currency_code)::text
  into v_approved_sell, v_line_currency_count, v_line_currency
  from public.customer_project_change_order_lines l
  where l.change_order_id = p_change_order_id;

  select
    count(*)::integer,
    round(coalesce(sum(a.canonical_sell_delta),0),2),
    count(distinct a.currency_code),
    min(a.currency_code)::text
  into v_application_count, v_linked_sell, v_application_currency_count, v_application_currency
  from public.customer_project_change_order_applications a
  where a.change_order_id = p_change_order_id;

  if v_status <> 'approved' then
    v_application_status := 'not_applicable';
    v_reconciliation_state := 'not_applicable';
  elsif v_application_count = 0 then
    v_application_status := 'pending';
    v_reconciliation_state := 'pending';
  elsif v_line_currency_count <> 1
     or v_application_currency_count <> 1
     or v_line_currency is distinct from v_application_currency then
    v_application_status := 'partial';
    v_reconciliation_state := 'mixed_currency';
  elsif abs(v_linked_sell - v_approved_sell) <= 0.01 then
    v_application_status := 'applied';
    v_reconciliation_state := 'matched';
  else
    v_application_status := 'partial';
    v_reconciliation_state := 'delta_mismatch';
  end if;

  return jsonb_build_object(
    'application_status', v_application_status,
    'reconciliation_state', v_reconciliation_state,
    'approved_sell_delta', case when v_line_currency_count = 1 then v_approved_sell else null end,
    'sell_currency_code', case when v_line_currency_count = 1 then v_line_currency else null end,
    'linked_sell_delta', case when v_application_currency_count <= 1 then v_linked_sell else null end,
    'application_currency_code', case when v_application_currency_count = 1 then v_application_currency else null end,
    'application_count', v_application_count
  );
end;
$$;

create or replace function public.create_customer_project_change_order(
  p_project_id uuid,
  p_title text,
  p_reason text default null,
  p_correction_of_change_order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_number integer;
  v_id uuid;
begin
  if not private.can_manage_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_project_id is null or not exists (select 1 from public.customer_projects where id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if length(btrim(coalesce(p_title,''))) = 0 then
    raise exception 'PROJECT_CHANGE_ORDER_TITLE_REQUIRED';
  end if;
  if p_correction_of_change_order_id is not null and not exists (
    select 1 from public.customer_project_change_orders co
    where co.id = p_correction_of_change_order_id and co.project_id = p_project_id
  ) then
    raise exception 'PROJECT_CHANGE_ORDER_CORRECTION_PROJECT_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer_project_change_order:' || p_project_id::text, 0));
  select coalesce(max(change_order_number),0) + 1
  into v_number
  from public.customer_project_change_orders
  where project_id = p_project_id;

  insert into public.customer_project_change_orders(
    project_id, change_order_number, title, reason, correction_of_change_order_id, created_by, updated_by
  ) values (
    p_project_id, v_number, btrim(p_title), nullif(btrim(p_reason),''), p_correction_of_change_order_id, auth.uid(), auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_change_order_event(v_id, 'created', 'draft', null, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.update_customer_project_change_order_draft(
  p_change_order_id uuid,
  p_title text,
  p_reason text default null,
  p_correction_of_change_order_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
begin
  if not private.can_manage_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title,''))) = 0 then
    raise exception 'PROJECT_CHANGE_ORDER_TITLE_REQUIRED';
  end if;

  select * into v_change
  from public.customer_project_change_orders
  where id = p_change_order_id
  for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status <> 'draft' then raise exception 'PROJECT_CHANGE_ORDER_NOT_DRAFT'; end if;
  if p_correction_of_change_order_id = p_change_order_id then raise exception 'PROJECT_CHANGE_ORDER_CORRECTION_SELF'; end if;
  if p_correction_of_change_order_id is not null and not exists (
    select 1 from public.customer_project_change_orders co
    where co.id = p_correction_of_change_order_id and co.project_id = v_change.project_id
  ) then
    raise exception 'PROJECT_CHANGE_ORDER_CORRECTION_PROJECT_MISMATCH';
  end if;

  update public.customer_project_change_orders
  set title = btrim(p_title),
      reason = nullif(btrim(p_reason),''),
      correction_of_change_order_id = p_correction_of_change_order_id,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_change_order_id;
end;
$$;

create or replace function public.set_customer_project_change_order_lines(
  p_change_order_id uuid,
  p_lines jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_line jsonb;
  v_line_no integer := 0;
  v_effect_type text;
  v_target_order_id uuid;
  v_target_order_item_id uuid;
  v_product_id uuid;
  v_description text;
  v_quantity_delta numeric;
  v_sell_delta numeric;
  v_sell_currency text;
  v_expected_cost numeric;
  v_cost_currency text;
  v_vendor_code text;
begin
  if not private.can_manage_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'PROJECT_CHANGE_ORDER_LINES_ARRAY_REQUIRED';
  end if;

  select * into v_change
  from public.customer_project_change_orders
  where id = p_change_order_id
  for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status <> 'draft' then raise exception 'PROJECT_CHANGE_ORDER_NOT_DRAFT'; end if;

  delete from public.customer_project_change_order_lines where change_order_id = p_change_order_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    v_effect_type := lower(coalesce(v_line->>'effect_type',''));
    v_target_order_id := nullif(v_line->>'target_order_id','')::uuid;
    v_target_order_item_id := nullif(v_line->>'target_order_item_id','')::uuid;
    v_product_id := nullif(v_line->>'product_id','')::uuid;
    v_description := nullif(btrim(coalesce(v_line->>'description','')), '');
    v_quantity_delta := nullif(v_line->>'quantity_delta','')::numeric;
    v_sell_delta := coalesce(nullif(v_line->>'sell_amount_delta','')::numeric,0);
    v_sell_currency := upper(coalesce(v_line->>'sell_currency_code',''));
    v_expected_cost := nullif(v_line->>'expected_cost_delta','')::numeric;
    v_cost_currency := nullif(upper(coalesce(v_line->>'cost_currency_code','')), '');
    v_vendor_code := nullif(btrim(coalesce(v_line->>'vendor_code','')), '');

    if v_effect_type not in ('add_scope','remove_scope','quantity_change','price_adjustment','customer_credit','vendor_credit','other') then
      raise exception 'PROJECT_CHANGE_ORDER_EFFECT_TYPE_INVALID';
    end if;
    if v_description is null then raise exception 'PROJECT_CHANGE_ORDER_LINE_DESCRIPTION_REQUIRED'; end if;
    if v_sell_currency !~ '^[A-Z]{3}$' then raise exception 'PROJECT_CHANGE_ORDER_SELL_CURRENCY_INVALID'; end if;
    if (v_expected_cost is null) <> (v_cost_currency is null) then raise exception 'PROJECT_CHANGE_ORDER_COST_CURRENCY_REQUIRED'; end if;
    if v_cost_currency is not null and v_cost_currency !~ '^[A-Z]{3}$' then raise exception 'PROJECT_CHANGE_ORDER_COST_CURRENCY_INVALID'; end if;

    if v_target_order_id is not null and not exists (
      select 1 from public.customer_orders o where o.id = v_target_order_id and o.project_id = v_change.project_id
    ) then raise exception 'PROJECT_CHANGE_ORDER_ORDER_PROJECT_MISMATCH'; end if;
    if v_target_order_item_id is not null and (
      v_target_order_id is null or not exists (
        select 1 from public.customer_order_items oi where oi.id = v_target_order_item_id and oi.order_id = v_target_order_id
      )
    ) then raise exception 'PROJECT_CHANGE_ORDER_ITEM_ORDER_MISMATCH'; end if;
    if v_product_id is not null and not exists (select 1 from public.products p where p.id = v_product_id) then
      raise exception 'PROJECT_CHANGE_ORDER_PRODUCT_NOT_FOUND';
    end if;

    insert into public.customer_project_change_order_lines(
      change_order_id, line_no, effect_type, target_order_id, target_order_item_id, product_id,
      description, quantity_delta, sell_amount_delta, sell_currency_code,
      expected_cost_delta, cost_currency_code, vendor_code, created_by, updated_by
    ) values (
      p_change_order_id, v_line_no, v_effect_type, v_target_order_id, v_target_order_item_id, v_product_id,
      v_description, v_quantity_delta, round(v_sell_delta,2), v_sell_currency,
      case when v_expected_cost is null then null else round(v_expected_cost,2) end,
      v_cost_currency, v_vendor_code, auth.uid(), auth.uid()
    );
  end loop;

  return v_line_no;
end;
$$;

create or replace function public.submit_customer_project_change_order(p_change_order_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
begin
  if not private.can_manage_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_change from public.customer_project_change_orders where id = p_change_order_id for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status = 'submitted' then return 'submitted'; end if;
  if v_change.status <> 'draft' then raise exception 'PROJECT_CHANGE_ORDER_SUBMIT_INVALID_STATE'; end if;
  if not exists (select 1 from public.customer_project_change_order_lines where change_order_id = p_change_order_id) then
    raise exception 'PROJECT_CHANGE_ORDER_LINES_REQUIRED';
  end if;

  update public.customer_project_change_orders
  set status='submitted', submitted_by=auth.uid(), submitted_at=now(), updated_by=auth.uid(), updated_at=now()
  where id=p_change_order_id;
  perform private.append_customer_project_change_order_event(p_change_order_id,'submitted','submitted',null,'{}'::jsonb);
  return 'submitted';
end;
$$;

create or replace function public.review_customer_project_change_order(
  p_change_order_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_decision text := lower(coalesce(p_decision,''));
begin
  if not private.can_review_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_decision not in ('approved','rejected') then raise exception 'PROJECT_CHANGE_ORDER_DECISION_INVALID'; end if;

  select * into v_change from public.customer_project_change_orders where id=p_change_order_id for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status = v_decision then return v_decision; end if;
  if v_change.status <> 'submitted' then raise exception 'PROJECT_CHANGE_ORDER_REVIEW_INVALID_STATE'; end if;

  update public.customer_project_change_orders
  set status=v_decision, reviewed_by=auth.uid(), reviewed_at=now(), review_note=nullif(btrim(p_note),''), updated_by=auth.uid(), updated_at=now()
  where id=p_change_order_id;
  perform private.append_customer_project_change_order_event(p_change_order_id,v_decision,v_decision,p_note,'{}'::jsonb);
  return v_decision;
end;
$$;

create or replace function public.cancel_customer_project_change_order(
  p_change_order_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
begin
  if not private.can_review_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_CANCEL_FORBIDDEN' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'PROJECT_CHANGE_ORDER_CANCEL_REASON_REQUIRED'; end if;
  select * into v_change from public.customer_project_change_orders where id=p_change_order_id for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status = 'cancelled' then return 'cancelled'; end if;
  if v_change.status not in ('draft','submitted') then raise exception 'PROJECT_CHANGE_ORDER_CANCEL_INVALID_STATE'; end if;

  update public.customer_project_change_orders
  set status='cancelled', cancelled_by=auth.uid(), cancelled_at=now(), updated_by=auth.uid(), updated_at=now()
  where id=p_change_order_id;
  perform private.append_customer_project_change_order_event(p_change_order_id,'cancelled','cancelled',p_reason,'{}'::jsonb);
  return 'cancelled';
end;
$$;

create or replace function public.link_customer_project_change_order_revision(
  p_change_order_id uuid,
  p_order_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_revision public.customer_order_revisions%rowtype;
  v_next_revision public.customer_order_revisions%rowtype;
  v_order public.customer_orders%rowtype;
  v_existing public.customer_project_change_order_applications%rowtype;
  v_before_subtotal numeric;
  v_before_discount numeric;
  v_after_subtotal numeric;
  v_after_discount numeric;
  v_before_currency text;
  v_after_currency text;
  v_delta numeric(18,2);
  v_id uuid;
begin
  if not private.can_review_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_change from public.customer_project_change_orders where id=p_change_order_id for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status <> 'approved' then raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_REQUIRES_APPROVAL'; end if;

  select * into v_revision from public.customer_order_revisions where id=p_order_revision_id;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_REVISION_NOT_FOUND'; end if;
  select * into v_order from public.customer_orders where id=v_revision.order_id;
  if not found or v_order.project_id is distinct from v_change.project_id then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_PROJECT_MISMATCH';
  end if;
  if v_change.reviewed_at is null or v_revision.created_at < v_change.reviewed_at then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_PREDATES_APPROVAL';
  end if;
  if exists (select 1 from public.customer_project_change_order_lines where change_order_id=p_change_order_id and target_order_id is not null)
     and not exists (select 1 from public.customer_project_change_order_lines where change_order_id=p_change_order_id and target_order_id=v_revision.order_id) then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_TARGET_MISMATCH';
  end if;

  select * into v_existing from public.customer_project_change_order_applications where order_revision_id=p_order_revision_id;
  if found then
    if v_existing.change_order_id = p_change_order_id then return v_existing.id; end if;
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_ALREADY_LINKED';
  end if;

  v_before_subtotal := coalesce(nullif(v_revision.order_snapshot->>'subtotal','')::numeric,0);
  v_before_discount := coalesce(nullif(v_revision.order_snapshot->>'discount_amount','')::numeric,0);
  v_before_currency := upper(coalesce(v_revision.order_snapshot->>'currency_code',''));

  select * into v_next_revision
  from public.customer_order_revisions r
  where r.order_id=v_revision.order_id and r.revision_number > v_revision.revision_number
  order by r.revision_number
  limit 1;

  if found then
    v_after_subtotal := coalesce(nullif(v_next_revision.order_snapshot->>'subtotal','')::numeric,0);
    v_after_discount := coalesce(nullif(v_next_revision.order_snapshot->>'discount_amount','')::numeric,0);
    v_after_currency := upper(coalesce(v_next_revision.order_snapshot->>'currency_code',''));
  else
    v_after_subtotal := coalesce(v_order.subtotal,0);
    v_after_discount := coalesce(v_order.discount_amount,0);
    v_after_currency := upper(v_order.currency_code::text);
  end if;

  if v_before_currency !~ '^[A-Z]{3}$' or v_after_currency !~ '^[A-Z]{3}$' or v_before_currency <> v_after_currency then
    raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_MIXED_CURRENCY';
  end if;

  v_delta := round((v_after_subtotal - v_after_discount) - (v_before_subtotal - v_before_discount),2);

  insert into public.customer_project_change_order_applications(
    change_order_id, order_id, order_revision_id, canonical_sell_delta, currency_code, linked_by
  ) values (
    p_change_order_id, v_revision.order_id, p_order_revision_id, v_delta, v_after_currency, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_change_order_event(
    p_change_order_id,
    'application_linked',
    'approved',
    null,
    jsonb_build_object('application_id',v_id,'order_id',v_revision.order_id,'order_revision_id',p_order_revision_id,'canonical_sell_delta',v_delta,'currency_code',v_after_currency)
  );
  return v_id;
end;
$$;

create or replace function public.get_customer_project_change_orders(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if not private.can_view_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_VIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customer_projects where id=p_project_id) then raise exception 'PROJECT_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(row_json order by change_order_number desc),'[]'::jsonb)
  into v_result
  from (
    select
      co.change_order_number,
      jsonb_build_object(
        'id',co.id,
        'project_id',co.project_id,
        'change_order_number',co.change_order_number,
        'title',co.title,
        'reason',co.reason,
        'status',co.status,
        'correction_of_change_order_id',co.correction_of_change_order_id,
        'created_at',co.created_at,
        'submitted_at',co.submitted_at,
        'reviewed_at',co.reviewed_at,
        'cancelled_at',co.cancelled_at,
        'application_status',state.data->>'application_status',
        'reconciliation_state',state.data->>'reconciliation_state',
        'approved_sell_delta',state.data->'approved_sell_delta',
        'sell_currency_code',state.data->>'sell_currency_code',
        'linked_sell_delta',state.data->'linked_sell_delta',
        'application_count',state.data->'application_count',
        'expected_cost_delta',case when private.can_view_customer_project_change_order_cost() then costs.expected_cost_delta else null end,
        'cost_currency_code',case when private.can_view_customer_project_change_order_cost() then costs.cost_currency_code else null end,
        'vendor_code',case when private.can_view_customer_project_change_order_cost() then costs.vendor_code else null end
      ) as row_json
    from public.customer_project_change_orders co
    cross join lateral (select private.customer_project_change_order_application_state(co.id) as data) state
    cross join lateral (
      select
        case when count(*) = count(l.expected_cost_delta) and count(distinct l.cost_currency_code) <= 1
          then round(coalesce(sum(l.expected_cost_delta),0),2) else null end as expected_cost_delta,
        case when count(distinct l.cost_currency_code) = 1 then min(l.cost_currency_code)::text else null end as cost_currency_code,
        case when count(distinct nullif(l.vendor_code,'')) = 1 then min(l.vendor_code) else null end as vendor_code
      from public.customer_project_change_order_lines l
      where l.change_order_id=co.id
    ) costs
    where co.project_id=p_project_id
  ) q;

  return v_result;
end;
$$;

create or replace function public.get_customer_project_change_order(p_change_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_state jsonb;
  v_result jsonb;
  v_can_view_cost boolean;
begin
  if not private.can_view_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_VIEW_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_change from public.customer_project_change_orders where id=p_change_order_id;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  v_state := private.customer_project_change_order_application_state(p_change_order_id);
  v_can_view_cost := private.can_view_customer_project_change_order_cost();

  select jsonb_build_object(
    'id',v_change.id,
    'project_id',v_change.project_id,
    'change_order_number',v_change.change_order_number,
    'title',v_change.title,
    'reason',v_change.reason,
    'status',v_change.status,
    'correction_of_change_order_id',v_change.correction_of_change_order_id,
    'created_at',v_change.created_at,
    'submitted_at',v_change.submitted_at,
    'reviewed_at',v_change.reviewed_at,
    'review_note',v_change.review_note,
    'cancelled_at',v_change.cancelled_at,
    'application_status',v_state->>'application_status',
    'reconciliation_state',v_state->>'reconciliation_state',
    'approved_sell_delta',v_state->'approved_sell_delta',
    'sell_currency_code',v_state->>'sell_currency_code',
    'linked_sell_delta',v_state->'linked_sell_delta',
    'application_count',v_state->'application_count',
    'lines',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,
        'line_no',l.line_no,
        'effect_type',l.effect_type,
        'target_order_id',l.target_order_id,
        'target_order_item_id',l.target_order_item_id,
        'product_id',l.product_id,
        'description',l.description,
        'quantity_delta',l.quantity_delta,
        'sell_amount_delta',l.sell_amount_delta,
        'sell_currency_code',l.sell_currency_code,
        'expected_cost_delta',case when v_can_view_cost then l.expected_cost_delta else null end,
        'cost_currency_code',case when v_can_view_cost then l.cost_currency_code else null end,
        'vendor_code',case when v_can_view_cost then l.vendor_code else null end
      ) order by l.line_no)
      from public.customer_project_change_order_lines l where l.change_order_id=v_change.id
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'event_type',e.event_type,'status_after',e.status_after,'note',e.note,'metadata',e.metadata,'created_by',e.created_by,'created_at',e.created_at
      ) order by e.created_at,e.id)
      from public.customer_project_change_order_events e where e.change_order_id=v_change.id
    ),'[]'::jsonb),
    'applications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'order_id',a.order_id,'order_revision_id',a.order_revision_id,'canonical_sell_delta',a.canonical_sell_delta,'currency_code',a.currency_code,'linked_at',a.linked_at
      ) order by a.linked_at,a.id)
      from public.customer_project_change_order_applications a where a.change_order_id=v_change.id
    ),'[]'::jsonb),
    'candidate_revisions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'order_id',r.order_id,'order_number',o.order_number,'revision_number',r.revision_number,'reason',r.reason,'created_at',r.created_at
      ) order by r.created_at desc,r.revision_number desc)
      from public.customer_order_revisions r
      join public.customer_orders o on o.id=r.order_id and o.project_id=v_change.project_id
      where v_change.status='approved'
        and v_change.reviewed_at is not null
        and r.created_at >= v_change.reviewed_at
        and not exists (select 1 from public.customer_project_change_order_applications a where a.order_revision_id=r.id)
        and (
          not exists (select 1 from public.customer_project_change_order_lines l where l.change_order_id=v_change.id and l.target_order_id is not null)
          or exists (select 1 from public.customer_project_change_order_lines l where l.change_order_id=v_change.id and l.target_order_id=r.order_id)
        )
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_customer_project_change_order_summary(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_can_view_cost boolean;
  v_canonical_currency_count integer;
  v_canonical_currency text;
  v_canonical_sales numeric(18,2);
  v_pending_sell_currency_count integer;
  v_pending_sell_currency text;
  v_pending_sell numeric(18,2);
  v_pending_cost_currency_count integer;
  v_pending_cost_currency text;
  v_pending_cost numeric(18,2);
  v_pending_cost_complete boolean;
  v_counts jsonb;
  v_privileged_financial jsonb;
begin
  if not private.can_view_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_VIEW_FORBIDDEN' using errcode='42501';
  end if;
  if not exists (select 1 from public.customer_projects where id=p_project_id) then raise exception 'PROJECT_NOT_FOUND'; end if;
  v_can_view_cost := private.can_view_customer_project_change_order_cost();

  select count(distinct upper(o.currency_code::text)), min(upper(o.currency_code::text)), round(coalesce(sum(greatest(coalesce(o.subtotal,0)-coalesce(o.discount_amount,0),0)),0),2)
  into v_canonical_currency_count, v_canonical_currency, v_canonical_sales
  from public.customer_orders o
  where o.project_id=p_project_id and o.status <> 'cancelled';

  with approved_pending as (
    select co.id
    from public.customer_project_change_orders co
    cross join lateral (select private.customer_project_change_order_application_state(co.id) as state) s
    where co.project_id=p_project_id and co.status='approved' and s.state->>'application_status' <> 'applied'
  )
  select count(distinct l.sell_currency_code), min(l.sell_currency_code)::text, round(coalesce(sum(l.sell_amount_delta),0),2)
  into v_pending_sell_currency_count, v_pending_sell_currency, v_pending_sell
  from public.customer_project_change_order_lines l
  join approved_pending p on p.id=l.change_order_id;

  with approved_pending as (
    select co.id
    from public.customer_project_change_orders co
    cross join lateral (select private.customer_project_change_order_application_state(co.id) as state) s
    where co.project_id=p_project_id and co.status='approved' and s.state->>'application_status' <> 'applied'
  )
  select
    count(distinct l.cost_currency_code),
    min(l.cost_currency_code)::text,
    round(coalesce(sum(l.expected_cost_delta),0),2),
    count(*) = count(l.expected_cost_delta)
  into v_pending_cost_currency_count, v_pending_cost_currency, v_pending_cost, v_pending_cost_complete
  from public.customer_project_change_order_lines l
  join approved_pending p on p.id=l.change_order_id;

  select jsonb_build_object(
    'draft',count(*) filter (where co.status='draft'),
    'submitted',count(*) filter (where co.status='submitted'),
    'approved',count(*) filter (where co.status='approved'),
    'rejected',count(*) filter (where co.status='rejected'),
    'cancelled',count(*) filter (where co.status='cancelled'),
    'applied',count(*) filter (where co.status='approved' and state.data->>'application_status'='applied'),
    'approved_pending',count(*) filter (where co.status='approved' and state.data->>'application_status'<>'applied')
  ) into v_counts
  from public.customer_project_change_orders co
  cross join lateral (select private.customer_project_change_order_application_state(co.id) as data) state
  where co.project_id=p_project_id;

  if v_can_view_cost then
    v_privileged_financial := public.get_customer_project_financial_summary(p_project_id);
  else
    v_privileged_financial := null;
  end if;

  return jsonb_build_object(
    'project_id',p_project_id,
    'counts',coalesce(v_counts,'{}'::jsonb),
    'canonical_mixed_currency',v_canonical_currency_count > 1,
    'canonical_currency_code',case when v_canonical_currency_count <= 1 then v_canonical_currency else null end,
    'canonical_sales',case when v_canonical_currency_count <= 1 then v_canonical_sales else null end,
    'canonical_financial_summary',case when v_can_view_cost then v_privileged_financial else null end,
    'pending_sell_mixed_currency',v_pending_sell_currency_count > 1,
    'approved_pending_sell_impact',case when v_pending_sell_currency_count <= 1 then v_pending_sell else null end,
    'pending_sell_currency_code',case when v_pending_sell_currency_count = 1 then v_pending_sell_currency else null end,
    'pending_expected_cost_complete',case when v_can_view_cost then coalesce(v_pending_cost_complete,true) else null end,
    'pending_cost_mixed_currency',case when v_can_view_cost then v_pending_cost_currency_count > 1 else null end,
    'pending_expected_cost_impact',case when v_can_view_cost and coalesce(v_pending_cost_complete,true) and v_pending_cost_currency_count <= 1 then v_pending_cost else null end,
    'pending_cost_currency_code',case when v_can_view_cost and v_pending_cost_currency_count = 1 then v_pending_cost_currency else null end,
    'mixed_currency', (v_canonical_currency_count > 1 or v_pending_sell_currency_count > 1 or (v_can_view_cost and v_pending_cost_currency_count > 1))
  );
end;
$$;

alter table public.customer_project_change_orders enable row level security;
alter table public.customer_project_change_order_lines enable row level security;
alter table public.customer_project_change_order_events enable row level security;
alter table public.customer_project_change_order_applications enable row level security;

revoke all on public.customer_project_change_orders from public, anon, authenticated;
revoke all on public.customer_project_change_order_lines from public, anon, authenticated;
revoke all on public.customer_project_change_order_events from public, anon, authenticated;
revoke all on public.customer_project_change_order_applications from public, anon, authenticated;

revoke all on function private.can_view_customer_project_change_orders() from public;
revoke all on function private.can_manage_customer_project_change_orders() from public;
revoke all on function private.can_review_customer_project_change_orders() from public;
revoke all on function private.can_view_customer_project_change_order_cost() from public;
revoke all on function private.append_customer_project_change_order_event(uuid,text,text,text,jsonb) from public;
revoke all on function private.customer_project_change_order_application_state(uuid) from public;
revoke all on function private.guard_customer_project_change_order_update() from public;
revoke all on function private.guard_customer_project_change_order_line() from public;
revoke all on function private.reject_customer_project_change_order_event_rewrite() from public;
revoke all on function private.reject_customer_project_change_order_application_rewrite() from public;

revoke all on function public.get_customer_project_change_orders(uuid) from public;
revoke all on function public.get_customer_project_change_order(uuid) from public;
revoke all on function public.get_customer_project_change_order_summary(uuid) from public;
revoke all on function public.create_customer_project_change_order(uuid,text,text,uuid) from public;
revoke all on function public.update_customer_project_change_order_draft(uuid,text,text,uuid) from public;
revoke all on function public.set_customer_project_change_order_lines(uuid,jsonb) from public;
revoke all on function public.submit_customer_project_change_order(uuid) from public;
revoke all on function public.review_customer_project_change_order(uuid,text,text) from public;
revoke all on function public.cancel_customer_project_change_order(uuid,text) from public;
revoke all on function public.link_customer_project_change_order_revision(uuid,uuid) from public;

grant execute on function public.get_customer_project_change_orders(uuid) to authenticated;
grant execute on function public.get_customer_project_change_order(uuid) to authenticated;
grant execute on function public.get_customer_project_change_order_summary(uuid) to authenticated;
grant execute on function public.create_customer_project_change_order(uuid,text,text,uuid) to authenticated;
grant execute on function public.update_customer_project_change_order_draft(uuid,text,text,uuid) to authenticated;
grant execute on function public.set_customer_project_change_order_lines(uuid,jsonb) to authenticated;
grant execute on function public.submit_customer_project_change_order(uuid) to authenticated;
grant execute on function public.review_customer_project_change_order(uuid,text,text) to authenticated;
grant execute on function public.cancel_customer_project_change_order(uuid,text) to authenticated;
grant execute on function public.link_customer_project_change_order_revision(uuid,uuid) to authenticated;
